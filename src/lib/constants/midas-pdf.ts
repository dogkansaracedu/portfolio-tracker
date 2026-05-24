import type { TransactionType } from "@/types/database"
import { TRANSACTION_TYPES } from "./transaction-types"

/** Canonical column field keys. The PDF's actual labels vary between Midas
 *  variants (e.g. "Emir Adet" vs "Emir Adedi"), so each field accepts a list
 *  of accepted labels. The parser canonicalizes whitespace/case before
 *  matching. */
export const MIDAS_HEADER_ALIASES = {
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
} as const satisfies Record<string, readonly string[]>

export type MidasHeaderField = keyof typeof MIDAS_HEADER_ALIASES

export const MIDAS_EXECUTED_STATUS = "Gerçekleşti"
export const MIDAS_CANCELLED_STATUS = "İptal Edildi"

export const MIDAS_TYPE_MAP: Record<string, TransactionType> = {
  Alış: TRANSACTION_TYPES.BUY,
  Satış: TRANSACTION_TYPES.SELL,
}

export const MIDAS_REPORT_TITLE_TOKEN = "YATIRIM İŞLEMLER"
