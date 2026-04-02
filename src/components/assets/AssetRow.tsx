import type { Asset } from "@/types/database";
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

const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stock",
  stock_bist: "BIST",
};

interface AssetRowProps {
  asset: Asset;
  onEdit: (asset: Asset) => void;
  onDeactivate: (asset: Asset) => void;
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
        <Badge variant="secondary">
          {CATEGORY_LABELS[asset.category] ?? asset.category}
        </Badge>
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
