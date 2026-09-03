import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { TransactionRow } from "@/components/transactions/TransactionRow"
import { TransactionRowCard } from "@/components/transactions/TransactionRowCard"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import type { DisplayCurrency } from "@/lib/constants/currencies"

interface Props {
  transactions: TransactionWithDetails[]
  loading: boolean
  currency: DisplayCurrency
  childMap?: Map<string, TransactionWithDetails>
  realizedByTx?: Map<string, RealizedPnLEntry>
}

export function TransactionList({
  transactions,
  loading,
  currency,
  childMap,
  realizedByTx,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading transactions...
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No transactions yet.
      </div>
    )
  }

  return (
    <>
      {/* Desktop table. Same switch as the Portfolio table: the eight columns
          need ~930px, and below 1280 the shell leaves at most 736px beside the
          sidebar — so the card list carries every width under `xl`. */}
      <div className="hidden xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                currency={currency}
                linkedChild={childMap?.get(tx.id) ?? null}
                realized={realizedByTx?.get(tx.id) ?? null}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card list — every width below 1280px. */}
      <div className="flex flex-col gap-2 xl:hidden">
        {transactions.map((tx) => (
          <TransactionRowCard
            key={tx.id}
            transaction={tx}
            currency={currency}
            linkedChild={childMap?.get(tx.id) ?? null}
            realized={realizedByTx?.get(tx.id) ?? null}
          />
        ))}
      </div>
    </>
  )
}
