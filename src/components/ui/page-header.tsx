import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Baris judul yang menempel di atas area isi: judul + satu baris konteks di kiri,
 * kontrol lalu SATU tombol primer di kanan. Tanpa emoji, tanpa sapaan.
 *
 * Spesifikasi: design_handoff_disma_ui_redesign/README.md § PageHeader.
 */
function PageHeader({
  title,
  context,
  actions,
  className,
  ...props
}: React.ComponentProps<"header"> & {
  title: React.ReactNode
  /** Satu baris: tanggal, jumlah, nilai total. */
  context?: React.ReactNode
  /** Kontrol periode/filter, lalu satu tombol primer. */
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4 md:px-7",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-[19px] leading-tight font-semibold text-slate-900">{title}</h1>
        {context ? (
          <p className="mt-[3px] text-[12.5px] leading-snug text-slate-400">{context}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  )
}

export { PageHeader }
