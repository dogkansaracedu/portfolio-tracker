import {
  RETURN_CURRENCY,
  WITHDRAWAL_STRATEGY,
} from "@/lib/retirement/constants"
import { TAX_RULE_ID } from "@/lib/retirement/tax/constants"
import type {
  ComparisonOption,
  RetirementScenarioInputs,
} from "@/lib/retirement/types"

/**
 * First-use defaults: the four preset comparison options and a working scenario
 * behind them.
 *
 * Every number here is a ROUND, EDITABLE assumption — a long-run average with a
 * source, never a forecast. They are stored in the scenario the moment the user
 * saves, so editing one changes that scenario and nothing else. Precision is
 * deliberately absent: a return quoted to two decimals would imply a confidence
 * no source supports.
 *
 * Tax rates are NOT here — those live in tax/constants.ts with their legal
 * basis. What an option earns is an assumption; what it is taxed is law.
 */

export const RETIREMENT_OPTION_ID = {
  usEquities: "us_equities",
  gold: "gold",
  bes: "bes",
  tryDeposit: "try_deposit",
} as const

export const RETIREMENT_OPTION_PRESETS: readonly ComparisonOption[] = [
  {
    id: RETIREMENT_OPTION_ID.usEquities,
    name: "US equities (S&P 500)",
    /**
     * ~10%/yr nominal USD, dividends reinvested — the geometric (CAGR) average
     * of the 1928–2025 annual series; the 30-year window is ~10.4%, which is
     * why 10 is the round default. The arithmetic mean (~12%) is higher and is
     * the wrong statistic for compounding a plan.
     * Source: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html
     * Source: https://www.fidelity.com/learning-center/trading-investing/sp-500-average-return
     */
    expectedReturn: { pessimistic: 7, base: 10, optimistic: 12 },
    returnCurrency: RETURN_CURRENCY.usd,
    taxRuleId: TAX_RULE_ID.foreignEquityCapitalGains,
  },
  {
    id: RETIREMENT_OPTION_ID.gold,
    name: "Gold",
    /**
     * ~8%/yr nominal USD annualised since 1971 (World Gold Council). The same
     * source's forward-looking model expects nearer 5%/yr over the next 15
     * years, which is the pessimistic leg's justification.
     * Source: https://www.gold.org/goldhub/research/relevance-of-gold-as-a-strategic-asset/return
     */
    expectedReturn: { pessimistic: 5, base: 8, optimistic: 10 },
    returnCurrency: RETURN_CURRENCY.usd,
    taxRuleId: TAX_RULE_ID.goldUntaxed,
  },
  {
    id: RETIREMENT_OPTION_ID.bes,
    name: "BES",
    /**
     * EDITABLE ASSUMPTION — no published long-run BES return series exists.
     * EGM publishes per-fund, per-year figures only, and the dispersion is
     * enormous (2025 system average 60.9% against 30.9% inflation, but the
     * equity funds returned 11.7% that same year — a large real loss). The 30%
     * default is roughly the forward TRY-inflation assumption plus a small real
     * premium, and should be treated as a placeholder, not a finding.
     * Source: https://emeklilik.egm.org.tr/eyf-detay
     * Source: https://www.dunya.com/ekonomi/altindan-sonra-en-yuksek-getiri-bes-fonlarindan-haberi-835642
     */
    expectedReturn: { pessimistic: 20, base: 30, optimistic: 45 },
    returnCurrency: RETURN_CURRENCY.try,
    taxRuleId: TAX_RULE_ID.besExitWithholding,
  },
  {
    id: RETIREMENT_OPTION_ID.tryDeposit,
    name: "TRY deposit",
    /**
     * EDITABLE ASSUMPTION — there is no clean published 1-year TRY deposit
     * benchmark: Turkish banks price retail deposits at 32-day/3-month tenors
     * and the curve is inverted, so quoted 1-year rates sit below the short
     * end. TCMB's weekly weighted-average 1–3 month TL deposit rate was 39.6%
     * on 31.07.2026 against a 37% policy rate; 35% gross is the round default
     * for a long deposit.
     * Source: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Faiz+Istatistikleri/Haftalik/Mevduat+Faiz+Oranlari/
     */
    expectedReturn: { pessimistic: 28, base: 35, optimistic: 42 },
    returnCurrency: RETURN_CURRENCY.try,
    taxRuleId: TAX_RULE_ID.tryDepositWithholding,
  },
] as const

/**
 * A working scenario on first entry — the spec requires a rendered projection
 * before any input is touched. `startingAmountUsd: null` seeds from the live
 * portfolio's current total value.
 */
export const DEFAULT_RETIREMENT_SCENARIO_INPUTS: RetirementScenarioInputs = {
  startingAmountUsd: null,
  monthlyContributionUsd: 1000,
  contributionGrowthPct: 0,
  currentAge: 35,
  retirementAge: 60,
  depletionAge: 90,
  monthlySpendingUsd: 3000,
  /** The Trinity-study 4% rule, the field's default starting point. */
  safeWithdrawalRatePct: 4,
  withdrawalStrategy: WITHDRAWAL_STRATEGY.preservation,
  /** The US-equities preset, since it is the plan most portfolios approximate. */
  primaryExpectedReturn: { pessimistic: 7, base: 10, optimistic: 12 },
  /**
   * 3%/yr — long-run realised US CPI (the ~10% nominal vs ~7% real spread on
   * the Damodaran series above). The Fed's stated longer-run objective is 2%;
   * planning on what history delivered is the more conservative choice.
   * Source: https://www.federalreserve.gov/faqs/economy_14400.htm
   */
  usdInflationPct: 3,
  /**
   * 25%/yr — TÜİK annual TÜFE was 31.75% in July 2026 while TCMB's 2026-III
   * Inflation Report (13.08.2026) puts year-end 2026 at 28% and 2027 at 15%,
   * so a multi-year forward assumption sits between the reading and the path.
   * Source: https://www.sbb.gov.tr/2026-yili-temmuz-ayi-tuketici-ve-uretici-fiyat-gelismeleri-aciklandi/
   * Source: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Enflasyon+Raporu
   */
  tryInflationPct: 25,
  /**
   * 20%/yr — USD/TRY rose ~17% over the 12 months to 14.08.2026 and ~20%/yr
   * over three years. The five-year average (~40%/yr) is dominated by the
   * 2021–22 collapse and embeds a policy regime that is not the current one.
   * Source: https://tradingeconomics.com/turkey/currency
   */
  tryDepreciationPct: 20,
  options: [...RETIREMENT_OPTION_PRESETS],
}
