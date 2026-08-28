import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AssetsProvider } from "@/contexts/AssetsContext"
import { AuthProvider } from "@/contexts/AuthContext"
import { BudgetProvider } from "@/contexts/BudgetContext"
import { CampaignsProvider } from "@/contexts/CampaignsContext"
import { DisplayProvider } from "@/contexts/DisplayContext"
import { HoldingsProvider } from "@/contexts/HoldingsContext"
import { InterestProvider } from "@/contexts/InterestContext"
import { PlatformsProvider } from "@/contexts/PlatformsContext"
import { PricesProvider } from "@/contexts/PricesContext"
import { RetirementScenarioProvider } from "@/contexts/RetirementScenarioContext"
import { SnapshotsProvider } from "@/contexts/SnapshotsContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { TransactionProvider } from "@/contexts/TransactionContext"
import { TransactionDataProvider } from "@/contexts/TransactionDataContext"
import { Toaster } from "@/components/ui/sonner"
import App from "./App"
import { initAnalytics } from "@/lib/analytics"
import "./index.css"

initAnalytics()

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
                          <RetirementScenarioProvider>
                            <BudgetProvider>
                              <CampaignsProvider>
                                <InterestProvider>
                                  <App />
                                  <Toaster />
                                </InterestProvider>
                              </CampaignsProvider>
                            </BudgetProvider>
                          </RetirementScenarioProvider>
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
