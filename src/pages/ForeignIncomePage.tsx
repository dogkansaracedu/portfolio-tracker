import { CircleAlert, RefreshCw } from "lucide-react"
import { useSearchParams } from "react-router"
import { PageHeading } from "@/components/common/PageHeading"
import { IncomeLedger } from "@/components/foreign-income/IncomeLedger"
import { ReconciliationForm } from "@/components/foreign-income/ReconciliationForm"
import { ReconciliationHistory } from "@/components/foreign-income/ReconciliationHistory"
import { ReconciliationSummary } from "@/components/foreign-income/ReconciliationSummary"
import { SourceBreakdown } from "@/components/foreign-income/SourceBreakdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAssets } from "@/hooks/useAssets"
import { useForeignIncomeReconciliation } from "@/hooks/useForeignIncomeReconciliation"
import { useForeignIncomeForYear } from "@/hooks/useForeignIncomeYtd"
import { usePlatforms } from "@/hooks/usePlatforms"
import { homeDayIso } from "@/lib/config"

function selectedTaxYear(value: string | null) {
  const currentYear = Number(homeDayIso().slice(0, 4))
  if (!value) return currentYear
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : currentYear
}

/** Read-only transaction audit plus immutable external comparison history. */
export default function ForeignIncomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const year = selectedTaxYear(searchParams.get("year"))
  const {
    ytdTry,
    threshold,
    entries,
    fingerprint,
    availableYears,
    loading: incomeLoading,
    error: incomeError,
    retry: retryIncome,
  } = useForeignIncomeForYear(year)
  const { assets } = useAssets()
  const {
    platforms,
    error: platformsError,
    refetch: retryPlatforms,
  } = usePlatforms()
  const {
    reconciliation,
    reconciliations,
    loading: reconciliationLoading,
    saving,
    loadError,
    saveError,
    retry: retryReconciliation,
    save,
  } = useForeignIncomeReconciliation(year)
  const loading = incomeLoading || reconciliationLoading
  const blockingError = incomeError ?? platformsError ?? loadError
  const yearOptions = [...new Set([...availableYears, year])].sort(
    (a, b) => b - a,
  )

  function setYear(value: string | null) {
    if (!value) return
    const next = new URLSearchParams(searchParams)
    next.set("year", value)
    setSearchParams(next, { replace: true })
  }

  async function retry() {
    await Promise.allSettled([
      retryIncome(),
      retryPlatforms(),
      retryReconciliation(),
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <PageHeading
          title="Foreign income reconciliation"
          subtitle={`Compare ${year} foreign dividends and interest with your statement or tax worksheet.`}
        />
        <div className="ml-auto space-y-1">
          <label
            htmlFor="foreign-income-tax-year"
            className="block text-xs font-medium text-muted-foreground"
          >
            Tax year
          </label>
          <Select value={String(year)} onValueChange={setYear}>
            <SelectTrigger
              id="foreign-income-tax-year"
              className="h-10 min-w-28"
              aria-label="Tax year"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : blockingError ? (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <CircleAlert className="size-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">The comparison could not be verified</p>
              <p className="text-sm text-muted-foreground">{blockingError}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saving is disabled until transactions, exchange rates, assets,
                platforms, and prior comparisons load successfully.
              </p>
            </div>
            <Button variant="outline" onClick={() => void retry()}>
              <RefreshCw />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ReconciliationSummary
            year={year}
            recordedTry={ytdTry}
            fingerprint={fingerprint}
            paymentCount={entries.length}
            reconciliation={reconciliation}
          />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
            <SourceBreakdown
              entries={entries}
              platforms={platforms}
              year={year}
            />
            <ReconciliationForm
              key={reconciliation?.id ?? `${year}-new`}
              reconciliation={reconciliation}
              recordedTry={ytdTry}
              recordedFingerprint={fingerprint}
              saving={saving}
              error={saveError}
              save={save}
            />
          </div>

          <IncomeLedger
            entries={entries}
            assets={assets}
            platforms={platforms}
            year={year}
            thresholdTry={threshold}
          />

          <ReconciliationHistory reconciliations={reconciliations} />
        </>
      )}
    </div>
  )
}
