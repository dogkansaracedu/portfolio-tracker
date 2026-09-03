import { useMemo, useState } from "react"
import type BigNumber from "bignumber.js"
import {
  BookmarkPlus,
  CalendarClock,
  ExternalLink,
  Lock,
  TriangleAlert,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { InterestPositionForm } from "@/components/interest/InterestPositionForm"
import { useCampaignsContext } from "@/contexts/CampaignsContext"
import { useHoldingsContext } from "@/contexts/HoldingsContext"
import { usePlatformsContext } from "@/contexts/PlatformsContext"
import { usePricesContext } from "@/contexts/PricesContext"
import {
  estimateYearlyUsd,
  formatApr,
  groupCampaigns,
  isDeadlineSoon,
  isExpired,
  isRunStale,
  partitionExpired,
} from "@/lib/campaigns"
import { bn, homeDayIso } from "@/lib/config"
import {
  CAMPAIGN_COPY,
  ENDS_SOON_TONE_CLASS,
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  PROGRAM_TYPE_LABELS,
} from "@/lib/constants/campaigns"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import { INTEREST_COPY } from "@/lib/constants/interest"
import { buildPositionPrefill, type PositionPrefill } from "@/lib/interest"
import { formatCryptoAmount, formatCurrency } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/types/database"

/**
 * Component 15 — Campaigns. A recommendation surface, not a trading one: the
 * rows are claims a weekly research pass found on the public web, so every card
 * carries its source and found-on date, and the header says how old the batch
 * is. Rates are deliberately styled neutral — an APR is not a gain, so the
 * gain/loss palette stays out of this page.
 */

/** What a held-coin card needs to show its personal estimate. */
interface HeldPosition {
  qty: BigNumber
  priceUsd: number | null
  ticker: string
}

/** "Aug 17, 2026" from a `YYYY-MM-DD` day or a full timestamp. */
function formatDay(value: string): string {
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function CampaignsPage() {
  const { run, campaigns, loading, error } = useCampaignsContext()
  const { holdings } = useHoldingsContext()
  const { platforms } = usePlatformsContext()
  const { prices } = usePricesContext()
  const [showExpired, setShowExpired] = useState(false)
  const [assetFilter, setAssetFilter] = useState("")
  // Doubles as "the track dialog is open" and "what to prefill it with". This
  // page only *captures* positions (Component 16, surface 3) — it never lists
  // or manages them; that lives on the asset's own page.
  const [trackPrefill, setTrackPrefill] = useState<PositionPrefill | null>(null)

  const today = homeDayIso()

  // One entry per ticker the user actually holds, quantity summed across
  // platforms and priced from the shared cache. Campaign tickers are free text,
  // so the join is by upper-cased ticker string — never by asset id.
  const heldByTicker = useMemo(() => {
    const map = new Map<string, HeldPosition>()
    for (const holding of holdings) {
      const balance = bn(holding.balance)
      if (!balance.isGreaterThan(0)) continue
      const ticker = holding.assets.ticker.toUpperCase()
      const priceUsd =
        prices[holding.assets.price_id ?? holding.assets.ticker]?.price_usd ??
        null
      const existing = map.get(ticker)
      map.set(ticker, {
        ticker,
        qty: existing ? existing.qty.plus(balance) : balance,
        priceUsd: existing?.priceUsd ?? priceUsd,
      })
    }
    return map
  }, [holdings, prices])

  const { active, expired } = useMemo(
    () => partitionExpired(campaigns, today),
    [campaigns, today],
  )

  const query = assetFilter.trim().toUpperCase()
  const visibleAll = showExpired ? campaigns : active
  const visible = query
    ? visibleAll.filter((c) => c.asset_ticker.toUpperCase().includes(query))
    : visibleAll

  const groups = useMemo(() => {
    const heldTickers = new Set(heldByTicker.keys())
    const estimateFor = (campaign: Campaign) => {
      const position = heldByTicker.get(campaign.asset_ticker.toUpperCase())
      if (!position) return null
      return estimateYearlyUsd(position.qty, position.priceUsd, campaign.apr)
    }
    return groupCampaigns(visible, heldTickers, estimateFor)
  }, [visible, heldByTicker])

  const stale = isRunStale(run?.ran_at)

  const onTrack = (campaign: Campaign) =>
    setTrackPrefill(buildPositionPrefill(campaign, platforms, today))

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeading />
        <div className="flex items-center gap-2">
          {run && (
            <span className="text-xs text-muted-foreground">
              {CAMPAIGN_COPY.lastRefreshedPrefix} {formatDay(run.ran_at)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {CAMPAIGN_COPY.loadFailedPrefix}: {error}
        </p>
      )}

      {!run ? (
        <Card>
          <CardHeader>
            <CardTitle>{CAMPAIGN_COPY.empty}</CardTitle>
            <CardDescription>{CAMPAIGN_COPY.emptyHint}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {stale && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{CAMPAIGN_COPY.stale}</span>
            </div>
          )}

          {run.summary && (
            <Card size="sm">
              <CardContent className="text-sm whitespace-pre-line text-muted-foreground">
                {run.summary}
              </CardContent>
            </Card>
          )}

          <Input
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            placeholder={CAMPAIGN_COPY.assetFilterPlaceholder}
            className="max-w-xs"
            aria-label={CAMPAIGN_COPY.assetFilterPlaceholder}
          />

          <CampaignGroup
            title={CAMPAIGN_COPY.groups.held.title}
            description={CAMPAIGN_COPY.groups.held.description}
            emptyText={CAMPAIGN_COPY.groups.held.emptyText}
            campaigns={groups.held}
            today={today}
            heldByTicker={heldByTicker}
            onTrack={onTrack}
          />
          <CampaignGroup
            title={CAMPAIGN_COPY.groups.stablecoin.title}
            description={CAMPAIGN_COPY.groups.stablecoin.description}
            emptyText={CAMPAIGN_COPY.groups.stablecoin.emptyText}
            campaigns={groups.stablecoin}
            today={today}
            onTrack={onTrack}
          />
          <CampaignGroup
            title={CAMPAIGN_COPY.groups.considering.title}
            description={CAMPAIGN_COPY.groups.considering.description}
            emptyText={CAMPAIGN_COPY.groups.considering.emptyText}
            campaigns={groups.considering}
            today={today}
            onTrack={onTrack}
          />

          {expired.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExpired((prev) => !prev)}
            >
              {showExpired
                ? CAMPAIGN_COPY.hideExpired
                : `${CAMPAIGN_COPY.showExpiredPrefix} ${expired.length} ${CAMPAIGN_COPY.showExpiredSuffix}`}
            </Button>
          )}
        </>
      )}

      <InterestPositionForm
        open={trackPrefill !== null}
        onOpenChange={(open) => {
          if (!open) setTrackPrefill(null)
        }}
        prefill={trackPrefill ?? undefined}
      />
    </div>
  )
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-2xl font-bold">{CAMPAIGN_COPY.pageTitle}</h1>
      <p className="text-muted-foreground">{CAMPAIGN_COPY.pageSubtitle}</p>
    </div>
  )
}

interface CampaignGroupProps {
  title: string
  description: string
  emptyText: string
  campaigns: Campaign[]
  today: string
  /** Only bucket 1 personalizes; the other groups pass nothing. */
  heldByTicker?: Map<string, HeldPosition>
  onTrack: (campaign: Campaign) => void
}

function CampaignGroup({
  title,
  description,
  emptyText,
  campaigns,
  today,
  heldByTicker,
  onTrack,
}: CampaignGroupProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">
          {title}
          {campaigns.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {campaigns.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              today={today}
              position={heldByTicker?.get(campaign.asset_ticker.toUpperCase())}
              onTrack={onTrack}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface CampaignCardProps {
  campaign: Campaign
  today: string
  position?: HeldPosition
  onTrack: (campaign: Campaign) => void
}

function CampaignCard({
  campaign,
  today,
  position,
  onTrack,
}: CampaignCardProps) {
  const apr = formatApr(campaign.apr, campaign.apr_kind)
  const expired = isExpired(campaign, today)
  const endsSoon = !expired && isDeadlineSoon(campaign, today)

  const estimate = position
    ? estimateYearlyUsd(position.qty, position.priceUsd, campaign.apr)
    : null

  const terms: string[] = [
    campaign.lock_days
      ? `${CAMPAIGN_COPY.lockLabel} ${campaign.lock_days}${CAMPAIGN_COPY.lockDaysSuffix}`
      : CAMPAIGN_COPY.lockFlexible,
  ]
  if (campaign.min_amount !== null) {
    terms.push(
      `${CAMPAIGN_COPY.minLabel} ${formatAmountWithUnit(campaign.min_amount, campaign.amount_currency)}`,
    )
  }
  if (campaign.max_amount !== null) {
    terms.push(
      `${CAMPAIGN_COPY.maxLabel} ${formatAmountWithUnit(campaign.max_amount, campaign.amount_currency)}`,
    )
  }

  return (
    <Card size="sm" className={cn("h-full", expired && "opacity-60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <span className="font-mono">{campaign.asset_ticker}</span>
          <span className="text-muted-foreground">·</span>
          <span className="truncate font-normal">{campaign.platform}</span>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {PROGRAM_TYPE_LABELS[campaign.program_type]}
          </Badge>
          {endsSoon && (
            <Badge variant="outline" className={ENDS_SOON_TONE_CLASS}>
              {CAMPAIGN_COPY.endsSoon}
            </Badge>
          )}
          {expired && <Badge variant="ghost">{CAMPAIGN_COPY.expired}</Badge>}
        </CardDescription>
        <CardAction>
          <span className="text-sm font-semibold tabular-nums">
            {apr ?? (
              <span className="text-xs font-normal text-muted-foreground">
                {CAMPAIGN_COPY.noRate}
              </span>
            )}
          </span>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-2">
        {estimate && position && (
          <div className="text-sm">
            <span className="font-semibold tabular-nums">
              {CAMPAIGN_COPY.estimatePrefix}
              {formatCurrency(estimate.toNumber(), DEFAULT_CURRENCY)}
              {CAMPAIGN_COPY.estimateSuffix}
            </span>{" "}
            <span className="text-xs text-muted-foreground">
              {CAMPAIGN_COPY.estimateBasisPrefix}
              {formatCryptoAmount(position.qty.toNumber())} {position.ticker}
            </span>
          </div>
        )}

        {campaign.reward_description && (
          <p className="text-sm text-muted-foreground">
            {campaign.reward_description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          {terms.join(" · ")}
        </div>

        {campaign.deadline && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3" />
            {CAMPAIGN_COPY.deadlineLabel} {formatDay(campaign.deadline)}
          </div>
        )}

        {campaign.conditions && (
          <p className="text-xs text-muted-foreground">
            {CAMPAIGN_COPY.conditionsLabel}: {campaign.conditions}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex-col items-start gap-1 text-xs text-muted-foreground">
        <div className="flex w-full items-center justify-between gap-2">
          <a
            href={campaign.source_url}
            target={EXTERNAL_LINK_TARGET}
            rel={EXTERNAL_LINK_REL}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline max-sm:min-h-10"
          >
            {CAMPAIGN_COPY.sourceLabel}
            <ExternalLink className="size-3" />
          </a>
          {/* Capture only: this opens the shared add-dialog prefilled from the
              card. Managing the position afterwards happens on the asset. */}
          <Button
            variant="outline"
            size="xs"
            aria-label={INTEREST_COPY.trackAria}
            onClick={() => onTrack(campaign)}
            className="max-sm:min-h-10"
          >
            <BookmarkPlus className="size-3" />
            {INTEREST_COPY.track}
          </Button>
        </div>
        <span>
          {CAMPAIGN_COPY.foundOnPrefix}
          {formatDay(campaign.fetched_at)}
          {CAMPAIGN_COPY.verifySuffix}
        </span>
      </CardFooter>
    </Card>
  )
}

/** "100 USDT" — the unit is free text from research, so it may be absent. */
function formatAmountWithUnit(amount: number, unit: string | null): string {
  const formatted = formatCryptoAmount(amount)
  return unit ? `${formatted} ${unit}` : formatted
}
