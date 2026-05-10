import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlatformDot } from "@/components/common/PlatformDot"
import { useHoldings } from "@/hooks/useHoldings"

import type { Asset, Platform } from "@/types/database"

export const EXTERNAL_CASH_VALUE = "__external__"

interface Props {
  value: string | null
  /** Pass null to mean "external cash" (no deduction). */
  onChange: (platformId: string | null) => void
  /** All seeded assets — used to find the fiat asset row for `priceCurrency`. */
  assets: Asset[]
  /** All user platforms. */
  platforms: Platform[]
  /** The buy's price_currency — drives which fiat asset we look up balances for. */
  priceCurrency: string
  /** When editing, the existing child's amount (so we credit it back into the
   *  available figure shown next to the platform). */
  existingChildAmount?: string | null
  /** When editing, the existing child's platform — used with existingChildAmount. */
  existingChildPlatformId?: string | null
}

export function FundingSourceSelect({
  value,
  onChange,
  assets,
  platforms,
  priceCurrency,
  existingChildAmount,
  existingChildPlatformId,
}: Props) {
  const { holdings } = useHoldings()
  const fiatAsset = assets.find(
    (a) => a.category === "fiat" && a.ticker === priceCurrency,
  )

  // Build per-platform balance lookup for the fiat asset.
  const platformBalances = new Map<string, string>()
  if (fiatAsset) {
    for (const h of holdings) {
      if (h.asset_id === fiatAsset.id) {
        platformBalances.set(h.platform_id, String(h.balance ?? "0"))
      }
    }
  }

  const offsetForPlatform = (platformId: string): string => {
    if (
      existingChildPlatformId &&
      existingChildAmount &&
      existingChildPlatformId === platformId
    ) {
      return existingChildAmount
    }
    return "0"
  }

  return (
    <Select
      value={value ?? EXTERNAL_CASH_VALUE}
      onValueChange={(v) => onChange(v === EXTERNAL_CASH_VALUE ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {(value: string) => {
            if (!value) return "Select funding source..."
            if (value === EXTERNAL_CASH_VALUE) return "External cash (no deduction)"
            const p = platforms.find((x) => x.id === value)
            if (!p) return "Select funding source..."
            return (
              <span className="flex items-center gap-2">
                <PlatformDot color={p.color} />
                {p.name}
              </span>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EXTERNAL_CASH_VALUE}>
          External cash (no deduction)
        </SelectItem>
        {platforms.map((p) => {
          const base = platformBalances.get(p.id) ?? "0"
          // For the dropdown's display, show the offset so the user can see
          // the existing child's amount that would be freed if they kept
          // editing on this same platform.
          const offset = offsetForPlatform(p.id)
          return (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <PlatformDot color={p.color} />
                {p.name} — {base} {priceCurrency}
                {offset !== "0" && (
                  <span className="text-xs text-muted-foreground">
                    {" "}(+{offset} from this edit)
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
