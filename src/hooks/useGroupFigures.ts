import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import type { AssetGroup, ReturnMode } from "@/hooks/usePortfolio"

/** A group's figures, in whichever return mode is showing. Shared by the
 *  desktop header cells and the mobile header line so the two can never
 *  disagree. Subtotals stay gross — the after-tax (net) view lives only on
 *  taxed asset rows, so a group holding one reads slightly above the sum of
 *  its rows' net headlines (each row still shows its gross beside the net). */
export function useGroupFigures(
  group: AssetGroup,
  returnMode: ReturnMode,
  dailyReturnAvailable: boolean,
) {
  const { currency, signedMoney, display } = useDisplayMoney()
  const isDaily = returnMode === "daily"
  const returnUsd = isDaily ? group.dailyReturnUsd : group.totalPnlUsd
  const returnPct = isDaily ? group.dailyReturnPct : null
  return {
    value: display(currency === "USD" ? group.totalValueUsd : group.totalValueTry),
    // Daily mode with no prior snapshot → no figure to show.
    showReturn: !isDaily || dailyReturnAvailable,
    returnUsd,
    returnPct: isDaily ? returnPct : null,
    returnText: signedMoney(returnUsd),
  }
}
