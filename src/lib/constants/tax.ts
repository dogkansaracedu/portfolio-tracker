/**
 * Turkish annual declaration thresholds (GVK 86/1-d) for foreign,
 * non-withheld dividend + interest income. The amount is revalued yearly, so
 * unknown years deliberately return null instead of silently reusing an old
 * legal threshold.
 *
 * Source: Gelir İdaresi Başkanlığı (GİB), Menkul Sermaye İradı.
 * https://gib.gov.tr/vergi-konulari/1_bireysel/10_menkul_sermaye_iradi/10
 */
export const FOREIGN_INCOME_DECLARATION_THRESHOLDS_TRY: Readonly<
  Record<number, number>
> = {
  2025: 18_000,
  2026: 22_000,
}

export const FOREIGN_INCOME_THRESHOLD_SOURCE_URL =
  "https://gib.gov.tr/vergi-konulari/1_bireysel/10_menkul_sermaye_iradi/10"

export function foreignIncomeDeclarationThresholdTry(
  year: number,
): number | null {
  return FOREIGN_INCOME_DECLARATION_THRESHOLDS_TRY[year] ?? null
}
