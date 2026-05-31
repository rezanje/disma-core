// Mirror of src/lib/coa.ts — keep in sync when the algorithm changes.
import { test } from "node:test"
import assert from "node:assert/strict"

function nextBankCoaCode(coas) {
  const used = new Set(coas.map((c) => c.accountCode))
  for (let h = 0; h <= 9; h++) {
    const code = `1-1${h}00`
    if (!used.has(code)) return code
  }
  for (let x = 0; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const code = `1-1${x}${y}0`
      if (!used.has(code)) return code
    }
  }
  throw new Error("No free bank COA code available in the 1-1xxx range")
}

test("returns 1-1100 given the production seed set", () => {
  const seed = ["1-1000", "1-1200", "1-1300", "1-1400", "1-1500"].map((c) => ({ accountCode: c }))
  assert.equal(nextBankCoaCode(seed), "1-1100")
})

test("skips to next free hundred when 1-1100 taken", () => {
  const seed = ["1-1000", "1-1100", "1-1200", "1-1300", "1-1400", "1-1500"].map((c) => ({ accountCode: c }))
  assert.equal(nextBankCoaCode(seed), "1-1600")
})

test("falls back to finer slots when all hundreds are used", () => {
  const seed = []
  for (let h = 0; h <= 9; h++) seed.push({ accountCode: `1-1${h}00` })
  assert.equal(nextBankCoaCode(seed), "1-1010")
})

test("throws when every 1-1xxx slot is exhausted", () => {
  const seed = []
  for (let h = 0; h <= 9; h++) seed.push({ accountCode: `1-1${h}00` })
  for (let x = 0; x <= 9; x++) for (let y = 1; y <= 9; y++) seed.push({ accountCode: `1-1${x}${y}0` })
  assert.throws(() => nextBankCoaCode(seed), /No free bank COA code/)
})
