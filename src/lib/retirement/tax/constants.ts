import type { TaxRuleId } from "@/lib/retirement/types"

/**
 * Every rate, threshold, bracket and condition the Turkish retirement tax rules
 * use — as data, each with its legal basis and source URL, transcribed from
 * docs/retirement-tax-rules.md (verified 2026-08-15).
 *
 * SOURCING RULE (docs/components/13-retirement-planning.md): nothing here comes
 * from memory. Update the reference document first — re-verified against its
 * sources — and only then these constants. Items the research could not verify
 * are marked EDITABLE ASSUMPTION and must surface in the UI as such.
 *
 * Two engine-design implications of the reference doc are binding on the rules
 * that read these constants:
 *   - bracket thresholds (§2) and the BES cap basis (§4) are NOMINAL TL re-set
 *     every year, so a multi-year projection must grow them by the scenario's
 *     TRY-inflation assumption before comparing a future TL amount against them;
 *   - rates attach to acquisition/opening dates, so the tables below are
 *     date-versioned (`…_EFFECTIVE_FROM`, `…_BASE_YEAR`), never bare numbers.
 */

export const TAX_RULE_ID = {
  foreignEquityCapitalGains: "foreign_equity_capital_gains",
  goldUntaxed: "gold_untaxed",
  besExitWithholding: "bes_exit_withholding",
  tryDepositWithholding: "try_deposit_withholding",
  flatRate: "flat_rate",
} as const satisfies Record<string, TaxRuleId>

// ─── §2 Income tax brackets — 2026, non-employment income ───────────

/**
 * Legal basis: Gelir Vergisi Genel Tebliği Seri No: 332, RG 31.12.2025 / 33124
 * (5. Mükerrer) — the ücret-dışı (non-employment) tariff that applies to değer
 * artış kazancı and dividends.
 * Source: https://www.alomaliye.com/2025/12/31/gelir-vergisi-genel-tebligi-seri-no-332-gvk-332/
 * Source: https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/2026-yili-gelir-vergisi-dilimleri-ile-dikkate-alinacak-bazi-had-ve-tutarlar-belirlendi/3351
 *
 * `upToTry: null` is the open top band. Thresholds are nominal TL for income
 * earned in the base year and MUST be indexed to the year of the taxable event
 * (see `INCOME_TAX_BRACKET_BASE_YEAR`).
 */
export interface IncomeTaxBracket {
  /** Upper bound of the band in TL of the base year; null = no upper bound. */
  upToTry: number | null
  ratePct: number
}

export const TRY_INCOME_TAX_BRACKETS: readonly IncomeTaxBracket[] = [
  { upToTry: 190_000, ratePct: 15 },
  { upToTry: 400_000, ratePct: 20 },
  { upToTry: 1_000_000, ratePct: 27 },
  { upToTry: 5_300_000, ratePct: 35 },
  { upToTry: null, ratePct: 40 },
] as const

/** The calendar year the bracket thresholds above are expressed in. */
export const INCOME_TAX_BRACKET_BASE_YEAR = 2026

// ─── §1 Foreign equity capital gains ────────────────────────────────

/**
 * Yİ-ÜFE indexation of the acquisition cost — GVK mük. 81, son fıkra: the cost
 * is uplifted by the Yİ-ÜFE increase between (acquisition month − 1) and
 * (disposal month − 1) ONLY when that increase is at least 10%; below the gate
 * the nominal cost applies.
 * Source: https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=DUYURU/UNIVERSAL/2026/Diger_Kazanc_ve_Iratlar_2026.pdf
 * Source: https://www.fatiharas.com/gvk-mukerrer-madde-80-deger-artis-kazanclari/
 */
export const YI_UFE_INDEXATION_MIN_INCREASE_PCT = 10

/**
 * There is no exemption threshold for securities: the 2026 değer artış kazancı
 * istisnası (150,000 TL) explicitly excludes them, so 1 TL of gain is
 * declarable. Kept as data so the rule reads it rather than assuming zero.
 * Source: https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=DUYURU/UNIVERSAL/2026/Diger_Kazanc_ve_Iratlar_2026.pdf
 */
export const FOREIGN_EQUITY_GAIN_EXEMPTION_TRY = 0

// ─── §4 BES (Bireysel Emeklilik Sistemi) ────────────────────────────

/**
 * Devlet katkısı is 20% — NOT the pre-2026 30% — effective 01.01.2026,
 * CBK No. 10811, RG 07.01.2026 / 33130.
 * Source: https://www.alomaliye.com/2026/01/07/bireysel-emeklilik-tasarruf-ve-yatirim-sisteminde-turk-parasi-cinsinden-yapilan-katki-payi-odemeleri/
 * Source: https://www.aa.com.tr/tr/ekonomi/bireysel-emeklilik-sisteminde-devlet-katkisi-orani-yuzde-20-oldu/3791853
 */
export const BES_STATE_CONTRIBUTION_RATE_PCT = 20
export const BES_STATE_CONTRIBUTION_RATE_EFFECTIVE_FROM = "2026-01-01"

/**
 * Annual cap basis = the annual gross minimum wage: 33,030 TL/mo × 12 =
 * 396,360 TL for 2026, so the maximum state contribution is 79,272 TL/yr.
 * Minimum-wage-linked and re-set every January — model as an annual series
 * grown by the TRY-inflation assumption, never a constant (reference doc,
 * engine-design implication 2).
 * Source: https://www.alomaliye.com/2025/12/23/2026-yili-asgari-ucreti-2026-yili-asgari-ucret-bilgilendirme/
 * Source: https://www.garantibbvaemeklilik.com.tr/bes-devlet-katkisi
 */
export const BES_STATE_CONTRIBUTION_CAP_BASIS_TRY = 396_360
export const BES_STATE_CONTRIBUTION_CAP_BASIS_BASE_YEAR = 2026

/**
 * Vesting of the state contribution and its returns, by years in the system.
 * Retirement (age 56 + 10 years in the system), death and disability vest 100%.
 * Source: https://www.garantibbvaemeklilik.com.tr/bes-devlet-katkisi
 * Source: https://www.ey.com/tr_tr/insights/tax/bes-devlet-katkisi-vergi-oranlari
 */
export interface BesVestingTier {
  /** Lowest whole year in the system this tier covers. */
  fromYears: number
  vestedPct: number
}

export const BES_VESTING_SCHEDULE: readonly BesVestingTier[] = [
  { fromYears: 0, vestedPct: 0 },
  { fromYears: 3, vestedPct: 15 },
  { fromYears: 6, vestedPct: 35 },
  { fromYears: 10, vestedPct: 60 },
] as const

/** Retirement right vests the state contribution in full. */
export const BES_RETIREMENT_RIGHT_VESTED_PCT = 100

/** Retirement right = age 56 AND 10 years of contributions (Kanun 4632). */
export const BES_RETIREMENT_RIGHT_MIN_AGE = 56
export const BES_RETIREMENT_RIGHT_MIN_YEARS = 10

/**
 * Exit withholding (stopaj) — Kanun 6327 (RG 29.06.2012, effective 29.08.2012)
 * moved the base to the irat (investment return) portion ONLY; principal, both
 * participant and state contribution, is never in the base. Rates: BKK
 * 2012/3571.
 * Source: https://www.resmigazete.gov.tr/eskiler/2012/06/20120629-1.htm
 * Source: https://www.ey.com/tr_tr/insights/tax/bes-devlet-katkisi-vergi-oranlari
 */
export const BES_EXIT_WITHHOLDING_PCT = {
  /** Fewer than 10 years of contributions. */
  belowTenYears: 15,
  /** 10+ years of contributions but no retirement right. */
  tenYearsNoRetirementRight: 10,
  /** Retirement right (56 + 10 years), death, disability, liquidation. */
  retirementRight: 5,
} as const

// ─── §5 TRY deposit interest withholding ────────────────────────────

/**
 * CBK No. 10041 (RG 09.07.2025 / 32951), extended to 31.12.2026 by CBK No.
 * 11444 (RG 20.06.2026 / 33286). Rates attach to the account's opening/renewal
 * date; accounts opened before 09.07.2025 keep their opening-date rate to
 * maturity.
 * Source: https://www.yontemymm.com.tr/mali-aciklamalar/2026-041-tl-mevduat-hesaplarinda-uygulanan-stopaj-oranlarinin-suresi-uzatildi
 * Source: https://www.grantthornton.com.tr/vergi-sirkuleri/2025-vergi-sirkuleri/mevduat-faizi-ve-yatirim-fonlarinda-stopaj-artisi/
 */
export const TRY_DEPOSIT_WITHHOLDING_PCT = {
  /** Demand accounts and maturities up to 6 months. */
  upToSixMonths: 17.5,
  /** 6 months to 1 year. */
  sixMonthsToOneYear: 15,
  /** Over 1 year. */
  overOneYear: 10,
} as const

export const TRY_DEPOSIT_WITHHOLDING_EFFECTIVE_FROM = "2025-07-09"

/**
 * EDITABLE ASSUMPTION — which maturity a multi-decade deposit plan rolls at.
 * The reference doc fixes the rates but not the saver's behaviour; a retirement
 * plan is modeled as rolling deposits longer than one year, the cheapest tier.
 * A saver rolling 3-month deposits pays `upToSixMonths` instead.
 */
export const TRY_DEPOSIT_ASSUMED_WITHHOLDING_PCT =
  TRY_DEPOSIT_WITHHOLDING_PCT.overOneYear

// ─── §6 Physical / gram gold ────────────────────────────────────────

/**
 * An individual's non-commercial physical gold gain is outside all seven GVK
 * income categories (not a menkul kıymet / sermaye piyasası aracı, so mük. 80
 * does not reach it) — no income tax and, critically, NO holding period: the
 * widely-repeated "1-year rule" for physical gold is a myth and must not be
 * implemented.
 * Source: https://www.alomaliye.com/2020/09/14/altin-ve-altina-endeksli-islemlerin-vergisel-boyutu/
 */
export const PHYSICAL_GOLD_TAX_RATE_PCT = 0

// ─── §8 TEFAS / investment funds ────────────────────────────────────

/**
 * General fund stopaj after CBK 10041 (09.07.2025) and CBK 11107 (RG
 * 27.03.2026 / 33206): money-market, debt, gold, mixed and non-TEFAS HSY
 * serbest funds are withheld at 17.5%; TEFAS-traded hisse senedi yoğun fonlar
 * are 0%. Rates lock to the unit's ACQUISITION date, so a full fund engine
 * needs a dated table per lot — v1 exposes the general rate only, for custom
 * options priced through the `flat_rate` rule.
 * Source: https://www.alomaliye.com/2026/03/27/gvk-gecici-67-nci-maddesinde-yer-alan-tevkifat-oranlari-karar-sayisi-11107/
 * Source: https://www.isportfoy.com.tr/medya-ve-blog/yatirim-fonlarina-uygulanan-stopaj-duzenlemesi-hakkinda-mart-2026
 */
export const INVESTMENT_FUND_GENERAL_WITHHOLDING_PCT = 17.5

/**
 * BIST-listed shares: 0% final withholding for resident individuals under GVK
 * geçici 67, in force through 31.12.2030 (CBK 10680, RG 11.12.2025). The 1–2
 * year holding window carries a filing-obligation ambiguity the reference doc
 * flags; the tax itself is nil either way.
 * Source: https://www.verginet.net/dtt/11/Vergi-Sirkuleri-2025-115.aspx
 */
export const BIST_EQUITY_WITHHOLDING_PCT = 0

// ─── Currency anchor ────────────────────────────────────────────────

/**
 * EDITABLE ASSUMPTION — spot USD/TRY, the level the TRY-denominated tax
 * computations are anchored on. It is NOT a tax parameter and has no legal
 * source; it is here because a progressive bracket table is not scale-free —
 * the same USD gain lands in different brackets at a different spot rate. The
 * UI must surface it as an editable assumption (ideally seeded from the app's
 * live exchange rate) rather than presenting it as law.
 * Rounded from ~47.9 TL/USD on 2026-08-14.
 * Source: https://tradingeconomics.com/turkey/currency
 */
export const ASSUMED_USD_TRY_SPOT_RATE = 48
