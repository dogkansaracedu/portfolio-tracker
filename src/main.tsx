import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/AuthContext"
import { DisplayProvider } from "@/contexts/DisplayContext"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <DisplayProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DisplayProvider>
    </TooltipProvider>
  </StrictMode>,
)
