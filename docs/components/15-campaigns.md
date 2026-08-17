# Component 15: Campaigns — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/15-campaigns.md](technical/15-campaigns.md)

## Purpose

Surface **current earn/reward opportunities** — staking, flexible/locked earn,
launchpools, hold-to-earn promos, airdrops — across a curated watch list of
exchanges, wallets, and on-chain programs, so the investor can decide where
idle coins should sit. The dataset is refreshed by an automated **research
pass** (default weekly) that reads the public web; the app itself only stores,
groups, and displays what research found. The app never executes anything on
an exchange — it is a recommendation surface, not a trading surface.

## Depends on

- Component 2 (data store & auth) — shared-read storage, service-side writes.
- Component 3 (asset catalog + holdings) — the global crypto ticker list scopes
  the research; the user's own holdings drive personalization.
- Component 5 (price engine) — cached prices convert "you hold X of this coin"
  into a yearly-reward estimate.

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Campaign](GLOSSARY.md#campaign) — one earn/reward opportunity on one platform.
- [Research run](GLOSSARY.md#research-run) — one automated pass that produced a
  batch of campaigns.
- [Holding](GLOSSARY.md#holding) — used read-only for personalization.

## Behaviors / rules

### Global dataset, personal grouping

- Campaign data is **global and shared**, like the asset catalog: one research
  pass serves every user. Users cannot write campaign data; only the system's
  research/ingest path can.
- Personalization happens **at read time**: the same rows are grouped per user
  by intersecting campaign tickers with the coins that user actually holds.

### What a campaign row records

Intrinsic facts only (nothing user-specific):

- **Asset ticker** — free text; a campaign may reward a coin that is not in the
  asset catalog (e.g. a new listing).
- **Platform** — the exchange / wallet / protocol running it (from the watch
  list, though research may also report notable finds elsewhere).
- **Program type** — one of: flexible earn, locked earn, staking, launchpool,
  hold-to-earn, promo (boosted/limited-time rate), airdrop.
- **Reward** — either a rate (APR/APY as a percentage, with a kind: fixed /
  variable / "up to") **or** a prose reward description ("hold ≥ 0.1 ETH
  through September → receive N tokens"), or both.
- **Terms** — lock duration in days (0/absent = flexible), minimum / maximum
  amount with its currency, free-text conditions (the fine print), and an
  optional deadline date.
- **Stable-value flag** — whether the earning asset is parked value: a
  stablecoin **or tokenized gold** (e.g. PAXG, XAUT). (Stored under the
  historical name "stablecoin"; the meaning is the broader one.)
- **Provenance** — source URL and the date research found it.

### Research pass

- Runs on a schedule (default **weekly**, but a pass is skipped while the
  latest successful one is fresher than 10 days — cost control on the free
  research budget; a manual forced pass overrides). Structured products whose
  principal can settle in a different asset (e.g. dual investment) are never
  campaigns — excluded at research time and dropped defensively if reported.
  Each pass:
  1. Scopes coins from the **global asset catalog** (crypto + stablecoins) and
     platforms from the configured **watch list**.
  2. Researches the live public web (search + reading real pages — never from
     a model's memory) against three collection targets: offers for catalog
     coins, stable-value offers (stablecoins + tokenized gold), and an
     open-ended "anything notable on these platforms" sweep that may return
     coins nobody holds.
  3. Emits structured campaign rows plus a short prose **summary of what
     changed** since the previous run.
- The watch list spans four kinds of source: global exchanges, locally
  licensed Turkish exchanges, self-custodial wallets with earn programs, and
  major on-chain/DeFi protocols — plus the local regulator's announcements,
  because a rule change can pause every local earn program at once. The run
  summary must surface regulatory news and paused/changed programs, not only
  new campaigns. Campaigns on global platforms may be country-gated, so the
  research records eligibility caveats in the row's conditions when found.
- A new successful run **supersedes** the previous one: the app always shows
  the latest successful run's rows. Older runs are retained as history, never
  edited.
- A failed run leaves the previous run's data in place untouched.

### Ingestion door & validation

- All campaign data enters through **one validated ingestion path**, secured by
  a secret independent of any user credential. Any producer that can emit the
  schema may push (the scheduled research job is simply the default producer;
  a manual or alternative-model producer is equally valid).
- Validation rejects, per row: missing ticker/platform/program type/source URL,
  an unrecognized program type, a rate outside sanity bounds (0–1000%), a
  malformed source URL, and rows with neither a rate nor a reward description.
  A batch with no valid rows is rejected outright; per-row rejects are recorded
  on the run.

### Campaigns page — three groups

1. **"You hold these"** — campaigns whose ticker matches a coin the user holds
   (balance > 0). Each shows a personal estimate: holding quantity × cached
   price × rate ≈ **$/yr** (only when a rate exists; reward-description-only
   campaigns show the description instead). Sorted by estimated $/yr, highest
   first.
2. **"Stable value"** — rows flagged stable-value (stablecoins and tokenized
   gold), regardless of holding.
3. **"Worth considering"** — everything else. Sorted by rate (desc), rate-less
   rows last.

Every card shows: platform, program type, reward, lock/min/max/conditions,
deadline (with a "ends soon" cue when within 7 days), the source link, and the
found-on date.

### Trust & staleness rules

- The page header shows **when the data was last refreshed** and the run's
  change summary.
- If the latest successful run is **older than 10 days**, the page shows a
  staleness warning.
- Every card carries the framing "found on {date} — verify at source before
  committing funds"; the source link is always present. Rates are treated as
  *claims found on the web*, not guarantees — the sanity bounds above are the
  only automated defense, the source link is the user's.
- Expired campaigns (deadline in the past) are hidden by default behind a
  toggle, not deleted.

## Out of scope (recorded extensions)

- Alternative producers beyond the default research job (e.g. an
  assistant-agent producer) — allowed by the ingestion contract, not built.
- Push notifications on new campaigns.
- Auto-matching campaign tickers to catalog assets (matching is by ticker
  string only).
- Acting on campaigns (deposits/subscriptions) — never in scope.
