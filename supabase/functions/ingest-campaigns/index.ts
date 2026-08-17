import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { validateCampaignBatch } from "../_shared/campaigns.ts"
import { insertCampaignBatch, PRODUCER_INGEST } from "../_shared/campaign-store.ts"

// The vendor-neutral ingestion door (Component 15). Any producer that can emit
// the batch schema — the scheduled research job, a manual curl, a future agent
// — POSTs here with the shared secret and needs nothing else. The secret is
// deliberately independent of any user credential: this path writes global
// data that no user may write.

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405)
  }

  const expectedToken = Deno.env.get("CAMPAIGN_INGEST_TOKEN")
  if (!expectedToken) {
    return json({ error: "CAMPAIGN_INGEST_TOKEN is not configured" }, 500)
  }
  if (req.headers.get("Authorization") !== `Bearer ${expectedToken}`) {
    return json({ error: "unauthorized" }, 401)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    payload = null
  }

  const { valid, rejected } = validateCampaignBatch(payload)

  // Zero valid rows fails the whole batch and writes nothing: a producer that
  // emitted garbage must not be able to blank out a good dataset.
  if (valid.length === 0) {
    return json({ error: "no valid campaigns in batch", rejected }, 422)
  }

  const meta = (payload ?? {}) as { producer?: unknown; model?: unknown; summary?: unknown }

  try {
    const { runId, inserted } = await insertCampaignBatch(getServiceClient(), valid, {
      producer: typeof meta.producer === "string" && meta.producer.trim()
        ? meta.producer.trim()
        : PRODUCER_INGEST,
      model: typeof meta.model === "string" ? meta.model : null,
      summary: typeof meta.summary === "string" ? meta.summary : null,
      rejected,
    })
    return json({ run_id: runId, inserted, rejected: rejected.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown ingest error"
    return json({ error: msg }, 500)
  }
})
