import { useState } from "react"
import { PageHeading } from "@/components/common/PageHeading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRetirementPlanner } from "@/hooks/useRetirementPlanner"
import { CompareTab } from "@/components/retirement/CompareTab"
import { PlanTab } from "@/components/retirement/PlanTab"
import { RetirementSkeleton } from "@/components/retirement/RetirementSkeleton"
import { ScenarioPanel } from "@/components/retirement/ScenarioPanel"
import { Hint, SegmentedControl } from "@/components/retirement/RetirementControls"
import {
  GLOSSARY_HINTS,
  RETIREMENT_TAB,
  RETIREMENT_TAB_LABELS,
  TODAYS_PURCHASING_POWER,
  VALUE_VIEW,
  VALUE_VIEW_LABELS,
  type RetirementTab,
  type ValueView,
} from "@/components/retirement/constants"
import { useRetirementDisplay } from "@/components/retirement/display"

/**
 * Component 13 — Retirement Planning. The scenario panel is shared by both
 * tabs, and so is the nominal/real toggle: it re-derives what is displayed and
 * never touches a stored input.
 *
 * The panel renders from the planner's live `inputs`; everything that runs the
 * engine (the tabs and the display edge that formats their figures) renders
 * from `engineInputs`, the deferred copy — so typing paints immediately and the
 * projections catch up behind it. Only the active tab is mounted, so only its
 * projections run.
 */

const VALUE_VIEW_OPTIONS: { id: ValueView; label: string }[] = [
  { id: VALUE_VIEW.nominal, label: VALUE_VIEW_LABELS[VALUE_VIEW.nominal] },
  { id: VALUE_VIEW.real, label: VALUE_VIEW_LABELS[VALUE_VIEW.real] },
]

export default function RetirementPage() {
  const planner = useRetirementPlanner()
  const [tab, setTab] = useState<RetirementTab>(RETIREMENT_TAB.plan)
  const [valueView, setValueView] = useState<ValueView>(VALUE_VIEW.nominal)
  const display = useRetirementDisplay(
    planner.engineInputs.usdInflationPct,
    valueView,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeading
          title="Retirement"
          subtitle="Ask your plan when you can retire, when you can stop contributing, how much to put in — and compare the options."
        />
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Value view
            <Hint text={GLOSSARY_HINTS.nominalAndReal} label="nominal and real" />
          </span>
          <SegmentedControl
            size="sm"
            value={valueView}
            options={VALUE_VIEW_OPTIONS}
            onChange={setValueView}
          />
          {display.isReal && (
            <span className="text-xs text-muted-foreground">
              {TODAYS_PURCHASING_POWER}
            </span>
          )}
        </div>
      </div>

      {planner.loading ? (
        <RetirementSkeleton />
      ) : (
        <>
          <ScenarioPanel planner={planner} />

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as RetirementTab)}
          >
            <TabsList>
              {Object.values(RETIREMENT_TAB).map((id) => (
                <TabsTrigger key={id} value={id}>
                  {RETIREMENT_TAB_LABELS[id]}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={RETIREMENT_TAB.plan}>
              <PlanTab
                inputs={planner.engineInputs}
                startingAmountUsd={planner.engineStartingAmountUsd}
                display={display}
              />
            </TabsContent>

            <TabsContent value={RETIREMENT_TAB.compare}>
              <CompareTab
                inputs={planner.engineInputs}
                startingAmountUsd={planner.engineStartingAmountUsd}
                display={display}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
