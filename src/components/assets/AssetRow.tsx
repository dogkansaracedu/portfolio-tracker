import type { Asset, PriceCache } from "@/types/database";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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

const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stock",
  stock_bist: "BIST",
};

interface AssetRowProps {
  asset: Asset;
  prices: Record<string, PriceCache>;
  canManage: boolean;
  onEdit: (asset: Asset) => void;
  onDeactivate: (asset: Asset) => void;
}

export function AssetRow({ asset, prices, canManage, onEdit, onDeactivate }: AssetRowProps) {
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
        {priceValue ? (
          <p className="text-sm">
            {formatCurrency(priceValue, native)}
            {usdEstimate !== null && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (~{formatCurrency(usdEstimate, "USD")})
              </span>
            )}
          </p>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {(asset.tags ?? []).length > 0
            ? (asset.tags ?? []).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))
            : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={asset.is_active ? "default" : "secondary"}>
          {asset.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {canManage && asset.is_active && !asset.is_currency && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm">
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
        )}
      </TableCell>
    </TableRow>
  );
}
