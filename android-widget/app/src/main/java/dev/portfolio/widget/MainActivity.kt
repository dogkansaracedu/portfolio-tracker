package dev.portfolio.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import dev.portfolio.widget.data.Api
import dev.portfolio.widget.data.AuthResult
import dev.portfolio.widget.data.CacheState
import dev.portfolio.widget.data.FetchError
import dev.portfolio.widget.data.WidgetStore
import dev.portfolio.widget.format.Fmt
import dev.portfolio.widget.widget.AssetsWidgetReceiver
import dev.portfolio.widget.widget.TotalWidgetReceiver
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Instant

/** Login, then last fetch status + "Şimdi yenile" + "Çıkış yap". Nothing else. */
class MainActivity : Activity() {
    private val scope = MainScope()
    private lateinit var store: WidgetStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = WidgetStore.get(this)

        val root = findViewById<View>(R.id.root)
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        val email = findViewById<EditText>(R.id.email)
        val password = findViewById<EditText>(R.id.password)
        val signIn = findViewById<Button>(R.id.sign_in)
        val loginError = findViewById<TextView>(R.id.login_error)

        fun submit() {
            val e = email.text.toString().trim()
            val p = password.text.toString()
            if (e.isEmpty() || p.isEmpty()) return
            signIn.isEnabled = false
            loginError.visibility = View.GONE
            scope.launch {
                val r = store.signIn(e, p)
                signIn.isEnabled = true
                password.text.clear()
                val message = when (r) {
                    is AuthResult.Ok -> null
                    is AuthResult.Rejected -> "E-posta veya şifre hatalı"
                    is AuthResult.Failed -> errorText(r.error)
                }
                loginError.text = message
                loginError.visibility = if (message == null) View.GONE else View.VISIBLE
            }
        }
        signIn.setOnClickListener { submit() }
        password.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_DONE) { submit(); true } else false
        }
        findViewById<Button>(R.id.refresh).setOnClickListener { scope.launch { store.refresh() } }
        findViewById<Button>(R.id.sign_out).setOnClickListener { scope.launch { store.signOut() } }

        scope.launch { store.state.collect { render(it) } }
        handleDebugIntent()
    }

    private fun render(s: CacheState) {
        val signedIn = s.signedIn || s.demo
        findViewById<View>(R.id.login_group).visibility = if (signedIn) View.GONE else View.VISIBLE
        findViewById<View>(R.id.session_group).visibility = if (signedIn) View.VISIBLE else View.GONE
        if (!Api.isConfigured) {
            findViewById<TextView>(R.id.subtitle).text = getString(R.string.not_configured)
            findViewById<View>(R.id.sign_in).isEnabled = false
        }
        findViewById<TextView>(R.id.account).text =
            if (s.demo) "Demo verisi (debug)" else s.email?.let { "Giriş: $it" } ?: ""
        findViewById<TextView>(R.id.status).text = when {
            s.refreshing -> "Yenileniyor…"
            s.error != null && s.error != FetchError.SIGNED_OUT -> buildString {
                append("Son deneme başarısız: ").append(errorText(s.error))
                s.fetchedAt?.let { append("\nSon başarılı: ").append(Fmt.timeLabel(Instant.ofEpochMilli(it))) }
            }
            s.fetchedAt != null -> "Son güncelleme: " + Fmt.timeLabel(Instant.ofEpochMilli(s.fetchedAt))
            else -> "Henüz veri alınmadı"
        }
        findViewById<View>(R.id.refresh).isEnabled = !s.refreshing
    }

    private fun errorText(e: FetchError): String = when (e) {
        FetchError.NOT_CONFIGURED -> "yapılandırma eksik"
        FetchError.SIGNED_OUT -> "giriş gerekli"
        FetchError.UNAUTHORIZED -> "yetki reddedildi"
        FetchError.NETWORK -> "bağlantı yok"
        FetchError.SERVER -> "sunucu hatası"
        FetchError.BAD_RESPONSE -> "beklenmeyen yanıt"
    }

    /**
     * Debug builds only, for emulator checks without real credentials:
     * `--ez fixture true` loads a fake portfolio, `--es pin total|assets` asks the launcher to
     * add a widget.
     */
    private fun handleDebugIntent() {
        if (!BuildConfig.DEBUG) return
        if (intent.getBooleanExtra("fixture", false)) scope.launch { store.loadFixture() }
        val receiver = when (intent.getStringExtra("pin")) {
            "total" -> TotalWidgetReceiver::class.java
            "assets" -> AssetsWidgetReceiver::class.java
            else -> null
        } ?: return
        AppWidgetManager.getInstance(this).requestPinAppWidget(ComponentName(this, receiver), null, null)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDebugIntent()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
