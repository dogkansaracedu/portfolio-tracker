# Vehicle — module glossary

> Terms used **only** by Component 17. The shared
> [GLOSSARY](GLOSSARY.md) stays the source of truth for portfolio-wide
> vocabulary (positions, lots, P&L, currency); a car is close to its own module,
> so its cost-rate vocabulary lives here instead of being pushed into the
> shared file.
>
> Stack-free, like the behavioral spec it accompanies:
> [17-vehicle.md](17-vehicle.md) · [technical](technical/17-vehicle.md)

Every cost of running a car falls into exactly one of three classes. Two of
them get a rate; the third deliberately does not.

## Variable cost

Costs that **scale with distance**: fuel and maintenance. Quoted **per 100 km**.

This is the *marginal* cost of driving — drive 100 km more and you spend about
this much more, with nothing else on the list moving. It is the figure that
answers "drive or fly".

Quoted per 100 km rather than per km because at two decimal places a per-km
figure prints `$0.01 / km`, which is indistinguishable from $0.005 or $0.014 —
a threefold range hidden in one printed digit.

It is a **lifetime average**, so after a price rise it sits below what a km
costs today.

## Fixed cost

Costs that **accrue with time whether the car moves or not**: insurance, road
tax, inspection — plus [depreciation](GLOSSARY.md#depreciation-vehicle).
Quoted **per month**.

Depreciation is placed here following AAA, the IRS and the Victoria Transport
Policy Institute. VTPI notes the placement is contested, but fixed is the
mainstream choice and the one the two rates are built around.

## One-off cost

Costs that are **neither**: a tow, a fine, a car-park fee.

They are real money and are counted in cash spent, in
[cost of ownership](GLOSSARY.md#cost-of-ownership) and in the blended rate —
but they are quoted in **neither rate**, because dividing a one-off by the
months owned would present it as something that recurs.

Shown as their own small figure beside the two rates, so the fact that fixed
plus variable does not add up to the total is stated rather than left to be
discovered.

## Blended cost

**Every** cost plus depreciation, divided by the distance driven. Quoted per
100 km, offered last, and never without the distance it assumes.

The all-in cost of 100 km — and explicitly **not** a marginal cost. Driving more
does not add this much; it spreads the fixed half thinner and pushes the figure
*down*. AAA publishes the sensitivity that makes this worth saying out loud:
the same car reads $1.00/mi at 10,000 mi/yr and $0.66/mi at 20,000, a 34% swing
from the denominator alone.

## Worked example

The owner's car, 2025-03-28 → 2026-09-04: 25,000 km over 17.25 months,
₺750,000 paid, ₺900,000 current value.

| | amount | rate |
|---|---|---|
| Variable — fuel $2,074.29 + maintenance $1,081.32 | $3,155.61 | **$12.62 / 100 km** |
| Fixed — insurance $532.47, tax $122.30, inspection $81.59, depreciation $1,199.76 | $1,936.13 | **$112.25 / mo** |
| One-off — one tow | $78.74 | *(no rate)* |
| Blended — all of the above | $5,170.48 | **$20.68 / 100 km** |

The $8.06 per 100 km between variable and blended is the fixed side spread over
the distance actually driven.

Note that depreciation is $69.56 of the $112.25 monthly figure — the bills
themselves are only $42.69. That depreciation exists **only under the USD
anchor**: in lira the car gained ₺150,000, while in dollars it lost $1,199.76,
because the currency fell further than the car's lira price rose.
