import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useTransactionLog } from "@/hooks/useTransactionLog"
import { useRealizedPnL } from "@/hooks/useRealizedPnL"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { TransactionSummary } from "@/components/transactions/TransactionSummary"
import { TransactionFilters } from "@/components/transactions/TransactionFilters"
import { TransactionList } from "@/components/transactions/TransactionList"
import { PageHeading } from "@/components/common/PageHeading"
import { Button } from "@/components/ui/button"
import { PlusIcon, TableIcon } from "lucide-react"
import { BULK_ADD_ROUTE } from "@/lib/constants/app"
import {
  fetchLinkedChildrenForParents,
  type TransactionWithDetails,
} from "@/lib/queries/transactions"

export default function TransactionsPage() {
  const { transactions, loading, filters, setFilters, summary } =
    useTransactionLog()
  const { currency } = useDisplayCurrency()
  const realizedByTx = useRealizedPnL()
  const { openTransactionModal } = useTransactionModal()
  const [childMap, setChildMap] = useState<
    Map<string, TransactionWithDetails>
  >(new Map())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const parentIds = transactions
        .filter((t) => t.linked_tx_id == null)
        .map((t) => t.id)
      if (parentIds.length === 0) {
        if (!cancelled) setChildMap(new Map())
        return
      }
      const next = await fetchLinkedChildrenForParents(parentIds)
      if (!cancelled) setChildMap(next)
    })()
    return () => {
      cancelled = true
    }
  }, [transactions])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading
          title="Transactions"
          subtitle="View and filter your transaction history."
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={BULK_ADD_ROUTE} />}
          >
            <TableIcon className="size-4" />
            Bulk add
          </Button>
          <Button onClick={() => openTransactionModal()}>
            <PlusIcon className="size-4" />
            Add Transaction
          </Button>
        </div>
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
        childMap={childMap}
        realizedByTx={realizedByTx}
      />
    </div>
  )
}
