import { useEffect, useRef } from "react"
import { Outlet, useLocation } from "react-router"
import Sidebar from "./Sidebar"
import MobileNav from "./MobileNav"
import Header from "./Header"
import { AddTransactionModal } from "@/components/transactions/AddTransactionModal"
import { useAssets } from "@/hooks/useAssets"
import { usePlatforms } from "@/hooks/usePlatforms"
import { useHoldings } from "@/hooks/useHoldings"

export default function AppLayout() {
  const { assets } = useAssets()
  const { platforms } = usePlatforms()
  const { refetch: refetchHoldings } = useHoldings()
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()

  // Persist + restore scroll position per route. The main element re-mounts
  // when auth tokens refresh on tab focus return, which would otherwise
  // reset scroll to 0. sessionStorage scope ties this to the tab session.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const key = `scroll:${location.pathname}`
    const saved = sessionStorage.getItem(key)
    if (saved) {
      const top = parseFloat(saved)
      if (!Number.isNaN(top)) {
        // Restore after first paint so any layout shifts settle first.
        requestAnimationFrame(() => {
          el.scrollTop = top
        })
      }
    }
    const onScroll = () => {
      sessionStorage.setItem(key, String(el.scrollTop))
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6"
        >
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <AddTransactionModal
        assets={assets}
        platforms={platforms}
        onSuccess={refetchHoldings}
      />
    </div>
  )
}
