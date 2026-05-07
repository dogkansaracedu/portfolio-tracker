import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { TransactionWithDetails } from "@/lib/queries/transactions"

interface OpenModalOptions {
  assetId?: string
  platformId?: string
  edit?: TransactionWithDetails
}

interface TransactionModalState {
  isOpen: boolean
  prefilledAssetId?: string
  prefilledPlatformId?: string
  editingTransaction?: TransactionWithDetails
}

interface TransactionContextValue {
  modalState: TransactionModalState
  openTransactionModal: (opts?: OpenModalOptions) => void
  closeTransactionModal: () => void
  /**
   * Monotonic counter bumped after any successful create/update/delete. Any
   * useTransactions instance subscribes to this so all transaction views
   * refresh together — no F5 needed.
   */
  txVersion: number
  bumpTxVersion: () => void
}

const TransactionContext = createContext<TransactionContextValue | null>(null)

export function TransactionProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<TransactionModalState>({
    isOpen: false,
  })
  const [txVersion, setTxVersion] = useState(0)

  const openTransactionModal = useCallback((opts?: OpenModalOptions) => {
    setModalState({
      isOpen: true,
      prefilledAssetId: opts?.assetId,
      prefilledPlatformId: opts?.platformId,
      editingTransaction: opts?.edit,
    })
  }, [])

  const closeTransactionModal = useCallback(() => {
    setModalState({
      isOpen: false,
      prefilledAssetId: undefined,
      prefilledPlatformId: undefined,
      editingTransaction: undefined,
    })
  }, [])

  const bumpTxVersion = useCallback(() => {
    setTxVersion((v) => v + 1)
  }, [])

  return (
    <TransactionContext.Provider
      value={{
        modalState,
        openTransactionModal,
        closeTransactionModal,
        txVersion,
        bumpTxVersion,
      }}
    >
      {children}
    </TransactionContext.Provider>
  )
}

export function useTransactionModal() {
  const context = useContext(TransactionContext)
  if (!context) {
    throw new Error("useTransactionModal must be used within TransactionProvider")
  }
  return context
}
