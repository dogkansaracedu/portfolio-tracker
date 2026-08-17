import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import { fetchLatestCampaigns } from "@/lib/queries/campaigns"
import type { Campaign, CampaignResearchRun } from "@/types/database"

interface CampaignsContextValue {
  run: CampaignResearchRun | null
  campaigns: Campaign[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const CampaignsContext = createContext<CampaignsContextValue | null>(null)

/**
 * Single shared fetch of the latest campaign research run (Component 15). The
 * dataset is global and only changes when the weekly research pass writes a new
 * run, so this loads once per session — no polling, unlike prices — and
 * `refresh()` is the manual escape hatch on the page header.
 */
export function CampaignsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [run, setRun] = useState<CampaignResearchRun | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // The tables are readable by authenticated users only; skip the round-trip
    // (and the guaranteed RLS error) while signed out.
    if (!user) {
      setRun(null)
      setCampaigns([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const latest = await fetchLatestCampaigns()
      setRun(latest.run)
      setCampaigns(latest.campaigns)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch campaigns")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <CampaignsContext.Provider
      value={{ run, campaigns, loading, error, refresh }}
    >
      {children}
    </CampaignsContext.Provider>
  )
}

export function useCampaignsContext(): CampaignsContextValue {
  const v = useContext(CampaignsContext)
  if (!v) {
    throw new Error("useCampaignsContext must be used inside CampaignsProvider")
  }
  return v
}
