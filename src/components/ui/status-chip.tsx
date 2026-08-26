import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Status normal TIDAK diberi lencana — cukup teks abu. Warna hanya untuk yang
 * butuh tindakan, supaya yang berwarna benar-benar menarik mata.
 *
 * Spesifikasi: design_handoff_disma_ui_redesign/README.md § StatusChip.
 */
export type StatusTone = "plain" | "ok" | "warning" | "risk"

const toneClass: Record<StatusTone, string> = {
  plain: "text-slate-500",
  ok: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-100 text-amber-500",
  risk: "bg-rose-50 text-destructive",
}

/** Status → nada. Yang tidak terdaftar dianggap normal (tanpa lencana). */
const STATUS_TONE: Record<string, StatusTone> = {
  // perlu tindakan — merah tanah
  'Pending Approval': 'risk',
  'Menunggu Persetujuan': 'risk',
  Macet: 'risk',
  Batal: 'risk',
  Ditolak: 'risk',
  Rejected: 'risk',
  Unpaid: 'risk',
  'Lewat Tempo': 'risk',

  // perlu perhatian — oker
  'Kurang Kirim': 'warning',
  Telat: 'warning',
  Pending: 'warning',
  Partial: 'warning',
  'Menunggu Audit': 'warning',
  QC: 'warning',

  // beres — hijau
  Terkirim: 'ok',
  Selesai: 'ok',
  Paid: 'ok',
  Lunas: 'ok',
  Approved: 'ok',
  Disetujui: 'ok',
  Cocok: 'ok',
  Lancar: 'ok',
}

export function statusTone(status?: string | null): StatusTone {
  if (!status) return 'plain'
  return STATUS_TONE[status] ?? 'plain'
}

function StatusChip({
  status,
  tone,
  label,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status?: string | null
  /** Timpa nada otomatis kalau halaman tahu lebih baik. */
  tone?: StatusTone
  label?: React.ReactNode
}) {
  const resolved = tone ?? statusTone(status)
  const text = label ?? status ?? '—'

  if (resolved === 'plain') {
    return (
      <span
        data-slot="status-chip"
        className={cn("text-[12.5px] leading-none text-slate-500", className)}
        {...props}
      >
        {text}
      </span>
    )
  }

  return (
    <span
      data-slot="status-chip"
      data-tone={resolved}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-1 text-[11.5px] leading-none font-medium",
        toneClass[resolved],
        className
      )}
      {...props}
    >
      {text}
    </span>
  )
}

export { StatusChip, STATUS_TONE }
