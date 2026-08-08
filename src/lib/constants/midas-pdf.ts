import type { TransactionType } from "@/types/database"
import { TRANSACTION_TYPES } from "./transaction-types"

/** Canonical column field keys. The PDF's actual labels vary between Midas
 *  variants (e.g. "Emir Adet" vs "Emir Adedi"), so each field accepts a list
 *  of accepted labels. The parser canonicalizes whitespace/case before
 *  matching. */
export const MIDAS_HEADER_ALIASES = {
  // YATIRIM İŞLEMLERİ (trades)
  TARIH: ["Tarih"],
  ISLEM_TURU: ["İşlem Türü"],
  SEMBOL: ["Sembol"],
  ISLEM_TIPI: ["İşlem Tipi"],
  ISLEM_DURUMU: ["İşlem Durumu"],
  PARA_BIRIMI: ["Para Birimi"],
  EMIR_ADET: ["Emir Adet", "Emir Adedi"],
  EMIR_TUTARI: ["Emir Tutarı"],
  GERCEKLESEN_ADET: ["Gerçekleşen Adet", "Gerçekleşen Adedi"],
  ORT_FIYAT: ["Ortalama İşlem Fiyatı", "Ortalama Fiyat"],
  ISLEM_UCRETI: ["İşlem Ücreti"],
  ISLEM_TUTARI: ["İşlem Tutarı"],
  // HESAP İŞLEMLERİ (cash operations) — shares İşlem Tipi / İşlem Durumu
  // with the trades table.
  TALEP_TARIHI: ["Talep Tarihi"],
  ISLEM_TARIHI: ["İşlem Tarihi"],
  ISLEM_ACIKLAMASI: ["İşlem Açıklaması"],
  TUTAR_YP: ["Tutar (YP)"],
  // TEMETTÜ İŞLEMLERİ (dividends). "Stopaj*" carries the literal footnote
  // asterisk in the statement's header cell.
  ODEME_TARIHI: ["Ödeme Tarihi"],
  SERMAYE_ARACI: ["Sermaya Piyasası Aracı", "Sermaye Piyasası Aracı"],
  BRUT_TEMETTU: ["Brüt Temettü Tutarı"],
  STOPAJ: ["Stopaj", "Stopaj*"],
  NET_TEMETTU: ["Net Temettü Tutarı"],
} as const satisfies Record<string, readonly string[]>

export type MidasHeaderField = keyof typeof MIDAS_HEADER_ALIASES

/** The tables the statement carries, each with its own header layout. */
export type MidasTableKind = "trade" | "account" | "dividend"

export const MIDAS_EXECUTED_STATUS = "Gerçekleşti"
export const MIDAS_CANCELLED_STATUS = "İptal Edildi"

export const MIDAS_TYPE_MAP: Record<string, TransactionType> = {
  Alış: TRANSACTION_TYPES.BUY,
  Satış: TRANSACTION_TYPES.SELL,
}

/** HESAP İŞLEMLERİ "İşlem Tipi" → transaction type. Anything not listed here
 *  (and not the interest case below) is skipped. */
export const MIDAS_ACCOUNT_TYPE_MAP: Record<string, TransactionType> = {
  "Para Yatırma": TRANSACTION_TYPES.TRANSFER_IN,
  "Para Çekme": TRANSACTION_TYPES.TRANSFER_OUT,
}

/** "Diğer Gelir" covers several things; only the ones whose description
 *  mentions *nema* (overnight interest on idle cash) are interest income. */
export const MIDAS_OTHER_INCOME_TYPE = "Diğer Gelir"
export const MIDAS_INTEREST_DESCRIPTION_TOKEN = "Nema"

/** Separator between ticker and long name in the dividend table's
 *  "Sermaya Piyasası Aracı" cell, e.g. `SPYM - SPDR Portfolio S&P 500…`. */
export const MIDAS_SECURITY_TICKER_SEPARATOR = " - "

/** Notes stamped on an imported dividend row. The row itself sits on the cash
 *  asset with the net amount, so gross/withholding survive only here. */
export function midasDividendNote(
  ticker: string,
  gross: string,
  withholding: string,
): string {
  return `${ticker} dividend (gross ${gross}, withholding ${withholding})`
}

export const MIDAS_REPORT_TITLE_TOKEN = "YATIRIM İŞLEMLER"
