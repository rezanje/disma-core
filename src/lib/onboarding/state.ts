/**
 * State panduan onboarding, disimpan per user di localStorage.
 * Mengikuti konvensi cache di src/lib/store.ts (prefix `disma_`).
 */

import { AccessKey, Role, RolePermissionMap } from '@/types'
import { APP_PAGES } from '@/lib/navigation'

/**
 * 'off'         — popup tidak pernah muncul. Panduannya tetap bisa dibuka sendiri
 *                 lewat tombol Panduan di sidebar.
 * 'every-login' — popup "mau dibimbing?" muncul tiap kali user login.
 * 'once'        — popup hanya muncul sekali seumur akun.
 *
 * Dimatikan 24 Agu 2026: alurnya masih sering berubah, jadi yang dituntunkan belum
 * tentu masih benar — dan popup yang muncul tiap login lebih dulu jadi gangguan
 * daripada bantuan. Hidupkan lagi kalau alurnya sudah settle.
 */
export const ONBOARDING_POPUP_MODE: 'off' | 'every-login' | 'once' = 'off'

/** Ditulis saat login berhasil, dibaca sekali oleh provider lalu dihapus. */
export const PENDING_WELCOME_KEY = 'disma_onboarding_pending_welcome'

const keyFor = (userId: string) => `disma_onboarding_${userId}`

export interface OnboardingState {
  /** Sudah pernah dikasih popup sambutan (dipakai saat mode 'once'). */
  askedWelcome: boolean
  /** Id alur yang sudah dituntaskan. */
  completed: string[]
  /** Alur yang sedang berjalan — bertahan saat pindah halaman. */
  active: { flowId: string; segIndex: number } | null
}

const EMPTY: OnboardingState = { askedWelcome: false, completed: [], active: null }

export const loadOnboarding = (userId: string): OnboardingState => {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(keyFor(userId))
    if (!raw) return EMPTY
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return EMPTY
  }
}

export const saveOnboarding = (userId: string, state: OnboardingState) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(state))
  } catch {}
}

/**
 * Cek apakah user boleh membuka sebuah halaman, memakai peta izin yang sama
 * dengan AuthGuard. Sengaja dibuat konservatif: kalau ragu, dianggap tidak boleh
 * — panduan lalu menutup dengan kartu serah-terima alih-alih memaksa pindah
 * halaman dan kena redirect (yang bikin tour mati di tengah jalan).
 */
export const canAccessPath = (
  path: string,
  role: Role | undefined,
  rolePermissions: RolePermissionMap,
): boolean => {
  if (!role) return false
  const perms = rolePermissions[role] || []

  for (const page of APP_PAGES) {
    const base = page.href.split('?')[0]
    if ((path === base || path.startsWith(base + '/')) && perms.includes(page.key)) return true
    for (const child of page.children || []) {
      const childBase = child.href.split('?')[0]
      if ((path === childBase || path.startsWith(childBase + '/')) && perms.includes(child.key as AccessKey)) {
        return true
      }
    }
  }
  return false
}
