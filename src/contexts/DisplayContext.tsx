import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react"

type Currency = "USD" | "TRY"

interface DisplayContextValue {
  currency: Currency
  toggleCurrency: () => void
}

const STORAGE_KEY = "portfolio-display-currency"

function getInitialCurrency(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "USD" || stored === "TRY") return stored
  } catch {
    // localStorage unavailable
  }
  return "USD"
}

const DisplayContext = createContext<DisplayContextValue | undefined>(undefined)

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(getInitialCurrency)

  const toggleCurrency = useCallback(() => {
    setCurrency((prev) => {
      const next = prev === "USD" ? "TRY" : "USD"
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }, [])

  return (
    <DisplayContext.Provider value={{ currency, toggleCurrency }}>
      {children}
    </DisplayContext.Provider>
  )
}

export function useDisplayCurrency(): DisplayContextValue {
  const context = useContext(DisplayContext)
  if (context === undefined) {
    throw new Error(
      "useDisplayCurrency must be used within a DisplayProvider"
    )
  }
  return context
}
