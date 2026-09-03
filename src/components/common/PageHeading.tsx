interface PageHeadingProps {
  title: string
  /** The one-line "what this page is for". Omitted by hub pages. */
  subtitle?: React.ReactNode
}

/**
 * A page's title block. The phone header already names every page, so this
 * exists only from `md` up — which is what puts each page's first real row
 * (a holding, a transaction, a scenario) inside the first phone screen.
 *
 * One component rather than the block repeated per page: the breakpoint that
 * hides it is the app-wide rule, not a per-page choice.
 */
export function PageHeading({ title, subtitle }: PageHeadingProps) {
  return (
    <div className="hidden md:block">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
