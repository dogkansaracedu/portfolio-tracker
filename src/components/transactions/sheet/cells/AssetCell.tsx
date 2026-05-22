import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check } from "lucide-react"
import { CellShell } from "./CellShell"
import type { Asset } from "@/types/database"

interface Props {
  value: string
  assets: Asset[]
  error?: string
  readOnly?: boolean
  onChange: (id: string) => void
}

/** Ticker on top (compact code), company name below (lighter). Matches the
 *  SWS "Ticker / Company / ISIN" layout. In per-asset mode the cell is
 *  read-only and serves as a reminder of the locked asset. */
export function AssetCell({ value, assets, error, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = assets.find((a) => a.id === value)

  if (readOnly) {
    return (
      <CellShell error={error} className="w-[240px]">
        <div className="px-2 py-1">
          {selected ? (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium tabular-nums">
                {selected.ticker}
              </span>
              <span className="text-xs text-muted-foreground">
                {selected.name}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </CellShell>
    )
  }

  return (
    <CellShell error={error} className="w-[240px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex w-full items-start rounded-md px-2 py-1 text-left hover:bg-accent/40">
          {selected ? (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{selected.ticker}</span>
              <span className="text-xs text-muted-foreground">
                {selected.name}
              </span>
            </div>
          ) : (
            <span className="py-1 text-sm text-muted-foreground">
              Pick asset…
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or ticker…" />
            <CommandList>
              <CommandEmpty>No asset found.</CommandEmpty>
              {assets.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.name} ${a.ticker}`}
                  onSelect={() => {
                    onChange(a.id)
                    setOpen(false)
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </CellShell>
  )
}
