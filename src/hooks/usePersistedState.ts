import { useCallback, useEffect, useState } from "react"

/**
 * useState whose value is mirrored to localStorage under `key`. On mount the
 * stored value (if any) overrides the provided default. Survives component
 * re-mounts caused by tab visibility changes / auth token refreshes — the
 * tab itself stays open so localStorage persists.
 *
 * Stores JSON. For primitive types (string, number, boolean) the JSON
 * round-trip is a no-op; complex shapes are also fine if they're
 * serializable.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return defaultValue
      return JSON.parse(raw) as T
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota / private mode — ignore silently
    }
  }, [key, value])

  const set = useCallback((next: T) => setValue(next), [])

  return [value, set]
}
