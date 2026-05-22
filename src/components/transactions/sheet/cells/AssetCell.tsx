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
import { ChevronsUpDown, Check } from "lucide-react"
import { CellShell } from "./CellShell"
import type { Asset } from "@/types/database"

interface Props {
  value: string
  assets: Asset[]
  error?: string
  readOnly?: boolean
  onChange: (id: string) => void
}

export function AssetCell({ value, assets, error, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = assets.find((a) => a.id === value)

  if (readOnly) {
    return (
      <CellShell error={error} className="w-[200px]">
        <div className="px-2 py-1.5 text-sm">
          {selected ? (
            <span className="flex flex-col">
              <span className="font-medium">{selected.name}</span>
              <span className="text-xs text-muted-foreground">
                {selected.ticker}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      </CellShell>
    )
  }

  return (
    <CellShell error={error} className="w-[200px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-8 w-full items-center justify-between rounded-md border border-transparent px-2 text-sm hover:border-input">
          {selected ? (
            <span className="truncate">
              {selected.name}{" "}
              <span className="text-xs text-muted-foreground">
                {selected.ticker}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Pick asset…</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
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
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {a.ticker}
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
