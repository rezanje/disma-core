import type { ChartOfAccount } from "@/types"

/**
 * Bank/cash COAs occupy 1-1000 … 1-1900 (step 100). Returns the lowest free
 * code in that band; if the band is full, scans finer 1-1xy0 slots.
 * Throws if no 1-1xxx slot remains (90+ slots — practically never).
 */
export function nextBankCoaCode(coas: Pick<ChartOfAccount, "accountCode">[]): string {
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
