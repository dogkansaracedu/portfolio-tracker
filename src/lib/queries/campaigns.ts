import { supabase } from "@/lib/supabase";
import {
  CAMPAIGNS_TABLE,
  CAMPAIGN_RUNS_TABLE,
  CAMPAIGN_RUN_STATUS,
} from "@/lib/constants/campaigns";
import type { Campaign, CampaignResearchRun } from "@/types/database";

export interface LatestCampaigns {
  /** Null when no successful research run exists yet. */
  run: CampaignResearchRun | null;
  campaigns: Campaign[];
}

/**
 * The campaign dataset the app shows: the newest *successful* research run and
 * its rows. Older runs are history (never edited, never displayed) and a failed
 * run is skipped entirely, so the previous good data stays on screen.
 *
 * Two round-trips rather than an embedded select: the run is a single row and
 * the rows hang off it, so a join would repeat the run's `raw_output` blob on
 * every campaign.
 */
export async function fetchLatestCampaigns(): Promise<LatestCampaigns> {
  const { data: runs, error: runError } = await supabase
    .from(CAMPAIGN_RUNS_TABLE)
    .select("*")
    .eq("status", CAMPAIGN_RUN_STATUS.success)
    .order("ran_at", { ascending: false })
    .limit(1);

  if (runError) {
    throw new Error(`Failed to fetch campaign research run: ${runError.message}`);
  }

  const run: CampaignResearchRun | null = runs?.[0] ?? null;
  if (!run) return { run: null, campaigns: [] };

  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("*")
    .eq("run_id", run.id)
    .order("asset_ticker", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`);
  }

  return { run, campaigns: data ?? [] };
}
