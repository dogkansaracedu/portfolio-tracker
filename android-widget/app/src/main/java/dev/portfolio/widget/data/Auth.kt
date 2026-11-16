package dev.portfolio.widget.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import dev.portfolio.widget.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Supabase session. The password is never stored; only these tokens, encrypted at rest. */
@Serializable
data class Session(
    val accessToken: String,
    val refreshToken: String,
    /** Epoch seconds. */
    val expiresAt: Long,
    val email: String? = null,
)

/**
 * Session persisted in SharedPreferences, AES-256-GCM encrypted with a non-exportable key in
 * the Android Keystore. Survives app restarts, unreadable outside this app's keystore entry.
 */
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    fun load(): Session? = try {
        val blob = prefs.getString(KEY_BLOB, null) ?: return null
        val raw = Base64.decode(blob, Base64.NO_WRAP)
        val iv = raw.copyOfRange(0, IV_LEN)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        val json = String(cipher.doFinal(raw, IV_LEN, raw.size - IV_LEN))
        Api.json.decodeFromString(Session.serializer(), json)
    } catch (e: Exception) {
        null // key lost or blob corrupt: treat as signed out
    }

    fun save(session: Session) {
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(
            Api.json.encodeToString(Session.serializer(), session).toByteArray(),
        )
        prefs.edit().putString(KEY_BLOB, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()
    }

    fun clear() {
        prefs.edit().remove(KEY_BLOB).commit()
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private companion object {
        const val ALIAS = "portfoy-session"
        const val KEY_BLOB = "blob"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV_LEN = 12
    }
}

sealed interface AuthResult {
    data class Ok(val session: Session) : AuthResult
    /** Wrong credentials or a revoked/expired refresh token (HTTP 400/401). */
    data class Rejected(val message: String?) : AuthResult
    data class Failed(val error: FetchError) : AuthResult
}

sealed interface TokenResult {
    data class Ok(val accessToken: String) : TokenResult
    data object SignedOut : TokenResult
    data class Failed(val error: FetchError) : TokenResult
}

/** GoTrue (Supabase Auth) over plain HTTP: password sign-in and refresh-token rotation. */
class Auth(context: Context) {
    private val store = SessionStore(context)
    private val lock = Mutex()

    fun currentSession(): Session? = store.load()

    fun signOut() = store.clear()

    suspend fun signIn(email: String, password: String): AuthResult {
        val body = buildJsonObject { put("email", email); put("password", password) }
        return token("password", body).also { if (it is AuthResult.Ok) store.save(it.session) }
    }

    /**
     * A usable access token, refreshing it first if it expires within a minute (or [force]).
     * A rejected refresh clears the stored session.
     */
    suspend fun accessToken(force: Boolean = false): TokenResult = lock.withLock {
        val session = store.load() ?: return TokenResult.SignedOut
        val now = System.currentTimeMillis() / 1000
        if (!force && session.expiresAt - now > 60) return TokenResult.Ok(session.accessToken)
        val body = buildJsonObject { put("refresh_token", session.refreshToken) }
        when (val r = token("refresh_token", body)) {
            is AuthResult.Ok -> {
                store.save(r.session.copy(email = r.session.email ?: session.email))
                TokenResult.Ok(r.session.accessToken)
            }
            is AuthResult.Rejected -> {
                store.clear()
                TokenResult.SignedOut
            }
            is AuthResult.Failed -> TokenResult.Failed(r.error)
        }
    }

    private suspend fun token(grant: String, body: JsonObject): AuthResult = withContext(Dispatchers.IO) {
        if (!Api.isConfigured) return@withContext AuthResult.Failed(FetchError.NOT_CONFIGURED)
        val url = URL("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=$grant")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.doOutput = true
            conn.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            when {
                code in 200..299 -> parseSession(text)?.let { AuthResult.Ok(it) }
                    ?: AuthResult.Failed(FetchError.BAD_RESPONSE)
                code == 400 || code == 401 -> AuthResult.Rejected(errorMessage(text))
                code >= 500 -> AuthResult.Failed(FetchError.SERVER)
                else -> AuthResult.Failed(FetchError.BAD_RESPONSE)
            }
        } catch (e: IOException) {
            AuthResult.Failed(FetchError.NETWORK)
        } finally {
            conn.disconnect()
        }
    }

    private fun parseSession(text: String): Session? = try {
        val o = Api.json.parseToJsonElement(text).jsonObject
        val access = o["access_token"]!!.jsonPrimitive.content
        val refresh = o["refresh_token"]!!.jsonPrimitive.content
        val expiresAt = o["expires_at"]?.jsonPrimitive?.longOrNull
            ?: (System.currentTimeMillis() / 1000 + (o["expires_in"]?.jsonPrimitive?.long ?: 3600))
        val email = (o["user"] as? JsonObject)?.get("email")?.jsonPrimitive?.content
        Session(access, refresh, expiresAt, email)
    } catch (e: Exception) {
        null
    }

    private fun errorMessage(text: String): String? = try {
        val o = Api.json.parseToJsonElement(text).jsonObject
        (o["error_description"] ?: o["msg"] ?: o["message"] ?: o["error"])?.jsonPrimitive?.content
    } catch (e: Exception) {
        null
    }
}
