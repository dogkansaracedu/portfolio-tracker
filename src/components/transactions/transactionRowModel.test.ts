import { describe, expect, it } from "vitest"
import {
  matchesAnyFilterType,
  matchesFilterType,
  transferPairParentIds,
} from "./transactionRowModel"
import {
  TRANSACTION_TYPES,
  TRANSFER_PAIR_FILTER_TYPE,
  type TransactionFilterType,
} from "@/lib/constants/transaction-types"
import type { TransactionType } from "@/types/database"

interface Row {
  id: string
  type: TransactionType
  linked_tx_id: string | null
}

function row(id: string, type: TransactionType, linkedTxId: string | null = null): Row {
  return { id, type, linked_tx_id: linkedTxId }
}

// A → B internal transfer: the transfer_in child points at the transfer_out parent.
const pairParent = row("out-pair", TRANSACTION_TYPES.TRANSFER_OUT)
const pairChild = row("in-pair", TRANSACTION_TYPES.TRANSFER_IN, "out-pair")
const loneWithdrawal = row("out-lone", TRANSACTION_TYPES.TRANSFER_OUT)
const loneDeposit = row("in-lone", TRANSACTION_TYPES.TRANSFER_IN)
const buy = row("buy-1", TRANSACTION_TYPES.BUY)

const history = [pairParent, pairChild, loneWithdrawal, loneDeposit, buy]
const parentIds = transferPairParentIds(history)

describe("transferPairParentIds", () => {
  it("collects the transfer_out ids that own a transfer_in child", () => {
    expect([...parentIds]).toEqual(["out-pair"])
  })

  it("ignores a linked child that is not a transfer_in (a trade's cash leg)", () => {
    const ids = transferPairParentIds([
      row("cash-1", TRANSACTION_TYPES.CASH_DEBIT, "buy-1"),
    ])
    expect(ids.size).toBe(0)
  })
})

describe("matchesFilterType", () => {
  it("Transfer matches both sides of a linked pair", () => {
    expect(matchesFilterType(pairParent, TRANSFER_PAIR_FILTER_TYPE, parentIds)).toBe(true)
    expect(matchesFilterType(pairChild, TRANSFER_PAIR_FILTER_TYPE, parentIds)).toBe(true)
  })

  it("Transfer matches neither a lone withdrawal nor a lone deposit", () => {
    expect(matchesFilterType(loneWithdrawal, TRANSFER_PAIR_FILTER_TYPE, parentIds)).toBe(false)
    expect(matchesFilterType(loneDeposit, TRANSFER_PAIR_FILTER_TYPE, parentIds)).toBe(false)
  })

  it("Withdrawal matches only a lone transfer_out", () => {
    expect(matchesFilterType(loneWithdrawal, TRANSACTION_TYPES.TRANSFER_OUT, parentIds)).toBe(true)
    expect(matchesFilterType(pairParent, TRANSACTION_TYPES.TRANSFER_OUT, parentIds)).toBe(false)
  })

  it("Deposit matches only a lone transfer_in", () => {
    expect(matchesFilterType(loneDeposit, TRANSACTION_TYPES.TRANSFER_IN, parentIds)).toBe(true)
    expect(matchesFilterType(pairChild, TRANSACTION_TYPES.TRANSFER_IN, parentIds)).toBe(false)
  })

  it("every other chip is a plain stored-type match", () => {
    expect(matchesFilterType(buy, TRANSACTION_TYPES.BUY, parentIds)).toBe(true)
    expect(matchesFilterType(buy, TRANSACTION_TYPES.SELL, parentIds)).toBe(false)
  })
})

describe("matchesAnyFilterType", () => {
  it("is a union across the active chips", () => {
    const chips: TransactionFilterType[] = [
      TRANSACTION_TYPES.TRANSFER_OUT,
      TRANSFER_PAIR_FILTER_TYPE,
    ]
    expect(history.filter((tx) => matchesAnyFilterType(tx, chips, parentIds))).toEqual([
      pairParent,
      pairChild,
      loneWithdrawal,
    ])
  })

  it("matches nothing when no chip applies", () => {
    expect(matchesAnyFilterType(buy, [TRANSACTION_TYPES.FEE], parentIds)).toBe(false)
  })
})
