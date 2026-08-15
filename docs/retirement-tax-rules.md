# Retirement Tax Rules — Verified Reference (Turkey, individuals)

> Source of truth for every rate, threshold, bracket, and condition used by the
> retirement planning tax rules (Component 13). Researched and verified
> **2026-08-15** against primary and professional sources; each item carries its
> legal basis and source URL. **Update this document (re-verify against
> sources), then the constants — never the constants alone, and never from
> memory.** Unverified or ambiguous items are flagged and must surface in the
> app as editable assumptions, not silent defaults.

## 1. Foreign (US) equity capital gains

- Classification: **değer artış kazancı**, GVK Mükerrer md. 80/1. No Turkish
  withholding; declared on the annual return (March 1–31 of the following
  year); taxed at the progressive non-employment tariff (§2).
- The 2-year Turkish-share exemption does **not** apply to foreign issuers —
  mük. 80/1 exempts only shares of Turkish-resident corporations held >2 years.
- **No exemption threshold**: the 2026 değer artış kazancı istisnası
  (150,000 TL) explicitly excludes securities — 1 TL of gain is declarable.
- **Yİ-ÜFE indexation** (GVK mük. 81, son fıkra): acquisition cost is uplifted
  by the Yİ-ÜFE increase excluding the disposal month — index of
  (disposal month − 1) ÷ index of (acquisition month − 1) — **only when that
  increase is ≥ 10%**; below 10%, nominal cost applies.
- **Gain computed in TRY**: purchase converted at the TCMB döviz alış kuru on
  the acquisition date, sale at the disposal date's rate. Same-category losses
  offset gains.
- ⚠️ **Ambiguity**: sources disagree between transaction-date vs.
  preceding-business-day TCMB rate. Use transaction-date (the more common
  GİB-özelge convention); immaterial for long-horizon projections.

Sources: [GİB Diğer Kazanç ve İratlar Rehberi 2026](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=DUYURU/UNIVERSAL/2026/Diger_Kazanc_ve_Iratlar_2026.pdf) ·
[Gedik Yatırım](https://gedik.com/yazilar/vergilendirme/yurt-disi-hisse-senedi-gelirlerinin-vergilendirilmesi) ·
[muhasebetr worked example](https://www.muhasebetr.com/yazarlarimiz/kadircangunes/011/) ·
[GVK mük. 80 metni](https://www.fatiharas.com/gvk-mukerrer-madde-80-deger-artis-kazanclari/)

## 2. Income tax brackets — 2026, non-employment income

Legal basis: **Gelir Vergisi Genel Tebliği Seri No: 332, RG 31.12.2025 /
33124 (5. Mükerrer)**. Applies to income earned in calendar 2026. Use the
**ücret-dışı** tariff for capital gains / dividends:

| Bracket (TL) | Rate |
|---|---|
| 0 – 190,000 | 15% |
| 190,000 – 400,000 | 20% |
| 400,000 – 1,000,000 | 27% |
| 1,000,000 – 5,300,000 | 35% |
| > 5,300,000 | 40% |

(Employment tariff differs only in the 3rd band: 27% runs to 1,500,000 TL.)

⚠️ **Projection rule**: bracket thresholds are nominal TL re-set annually by
tebliğ. A multi-decade projection **must index the thresholds by the
TRY-inflation assumption** or it will massively overstate future tax.

Sources: [Alomaliye — Tebliğ 332](https://www.alomaliye.com/2025/12/31/gelir-vergisi-genel-tebligi-seri-no-332-gvk-332/) ·
[KPMG Vergi](https://kpmgvergi.com/yayinlar/mali-bultenler/vergi/2026-yili-gelir-vergisi-dilimleri-ile-dikkate-alinacak-bazi-had-ve-tutarlar-belirlendi/3351) ·
[Alomaliye 2026 dilimler](https://www.alomaliye.com/2025/12/31/2026-yili-vergi-dilimleri/)

## 3. Foreign dividend income

- Declaration threshold (GVK md. 86/1-d, non-withheld MSİ): **22,000 TL for
  2026 income** (18,000 TL for 2025; 13,000 TL for 2024). A **cliff, not an
  allowance**: exceeding it makes the entire amount declarable. Tested against
  the sum of all non-withheld MSİ + GMSİ.
- No indexation; progressive tariff (§2).
- **Foreign tax credit** (GVK md. 123): foreign tax paid credits against the
  Turkish tax attributable to that income, capped, documentation required.
- GVK md. 22/4 half-exemption (≥20% shareholding + repatriation; threshold cut
  50%→20% by CBK 11257, RG 30.04.2026 / 33239) — irrelevant to portfolio
  investors.
- ⚠️ **Not verified**: the US treaty withholding rate on dividends to Turkish
  residents (commonly 15% with W-8BEN). Model as an editable assumption.

Sources: [Verginet — CBK 11257](https://www.verginet.net/dtt/11/Vergi-Sirkuleri-2026-57.aspx) ·
[TÜRMOB 2026/65](https://www.turmob.org.tr/ekutuphane/Read/f07edf9b-2575-47d4-b426-22a67e02df53) ·
[PwC — 2025 MSİ beyanı](https://www.pwc.com.tr/tr/Hizmetlerimiz/vergi/vergi-bultenleri/2026/2025-yili-menkul-sermaye-iratlarinin-beyani.pdf) ·
[Yapı Kredi 2026 rehber](https://www.yapikredi.com.tr/medium/file/yabanci-hisse-senedi-gelirlerinde-2026-yili-vergi-durumu_71999/view)

## 4. BES (Bireysel Emeklilik Sistemi)

- 🔴 **State contribution (devlet katkısı) is 20%, not 30%, effective
  01.01.2026** — CBK No. 10811, RG 07.01.2026 / 33130.
- Annual cap basis: annual gross minimum wage — 2026: **396,360 TL**
  (33,030 TL/mo × 12) → max state contribution **79,272 TL/yr**.
  ⚠️ Minimum-wage-linked: resets every January; model as an annual series
  growing with the TRY-inflation assumption.
- **Vesting** of the state contribution + its returns:

  | Years in system | Vested |
  |---|---|
  | < 3 | 0% |
  | 3 – 5 | 15% |
  | 6 – 9 | 35% |
  | 10+ (not retirement-eligible) | 60% |
  | Retirement (age 56 + 10 years), death, disability | 100% |

- **Exit withholding (stopaj)** — applies **only to the irat (investment
  return) portion**, never to principal (participant or state contribution
  principal); returns on both accounts are in the base. Rule since Law 6327
  (effective 29.08.2012); rates per BKK 2012/3571:

  | Exit condition | Rate |
  |---|---|
  | < 10 years of contributions | 15% |
  | ≥ 10 years, no retirement right | 10% |
  | Retirement right (56 + 10 yrs), death, disability, liquidation | 5% |

Sources: [Alomaliye — CBK 10811](https://www.alomaliye.com/2026/01/07/bireysel-emeklilik-tasarruf-ve-yatirim-sisteminde-turk-parasi-cinsinden-yapilan-katki-payi-odemeleri/) ·
[AA](https://www.aa.com.tr/tr/ekonomi/bireysel-emeklilik-sisteminde-devlet-katkisi-orani-yuzde-20-oldu/3791853) ·
[Garanti BBVA Emeklilik](https://www.garantibbvaemeklilik.com.tr/bes-devlet-katkisi) ·
[EY Türkiye](https://www.ey.com/tr_tr/insights/tax/bes-devlet-katkisi-vergi-oranlari) ·
[Kanun 6327, RG 29.06.2012](https://www.resmigazete.gov.tr/eskiler/2012/06/20120629-1.htm) ·
[2026 asgari ücret](https://www.alomaliye.com/2025/12/23/2026-yili-asgari-ucreti-2026-yili-asgari-ucret-bilgilendirme/)

## 5. TRY deposit interest withholding

Set by CBK No. 10041 (RG 09.07.2025 / 32951), extended to **31.12.2026** by
CBK No. 11444 (RG 20.06.2026 / 33286). Rates attach to accounts opened/renewed
on/after 09.07.2025 (earlier accounts keep their opening-date rate to
maturity):

| TRY deposit maturity | Stopaj |
|---|---|
| Demand / up to 6 months | 17.5% |
| 6 months – 1 year | 15% |
| Over 1 year | 10% |

Government bonds / bills / public lease certificates: 0% through 31.12.2026.
⚠️ **Not verified**: FX-deposit and KKM rates — out of scope for v1.

Sources: [Yöntem YMM 2026-041](https://www.yontemymm.com.tr/mali-aciklamalar/2026-041-tl-mevduat-hesaplarinda-uygulanan-stopaj-oranlarinin-suresi-uzatildi) ·
[Grant Thornton (CBK 10041)](https://www.grantthornton.com.tr/vergi-sirkuleri/2025-vergi-sirkuleri/mevduat-faizi-ve-yatirim-fonlarinda-stopaj-artisi/) ·
[Verginet 2025-66](https://www.verginet.net/dtt/11/Vergi-Sirkuleri-2025-66.aspx)

## 6. Physical / gram gold

- **No income tax** for an individual's non-commercial physical gold gains —
  physical gold falls into none of GVK's seven income categories (not a menkul
  kıymet / sermaye piyasası aracı; mük. 80 does not reach it). **No holding
  period applies** — the widely-repeated "1-year rule" for physical gold is a
  myth (confusion with securities/real-estate rules); do not implement one.
- Taxable boundaries (out of v1 scope): bank precious-metal account
  interest/nema (MSİ, withheld — özelge 62030549-125[6-2012/283]-488418,
  23.11.2017); gold funds / gold-indexed securities (geçici 67, §8);
  habitual dealing (ticari kazanç).

Source: [Alomaliye — Doğan Çengel YMM](https://www.alomaliye.com/2020/09/14/altin-ve-altina-endeksli-islemlerin-vergisel-boyutu/)

## 7. BIST-listed equities

- GVK **geçici 67 in force through 31.12.2030** (CBK 10680, RG 11.12.2025).
- **0% final withholding** on BIST share sale gains for resident individuals —
  no annual return, no consolidation (MKYO/GYO shares carve-out).
- Two distinct holding rules: >1 year (tam mükellef, BIST-traded) exits
  geçici 67; >2 years exits değer artış kazancı entirely (mük. 80/1).
- ⚠️ **Genuine ambiguity** in the 1–2 year window: outside geçici 67 but not
  yet mük. 80-exempt — practical tax is nil either way, filing obligation
  unsettled in practitioner literature. Model BIST equities as 0% tax and
  surface the caveat; a YMM opinion is needed before encoding a filing rule.

Sources: [Verginet 2025-115](https://www.verginet.net/dtt/11/Vergi-Sirkuleri-2025-115.aspx) ·
[STB CPA Turkey](https://www.stb-cpaturkey.com/gelir-vergisi-kanunu-gecici-67-madde-11-aralik-2025/) ·
[Gedik](https://gedik.com/yazilar/vergilendirme/hisse-senedi-gelirlerinin-vergilendirilmesi) ·
[muhasebetr](https://www.muhasebetr.com/yazarlarimiz/seref/004/)

## 8. TEFAS / investment funds

After CBK 10041 (09.07.2025) and CBK 11107 (RG 27.03.2026 / 33206):

| Fund type | Stopaj |
|---|---|
| Hisse senedi yoğun fon (TEFAS-traded) | 0% — no holding condition |
| HSY *serbest* fon not TEFAS-traded (units acquired ≥ 27.03.2026) | 17.5% |
| GSYF / GYF held > 2 years | 0% |
| GSYF / GYF held ≤ 2 years | 17.5% |
| All other funds (money market, debt, gold, mixed, …) | 17.5% |

- Separately, geçici 67 statutorily exempts units of funds continuously ≥51%
  BIST equities held >1 year.
- **Acquisition-date locking**: rates attach to the unit's acquisition date,
  not disposal — a correct engine resolves rates from a **dated rate table**
  per lot, never a single current rate.

Sources: [Alomaliye — CBK 11107](https://www.alomaliye.com/2026/03/27/gvk-gecici-67-nci-maddesinde-yer-alan-tevkifat-oranlari-karar-sayisi-11107/) ·
[BBDAS 31.03.2026](https://www.bbdas.com.tr/bbdas-31-03-2026-63-tefasda-islem-gormeyen-hisse-senedi-yogun-serbest-fonlarin-katilma-paylarina-17-5-tevkifat-zorunlulugu-getirildi-g-2952) ·
[İş Portföy](https://www.isportfoy.com.tr/medya-ve-blog/yatirim-fonlarina-uygulanan-stopaj-duzenlemesi-hakkinda-mart-2026) ·
[PwC](https://www.pwc.com.tr/tr/sektorler/bankacilik-sermaye-piyasalari/bultenler/2026/gvk-gecici-67nci-madde-uyarinca-uygulanan-stopaj-oranlarinda-degisiklikler.html)

## Engine-design implications (binding on Component 13)

1. **Rate tables are date-versioned data**, not constants — BES contribution
   rate, fund stopaj, and deposit stopaj all changed mid-stream and lock to
   acquisition/opening dates.
2. **Minimum-wage-linked parameters** (BES cap) are an annual series grown by
   the TRY-inflation assumption, not a constant.
3. **Bracket thresholds** must be indexed by the TRY-inflation assumption in
   multi-decade projections (§2 warning).
4. Items flagged ⚠️ unverified/ambiguous ship as labeled, editable
   assumptions.
