import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type BigNumber from "bignumber.js"
import { bn, homeDayIso } from "@/lib/config"
import { useHoldings } from "@/hooks/useHoldings"
import { usePnL } from "@/hooks/usePnL"
import { usePrices } from "@/hooks/usePrices"
import { useRetirementScenarios } from "@/hooks/useRetirementScenarios"
import {
  DEFAULT_RETIREMENT_SCENARIO_INPUTS,
  normalizeScenarioInputs,
  type RetirementPlanStart,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import {
  DEFAULT_SCENARIO_NAME,
  LIVE_VALUE_NOT_READY,
  SCENARIO_WRITE_FAILED,
} from "@/components/retirement/constants"
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
 *
 * Separate from the draft, and deliberately not part of `dirty`: the scenario's
 * plan start — the frozen day / starting amount / inputs that "am I on track?"
 * measures against. It only moves when the user starts (or clears) the plan.
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
  /** False until holdings and transactions have loaded; `liveValueUsd` is a
   *  placeholder zero before that, never a real total. */
  liveValueReady: boolean
  /** The starting amount the projections actually run from. */
  startingAmountUsd: BigNumber
  /** `inputs`, deferred: what every projection, solver and chart computes from. */
  engineInputs: RetirementScenarioInputs
  /** `startingAmountUsd` deferred alongside `engineInputs`, never out of step with it. */
  engineStartingAmountUsd: BigNumber
  /** The active scenario's frozen plan; null when none is active or it was never started. */
  planStart: RetirementPlanStart | null
  patch: (partial: Partial<RetirementScenarioInputs>) => void
  selectScenario: (id: string) => void
  /** Reports failure through `error`; always resolves. */
  save: () => Promise<void>
  /** **Rejects** when the write fails, and reports nothing itself — the name
   *  dialog owns that failure: it stays open with the typed name and the
   *  reason under the field. */
  createScenario: (name: string) => Promise<void>
  /** **Rejects** when the write fails — see {@link createScenario}. */
  renameActive: (name: string) => Promise<void>
  /** Reports failure through `error`; always resolves. */
  deleteActive: () => Promise<void>
  /** Reports failure through `error`; always resolves. */
  makeActiveDefault: () => Promise<void>
  /**
   * Freeze the active scenario as THE plan — the day, the resolved starting
   * amount and the current draft. Creates a first scenario when there is none,
   * and saves the draft in the same write when it is `dirty`, so the frozen
   * plan is always the one on screen. Called on an already-started scenario it
   * overwrites the freeze; the confirmation belongs to the caller.
   * Reports failure through `error`; always resolves.
   */
  startPlan: () => Promise<void>
  /** Un-starts the active scenario — back to a what-if. Reports through `error`. */
  clearPlanStart: () => Promise<void>
  discardEdits: () => void
}

export function useRetirementPlanner(): RetirementPlanner {
  const { scenarios, defaultScenario, loading, create, update, remove, setDefault } =
    useRetirementScenarios()
  const { holdings, loading: holdingsLoading } = useHoldings()
  const { prices } = usePrices()
  const { totalCurrentValueUsd, loading: pnlLoading } = usePnL(holdings, prices)
  const liveValueReady = !holdingsLoading && !pnlLoading

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

  /**
   * Every scenario write goes through here: it flips `saving`, clears the last
   * report — and lets the failure through. It deliberately does NOT swallow
   * one: which slot reports a failure belongs to the caller, and swallowing it
   * here made a failed rename close its dialog exactly like a successful one.
   */
  const run = useCallback(async (action: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await action()
    } finally {
      setSaving(false)
    }
  }, [])

  /**
   * A write whose report is the panel's own `error` line — the picker's
   * fire-and-forget buttons. The failure lands there and the promise settles,
   * because an unhandled rejection is not a report. Writes driven by a form
   * with its own error slot (the name dialog) skip this and keep the rejection.
   */
  const reported = useCallback(
    (write: Promise<void>) =>
      write.catch((err: unknown) => {
        setError(err instanceof Error ? err.message : SCENARIO_WRITE_FAILED)
      }),
    [],
  )

  /**
   * First-ever write with nothing saved yet: the draft becomes the user's
   * default scenario. Both entry points that can hit an empty book — Save and
   * Start plan — come through here so the row they conjure is identical.
   */
  const createDefaultScenario = useCallback(async () => {
    const created = await create(DEFAULT_SCENARIO_NAME, inputs, true)
    pendingSelectionRef.current = created.id
    setActiveId(created.id)
    return created
  }, [create, inputs])

  const save = useCallback(
    () =>
      reported(
        run(async () => {
          if (activeScenario) {
            await update(activeScenario.id, { inputs })
            return
          }
          await createDefaultScenario()
        }),
      ),
    [reported, run, activeScenario, update, createDefaultScenario, inputs],
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
      reported(
        run(async () => {
          if (!activeScenario) return
          await remove(activeScenario.id)
          setActiveId(null)
        }),
      ),
    [reported, run, remove, activeScenario],
  )

  const makeActiveDefault = useCallback(
    () =>
      reported(
        run(async () => {
          if (!activeScenario) return
          await setDefault(activeScenario.id)
        }),
      ),
    [reported, run, setDefault, activeScenario],
  )

  const startPlan = useCallback(
    () =>
      reported(
        run(async () => {
          // A blank starting-amount field resolves to the live total, which is
          // a placeholder zero until the portfolio data lands. Freezing that
          // would anchor the yardstick at $0 for good — refuse instead.
          if (inputs.startingAmountUsd === null && !liveValueReady) {
            throw new Error(LIVE_VALUE_NOT_READY)
          }
          const target = activeScenario ?? (await createDefaultScenario())
          const planStartValue: RetirementPlanStart = {
            startedAt: homeDayIso(),
            // The freeze is the whole point: a blank starting-amount field
            // means "use the live portfolio", and the live total moves. What
            // gets stored is the amount resolved right now — and this JSON
            // column is the one place the draft leaves BigNumber.
            startingAmountUsd: startingAmountUsd.toNumber(),
            inputs,
          }
          // One write, both fields when the draft is ahead of the row: the
          // plan frozen is the plan on screen, and a start can never leave a
          // scenario whose saved inputs disagree with its frozen ones.
          await update(
            target.id,
            dirty
              ? { inputs, plan_start: planStartValue }
              : { plan_start: planStartValue },
          )
        }),
      ),
    [
      reported,
      run,
      activeScenario,
      createDefaultScenario,
      update,
      dirty,
      inputs,
      startingAmountUsd,
      liveValueReady,
    ],
  )

  const clearPlanStart = useCallback(
    () =>
      reported(
        run(async () => {
          if (!activeScenario) return
          await update(activeScenario.id, { plan_start: null })
        }),
      ),
    [reported, run, update, activeScenario],
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
    liveValueReady,
    startingAmountUsd,
    engineInputs: deferredEngine.inputs,
    engineStartingAmountUsd: deferredEngine.startingAmountUsd,
    planStart: activeScenario?.plan_start ?? null,
    patch,
    selectScenario,
    save,
    createScenario,
    renameActive,
    deleteActive,
    makeActiveDefault,
    startPlan,
    clearPlanStart,
    discardEdits,
  }
}
