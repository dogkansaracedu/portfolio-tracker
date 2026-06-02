import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AssetsProvider } from "@/contexts/AssetsContext"
import { AuthProvider } from "@/contexts/AuthContext"
import { DisplayProvider } from "@/contexts/DisplayContext"
import { HoldingsProvider } from "@/contexts/HoldingsContext"
import { PlatformsProvider } from "@/contexts/PlatformsContext"
import { PricesProvider } from "@/contexts/PricesContext"
import { SnapshotsProvider } from "@/contexts/SnapshotsContext"
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
            <AssetsProvider>
              <PlatformsProvider>
                <PricesProvider>
                  <TransactionDataProvider>
                    <TransactionProvider>
                      <HoldingsProvider>
                        <SnapshotsProvider>
                          <App />
                          <Toaster />
                        </SnapshotsProvider>
                      </HoldingsProvider>
                    </TransactionProvider>
                  </TransactionDataProvider>
                </PricesProvider>
              </PlatformsProvider>
            </AssetsProvider>
          </AuthProvider>
        </DisplayProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
