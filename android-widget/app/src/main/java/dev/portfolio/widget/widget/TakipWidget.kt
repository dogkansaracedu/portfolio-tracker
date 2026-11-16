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

/** PWA route of the watchlist page (`WATCHLIST_ROUTE` in the web app). */
const val WATCHLIST_PATH = "/watchlist"

/**
 * "Takip": the user's watchlist (symbols they follow, not hold), same look as Varlıklar.
 * Default 4x2, resizable. Rows and the empty line open the PWA's watchlist page.
 */
class TakipWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore.get(context)
        provideContent {
            val state by store.state.collectAsState()
            GlanceTheme {
                QuoteListContent(
                    state = state,
                    quotes = state.payload?.watchlist.orEmpty().map { it.toQuote() },
                    label = "Takip",
                    emptyText = "Takip listen boş — PWA'da Takip listesi sayfasından ekle",
                    tap = openPwaAction(WATCHLIST_PATH),
                    pwaPath = WATCHLIST_PATH,
                )
            }
        }
    }
}
