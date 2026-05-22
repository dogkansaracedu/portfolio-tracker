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
import { PlatformDot } from "@/components/common/PlatformDot"
import { ChevronsUpDown, Check } from "lucide-react"
import { CellShell } from "./CellShell"
import type { Platform } from "@/types/database"

interface Props {
  value: string
  platforms: Platform[]
  error?: string
  onChange: (id: string) => void
}

export function PlatformCell({ value, platforms, error, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = platforms.find((p) => p.id === value)

  return (
    <CellShell error={error} className="w-[160px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-8 w-full items-center justify-between rounded-md border border-transparent px-2 text-sm hover:border-input">
          {selected ? (
            <span className="flex items-center gap-1.5 truncate">
              <PlatformDot color={selected.color} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Pick platform…</span>
          )}
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search platforms…" />
            <CommandList>
              <CommandEmpty>No platform found.</CommandEmpty>
              {platforms.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      value === p.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <PlatformDot color={p.color} />
                  <span className="ml-2">{p.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </CellShell>
  )
}
