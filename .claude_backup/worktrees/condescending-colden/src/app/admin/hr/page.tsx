"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { 
  Users, Briefcase, Plus, UserPlus, Target, TrendingUp, Award, 
  ChevronDown, ChevronUp, Edit3, Trash2, CheckCircle2, Eye, Star,
  BarChart3, FileText, Lightbulb
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { Employee, SmartKpi, getKpiGrade, GRADE_META, SmartKpiGrade } from "@/types"

// --- SMART KPI CATEGORIES ---
const KPI_CATEGORIES = ['Sales', 'Operasional', 'Quality', 'Customer', 'Finance', 'Growth', 'Compliance']
const KPI_UNITS = ['%', 'Rp', 'deals', 'item', 'unit', 'kg', 'pelanggan', 'tiket', 'project']
const PERIODS = ['Januari 2026', 'Februari 2026', 'Maret 2026', 'April 2026', 'Mei 2026', 'Juni 2026', 'Juli 2026', 'Agustus 2026', 'September 2026', 'Oktober 2026', 'November 2026', 'Desember 2026']

export default function HRDashboardPage() {
  const currentUser = useAppStore(state => state.currentUser)
  const users = useAppStore(state => state.users) || []
  const employees = useAppStore(state => state.employees) || []
  const kpis = useAppStore(state => state.kpiObjectives) || []
  const addEmployee = useAppStore(state => state.addEmployee)
  const addKpi = useAppStore(state => state.addKpi)
  const updateKpi = useAppStore(state => state.updateKpi)
  const deleteKpi = useAppStore(state => state.deleteKpi)

  // State
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false)
  const [isAddKpiOpen, setIsAddKpiOpen] = useState(false)
  const [isEvalOpen, setIsEvalOpen] = useState(false)
  const [editingKpi, setEditingKpi] = useState<SmartKpi | null>(null)
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Maret 2026')
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null)
  
  // Employee form
  const [newEmp, setNewEmp] = useState<Partial<Employee>>({
    fullName: "", position: "", department: "", 
    baseSalary: 0, kasbon: 0, joinDate: new Date().toISOString().split('T')[0], status: "Active"
  })

  // SMART KPI form
  const emptyKpiForm: Partial<SmartKpi> = {
    assigneeUserId: '', title: '', category: 'Operasional', period: selectedPeriod,
    specific: '', measurable: '', achievable: '', relevant: '', timeBound: '',
    targetValue: 0, actualValue: 0, weight: 20, unit: '%', status: 'Active'
  }
  const [kpiForm, setKpiForm] = useState<Partial<SmartKpi>>(emptyKpiForm)
  const [evalNote, setEvalNote] = useState('')
  const [evalGrade, setEvalGrade] = useState<SmartKpiGrade>('-')

  // --- Filtered & Computed ---
  const assignableUsers = users.filter(u => !['super_admin', 'ceo', 'cmo'].includes(u.role))
  const filteredKpis = useMemo(() => {
    let result = kpis
    if (selectedUser) result = result.filter(k => k.assigneeUserId === selectedUser)
    if (selectedPeriod) result = result.filter(k => k.period === selectedPeriod)
    return result
  }, [kpis, selectedUser, selectedPeriod])

  // Group KPIs by user
  const kpisByUser = useMemo(() => {
    const map: Record<string, SmartKpi[]> = {}
    filteredKpis.forEach(k => {
      if (!map[k.assigneeUserId]) map[k.assigneeUserId] = []
      map[k.assigneeUserId].push(k)
    })
    return map
  }, [filteredKpis])

  // Calculate overall grade for a user
  const getUserOverallGrade = (userKpis: SmartKpi[]): { grade: SmartKpiGrade; score: number } => {
    if (userKpis.length === 0) return { grade: '-', score: 0 }
    const totalWeight = userKpis.reduce((s, k) => s + k.weight, 0)
    if (totalWeight === 0) return { grade: '-', score: 0 }
    const weightedScore = userKpis.reduce((s, k) => {
      const pct = k.targetValue > 0 ? Math.min((k.actualValue / k.targetValue) * 100, 150) : 0
      return s + (pct * k.weight / totalWeight)
    }, 0)
    const grade = getKpiGrade(weightedScore, 100)
    return { grade, score: Math.round(weightedScore) }
  }

  // --- Handlers ---
  const handleAddEmployee = () => {
    if (!newEmp.fullName) { toast.error("Nama Harus diisi"); return }
    addEmployee({
      id: uuidv4(), fullName: newEmp.fullName || "", position: newEmp.position || "",
      department: newEmp.department || "", baseSalary: Number(newEmp.baseSalary),
      kasbon: Number(newEmp.kasbon) || 0, joinDate: newEmp.joinDate || new Date().toISOString().split('T')[0], status: "Active"
    })
    toast.success("Karyawan Baru berhasil didaftarkan")
    setIsAddEmpOpen(false)
    setNewEmp({ fullName: "", position: "", department: "", baseSalary: 0, kasbon: 0, joinDate: new Date().toISOString().split('T')[0], status: "Active" })
  }

  const handleSaveKpi = () => {
    if (!kpiForm.assigneeUserId) return toast.error("Pilih penerima KPI!")
    if (!kpiForm.title) return toast.error("Isi judul KPI!")
    if (!kpiForm.specific) return toast.error("Isi deskripsi Specific!")
    if ((kpiForm.targetValue || 0) <= 0) return toast.error("Target harus lebih dari 0!")

    if (editingKpi) {
      updateKpi(editingKpi.id, { 
        ...kpiForm, updatedAt: new Date().toISOString() 
      } as Partial<SmartKpi>)
      toast.success("KPI berhasil diupdate!")
    } else {
      addKpi({
        id: uuidv4(),
        ...kpiForm,
        assignedByUserId: currentUser?.id || 'system',
        actualValue: 0,
        status: 'Active',
        createdAt: new Date().toISOString(),
      } as SmartKpi)
      toast.success("KPI SMART berhasil dibuat!")
    }
    setIsAddKpiOpen(false)
    setKpiForm(emptyKpiForm)
    setEditingKpi(null)
  }

  const handleEvaluate = (kpi: SmartKpi) => {
    setEditingKpi(kpi)
    setEvalNote(kpi.evaluatorNote || '')
    setEvalGrade(kpi.manualGrade || '-')
    setIsEvalOpen(true)
  }

  const handleSubmitEval = () => {
    if (!editingKpi) return
    updateKpi(editingKpi.id, {
      evaluatorNote: evalNote,
      manualGrade: evalGrade === '-' ? undefined : evalGrade,
      evaluatedAt: new Date().toISOString(),
      evaluatedBy: currentUser?.id,
      status: 'Evaluated',
      updatedAt: new Date().toISOString()
    })
    toast.success("Evaluasi KPI berhasil disimpan!")
    setIsEvalOpen(false)
    setEditingKpi(null)
  }

  const openEditKpi = (kpi: SmartKpi) => {
    setEditingKpi(kpi)
    setKpiForm(kpi)
    setIsAddKpiOpen(true)
  }

  const handleDeleteKpi = (id: string) => {
    deleteKpi(id)
    toast.success("KPI dihapus.")
  }

  const handleUpdateActual = (kpi: SmartKpi, val: number) => {
    updateKpi(kpi.id, { actualValue: val, updatedAt: new Date().toISOString() })
  }

  return (
    <AuthGuard allowedRoles={['ceo', 'super_admin', 'cmo']}>
      <div className="space-y-6 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2 text-slate-900">
              <Users className="text-emerald-500 w-8 h-8" /> HR & SMART KPI
            </h2>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Kelola tim, assign KPI terukur, dan evaluasi performa dengan metode SMART.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isAddEmpOpen} onOpenChange={setIsAddEmpOpen}>
              <DialogTrigger>
                <div role="button" className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 shadow-md font-bold rounded-xl h-10 px-4 text-sm transition-colors">
                  <UserPlus className="w-4 h-4 mr-2" /> Karyawan Baru
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-[2rem]">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black">Registrasi Karyawan</DialogTitle>
                  <DialogDescription>Input data HR baru perusahaan</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Nama Lengkap</Label>
                    <Input value={newEmp.fullName} onChange={(e) => setNewEmp({...newEmp, fullName: e.target.value})} className="h-11 rounded-xl" placeholder="Ahmad Syafiq" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Posisi</Label>
                      <Input value={newEmp.position} onChange={(e) => setNewEmp({...newEmp, position: e.target.value})} className="h-11 rounded-xl" placeholder="Staff Gudang" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500">Departemen</Label>
                      <Input value={newEmp.department} onChange={(e) => setNewEmp({...newEmp, department: e.target.value})} className="h-11 rounded-xl" placeholder="Logistik" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-500">Gaji Pokok (Rp)</Label>
                    <Input type="number" value={newEmp.baseSalary} onChange={(e) => setNewEmp({...newEmp, baseSalary: Number(e.target.value)})} className="h-11 rounded-xl" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddEmployee} className="w-full h-12 rounded-xl bg-emerald-600 font-bold">Simpan Karyawan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="kpi" className="w-full">
          <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6 shadow-sm">
            <TabsTrigger value="kpi" className="rounded-xl font-bold px-6 data-[state=active]:bg-white data-[state=active]:text-rose-600">
              <Target className="w-4 h-4 mr-2" /> SMART KPI Board
            </TabsTrigger>
            <TabsTrigger value="db" className="rounded-xl font-bold px-6 data-[state=active]:bg-white data-[state=active]:text-emerald-600">
              <Briefcase className="w-4 h-4 mr-2" /> Database HR
            </TabsTrigger>
          </TabsList>

          {/* ===== SMART KPI TAB ===== */}
          <TabsContent value="kpi" className="animate-in fade-in zoom-in-95 duration-500 space-y-6">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <select 
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:ring-rose-500"
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value)}
              >
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select 
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:ring-rose-500"
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
              >
                <option value="">Semua Anggota Tim</option>
                {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <div className="ml-auto">
                <Button 
                  onClick={() => { setEditingKpi(null); setKpiForm({...emptyKpiForm, period: selectedPeriod}); setIsAddKpiOpen(true) }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl h-10 px-5 gap-2 shadow-lg shadow-rose-200"
                >
                  <Plus className="w-4 h-4" /> Assign KPI Baru
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-none shadow-sm rounded-3xl bg-rose-50 border-l-4 border-l-rose-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase text-rose-600/60 mb-1">Total KPI Aktif</p>
                  <h4 className="text-3xl font-black text-rose-900">{filteredKpis.length}</h4>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm rounded-3xl bg-emerald-50 border-l-4 border-l-emerald-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase text-emerald-600/60 mb-1">Sudah Dievaluasi</p>
                  <h4 className="text-3xl font-black text-emerald-900">{filteredKpis.filter(k => k.status === 'Evaluated').length}</h4>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm rounded-3xl bg-amber-50 border-l-4 border-l-amber-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase text-amber-600/60 mb-1">Anggota Dinilai</p>
                  <h4 className="text-3xl font-black text-amber-900">{Object.keys(kpisByUser).length}</h4>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm rounded-3xl bg-blue-50 border-l-4 border-l-blue-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase text-blue-600/60 mb-1">Avg Score</p>
                  <h4 className="text-3xl font-black text-blue-900">
                    {filteredKpis.length > 0 
                      ? Math.round(filteredKpis.reduce((s, k) => s + (k.targetValue > 0 ? (k.actualValue/k.targetValue)*100 : 0), 0) / filteredKpis.length) 
                      : 0}%
                  </h4>
                </CardContent>
              </Card>
            </div>

            {/* KPI per User */}
            {Object.keys(kpisByUser).length === 0 ? (
              <div className="text-center py-20">
                <Target className="w-16 h-16 mx-auto text-slate-200 mb-4" />
                <p className="font-bold text-slate-400 text-lg">Belum ada KPI untuk periode ini.</p>
                <p className="text-sm text-slate-400 mt-1">Klik "Assign KPI Baru" untuk mulai.</p>
              </div>
            ) : (
              Object.entries(kpisByUser).map(([userId, userKpis]) => {
                const user = users.find(u => u.id === userId)
                const { grade, score } = getUserOverallGrade(userKpis)
                const gradeMeta = GRADE_META[grade]
                const totalWeight = userKpis.reduce((s, k) => s + k.weight, 0)
                
                return (
                  <div key={userId} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    {/* User Header */}
                    <div className="p-6 bg-gradient-to-r from-slate-50 to-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-black shrink-0">
                          {user?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900">{user?.name || 'Unknown'}</h3>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{user?.role} • {selectedPeriod}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Bobot Total</p>
                          <p className={cn("text-sm font-black", totalWeight === 100 ? "text-emerald-600" : "text-rose-600")}>{totalWeight}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Skor Akhir</p>
                          <p className="text-2xl font-black text-slate-900">{score}%</p>
                        </div>
                        <div className={cn("px-5 py-3 rounded-2xl border-2 text-center min-w-[80px]", gradeMeta.bg)}>
                          <p className={cn("text-3xl font-black", gradeMeta.color)}>{grade}</p>
                          <p className={cn("text-[9px] font-bold uppercase tracking-widest", gradeMeta.color)}>{gradeMeta.label}</p>
                        </div>
                      </div>
                    </div>

                    {/* KPI Items */}
                    <div className="divide-y divide-slate-50">
                      {userKpis.map(kpi => {
                        const pct = kpi.targetValue > 0 ? Math.min((kpi.actualValue / kpi.targetValue) * 100, 150) : 0
                        const kpiGrade = getKpiGrade(kpi.actualValue, kpi.targetValue, kpi.manualGrade)
                        const kGradeMeta = GRADE_META[kpiGrade]
                        const isExpanded = expandedKpi === kpi.id

                        return (
                          <div key={kpi.id} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedKpi(isExpanded ? null : kpi.id)}>
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 border", kGradeMeta.bg, kGradeMeta.color)}>
                                {kpiGrade}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-black text-slate-800 text-sm truncate">{kpi.title}</h4>
                                  <Badge variant="outline" className="text-[9px] shrink-0">{kpi.category}</Badge>
                                  {kpi.status === 'Evaluated' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all duration-700", 
                                      pct >= 90 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                                    )} style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs font-black text-slate-500 shrink-0 w-16 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-black text-slate-800">{kpi.actualValue} / {kpi.targetValue} {kpi.unit}</p>
                                <p className="text-[10px] text-slate-400 font-bold">Bobot: {kpi.weight}%</p>
                              </div>
                              <div className="shrink-0 text-slate-300">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </div>
                            </div>

                            {/* Expanded SMART Details */}
                            {isExpanded && (
                              <div className="mt-4 ml-14 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                                  {[
                                    { key: 'S', label: 'Specific', val: kpi.specific, icon: '🎯' },
                                    { key: 'M', label: 'Measurable', val: kpi.measurable, icon: '📏' },
                                    { key: 'A', label: 'Achievable', val: kpi.achievable, icon: '✅' },
                                    { key: 'R', label: 'Relevant', val: kpi.relevant, icon: '🔗' },
                                    { key: 'T', label: 'Time-Bound', val: kpi.timeBound, icon: '⏰' },
                                  ].map(s => (
                                    <div key={s.key} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{s.icon} {s.label}</p>
                                      <p className="text-xs font-medium text-slate-700 line-clamp-3">{s.val || '-'}</p>
                                    </div>
                                  ))}
                                </div>

                                {kpi.evaluatorNote && (
                                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 mb-3">
                                    <p className="text-[9px] font-black uppercase text-blue-500 mb-1">💬 Catatan Evaluator</p>
                                    <p className="text-xs text-blue-800 font-medium">{kpi.evaluatorNote}</p>
                                  </div>
                                )}

                                {/* Inline Actual Update */}
                                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                  <Label className="text-[10px] font-black uppercase text-emerald-600 shrink-0">Update Actual:</Label>
                                  <Input 
                                    type="number" className="h-9 w-32 rounded-lg text-sm font-bold"
                                    value={kpi.actualValue}
                                    onChange={e => handleUpdateActual(kpi, Number(e.target.value))}
                                  />
                                  <span className="text-xs font-bold text-slate-500">{kpi.unit}</span>
                                  <div className="ml-auto flex gap-2">
                                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold gap-1" onClick={() => handleEvaluate(kpi)}>
                                      <Star className="w-3 h-3" /> Evaluasi
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold gap-1" onClick={() => openEditKpi(kpi)}>
                                      <Edit3 className="w-3 h-3" /> Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50" onClick={() => handleDeleteKpi(kpi.id)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Grade Conclusion */}
                    <div className={cn("px-6 py-4 border-t-2", gradeMeta.bg.replace('border', 'border-t'))}>
                      <div className="flex items-start gap-3">
                        <Lightbulb className={cn("w-5 h-5 shrink-0 mt-0.5", gradeMeta.color)} />
                        <div>
                          <p className={cn("text-sm font-black", gradeMeta.color)}>Kesimpulan: Grade {grade} – {gradeMeta.label}</p>
                          <p className="text-xs font-medium text-slate-600 mt-0.5">{gradeMeta.desc}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </TabsContent>

          {/* ===== DATABASE HR TAB ===== */}
          <TabsContent value="db" className="animate-in fade-in zoom-in-95 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="border-none shadow-sm rounded-3xl bg-emerald-50 border-l-4 border-l-emerald-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase opacity-60 mb-1">Total Karyawan Aktif</p>
                  <h4 className="text-3xl font-black text-emerald-900">{employees.filter(e => e.status === 'Active').length}</h4>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm rounded-3xl bg-rose-50 border-l-4 border-l-rose-500">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase opacity-60 mb-1">Total Outstanding Kasbon</p>
                  <h4 className="text-xl mt-1 font-black text-rose-900">{formatRupiah(employees.reduce((sum, e) => sum + (e.kasbon || 0), 0))}</h4>
                </CardContent>
              </Card>
            </div>
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
              {employees.length === 0 ? (
                <div className="py-20 text-center flex justify-center items-center flex-col text-slate-400">
                  <Briefcase className="w-12 h-12 opacity-20 mb-4" />
                  <p className="font-bold">Belum ada data HR. Yuk tambahin karyawan pertama lo.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b-2 border-slate-100 text-left">
                        <th className="pb-3 text-[10px] font-black tracking-widest uppercase text-slate-400">Nama Lengkap</th>
                        <th className="pb-3 text-[10px] font-black tracking-widest uppercase text-slate-400">Role / Divisi</th>
                        <th className="pb-3 text-[10px] font-black tracking-widest uppercase text-slate-400">Gaji Bulanan</th>
                        <th className="pb-3 text-[10px] font-black tracking-widest uppercase text-slate-400">Hutang/Kasbon</th>
                        <th className="pb-3 text-[10px] font-black tracking-widest uppercase text-slate-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map(emp => (
                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-emerald-600 font-bold capitalize">
                                {emp.fullName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 text-sm">{emp.fullName}</div>
                                <div className="text-[10px] text-slate-400 mt-1 font-medium">{new Date(emp.joinDate).toLocaleDateString()}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="font-bold text-slate-700 text-sm">{emp.position}</div>
                            <div className="text-[10px] text-slate-400 font-medium">{emp.department}</div>
                          </td>
                          <td className="py-4 font-black text-slate-800">{formatRupiah(emp.baseSalary)}</td>
                          <td className="py-4">
                            {emp.kasbon > 0 ? (
                              <span className="inline-flex py-1 px-3 bg-rose-50 text-rose-600 rounded-full text-xs font-bold border border-rose-100">
                                - {formatRupiah(emp.kasbon)}
                              </span>
                            ) : <span className="text-slate-300 font-bold text-xs">Rp 0</span>}
                          </td>
                          <td className="py-4">
                            <div className={`text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-black border inline-block ${emp.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {emp.status}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ===== ASSIGN / EDIT KPI DIALOG ===== */}
        <Dialog open={isAddKpiOpen} onOpenChange={(v) => { setIsAddKpiOpen(v); if (!v) setEditingKpi(null) }}>
          <DialogContent className="max-w-2xl rounded-[2rem] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <Target className="w-5 h-5 text-rose-500" />
                {editingKpi ? 'Edit KPI SMART' : 'Assign KPI SMART Baru'}
              </DialogTitle>
              <DialogDescription>Setiap KPI harus memenuhi 5 kriteria S.M.A.R.T.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Row 1: User + Category */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Penerima KPI</Label>
                  <select className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold bg-white"
                    value={kpiForm.assigneeUserId} onChange={e => setKpiForm({...kpiForm, assigneeUserId: e.target.value})}>
                    <option value="">Pilih anggota tim...</option>
                    {assignableUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Kategori</Label>
                  <select className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold bg-white"
                    value={kpiForm.category} onChange={e => setKpiForm({...kpiForm, category: e.target.value})}>
                    {KPI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Title */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Judul KPI</Label>
                <Input className="h-11 rounded-xl font-bold" placeholder="Contoh: Closing Rate Penjualan"
                  value={kpiForm.title} onChange={e => setKpiForm({...kpiForm, title: e.target.value})} />
              </div>

              {/* Row 3: Period, Target, Unit, Weight */}
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Periode</Label>
                  <select className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold bg-white"
                    value={kpiForm.period} onChange={e => setKpiForm({...kpiForm, period: e.target.value})}>
                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Target</Label>
                  <Input type="number" className="h-11 rounded-xl" placeholder="50"
                    value={kpiForm.targetValue} onChange={e => setKpiForm({...kpiForm, targetValue: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Satuan</Label>
                  <select className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold bg-white"
                    value={kpiForm.unit} onChange={e => setKpiForm({...kpiForm, unit: e.target.value})}>
                    {KPI_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-500">Bobot (%)</Label>
                  <Input type="number" className="h-11 rounded-xl" min={5} max={100}
                    value={kpiForm.weight} onChange={e => setKpiForm({...kpiForm, weight: Number(e.target.value)})} />
                </div>
              </div>

              {/* SMART Fields */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                <h4 className="text-xs font-black uppercase text-slate-600 tracking-widest flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" /> Framework S.M.A.R.T
                </h4>
                {[
                  { key: 'specific', label: '🎯 Specific – Apa yang ingin dicapai secara spesifik?', placeholder: 'Meningkatkan penjualan produk premium dari 20 ke 50 deals per bulan' },
                  { key: 'measurable', label: '📏 Measurable – Bagaimana cara mengukurnya?', placeholder: 'Dihitung dari jumlah closing deal di CRM system per bulan' },
                  { key: 'achievable', label: '✅ Achievable – Kenapa target ini realistis?', placeholder: 'Tim sales sudah ditraining dan market demand naik 30%' },
                  { key: 'relevant', label: '🔗 Relevant – Apa hubungannya dengan tujuan perusahaan?', placeholder: 'Meningkatkan revenue Q2 sesuai target pertumbuhan 40% YoY' },
                  { key: 'timeBound', label: '⏰ Time-Bound – Kapan deadline atau periode evaluasi?', placeholder: 'Evaluasi setiap akhir bulan, review akhir Q2 2026 (Juni 2026)' },
                ].map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-[10px] font-black text-slate-500">{field.label}</Label>
                    <Textarea 
                      className="rounded-xl text-sm resize-none min-h-[52px]" rows={2} placeholder={field.placeholder}
                      value={(kpiForm as any)[field.key] || ''} 
                      onChange={e => setKpiForm({...kpiForm, [field.key]: e.target.value})} 
                    />
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-12 bg-rose-600 hover:bg-rose-700 rounded-xl font-black text-white gap-2 shadow-lg" onClick={handleSaveKpi}>
                <CheckCircle2 className="w-4 h-4" /> {editingKpi ? 'Update KPI' : 'Simpan KPI SMART'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== EVALUATION DIALOG ===== */}
        <Dialog open={isEvalOpen} onOpenChange={(v) => { setIsEvalOpen(v); if (!v) setEditingKpi(null) }}>
          <DialogContent className="max-w-md rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" /> Evaluasi KPI
              </DialogTitle>
              <DialogDescription>
                {editingKpi?.title} – {users.find(u => u.id === editingKpi?.assigneeUserId)?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {editingKpi && (
                <div className="text-center p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Pencapaian Saat Ini</p>
                  <p className="text-3xl font-black text-slate-900">
                    {editingKpi.actualValue} / {editingKpi.targetValue} {editingKpi.unit}
                  </p>
                  <p className="text-sm font-bold text-slate-500 mt-1">
                    = {editingKpi.targetValue > 0 ? ((editingKpi.actualValue / editingKpi.targetValue) * 100).toFixed(0) : 0}% (Auto Grade: {getKpiGrade(editingKpi.actualValue, editingKpi.targetValue)})
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Override Grade (Opsional)</Label>
                <div className="grid grid-cols-6 gap-2">
                  {(['A', 'B', 'C', 'D', 'E', '-'] as SmartKpiGrade[]).map(g => (
                    <button key={g} onClick={() => setEvalGrade(g)}
                      className={cn("h-12 rounded-xl font-black text-lg border-2 transition-all",
                        evalGrade === g ? GRADE_META[g].bg + ' ' + GRADE_META[g].color + ' scale-110 shadow-md' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                      )}>{g}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Catatan Evaluasi</Label>
                <Textarea className="rounded-xl min-h-[100px] text-sm" placeholder="Tuliskan feedback performa..."
                  value={evalNote} onChange={e => setEvalNote(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-12 bg-amber-500 hover:bg-amber-600 rounded-xl font-black text-white gap-2" onClick={handleSubmitEval}>
                <Award className="w-4 h-4" /> Simpan Evaluasi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}
