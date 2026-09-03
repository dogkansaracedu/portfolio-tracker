import { SegmentedControl } from "@/components/common/SegmentedControl"
import type { TimeRange } from "@/lib/performance"

const RANGES: { id: TimeRange; label: string }[] = (
  ["1M", "3M", "6M", "YTD", "1Y", "ALL"] as TimeRange[]
).map((id) => ({ id, label: id }))

interface Props {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeSelector({ value, onChange }: Props) {
  return (
    <SegmentedControl
      ariaLabel="Time range"
      value={value}
      options={RANGES}
      onChange={onChange}
      size="sm"
    />
  )
}
