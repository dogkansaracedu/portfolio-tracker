package dev.portfolio.widget.data

import kotlinx.serialization.Serializable

/** Response of GET WIDGET_API_URL. Unknown fields are ignored. */
@Serializable
data class Payload(
    val asOf: String? = null,
    val total: Total? = null,
    val assets: List<Asset> = emptyList(),
)

@Serializable
data class Total(
    val valueTry: Double? = null,
    val valueUsd: Double? = null,
    val changeTry: Double? = null,
    val changePct: Double? = null,
    val snapshotAt: String? = null,
)

@Serializable
data class Asset(
    val ticker: String,
    val name: String? = null,
    val price: Double? = null,
    val priceCurrency: String? = null,
    val changePct: Double? = null,
    val valueTry: Double? = null,
    val updatedAt: String? = null,
    val stale: Boolean = false,
)

/** What both widgets and the launcher screen render. Persisted (minus [refreshing]) to disk. */
@Serializable
data class CacheState(
    val payload: Payload? = null,
    /** Epoch millis of the last successful fetch. */
    val fetchedAt: Long? = null,
    /** Epoch millis of the last attempt, successful or not. */
    val attemptedAt: Long? = null,
    /** Null when the last attempt succeeded. */
    val error: FetchError? = null,
    /** Debug-only: payload is a local fixture (for screenshots without real credentials). */
    val demo: Boolean = false,
    @kotlinx.serialization.Transient val refreshing: Boolean = false,
    /** Derived from the encrypted session store, not persisted here. */
    @kotlinx.serialization.Transient val signedIn: Boolean = false,
    @kotlinx.serialization.Transient val email: String? = null,
)

@Serializable
enum class FetchError { NOT_CONFIGURED, SIGNED_OUT, UNAUTHORIZED, NETWORK, SERVER, BAD_RESPONSE }
