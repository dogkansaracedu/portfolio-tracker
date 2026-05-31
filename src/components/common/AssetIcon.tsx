import { useState } from "react"
import {
  getAssetIconCandidates,
  monogramFor,
  type IconableAsset,
} from "@/lib/assetIcons"
import {
  ASSET_ICON_SIZE_CLASS,
  type AssetIconSize,
} from "@/lib/constants/assetIcons"
import { cn } from "@/lib/utils"

interface Props {
  asset: IconableAsset
  size?: AssetIconSize
  className?: string
}

/** Circular asset logo. Resolves a deterministic candidate chain (manual
 *  override → exchange logo repos) and renders the first image that loads;
 *  when every candidate 404s/errors it falls back to a colored monogram.
 *  Decorative — the adjacent ticker text carries the meaning. */
export function AssetIcon({ asset, size = "sm", className }: Props) {
  const candidates = getAssetIconCandidates(asset)
  // Track failures by URL (not index) so the component stays correct even when
  // a list re-renders and reuses this instance for a different asset.
  const [failed, setFailed] = useState<Set<string>>(() => new Set())

  const url = candidates.find((c) => !failed.has(c))
  const sizeClass = ASSET_ICON_SIZE_CLASS[size]

  if (!url) {
    const { initials, bgColor } = monogramFor(asset)
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-white",
          size === "sm" ? "text-[9px]" : "text-[11px]",
          sizeClass,
          className,
        )}
        style={{ backgroundColor: bgColor }}
      >
        {initials}
      </span>
    )
  }

  return (
    <img
      key={url}
      src={url}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed((prev) => new Set(prev).add(url))}
      className={cn(
        "inline-block shrink-0 rounded-full bg-white object-contain",
        sizeClass,
        className,
      )}
    />
  )
}
