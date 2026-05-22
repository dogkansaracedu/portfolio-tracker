import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

interface AssetSheetState {
  isOpen: boolean
  assetId: string | null
}

interface AssetSheetValue {
  state: AssetSheetState
  open: (assetId: string) => void
  close: () => void
}

const AssetSheetContext = createContext<AssetSheetValue | null>(null)

/** Lifts open/close state for the per-asset transactions Sheet so any row in
 *  the Portfolio table can trigger it without owning the dialog itself. */
export function AssetSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AssetSheetState>({
    isOpen: false,
    assetId: null,
  })

  const open = useCallback((assetId: string) => {
    setState({ isOpen: true, assetId })
  }, [])

  const close = useCallback(() => {
    setState({ isOpen: false, assetId: null })
  }, [])

  return (
    <AssetSheetContext.Provider value={{ state, open, close }}>
      {children}
    </AssetSheetContext.Provider>
  )
}

export function useAssetSheet() {
  const v = useContext(AssetSheetContext)
  if (!v) throw new Error("useAssetSheet must be used within AssetSheetProvider")
  return v
}
