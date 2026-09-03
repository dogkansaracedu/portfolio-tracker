import type { DisplayCurrency } from "@/lib/constants/currencies"
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react"

interface DisplayContextValue {
  currency: DisplayCurrency
  toggleCurrency: () => void
  obfuscated: boolean
  toggleObfuscated: () => void
}

const CURRENCY_KEY = "portfolio-display-currency"
const OBFUSCATE_KEY = "portfolio-obfuscated"

function getInitialCurrency(): DisplayCurrency {
  try {
    const stored = localStorage.getItem(CURRENCY_KEY)
    if (stored === "USD" || stored === "TRY") return stored
  } catch {
    // Storage can be unavailable (private mode, site data blocked); the
    // default below is the right answer either way.
  }
  return "USD"
}

function getInitialObfuscated(): boolean {
  try {
    return localStorage.getItem(OBFUSCATE_KEY) === "true"
  } catch {
    // Storage can be unavailable (private mode, site data blocked); the
    // default below is the right answer either way.
  }
  return false
}

const DisplayContext = createContext<DisplayContextValue | undefined>(undefined)

export function DisplayProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<DisplayCurrency>(getInitialCurrency)
  const [obfuscated, setObfuscated] = useState(getInitialObfuscated)

  const toggleCurrency = useCallback(() => {
    setCurrency((prev) => {
      const next = prev === "USD" ? "TRY" : "USD"
      // A failed write only costs persistence across reloads, never the
      // toggle itself — so the preference still applies this session.
      try { localStorage.setItem(CURRENCY_KEY, next) } catch { /* not persisted */ }
      return next
    })
  }, [])

  const toggleObfuscated = useCallback(() => {
    setObfuscated((prev) => {
      const next = !prev
      // A failed write only costs persistence across reloads, never the
      // toggle itself — so the preference still applies this session.
      try { localStorage.setItem(OBFUSCATE_KEY, String(next)) } catch { /* not persisted */ }
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
