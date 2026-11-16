package dev.portfolio.widget.data

import dev.portfolio.widget.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

sealed interface FetchResult {
    data class Ok(val payload: Payload) : FetchResult
    data class Failed(val error: FetchError) : FetchResult
}

/** GET {SUPABASE_URL}/functions/v1/widget-data with the signed-in user's access token. */
object Api {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    val isConfigured: Boolean
        get() = BuildConfig.SUPABASE_URL.startsWith("http") && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()

    private val endpoint get() = "${BuildConfig.SUPABASE_URL}/functions/v1/widget-data"

    suspend fun fetch(auth: Auth): FetchResult {
        if (!isConfigured) return FetchResult.Failed(FetchError.NOT_CONFIGURED)
        var token = when (val t = auth.accessToken()) {
            is TokenResult.Ok -> t.accessToken
            TokenResult.SignedOut -> return FetchResult.Failed(FetchError.SIGNED_OUT)
            is TokenResult.Failed -> return FetchResult.Failed(t.error)
        }
        var result = get(token)
        if (result == HttpOutcome.Unauthorized) {
            // Token may have been revoked server-side before its expiry: rotate once and retry.
            token = when (val t = auth.accessToken(force = true)) {
                is TokenResult.Ok -> t.accessToken
                TokenResult.SignedOut -> return FetchResult.Failed(FetchError.SIGNED_OUT)
                is TokenResult.Failed -> return FetchResult.Failed(t.error)
            }
            result = get(token)
        }
        return when (result) {
            is HttpOutcome.Body -> try {
                FetchResult.Ok(json.decodeFromString(Payload.serializer(), result.text))
            } catch (e: Exception) {
                FetchResult.Failed(FetchError.BAD_RESPONSE)
            }
            HttpOutcome.Unauthorized -> FetchResult.Failed(FetchError.UNAUTHORIZED)
            is HttpOutcome.Error -> FetchResult.Failed(result.error)
        }
    }

    private sealed interface HttpOutcome {
        data class Body(val text: String) : HttpOutcome
        data object Unauthorized : HttpOutcome
        data class Error(val error: FetchError) : HttpOutcome
    }

    private suspend fun get(accessToken: String): HttpOutcome = withContext(Dispatchers.IO) {
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Authorization", "Bearer $accessToken")
            conn.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
            conn.setRequestProperty("Accept", "application/json")
            when (val code = conn.responseCode) {
                in 200..299 -> HttpOutcome.Body(conn.inputStream.bufferedReader().use { it.readText() })
                401, 403 -> HttpOutcome.Unauthorized
                else -> HttpOutcome.Error(if (code >= 500) FetchError.SERVER else FetchError.BAD_RESPONSE)
            }
        } catch (e: IOException) {
            HttpOutcome.Error(FetchError.NETWORK)
        } finally {
            conn.disconnect()
        }
    }
}
