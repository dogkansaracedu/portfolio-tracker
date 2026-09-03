import { useCallback, useState } from "react"

/**
 * A write whose failure is REPORTED, on the surface that made it.
 *
 * The pattern the retirement panel settled on, in one place: a rejected write
 * lands in `error` (render it in the app's error slot) and `reported` resolves
 * `false` instead of rejecting — because an unhandled rejection is not a
 * report, and a `void write()` that silently loses its rejection lets a failed
 * edit look exactly like one that reverted on purpose.
 *
 * The boolean is what the caller needs to decide what to do next: keep an
 * editor open with the typed value, or close it because the write landed.
 *
 * (`useRetirementPlanner` keeps its own copy: its `error` is part of the
 * planner's published interface and split across two reporting owners.)
 */
export function useReportedWrite(fallbackMessage: string) {
  const [error, setError] = useState<string | null>(null)

  const reported = useCallback(
    async (write: Promise<unknown>): Promise<boolean> => {
      try {
        await write
        setError(null)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage)
        return false
      }
    },
    [fallbackMessage],
  )

  return { error, reported }
}
