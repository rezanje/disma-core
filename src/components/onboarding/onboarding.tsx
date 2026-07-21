"use client"

/**
 * Panduan onboarding berbasis alur kerja.
 *
 * Tiga bagian di file ini:
 * 1. OnboardingProvider — dipasang sekali di root layout. Menjalankan tour,
 *    menyambungnya antar halaman, dan memunculkan popup sambutan setelah login.
 * 2. Popup sambutan "Mau dibimbing dulu?".
 * 3. GuideButton — tombol Panduan di topbar untuk mengulang alur kapan saja.
 *
 * Teks panduannya tidak ada di sini — semuanya di src/lib/onboarding/flows.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { driver, type DriveStep, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { BookOpen, Compass } from "lucide-react"

import { useAppStore } from "@/lib/store"
import { FLOWS, getFlow, type TourSegment } from "@/lib/onboarding/flows"
import {
  ONBOARDING_POPUP_MODE,
  PENDING_WELCOME_KEY,
  canAccessPath,
  loadOnboarding,
  saveOnboarding,
} from "@/lib/onboarding/state"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Event internal untuk memulai alur dari komponen mana pun (mis. tombol Panduan). */
const START_EVENT = "disma:onboarding-start"

export const startFlow = (flowId: string) => {
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: flowId }))
}

/** Buang step yang elemennya tidak ada di halaman — data kosong, layar HP, atau role lain. */
const presentSteps = (segment: TourSegment) =>
  segment.steps.filter(s => document.querySelector(`[data-tour="${s.target}"]`))

/** Referensi tetap supaya selector store tidak menghasilkan objek baru tiap render. */
const NO_PERMISSIONS = {}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OnboardingProvider() {
  const pathname = usePathname()
  const router = useRouter()
  const currentUser = useAppStore(state => state.currentUser)
  const [showWelcome, setShowWelcome] = useState(false)

  const userId = currentUser?.id
  // Tour yang sedang tampil, supaya bisa dimatikan kalau efeknya dijalankan ulang
  // (React StrictMode di dev, atau perubahan dependency) — tanpa ini popovernya dobel.
  const tourRef = useRef<Driver | null>(null)

  const patchState = useCallback(
    (patch: Partial<ReturnType<typeof loadOnboarding>>) => {
      if (!userId) return
      saveOnboarding(userId, { ...loadOnboarding(userId), ...patch })
    },
    [userId],
  )

  // --- popup sambutan setelah login ---------------------------------------
  useEffect(() => {
    if (!userId || pathname === "/login") return
    if (sessionStorage.getItem(PENDING_WELCOME_KEY) !== "1") return
    sessionStorage.removeItem(PENDING_WELCOME_KEY)

    if (ONBOARDING_POPUP_MODE === "once" && loadOnboarding(userId).askedWelcome) return
    setShowWelcome(true)
  }, [userId, pathname])

  // --- jalankan segment kalau halamannya cocok ----------------------------
  useEffect(() => {
    if (!userId || pathname === "/login") return

    const state = loadOnboarding(userId)
    const active = state.active
    if (!active) return

    const flow = getFlow(active.flowId)
    const segment = flow?.segments[active.segIndex]
    if (!flow || !segment || segment.path !== pathname) return

    // Milik satu kali jalannya efek ini, tidak pernah di-reset. driver.js memanggil
    // onDestroyed secara asinkron, jadi penanda yang dipakai bersama antar-jalan
    // (useRef) sudah keburu berubah nilainya saat callback-nya akhirnya jalan.
    let cancelled = false
    let finished = false

    // Tunggu elemen targetnya benar-benar ada sebelum tour dimulai. Jeda tetap
    // tidak cukup: saat halaman dibuka dari nol, HydrationGate masih menampilkan
    // loader, dan semua langkah akan dianggap tidak ada lalu dilewati.
    const start = () => {
      // Dibaca langsung dari store, bukan lewat selector: StoreSync menyegarkan
      // data secara berkala, dan objek izin yang identitasnya berubah tiap sync
      // akan menjalankan ulang efek ini — tour jadi mengulang dari langkah satu
      // di tengah jalan.
      const perms = useAppStore.getState().rolePermissions ?? NO_PERMISSIONS
      const nextSegment = flow.segments[active.segIndex + 1]
      const canGoNext =
        !!nextSegment && canAccessPath(nextSegment.path, currentUser?.role, perms)

      const steps: DriveStep[] = [
        ...presentSteps(segment).map(s => ({
          element: `[data-tour="${s.target}"]`,
          popover: { title: s.title, description: s.body },
        })),
        {
          popover: {
            title: segment.handoff.title,
            description: segment.handoff.body,
            doneBtnText: canGoNext ? "Lanjut" : "Ngerti",
          },
        },
      ]

      const tour = driver({
        steps,
        showProgress: true,
        smoothScroll: true,
        skipMissingElement: true,
        allowClose: true,
        // Panduan ini hanya menunjuk & menjelaskan — tidak pernah menyuruh
        // menekan tombol, supaya tidak ada data asli yang ikut berubah.
        disableActiveInteraction: true,
        nextBtnText: "Lanjut",
        prevBtnText: "Kembali",
        doneBtnText: "Selesai",
        progressText: "{{current}} dari {{total}}",
        onDoneClick: () => {
          finished = true
          tour.destroy()
        },
        onDestroyed: () => {
          if (cancelled) return // dimatikan oleh cleanup, bukan oleh user
          tourRef.current = null
          if (!finished) {
            patchState({ active: null }) // ditutup di tengah jalan
            return
          }
          if (canGoNext) {
            patchState({ active: { flowId: flow.id, segIndex: active.segIndex + 1 } })
            router.push(nextSegment.path)
          } else {
            const done = loadOnboarding(userId)
            patchState({
              active: null,
              completed: done.completed.includes(flow.id)
                ? done.completed
                : [...done.completed, flow.id],
            })
          }
        },
      })

      tourRef.current = tour
      tour.drive()
    }

    const POLL_MS = 150
    const GIVE_UP_MS = 5000
    let waited = 0
    const timer = window.setInterval(() => {
      waited += POLL_MS
      // Mulai begitu ada satu target yang muncul. Kalau sampai batas waktu tidak
      // ada satu pun (halaman kosong, layar kecil, atau role tanpa tombol itu),
      // tour tetap jalan dengan kartu penutupnya saja.
      if (presentSteps(segment).length > 0 || waited >= GIVE_UP_MS) {
        window.clearInterval(timer)
        if (!cancelled) start()
      }
    }, POLL_MS)

    return () => {
      window.clearInterval(timer)
      cancelled = true
      tourRef.current?.destroy()
      tourRef.current = null
    }
    // Sengaja hanya nilai yang stabil. Apa pun yang identitasnya berubah tiap
    // sinkronisasi data akan menjalankan ulang efek ini dan mengulang tour
    // dari langkah satu — izin dibaca dari store saat dibutuhkan.
  }, [userId, pathname, currentUser?.role, router, patchState])

  // --- pemicu dari tombol Panduan -----------------------------------------
  useEffect(() => {
    const onStart = (e: Event) => {
      const flowId = (e as CustomEvent<string>).detail
      const flow = getFlow(flowId)
      if (!flow || !userId) return
      patchState({ active: { flowId, segIndex: 0 } })
      const first = flow.segments[0].path
      if (pathname === first) router.refresh()
      router.push(first)
    }
    window.addEventListener(START_EVENT, onStart)
    return () => window.removeEventListener(START_EVENT, onStart)
  }, [userId, pathname, router, patchState])

  if (!showWelcome) return null

  return (
    <WelcomeDialog
      onClose={(guided) => {
        setShowWelcome(false)
        patchState({ askedWelcome: true })
        if (guided) startFlow(FLOWS[0].id)
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Popup sambutan
// ---------------------------------------------------------------------------

function WelcomeDialog({ onClose }: { onClose: (guided: boolean) => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(false) }}>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-4 rounded-3xl bg-emerald-50 text-emerald-600">
            <Compass className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              Mau dibimbing dulu?
            </h2>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              Kami tuntun sebentar lewat alur kerja yang paling sering dipakai — cuma menunjuk
              dan menjelaskan, tidak ada data yang berubah.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full pt-2">
            <Button
              onClick={() => onClose(true)}
              className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] uppercase tracking-wider"
            >
              Bimbing Saya
            </Button>
            <Button
              variant="outline"
              onClick={() => onClose(false)}
              className="h-12 rounded-2xl font-extrabold text-[11px] uppercase tracking-wider"
            >
              Sudah Bisa
            </Button>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-1">
            Bisa dibuka lagi kapan saja lewat tombol Panduan
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tombol Panduan (dipasang di topbar)
// ---------------------------------------------------------------------------

export function GuideButton({ className, showLabel }: { className?: string; showLabel?: boolean }) {
  const pathname = usePathname()

  // Alur yang menyentuh halaman yang sedang dibuka ditaruh paling atas.
  const relevant = (flowId: string) =>
    getFlow(flowId)?.segments.some(s => s.path === pathname) ?? false
  const ordered = [...FLOWS].sort((a, b) => Number(relevant(b.id)) - Number(relevant(a.id)))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger title="Panduan" className={className}>
        <BookOpen className="w-4 h-4" />
        {showLabel && (
          <span className="text-[10px] font-bold leading-none tracking-tight text-center">Panduan</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 liquid-card mt-2 p-2 border-none">
        <DropdownMenuGroup>
        <DropdownMenuLabel className="px-3 py-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-800">Panduan Alur Kerja</p>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">Pilih alur untuk dituntun langkah demi langkah</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-100" />
        {ordered.map(flow => (
          <DropdownMenuItem
            key={flow.id}
            onClick={() => startFlow(flow.id)}
            className="flex flex-col items-start gap-1 px-3 py-3 rounded-2xl hover:bg-emerald-50 cursor-pointer outline-none"
          >
            <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">
              {flow.name}
              {relevant(flow.id) && (
                <span className="ml-2 text-[8px] font-black text-emerald-600 uppercase tracking-widest">
                  Halaman ini
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-500 leading-snug whitespace-normal">{flow.desc}</span>
          </DropdownMenuItem>
        ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
