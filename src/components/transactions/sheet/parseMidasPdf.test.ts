import { describe, expect, it } from "vitest"
import {
  accountCellsToRow,
  buildMidasRowContext,
  dividendCellsToRow,
  headerKindForLabels,
  tradeCellsToRow,
  type MidasParseStats,
  type MidasRowContext,
} from "./parseMidasPdf"

const ASSETS = [
  { id: "usd-cash", category: "fiat", ticker: "USD" },
  { id: "try-cash", category: "fiat", ticker: "TRY" },
  { id: "spym", category: "stock_us", ticker: "SPYM" },
  { id: "brk", category: "stock_us", ticker: "BRK-B" },
]

const PLATFORMS = [{ id: "midas-1", name: "Midas" }]

function setup(assets = ASSETS): {
  ctx: MidasRowContext
  stats: MidasParseStats
} {
  return {
    ctx: buildMidasRowContext(assets, PLATFORMS),
    stats: { skippedNotExecuted: 0, skippedNonTrade: 0 },
  }
}

describe("headerKindForLabels", () => {
  it("classifies the trades header", () => {
    expect(
      headerKindForLabels([
        "Tarih",
        "İşlem Türü",
        "Sembol",
        "İşlem Tipi",
        "İşlem Durumu",
        "Para Birimi",
        "Emir Adedi",
        "Emir Tutarı",
        "Gerçekleşen Adet",
        "Ortalama İşlem Fiyatı",
        "İşlem Ücreti",
        "İşlem Tutarı",
      ]),
    ).toBe("trade")
  })

  it("classifies the account-operations header", () => {
    expect(
      headerKindForLabels([
        "Talep Tarihi",
        "İşlem Tarihi",
        "İşlem Tipi",
        "İşlem Açıklaması",
        "İşlem Durumu",
        "Tutar (YP)",
      ]),
    ).toBe("account")
  })

  it("classifies the dividend header, asterisked Stopaj included", () => {
    expect(
      headerKindForLabels([
        "Ödeme Tarihi",
        "Sermaya Piyasası Aracı",
        "Brüt Temettü Tutarı",
        "Stopaj*",
        "Net Temettü Tutarı",
      ]),
    ).toBe("dividend")
  })

  it("returns null for section titles and data rows", () => {
    expect(headerKindForLabels(["HESAP İŞLEMLERİ (01/06/26 - 30/06/26)"])).toBe(
      null,
    )
    expect(headerKindForLabels(["28/06/26 22:43:45", "Para Çekme"])).toBe(null)
  })
})

describe("accountCellsToRow", () => {
  it("maps Para Çekme to a transfer_out on the currency's cash asset", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        TALEP_TARIHI: "28/06/26 22:43:45",
        ISLEM_TARIHI: "28/06/26 22:46:30",
        ISLEM_TIPI: "Para Çekme",
        ISLEM_ACIKLAMASI: "Hesaplar Arası Para Transferi",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "900,00 USD",
      },
      ctx,
      stats,
    )
    expect(row).toEqual({
      // Settlement date, not the request date.
      date: "2026-06-28",
      assetId: "usd-cash",
      platformId: "midas-1",
      type: "transfer_out",
      amount: "900.00",
      unitPrice: "1",
      priceCurrency: "USD",
      fee: "",
      notes: "Hesaplar Arası Para Transferi",
      relatedAssetId: null,
    })
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  it("maps Para Yatırma to transfer_in and parses thousands-free TR numbers", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        TALEP_TARIHI: "29/06/26 10:13:54",
        ISLEM_TARIHI: "29/06/26 10:15:32",
        ISLEM_TIPI: "Para Yatırma",
        ISLEM_ACIKLAMASI: "Hesaplar Arası Para Transferi",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "2000,00 USD",
      },
      ctx,
      stats,
    )
    expect(row?.type).toBe("transfer_in")
    expect(row?.amount).toBe("2000.00")
    expect(row?.priceCurrency).toBe("USD")
  })

  it("maps Diğer Gelir / Nema Geliri to interest", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        TALEP_TARIHI: "30/06/26 23:16:05",
        ISLEM_TARIHI: "30/06/26 23:16:05",
        ISLEM_TIPI: "Diğer Gelir",
        ISLEM_ACIKLAMASI: "Nema Geliri",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "31,71 USD",
      },
      ctx,
      stats,
    )
    expect(row?.type).toBe("interest")
    expect(row?.amount).toBe("31.71")
    expect(row?.notes).toBe("Nema Geliri")
  })

  it("maps Diğer Gider / Stopaj to tax with the sign stripped", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        TALEP_TARIHI: "31/07/26 00:00:00",
        ISLEM_TARIHI: "31/07/26 00:00:00",
        ISLEM_TIPI: "Diğer Gider",
        ISLEM_ACIKLAMASI: "Stopaj",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "-2.491,35 TRY",
      },
      ctx,
      stats,
    )
    expect(row?.type).toBe("tax")
    // Magnitude only — the tax type already subtracts from the balance.
    expect(row?.amount).toBe("2491.35")
    expect(row?.priceCurrency).toBe("TRY")
    expect(row?.notes).toBe("Stopaj")
  })

  it("skips Diğer Gider whose description isn't stopaj", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        ISLEM_TARIHI: "01/07/26 00:00:00",
        ISLEM_TIPI: "Diğer Gider",
        ISLEM_ACIKLAMASI: "Hesap İşletim Ücreti",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "-10,00 TRY",
      },
      ctx,
      stats,
    )
    expect(row).toBeNull()
    expect(stats.skippedNonTrade).toBe(1)
  })

  it("skips Diğer Gelir whose description isn't nema", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        ISLEM_TARIHI: "30/06/26 23:16:05",
        ISLEM_TIPI: "Diğer Gelir",
        ISLEM_ACIKLAMASI: "Kampanya Ödemesi",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "10,00 USD",
      },
      ctx,
      stats,
    )
    expect(row).toBe(null)
    expect(stats.skippedNonTrade).toBe(1)
  })

  it("skips an unrecognized account type", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        ISLEM_TARIHI: "30/06/26 23:16:05",
        ISLEM_TIPI: "Teminat Tamamlama",
        ISLEM_ACIKLAMASI: "…",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "10,00 USD",
      },
      ctx,
      stats,
    )
    expect(row).toBe(null)
    expect(stats.skippedNonTrade).toBe(1)
  })

  it("counts a non-executed row as skipped", () => {
    const { ctx, stats } = setup()
    const row = accountCellsToRow(
      {
        ISLEM_TARIHI: "28/06/26 22:46:30",
        ISLEM_TIPI: "Para Çekme",
        ISLEM_ACIKLAMASI: "Hesaplar Arası Para Transferi",
        ISLEM_DURUMU: "İptal Edildi",
        TUTAR_YP: "900,00 USD",
      },
      ctx,
      stats,
    )
    expect(row).toBe(null)
    expect(stats.skippedNotExecuted).toBe(1)
  })

  it("drops non-data rows (section title, empty-section marker) without counting them", () => {
    const { ctx, stats } = setup()
    expect(
      accountCellsToRow(
        { TALEP_TARIHI: "HESAP İŞLEMLERİ (01/06/26 - 30/06/26)" },
        ctx,
        stats,
      ),
    ).toBe(null)
    expect(
      accountCellsToRow({ TALEP_TARIHI: "Kayıt bulunmamaktadır." }, ctx, stats),
    ).toBe(null)
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  it("reports an error (no sentinel) when the currency has no cash asset", () => {
    const { ctx, stats } = setup([{ id: "try-cash", category: "fiat", ticker: "TRY" }])
    const row = accountCellsToRow(
      {
        ISLEM_TARIHI: "28/06/26 22:46:30",
        ISLEM_TIPI: "Para Çekme",
        ISLEM_ACIKLAMASI: "Hesaplar Arası Para Transferi",
        ISLEM_DURUMU: "Gerçekleşti",
        TUTAR_YP: "900,00 USD",
      },
      ctx,
      stats,
    )
    expect(row).toBe(null)
    expect(Array.from(ctx.errors)).toHaveLength(1)
    expect(Array.from(ctx.errors)[0]).toContain("USD")
  })
})

describe("dividendCellsToRow", () => {
  const CELLS = {
    ODEME_TARIHI: "16/06/26",
    SERMAYE_ARACI: "SPYM - SPDR Portfolio S&P 5...",
    BRUT_TEMETTU: "2,87 USD",
    STOPAJ: "0,57 USD",
    NET_TEMETTU: "2,30 USD",
  }

  it("books the NET amount on the cash asset and points at the payer", () => {
    const { ctx, stats } = setup()
    const row = dividendCellsToRow(CELLS, ctx, stats)
    expect(row).toEqual({
      date: "2026-06-16",
      assetId: "usd-cash",
      platformId: "midas-1",
      type: "dividend",
      amount: "2.30",
      unitPrice: "1",
      priceCurrency: "USD",
      fee: "",
      notes: "SPYM dividend (gross 2.87, withholding 0.57)",
      relatedAssetId: "spym",
    })
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  it("canonicalizes the payer ticker before resolving it (BRK.B → BRK-B)", () => {
    const { ctx, stats } = setup()
    const row = dividendCellsToRow(
      { ...CELLS, SERMAYE_ARACI: "BRK.B - Berkshire Hathaway Inc..." },
      ctx,
      stats,
    )
    expect(row?.relatedAssetId).toBe("brk")
    expect(row?.notes).toContain("BRK-B dividend")
  })

  it("leaves the related asset null for an uncatalogued payer but names it in the notes", () => {
    const { ctx, stats } = setup()
    const row = dividendCellsToRow(
      { ...CELLS, SERMAYE_ARACI: "VOO - Vanguard S&P 500 ETF" },
      ctx,
      stats,
    )
    expect(row?.relatedAssetId).toBe(null)
    expect(row?.notes).toBe("VOO dividend (gross 2.87, withholding 0.57)")
    expect(ctx.unresolvedAssets.size).toBe(0)
  })

  it("drops the footnote and empty-section rows", () => {
    const { ctx, stats } = setup()
    expect(
      dividendCellsToRow(
        { ODEME_TARIHI: "*Stopaj, Amerika Gelir İdaresi (IRS) tarafından…" },
        ctx,
        stats,
      ),
    ).toBe(null)
    expect(
      dividendCellsToRow({ ODEME_TARIHI: "Kayıt bulunmamaktadır." }, ctx, stats),
    ).toBe(null)
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  it("reports an error when the payout currency has no cash asset", () => {
    const { ctx, stats } = setup([{ id: "try-cash", category: "fiat", ticker: "TRY" }])
    expect(dividendCellsToRow(CELLS, ctx, stats)).toBe(null)
    expect(Array.from(ctx.errors)[0]).toContain("USD")
  })
})

describe("tradeCellsToRow", () => {
  const CELLS = {
    TARIH: "16/06/26 16:30:01",
    ISLEM_TURU: "Hisse Senedi",
    SEMBOL: "SPYM",
    ISLEM_TIPI: "Alış",
    ISLEM_DURUMU: "Gerçekleşti",
    PARA_BIRIMI: "USD",
    GERCEKLESEN_ADET: "0,04",
    ORT_FIYAT: "57,50",
    ISLEM_UCRETI: "0,00",
  }

  it("still maps an executed buy and carries a null related asset", () => {
    const { ctx, stats } = setup()
    expect(tradeCellsToRow(CELLS, ctx, stats)).toEqual({
      date: "2026-06-16",
      assetId: "spym",
      platformId: "midas-1",
      type: "buy",
      amount: "0.04",
      unitPrice: "57.50",
      priceCurrency: "USD",
      fee: "0.00",
      notes: "",
      relatedAssetId: null,
    })
  })

  it("drops a non-date row before the fill check so titles aren't counted as skipped", () => {
    const { ctx, stats } = setup()
    expect(
      tradeCellsToRow({ TARIH: "HESAP İŞLEMLERİ (01/06/26 - 30/06/26)" }, ctx, stats),
    ).toBe(null)
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  // "Kalanın Süresi Doldu" = the unfilled remainder expired. The filled part is
  // a real trade; dropping it leaves the matching sell with no cost basis.
  it("imports a partially filled order for the quantity that actually filled", () => {
    const { ctx, stats } = setup()
    const row = tradeCellsToRow(
      {
        ...CELLS,
        SEMBOL: "SPYM",
        ISLEM_DURUMU: "Kalanın Süresi Doldu",
        EMIR_ADET: "40",
        GERCEKLESEN_ADET: "36",
        ORT_FIYAT: "69,00",
      },
      ctx,
      stats,
    )
    expect(row?.amount).toBe("36")
    expect(row?.unitPrice).toBe("69.00")
    expect(row?.type).toBe("buy")
    expect(stats).toEqual({ skippedNotExecuted: 0, skippedNonTrade: 0 })
  })

  it.each([
    ["İptal Edildi", "0"],
    ["Süresi Doldu", "-"],
    ["Gerçekleşti", ""],
  ])("skips a %s order that filled nothing", (status, filled) => {
    const { ctx, stats } = setup()
    expect(
      tradeCellsToRow(
        { ...CELLS, ISLEM_DURUMU: status, GERCEKLESEN_ADET: filled },
        ctx,
        stats,
      ),
    ).toBe(null)
    expect(stats.skippedNotExecuted).toBe(1)
  })

  it("encodes an unknown symbol as a new-asset sentinel", () => {
    const { ctx, stats } = setup()
    const row = tradeCellsToRow({ ...CELLS, SEMBOL: "NVDA" }, ctx, stats)
    expect(row?.assetId).toBe("new:NVDA")
    expect(Array.from(ctx.unresolvedAssets)).toEqual(["NVDA"])
  })
})
