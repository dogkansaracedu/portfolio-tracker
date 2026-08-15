import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  fetchRetirementScenarios,
  createRetirementScenario,
  updateRetirementScenario,
  deleteRetirementScenario,
  setDefaultRetirementScenario,
} from "@/lib/queries/retirementScenarios"
import { useAuth } from "@/hooks/useAuth"
import type { RetirementScenarioInputs } from "@/lib/retirement/types"
import type {
  RetirementScenario,
  RetirementScenarioUpdate,
} from "@/types/database"

interface RetirementScenarioContextValue {
  scenarios: RetirementScenario[]
  /** The scenario loaded on entry: the flagged default, else the oldest one. */
  defaultScenario: RetirementScenario | null
  loading: boolean
  refresh: () => Promise<void>
  create: (
    name: string,
    inputs: RetirementScenarioInputs,
    isDefault?: boolean,
  ) => Promise<RetirementScenario>
  update: (
    id: string,
    data: RetirementScenarioUpdate,
  ) => Promise<RetirementScenario>
  remove: (id: string) => Promise<void>
  setDefault: (id: string) => Promise<void>
}

const RetirementScenarioContext =
  createContext<RetirementScenarioContextValue | null>(null)

/**
 * Single shared fetch of the user's saved retirement scenarios. Scenarios are
 * per-user and cross-device (Component 13's persistence contract); the planner's
 * scenario panel, and any tab that names the active scenario, read from here
 * rather than each firing their own request on mount.
 */
export function RetirementScenarioProvider({
  children,
}: {
  children: ReactNode
}) {
  const { user } = useAuth()
  const [scenarios, setScenarios] = useState<RetirementScenario[]>([])
  const [loading, setLoading] = useState(true)

  // External (mutation-driven) refresh. Mutation flows are user-initiated
  // single events, so cancellation is unnecessary here.
  const refresh = useCallback(async () => {
    if (!user) {
      setScenarios([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setScenarios(await fetchRetirementScenarios(user.id))
    } catch (err) {
      console.error("RetirementScenarioProvider load failed:", err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Mount/auth-change load. Uses a cancellation flag so a logout (or user
  // switch) mid-fetch can't clobber the new state with the previous user's
  // scenarios once the in-flight fetch settles.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!user) {
        if (!cancelled) {
          setScenarios([])
          setLoading(false)
        }
        return
      }
      if (!cancelled) setLoading(true)
      try {
        const rows = await fetchRetirementScenarios(user.id)
        if (!cancelled) setScenarios(rows)
      } catch (err) {
        console.error("RetirementScenarioProvider load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const create = useCallback(
    async (
      name: string,
      inputs: RetirementScenarioInputs,
      isDefault = false,
    ) => {
      if (!user) throw new Error("Not authenticated")
      // A new default has to wait: the partial unique index rejects a second
      // default row, so insert plain and let setDefault move the flag.
      const scenario = await createRetirementScenario({
        user_id: user.id,
        name,
        inputs,
      })
      setScenarios((prev) => [...prev, scenario])
      if (isDefault) {
        await setDefaultRetirementScenario(user.id, scenario.id)
        setScenarios((prev) =>
          prev.map((s) => ({ ...s, is_default: s.id === scenario.id })),
        )
        return { ...scenario, is_default: true }
      }
      return scenario
    },
    [user],
  )

  const update = useCallback(
    async (id: string, data: RetirementScenarioUpdate) => {
      const scenario = await updateRetirementScenario(id, data)
      setScenarios((prev) => prev.map((s) => (s.id === id ? scenario : s)))
      return scenario
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    await deleteRetirementScenario(id)
    setScenarios((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const setDefault = useCallback(
    async (id: string) => {
      if (!user) throw new Error("Not authenticated")
      await setDefaultRetirementScenario(user.id, id)
      setScenarios((prev) => prev.map((s) => ({ ...s, is_default: s.id === id })))
    },
    [user],
  )

  // The database guarantees at most one default; the fallback covers the "none
  // flagged yet" case (first use, or a half-applied setDefault) so entry always
  // has a scenario to load.
  const defaultScenario = useMemo(
    () => scenarios.find((s) => s.is_default) ?? scenarios[0] ?? null,
    [scenarios],
  )

  return (
    <RetirementScenarioContext.Provider
      value={{
        scenarios,
        defaultScenario,
        loading,
        refresh,
        create,
        update,
        remove,
        setDefault,
      }}
    >
      {children}
    </RetirementScenarioContext.Provider>
  )
}

export function useRetirementScenarioContext(): RetirementScenarioContextValue {
  const v = useContext(RetirementScenarioContext)
  if (!v) {
    throw new Error(
      "useRetirementScenarioContext must be used inside RetirementScenarioProvider",
    )
  }
  return v
}
