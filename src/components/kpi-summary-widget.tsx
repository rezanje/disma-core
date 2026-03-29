"use client"

import { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Target, TrendingUp, Award } from "lucide-react"
import { getKpiGrade, GRADE_META, SmartKpiGrade } from "@/types"
import Link from "next/link"

/**
 * KPI Summary Widget - Shows a compact overview of the current user's KPI performance.
 * Drop this into any dashboard page.
 */
export default function KpiSummaryWidget() {
  const currentUser = useAppStore(state => state.currentUser)
  const kpis = useAppStore(state => state.kpiObjectives) || []
  
  // Get current month period
  const currentPeriod = useMemo(() => {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const now = new Date()
    return `${months[now.getMonth()]} ${now.getFullYear()}`
  }, [])

  const myKpis = useMemo(() => {
    return kpis.filter(k => k.assigneeUserId === currentUser?.id && k.period === currentPeriod)
  }, [kpis, currentUser?.id, currentPeriod])

  // Overall grade
  const { grade, score } = useMemo(() => {
    if (myKpis.length === 0) return { grade: '-' as SmartKpiGrade, score: 0 }
    const tw = myKpis.reduce((s, k) => s + k.weight, 0)
    if (tw === 0) return { grade: '-' as SmartKpiGrade, score: 0 }
    const ws = myKpis.reduce((s, k) => {
      const pct = k.targetValue > 0 ? Math.min((k.actualValue / k.targetValue) * 100, 150) : 0
      return s + (pct * k.weight / tw)
    }, 0)
    return { grade: getKpiGrade(ws, 100), score: Math.round(ws) }
  }, [myKpis])

  if (myKpis.length === 0) return null

  const gradeMeta = GRADE_META[grade]
  const evaluatedCount = myKpis.filter(k => k.status === 'Evaluated').length

  return (
    <Link href="/settings/kpi" className="block">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 text-white hover:shadow-xl transition-all group cursor-pointer relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(244,63,94,0.12),transparent_60%)]" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">SMART KPI</span>
            </div>
            <span className="text-[10px] font-bold text-slate-500">{currentPeriod}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-black">{score}%</p>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                {myKpis.length} KPI • {evaluatedCount} Evaluated
              </p>
            </div>
            <div className={cn("w-14 h-14 rounded-xl flex flex-col items-center justify-center border-2 group-hover:scale-110 transition-transform", gradeMeta.bg)}>
              <p className={cn("text-2xl font-black", gradeMeta.color)}>{grade}</p>
              <p className={cn("text-[7px] font-black uppercase", gradeMeta.color)}>{gradeMeta.label}</p>
            </div>
          </div>

          {/* Mini progress bars for top 3 KPIs */}
          <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
            {myKpis.slice(0, 3).map(k => {
              const pct = k.targetValue > 0 ? Math.min((k.actualValue / k.targetValue) * 100, 100) : 0
              return (
                <div key={k.id} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-400 font-bold w-24 truncate">{k.title}</span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", 
                      pct >= 90 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'
                    )} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[9px] font-black text-slate-400 w-8 text-right">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Link>
  )
}
