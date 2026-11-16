package dev.portfolio.widget.data

import android.content.Context
import android.util.AtomicFile
import androidx.glance.appwidget.updateAll
import dev.portfolio.widget.BuildConfig
import dev.portfolio.widget.widget.AssetsWidget
import dev.portfolio.widget.widget.TakipWidget
import dev.portfolio.widget.widget.TotalWidget
import dev.portfolio.widget.work.RefreshScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant

/**
 * One cached payload shared by all widgets and the launcher screen. Kept in memory as a
 * StateFlow (widgets collect it, so an open Glance session re-renders on change) and on disk
 * so widgets render instantly after a process restart and show the last data offline.
 */
class WidgetStore private constructor(private val appContext: Context) {

    val auth = Auth(appContext)
    private val file = AtomicFile(File(appContext.filesDir, "widget_cache.json"))
    private val _state = MutableStateFlow(load().withSession())
    val state: StateFlow<CacheState> = _state.asStateFlow()
    private val refreshLock = Mutex()

    private fun CacheState.withSession(): CacheState {
        val s = auth.currentSession()
        return copy(signedIn = s != null, email = s?.email)
    }

    /** Fetch, persist, and re-render all widgets. Concurrent calls collapse into one. */
    suspend fun refresh() {
        if (!refreshLock.tryLock()) return
        try {
            if (_state.value.demo) {
                setAndSave(fixtureState(emptyWatchlist = _state.value.payload?.watchlist.isNullOrEmpty()))
                return
            }
            _state.update { it.copy(refreshing = true) }
            renderWidgets()
            val now = System.currentTimeMillis()
            val next = when (val r = Api.fetch(auth)) {
                is FetchResult.Ok -> _state.value.copy(
                    payload = r.payload, fetchedAt = now, attemptedAt = now, error = null,
                )
                // Keep the last good payload; only record the failure.
                is FetchResult.Failed -> _state.value.copy(attemptedAt = now, error = r.error)
            }
            setAndSave(next.copy(refreshing = false).withSession())
        } finally {
            _state.update { it.copy(refreshing = false) }
            refreshLock.unlock()
            renderWidgets()
        }
    }

    suspend fun signIn(email: String, password: String): AuthResult {
        val r = auth.signIn(email, password)
        if (r is AuthResult.Ok) {
            setAndSave(CacheState().withSession())
            RefreshScheduler.schedulePeriodic(appContext)
            refresh()
        }
        return r
    }

    /** Forget the session and the cached amounts. */
    suspend fun signOut() {
        auth.signOut()
        RefreshScheduler.cancelAll(appContext)
        setAndSave(CacheState().withSession())
        renderWidgets()
    }

    /**
     * Debug builds only: render a fake portfolio so the widgets can be checked without login.
     * [emptyWatchlist] shows Takip's empty state.
     */
    suspend fun loadFixture(emptyWatchlist: Boolean = false) {
        if (!BuildConfig.DEBUG) return
        setAndSave(fixtureState(emptyWatchlist))
        renderWidgets()
    }

    private fun fixtureState(emptyWatchlist: Boolean = false): CacheState {
        val now = System.currentTimeMillis()
        val asOf = Instant.ofEpochMilli(now).toString()
        fun a(t: String, n: String, p: Double, c: String, ch: Double?, v: Double, stale: Boolean = false) =
            Asset(t, n, p, c, ch, v, asOf, stale)
        val payload = Payload(
            asOf = asOf,
            total = Total(valueTry = 4_812_300.12, valueUsd = 114_100.5, changeTry = 38_450.2, changePct = 0.81),
            assets = listOf(
                a("BTC", "Bitcoin", 91_240.1, "USD", 1.9, 1_200_000.0),
                a("VOO", "Vanguard S&P 500", 588.42, "USD", -0.62, 950_000.0),
                a("THYAO", "Türk Hava Yolları", 312.5, "TRY", 2.35, 640_000.0),
                a("ALTIN", "Gram altın", 4_215.8, "TRY", 0.12, 520_000.0),
                a("ETH", "Ethereum", 3_105.77, "USD", -1.4, 410_000.0),
                a("TTE", "İş Portföy Teknoloji", 0.48213, "TRY", null, 300_000.0, stale = true),
                a("EUR", "Euro nakit", 1.0842, "USD", 0.05, 210_000.0),
            ),
            watchlist = if (emptyWatchlist) emptyList() else listOf(
                WatchItem("USDTRY", "USD/TRY", 50.382, "TRY", 2.04, asOf),
                WatchItem("AAPL", "Apple Inc.", 231.45, "USD", -0.85, asOf),
                WatchItem("ASELS", "Aselsan", 182.4, "TRY", null, asOf),
                WatchItem("TP2", "Tera Portföy Para Piyasası", 1.94817, "TRY", 0.11, asOf, stale = true),
            ),
        )
        return CacheState(payload = payload, fetchedAt = now, attemptedAt = now, demo = true).withSession()
    }

    private suspend fun setAndSave(next: CacheState) {
        _state.value = next
        withContext(Dispatchers.IO) {
            val out = file.startWrite()
            try {
                out.write(Api.json.encodeToString(CacheState.serializer(), next).toByteArray())
                file.finishWrite(out)
            } catch (e: Exception) {
                file.failWrite(out)
            }
        }
    }

    private suspend fun renderWidgets() {
        TotalWidget().updateAll(appContext)
        AssetsWidget().updateAll(appContext)
        TakipWidget().updateAll(appContext)
    }

    private fun load(): CacheState = try {
        if (!file.baseFile.exists()) CacheState()
        else Api.json.decodeFromString(CacheState.serializer(), String(file.readFully()))
    } catch (e: Exception) {
        CacheState()
    }

    companion object {
        @Volatile private var instance: WidgetStore? = null

        fun get(context: Context): WidgetStore =
            instance ?: synchronized(this) {
                instance ?: WidgetStore(context.applicationContext).also { instance = it }
            }
    }
}
