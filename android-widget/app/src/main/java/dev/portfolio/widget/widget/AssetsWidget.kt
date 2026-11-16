package dev.portfolio.widget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.clickable
import androidx.glance.appwidget.CircularProgressIndicator
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import dev.portfolio.widget.R
import dev.portfolio.widget.data.Asset
import dev.portfolio.widget.data.CacheState
import dev.portfolio.widget.data.WidgetStore
import dev.portfolio.widget.format.Fmt

/** "Varlıklar": scrollable asset list with price and today's change. Default 4x2, resizable. */
class AssetsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore.get(context)
        provideContent {
            val state by store.state.collectAsState()
            GlanceTheme { AssetsContent(state) }
        }
    }
}

@Composable
private fun AssetsContent(state: CacheState) {
    if (state.blocker() != null) {
        MessageState(state)
        return
    }
    val assets = state.payload?.assets.orEmpty()
    WidgetSurface(GlanceModifier.padding(start = 14.dp, end = 6.dp, top = 8.dp, bottom = 2.dp)) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            if (assets.isEmpty()) {
                Box(
                    modifier = GlanceModifier.defaultWeight().fillMaxWidth().clickable(openPwaAction()),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Varlık yok", style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp))
                }
            } else {
                LazyColumn(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
                    items(assets, itemId = { it.ticker.hashCode().toLong() }) { asset -> AssetRow(asset) }
                }
            }
            Footer(state)
        }
    }
}

@Composable
private fun AssetRow(asset: Asset) {
    val dim = GlanceTheme.colors.onSurfaceVariant
    val sign = if (asset.stale) Fmt.Sign.FLAT else Fmt.sign(asset.changePct, 1)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(end = 8.dp, top = 5.dp, bottom = 5.dp)
            .clickable(openPwaAction()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(modifier = GlanceModifier.defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                asset.ticker,
                maxLines = 1,
                style = TextStyle(
                    color = if (asset.stale) dim else GlanceTheme.colors.onSurface,
                    fontSize = 14.sp, fontWeight = FontWeight.Medium,
                ),
            )
            asset.name?.takeIf { it.isNotBlank() && !it.equals(asset.ticker, ignoreCase = true) }?.let {
                Spacer(GlanceModifier.width(6.dp))
                Text(it, maxLines = 1, style = TextStyle(color = dim, fontSize = 12.sp))
            }
        }
        Spacer(GlanceModifier.width(8.dp))
        Text(
            asset.price?.let { Fmt.price(it, asset.priceCurrency) } ?: "—",
            maxLines = 1,
            style = TextStyle(
                color = if (asset.stale) dim else GlanceTheme.colors.onSurface,
                fontSize = 14.sp, textAlign = TextAlign.End,
            ),
        )
        Spacer(GlanceModifier.width(8.dp))
        ChangePill(asset.changePct, sign)
    }
}

@Composable
private fun ChangePill(changePct: Double?, sign: Fmt.Sign) {
    val bg = when (sign) {
        Fmt.Sign.UP -> Palette.upSoft
        Fmt.Sign.DOWN -> Palette.downSoft
        Fmt.Sign.FLAT -> GlanceTheme.colors.surfaceVariant
    }
    Box(
        modifier = GlanceModifier.width(62.dp).background(bg).cornerRadius(8.dp)
            .padding(vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            changePct?.let { Fmt.signedPct(it) } ?: "—",
            maxLines = 1,
            style = TextStyle(
                color = signColor(sign), fontSize = 12.sp, fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            ),
        )
    }
}

@Composable
private fun Footer(state: CacheState) {
    val dim = GlanceTheme.colors.onSurfaceVariant
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(34.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Varlıklar",
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 12.sp, fontWeight = FontWeight.Medium),
        )
        Spacer(GlanceModifier.width(8.dp))
        Text(
            buildString {
                state.dataTime()?.let { append(Fmt.timeLabel(it)) }
                if (state.failed) append(if (isEmpty()) "güncellenemedi" else " · güncellenemedi")
            },
            maxLines = 1,
            style = TextStyle(color = if (state.failed) Palette.down else dim, fontSize = 12.sp),
            modifier = GlanceModifier.defaultWeight(),
        )
        Box(
            modifier = GlanceModifier.size(34.dp).cornerRadius(17.dp).clickable(refreshAction()),
            contentAlignment = Alignment.Center,
        ) {
            if (state.refreshing) {
                CircularProgressIndicator(modifier = GlanceModifier.size(16.dp), color = GlanceTheme.colors.primary)
            } else {
                Image(
                    provider = ImageProvider(R.drawable.ic_refresh),
                    contentDescription = "Yenile",
                    colorFilter = ColorFilter.tint(dim),
                    modifier = GlanceModifier.size(18.dp),
                )
            }
        }
    }
}
