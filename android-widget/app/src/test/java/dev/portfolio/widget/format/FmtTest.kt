package dev.portfolio.widget.format

import dev.portfolio.widget.data.Api
import dev.portfolio.widget.data.Payload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class FmtTest {
    private val m = Fmt.MINUS

    @Test fun total() {
        assertEquals("₺4.812.300", Fmt.tryWhole(4812300.12))
        assertEquals("₺999", Fmt.tryWhole(999.4))
    }

    @Test fun signedChange() {
        assertEquals("+₺38.450", Fmt.signedTry(38450.2))
        assertEquals("${m}₺1.204", Fmt.signedTry(-1204.0))
        assertEquals("₺0", Fmt.signedTry(0.3))
        assertEquals("+0,8%", Fmt.signedPct(0.81))
        assertEquals("${m}0,6%", Fmt.signedPct(-0.6))
        assertEquals("0,0%", Fmt.signedPct(-0.04))
        assertEquals(Fmt.Sign.FLAT, Fmt.sign(-0.04, 1))
        assertEquals(Fmt.Sign.FLAT, Fmt.sign(null, 1))
    }

    @Test fun prices() {
        assertEquals("$91.240", Fmt.price(91240.1, "USD"))
        assertEquals("₺312,50", Fmt.price(312.5, "TRY"))
        assertEquals("€1,08", Fmt.price(1.0842, "EUR"))
        assertEquals("₺0,4821", Fmt.price(0.48213, "TRY"))
        assertEquals("12,40 XAU", Fmt.price(12.4, "xau"))
    }

    @Test fun time() {
        val zone = ZoneId.of("Europe/Istanbul")
        val now = Instant.parse("2026-11-16T12:00:00Z")
        assertEquals("14:32", Fmt.timeLabel(Instant.parse("2026-11-16T11:32:00Z"), now, zone))
        assertEquals("15 Kas 09:10", Fmt.timeLabel(Instant.parse("2026-11-15T06:10:00Z"), now, zone))
        assertEquals(Instant.parse("2026-11-16T11:32:00Z"), Fmt.parseInstant("2026-11-16T14:32:00+03:00"))
        assertNull(Fmt.parseInstant("nope"))
    }

    @Test fun parsesContractAndIgnoresUnknownFields() {
        val body = """
          {"asOf":"2026-11-16T11:32:00Z","extra":1,
           "total":{"valueTry":4812300.12,"valueUsd":114100.5,"changeTry":null,"changePct":null,"snapshotAt":null},
           "assets":[{"ticker":"BTC","name":"Bitcoin","price":91240.1,"priceCurrency":"USD","changePct":1.9,
                      "valueTry":1200000.0,"updatedAt":"2026-11-16T11:30:00Z","stale":false,"new":"x"}]}
        """.trimIndent()
        val p = Api.json.decodeFromString(Payload.serializer(), body)
        assertEquals(4812300.12, p.total!!.valueTry!!, 0.0)
        assertNull(p.total!!.changeTry)
        assertEquals("BTC", p.assets.single().ticker)
    }
}
