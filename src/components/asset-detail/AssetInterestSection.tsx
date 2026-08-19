import { useMemo, useState } from "react"
import { Link } from "react-router"
import { ArrowRight, Percent, Plus } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { InterestPositionForm } from "@/components/interest/InterestPositionForm"
import {
  expiryPhrase,
  formatInterestDay,
  formatPositionRate,
  statusLabel,
} from "@/components/interest/display"
import { useCampaignsContext } from "@/contexts/CampaignsContext"
import { useInterestContext } from "@/contexts/InterestContext"
import { usePlatformsContext } from "@/contexts/PlatformsContext"
import { usePricesContext } from "@/contexts/PricesContext"
import { isExpired } from "@/lib/campaigns"
import { homeDayIso } from "@/lib/config"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import {
  INTEREST_COPY,
  INTEREST_ROUTE,
  INTEREST_STATUS_CLASSES,
} from "@/lib/constants/interest"
import {
  estimatePositionTermUsd,
  estimatePositionYearlyUsd,
  positionStatus,
  sortPositions,
} from "@/lib/interest"
import { formatAmount, formatCurrency } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type { Asset, InterestPosition } from "@/types/database"

/**
 * The management home for interest positions (Component 16, surface 2): every
 * open position on this asset, add / edit / close / delete, the closed history
 * behind a toggle, and a cross-link when the latest campaign research still has
 * live offers for this ticker.
 *
 * Nothing here writes a transaction or touches a holding — the estimates are
 * display-time projections off the cached price and the recorded rate.
 */
export function AssetInterestSection({ asset }: { asset: Asset }) {
  const { positions, error, closePosition, deletePosition } =
    useInterestContext()
  const { platforms } = usePlatformsContext()
  const { prices } = usePricesContext()
  const { campaigns } = useCampaignsContext()

  const [showClosed, setShowClosed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InterestPosition | null>(null)
  const [deleting, setDeleting] = useState<InterestPosition | null>(null)

  const today = homeDayIso()
  const priceUsd = prices[asset.price_id ?? asset.ticker]?.price_usd ?? null

  const mine = useMemo(
    () => positions.filter((p) => p.asset_id === asset.id),
    [positions, asset.id],
  )
  const open = useMemo(
    () => sortPositions(mine.filter((p) => !p.is_closed), today),
    [mine, today],
  )
  const closed = useMemo(
    () => sortPositions(mine.filter((p) => p.is_closed), today),
    [mine, today],
  )

  // "There are live offers for this ticker" — read-only, by ticker string:
  // campaign tickers are free text from research and may not be in the catalog.
  const liveCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          c.asset_ticker.toUpperCase() === asset.ticker.toUpperCase() &&
          !isExpired(c, today),
      ).length,
    [campaigns, asset.ticker, today],
  )

  const platformName = (id: string) =>
    platforms.find((p) => p.id === id)?.name ?? "—"

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(position: InterestPosition) {
    setEditing(position)
    setDialogOpen(true)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {INTEREST_COPY.sectionTitle}
          </h2>
          <p className="text-sm text-muted-foreground">
            {INTEREST_COPY.sectionDescription}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus className="size-3.5" />
          {INTEREST_COPY.addPosition}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {INTEREST_COPY.loadFailedPrefix}: {error}
        </p>
      )}

      {liveCampaigns > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Percent className="size-3.5" />
          {INTEREST_COPY.campaignLinkPrefix} {asset.ticker} ({liveCampaigns}).
          <Link
            to={INTEREST_ROUTE.campaigns}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {INTEREST_COPY.campaignLinkAction}
            <ArrowRight className="size-3" />
          </Link>
        </p>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {INTEREST_COPY.emptyText}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {open.map((position) => (
            <PositionCard
              key={position.id}
              position={position}
              asset={asset}
              platformName={platformName(position.platform_id)}
              priceUsd={priceUsd}
              today={today}
              onEdit={() => openEdit(position)}
              onClose={() => void closePosition(position.id)}
              onDelete={() => setDeleting(position)}
            />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowClosed((v) => !v)}
        >
          {showClosed
            ? INTEREST_COPY.hideClosed
            : `${INTEREST_COPY.showClosedPrefix} ${closed.length} ${INTEREST_COPY.showClosedSuffix}`}
        </Button>
      )}

      {showClosed && closed.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {closed.map((position) => (
            <PositionCard
              key={position.id}
              position={position}
              asset={asset}
              platformName={platformName(position.platform_id)}
              priceUsd={priceUsd}
              today={today}
              onEdit={() => openEdit(position)}
              onClose={() => void closePosition(position.id, false)}
              onDelete={() => setDeleting(position)}
            />
          ))}
        </div>
      )}

      <InterestPositionForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={editing}
        prefill={{ assetId: asset.id }}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{INTEREST_COPY.delete}</AlertDialogTitle>
            <AlertDialogDescription>
              {INTEREST_COPY.deleteConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{INTEREST_COPY.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void deletePosition(deleting.id)
                setDeleting(null)
              }}
            >
              {INTEREST_COPY.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

interface PositionCardProps {
  position: InterestPosition
  asset: Asset
  platformName: string
  priceUsd: number | null
  today: string
  onEdit: () => void
  onClose: () => void
  onDelete: () => void
}

function PositionCard({
  position,
  asset,
  platformName,
  priceUsd,
  today,
  onEdit,
  onClose,
  onDelete,
}: PositionCardProps) {
  const status = positionStatus(position, today)
  const rate = formatPositionRate(position)
  const yearly = estimatePositionYearlyUsd(position, priceUsd)
  const term = estimatePositionTermUsd(position, priceUsd)

  return (
    <Card size="sm" className={cn("h-full", position.is_closed && "opacity-60")}>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {position.label ?? platformName}
            </div>
            <div className="text-xs text-muted-foreground">
              {INTEREST_COPY.quantityLabel}{" "}
              <span className="tabular-nums">
                {formatAmount(position.quantity, asset.category)}{" "}
                {asset.ticker}
              </span>{" "}
              {INTEREST_COPY.platformLabel} {platformName}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium",
              INTEREST_STATUS_CLASSES[status],
            )}
          >
            {position.is_closed
              ? INTEREST_COPY.closedBadge
              : statusLabel(status)}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold tabular-nums">
            {rate ?? (
              <span className="text-xs font-normal text-muted-foreground">
                {INTEREST_COPY.noRate}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatInterestDay(position.started_at)}
            {position.expires_at
              ? `${INTEREST_COPY.termSeparator}${formatInterestDay(position.expires_at)} · ${expiryPhrase(position, today)}`
              : ` · ${INTEREST_COPY.termFlexible}`}
          </span>
        </div>

        {yearly && (
          <div className="text-sm">
            {/* Term payout leads when a term exists — it's the decision number;
                the annualized rate is context. Flexible falls back to /yr. */}
            <span className="font-semibold tabular-nums">
              {INTEREST_COPY.estimatePrefix}
              {formatCurrency((term ?? yearly).toNumber(), DEFAULT_CURRENCY)}
              {term ? INTEREST_COPY.estimateTermSuffix : INTEREST_COPY.estimateYearSuffix}
            </span>
            {term && (
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {formatCurrency(yearly.toNumber(), DEFAULT_CURRENCY)}
                {INTEREST_COPY.estimateYearSuffix}
              </span>
            )}
          </div>
        )}

        {position.note && (
          <p className="text-xs text-muted-foreground">{position.note}</p>
        )}

        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="xs" onClick={onEdit}>
            {INTEREST_COPY.edit}
          </Button>
          <Button variant="ghost" size="xs" onClick={onClose}>
            {position.is_closed ? INTEREST_COPY.reopen : INTEREST_COPY.close}
          </Button>
          <Button variant="ghost" size="xs" onClick={onDelete}>
            {INTEREST_COPY.delete}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
