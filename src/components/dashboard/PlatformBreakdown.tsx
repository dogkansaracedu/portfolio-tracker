import { AllocationBreakdown } from "@/components/dashboard/AllocationBreakdown"
import type { PlatformAllocation } from "@/hooks/useDashboard"

interface PlatformBreakdownProps {
  byPlatform: PlatformAllocation[]
}

export default function PlatformBreakdown({
  byPlatform,
}: PlatformBreakdownProps) {
  return (
    <AllocationBreakdown
      title="Platforms"
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
