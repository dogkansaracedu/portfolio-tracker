# Component 7: Dashboard

## Status: Done

## Overview
Build the main dashboard page — the primary view after login. Shows total net worth (USD/TRY toggle), daily change, allocation donut chart, platform breakdown, top movers, and monthly performance sparkline from snapshots.

## Dependencies
- Component 5 (Price Engine)
- Component 6 (P&L Engine)
- Component 3 (Platform & Asset Management)

## File Structure
```
src/
├── pages/
│   └── DashboardPage.tsx
├── components/
│   └── dashboard/
│       ├── NetWorthCard.tsx
│       ├── AllocationChart.tsx
│       ├── PlatformBreakdown.tsx
│       ├── TopMovers.tsx
│       └── PerformanceSparkline.tsx
├── hooks/
│   └── useDashboard.ts
```

## Tasks
1. **useDashboard hook**: Combines useAssets + usePrices + usePnL. Computes:
   - totalValueUsd / totalValueTry: SUM(balance * price) for all active assets
   - byCategory: group by category, sum values, return { category, valueUsd, valueTry, percentage }[]
   - byPlatform: group by platform, sum values, return { platformName, color, valueUsd, valueTry, percentage }[]
   - topMovers: assets sorted by unrealized P&L % (as proxy for 24h change in MVP)

2. **NetWorthCard**: Large card at top. Total value in selected currency ($51,409 or ₺2,288,312). Secondary: other currency (smaller). Daily change in green/red (compare to most recent snapshot, or hide if no snapshot exists). Uses shadcn Card

3. **AllocationChart**: Donut/ring chart via Recharts PieChart + Pie + Cell. Segments per category (Fiat=slate, Crypto=orange, BIST=red, US Stock=blue, Commodity=amber). Center text: total value. Legend with category name, value, percentage. Responsive

4. **PlatformBreakdown**: Styled list with percentage-width colored bars (not a Recharts chart). Each row: platform name, color bar proportional to value, value amount, percentage. More readable than a chart for 5-10 platforms

5. **TopMovers**: List of 5 assets with highest absolute USD change. Each: asset name, platform (small), current value, change amount, change %. Green/red. For MVP: shows unrealized P&L, labeled transparently

6. **PerformanceSparkline**: Small Recharts LineChart from last 12 snapshots. X: month labels, Y: value (auto-scaled). If <2 snapshots: placeholder "Take your first snapshot to see trends". Clickable → navigates to /performance

7. **DashboardPage layout**:
   - Row 1: NetWorthCard (full width)
   - Row 2: AllocationChart (1/2) + PlatformBreakdown (1/2)
   - Row 3: TopMovers (1/2) + PerformanceSparkline (1/2)
   - Mobile: single column, stacked
   - `grid grid-cols-1 md:grid-cols-2 gap-4`

8. **Loading states**: Skeleton loaders (shadcn Skeleton) per card while data loads

9. **Empty states**: If no assets: "Add your first platform and assets to get started" with link to Settings

10. **Currency-aware**: All values respect CurrencyToggle. Re-render on toggle

## UI Components
- **shadcn/ui**: Card, CardHeader, CardContent, CardTitle, CardDescription, Skeleton, Badge
- **Recharts**: PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
- **Custom**: NetWorthCard, AllocationChart, PlatformBreakdown, TopMovers, PerformanceSparkline

## Key Decisions
- **No real-time updates**: Fetched on page load + price refresh. No WebSocket
- **Daily change approximate**: Compared to previous snapshot or omitted. Fine for "check once a day" use case
- **TopMovers uses unrealized P&L**: True 24h change needs price history. P&L is a useful proxy
- **Donut over pie**: More modern, shows total in center
- **Platform breakdown as styled list**: More readable than horizontal bar chart, simpler, more responsive

## Acceptance Criteria
- [ ] Dashboard shows total net worth in USD and TRY (respects toggle)
- [ ] Allocation donut shows breakdown by category with correct percentages
- [ ] Platform breakdown shows each platform's value with colored bars
- [ ] Top movers shows assets sorted by unrealized P&L
- [ ] Sparkline renders if snapshots exist; placeholder if not
- [ ] Skeleton loaders while data loads
- [ ] Empty state if no assets configured
- [ ] Responsive: two columns desktop, single column mobile
