import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlatformDot } from "@/components/common/PlatformDot"
import { useHoldings } from "@/hooks/useHoldings"
import { isSettlementStablecoin } from "@/lib/constants/assets"
import { DEFAULT_CURRENCY } from "@/lib/constants/currencies"
import { formatAmount } from "@/lib/prices"
import { bn } from "@/lib/config"

import type { Asset, Platform } from "@/types/database"

export const EXTERNAL_CASH_VALUE = "__external__"

/** A buy's funding source: which platform's holding of which settlement
 *  asset (price-currency fiat, or a settlement stablecoin) gets debited. */
export interface FundingSource {
  platformId: string
  assetId: string
}

const encode = (s: FundingSource) => `${s.platformId}::${s.assetId}`
const decode = (v: string): FundingSource => {
  const [platformId, assetId] = v.split("::")
  return { platformId, assetId }
}

interface Props {
  value: FundingSource | null
  /** Pass null to mean "external cash" (no deduction). */
  onChange: (source: FundingSource | null) => void
  /** All seeded assets — used to find the fiat asset row for `priceCurrency`
   *  and the settlement stablecoins (USDT). */
  assets: Asset[]
  /** All user platforms (for names/colors). */
  platforms: Platform[]
  /** The buy's own platform. Funding is external or **on this platform** —
   *  cross-platform funding was removed 2026-09-01 (never used in practice;
   *  cash on another exchange can't settle a trade on this one). Empty until
   *  the user picks a platform → only "External cash" is offered. */
  platformId: string
  /** The buy's price_currency — drives which fiat asset we look up balances
   *  for; stablecoin options appear only for USD-priced buys. */
  priceCurrency: string
  /** When editing, the existing child's amount (so we credit it back into the
   *  available figure shown next to the platform). */
  existingChildAmount?: string | null
  /** When editing, the existing child's platform + asset — the offset applies
   *  only to that same funding lens. */
  existingChildPlatformId?: string | null
  existingChildAssetId?: string | null
}

export function FundingSourceSelect({
  value,
  onChange,
  assets,
  platforms,
  platformId,
  priceCurrency,
  existingChildAmount,
  existingChildPlatformId,
  existingChildAssetId,
}: Props) {
  const { holdings } = useHoldings()
  const fiatAsset = assets.find(
    (a) => a.category === "fiat" && a.ticker === priceCurrency,
  )
  // Settlement stablecoins are USD-pegged, so they can only fund USD-priced buys.
  const stablecoinAssets =
    priceCurrency === DEFAULT_CURRENCY
      ? assets.filter((a) => isSettlementStablecoin(a))
      : []

  const balanceFor = (assetId: string, platformId: string): string => {
    const h = holdings.find(
      (x) => x.asset_id === assetId && x.platform_id === platformId,
    )
    return String(h?.balance ?? "0")
  }

  const offsetFor = (source: FundingSource): string => {
    if (
      existingChildPlatformId === source.platformId &&
      existingChildAssetId === source.assetId &&
      existingChildAmount
    ) {
      return existingChildAmount
    }
    return "0"
  }

  interface Option {
    source: FundingSource
    ticker: string
    category: string
  }

  // Options exist only for the trade's own platform: its fiat cash, plus a
  // stablecoin option per coin with a positive balance there. A legacy edit
  // whose child sits elsewhere still shows that lens so the form tells the
  // truth (zero such rows in practice — guarded, not offered).
  const fiatOptions: Option[] = []
  const coinOptions: Option[] = []
  if (platformId && fiatAsset) {
    fiatOptions.push({
      source: { platformId, assetId: fiatAsset.id },
      ticker: priceCurrency,
      category: fiatAsset.category,
    })
  }
  if (platformId) {
    for (const sc of stablecoinAssets) {
      const editLens =
        existingChildPlatformId === platformId && existingChildAssetId === sc.id
      if (bn(balanceFor(sc.id, platformId)).gt(0) || editLens) {
        coinOptions.push({
          source: { platformId, assetId: sc.id },
          ticker: sc.ticker,
          category: sc.category,
        })
      }
    }
  }
  if (
    existingChildPlatformId &&
    existingChildAssetId &&
    existingChildPlatformId !== platformId
  ) {
    const legacyAsset = assets.find((a) => a.id === existingChildAssetId)
    if (legacyAsset) {
      const opt: Option = {
        source: {
          platformId: existingChildPlatformId,
          assetId: existingChildAssetId,
        },
        ticker: legacyAsset.ticker,
        category: legacyAsset.category,
      }
      ;(legacyAsset.category === "fiat" ? fiatOptions : coinOptions).push(opt)
    }
  }

  const renderOption = ({ source, ticker, category }: Option) => {
    const p = platforms.find((x) => x.id === source.platformId)
    if (!p) return null
    const base = formatAmount(
      bn(balanceFor(source.assetId, source.platformId)).toNumber(),
      category,
    )
    // For the dropdown's display, show the offset so the user can see the
    // existing child's amount that would be freed if they kept editing on
    // this same funding lens.
    const offset = offsetFor(source)
    return (
      <SelectItem key={encode(source)} value={encode(source)}>
        <span className="flex items-center gap-2">
          <PlatformDot color={p.color} />
          {p.name} — {base} {ticker}
          {offset !== "0" && (
            <span className="text-xs text-muted-foreground">
              {" "}(+{offset} from this edit)
            </span>
          )}
        </span>
      </SelectItem>
    )
  }

  return (
    <Select
      value={value ? encode(value) : EXTERNAL_CASH_VALUE}
      onValueChange={(v) =>
        onChange(!v || v === EXTERNAL_CASH_VALUE ? null : decode(v))
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {(v: string) => {
            if (!v) return "Select funding source..."
            if (v === EXTERNAL_CASH_VALUE) return "External cash (no deduction)"
            const s = decode(v)
            const p = platforms.find((x) => x.id === s.platformId)
            if (!p) return "Select funding source..."
            // Resolve from the catalog, not the (balance-filtered) option
            // list — a selection must never be relabeled by a refresh.
            const ticker =
              assets.find((a) => a.id === s.assetId)?.ticker ?? priceCurrency
            return (
              <span className="flex items-center gap-2">
                <PlatformDot color={p.color} />
                {p.name} — {ticker}
              </span>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EXTERNAL_CASH_VALUE}>
          External cash (no deduction)
        </SelectItem>
        {fiatOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel>Cash</SelectLabel>
            {fiatOptions.map(renderOption)}
          </SelectGroup>
        )}
        {coinOptions.length > 0 && (
          <SelectGroup>
            <SelectLabel>Stablecoin</SelectLabel>
            {coinOptions.map(renderOption)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
