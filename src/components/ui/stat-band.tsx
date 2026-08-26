import * as React from "react"

import { cn } from "@/lib/utils"

type Tone = "ink" | "ok" | "warning" | "risk"

const toneClass: Record<Tone, string> = {
  ink: "text-slate-900",
  ok: "text-emerald-600",
  warning: "text-amber-500",
  risk: "text-rose-500",
}

export type StatItem = {
  label: React.ReactNode
  /** Sudah diformat. Sel sekunder pakai formatRupiahShort supaya tidak memaksa lebar kolom. */
  value: React.ReactNode
  note?: React.ReactNode
  tone?: Tone
  /** Keterangan berwarna, mis. "Rp71,3 jt lewat tempo". */
  noteTone?: Tone
}

/**
 * Satu kartu dibagi garis vertikal — pengganti deretan kartu KPI terpisah.
 * Blok kiri = angka pemimpin, sisanya grid sel sekunder.
 *
 * Spesifikasi: design_handoff_disma_ui_redesign/README.md § StatBand.
 *
 * ponytail: minmax(0,1fr) bukan 1fr — string seperti "Rp1.842.905.400" tidak bisa
 * dipecah, jadi kolom 1fr ke-floor di min-content dan sel pemimpin terpotong.
 */
function StatBand({
  leader,
  items,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  leader: StatItem
  items: StatItem[]
}) {
  return (
    <div
      data-slot="stat-band"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex-row",
        className
      )}
      {...props}
    >
      <div className="w-full flex-none border-b border-hairline px-6 py-5 lg:w-[290px] lg:border-r lg:border-b-0">
        <div className="text-xs font-medium text-slate-500">{leader.label}</div>
        <div
          className={cn(
            "tabular mt-2 mb-1.5 text-[36px] leading-none font-semibold tracking-[-0.03em]",
            toneClass[leader.tone ?? "ink"]
          )}
        >
          {leader.value}
        </div>
        {leader.note ? (
          <div className={cn("text-xs leading-snug text-slate-400", leader.noteTone && toneClass[leader.noteTone])}>
            {leader.note}
          </div>
        ) : null}
      </div>

      {/* grid-cols-* Tailwind = repeat(n, minmax(0,1fr)) — itu yang dibutuhkan di sini. */}
      <div className="grid flex-1 grid-cols-2 md:grid-cols-4">
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              "min-w-0 border-hairline px-5 py-5",
              i < items.length - 1 && "border-r",
              i < items.length - 2 && "border-b md:border-b-0"
            )}
          >
            <div className="truncate text-xs text-slate-400">{item.label}</div>
            <div className={cn("tabular mt-[7px] text-[19px] leading-tight font-semibold", toneClass[item.tone ?? "ink"])}>
              {item.value}
            </div>
            {item.note ? (
              <div className={cn("mt-[5px] text-[11.5px] leading-snug text-slate-400", item.noteTone && toneClass[item.noteTone])}>
                {item.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export { StatBand }
