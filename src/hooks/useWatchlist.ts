import { useCallback, useEffect, useState } from "react"
import type { WatchlistRow } from "@/types/database"
import {
  addWatchlistItem,
  fetchWatchlist,
  removeWatchlistItem,
  saveWatchlistOrder,
} from "@/lib/queries/watchlist"
import { useReportedWrite } from "@/hooks/useReportedWrite"
import { WATCHLIST_COPY } from "@/lib/constants/watchlist"

/**
 * The watchlist page's state. Writes apply locally first and roll back to the
 * server's list when they fail; the failure lands in `error`.
 */
export function useWatchlist() {
  const [items, setItems] = useState<WatchlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const { error, reported } = useReportedWrite(WATCHLIST_COPY.writeFailed)

  const reload = useCallback(async () => {
    try {
      setItems(await fetchWatchlist())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reported(reload())
  }, [reload, reported])

  const add = useCallback(
    async (assetId: string) => {
      const sortOrder = items.reduce((max, i) => Math.max(max, i.sort_order + 1), 0)
      const ok = await reported(
        addWatchlistItem({ asset_id: assetId, sort_order: sortOrder }).then((row) =>
          setItems((prev) => [...prev, row]),
        ),
      )
      if (!ok) void reload()
    },
    [items, reported, reload],
  )

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (!(await reported(removeWatchlistItem(id)))) void reload()
    },
    [reported, reload],
  )

  /** Swap an item with its neighbour; `sort_order` becomes the list index. */
  const move = useCallback(
    async (id: string, direction: -1 | 1) => {
      const from = items.findIndex((i) => i.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= items.length) return
      const next = [...items]
      ;[next[from], next[to]] = [next[to], next[from]]
      const reordered = next.map((item, index) => ({ ...item, sort_order: index }))
      const changed = reordered.filter(
        (item, index) => items.find((i) => i.id === item.id)?.sort_order !== index,
      )
      setItems(reordered)
      if (!(await reported(saveWatchlistOrder(changed)))) void reload()
    },
    [items, reported, reload],
  )

  return { items, loading, error, add, remove, move }
}
