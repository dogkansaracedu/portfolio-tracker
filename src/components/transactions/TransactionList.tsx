import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { TransactionRow } from "@/components/transactions/TransactionRow"
import type { TransactionWithDetails } from "@/lib/queries/transactions"

interface Props {
  transactions: TransactionWithDetails[]
  loading: boolean
  currency: "USD" | "TRY"
}

export function TransactionList({ transactions, loading, currency }: Props) {
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
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TransactionRow key={tx.id} transaction={tx} currency={currency} />
        ))}
      </TableBody>
    </Table>
  )
}
