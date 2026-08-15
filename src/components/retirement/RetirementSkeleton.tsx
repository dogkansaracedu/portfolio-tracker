import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Placeholder while the saved scenarios load. */
export function RetirementSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-[300px]" />
        </CardContent>
      </Card>
    </div>
  )
}
