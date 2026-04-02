import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/prices"
import type { Snapshot, Asset, PriceCache, ExchangeRate } from "@/types/database"

interface AssetWithPlatform extends Asset {
  platforms: { name: string; color: string }
}

interface Props {
  snapshots: Snapshot[]
  assets: AssetWithPlatform[]
  prices: Record<string, PriceCache>
  latestRates: ExchangeRate | null
  onTakeSnapshot: (
    assets: AssetWithPlatform[],
    prices: Record<string, PriceCache>,
    rates: ExchangeRate | null,
  ) => Promise<Snapshot>
  onDeleteSnapshot: (id: string) => Promise<void>
}

export function SnapshotManager({
  snapshots,
  assets,
  prices,
  latestRates,
  onTakeSnapshot,
  onDeleteSnapshot,
}: Props) {
  const [taking, setTaking] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const handleTake = async () => {
    setTaking(true)
    try {
      await onTakeSnapshot(assets, prices, latestRates)
      toast.success("Snapshot taken!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to take snapshot")
    } finally {
      setTaking(false)
    }
  }

  const lastSnapshot = snapshots[snapshots.length - 1]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Snapshots</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {lastSnapshot ? (
              <p className="text-sm text-muted-foreground">
                Last: {new Date(lastSnapshot.snapshot_date).toLocaleDateString()} —{" "}
                {formatCurrency(lastSnapshot.total_usd ?? 0, "USD")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No snapshots yet.</p>
            )}
          </div>
          <Button onClick={handleTake} disabled={taking} size="sm">
            {taking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            Take Snapshot
          </Button>
        </div>

        {snapshots.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {showHistory ? "Hide" : "Show"} history ({snapshots.length} snapshots)
          </button>
        )}

        {showHistory && (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {[...snapshots].reverse().map((snap) => (
              <div
                key={snap.id}
                className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-muted"
              >
                <span>{new Date(snap.snapshot_date).toLocaleDateString()}</span>
                <span className="text-muted-foreground">
                  {formatCurrency(snap.total_usd ?? 0, "USD")}
                </span>
                <button
                  onClick={() => onDeleteSnapshot(snap.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
