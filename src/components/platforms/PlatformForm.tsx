import { useState, useEffect } from "react";
import type { Platform } from "@/types/database";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESET_NAMES = [
  "IBKR",
  "Midas",
  "Paribu",
  "OKX",
  "Ziraat",
  "Garanti",
  "Fiziksel Altin",
];

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#64748b",
];

interface PlatformFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform?: Platform | null;
  onSubmit: (data: { name: string; color: string }) => Promise<void>;
}

export function PlatformForm({
  open,
  onOpenChange,
  platform,
  onSubmit,
}: PlatformFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!platform;

  useEffect(() => {
    if (open) {
      setName(platform?.name ?? "");
      setColor(platform?.color ?? PRESET_COLORS[0]);
      setError(null);
    }
  }, [open, platform]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Platform name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, color });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save platform");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Platform" : "Add Platform"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the platform name or color."
              : "Create a new platform to organize your assets."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="platform-name">Name</Label>
            <Input
              id="platform-name"
              placeholder="Platform name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {!isEditing && (
              <div className="flex flex-wrap gap-1.5">
                {PRESET_NAMES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setName(preset)}
                    className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    boxShadow:
                      color === c
                        ? `0 0 0 2px ${c}`
                        : "none",
                  }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Platform"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
