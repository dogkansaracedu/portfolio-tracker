package dev.portfolio.widget.format

import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

/** Turkish number formatting: `.` groups thousands, `,` is the decimal mark, `−` is minus. */
object Fmt {
    const val MINUS = "−"
    private val TR = Locale.forLanguageTag("tr-TR")
    private val symbols = DecimalFormatSymbols(TR).apply {
        groupingSeparator = '.'
        decimalSeparator = ','
    }

    enum class Sign { UP, DOWN, FLAT }

    private fun number(value: Double, decimals: Int): String {
        val pattern = if (decimals == 0) "#,##0" else "#,##0." + "0".repeat(decimals)
        return DecimalFormat(pattern, symbols).apply { roundingMode = RoundingMode.HALF_UP }
            .format(abs(value))
    }

    private fun isZeroAt(value: Double, decimals: Int): Boolean =
        number(value, decimals).all { it == '0' || it == ',' || it == '.' }

    /** Sign after rounding to [decimals], so `+0,0%` never shows up coloured. */
    fun sign(value: Double?, decimals: Int): Sign = when {
        value == null || value.isNaN() || isZeroAt(value, decimals) -> Sign.FLAT
        value > 0 -> Sign.UP
        else -> Sign.DOWN
    }

    private fun prefix(s: Sign) = when (s) { Sign.UP -> "+"; Sign.DOWN -> MINUS; Sign.FLAT -> "" }

    fun symbol(currency: String?): String? = when (currency?.uppercase()) {
        "TRY", "TL" -> "₺"
        "USD" -> "$"
        "EUR" -> "€"
        "GBP" -> "£"
        else -> null
    }

    private fun withCurrency(digits: String, currency: String?): String {
        val sym = symbol(currency)
        return when {
            sym != null -> sym + digits
            currency.isNullOrBlank() -> digits
            else -> "$digits ${currency.uppercase()}"
        }
    }

    /** `₺4.812.300` — whole lira, for the headline total. */
    fun tryWhole(value: Double): String =
        (if (value < 0 && !isZeroAt(value, 0)) MINUS else "") + "₺" + number(value, 0)

    /** `+₺38.450` / `−₺1.204` / `₺0`. */
    fun signedTry(value: Double): String = prefix(sign(value, 0)) + "₺" + number(value, 0)

    /** `+1,9%` / `−0,6%` / `0,0%`. Input is already in percent units. */
    fun signedPct(value: Double, decimals: Int = 1): String =
        prefix(sign(value, decimals)) + number(value, decimals) + "%"

    /** Decimals that keep a price readable at its magnitude: `91.240`, `312,50`, `0,4821`. */
    fun priceDecimals(value: Double): Int {
        val a = abs(value)
        return when {
            a >= 1000 -> 0
            a >= 1 -> 2
            a >= 0.01 -> 4
            a == 0.0 -> 2
            else -> 6
        }
    }

    /** `$91.240`, `₺312,50`, `€1,0842`, `12,40 XAU`. */
    fun price(value: Double, currency: String?): String =
        (if (value < 0) MINUS else "") + withCurrency(number(value, priceDecimals(value)), currency)

    fun parseInstant(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return try {
            Instant.parse(iso)
        } catch (e: Exception) {
            try { OffsetDateTime.parse(iso).toInstant() } catch (e2: Exception) { null }
        }
    }

    private val hm = DateTimeFormatter.ofPattern("HH:mm", TR)
    private val dayHm = DateTimeFormatter.ofPattern("d MMM HH:mm", TR)

    /** `14:32` today, `15 Kas 09:10` on an earlier day. */
    fun timeLabel(at: Instant, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
        val t = at.atZone(zone)
        return if (t.toLocalDate() == now.atZone(zone).toLocalDate()) hm.format(t) else dayHm.format(t)
    }
}
