import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface TransactionModalState {
  isOpen: boolean
  prefilledAssetId?: string
  prefilledPlatformId?: string
}

interface TransactionContextValue {
  modalState: TransactionModalState
  openTransactionModal: (assetId?: string, platformId?: string) => void
  closeTransactionModal: () => void
}

const TransactionContext = createContext<TransactionContextValue | null>(null)

export function TransactionProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<TransactionModalState>({
    isOpen: false,
  })

  const openTransactionModal = useCallback((assetId?: string, platformId?: string) => {
    setModalState({ isOpen: true, prefilledAssetId: assetId, prefilledPlatformId: platformId })
  }, [])

  const closeTransactionModal = useCallback(() => {
    setModalState({ isOpen: false, prefilledAssetId: undefined, prefilledPlatformId: undefined })
  }, [])

  return (
    <TransactionContext.Provider
      value={{ modalState, openTransactionModal, closeTransactionModal }}
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
