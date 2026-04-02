import type { AssetCategory } from "@/types/database";
import type { AssetWithPlatform } from "@/lib/queries/assets";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, EyeOff } from "lucide-react";

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  stock_bist: "BIST",
  stock_us: "US Stock",
  commodity: "Commodity",
};

const CATEGORY_VARIANTS: Record<AssetCategory, "default" | "secondary" | "outline"> = {
  fiat: "secondary",
  crypto: "default",
  stock_bist: "outline",
  stock_us: "outline",
  commodity: "secondary",
};

interface AssetRowProps {
  asset: AssetWithPlatform;
  onEdit: (asset: AssetWithPlatform) => void;
  onDeactivate: (asset: AssetWithPlatform) => void;
}

export function AssetRow({ asset, onEdit, onDeactivate }: AssetRowProps) {
  return (
    <TableRow className={!asset.is_active ? "opacity-50" : ""}>
      <TableCell>
        <div>
          <p className="font-medium">{asset.name}</p>
          <p className="text-xs text-muted-foreground">{asset.ticker}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: asset.platforms.color }}
          />
          <span className="text-sm">{asset.platforms.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={CATEGORY_VARIANTS[asset.category]}>
          {CATEGORY_LABELS[asset.category]}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {asset.balance.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 8,
        })}
      </TableCell>
      <TableCell>
        <Badge variant={asset.is_active ? "default" : "secondary"}>
          {asset.is_active ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {asset.is_active && (
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
