import { AllocationBreakdown } from "@/components/dashboard/AllocationBreakdown"
import type { PlatformAllocation } from "@/hooks/useDashboard"

interface PlatformBreakdownProps {
  byPlatform: PlatformAllocation[]
}

export default function PlatformBreakdown({
  byPlatform,
}: PlatformBreakdownProps) {
  const largest = byPlatform[0]
  const description = largest
    ? `${largest.percentage >= 50 ? "Concentrated" : "Largest platform"}: ${largest.platformName} at ${largest.percentage.toFixed(1)}%`
    : undefined

  return (
    <AllocationBreakdown
      title="Platforms"
      description={description}
      actionLabel="View by platform"
      actionTo="/portfolio?groupBy=platform"
      emptyText="No platforms to display."
      rows={byPlatform.map((platform) => ({
        label: platform.platformName,
        // Each platform carries its own colour, the one the dots use everywhere.
        color: platform.color,
        valueUsd: platform.valueUsd,
        valueTry: platform.valueTry,
        percentage: platform.percentage,
      }))}
    />
  )
}
