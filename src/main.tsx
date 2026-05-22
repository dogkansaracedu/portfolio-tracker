import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/AuthContext"
import { DisplayProvider } from "@/contexts/DisplayContext"
import { PricesProvider } from "@/contexts/PricesContext"
import { SnapshotsProvider } from "@/contexts/SnapshotsContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { TransactionProvider } from "@/contexts/TransactionContext"
import { TransactionDataProvider } from "@/contexts/TransactionDataContext"
import { AssetSheetProvider } from "@/contexts/AssetSheetContext"
import { Toaster } from "@/components/ui/sonner"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <DisplayProvider>
          <AuthProvider>
            <PricesProvider>
              <TransactionDataProvider>
                <TransactionProvider>
                  <AssetSheetProvider>
                    <SnapshotsProvider>
                      <App />
                      <Toaster />
                    </SnapshotsProvider>
                  </AssetSheetProvider>
                </TransactionProvider>
              </TransactionDataProvider>
            </PricesProvider>
          </AuthProvider>
        </DisplayProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
