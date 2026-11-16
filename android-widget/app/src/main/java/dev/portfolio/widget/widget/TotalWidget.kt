package dev.portfolio.widget.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import dev.portfolio.widget.data.CacheState
import dev.portfolio.widget.data.WidgetStore
import dev.portfolio.widget.format.Fmt

/** "Toplam": net worth in TRY with today's change. Default 2x2, resizable. */
class TotalWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore.get(context)
        provideContent {
            val state by store.state.collectAsState()
            GlanceTheme { TotalContent(state) }
        }
    }
}

@Composable
private fun TotalContent(state: CacheState) {
    if (state.blocker() != null) {
        MessageState(state)
        return
    }
    val total = state.payload?.total
    val size = LocalSize.current
    val compact = size.height < 125.dp

    val totalText = total?.valueTry?.let { Fmt.tryWhole(it) } ?: "—"
    // Scale the headline so the full amount fits on one line at any widget width.
    val usable = (size.width.value - 32f).coerceAtLeast(60f)
    val headline = (usable / (totalText.length * 0.58f)).coerceIn(18f, 36f)

    val amountSign = Fmt.sign(total?.changeTry, 0)
    val pctSign = Fmt.sign(total?.changePct, 1)
    val amountText = total?.changeTry?.let { Fmt.signedTry(it) }
    val pctText = total?.changePct?.let { Fmt.signedPct(it) }

    WidgetSurface(GlanceModifier.clickable(openPwaAction()).padding(horizontal = 16.dp, vertical = 14.dp)) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (state.failed) "güncellenemedi" else "Portföy",
                    maxLines = 1,
                    style = TextStyle(
                        color = if (state.failed) Palette.down else GlanceTheme.colors.primary,
                        fontSize = 12.sp, fontWeight = FontWeight.Medium,
                    ),
                    modifier = GlanceModifier.defaultWeight(),
                )
                Text(
                    state.dataTime()?.let { Fmt.timeLabel(it) } ?: "",
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp),
                )
            }
            Spacer(GlanceModifier.defaultWeight())
            Text(
                totalText,
                maxLines = 1,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = headline.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
            Spacer(GlanceModifier.height(2.dp))
            if (amountText == null && pctText == null) {
                Text(
                    "bugün —",
                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 13.sp),
                )
            } else if (compact) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    amountText?.let {
                        Text(it, maxLines = 1, style = changeStyle(amountSign, 13))
                        Spacer(GlanceModifier.width(6.dp))
                    }
                    pctText?.let { Text(it, maxLines = 1, style = changeStyle(pctSign, 12, medium = false)) }
                }
            } else {
                amountText?.let { Text(it, maxLines = 1, style = changeStyle(amountSign, 15)) }
                pctText?.let {
                    Text("$it bugün", maxLines = 1, style = changeStyle(pctSign, 12, medium = false))
                }
            }
        }
    }
}

@Composable
private fun changeStyle(sign: Fmt.Sign, sizeSp: Int, medium: Boolean = true) = TextStyle(
    color = signColor(sign),
    fontSize = sizeSp.sp,
    fontWeight = if (medium) FontWeight.Medium else FontWeight.Normal,
)
