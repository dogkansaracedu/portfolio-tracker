import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { useHoldings } from "@/hooks/useHoldings"
import { usePnL } from "@/hooks/usePnL"
import { usePrices } from "@/hooks/usePrices"
import { useRetirementScenarios } from "@/hooks/useRetirementScenarios"
import {
  DEFAULT_RETIREMENT_SCENARIO_INPUTS,
  normalizeScenarioInputs,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import { DEFAULT_SCENARIO_NAME } from "@/components/retirement/constants"
import type { RetirementScenario } from "@/types/database"

/**
 * The Retirement page's scenario state: the saved scenarios (shared fetch), the
 * locally edited draft on top of the active one, and the live portfolio value
 * that seeds a scenario whose starting amount is left on "use live portfolio
 * value". Edits stay local until Save writes them through.
 *
 * Every saved row is read through `normalizeScenarioInputs` — scenarios written
 * before an input existed come back missing it, and nothing downstream (engine
 * or view) should have to defend against that.
 *
 * The draft is exposed twice: `inputs` (the fields' own value, updated on the
 * keystroke) and `engineInputs` (the same draft, allowed to fall behind). One
 * edit costs the projection engine a few hundred month-by-month runs, so
 * rendering the fields and the projections from the same value would make every
 * keystroke wait for the whole recompute.
 */

export interface RetirementPlanner {
  scenarios: RetirementScenario[]
  activeScenario: RetirementScenario | null
  loading: boolean
  saving: boolean
  error: string | null
  /** The edited inputs, current as of the last keystroke — what the fields render. */
  inputs: RetirementScenarioInputs
  dirty: boolean
  /** Live portfolio total — the default starting amount. */
  liveValueUsd: BigNumber
  /** The starting amount the projections actually run from. */
  startingAmountUsd: BigNumber
  /** `inputs`, deferred: what every projection, solver and chart computes from. */
  engineInputs: RetirementScenarioInputs
  /** `startingAmountUsd` deferred alongside `engineInputs`, never out of step with it. */
  engineStartingAmountUsd: BigNumber
  patch: (partial: Partial<RetirementScenarioInputs>) => void
  selectScenario: (id: string) => void
  save: () => Promise<void>
  createScenario: (name: string) => Promise<void>
  renameActive: (name: string) => Promise<void>
  deleteActive: () => Promise<void>
  makeActiveDefault: () => Promise<void>
  discardEdits: () => void
}

export function useRetirementPlanner(): RetirementPlanner {
  const { scenarios, defaultScenario, loading, create, update, remove, setDefault } =
    useRetirementScenarios()
  const { holdings } = useHoldings()
  const { prices } = usePrices()
  const { totalCurrentValueUsd } = usePnL(holdings, prices)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [inputs, setInputs] = useState<RetirementScenarioInputs>(
    DEFAULT_RETIREMENT_SCENARIO_INPUTS,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A save round-trips through the provider's refresh; without this the
  // adoption effect below would see the reloaded row and clobber the draft.
  const pendingSelectionRef = useRef<string | null>(null)

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeId) ?? null,
    [scenarios, activeId],
  )

  // Load the default scenario on entry, and fall back to it when the active one
  // disappears (deleted). Only an id change re-seeds the draft, so a refresh of
  // the same scenario never discards unsaved edits.
  useEffect(() => {
    if (loading) return
    const pendingId = pendingSelectionRef.current
    if (pendingId !== null) {
      // A just-created scenario: hold everything until the refresh brings the
      // row in, so the fallback below can't drag the draft onto another one.
      const pending = scenarios.find((s) => s.id === pendingId)
      if (!pending) return
      pendingSelectionRef.current = null
      if (pending.id === activeId) return
      setActiveId(pending.id)
      setInputs(normalizeScenarioInputs(pending.inputs))
      return
    }
    const wanted =
      scenarios.find((s) => s.id === activeId) ?? defaultScenario ?? null
    if ((wanted?.id ?? null) === activeId) return
    setActiveId(wanted?.id ?? null)
    setInputs(
      wanted
        ? normalizeScenarioInputs(wanted.inputs)
        : DEFAULT_RETIREMENT_SCENARIO_INPUTS,
    )
  }, [loading, scenarios, defaultScenario, activeId])

  // Compared normalized on both sides: a scenario saved before an input existed
  // loads with that input filled in, which is not an edit the user made.
  const dirty = useMemo(() => {
    if (!activeScenario) return true
    return (
      JSON.stringify(normalizeScenarioInputs(activeScenario.inputs)) !==
      JSON.stringify(inputs)
    )
  }, [activeScenario, inputs])

  const startingAmountUsd = useMemo(
    () =>
      inputs.startingAmountUsd === null
        ? totalCurrentValueUsd
        : bn(inputs.startingAmountUsd),
    [inputs.startingAmountUsd, totalCurrentValueUsd],
  )

  /**
   * The engine's view of the draft, deferred as one pair so a projection can
   * never pair new inputs with the previous starting amount. React renders the
   * edited field first and re-runs the engine afterwards, dropping intermediate
   * values whenever the next keystroke lands before the recompute finishes.
   */
  const engine = useMemo(
    () => ({ inputs, startingAmountUsd }),
    [inputs, startingAmountUsd],
  )
  const deferredEngine = useDeferredValue(engine)

  const patch = useCallback((partial: Partial<RetirementScenarioInputs>) => {
    setInputs((prev) => ({ ...prev, ...partial }))
  }, [])

  const selectScenario = useCallback(
    (id: string) => {
      const next = scenarios.find((s) => s.id === id)
      if (!next) return
      setActiveId(next.id)
      setInputs(normalizeScenarioInputs(next.inputs))
      setError(null)
    },
    [scenarios],
  )

  const run = useCallback(async (action: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the scenario")
    } finally {
      setSaving(false)
    }
  }, [])

  const save = useCallback(
    () =>
      run(async () => {
        if (activeScenario) {
          await update(activeScenario.id, { inputs })
          return
        }
        const created = await create(DEFAULT_SCENARIO_NAME, inputs, true)
        pendingSelectionRef.current = created.id
        setActiveId(created.id)
      }),
    [run, activeScenario, update, create, inputs],
  )

  const createScenario = useCallback(
    (name: string) =>
      run(async () => {
        const created = await create(name, inputs, scenarios.length === 0)
        pendingSelectionRef.current = created.id
        setActiveId(created.id)
      }),
    [run, create, inputs, scenarios.length],
  )

  const renameActive = useCallback(
    (name: string) =>
      run(async () => {
        if (!activeScenario) return
        await update(activeScenario.id, { name })
      }),
    [run, update, activeScenario],
  )

  const deleteActive = useCallback(
    () =>
      run(async () => {
        if (!activeScenario) return
        await remove(activeScenario.id)
        setActiveId(null)
      }),
    [run, remove, activeScenario],
  )

  const makeActiveDefault = useCallback(
    () =>
      run(async () => {
        if (!activeScenario) return
        await setDefault(activeScenario.id)
      }),
    [run, setDefault, activeScenario],
  )

  const discardEdits = useCallback(() => {
    setInputs(
      activeScenario
        ? normalizeScenarioInputs(activeScenario.inputs)
        : DEFAULT_RETIREMENT_SCENARIO_INPUTS,
    )
  }, [activeScenario])

  return {
    scenarios,
    activeScenario,
    loading,
    saving,
    error,
    inputs,
    dirty,
    liveValueUsd: totalCurrentValueUsd,
    startingAmountUsd,
    engineInputs: deferredEngine.inputs,
    engineStartingAmountUsd: deferredEngine.startingAmountUsd,
    patch,
    selectScenario,
    save,
    createScenario,
    renameActive,
    deleteActive,
    makeActiveDefault,
    discardEdits,
  }
}
