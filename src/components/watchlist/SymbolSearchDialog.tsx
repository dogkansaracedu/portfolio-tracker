import { useEffect, useState } from "react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { AssetIcon } from "@/components/common/AssetIcon"
import { CATEGORY_LABELS } from "@/lib/constants/assets"
import { formatCurrency } from "@/lib/prices"
import { searchSymbols, type SymbolMatch } from "@/lib/queries/watchlist"
import {
  SYMBOL_SEARCH_DEBOUNCE_MS,
  SYMBOL_SEARCH_MIN_CHARS,
  WATCHLIST_COPY,
} from "@/lib/constants/watchlist"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Price keys already on the list — shown, but not pickable again. */
  addedKeys: Set<string>
  onPick: (match: SymbolMatch) => void
}

type SearchResult =
  | { query: string; status: "done"; results: SymbolMatch[] }
  | { query: string; status: "failed" }

/** Add flow: type a symbol, pick a result. Searches the price sources server
 *  side (debounced); on a phone the dialog is the full-height sheet, so the
 *  results list sits above the keyboard. */
export function SymbolSearchDialog({ open, onOpenChange, addedKeys, onPick }: Props) {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<SearchResult | null>(null)
  const q = query.trim()
  const tooShort = q.length < SYMBOL_SEARCH_MIN_CHARS
  // A result only counts for the query it answered; until the debounced search
  // for the current text lands, the list shows "searching".
  const state = tooShort
    ? null
    : result?.query === q
      ? result
      : { status: "searching" as const }

  useEffect(() => {
    if (tooShort) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchSymbols(q).then(
        (results) => !cancelled && setResult({ query: q, status: "done", results }),
        () => !cancelled && setResult({ query: q, status: "failed" }),
      )
    }, SYMBOL_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, tooShort])

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("")
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{WATCHLIST_COPY.searchTitle}</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="min-h-0 flex-1 bg-transparent p-0">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={WATCHLIST_COPY.searchPlaceholder}
          />
          <DialogBody>
            <CommandList className="max-h-none">
              {state?.status === "searching" && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {WATCHLIST_COPY.searching}
                </p>
              )}
              {state?.status === "failed" && (
                <p className="py-6 text-center text-sm text-red-500">
                  {WATCHLIST_COPY.searchFailed}
                </p>
              )}
              {state?.status === "done" && (
                <CommandEmpty>{WATCHLIST_COPY.noResults}</CommandEmpty>
              )}
              {state?.status === "done" &&
                state.results.map((m) => {
                  const added = addedKeys.has(m.price_id)
                  return (
                    <CommandItem
                      key={m.price_id}
                      value={m.price_id}
                      disabled={added}
                      onSelect={() => {
                        onPick(m)
                        handleOpenChange(false)
                      }}
                      className="min-h-11"
                    >
                      <AssetIcon asset={m} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium">{m.ticker}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {m.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="tabular-nums">
                          {added
                            ? WATCHLIST_COPY.alreadyAdded
                            : m.price == null
                              ? WATCHLIST_COPY.noPrice
                              : formatCurrency(m.price, m.currency)}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {CATEGORY_LABELS[m.category] ?? m.category}
                        </Badge>
                      </div>
                    </CommandItem>
                  )
                })}
            </CommandList>
          </DialogBody>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
