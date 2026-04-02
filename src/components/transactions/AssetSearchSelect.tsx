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
import { ChevronsUpDown, Check } from "lucide-react"
import type { Asset, Platform } from "@/types/database"

interface AssetWithPlatform extends Asset {
  platforms: { name: string; color: string }
}

interface Props {
  assets: AssetWithPlatform[]
  platforms: Platform[]
  value: string | undefined
  onChange: (assetId: string) => void
  filterTicker?: string // Only show assets with this ticker (for transfers)
}

export function AssetSearchSelect({
  assets,
  platforms,
  value,
  onChange,
  filterTicker,
}: Props) {
  const [open, setOpen] = useState(false)

  const filteredAssets = filterTicker
    ? assets.filter((a) => a.ticker === filterTicker)
    : assets

  // Group assets by platform
  const grouped = platforms
    .map((platform) => ({
      platform,
      assets: filteredAssets.filter((a) => a.platform_id === platform.id),
    }))
    .filter((g) => g.assets.length > 0)

  const selectedAsset = assets.find((a) => a.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground"
      >
        <span className="truncate">
          {selectedAsset
            ? `${selectedAsset.name} — ${selectedAsset.platforms.name}`
            : "Select asset..."}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search asset..." />
          <CommandList>
            <CommandEmpty>No asset found.</CommandEmpty>
            {grouped.map(({ platform, assets: groupAssets }) => (
              <CommandGroup
                key={platform.id}
                heading={platform.name}
              >
                {groupAssets.map((asset) => (
                  <CommandItem
                    key={asset.id}
                    value={`${asset.name} ${asset.ticker} ${platform.name}`}
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
                    <div
                      className="mr-2 h-2 w-2 rounded-full"
                      style={{ backgroundColor: platform.color }}
                    />
                    <span>{asset.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {asset.ticker}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
