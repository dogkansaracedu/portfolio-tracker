package dev.portfolio.widget.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import dev.portfolio.widget.BuildConfig
import dev.portfolio.widget.MainActivity
import dev.portfolio.widget.data.Api
import dev.portfolio.widget.data.CacheState
import dev.portfolio.widget.data.FetchError
import dev.portfolio.widget.data.WidgetStore
import dev.portfolio.widget.format.Fmt
import dev.portfolio.widget.work.RefreshScheduler
import java.time.Instant

object Palette {
    val up: ColorProvider = ColorProvider(day = Color(0xFF0E7A4B), night = Color(0xFF6EDBA5))
    val down: ColorProvider = ColorProvider(day = Color(0xFFC0362C), night = Color(0xFFFF8F84))
    val upSoft: ColorProvider = ColorProvider(day = Color(0x1A0E7A4B), night = Color(0x296EDBA5))
    val downSoft: ColorProvider = ColorProvider(day = Color(0x1AC0362C), night = Color(0x29FF8F84))
}

@Composable
fun signColor(sign: Fmt.Sign): ColorProvider = when (sign) {
    Fmt.Sign.UP -> Palette.up
    Fmt.Sign.DOWN -> Palette.down
    Fmt.Sign.FLAT -> GlanceTheme.colors.onSurfaceVariant
}

/** Opens the PWA, optionally at a route such as [WATCHLIST_PATH]. */
fun openPwaAction(path: String = ""): Action =
    actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.PWA_URL.trimEnd('/') + path)))

fun openAppAction(): Action = actionStartActivity<MainActivity>()

fun refreshAction(): Action = actionRunCallback<RefreshAction>()

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        RefreshScheduler.schedulePeriodic(context)
        WidgetStore.get(context).refresh()
    }
}

/** Rounded, themed widget root that matches the launcher's corner radius on Android 12+. */
@Composable
fun WidgetSurface(
    modifier: GlanceModifier = GlanceModifier,
    content: @Composable () -> Unit,
) {
    val radius = if (Build.VERSION.SDK_INT >= 31) {
        GlanceModifier.cornerRadius(android.R.dimen.system_app_widget_background_radius)
    } else {
        GlanceModifier.cornerRadius(20.dp)
    }
    Box(
        modifier = GlanceModifier.fillMaxSize()
            .appWidgetBackground()
            .background(GlanceTheme.colors.widgetBackground)
            .then(radius)
            .then(modifier),
    ) { content() }
}

/** Time of the shown data (server `asOf`, else our last successful fetch). */
fun CacheState.dataTime(): Instant? =
    Fmt.parseInstant(payload?.asOf) ?: fetchedAt?.let { Instant.ofEpochMilli(it) }

/** Error worth flagging on the widget next to the last good data. */
val CacheState.failed: Boolean
    get() = error != null && error != FetchError.NOT_CONFIGURED && error != FetchError.SIGNED_OUT

/** Which full-widget message to show instead of data, or null to show data. */
enum class Blocker { NOT_CONFIGURED, SIGNED_OUT, LOADING, NO_DATA }

fun CacheState.blocker(): Blocker? = when {
    demo -> null
    !Api.isConfigured -> Blocker.NOT_CONFIGURED
    !signedIn -> Blocker.SIGNED_OUT
    payload == null -> if (refreshing || error == null) Blocker.LOADING else Blocker.NO_DATA
    else -> null
}

/** Full-widget message for "not configured" and "no data yet". */
@Composable
fun MessageState(state: CacheState, pwaPath: String = "") {
    val (title, body, action) = when (state.blocker()) {
        Blocker.NOT_CONFIGURED -> Triple("Kurulum gerekli", "local.properties eksik", openAppAction())
        Blocker.SIGNED_OUT -> Triple("Giriş gerekli", "Giriş yapmak için dokun", openAppAction())
        Blocker.NO_DATA -> Triple("Veri alınamadı", "Yenilemek için dokun", refreshAction())
        Blocker.LOADING, null -> Triple("Yükleniyor…", null, openPwaAction(pwaPath))
    }
    WidgetSurface(GlanceModifier.clickable(action).padding(16.dp)) {
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Portföy",
                style = TextStyle(
                    color = GlanceTheme.colors.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                ),
            )
            Spacer(GlanceModifier.height(4.dp))
            Text(
                title,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                ),
            )
            if (body != null) {
                Spacer(GlanceModifier.height(2.dp))
                Text(
                    body,
                    style = TextStyle(
                        color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                    ),
                )
            }
        }
    }
}
