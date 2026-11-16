package dev.portfolio.widget.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import dev.portfolio.widget.data.WidgetStore
import dev.portfolio.widget.work.RefreshScheduler

/** Shared behaviour: keep the 15-min refresh scheduled while any widget exists. */
abstract class PortfolioReceiver : GlanceAppWidgetReceiver() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        super.onUpdate(context, manager, ids)
        RefreshScheduler.schedulePeriodic(context)
        // Refresh on add, but don't hammer the API when the system re-sends updates.
        val last = WidgetStore.get(context).state.value.attemptedAt ?: 0L
        if (System.currentTimeMillis() - last > 2 * 60_000) RefreshScheduler.refreshSoon(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        val manager = AppWidgetManager.getInstance(context)
        val remaining = listOf(TotalWidgetReceiver::class.java, AssetsWidgetReceiver::class.java)
            .sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size }
        if (remaining == 0) RefreshScheduler.cancelAll(context)
    }
}

class TotalWidgetReceiver : PortfolioReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TotalWidget()
}

class AssetsWidgetReceiver : PortfolioReceiver() {
    override val glanceAppWidget: GlanceAppWidget = AssetsWidget()
}
