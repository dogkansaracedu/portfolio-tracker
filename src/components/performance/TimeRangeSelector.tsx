import type { TimeRange } from "@/lib/performance"

const ranges: TimeRange[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"]

interface Props {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === range
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {range}
        </button>
      ))}
    </div>
  )
}
