import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/AuthContext"
import { DisplayProvider } from "@/contexts/DisplayContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { TransactionProvider } from "@/contexts/TransactionContext"
import { TransactionDataProvider } from "@/contexts/TransactionDataContext"
import { Toaster } from "@/components/ui/sonner"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <DisplayProvider>
          <AuthProvider>
            <TransactionDataProvider>
              <TransactionProvider>
                <App />
                <Toaster />
              </TransactionProvider>
            </TransactionDataProvider>
          </AuthProvider>
        </DisplayProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
