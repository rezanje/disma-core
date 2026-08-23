"use client"

import { useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type SearchOption = { value: string; label: string }

/**
 * Pilihan panjang yang bisa dicari.
 *
 * Daftar vendor sudah tiga puluhan dan terus bertambah; menggulung daftar sepanjang
 * itu untuk satu baris — lalu mengulanginya untuk baris berikutnya — adalah cara
 * orang mulai asal pilih yang kelihatan duluan.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "— Pilih —",
  emptyLabel,
  className,
  disabled,
}: {
  value?: string | null
  onChange: (value: string) => void
  options: SearchOption[]
  placeholder?: string
  /** Pilihan kosong di paling atas. Tanpa ini, yang sudah dipilih tidak bisa dibatalkan. */
  emptyLabel?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [cari, setCari] = useState("")

  const terpilih = options.find(o => o.value === value)
  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, cari])

  const pilih = (v: string) => {
    onChange(v)
    setOpen(false)
    setCari("")
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCari("") }}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={cn(
              "h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-bold bg-white dark:bg-slate-900 flex items-center justify-between gap-1 disabled:opacity-50",
              !terpilih && "text-slate-500",
              className,
            )}
          >
            <span className="truncate">{terpilih?.label || placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center border-b px-2 h-9">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <input
            autoFocus
            placeholder="Cari..."
            className="h-full w-full bg-transparent text-xs font-bold outline-none placeholder:font-normal placeholder:text-slate-400"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto p-1">
          {emptyLabel && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
              onClick={() => pilih("")}
            >
              <span className="w-3.5">{!value && <Check className="h-3.5 w-3.5 text-emerald-600" />}</span>
              {emptyLabel}
            </button>
          )}
          {hasil.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs font-bold text-slate-400">Tidak ketemu.</p>
          ) : hasil.map(o => (
            <button
              key={o.value}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold hover:bg-slate-100",
                o.value === value && "bg-slate-100",
              )}
              onClick={() => pilih(o.value)}
            >
              <span className="w-3.5 shrink-0">
                {o.value === value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </span>
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
