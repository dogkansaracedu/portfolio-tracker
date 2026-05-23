import type { TransactionType } from "@/types/database"
import { TRANSACTION_TYPES } from "./transaction-types"

export const MIDAS_HEADERS = {
  TARIH: "Tarih",
  ISLEM_TURU: "İşlem Türü",
  SEMBOL: "Sembol",
  ISLEM_TIPI: "İşlem Tipi",
  ISLEM_DURUMU: "İşlem Durumu",
  PARA_BIRIMI: "Para Birimi",
  EMIR_ADET: "Emir Adet",
  EMIR_TUTARI: "Emir Tutarı",
  GERCEKLESEN_ADET: "Gerçekleşen Adet",
  ORT_FIYAT: "Ortalama İşlem Fiyatı",
  ISLEM_UCRETI: "İşlem Ücreti",
  ISLEM_TUTARI: "İşlem Tutarı",
} as const

export type MidasHeaderField = keyof typeof MIDAS_HEADERS

export const MIDAS_EXECUTED_STATUS = "Gerçekleşti"
export const MIDAS_CANCELLED_STATUS = "İptal Edildi"

export const MIDAS_TYPE_MAP: Record<string, TransactionType> = {
  Alış: TRANSACTION_TYPES.BUY,
  Satış: TRANSACTION_TYPES.SELL,
}

export const MIDAS_REPORT_TITLE_TOKEN = "YATIRIM İŞLEMLER"
