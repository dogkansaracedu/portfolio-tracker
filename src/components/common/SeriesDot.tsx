/**
 * A chart series' colour swatch, inline in the label that names the series.
 *
 * This app puts its legends ON the existing chips and toggles rather than in a
 * legend row of their own (a row would cost a line above a 220px phone chart),
 * so the swatch has to sit inside a line of text: hence `align-middle` and the
 * trailing gap. Decorative — the text beside it carries the name.
 */
export function SeriesDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block size-2 shrink-0 rounded-full align-middle"
      style={{ backgroundColor: color }}
    />
  )
}
