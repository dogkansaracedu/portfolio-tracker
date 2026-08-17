/** Persistence half of the campaign ingestion path, shared by
 *  `ingest-campaigns` and `research-campaigns`. The validation half lives in
 *  `_shared/campaigns.ts`, which must stay import-free (Vitest loads it) — so
 *  everything that needs a Supabase client lives here instead. */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import type { CampaignInput, RejectedRow } from "./campaigns.ts"

export const RUN_STATUS_SUCCESS = "success"
export const RUN_STATUS_FAILED = "failed"

export const PRODUCER_RESEARCH = "research-campaigns"
export const PRODUCER_INGEST = "ingest"

export interface RunMeta {
  producer: string
  model?: string | null
  summary?: string | null
  rejected?: RejectedRow[]
  rawOutput?: unknown
}

/** A previously-stored campaign row, as the change summary reads it back. */
export interface StoredCampaign {
  asset_ticker: string
  platform: string
  program_type: string
}

/** `numeric` columns are written as strings so no value ever round-trips
 *  through a float on the way in (repo-wide BigNumber-safe convention). */
function numericText(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** Insert a run + its rows as a pseudo-transaction.
 *
 *  PostgREST gives us no multi-statement transaction, so the write order does
 *  the work: the run goes in as 'failed', the rows follow, and only then does
 *  the run flip to 'success'. Readers look for the newest 'success' run, so a
 *  crash at any point leaves an inert failed run and the previous dataset
 *  still live. */
export async function insertCampaignBatch(
  supabase: SupabaseClient,
  campaigns: CampaignInput[],
  meta: RunMeta,
): Promise<{ runId: string; inserted: number }> {
  const { data: runRow, error: runErr } = await supabase
    .from("campaign_research_runs")
    .insert({
      producer: meta.producer,
      model: meta.model ?? null,
      status: RUN_STATUS_FAILED,
      summary: meta.summary ?? null,
      rejected_rows: meta.rejected ?? null,
      raw_output: meta.rawOutput ?? null,
    })
    .select("id")
    .single()

  if (runErr || !runRow) {
    throw new Error(`campaign_research_runs insert: ${runErr?.message ?? "no row returned"}`)
  }
  const runId = (runRow as { id: string }).id

  const { data: inserted, error: rowsErr } = await supabase
    .from("campaigns")
    .insert(
      campaigns.map((c) => ({
        run_id: runId,
        asset_ticker: c.asset_ticker,
        platform: c.platform,
        program_type: c.program_type,
        apr: numericText(c.apr),
        apr_kind: c.apr_kind ?? null,
        reward_description: c.reward_description ?? null,
        lock_days: c.lock_days ?? null,
        min_amount: numericText(c.min_amount),
        max_amount: numericText(c.max_amount),
        amount_currency: c.amount_currency ?? null,
        conditions: c.conditions ?? null,
        deadline: c.deadline ?? null,
        is_stablecoin: c.is_stablecoin === true,
        source_url: c.source_url,
        fetched_at: c.fetched_at,
      })),
    )
    .select("id")

  if (rowsErr) throw new Error(`campaigns insert: ${rowsErr.message}`)

  const { error: flipErr } = await supabase
    .from("campaign_research_runs")
    .update({ status: RUN_STATUS_SUCCESS })
    .eq("id", runId)

  if (flipErr) throw new Error(`run status flip: ${flipErr.message}`)

  return { runId, inserted: inserted?.length ?? 0 }
}

/** Record a run that produced nothing usable. Never touches earlier runs —
 *  the previous successful dataset stays the one readers see. */
export async function recordFailedRun(
  supabase: SupabaseClient,
  meta: RunMeta,
): Promise<string | null> {
  const { data } = await supabase
    .from("campaign_research_runs")
    .insert({
      producer: meta.producer,
      model: meta.model ?? null,
      status: RUN_STATUS_FAILED,
      summary: meta.summary ?? null,
      rejected_rows: meta.rejected ?? null,
      raw_output: meta.rawOutput ?? null,
    })
    .select("id")
    .single()
  return (data as { id: string } | null)?.id ?? null
}

/** Rows of the latest successful run — the baseline a new run diffs against. */
export async function fetchLatestSuccessfulRows(
  supabase: SupabaseClient,
): Promise<StoredCampaign[]> {
  const { data: run } = await supabase
    .from("campaign_research_runs")
    .select("id")
    .eq("status", RUN_STATUS_SUCCESS)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const runId = (run as { id: string } | null)?.id
  if (!runId) return []

  const { data: rows } = await supabase
    .from("campaigns")
    .select("asset_ticker, platform, program_type")
    .eq("run_id", runId)

  return (rows ?? []) as StoredCampaign[]
}
