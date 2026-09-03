/**
 * The vocabulary for return figures — one term, one hint, app-wide.
 *
 * Every cumulative percentage this app shows beside a money figure is
 * money-weighted (XIRR). It is called **MWR** everywhere: the dashboard hero's
 * chip, the Portfolio summary bar, the Asset Detail total return. The `/yr`
 * suffix is reserved for the annualised reading — never on a cumulative one.
 */
export const MWR_LABEL = "MWR"

/** Suffix for an annualised reading only ("MWR 12.3%/yr"). */
export const MWR_PER_YEAR_SUFFIX = "/yr"

/** The one explainer, shown on hover AND on tap (never a bare `title`). */
export const MWR_HINT =
  "Cumulative money-weighted (XIRR) return — what each dollar earned for the time it was invested."

/** The annualised variant of the same explainer. */
export const MWR_PER_YEAR_HINT =
  "Money-weighted (XIRR) return as an annual rate, across every deposit and withdrawal."

/** Time-weighted return — the hero's alternative measure. */
export const TWR_LABEL = "TWR"
