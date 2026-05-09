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

  // Persist + restore scroll position per route. Async data + lazy charts
  // mean content height grows after first paint; a single rAF restore
  // misses (saved scrollTop > current scrollHeight). Retry until content
  // is tall enough or 1s elapses, then settle. sessionStorage keeps state
  // tab-scoped.
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const key = `scroll:${location.pathname}`
    const saved = sessionStorage.getItem(key)
    const target = saved !== null ? parseFloat(saved) : NaN

    if (!Number.isNaN(target) && target > 0) {
      let cancelled = false
      const start = performance.now()
      const tryRestore = () => {
        if (cancelled || !el) return
        const maxTop = el.scrollHeight - el.clientHeight
        if (maxTop >= target) {
          el.scrollTop = target
          return
        }
        if (performance.now() - start < 1000) {
          requestAnimationFrame(tryRestore)
        } else {
          // Content never grew enough; clamp to current max.
          el.scrollTop = Math.max(0, maxTop)
        }
      }
      requestAnimationFrame(tryRestore)
      // Cleanup will set cancelled = true if route changes mid-restore.
      const cleanup = () => {
        cancelled = true
      }
      const onScroll = () => {
        sessionStorage.setItem(key, String(el.scrollTop))
      }
      el.addEventListener("scroll", onScroll, { passive: true })
      return () => {
        cleanup()
        el.removeEventListener("scroll", onScroll)
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
