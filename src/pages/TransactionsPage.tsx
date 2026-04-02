import { useTransactionLog } from "@/hooks/useTransactionLog"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { TransactionSummary } from "@/components/transactions/TransactionSummary"
import { TransactionFilters } from "@/components/transactions/TransactionFilters"
import { TransactionList } from "@/components/transactions/TransactionList"
import { Button } from "@/components/ui/button"
import { PlusIcon } from "lucide-react"

export default function TransactionsPage() {
  const { transactions, loading, filters, setFilters, summary } =
    useTransactionLog()
  const { currency } = useDisplayCurrency()
  const { openTransactionModal } = useTransactionModal()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            View and filter your transaction history.
          </p>
        </div>
        <Button onClick={() => openTransactionModal()}>
          <PlusIcon className="size-4" />
          Add Transaction
        </Button>
      </div>

      {/* Summary cards */}
      <TransactionSummary summary={summary} currency={currency} />

      {/* Filters */}
      <TransactionFilters filters={filters} onFiltersChange={setFilters} />

      {/* Transaction list */}
      <TransactionList
        transactions={transactions}
        loading={loading}
        currency={currency}
      />
    </div>
  )
}
