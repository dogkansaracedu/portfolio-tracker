import { useState } from "react"
import { Plus, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { formatMoney } from "@/lib/prices"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import {
  WITHDRAWAL_STRATEGY,
  type ComparisonOption,
  type ExpectedReturnTriple,
  type WithdrawalStrategy,
} from "@/lib/retirement"
import type { RetirementPlanner } from "@/hooks/useRetirementPlanner"
import type { RetirementScenario } from "@/types/database"
import {
  CONTRIBUTION_END_AGE_LABEL,
  DEFAULT_SCENARIO_NAME,
  DEFAULT_SCENARIO_SUFFIX,
  DEPLETION_AGE_HINTS,
  DEPLETION_AGE_LABELS,
  GLOSSARY_HINTS,
  SAFE_WITHDRAWAL_RATE_HINTS,
  SCENARIO_PICKER_PLACEHOLDER,
  SCENARIO_SUMMARY,
  WITHDRAWAL_STRATEGY_LABELS,
} from "./constants"
import {
  HintLabel,
  NumberField,
  SegmentedControl,
} from "./RetirementControls"
import { ScenarioNameDialog } from "./ScenarioNameDialog"
import { Disclosure } from "@/components/common/Disclosure"

/**
 * The persistent scenario panel: which saved scenario is loaded, the
 * contribution plan and retirement inputs, and the assumption set folded away
 * behind "Assumptions" so casual use isn't buried in knobs. Edits are local
 * until Save writes them through.
 */

/** What the picker shows for a scenario, in the trigger and in the list alike. */
function scenarioLabel(scenario: RetirementScenario): string {
  return `${scenario.name}${scenario.is_default ? DEFAULT_SCENARIO_SUFFIX : ""}`
}

const STRATEGY_OPTIONS: { id: WithdrawalStrategy; label: string }[] = [
  {
    id: WITHDRAWAL_STRATEGY.preservation,
    label: WITHDRAWAL_STRATEGY_LABELS[WITHDRAWAL_STRATEGY.preservation],
  },
  {
    id: WITHDRAWAL_STRATEGY.depletion,
    label: WITHDRAWAL_STRATEGY_LABELS[WITHDRAWAL_STRATEGY.depletion],
  },
]

export function ScenarioPanel({ planner }: { planner: RetirementPlanner }) {
  const {
    scenarios,
    activeScenario,
    inputs,
    dirty,
    saving,
    error,
    liveValueUsd,
    patch,
    selectScenario,
    save,
    createScenario,
    renameActive,
    deleteActive,
    makeActiveDefault,
    discardEdits,
  } = planner
  const { obfuscated } = useDisplayCurrency()
  const [panelOpen, setPanelOpen] = useState(false)
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const [nameDialog, setNameDialog] = useState<"create" | "rename" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const usesLiveValue = inputs.startingAmountUsd === null
  // One formatted string for the live value: the read-only field and the
  // caption under it show the same money, through the same money edge.
  const liveValueLabel = formatMoney(liveValueUsd.toNumber(), DEFAULT_CURRENCY, obfuscated)
  // Fields are remounted (so their typing buffers re-seed) when the loaded
  // scenario changes.
  const fieldKey = activeScenario?.id ?? "unsaved"

  const patchReturn = (partial: Partial<ExpectedReturnTriple>) =>
    patch({
      primaryExpectedReturn: { ...inputs.primaryExpectedReturn, ...partial },
    })

  const patchOption = (id: string, partial: Partial<ComparisonOption>) =>
    patch({
      options: inputs.options.map((option) =>
        option.id === id ? { ...option, ...partial } : option,
      ),
    })

  // The phone panel opens collapsed behind this line, so the question tabs and
  // the answer land in the first screen; from `sm` up the panel is always open
  // and the trigger is gone.
  const phoneSummary = [
    `${formatMoney(inputs.monthlyContributionUsd, DEFAULT_CURRENCY, obfuscated)}${SCENARIO_SUMMARY.perMonthSuffix}`,
    `${SCENARIO_SUMMARY.retireAt} ${inputs.retirementAge}`,
    `${inputs.safeWithdrawalRatePct}${SCENARIO_SUMMARY.swrSuffix}`,
  ].join(SCENARIO_SUMMARY.separator)

  return (
    <Card>
      <CardContent>
        <Disclosure
          open={panelOpen}
          onOpenChange={setPanelOpen}
          label={
            <span className="text-left font-normal text-muted-foreground">
              {phoneSummary}
              {" — "}
              <span className="font-medium text-foreground">
                {SCENARIO_SUMMARY.edit}
              </span>
            </span>
          }
          triggerClassName="sm:hidden"
          contentClassName="space-y-4 sm:mt-0 sm:block"
        >
        {/* Scenario picker + persistence actions */}
        <div className="flex flex-wrap items-center gap-2">
          {scenarios.length > 0 ? (
            <Select
              value={activeScenario?.id ?? ""}
              onValueChange={(value) => value && selectScenario(String(value))}
            >
              <SelectTrigger size="sm" className="min-w-44">
                {/*
                  The trigger renders the *value* — the row id — unless given a
                  formatter, so the label is looked up here.
                */}
                <SelectValue>
                  {(value: string) => {
                    const scenario = scenarios.find((s) => s.id === value)
                    return scenario
                      ? scenarioLabel(scenario)
                      : SCENARIO_PICKER_PLACEHOLDER
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenarioLabel(scenario)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm font-medium">{DEFAULT_SCENARIO_NAME}</span>
          )}

          {dirty && (
            <span className="text-xs text-muted-foreground">Unsaved edits</span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {dirty && activeScenario && (
              <Button size="sm" variant="ghost" onClick={discardEdits}>
                Discard
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNameDialog("create")}
            >
              <Plus /> New
            </Button>
            {activeScenario && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNameDialog("rename")}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activeScenario.is_default || saving}
                  onClick={makeActiveDefault}
                >
                  <Star /> Set default
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Core inputs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <NumberField
              key={`${fieldKey}-start`}
              id="starting-amount"
              label="Starting amount"
              hint={GLOSSARY_HINTS.startingAmount}
              suffix="USD"
              disabled={usesLiveValue}
              value={
                usesLiveValue
                  ? Number(liveValueUsd.toFixed(2))
                  : (inputs.startingAmountUsd ?? 0)
              }
              displayValue={usesLiveValue ? liveValueLabel : undefined}
              onChange={(next) => patch({ startingAmountUsd: next })}
            />
            <button
              type="button"
              className="text-left text-xs text-primary underline-offset-4 hover:underline"
              onClick={() =>
                patch({
                  startingAmountUsd: usesLiveValue
                    ? Number(liveValueUsd.toFixed(2))
                    : null,
                })
              }
            >
              {usesLiveValue
                ? `Using live portfolio value (${liveValueLabel}) — enter my own`
                : "Use live portfolio value"}
            </button>
          </div>

          <NumberField
            key={`${fieldKey}-contribution`}
            id="monthly-contribution"
            label="Monthly contribution"
            suffix="USD"
            value={inputs.monthlyContributionUsd}
            onChange={(next) => patch({ monthlyContributionUsd: next })}
          />
          <NumberField
            key={`${fieldKey}-growth`}
            id="contribution-growth"
            label="Contribution growth"
            hint={GLOSSARY_HINTS.contributionGrowth}
            suffix="%"
            step={0.5}
            value={inputs.contributionGrowthPct}
            onChange={(next) => patch({ contributionGrowthPct: next })}
          />
          <NumberField
            key={`${fieldKey}-spending`}
            id="monthly-spending"
            label="Monthly spending (today's USD)"
            suffix="USD"
            value={inputs.monthlySpendingUsd}
            onChange={(next) => patch({ monthlySpendingUsd: next })}
          />

          <NumberField
            key={`${fieldKey}-current-age`}
            id="current-age"
            label="Current age"
            value={inputs.currentAge}
            onChange={(next) => patch({ currentAge: next })}
          />
          <NumberField
            key={`${fieldKey}-retirement-age`}
            id="retirement-age"
            label="Retirement age"
            value={inputs.retirementAge}
            onChange={(next) => patch({ retirementAge: next })}
          />
          <NumberField
            key={`${fieldKey}-contribution-end-age`}
            id="contribution-end-age"
            label={CONTRIBUTION_END_AGE_LABEL}
            hint={GLOSSARY_HINTS.contributionEndAge}
            value={inputs.contributionEndAge}
            onChange={(next) => patch({ contributionEndAge: next })}
          />
          <NumberField
            key={`${fieldKey}-depletion-age`}
            id="depletion-age"
            label={DEPLETION_AGE_LABELS[inputs.withdrawalStrategy]}
            hint={DEPLETION_AGE_HINTS[inputs.withdrawalStrategy]}
            value={inputs.depletionAge}
            onChange={(next) => patch({ depletionAge: next })}
          />
          <NumberField
            key={`${fieldKey}-swr`}
            id="safe-withdrawal-rate"
            label="Safe withdrawal rate"
            hint={SAFE_WITHDRAWAL_RATE_HINTS[inputs.withdrawalStrategy]}
            suffix="%"
            step={0.1}
            // Inert under depletion — the target is the spending annuity, not a
            // withdrawal rate. Disabled, so the stored value is left as it is.
            disabled={
              inputs.withdrawalStrategy === WITHDRAWAL_STRATEGY.depletion
            }
            value={inputs.safeWithdrawalRatePct}
            onChange={(next) => patch({ safeWithdrawalRatePct: next })}
          />

          <div className="grid gap-1.5 sm:col-span-2">
            <HintLabel hint={GLOSSARY_HINTS.withdrawalStrategy}>
              Withdrawal strategy
            </HintLabel>
            <SegmentedControl
              size="sm"
              value={inputs.withdrawalStrategy}
              options={STRATEGY_OPTIONS}
              onChange={(next) => patch({ withdrawalStrategy: next })}
            />
          </div>
        </div>

        {/* Assumptions */}
        <Disclosure
          className="border-t pt-3"
          open={assumptionsOpen}
          onOpenChange={setAssumptionsOpen}
          label="Assumptions"
          contentClassName="space-y-4"
        >
              <div className="space-y-2">
                <HintLabel hint={GLOSSARY_HINTS.expectedReturnBand}>
                  Primary expected return (drives Plan and Coast FIRE)
                </HintLabel>
                <ExpectedReturnFields
                  fieldKey={`${fieldKey}-primary`}
                  idPrefix="primary-return"
                  triple={inputs.primaryExpectedReturn}
                  onChange={patchReturn}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberField
                  key={`${fieldKey}-usd-inflation`}
                  id="usd-inflation"
                  label="USD inflation"
                  hint={GLOSSARY_HINTS.usdInflation}
                  suffix="%"
                  step={0.1}
                  value={inputs.usdInflationPct}
                  onChange={(next) => patch({ usdInflationPct: next })}
                />
                <NumberField
                  key={`${fieldKey}-try-inflation`}
                  id="try-inflation"
                  label="TRY inflation"
                  hint={GLOSSARY_HINTS.tryAssumptions}
                  suffix="%"
                  step={0.5}
                  value={inputs.tryInflationPct}
                  onChange={(next) => patch({ tryInflationPct: next })}
                />
                <NumberField
                  key={`${fieldKey}-try-depreciation`}
                  id="try-depreciation"
                  label="TRY depreciation"
                  hint={GLOSSARY_HINTS.tryAssumptions}
                  suffix="%"
                  step={0.5}
                  value={inputs.tryDepreciationPct}
                  onChange={(next) => patch({ tryDepreciationPct: next })}
                />
              </div>

              <div className="space-y-3">
                <HintLabel hint={GLOSSARY_HINTS.expectedReturn}>
                  Expected return per comparison option (drives Compare)
                </HintLabel>
                {inputs.options.map((option) => (
                  <div key={option.id} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {option.name}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        {option.returnCurrency}
                      </span>
                    </div>
                    <ExpectedReturnFields
                      fieldKey={`${fieldKey}-${option.id}`}
                      idPrefix={`option-${option.id}`}
                      triple={option.expectedReturn}
                      onChange={(partial) =>
                        patchOption(option.id, {
                          expectedReturn: {
                            ...option.expectedReturn,
                            ...partial,
                          },
                        })
                      }
                      extra={
                        option.flatTaxRatePct === undefined ? null : (
                          <NumberField
                            key={`${fieldKey}-${option.id}-tax`}
                            id={`option-${option.id}-tax`}
                            label="Effective tax rate"
                            hint={GLOSSARY_HINTS.retirementTaxEstimate}
                            suffix="%"
                            step={0.5}
                            value={option.flatTaxRatePct}
                            onChange={(next) =>
                              patchOption(option.id, { flatTaxRatePct: next })
                            }
                          />
                        )
                      }
                    />
                  </div>
                ))}
          </div>
        </Disclosure>
        </Disclosure>
      </CardContent>

      <ScenarioNameDialog
        open={nameDialog !== null}
        onOpenChange={(open) => !open && setNameDialog(null)}
        mode={nameDialog ?? "create"}
        initialName={
          nameDialog === "rename"
            ? (activeScenario?.name ?? "")
            : `${activeScenario?.name ?? DEFAULT_SCENARIO_NAME} copy`
        }
        onSubmit={nameDialog === "rename" ? renameActive : createScenario}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeScenario?.name} will be removed. Projections keep running
              from the defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={deleteActive}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function ExpectedReturnFields({
  fieldKey,
  idPrefix,
  triple,
  onChange,
  extra,
}: {
  fieldKey: string
  idPrefix: string
  triple: ExpectedReturnTriple
  onChange: (partial: Partial<ExpectedReturnTriple>) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <NumberField
        key={`${fieldKey}-pessimistic`}
        id={`${idPrefix}-pessimistic`}
        label="Pessimistic"
        suffix="%"
        step={0.5}
        value={triple.pessimistic}
        onChange={(next) => onChange({ pessimistic: next })}
      />
      <NumberField
        key={`${fieldKey}-base`}
        id={`${idPrefix}-base`}
        label="Base"
        suffix="%"
        step={0.5}
        value={triple.base}
        onChange={(next) => onChange({ base: next })}
      />
      <NumberField
        key={`${fieldKey}-optimistic`}
        id={`${idPrefix}-optimistic`}
        label="Optimistic"
        suffix="%"
        step={0.5}
        value={triple.optimistic}
        onChange={(next) => onChange({ optimistic: next })}
      />
      {extra}
    </div>
  )
}
