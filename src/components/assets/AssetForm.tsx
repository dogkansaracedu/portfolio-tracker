import { useState, useEffect } from "react";
import type { AssetCategory } from "@/types/database";
import type { AssetWithPlatform } from "@/lib/queries/assets";
import { usePlatforms } from "@/hooks/usePlatforms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: "fiat", label: "Fiat" },
  { value: "crypto", label: "Crypto" },
  { value: "stock_bist", label: "BIST Stock" },
  { value: "stock_us", label: "US Stock" },
  { value: "commodity", label: "Commodity" },
];

const TICKER_HINTS: Record<AssetCategory, string> = {
  fiat: 'Use ISO code, e.g. "usd", "try", "eur"',
  crypto: 'Use CoinGecko ID, e.g. "bitcoin", "ethereum"',
  stock_bist: 'Use BIST ticker, e.g. "THYAO", "ASELS"',
  stock_us: 'Use US ticker, e.g. "AAPL", "MSFT"',
  commodity: 'Use short name, e.g. "gold", "silver"',
};

interface AssetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetWithPlatform | null;
  onSubmit: (data: {
    platform_id: string;
    category: AssetCategory;
    ticker: string;
    name: string;
    balance: number;
    is_active: boolean;
  }) => Promise<void>;
}

export function AssetForm({
  open,
  onOpenChange,
  asset,
  onSubmit,
}: AssetFormProps) {
  const { platforms } = usePlatforms();

  const [platformId, setPlatformId] = useState("");
  const [category, setCategory] = useState<AssetCategory>("fiat");
  const [ticker, setTicker] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [balance, setBalance] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!asset;

  useEffect(() => {
    if (open) {
      setPlatformId(asset?.platform_id ?? (platforms[0]?.id ?? ""));
      setCategory(asset?.category ?? "fiat");
      setTicker(asset?.ticker ?? "");
      setDisplayName(asset?.name ?? "");
      setBalance(asset?.balance?.toString() ?? "0");
      setError(null);
    }
  }, [open, asset, platforms]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!platformId) {
      setError("Please select a platform");
      return;
    }
    const trimmedTicker = ticker.trim();
    if (!trimmedTicker) {
      setError("Ticker is required");
      return;
    }
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Display name is required");
      return;
    }
    const numBalance = parseFloat(balance) || 0;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        platform_id: platformId,
        category,
        ticker: trimmedTicker,
        name: trimmedName,
        balance: numBalance,
        is_active: true,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this asset's details."
              : "Create a new asset to track in your portfolio."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Platform</Label>
            <Select
              value={platformId}
              onValueChange={(val) => setPlatformId(val as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(val) => setCategory(val as AssetCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asset-ticker">Ticker</Label>
            <Input
              id="asset-ticker"
              placeholder="e.g. bitcoin, AAPL, usd"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {TICKER_HINTS[category]}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asset-name">Display Name</Label>
            <Input
              id="asset-name"
              placeholder="e.g. Bitcoin, Apple Inc., US Dollar"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {!isEditing && (
            <div className="grid gap-2">
              <Label htmlFor="asset-balance">Initial Balance</Label>
              <Input
                id="asset-balance"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional. You can adjust this later with transactions.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Add Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
