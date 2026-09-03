import { bn } from "@/lib/config"
import { CURRENCY_SYMBOLS, type FiatCurrency } from "@/lib/constants/currencies"
import { TableCell } from "@/components/ui/table"

interface Props {
  amount: string
  unitPrice: string
  currency: string
}

/** Read-only Total cost cell. Computed from amount * unit_price; matches
 *  the SWS pattern where users never type Total directly — it's derived.
 *  Padding + alignment match the other editable cells so columns stay in
 *  line. */
export function TotalCostCell({ amount, unitPrice, currency }: Props) {
  const a = bn(amount || "0")
  const p = bn(unitPrice || "0")
  const total = a.times(p)
  const sym = CURRENCY_SYMBOLS[currency as FiatCurrency] ?? ""
  const hasValue = !total.isNaN() && total.gt(0)

  return (
    <TableCell
      className="w-[140px] px-2 py-2 text-right align-middle tabular-nums"
    >
      {hasValue ? (
        <span>
          <span className="text-muted-foreground">{sym}</span>
          {total.toNumber().toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}
