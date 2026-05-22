import { bn } from "@/lib/config"
import { USER_PICKABLE_TYPES } from "@/lib/constants/transaction-types"
import { SUPPORTED_FIAT_CURRENCIES } from "@/lib/constants/currencies"
import type { SheetField, SheetRow } from "./types"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function validateField(
  field: SheetField,
  value: string,
  row: SheetRow,
): string | null {
  switch (field) {
    case "date": {
      if (!value) return "Date is required"
      if (!ISO_DATE_RE.test(value)) return "Use YYYY-MM-DD"
      if (value > todayLocalIso()) return "Date is in the future"
      return null
    }
    case "assetId":
      return value ? null : "Asset is required"
    case "platformId":
      return value ? null : "Platform is required"
    case "type":
      return (USER_PICKABLE_TYPES as readonly string[]).includes(value)
        ? null
        : "Pick a valid type"
    case "amount": {
      if (!value) return "Amount is required"
      const n = bn(value)
      if (n.isNaN()) return "Not a number"
      if (row.type === "fee") {
        if (n.lt(0)) return "Fee cannot be negative"
      } else if (!n.gt(0)) {
        return "Amount must be > 0"
      }
      return null
    }
    case "unitPrice": {
      // Price is optional for plain transfers — the modal/tx helpers auto-fill
      // currency transfers, and a paired transfer_out fills from FIFO. We
      // require a positive price for the other types.
      const requiresPrice =
        row.type === "buy" ||
        row.type === "sell" ||
        row.type === "dividend" ||
        row.type === "interest"
      if (!requiresPrice) return null
      if (!value) return "Unit price is required"
      const n = bn(value)
      if (n.isNaN()) return "Not a number"
      if (n.lt(0)) return "Cannot be negative"
      return null
    }
    case "priceCurrency":
      return (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(value)
        ? null
        : "Pick a supported currency"
    case "fee": {
      if (!value) return null
      const n = bn(value)
      if (n.isNaN()) return "Not a number"
      if (n.lt(0)) return "Cannot be negative"
      return null
    }
    case "notes":
      return value.length > 500 ? "Max 500 chars" : null
    default:
      return null
  }
}

export function validateRow(row: SheetRow): Partial<Record<SheetField, string>> {
  const errors: Partial<Record<SheetField, string>> = {}
  const fields: SheetField[] = [
    "date",
    "assetId",
    "platformId",
    "type",
    "amount",
    "unitPrice",
    "priceCurrency",
    "fee",
    "notes",
  ]
  for (const f of fields) {
    const e = validateField(f, String((row as unknown as Record<string, unknown>)[f] ?? ""), row)
    if (e) errors[f] = e
  }
  return errors
}
