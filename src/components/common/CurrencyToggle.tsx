import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

export default function CurrencyToggle() {
  const { currency, toggleCurrency } = useDisplayCurrency()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCurrency}
            className="min-w-[3.5rem] font-mono text-xs"
          />
        }
      >
        {currency === "USD" ? "$ USD" : "₺ TRY"}
      </TooltipTrigger>
      <TooltipContent>
        Switch to {currency === "USD" ? "TRY" : "USD"}
      </TooltipContent>
    </Tooltip>
  )
}
