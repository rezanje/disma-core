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
