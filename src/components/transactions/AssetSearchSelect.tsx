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
import { Badge } from "@/components/ui/badge"
import { ChevronsUpDown, Check } from "lucide-react"
import type { Asset } from "@/types/database"

const CATEGORY_LABELS: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stock",
  stock_bist: "BIST",
}

interface Props {
  assets: Asset[]
  value: string | undefined
  onChange: (assetId: string) => void
}

export function AssetSearchSelect({ assets, value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const selectedAsset = assets.find((a) => a.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
      >
        <span className="truncate">
          {selectedAsset
            ? `${selectedAsset.name} (${selectedAsset.ticker})`
            : "Select asset..."}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or ticker..." />
          <CommandList>
            <CommandEmpty>No asset found.</CommandEmpty>
            {assets.map((asset) => (
              <CommandItem
                key={asset.id}
                value={`${asset.name} ${asset.ticker}`}
                onSelect={() => {
                  onChange(asset.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    value === asset.id ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="font-medium">{asset.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {asset.ticker}
                </span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {CATEGORY_LABELS[asset.category] ?? asset.category}
                </Badge>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
