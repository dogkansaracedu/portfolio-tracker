# Prior art — Vehicle cost of ownership & maintenance schedules

## Question

Two questions, researched together because one component answers both:

1. How should an app compute and present **what a car has really cost its
   owner** — which cost buckets, does depreciation count, and over what
   denominator (per km, per month, per year)?
2. How should it model a **periodic maintenance schedule** so that "I changed
   the drive belt at 130,000 km" produces a correct next-due point, and how far
   ahead should it warn?

Plus one local input the design could not be built without: the **real,
current recurring costs of car ownership in Turkey** and the **typical service
intervals** used there — volatile facts that must come from sourced research,
never memory.

**Apps researched:** Drivvo; Carfax Car Care / myCarfax (with Fuelly / Gas Cubby
as the documented secondary); Edmunds True Cost to Own (with AAA "Your Driving
Costs" and KBB 5-Year Cost to Own).
**Also researched:** Turkish ownership costs and maintenance conventions
(official sources where they exist).
**Researched:** 2026-09-04, via four parallel `prior-art-researcher` agents
(web research only).

---

## Drivvo (drivvo.com)

**Cost model.** Record types are "modules": Refuelling, Expense, Service,
Income, Route, **Reading** (date + odometer only), Checklist, Reminder. Date on
every record; odometer on every type (required in practice on refuelling /
service / route, "optional but always recommended" on expense). Service and
Expense are **multi-select typed line items, each with its own value field**, so
one service record can carry N priced items.

**Aggregates.** Cost per km, cost per month, average consumption per fuel type,
per-station comparison, monthly and comparative expenses, average km/day.
Positioning: "discover the real cost per month and per kilometer".

**Depreciation: not found.** The vehicle record *does* store `valor_compra`
(purchase value) and `valor_venda` (sale value), visible in the API payload, but
no documentation or review evidence shows either feeding any cost figure. The
cost story is out-of-pocket running costs minus income.

**Reminders.** Bound to a **service type or expense type**, not free text —
which is what lets them auto-reset: "every time you register an Expense or
Service that already has a repeat-type reminder registered, the reminder will
reorganise". Scheduled by distance, time, or **both combined**. Lead time is a
global setting ("Número de Km" / "Número de dias"). A third-party API client
models state as `days_left` / `distance_left` / `overdue`, with overdue =
whichever goes negative first.

**First cycle is the flaw.** With no prior service of a type, Drivvo asks for
an *"Odômetro inicial"* and *"Data inicial"* that must be **future** values —
the user does the arithmetic. A review puts it exactly: *"Why should I calculate
the service interval if I choose something like 8000km?"*

**Honest blanks, badly explained.** Consumption is computed only between two
full tanks, the first refuel is excluded from the lifetime average, and the most
recent shows none ("the fuel has not yet been consumed"). There is an explicit
user-declared "previous fuel entry missing" flag for gaps. But the suppression
is not explained inline, so users read it as breakage: *"Bought this to track
expenses and mpg. I get a zero for mpg. What's up with that?"* (2★).

**Other edges.** Chronology violations produce a **conflict message**, not a
silent accept. A 1★ review reports you cannot log a **zero-cost** fill. One
currency per account.

- https://www.drivvo.com/en-US/faq/ · https://wiki.drivvo.com/drivvo-or-gestao-de-frotas/modulos/servico
- https://wiki.drivvo.com/drivvo-or-gestao-de-frotas/modulos/lembrete
- https://github.com/hudsonbrendon/HA-drivvo (API shape, third-party)

**Confidence: medium-high.** Module lists, field triads, reminder options,
full-tank semantics and the chronology rule are from Drivvo's own FAQ/wiki or
primary review data. Reminder internals come from a third-party client's code,
not Drivvo docs. `wiki.drivvo.com` was DNS-unreachable, so wiki quotes are
search-engine renderings of the official pages.

## Fuelly / Gas Cubby (fuelly.com) — the documented schedule model

**Per-item intervals, a (time, distance) pair each, either can fire.**

**The 10% rule.** *"A reminder will trigger when a service is within 10% of
coming due. For example, if 'Oil Change' is left at the default 3 months and
3000 miles, the oil change reminder will trigger when it is within 9 days or 300
miles."* One threshold, scale-free.

**Blank means ignore, per dimension.** *"Setting a number to blank … tells Gas
Cubby to ignore that unit; setting both time and distance numbers to blank tells
Gas Cubby to ignore the service entirely."* No `track_by` enum exists.

**Reset requires an exact type match — and this was a shipped fix.** Previously
reminders *"worked by counting down and automatically resetting once the timer
hit zero, even if the service wasn't performed"*. The current system requires a
logged service entry naming that service type, and distance reminders require an
odometer value.

**Service entry fields:** date, odometer, total cost (optional), **Services** (a
customizable multi-select checklist — one visit closes many items), location,
tags, payment type, notes. *"For service reminders to work, the date, odometer
reading and the service performed must be entered."*

**Display** is a remaining-count, colour-coded: black = not due, red = overdue,
plus an app-icon badge counting overdue services.

**Cost-per-mile is fuel-only.** "Avg Price/Mile" sits inside the fuel stats;
service cost lives in a separate "Total Service Expenses" chart and is never
folded in. There is **no depreciation, insurance, tax or financing category**.
Forum threads requesting real cost of ownership span over a decade ("New feature
— total cost of ownership?", "Adding service costs to total cost statistics"),
with a staffer conceding *"In the past Fuelly focused only on fuel
consumption…"* — while the app store tagline advertises "the true cost of
ownership".

**Weakness:** reminders trust input completely with no sanity check, so a typo
becomes a confidently wrong "overdue by 45 miles". Recurring thread titles
("Inaccurate reminders", "Overdue reminders gone crazy") suggest this is
chronic.

- https://www.fuelly.com/gascubby/support/2.5/gcreminder.html
- https://www.fuelly.com/gascubby/support/2.5/gcservice.html
- https://www.fuelly.com/forums/f2/new-feature-total-cost-of-ownership-771.html

**Confidence: high** on the mechanics (vendor's own support manual, quoted
verbatim, corroborated by third-party reviews and the vendor forum). The
fuel-only conclusion is inferential (stats labels + a decade of unanswered
requests) rather than a direct vendor statement.

## Carfax Car Care / myCarfax

**Two representations at different layers.** The editorial pages teach a
**per-milestone** "30-60-90" schedule (bundles at 30k/60k/90k miles); the app
engine computes **per item**, each with its own interval.

**Intervals come from a VIN/plate lookup** — "personalized maintenance
schedules" plus auto-imported shop-reported history — and are then
**user-adjustable**. Which OEM data provider Carfax licenses: **not found**.

**It projects the odometer forward.** The documented tire-rotation computation
takes the last reported date, the interval, and *"your estimated odometer
reading"* — so a distance-based item can raise a calendar alert without the user
entering mileage. Users rate this well: it *"does a fairly good job of learning
your driving and estimating mileage"*.

**"Recommended Service" is designed to be handed over.** Carfax tells users to
*"show the 'Recommended Service' section from your Car Care dashboard to your
service shop to ensure you only receive the manufacturer-recommended services"*.
The screen has a job outside the app.

**Three real weaknesses.**
1. **Monotonic odometer validation blocks correction.** "Odometer reading cannot
   be lower than the last reported odometer" is enforced even on manual entries,
   and historical records can't be added with an odometer unless the shop is a
   Carfax member — so one bad reading poisons every downstream due date with no
   user remedy.
2. **Constrained interval pickers**: tire rotation offers only 5,000 or 7,500
   miles, so the app cannot represent what the owner's own mechanic said.
3. **Due-soon thresholds are entirely undocumented** — users cannot calibrate
   their trust.

Costs: Carfax shows **estimated future** repair costs (parts/labour breakdown),
never actual lifetime spend. Web and app have identical functionality.

- https://support.carfax.ca/en/support/solutions/articles/17000112983-how-are-car-care-notifications-timed-
- https://www.carfax.com/maintenance/car-maintenance-schedules
- https://www.carfax.com/Service/

**Confidence: medium.** Schedule inputs, manual-entry path and web/app parity
are from official Carfax support pages. But carfax.com and support.carfax.com
block crawlers, so there is **no direct read of the actual screens**: per-row
anatomy, threshold values, and whether one record can close several items are
all **not found**. Manual-entry freedom has directly conflicting user reports.

## Service-interval data availability

**There is no free source of manufacturer service intervals.**

| Source | Status |
|---|---|
| Edmunds Maintenance API (richest public schema found — nine frequency types incl. warning-indicator-triggered) | **Dead.** Access disabled 15 Feb 2018, no new keys |
| MOTOR Maintenance Schedules (OEM, mileage + time, normal/severe variants) | Commercial, price not public |
| ALLDATA | Commercial subscription |
| cardatabases.com Vehicle Maintenance DB (58,681 trims) | **$1,000 one-time**, and explicitly *"organized by mileage intervals only. Time-based intervals … are not currently included"* |
| Vehicle Finder API | Maintenance gated to a $29/mo plan, API key required |

Open datasets (`plowman/open-vehicle-db`, OpenEV Data) carry make/model/year and
EV specs only — no intervals.

**Confidence: high** (vendors' own pages). The "none free exists" conclusion is
an absence-of-evidence claim from several search angles.

## Edmunds True Cost to Own / AAA Your Driving Costs / KBB

**Edmunds' seven buckets** (not six — maintenance and repairs are separate) plus
a subtracted federal tax credit: depreciation, insurance, **financing**, taxes &
fees, fuel, maintenance, repairs. Depreciation's base is the total cash price
*minus taxes/fees already in it* (so taxes aren't double-counted), against a
resale value assuming a **private-party** sale. Financing interest is charged
**even to cash buyers, as opportunity cost** — an explicit statement that TCO is
economic cost, not cash flow.

**Depreciation is the largest bucket and steeply front-loaded.** Published
5-year tables: 2025 Camry SE $10,263 of $30,826 (33.3%); 2025 F-150 STX $22,511
of $63,469 (35.5%). Year 1 is 41–51% of the five-year depreciation across four
published vehicles. Edmunds' own figures elsewhere: ~23.5% of MSRP lost in year
one, ~60% over five.

**Presentation:** a 7-row × 6-column table (Year 1–5 + Total), headline = the
5-year total. **Depreciation sits sixth of seven rows** — the biggest and least
intuitive number gets the least prominence, and the year-by-year curve is not
smoothed or explained (Tundra: $4,234 → $706 → $911 → $1,864).

**AAA's fixed/variable split with two denominators — the key finding.** 2025
edition, 5 years / 75,000 miles:

- **Operating, quoted per mile:** fuel 13.00¢, maintenance/repair/tires 11.04¢ →
  24.04¢/mi
- **Ownership, quoted per year:** depreciation $4,334 ("the single largest cost
  of ownership"), insurance $1,694, finance $1,131, license/registration/taxes
  $813 → $7,972/yr
- **Total $11,577/yr = $964.78/mo = 77.18¢/mi at 15,000 mi/yr**

And AAA publishes the sensitivity itself: **10,000 mi/yr → $1.00/mi; 15,000 →
77¢; 20,000 → 66¢.** Same car, same costs — a 34% swing from the denominator
alone, because ownership costs don't shrink when you drive less.

**KBB** splits "out-of-pocket expenses" from "the car's loss in value over
time" while still summing them — the cash/non-cash separation Edmunds lacks.

**Published critique of cost-per-mile.** VTPI: averaging fixed costs over annual
mileage "tends to overstate" costs for high-mileage drivers and understates the
savings from driving less. It also argues depreciation is *not* purely fixed
(5–15¢/mi mileage-related), while Train et al. (Berkeley) find only
$0.002–0.003/mi from revealed preference — an unresolved literature. General
critique: the all-in per-mile average is not a marginal cost, so it is the wrong
number for "should I drive?" while being the right number for "what does this
car cost me?"

**Real vs nominal in a high-inflation currency: not found** in any of the three.
All work in nominal USD with no deflator. The closest published method is
**BLS, Monthly Labor Review (2024)**, which deflates purchase prices to constant
dollars *"in all intermediate steps"* and converts back for presentation.

- https://developer.edmunds.com/api-documentation/vehicle/price_tco/v1/
- https://newsroom.aaa.com/2025/09/aaa-new-vehicle-costs-drop-to-11577/
- https://www.vtpi.org/tdm/tdm82.htm · https://eml.berkeley.edu/~train/papers/depreciation.pdf
- https://www.bls.gov/opub/mlr/2024/article/a-consumption-measure-for-automobiles.htm

**Confidence: high** on Edmunds' bucket definitions (official developer docs,
two agreeing pages) and AAA's 2025 figures (the six buckets reconcile
arithmetically to AAA's own $11,577 and 77.18¢). **Medium** on Edmunds'
per-vehicle tables (edmunds.com returns 403; search-extracted but internally
consistent). **Low** on KBB dollar figures — kbb.com also blocks fetch and KBB
publishes almost no methodology.

## Turkish ownership costs & intervals (2026 snapshot)

> Dated observation, not standing truth. Re-verify before quoting.

**MTV (vehicle tax).** **Paid in two equal instalments, January and July** (Law
197 art. 9). 2026 amounts published in MTV Genel Tebliği Seri No: 58 (RG
31.12.2025), range **5,750–274,415 TL/yr**; the increase was set at **18.95%**
by Cumhurbaşkanı Kararı 10783, not the 25.49% revaluation rate.

**Which of the two tariffs applies is the part that trips people up**, and the
first research pass left the older one unresolved. Cars **registered on or after
1/1/2018** use the **(I) tarife**: displacement × *vehicle value* × age. Cars
registered **on or before 31/12/2017** were carved out by Law 197 **geçici madde
8** into the **(I/A) tarife**, which has **no vehicle-value dimension at all** —
displacement × age only. The value tiers arrived with 7061 sayılı Kanun in 2017
and were made prospective only. So for any car older than about 2018 the value
question does not arise.

For 1301–1600 cm³ in 2026 the (I/A) row is **10,016 / 7,510 / 4,354 / 3,077 /
1,181 TL** across the 1–3 / 4–6 / 7–11 / 12–15 / 16+ age bands — numerically
identical to the (I) tarife's lowest value tier, which makes the amount robust
even when a car's registration date is uncertain.

**Age counts from the model year, not first registration**, and the car is
**1 yaş in its own model year** (madde 2/18 + madde 11), so
`age = tax year − model year + 1`. That +1 decides band boundaries: a 2015 model
is 12 in 2026 and pays the 12–15 rate, not the 7–11 rate.

A kasko-value relief lets an owner drop a row when MTV exceeds **5%** of the
insured value for (I/A) vehicles (**10%** under madde 5 for (I) vehicles), but
in (I/A) "the previous row" means **the next lower displacement band**, not a
lower value tier. It is petition-only — the tax office never applies it
unprompted — and needs a TSB-agent-completed declaration form. For an ordinary
car it is unreachable: MTV runs around 0.4% of kasko value against a 5%
trigger.

**Muayene (TÜVTÜRK inspection).** Private cars: first at **3 years, then every
2**. 2026 fee 3,288.84 TL + 460 TL emission ≈ **3,749 TL**. Late = **5% of the
fee per month** (KTK art. 35); driving on an expired inspection is a separate
~2,719 TL fine.

**Insurance.** *Zorunlu trafik* is compulsory, with **SEDDK-capped** maximum
premiums by province and hasarsızlık basamağı (0–8), uprated monthly (Jan 2026
+0.66%; Sept 2026 +1.75% per Genelge 2026/25). **Kasko is optional and on a free
tariff — there is no published price list at all**; every "typical kasko cost"
figure in circulation is broker marketing. Sector-level is the only defensible
aggregate (TSB: 2025 kasko premium production +33% nominal, **−5.9% real**).

**Fuel — re-researched 2026-09-04, and the 1 September snapshot was already
wrong.** İstanbul Avrupa motorin is **88.88 TL/L** (Opet, Petrol Ofisi and
Aytemiz independently, within 2 kuruş; Aytemiz self-stamps 04.09.2026 15:25).
The 81.07 figure was correct that day and was superseded overnight on
4 September by a **+7.76 TL/L** jump — 9.6% in one night, on Brent at 95–96
USD/bbl and a diesel crack-spread blowout, **not** a tax event. Benzin rose
only +2.47 the same night, opening a ~12 TL gap. The prior day's press forecast
(+8.24) missed by half a lira, so even 24-hour-ahead estimates move.

**The ÖTV staircase is published legislation, not a rumour.** A Cumhurbaşkanı
Kararı (reported *Resmî Gazete* 13.08.2026, sayı 33339, karar 11606 — the issue
numbers are second-hand, the schedule itself corroborated repeatedly) sets the
maktu ÖTV on motorin at **0.00** for 13–31 Aug 2026, then **3.00** Sep,
**6.00** Oct, **9.00** Nov, **12.00** Dec and **13.9006** from 1 Jan 2027. Each
3.00 step is ≈ **+3.60** at the pump with VAT. From duty alone a price stored on
4 September is ~4% low by 1 October, ~8% by 1 November, ~12% by December, ~15%
by January — market drift on top. Motorin only; benzin is not on the staircase.
Whether the October step held cannot be known before 1 October: no revision
existed as of 4 Sep, but the same-week oil shock creates obvious pressure.

**Key-free machine-readable sources DO exist — the first pass's "none found"
was wrong**, and this is the finding that changes what the app can do:

| Source | Endpoint | Carries a date? |
|---|---|---|
| **Opet** | `api.opet.com.tr/api/fuelprices/prices?ProvinceCode=934` — plain JSON per district; province index at `/provinces`; İstanbul is split, `34` Anadolu / `934` Avrupa; motorin product codes `A121` / `A128` | **no** |
| **UcuzYakitBul** | `ucuzyakitbul.com.tr/api/prices/national` — documented public, no auth, 0 credits (every other endpoint is key-gated and paid) | **yes**, ISO |
| **Aytemiz** | HTML, all 81 provinces, self-timestamped | yes, in page |

**EPDK is closed, and more closed than the first pass found**: the province
dealer report now 302-redirects to an e-Devlet / e-imza login, and the public
query page is a JSF/PrimeFaces form needing a POST with `ViewState` — no JSON,
no XML, no stable GET, and its "Raporu İndir" is bound to the POST session. Its
**monthly average bulletin** is the only official series (2026 motorin: Jan
55.395 · Feb 58.170 · Mar 67.597 · Apr 74.172 · May 68.336 · Jun 65.417 · Jul
71.408 · Aug 79.768) but it lags a month, sits 11% below spot, and August
blends two tax regimes. A backward-looking contract index, not a current price.

**Consumption sanity check (Fluence 1.5 dCi 110 EDC).** Homologation combined
**4.4–4.6 L/100 km** (NEDC era); owners report **5.5–6.9** real-world — 5.5 in
dense İstanbul traffic, 4.1 at a steady 100–110 km/h. An assumed **6.0** sits
inside that band, ~30% above homologation (a normal NEDC gap) and slightly
below the worst city reports: fair for a single constant, not worth flagging.

**Maintenance intervals** (Bosch Car Service TR, cross-checked against VW
Türkiye's authorised-service schedule and Toyota TR):

| Item | km | time |
|---|---|---|
| Engine oil + filter | 10,000–15,000 | 12 months |
| Air / cabin filter | 20,000–30,000 | 2 years |
| Fuel filter | 40,000–50,000 (VW diesel 20,000) | 4 years |
| Spark plugs | 30,000–120,000 (engine-dependent; VW 60/90/120/180k) | — |
| Brake fluid | **not km-driven** | 3 years from new, then every 2 (VW TR) |
| Coolant | 40,000–50,000 | 2–4 years (sources differ) |
| Auto transmission oil | 50,000–60,000 | 5 years |
| **Drive belt (triger kayışı)** | **60,000–120,000** | **4–6 years, whichever first** |
| Tyres | ~100,000 often cited | 5–6 years typical; legal min tread 1.6 mm |

On the belt specifically: Bosch TR is explicit that **both dimensions matter** —
*"sadece kilometre değil, zaman faktörü de önemlidir"*, because the belt hardens
and cracks with age even on a barely-driven car. VW Türkiye uses 90,000 /
120,000 / 180,000 km by engine. **No official Turkish source names 130,000 km as
a standard interval.** Many modern engines (Fiat 1.6 E-Torq, various Hyundai/Kia
diesels) use a **chain** with no scheduled replacement at all.

**Valuation cannot be automated.** TSB's **Kasko Değer Listesi** is free, no
key, monthly — but the page is **JS-rendered** (the static HTML serves the price
field as `₺0,00`), so it is not even scrapable, let alone an API; it covers only
cars ≤15 model years and carries no mileage or condition breakdown. Dated
third-party mirrors reproduce the list and two of them agreed to within 0.15% on
a spot check, but undated mirrors carry scrapes years stale — only trust one
that names its list month.
arabam.com's robots.txt disallows the major bots and blocks filter query
strings; sahibinden.com returns **403** to a plain fetch. otoendeks.com
advertises an API but its published indices appear stale (2021).

**The inflation nuance — and a correction to the premise.** The framing "nominal
TRY up, USD down" held through early 2026 but is now out of date. Three
independent indices agree Turkish used-car prices have gone **flat-to-negative
in nominal lira** while collapsing in real terms:

- **Cardata:** Dec 2024 → Jul 2026 nominal **+0.4%** vs cumulative TÜFE
  **+56.9%** ≈ **36% real loss**; H1 2026 nominal −1.3%
- **sahibindex / BETAM:** Jul 2026 average 1,169,000 TL, −0.5% MoM, real −8.6% YoY
- **VavaAI, H1 2026:** prices +5.0% vs TÜFE +17.7%, USD/TRY +8.7%, EUR/TRY +5.6%
  — *"yatırımcısına reel anlamda kazandırmadı"*

- https://www.muhasebetr.com/guncelmevzuat/mevzuat_oku.php?mevzuat_id=7105 (Tebliğ 58)
- https://www.tuvturk.com.tr/musteri-hizmetleri/sikca-sorulan-sorular/arac-muayene-sureci-hakkinda-sorular.aspx
- https://www.seddk.gov.tr/tr/tuketici-kosesi/teminat-limitleri/zorunlu-trafik-sigortasi-limitleri
- https://www.boschcarservice.com/tr/tr/hizmetlerimiz/triger-kayisi-degisimi/
- https://www.tsb.org.tr/tr/kasko-deger-listesi · https://betam.bahcesehir.edu.tr/2026/07/sahibindex-otomobil-piyasasi-gorunumu-temmuz-2026/

**Confidence: high** on MTV structure and the 2026 table, muayene frequency, the
compulsory/optional insurance split and its cap mechanism, fuel levels and the
ÖTV escalator, valuation-source machine-readability, and the real/USD divergence
(three independent indices agreeing). **Medium** on muayene fee amounts
(TÜVTÜRK's price page is JS-rendered; figures from dated news) and on
maintenance intervals (manufacturer PDFs were not text-extractable, so Bosch
TR + VW's service page carry the weight). **Low** on typical kasko cost —
no published tariff exists — and on exact azami prim levels, where press
sources contradict each other (İstanbul basamak 0 quoted as both 57,213 and
45,181 TL). **Not found:** 130,000 km as any official belt interval.

### Per-car appendix: Renault Fluence 1.5 dCi (K9K), researched 2026-09-04

Kept because it establishes a pattern the seeded plan cannot: **the
manufacturer's own interval table may simply not be published.**

**Renault Türkiye publishes no Fluence/K9K schedule and says so** — its FAQ and
the owner's manual both defer to the paper *bakım belgesi* ("Bakım
periyotlarınız ve yapılacak işlemler hakkında buradan bilgi alabilirsiniz";
manual p.90: "Service intervals: please refer to your vehicle's maintenance
document"). Exactly **three** figures are officially published, on service
micro-pages rather than in a table:

- **Brake fluid: 4 years or 120,000 km** — "Dört yılda bir ya da 120.000 km'de
  fren hidroliğini değiştirmeniz önerilir."
- **Brake inspection: 2 years or 20,000 km**
- **Timing belt: a marketing range** — "beş yaşından büyük ve/veya 60.000 ile
  160.000 km arasında", with no model or engine breakdown.

Everything else is trade consensus. Turkish independent-service and dealer-price
sources converge on **oil + filter every 1 year / 20,000 km**, air and cabin
filters at every service, **diesel fuel filter every 40,000 km** (every second
service), and **coolant at 120,000 km**. A minority of Turkish portals say
10,000–15,000 km for oil, which may be the correct figure for the Fluence's own
era.

**The timing belt does not resolve, and this is the useful lesson.** The credible
published spread is **60,000–160,000 km and 4–10 years**, unreconciled:
European/French trade reads Renault as 160,000 km / 6 years for a post-2006
K9K; Turkish yetkili-servis practice as reported by third-party price
compilations runs at **80,000 km / 4 years** ("Kayışların ömrü 4 yıl olarak
belirtilmiştir"); Turkish parts trade sits at 90,000–120,000 km, dropping to
60,000–90,000 for heavy city use. No document settles it. On an interference
engine that is a 2× disagreement about when the engine destroys itself —
so the honest product answer is to make the interval the owner's own figure and
say plainly that the app cannot supply it.

Two items the generic plan misses for this engine:

- **The accessory belt is its own scheduled item** (~80,000 km, trade), and it
  is not cosmetic: if it snaps it can be drawn into the timing belt and jump the
  timing. Turkish practice changes both belts together for that reason.
- **Gearbox oil.** Renault's reported position is "lifetime"; a Turkish Renault
  specialist rejects that for local conditions and gives 80,000–120,000 km
  (manual) / 60,000–80,000 km (EDC dual-clutch).

Water pump and tensioners appear in **no** published Renault schedule, while
trade practice across three countries is unanimous that they go with the belt —
the pump because it is belt-driven and its seizure breaks the belt.

Reference costs (third-party compilations, TL ages fast): annual service
₺3,650–4,850; the 4-year heavy service ≈₺10,600 at a dealer; a timing-belt set
including water pump, coolant, parts and labour ₺9,750–11,750 independent, or
≈₺17,300 as part of a dealer heavy service.

---

## Cross-app synthesis

**The gap is consistent and total.** Three car apps × three finance tools, and
none computes what a specific car cost a specific owner:

| | Real receipts | Counts capital | Ledger ↔ schedule |
|---|---|---|---|
| Drivvo | yes | stores purchase/sale value, **never uses it** | reminders bound to typed records |
| Fuelly | yes | no category at all | cost-per-mile is **fuel only** |
| Carfax | partly (shop-reported) | **estimated future** repairs only | schedule only, no lifetime spend |
| Edmunds / AAA / KBB | no — hypothetical average car | yes, rigorously (33–37% of TCO) | n/a |

The car apps track receipts and ignore capital. The finance tools model capital
properly but only for a hypothetical new car in one low-inflation currency, and
none of them has any real-vs-nominal doctrine.

**Patterns worth copying (each independently corroborated):**

1. **Two denominators, not one** (AAA). Variable per km, fixed per year/month,
   with the per-mile total presented as a function of assumed mileage rather
   than a property of the car.
2. **A proportional warning window** (Fuelly's 10%). One rule, correct at every
   interval scale, and reasonable-about-able — unlike Carfax's undocumented
   thresholds.
3. **Blank means "don't track this dimension"** (Fuelly). Replaces a
   `track_by` enum; the disable gesture is the configure gesture.
4. **Reminders bound to a typed record, resetting only on an exact match**
   (Drivvo *and* Fuelly, the latter having shipped a fix for the alternative).
   Logging the work *is* completing the reminder.
5. **Projecting the odometer forward** (Carfax) so a distance item can raise a
   calendar warning.
6. **A record type that is just date + odometer** (Drivvo's Reading).
7. **Splitting out-of-pocket from loss-in-value** while still summing (KBB).

**Common failure modes to design against:**

1. **Making the user do the interval arithmetic** (Drivvo's future "initial
   odometer").
2. **Hard-blocking a backwards odometer** (Carfax), which makes one typo
   permanent and backfilling impossible.
3. **Constraining intervals to a picker** (Carfax) narrower than reality.
4. **Suppressing a figure without saying why** (Drivvo's blank consumption) —
   the honest blank is right, the silence is what costs trust.
5. **Burying depreciation** (Edmunds, sixth of seven rows) — the largest and
   least intuitive bucket getting the least explanation.
6. **Not being comparable and not saying so** (Edmunds ~$30.8k vs KBB ~$53.5k
   for the same Camry, mostly from a private-party vs trade-in resale
   assumption). A "real cost of ownership" figure is only meaningful with its
   assumptions attached.

---

## What we decided

**2026-09-04.** Built as **Component 17 — Vehicle**
([spec](../components/17-vehicle.md) ·
[technical](../components/technical/17-vehicle.md)), shipped in v0.16.0.

Adopted: AAA's two denominators; Fuelly's 10% proportional window and
blank-means-ignore; the bound-and-exact-match reset rule; Carfax's forward
odometer projection; Drivvo's date+odometer reading (as two columns on the
vehicle rather than a record type); KBB's cash/capital split, with depreciation
**leading** rather than buried.

Inverted, deliberately: a backwards odometer **warns and saves** rather than
being rejected; intervals are **free numeric entry**; an item anchors on the
**last completion** so the app does the forward arithmetic; and every withheld
figure **states its reason inline**.

Added beyond all prior art: **per-entry-date currency normalization to the USD
anchor** (implementing the BLS deflate-in-intermediate-steps pattern, which no
car or TCO tool does), and **foregone return** — the purchase capital compounded
at the owner's own lifetime MWR, which no car app can compute because none knows
the owner's portfolio. This is Edmunds' cash-buyer-pays-interest reasoning with
a realized portfolio rate instead of a lending rate.

**Explicitly rejected:**
- **The car as an asset / in net worth** — owner's decision, 2026-09-04. A car
  is consumption with a resale value; counting it would distort allocation and
  read the purchase as *invested* rather than spent. Not deferred, rejected.
- **Automated valuation** — impossible on free sources for Turkey (see above).
  The value is typed, with a link to TSB's free list.
- **Per-item cost splits within one visit** (Drivvo does this) — the cost stays
  on the visit.
- **Cost forecasting** for fuel, tax or insurance — the diesel ÖTV escalator
  alone would make a projection fiction, and no kasko tariff exists to project
  from.
- **A seeded factory schedule per make/model** — no free data source exists at
  any acceptable price, so the app seeds *typical Turkish* intervals and names
  the car's own bakım kitabı as the authority.
