package dev.portfolio.widget.widget

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.CircularProgressIndicator
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
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
import dev.portfolio.widget.data.WatchItem
import dev.portfolio.widget.format.Fmt

/** One row of a quote list: what Varlıklar (assets) and Takip (watchlist) both show. */
data class Quote(
    val ticker: String,
    val name: String?,
    val price: Double?,
    val priceCurrency: String?,
    val changePct: Double?,
    val stale: Boolean,
)

fun Asset.toQuote() = Quote(ticker, name, price, priceCurrency, changePct, stale)
fun WatchItem.toQuote() = Quote(ticker, name, price, priceCurrency, changePct, stale)

/**
 * Scrollable quote list + footer (label, data time, refresh). Shared by the list widgets so
 * they look and behave the same; [tap] is where rows and the empty body lead.
 */
@Composable
fun QuoteListContent(
    state: CacheState,
    quotes: List<Quote>,
    label: String,
    emptyText: String,
    tap: Action,
    pwaPath: String = "",
) {
    if (state.blocker() != null) {
        MessageState(state, pwaPath)
        return
    }
    WidgetSurface(GlanceModifier.padding(start = 14.dp, end = 6.dp, top = 8.dp, bottom = 2.dp)) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            if (quotes.isEmpty()) {
                Box(
                    modifier = GlanceModifier.defaultWeight().fillMaxWidth().padding(end = 8.dp).clickable(tap),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        emptyText,
                        maxLines = 2,
                        style = TextStyle(
                            color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                        ),
                    )
                }
            } else {
                LazyColumn(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
                    items(quotes, itemId = { it.ticker.hashCode().toLong() }) { q -> QuoteRow(q, tap) }
                }
            }
            Footer(state, label)
        }
    }
}

@Composable
private fun QuoteRow(q: Quote, tap: Action) {
    val dim = GlanceTheme.colors.onSurfaceVariant
    val sign = if (q.stale) Fmt.Sign.FLAT else Fmt.sign(q.changePct, 1)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(end = 8.dp, top = 5.dp, bottom = 5.dp)
            .clickable(tap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(modifier = GlanceModifier.defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                q.ticker,
                maxLines = 1,
                style = TextStyle(
                    color = if (q.stale) dim else GlanceTheme.colors.onSurface,
                    fontSize = 14.sp, fontWeight = FontWeight.Medium,
                ),
            )
            q.name?.takeIf { it.isNotBlank() && !it.equals(q.ticker, ignoreCase = true) }?.let {
                Spacer(GlanceModifier.width(6.dp))
                Text(it, maxLines = 1, style = TextStyle(color = dim, fontSize = 12.sp))
            }
        }
        Spacer(GlanceModifier.width(8.dp))
        Text(
            q.price?.let { Fmt.price(it, q.priceCurrency) } ?: "—",
            maxLines = 1,
            style = TextStyle(
                color = if (q.stale) dim else GlanceTheme.colors.onSurface,
                fontSize = 14.sp, textAlign = TextAlign.End,
            ),
        )
        Spacer(GlanceModifier.width(8.dp))
        ChangePill(q.changePct, sign)
    }
}

/** Null [changePct] → neutral grey "—" pill (FLAT sign). */
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
private fun Footer(state: CacheState, label: String) {
    val dim = GlanceTheme.colors.onSurfaceVariant
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(34.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
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
