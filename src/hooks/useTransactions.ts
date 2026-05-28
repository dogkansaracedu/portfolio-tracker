import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import {
  fetchTransactions,
  createTransaction,
  updateTransaction as updateTransactionQuery,
  deleteTransaction,
  fetchLinkedChild,
  type TransactionWithDetails,
  type TransactionFilters,
} from "@/lib/queries/transactions"
import { recalculateBalance } from "@/lib/balance"
import { resolveFiatAsset, buildChildRow, shouldCreateChild } from "@/lib/cash"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import { supabase } from "@/lib/supabase"
import type { TransactionInsert, TransactionUpdate } from "@/types/database"

/**
 * If a transaction is denominated in a non-USD currency, ensure
 * `exchange_rates` carries the TCMB rate for that day so cost-basis
 * conversions don't fall back to a stale older row. Called fire-and-await
 * before `bumpTxVersion` so consumers re-render with the right rate already
 * cached. Failures are non-fatal — the transaction is already saved.
 */
async function ensureHistoricalRate(
  priceCurrency: string | null | undefined,
  feeCurrency: string | null | undefined,
  date: string | null | undefined,
): Promise<void> {
  const isNonUsd = (c: string | null | undefined) =>
    !!c && c.toUpperCase() !== "USD"
  if (!isNonUsd(priceCurrency) && !isNonUsd(feeCurrency)) return
  const day = (date ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
  try {
    await supabase.functions.invoke("fetch-historical-rate", {
      body: { date: day },
    })
  } catch (err) {
    console.warn("fetch-historical-rate failed:", err)
  }
}

export function useTransactions(filters?: TransactionFilters) {
  const { user } = useAuth()
  const { txVersion, bumpTxVersion } = useTransactionModal()
  const { refresh } = useTransactionData()
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTransactions(user.id, filters)
      setTransactions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions")
    } finally {
      setLoading(false)
    }
  }, [user, filters?.assetId, filters?.platformId, filters?.type, filters?.dateFrom, filters?.dateTo])

  // Re-fetch on filter changes AND whenever any consumer bumps txVersion.
  useEffect(() => {
    load()
  }, [load, txVersion])

  // After each mutation we call both refresh() and bumpTxVersion():
  //   refresh()       — refetches the global SoT (TransactionDataContext) so
  //                     all P&L / dashboard hooks see new data immediately.
  //   bumpTxVersion() — signals locally-paginated views (useTransactionLog,
  //                     useHoldings) to refetch their server-filtered slices.
  // Both are load-bearing; they serve orthogonal consumers.
  const addTransaction = async (
    data: Omit<TransactionInsert, "user_id">,
    options?: { fundingPlatformId?: string | null },
  ) => {
    if (!user) throw new Error("Not authenticated")

    const parent = await createTransaction({ ...data, user_id: user.id })
    await ensureHistoricalRate(parent.price_currency, parent.fee_currency, parent.date)

    // Track every (asset, platform) lens we need to recalc.
    const lenses = new Set<string>()
    const addLens = (assetId: string, platformId: string) =>
      lenses.add(`${assetId}::${platformId}`)
    addLens(parent.asset_id, parent.platform_id)
    if (parent.related_asset_id) {
      addLens(parent.asset_id, parent.related_asset_id)
    }

    const fundingPlatformId = options?.fundingPlatformId ?? null
    if (shouldCreateChild(parent.type, fundingPlatformId)) {
      const cashAssetId = await resolveFiatAsset(parent.price_currency, user.id)
      const child = buildChildRow({
        parent,
        parentId: parent.id,
        fundingPlatformId,
        cashAssetId,
      })
      await createTransaction(child as TransactionInsert)
      addLens(cashAssetId, child.platform_id)
    }

    for (const lens of lenses) {
      const [assetId, platformId] = lens.split("::")
      await recalculateBalance(user.id, assetId, platformId)
    }
    await refresh()
    bumpTxVersion()
    return parent
  }

  const editTransaction = async (
    id: string,
    data: TransactionUpdate,
    /** original asset/platform so we can recalculate balances on either side
     * if they changed. */
    original: { assetId: string; platformId: string },
    options?: { fundingPlatformId?: string | null },
  ) => {
    if (!user) throw new Error("Not authenticated")

    // Capture pre-edit child (if any) BEFORE the parent update — once the
    // parent's price_currency or platform changes we may need both old and
    // new lenses for the cash side.
    const existingChild = await fetchLinkedChild(id)

    const updated = await updateTransactionQuery(id, data)
    await ensureHistoricalRate(updated.price_currency, updated.fee_currency, updated.date)

    const lenses = new Set<string>()
    const addLens = (assetId: string, platformId: string) =>
      lenses.add(`${assetId}::${platformId}`)

    // Parent lenses (old + new if they differ).
    addLens(original.assetId, original.platformId)
    addLens(updated.asset_id, updated.platform_id)

    // Cash-side reconciliation. An explicit funding option (from the
    // single-row modal, which lets the user choose a funding source —
    // including `null` for "external cash, no child") always wins. When NO
    // option is passed (the bulk-sheet edit path has no funding UI, see
    // TransactionsSheetGrid), fall back to the EXISTING child's platform for a
    // buy so an in-place edit *updates* its cash_debit instead of silently
    // deleting it and inflating cash on that platform. Sells don't need this:
    // shouldCreateChild("sell", …) is always true, so their child is updated
    // in place regardless of fundingPlatformId.
    const fundingPlatformId =
      options?.fundingPlatformId !== undefined
        ? options.fundingPlatformId
        : existingChild && updated.type === TRANSACTION_TYPES.BUY
          ? existingChild.platform_id
          : null
    const needsChild = shouldCreateChild(updated.type, fundingPlatformId)

    if (existingChild) {
      addLens(existingChild.asset_id, existingChild.platform_id)
    }

    if (needsChild) {
      const cashAssetId = await resolveFiatAsset(updated.price_currency, user.id)
      const childPayload = buildChildRow({
        parent: updated,
        parentId: updated.id,
        fundingPlatformId,
        cashAssetId,
      })

      if (existingChild) {
        // Update in place — covers all the moving fields (asset, platform,
        // amount, date, currency).
        await updateTransactionQuery(existingChild.id, {
          asset_id: childPayload.asset_id,
          platform_id: childPayload.platform_id,
          type: childPayload.type,
          date: childPayload.date,
          amount: childPayload.amount,
          unit_price: childPayload.unit_price,
          price_currency: childPayload.price_currency,
          total_cost: childPayload.total_cost,
          fee: childPayload.fee,
          fee_currency: childPayload.fee_currency,
        })
      } else {
        await createTransaction(childPayload as TransactionInsert)
      }
      addLens(childPayload.asset_id, childPayload.platform_id)
    } else if (existingChild) {
      // Edit removed the child requirement (e.g. buy switched from
      // platform_deduct → external). Delete the orphan.
      await deleteTransaction(existingChild.id)
    }

    for (const lens of lenses) {
      const [assetId, platformId] = lens.split("::")
      await recalculateBalance(user.id, assetId, platformId)
    }
    await refresh()
    bumpTxVersion()
    return updated
  }

  const removeTransaction = async (
    id: string,
    assetId: string,
    platformId: string,
  ) => {
    if (!user) throw new Error("Not authenticated")

    // Capture child lens BEFORE delete — Postgres ON DELETE CASCADE will
    // remove the child row alongside the parent, but we still need to
    // recalc the cash-asset balance.
    const child = await fetchLinkedChild(id)

    await deleteTransaction(id)

    const lenses = new Set<string>([`${assetId}::${platformId}`])
    if (child) {
      lenses.add(`${child.asset_id}::${child.platform_id}`)
    }
    for (const lens of lenses) {
      const [a, p] = lens.split("::")
      await recalculateBalance(user.id, a, p)
    }
    await refresh()
    bumpTxVersion()
  }

  return {
    transactions,
    loading,
    error,
    addTransaction,
    editTransaction,
    removeTransaction,
    refetch: load,
  }
}
