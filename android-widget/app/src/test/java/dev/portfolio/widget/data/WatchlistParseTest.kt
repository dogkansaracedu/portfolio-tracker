package dev.portfolio.widget.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchlistParseTest {
    private fun parse(body: String) = Api.json.decodeFromString(Payload.serializer(), body)

    @Test fun parsesWatchlistInOrderWithNulls() {
        val p = parse(
            """
            {"asOf":"2026-11-17T09:00:00Z","assets":[],
             "watchlist":[
               {"ticker":"USDTRY","name":"USD/TRY","price":50.382,"priceCurrency":"TRY","changePct":2.04,
                "updatedAt":"2026-11-17T08:58:00Z","stale":false},
               {"ticker":"ASELS","name":"Aselsan","price":182.4,"priceCurrency":"TRY","changePct":null,
                "updatedAt":"2026-11-17T08:58:00Z","stale":false,"future":1},
               {"ticker":"TP2","name":null,"price":null,"priceCurrency":"TRY","changePct":null,
                "updatedAt":null,"stale":true}
             ]}
            """.trimIndent(),
        )
        assertEquals(listOf("USDTRY", "ASELS", "TP2"), p.watchlist.map { it.ticker })
        assertEquals(50.382, p.watchlist[0].price!!, 0.0)
        assertEquals(2.04, p.watchlist[0].changePct!!, 0.0)
        assertFalse(p.watchlist[0].stale)
        assertNull(p.watchlist[1].changePct)
        assertNull(p.watchlist[2].price)
        assertTrue(p.watchlist[2].stale)
    }

    @Test fun missingWatchlistIsEmpty() {
        val p = parse("""{"asOf":"2026-11-17T09:00:00Z","assets":[{"ticker":"BTC"}]}""")
        assertTrue(p.watchlist.isEmpty())
        assertEquals("BTC", p.assets.single().ticker)
    }

    @Test fun nullWatchlistIsEmpty() {
        assertTrue(parse("""{"assets":[],"watchlist":null}""").watchlist.isEmpty())
    }

    @Test fun cachedStateWithoutWatchlistStillLoads() {
        // A cache file written by 1.1.0 has no watchlist key.
        val old = """{"payload":{"asOf":"2026-11-16T11:32:00Z","assets":[]},"fetchedAt":1}"""
        val s = Api.json.decodeFromString(CacheState.serializer(), old)
        assertTrue(s.payload!!.watchlist.isEmpty())
    }
}
