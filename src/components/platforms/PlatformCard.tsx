import type { Platform } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface PlatformCardProps {
  platform: Platform;
  assetCount: number;
  onEdit: (platform: Platform) => void;
  onDelete: (platform: Platform) => void;
}

export function PlatformCard({
  platform,
  assetCount,
  onEdit,
  onDelete,
}: PlatformCardProps) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: platform.color }}
          />
          <div>
            <p className="font-medium leading-tight">{platform.name}</p>
            <p className="text-xs text-muted-foreground">
              {assetCount} {assetCount === 1 ? "asset" : "assets"}
            </p>
          </div>
        </div>

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
            <DropdownMenuItem onClick={() => onEdit(platform)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(platform)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
