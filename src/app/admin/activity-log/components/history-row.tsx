"use client"

import { useState } from "react"
import { RecordHistory } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Undo2, User, Clock } from "lucide-react"
import DiffViewer from "./diff-viewer"

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-rose-100 text-rose-700',
  rollback: 'bg-amber-100 text-amber-700',
}

export default function HistoryRow({
  entry,
  canRollback,
  onRollback,
}: {
  entry: RecordHistory
  canRollback: boolean
  onRollback: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const when = new Date(entry.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-3 p-4">
        <button onClick={() => setExpanded(p => !p)} className="flex items-center gap-3 flex-1 text-left min-w-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
          <Badge className={`${ACTION_COLORS[entry.action] || 'bg-slate-100'} border-none text-[10px] font-black uppercase shrink-0`}>
            {entry.action}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-slate-800">{entry.tableName}</span>
              <span className="font-mono text-[10px] text-slate-400">#{entry.recordId.slice(0, 8)}</span>
              {entry.changedFields.length > 0 && (
                <span className="text-[10px] text-slate-500 font-medium">{entry.changedFields.length} field</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{entry.userName || 'system'} {entry.userRole ? `(${entry.userRole})` : ''}</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{when}</span>
              {entry.reason && <span className="italic truncate max-w-xs">— {entry.reason}</span>}
            </div>
          </div>
        </button>
        {canRollback && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest shrink-0"
            onClick={onRollback}
          >
            <Undo2 className="h-3 w-3 mr-1" /> Rollback
          </Button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50/50">
          <DiffViewer entry={entry} />
        </div>
      )}
    </div>
  )
}
