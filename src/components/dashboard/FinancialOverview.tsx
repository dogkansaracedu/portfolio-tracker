import { ArrowRight, CarFront, PiggyBank, WalletCards } from "lucide-react"
import { Link } from "react-router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useBudget } from "@/hooks/useBudget"
import { usePlanTracking } from "@/hooks/usePlanTracking"
import { useRetirementScenarios } from "@/hooks/useRetirementScenarios"
import { useVehicleAlerts } from "@/hooks/useVehicle"
import { bn } from "@/lib/config"
import { formatPlanDay } from "@/components/retirement/display"
import { formatCurrency, obfuscate } from "@/lib/prices"

interface FinancialOverviewProps {
  liveValueUsd: number
}

interface OverviewItemProps {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
  tone?: string
}

function OverviewItem({
  to,
  icon: Icon,
  label,
  value,
  detail,
  tone = "text-foreground",
}: OverviewItemProps) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 snap-start items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`${label}: ${value}. ${detail}`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className={`block truncate text-base font-semibold ${tone}`}>
          {value}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export default function FinancialOverview({
  liveValueUsd,
}: FinancialOverviewProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const { rows, currentMonth, loading: budgetLoading } = useBudget()
  const { defaultScenario, loading: retirementLoading } =
    useRetirementScenarios()
  const { overdue, dueSoon } = useVehicleAlerts()

  const currentBudget = rows.find((row) => row.month === currentMonth) ?? null
  const planStart = defaultScenario?.plan_start ?? null
  const tracking = usePlanTracking(planStart, bn(liveValueUsd), !!planStart)

  const money = (usd: number, tryValue: number) =>
    obfuscate(
      formatCurrency(currency === "USD" ? usd : tryValue, currency),
      obfuscated,
    )

  let budgetValue = "Set monthly income"
  let budgetDetail = "Complete this month's plan"
  if (budgetLoading) {
    budgetValue = "Loading…"
    budgetDetail = "Calculating this month"
  } else if (currentBudget) {
    budgetValue = currentBudget.savingsRatePct
      ? `${currentBudget.savingsRatePct.toFixed(0)}% savings rate`
      : "Income needed"
    budgetDetail = `${money(
      currentBudget.investedUsd.toNumber(),
      currentBudget.investedTry.toNumber(),
    )} invested this month`
  }

  let retirementValue = "Create a retirement plan"
  let retirementDetail = "Turn your portfolio into a target"
  let retirementTone = "text-foreground"
  if (retirementLoading) {
    retirementValue = "Loading…"
    retirementDetail = "Checking your plan"
  } else if (defaultScenario && !planStart) {
    retirementValue = "Plan not started"
    retirementDetail = `Scenario: ${defaultScenario.name}`
  } else if (defaultScenario && planStart && tracking) {
    const gap = tracking.valueGapUsd.toNumber()
    const amount = obfuscate(formatCurrency(Math.abs(gap), "USD"), obfuscated)
    retirementValue =
      Math.abs(gap) < 0.005
        ? "On plan"
        : gap > 0
          ? `Behind by ${amount}`
          : `Ahead by ${amount}`
    retirementDetail = `Started ${formatPlanDay(planStart.startedAt)} · retire at ${planStart.inputs.retirementAge}`
    retirementTone =
      Math.abs(gap) < 0.005
        ? "text-foreground"
        : gap > 0
          ? "text-red-500"
          : "text-emerald-600"
  }

  const dueCount = overdue.length + dueSoon.length
  const vehicleValue =
    overdue.length > 0
      ? `${overdue.length} maintenance ${overdue.length === 1 ? "item" : "items"} overdue`
      : dueSoon.length > 0
        ? `${dueSoon.length} due soon`
        : "Maintenance on track"
  const vehicleDetail =
    dueCount > 0
      ? "Review the maintenance schedule"
      : "No urgent vehicle tasks"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan &amp; progress</CardTitle>
        <CardDescription>
          The decisions beyond today's portfolio value.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid snap-x snap-mandatory grid-flow-col auto-cols-[88%] gap-2 overflow-x-auto pb-1 md:grid-flow-row md:auto-cols-auto md:grid-cols-3 md:overflow-visible md:pb-0">
        <OverviewItem
          to="/budget"
          icon={WalletCards}
          label="This month"
          value={budgetValue}
          detail={budgetDetail}
        />
        <OverviewItem
          to="/retirement"
          icon={PiggyBank}
          label="Retirement"
          value={retirementValue}
          detail={retirementDetail}
          tone={retirementTone}
        />
        <OverviewItem
          to="/vehicle"
          icon={CarFront}
          label="Vehicle"
          value={vehicleValue}
          detail={vehicleDetail}
          tone={overdue.length > 0 ? "text-red-500" : "text-foreground"}
        />
      </CardContent>
    </Card>
  )
}
