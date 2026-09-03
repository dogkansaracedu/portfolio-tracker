import type { Asset, PriceCache } from "@/types/database";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/prices";
import { assetNativeCurrency } from "@/lib/constants/assets";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, EyeOff } from "lucide-react";
import { AssetIcon } from "@/components/common/AssetIcon";
import { CATEGORY_LABELS } from "@/lib/constants/assets"


interface AssetRowProps {
  asset: Asset;
  prices: Record<string, PriceCache>;
  canManage: boolean;
  onEdit: (asset: Asset) => void;
  onDeactivate: (asset: Asset) => void;
}

/** The price a row/card shows, and its optional USD equivalent. One derivation
 *  for both layouts. */
function derivePrice(asset: Asset, prices: Record<string, PriceCache>) {
  const price = prices[asset.price_id ?? asset.ticker];
  // Native currency comes from what the asset IS (its category/ticker), not
  // from which price_cache columns are filled — the edge function back-fills
  // both price_usd and price_try for every asset.
  const native = assetNativeCurrency(asset);
  // A fiat asset is worth 1 unit of itself; everything else reads the column
  // matching its native currency, falling back to the other.
  const priceValue =
    asset.category === 'fiat'
      ? 1
      : native === 'TRY'
        ? (price?.price_try ?? price?.price_usd)
        : (price?.price_usd ?? price?.price_try);
  // USD estimate shown beside non-USD prices (cache already stores price_usd).
  const usdEstimate = native === 'USD' ? null : (price?.price_usd ?? null);
  return { native, priceValue, usdEstimate };
}

function AssetPrice({
  native,
  priceValue,
  usdEstimate,
}: ReturnType<typeof derivePrice>) {
  if (!priceValue) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <p className="text-sm">
      {formatCurrency(priceValue, native)}
      {usdEstimate !== null && (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (~{formatCurrency(usdEstimate, "USD")})
        </span>
      )}
    </p>
  );
}

function AssetTags({ asset }: { asset: Asset }) {
  const tags = asset.tags ?? [];
  if (tags.length === 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <>
      {tags.map((tag) => (
        <Badge key={tag} variant="outline" className="text-[10px]">
          {tag}
        </Badge>
      ))}
    </>
  );
}

function AssetActions({
  asset,
  canManage,
  onEdit,
  onDeactivate,
}: Omit<AssetRowProps, "prices">) {
  if (!canManage || !asset.is_active || asset.is_currency) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="max-sm:size-10">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(asset)}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDeactivate(asset)}
        >
          <EyeOff className="size-4" />
          Deactivate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone layout of a catalog asset — the card idiom the Transactions log
 *  already uses, with the actions menu in the card's header so it never falls
 *  off the side of a table. */
export function AssetRowCard({
  asset,
  prices,
  canManage,
  onEdit,
  onDeactivate,
}: AssetRowProps) {
  const derived = derivePrice(asset, prices);

  return (
    <Card size="sm" className={!asset.is_active ? "opacity-50" : ""}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <AssetIcon asset={asset} size="md" />
            <div className="min-w-0">
              <p className="truncate font-medium">{asset.ticker}</p>
              <p className="truncate text-xs text-muted-foreground">
                {asset.name}
              </p>
            </div>
          </div>
          <AssetActions
            asset={asset}
            canManage={canManage}
            onEdit={onEdit}
            onDeactivate={onDeactivate}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">
            {CATEGORY_LABELS[asset.category] ?? asset.category}
          </Badge>
          <Badge variant={asset.is_active ? "default" : "secondary"}>
            {asset.is_active ? "Active" : "Inactive"}
          </Badge>
          <AssetTags asset={asset} />
          <span className="ml-auto tabular-nums">
            <AssetPrice {...derived} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetRow({ asset, prices, canManage, onEdit, onDeactivate }: AssetRowProps) {
  const derived = derivePrice(asset, prices);

  return (
    <TableRow className={!asset.is_active ? "opacity-50" : ""}>
      <TableCell>
        <div className="flex items-center gap-2">
          <AssetIcon asset={asset} size="md" />
          <div>
            <p className="font-medium">{asset.ticker}</p>
            <p className="text-xs text-muted-foreground">{asset.name}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {CATEGORY_LABELS[asset.category] ?? asset.category}
        </Badge>
      </TableCell>
      <TableCell>
        <AssetPrice {...derived} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <AssetTags asset={asset} />
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={asset.is_active ? "default" : "secondary"}>
          {asset.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <AssetActions
          asset={asset}
          canManage={canManage}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
        />
      </TableCell>
    </TableRow>
  );
}
