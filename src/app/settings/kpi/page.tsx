"use client"

import { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Target, Award, TrendingUp, ChevronDown, ChevronUp, Lightbulb, BarChart3, CheckCircle2, Clock
} from "lucide-react"
import { SmartKpi, getKpiGrade, GRADE_META, SmartKpiGrade } from "@/types"
import { useState, useEffect } from "react"

export default function MyKpiPage() {
  const currentUser = useAppStore(state => state.currentUser)
  const users = useAppStore(state => state.users) || []
  const kpis = useAppStore(state => state.kpiObjectives) || []
  
  // Force sync on mount just in case local cache is stale
  useEffect(() => {
    if (kpis.length === 0 || !kpis[0].assigneeUserId) {
      useAppStore.getState().init()
    }
  }, [kpis])

  const [expandedKpi, setExpandedKpi] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')

  const PERIODS = ['Januari 2026', 'Februari 2026', 'Maret 2026', 'April 2026', 'Mei 2026', 'Juni 2026', 'Juli 2026', 'Agustus 2026', 'September 2026', 'Oktober 2026', 'November 2026', 'Desember 2026']

  // My KPIs
  const myKpis = useMemo(() => {
    let result = kpis.filter(k => k.assigneeUserId === currentUser?.id)
    if (selectedPeriod) result = result.filter(k => k.period === selectedPeriod)
    return result
  }, [kpis, currentUser?.id, selectedPeriod])

  // Overall grade
  const { grade, score } = useMemo(() => {
    if (myKpis.length === 0) return { grade: '-' as SmartKpiGrade, score: 0 }
    const totalWeight = myKpis.reduce((s, k) => s + k.weight, 0)
    if (totalWeight === 0) return { grade: '-' as SmartKpiGrade, score: 0 }
    const ws = myKpis.reduce((s, k) => {
      const pct = k.targetValue > 0 ? Math.min((k.actualValue / k.targetValue) * 100, 150) : 0
      return s + (pct * k.weight / totalWeight)
    }, 0)
    return { grade: getKpiGrade(ws, 100), score: Math.round(ws) }
  }, [myKpis])

  const gradeMeta = GRADE_META[grade]
  const totalWeight = myKpis.reduce((s, k) => s + k.weight, 0)
  const completedCount = myKpis.filter(k => k.status === 'Evaluated').length

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-rose-500" /> KPI Saya
        </h3>
        <p className="text-sm text-slate-500 font-medium">Pantau pencapaian target kerja dan evaluasi performa lo.</p>
      </div>

      {/* Period Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setSelectedPeriod('')}
          className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border",
            !selectedPeriod ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
          )}>Semua Periode</button>
        {PERIODS.map(p => (
          <button key={p} onClick={() => setSelectedPeriod(p)}
            className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase transition-all border",
              selectedPeriod === p ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            )}>{p}</button>
        ))}
      </div>

      {/* Grade Overview */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(244,63,94,0.15),transparent_70%)]" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Performa Kamu</p>
              <h2 className="text-4xl font-black tracking-tight">{currentUser?.name}</h2>
              <p className="text-sm text-slate-400 font-medium mt-1">{selectedPeriod || 'Semua Periode'} • {myKpis.length} KPI Assigned</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Skor</p>
                <p className="text-4xl font-black">{score}%</p>
              </div>
              <div className={cn("w-24 h-24 rounded-2xl flex flex-col items-center justify-center border-2", gradeMeta.bg)}>
                <p className={cn("text-4xl font-black", gradeMeta.color)}>{grade}</p>
                <p className={cn("text-[8px] font-black uppercase tracking-widest", gradeMeta.color)}>{gradeMeta.label}</p>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total KPI</p>
              <p className="text-2xl font-black mt-1">{myKpis.length}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bobot Total</p>
              <p className={cn("text-2xl font-black mt-1", totalWeight === 100 ? "text-emerald-400" : "text-amber-400")}>{totalWeight}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sudah Dievaluasi</p>
              <p className="text-2xl font-black mt-1">{completedCount}/{myKpis.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Conclusion Banner */}
      {myKpis.length > 0 && (
        <div className={cn("p-5 rounded-2xl border-2 flex items-start gap-3", gradeMeta.bg)}>
          <Lightbulb className={cn("w-6 h-6 shrink-0", gradeMeta.color)} />
          <div>
            <p className={cn("text-sm font-black", gradeMeta.color)}>Kesimpulan: Grade {grade} – {gradeMeta.label}</p>
            <p className="text-xs font-medium text-slate-600 mt-0.5">{gradeMeta.desc}</p>
          </div>
        </div>
      )}

      {/* KPI List */}
      {myKpis.length === 0 ? (
        <div className="text-center py-20">
          <Target className="w-16 h-16 mx-auto text-slate-200 mb-4" />
          <p className="font-bold text-slate-400 text-lg">Belum ada KPI yang diassign untuk lo.</p>
          <p className="text-sm text-slate-400 mt-1">Hubungi atasan untuk mendapatkan target kinerja.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myKpis.map(kpi => {
            const pct = kpi.targetValue > 0 ? Math.min((kpi.actualValue / kpi.targetValue) * 100, 150) : 0
            const kpiGrade = getKpiGrade(kpi.actualValue, kpi.targetValue, kpi.manualGrade)
            const kGradeMeta = GRADE_META[kpiGrade]
            const isExpanded = expandedKpi === kpi.id
            const assignedBy = users.find(u => u.id === kpi.assignedByUserId)

            return (
              <div key={kpi.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
                <div className="p-5 cursor-pointer flex items-center gap-4" onClick={() => setExpandedKpi(isExpanded ? null : kpi.id)}>
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0 border-2", kGradeMeta.bg, kGradeMeta.color)}>
                    {kpiGrade}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-slate-800 text-sm">{kpi.title}</h4>
                      <Badge variant="outline" className="text-[9px]">{kpi.category}</Badge>
                      <Badge variant="outline" className="text-[9px]">{kpi.period}</Badge>
                      {kpi.status === 'Evaluated' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-1000",
                          pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                        )} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-sm font-black text-slate-600 shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900">{kpi.actualValue} / {kpi.targetValue}</p>
                    <p className="text-[10px] text-slate-400 font-bold">{kpi.unit} • Bobot {kpi.weight}%</p>
                  </div>
                  <div className="text-slate-300">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
                      {[
                        { key: 'S', label: 'Specific', val: kpi.specific, icon: '🎯' },
                        { key: 'M', label: 'Measurable', val: kpi.measurable, icon: '📏' },
                        { key: 'A', label: 'Achievable', val: kpi.achievable, icon: '✅' },
                        { key: 'R', label: 'Relevant', val: kpi.relevant, icon: '🔗' },
                        { key: 'T', label: 'Time-Bound', val: kpi.timeBound, icon: '⏰' },
                      ].map(s => (
                        <div key={s.key} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{s.icon} {s.label}</p>
                          <p className="text-xs font-medium text-slate-700">{s.val || 'Belum diisi'}</p>
                        </div>
                      ))}
                    </div>

                    {kpi.evaluatorNote && (
                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-3">
                        <p className="text-[9px] font-black uppercase text-blue-500 mb-1">💬 Catatan Evaluator ({users.find(u => u.id === kpi.evaluatedBy)?.name || '-'})</p>
                        <p className="text-sm text-blue-800 font-medium">{kpi.evaluatorNote}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium pt-2 border-t border-slate-100">
                      <span>Diassign oleh: <strong className="text-slate-600">{assignedBy?.name || 'System'}</strong></span>
                      <span>{kpi.evaluatedAt ? `Dievaluasi: ${new Date(kpi.evaluatedAt).toLocaleDateString('id-ID')}` : 'Belum dievaluasi'}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
