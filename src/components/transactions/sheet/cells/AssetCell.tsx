import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check, Plus, Sparkles } from "lucide-react"
import { CellShell } from "./CellShell"
import {
  isNewAssetSentinel,
  makeNewAssetSentinel,
  tickerFromSentinel,
} from "../sentinel"
import type { Asset } from "@/types/database"

interface Props {
  value: string
  assets: Asset[]
  error?: string
  readOnly?: boolean
  onChange: (id: string) => void
}

/** Ticker on top, company name below. In per-asset mode the cell is
 *  read-only. When the user searches for a ticker not in `assets`, a
 *  "Create new asset" item appears — selecting it sets the cell to a
 *  sentinel value (`new:TICKER`). The grid resolves sentinels via the
 *  Resolve-Unknowns stepper before committing on Save. */
export function AssetCell({ value, assets, error, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const selected = assets.find((a) => a.id === value)
  const isSentinel = isNewAssetSentinel(value)
  const sentinelTicker = isSentinel ? tickerFromSentinel(value) : null

  // Show the create-new affordance when the search has at least one char and
  // no existing asset matches the typed string exactly.
  const trimmedSearch = search.trim()
  const lowerSearch = trimmedSearch.toLowerCase()
  const exactMatch = assets.some(
    (a) =>
      a.ticker.toLowerCase() === lowerSearch ||
      a.name.toLowerCase() === lowerSearch,
  )
  const canCreate = trimmedSearch.length > 0 && !exactMatch

  const renderLabel = () => {
    if (selected) {
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{selected.ticker}</span>
          <span className="text-xs text-muted-foreground">{selected.name}</span>
        </div>
      )
    }
    if (isSentinel && sentinelTicker) {
      return (
        <div className="flex flex-col leading-tight">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {sentinelTicker}
            <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              new
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            Will be registered on save
          </span>
        </div>
      )
    }
    return (
      <span className="py-1 text-sm text-muted-foreground">Pick asset…</span>
    )
  }

  if (readOnly) {
    return (
      <CellShell error={error} className="w-[240px]">
        <div className="px-2 py-1">{renderLabel()}</div>
      </CellShell>
    )
  }

  return (
    <CellShell error={error} className="w-[240px]">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setSearch("")
        }}
      >
        <PopoverTrigger className="inline-flex w-full items-start rounded-md px-2 py-1 text-left hover:bg-accent/40">
          {renderLabel()}
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={true}>
            <CommandInput
              placeholder="Search or type new ticker…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>Type a ticker to add a new asset.</CommandEmpty>

              {canCreate && (
                <CommandGroup heading="New">
                  <CommandItem
                    value={`__create__ ${trimmedSearch}`}
                    onSelect={() => {
                      onChange(makeNewAssetSentinel(trimmedSearch))
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span>Create</span>
                    <span className="ml-2 font-medium">{trimmedSearch.toUpperCase()}</span>
                    <Sparkles className="ml-auto h-3.5 w-3.5 text-amber-500" />
                  </CommandItem>
                </CommandGroup>
              )}

              <CommandGroup heading="Existing">
                {assets.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.name} ${a.ticker}`}
                    onSelect={() => {
                      onChange(a.id)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        value === a.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span className="font-medium">{a.ticker}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {a.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </CellShell>
  )
}

