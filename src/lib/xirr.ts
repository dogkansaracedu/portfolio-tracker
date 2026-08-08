import { bn } from "@/lib/config"

/**
 * XIRR — the app's single money-weighted mathematical core.
 *
 * Leaf module by design: it imports nothing from `lib/performance` or `lib/mwr`,
 * so both of those can depend on it without a cycle. Everything money-weighted
 * in the app resolves to `solveXirr` — the per-period return inside
 * `subPeriodReturn` (which TWR then chains geometrically), the windowed MWR
 * series, the lifetime %/yr chip, and the what-if index. There is no second
 * formula; the Modified Dietz linear approximation this codebase used to run
 * was retired in favour of this solver.
 *
 * See docs/components/GLOSSARY.md#money-weighted-return-xirr-formula.
 */

// ─── Conventions ────────────────────────────────────────────────────

export const MS_PER_DAY = 24 * 60 * 60 * 1000

/** ACT/365.25 day count — same convention as `computeCAGR`. */
export const DAYS_PER_YEAR = 365.25

/**
 * The solver bisects on `s = ln(1 + r)` rather than on `r` directly, and brackets
 * `s` by what the flows could plausibly have done **over their own horizon**
 * rather than by an annual-rate range.
 *
 * Both halves of that matter. The log transform is what lets one bracket cover
 * every window length: a +50% day is a perfectly ordinary snapshot pair, but it
 * annualizes to r ≈ 2e64, which no linear bracket on `r` can hold. And scaling
 * the bracket by the horizon is what lets the SAME solver serve a one-day
 * snapshot pair and a five-year window: a −10% day annualizes to s ≈ −38.5,
 * far below any fixed floor sized for multi-year windows, while a fixed floor
 * wide enough for the day would overflow `exp` on the five-year case.
 *
 * So the bracket is stated as a terminal-multiple range over the horizon —
 * "somewhere between wiped out and a 10,000× bagger" — and converted to log
 * space by dividing by the horizon in years. Two consequences fall out for
 * free: every exponent the NPV evaluates is bounded by `ln(EXTREME_MULTIPLE)`,
 * so nothing overflows; and the representable range is the same *cumulative*
 * range on every window, which is the semantic callers actually reason about.
 *
 * A move outside the range (a period that truly lost 99.99%+) reports no
 * solution rather than a fabricated rate — see the null contract on `solveXirr`.
 */
const EXTREME_TERMINAL_MULTIPLE = 1e4
const LOG_EXTREME_MULTIPLE = Math.log(EXTREME_TERMINAL_MULTIPLE)

/** Bisection stops when the bracket in log space is narrower than this. */
const LOG1P_RATE_TOLERANCE = 1e-12

/** Hard cap; the tolerance above is normally hit in ~60 halvings. */
const MAX_BISECTION_ITERATIONS = 200

type Money = ReturnType<typeof bn>

// ─── Types ──────────────────────────────────────────────────────────

/** A dated external cash flow in USD. Positive = into the portfolio. */
export interface XirrFlow {
  /** `YYYY-MM-DD` (UTC midnight). */
  date: string
  amountUsd: Money
}

// ─── Date helpers ───────────────────────────────────────────────────

function utcMs(dateIso: string): number {
  return new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getTime()
}

/** Years between two `YYYY-MM-DD` dates, ACT/365.25. */
export function yearsBetween(fromIso: string, toIso: string): number {
  return (utcMs(toIso) - utcMs(fromIso)) / (MS_PER_DAY * DAYS_PER_YEAR)
}

/**
 * The cumulative fraction earned over `years`, from the solver's log-space rate:
 * `e^(s·years) − 1`, i.e. `(1+r)^years − 1`.
 *
 * Takes `s = ln(1+r)` rather than `r` on purpose. Short periods produce
 * enormous annual rates, and their INVERSE — a bad day annualizes to r ≈ −1 —
 * is where the round trip dies: a −10% day is r = −1 + 1.9e-17, which `1 + r`
 * rounds straight back to 0, printing −100% for the period. In log space that
 * same case is s = −38.5, carrying full precision. Always de-annualize from
 * `solveXirrLog1p`, never from `solveXirr`'s annual rate.
 *
 * A fractional exponent is outside BigNumber's reach, so this is a deliberate
 * plain-number boundary.
 */
export function deannualizeLog1p(logGrowth: number, years: number): Money {
  return bn(Math.expm1(logGrowth * years))
}

// ─── Solver ─────────────────────────────────────────────────────────

/**
 * `s = ln(1 + r)` for the annual rate `r` solving the XIRR equation over
 * real-dated USD flows — the solver's native output, and the form to use
 * whenever the answer is headed back to a period return (see
 * `deannualizeLog1p`). `solveXirr` wraps this to expose `r` itself.
 *
 * The equation, null contract and multiple-root caveat are documented on
 * `solveXirr`.
 */
export function solveXirrLog1p(
  flows: XirrFlow[],
  terminalValueUsd: Money,
  terminalDate: string,
): number | null {
  const active = flows.filter((f) => !f.amountUsd.isZero())
  if (active.length === 0) return null

  const originDate = active.reduce(
    (min, f) => (f.date < min ? f.date : min),
    active[0].date,
  )
  const spanYears = yearsBetween(originDate, terminalDate)
  if (!(spanYears > 0)) return null

  // Classic XIRR precondition: the signed amount vector (flows, and −V_end as
  // the terminal amount) must point both ways, else the sum of same-signed
  // exponentials can never reach zero.
  let hasInflow = false
  let hasOutflow = false
  for (const f of active) {
    if (f.amountUsd.isGreaterThan(0)) hasInflow = true
    else hasOutflow = true
  }
  if (terminalValueUsd.isGreaterThan(0)) hasOutflow = true
  else if (terminalValueUsd.isLessThan(0)) hasInflow = true
  if (!hasInflow || !hasOutflow) return null

  // Boundary: BigNumber money → plain numbers for the iterative search.
  const amounts = active.map((f) => f.amountUsd.toNumber())
  const times = active.map((f) => yearsBetween(originDate, f.date))
  const terminal = terminalValueUsd.toNumber()

  /** NPV at `s = ln(1+r)`, discounted to the time origin. */
  const npv = (s: number): number => {
    let acc = 0
    for (let i = 0; i < amounts.length; i++) {
      acc += amounts[i] * Math.exp(-s * times[i])
    }
    return acc - terminal * Math.exp(-s * spanYears)
  }

  // The furthest any term is discounted. Normally `spanYears`, but a flow dated
  // past the terminal date would reach further — bound by the true maximum so
  // no exponent can exceed ±LOG_EXTREME_MULTIPLE.
  let horizonYears = spanYears
  for (const t of times) if (t > horizonYears) horizonYears = t

  let lo = -LOG_EXTREME_MULTIPLE / horizonYears
  let hi = LOG_EXTREME_MULTIPLE / horizonYears
  let fLo = npv(lo)
  const fHi = npv(hi)
  // A root exactly on a bracket edge means the horizon's whole move was a
  // 10,000× or a wipeout to 1/10,000th — not a rate worth reporting, and `0`
  // there is just as likely to be an underflowed sum.
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null
  if (fLo === 0 || fHi === 0) return null
  if (fLo > 0 === fHi > 0) return null

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if ((hi - lo) / 2 < LOG1P_RATE_TOLERANCE) {
      lo = mid
      hi = mid
      break
    }
    const fMid = npv(mid)
    if (fMid === 0) {
      lo = mid
      hi = mid
      break
    }
    if (fMid > 0 === fLo > 0) {
      lo = mid
      fLo = fMid
    } else {
      hi = mid
    }
  }

  return (lo + hi) / 2
}

/**
 * The annual rate `r` solving the XIRR equation over real-dated USD flows:
 *
 *   Σ C_i · (1+r)^(−y_i) − V_end · (1+r)^(−Y) = 0
 *
 * `C_i` positive = into the portfolio (the sign convention of
 * `externalCashFlowUsd`), `y_i` its time in years from the first flow, `Y` the
 * time from the first flow to `terminalDate`. Choosing the first flow as the
 * time origin is free — scaling every term by a constant power of (1+r) does
 * not move the root.
 *
 * Bracketed bisection in log space (see `EXTREME_TERMINAL_MULTIPLE`). Returns
 * null — never a fabricated 0 — when the inputs are degenerate (no flows,
 * non-positive span, every signed amount pointing the same way) or the bracket
 * holds no sign change. Callers render "—" or treat the period as neutral.
 *
 * Money is assembled as BigNumber and converted to plain numbers at the
 * boundary: the iterative search is transcendental (`exp`/`pow`), which
 * BigNumber cannot express — same tradeoff `computeCAGR` makes.
 *
 * Use this only where an ANNUALIZED figure is the answer (a "%/yr" readout).
 * To get a period return, go through `solveXirrLog1p` + `deannualizeLog1p` —
 * `r` alone cannot survive the round trip on short spans.
 *
 * Caveat inherited from every XIRR: with sign-alternating flows the equation
 * can admit multiple roots; bisection returns the one inside the bracket.
 */
export function solveXirr(
  flows: XirrFlow[],
  terminalValueUsd: Money,
  terminalDate: string,
): Money | null {
  const logGrowth = solveXirrLog1p(flows, terminalValueUsd, terminalDate)
  return logGrowth === null ? null : bn(Math.expm1(logGrowth))
}
