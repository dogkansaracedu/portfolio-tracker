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
  obfuscated: boolean
  toggleObfuscated: () => void
}

const CURRENCY_KEY = "portfolio-display-currency"
const OBFUSCATE_KEY = "portfolio-obfuscated"

function getInitialCurrency(): Currency {
  try {
    const stored = localStorage.getItem(CURRENCY_KEY)
    if (stored === "USD" || stored === "TRY") return stored
  } catch {}
  return "USD"
}

function getInitialObfuscated(): boolean {
  try {
    return localStorage.getItem(OBFUSCATE_KEY) === "true"
  } catch {}
  return false
}

const DisplayContext = createContext<DisplayContextValue | undefined>(undefined)

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(getInitialCurrency)
  const [obfuscated, setObfuscated] = useState(getInitialObfuscated)

  const toggleCurrency = useCallback(() => {
    setCurrency((prev) => {
      const next = prev === "USD" ? "TRY" : "USD"
      try { localStorage.setItem(CURRENCY_KEY, next) } catch {}
      return next
    })
  }, [])

  const toggleObfuscated = useCallback(() => {
    setObfuscated((prev) => {
      const next = !prev
      try { localStorage.setItem(OBFUSCATE_KEY, String(next)) } catch {}
      return next
    })
  }, [])

  return (
    <DisplayContext.Provider value={{ currency, toggleCurrency, obfuscated, toggleObfuscated }}>
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
