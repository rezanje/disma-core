import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(amount: number): string {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedAmount)
  return `Rp${formatted}`
}

export function formatRupiahValue(amount: number): string {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizedAmount)
}

export function formatNumber(val: number | string): string {
  if (val === undefined || val === null || val === '') return ''
  const num = typeof val === 'number' ? val : parseInt(val.toString().replace(/[^\d]/g, ''))
  if (isNaN(num)) return ''
  return num.toLocaleString('id-ID')
}

export function parseNumber(val: string): number {
  if (!val) return 0
  const clean = val.replace(/[^\d]/g, '')
  return parseInt(clean) || 0
}

/**
 * Returns true if `weeklyPriceRange.lastUpdated` falls inside the current
 * Thursday-to-Wednesday window (same window used by `updateProductPriceHistory`
 * in `src/lib/accounting.ts`). Stale ranges (older than 7 days) are ignored.
 */
export function isWeeklyPriceFresh(lastUpdated?: string, now: Date = new Date()): boolean {
  if (!lastUpdated) return false
  const updated = new Date(lastUpdated)
  if (Number.isNaN(updated.getTime())) return false

  const day = now.getDay() // 0=Sun..6=Sat
  const diffToLastThu = day >= 4 ? day - 4 : day + 3
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - diffToLastThu)
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  return updated >= startOfWeek && updated < endOfWeek
}

/**
 * Resolves the base price used for pricelist margin calculation.
 * Prefers `weeklyPriceRange.min` when the weekly window is fresh, falling back
 * to the static `basePrice`. This keeps client pricelists tied to the lowest
 * market HPP captured in the current Thu–Wed window.
 */
export function getEffectiveBasePrice(product: {
  basePrice: number
  weeklyPriceRange?: { min: number; max: number; lastUpdated: string }
}, now: Date = new Date()): { price: number; source: 'weekly_low' | 'master' } {
  const wr = product.weeklyPriceRange
  if (wr && wr.min > 0 && isWeeklyPriceFresh(wr.lastUpdated, now)) {
    return { price: wr.min, source: 'weekly_low' }
  }
  return { price: product.basePrice || 0, source: 'master' }
}

export function getWeekRange(dateStr: string) {
  const date = new Date(dateStr)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Start from Monday
  const monday = new Date(date.setDate(diff))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  
  return {
    start: monday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    end: sunday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    label: `Minggu: ${monday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${sunday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}`
  }
}
