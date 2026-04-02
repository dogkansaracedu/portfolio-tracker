import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/prices"

const categoryLabels: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
}

interface Props {
  data: {
    category: string
    startUsd: number
    endUsd: number
    changeUsd: number
    contributionPct: number
  }[]
}

export function CategoryAttribution({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Need at least 2 snapshots.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Category Attribution</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Start</TableHead>
              <TableHead className="text-right">End</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Contribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.category}>
                <TableCell className="font-medium">
                  {categoryLabels[row.category] ?? row.category}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.startUsd, "USD")}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.endUsd, "USD")}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    row.changeUsd >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {row.changeUsd >= 0 ? "+" : ""}
                  {formatCurrency(row.changeUsd, "USD")}
                </TableCell>
                <TableCell
                  className={`text-right ${
                    row.contributionPct >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {row.contributionPct >= 0 ? "+" : ""}
                  {row.contributionPct.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
