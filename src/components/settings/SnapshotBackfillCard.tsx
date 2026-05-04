import { useState } from "react"
import { Loader2, History, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  triggerBackfillSnapshots,
  type BackfillGranularity,
  type BackfillResult,
} from "@/lib/queries/snapshots"
import { cn } from "@/lib/utils"

const GRANULARITY_OPTIONS: {
  value: BackfillGranularity
  label: string
  hint: string
}[] = [
  {
    value: "monthly",
    label: "Aylık + son 30 gün günlük",
    hint: "Her ayın 1'i için bir snapshot, ek olarak son 30 günün her günü için bir snapshot. 1G / 1H aralıklarının dolu görünmesi için önerilen seçenek.",
  },
  {
    value: "tx_dates",
    label: "Her tx günü",
    hint: "Sadece transaction'ın geçtiği günler için snapshot. Daha hassas ama daha fazla satır.",
  },
]

export function SnapshotBackfillCard() {
  const [granularity, setGranularity] = useState<BackfillGranularity>("monthly")
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null)

  const handleRun = async () => {
    setRunning(true)
    try {
      const result = await triggerBackfillSnapshots({ granularity, overwrite })
      setLastResult(result)

      const errCount = result.errors?.length ?? 0
      if (result.snapshots_written > 0) {
        toast.success(
          `${result.snapshots_written} snapshot yazıldı (${result.target_count} hedef tarih)`,
          {
            description:
              errCount > 0
                ? `${errCount} fiyat kaynağı uyarı verdi — detaylar aşağıda.`
                : undefined,
          },
        )
      } else if (errCount > 0) {
        toast.error("Backfill tamamlandı ama snapshot yazılmadı", {
          description: result.errors?.[0],
        })
      } else {
        toast.message("Backfill tamamlandı, yazılacak yeni snapshot yok.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error("Backfill başarısız", { description: message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Geriye Dönük Snapshot
        </CardTitle>
        <CardDescription>
          Önce eksik transaction'ları gir, sonra çalıştır. CoinGecko ve
          Yahoo'dan tarihsel fiyat çekilir, ~30–90 sn sürer.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Granularity */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Granularite</p>
          <div className="flex flex-wrap gap-2">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={running}
                onClick={() => setGranularity(opt.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  granularity === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.hint}
          </p>
        </div>

        {/* Overwrite toggle */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={overwrite}
            disabled={running}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <div className="space-y-0.5">
            <p className="text-sm font-medium leading-none">
              Mevcut snapshot'ları üzerine yaz
            </p>
            <p className="text-xs text-muted-foreground">
              Hedef tarihlerde mevcut snapshot'lar silinip yeniden yazılır.
              Kapalıysa onConflict ile sadece total/breakdown güncellenir.
            </p>
          </div>
        </label>

        {/* Action */}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {overwrite ? "Eski snapshot'lar silinecek." : "Çakışanlar upsert ile güncellenecek."}
          </p>
          <Button onClick={handleRun} disabled={running} size="sm">
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <History className="mr-2 h-4 w-4" />
            )}
            {running ? "Çalışıyor…" : "Backfill çalıştır"}
          </Button>
        </div>

        {/* Last result */}
        {lastResult && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Hedef tarih" value={String(lastResult.target_count)} />
              <Stat
                label="Yazılan snapshot"
                value={String(lastResult.snapshots_written)}
              />
              <Stat
                label="Fiyatlanan ticker"
                value={String(lastResult.tickers_priced.length)}
              />
              <Stat
                label="Hata"
                value={String(lastResult.errors?.length ?? 0)}
              />
            </div>

            {lastResult.errors && lastResult.errors.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  Uyarılar
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  {lastResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="break-all">
                      {e}
                    </li>
                  ))}
                  {lastResult.errors.length > 5 && (
                    <li>… ve {lastResult.errors.length - 5} tane daha</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}
