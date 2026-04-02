import { Link } from "react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PerformanceSparkline() {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <p className="text-center text-sm text-muted-foreground">
          Take your first snapshot to see performance trends.
        </p>
        <Link
          to="/performance"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Go to Performance
        </Link>
      </CardContent>
    </Card>
  )
}
