import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { TransactionRow } from "@/components/transactions/TransactionRow"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"

interface Props {
  transactions: TransactionWithDetails[]
  loading: boolean
  currency: "USD" | "TRY"
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead>Platform</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Unit Price</TableHead>
          <TableHead>Total</TableHead>
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
  )
}
