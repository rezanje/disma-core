import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
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
