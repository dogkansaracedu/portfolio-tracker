package dev.portfolio.widget.widget

import android.content.Context
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.glance.GlanceId
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import dev.portfolio.widget.data.WidgetStore

/** "Varlıklar": scrollable asset list with price and today's change. Default 4x2, resizable. */
class AssetsWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore.get(context)
        provideContent {
            val state by store.state.collectAsState()
            GlanceTheme {
                QuoteListContent(
                    state = state,
                    quotes = state.payload?.assets.orEmpty().map { it.toQuote() },
                    label = "Varlıklar",
                    emptyText = "Varlık yok",
                    tap = openPwaAction(),
                )
            }
        }
    }
}
