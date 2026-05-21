"use client"

import { RecordHistory } from "@/types"

const formatValue = (v: any): string => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function DiffViewer({ entry }: { entry: RecordHistory }) {
  if (entry.action === 'delete') {
    return (
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-2">Snapshot record yang dihapus</p>
        <pre className="text-[10px] bg-white border rounded-lg p-3 overflow-x-auto max-h-64">{JSON.stringify(entry.oldData, null, 2)}</pre>
      </div>
    )
  }

  if (entry.action === 'create') {
    return (
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Record baru</p>
        <pre className="text-[10px] bg-white border rounded-lg p-3 overflow-x-auto max-h-64">{JSON.stringify(entry.newData, null, 2)}</pre>
      </div>
    )
  }

  const fields = entry.changedFields.length > 0 ? entry.changedFields : Object.keys({ ...(entry.oldData || {}), ...(entry.newData || {}) })

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
        {entry.changedFields.length} field berubah
      </p>
      <div className="space-y-2">
        {fields.map(f => {
          const before = entry.oldData?.[f]
          const after = entry.newData?.[f]
          return (
            <div key={f} className="grid grid-cols-[120px_1fr_1fr] gap-3 items-start text-[11px]">
              <span className="font-mono font-bold text-slate-600 truncate">{f}</span>
              <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 text-rose-700 break-all">{formatValue(before)}</div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-emerald-700 break-all">{formatValue(after)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
