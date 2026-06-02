import { useState, useEffect } from "react";
import type { Asset } from "@/types/database";
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
import { AssetIcon } from "@/components/common/AssetIcon";
import { derivePriceId } from "@/lib/priceId";

const CATEGORIES = [
  { value: "stock_us", label: "US Stock" },
  { value: "stock_bist", label: "BIST Stock" },
  { value: "crypto", label: "Crypto" },
  { value: "gold", label: "Gold" },
  { value: "fiat", label: "Fiat" },
];

const PRICE_SOURCES = [
  { value: "yahoo", label: "Yahoo Finance" },
  { value: "tcmb", label: "TCMB" },
  { value: "manual", label: "Manual" },
];

const TICKER_HINTS: Record<string, string> = {
  fiat: 'Display shorthand, e.g. "USD", "TRY", "EUR"',
  crypto: 'Display shorthand, e.g. "BTC", "ETH"',
  gold: 'Display shorthand, e.g. "XAU", "PAXG"',
  stock_us: 'Display shorthand, e.g. "AAPL", "MSFT"',
  stock_bist: 'Display shorthand, e.g. "THYAO", "ASELS"',
};

const PRICE_ID_HINT =
  "Provider id used to fetch price. Auto-filled for BIST/US stocks on Yahoo (THYAO → THYAO.IS); edit to override, or leave blank to use the ticker.";

const ICON_URL_HINT =
  "Leave blank to auto-resolve a logo from the ticker. Paste an image URL to override.";

interface AssetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
  onSubmit: (data: {
    category: string;
    ticker: string;
    price_id: string;
    icon_url: string | null;
    name: string;
    tags: string[];
    price_source: string;
    is_active: boolean;
  }) => Promise<void>;
}

export function AssetForm({
  open,
  onOpenChange,
  asset,
  onSubmit,
}: AssetFormProps) {
  const [category, setCategory] = useState("stock_us");
  const [ticker, setTicker] = useState("");
  const [priceId, setPriceId] = useState(asset?.price_id ?? "");
  const [iconUrl, setIconUrl] = useState(asset?.icon_url ?? "");
  const [displayName, setDisplayName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [priceSource, setPriceSource] = useState("manual");
  // Whether the user has hand-edited Price ID. While false, Price ID
  // auto-derives from the ticker (see handlers below); once true we leave
  // their value alone.
  const [priceIdDirty, setPriceIdDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!asset;

  useEffect(() => {
    if (open) {
      const nextCategory = asset?.category ?? "stock_us";
      const nextTicker = asset?.ticker ?? "";
      const nextSource = asset?.price_source ?? "manual";
      const storedPriceId = asset?.price_id ?? "";
      const derived = derivePriceId(nextTicker, nextCategory, nextSource);
      setCategory(nextCategory);
      setTicker(nextTicker);
      // Show the stored symbol; if it was left blank (old fallback-to-ticker
      // rows) fall back to the derived value so the field isn't empty.
      setPriceId(storedPriceId || (derived ?? ""));
      setIconUrl(asset?.icon_url ?? "");
      setDisplayName(asset?.name ?? "");
      setTagsInput(asset?.tags?.join(", ") ?? "");
      setPriceSource(nextSource);
      // A stored price_id that already matches what we'd auto-derive stays
      // "clean" so it keeps syncing as the ticker changes; anything else
      // (custom symbol, crypto BTC-USD, etc.) is treated as a manual override.
      setPriceIdDirty(storedPriceId !== "" && storedPriceId !== derived);
      setError(null);
    }
  }, [open, asset]);

  // Re-derive Price ID from the ticker whenever the ticker, category, or
  // source changes — unless the user has taken over the field. A null derive
  // (non-Yahoo, or crypto/gold/fiat) clears the auto-filled value rather than
  // leaving a stale symbol behind.
  function syncPriceId(nextTicker: string, nextCategory: string, nextSource: string) {
    if (priceIdDirty) return;
    setPriceId(derivePriceId(nextTicker, nextCategory, nextSource) ?? "");
  }

  function handleTickerChange(value: string) {
    setTicker(value);
    syncPriceId(value, category, priceSource);
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    syncPriceId(ticker, value, priceSource);
  }

  function handlePriceSourceChange(value: string) {
    setPriceSource(value);
    syncPriceId(ticker, category, value);
  }

  function handlePriceIdChange(value: string) {
    setPriceId(value);
    setPriceIdDirty(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        category,
        ticker: trimmedTicker,
        price_id: priceId.trim() || trimmedTicker,
        icon_url: iconUrl.trim() || null,
        name: trimmedName,
        tags,
        price_source: priceSource,
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
              : "Create a new global asset to track in your portfolio."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(val) => handleCategoryChange(val as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {CATEGORIES.find((c) => c.value === category)?.label || "Select a category"}
                </SelectValue>
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
              placeholder="e.g. BTC, AAPL, USD"
              value={ticker}
              onChange={(e) => handleTickerChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {TICKER_HINTS[category] ?? "Display shorthand for the asset."}
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

          <div className="grid gap-2">
            <Label htmlFor="asset-icon-url">Icon</Label>
            <div className="flex items-center gap-3">
              <AssetIcon
                asset={{ ticker: ticker || "?", category, icon_url: iconUrl }}
                size="lg"
              />
              <Input
                id="asset-icon-url"
                className="flex-1"
                placeholder="Auto-resolved from ticker"
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">{ICON_URL_HINT}</p>
          </div>

          <div className="grid gap-2">
            <Label>Price Source</Label>
            <Select
              value={priceSource}
              onValueChange={(val) => handlePriceSourceChange(val as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {PRICE_SOURCES.find((s) => s.value === priceSource)?.label || "Select a source"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRICE_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asset-price-id">Price ID</Label>
            <Input
              id="asset-price-id"
              placeholder="e.g. BTC-USD, bitcoin"
              value={priceId}
              onChange={(e) => handlePriceIdChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PRICE_ID_HINT}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="asset-tags">Tags</Label>
            <Input
              id="asset-tags"
              placeholder='e.g. "crypto, usd" or "fiat, try"'
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Used for cross-cutting queries (e.g. "usd" groups USD + USDT + USDC).
            </p>
          </div>

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
