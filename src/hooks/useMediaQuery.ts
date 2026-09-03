import { useEffect, useState } from "react"

/**
 * Subscribes to a CSS media query from React.
 *
 * Only for the places CSS cannot reach — chart libraries size their plot area
 * in JavaScript, so an axis hidden with a Tailwind variant would still reserve
 * its width. Layout that CSS can express stays in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

/** Tailwind's own breakpoints, so a JS check can never drift from the CSS. */
export const MEDIA_QUERY = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
  xl: "(min-width: 80rem)",
} as const
