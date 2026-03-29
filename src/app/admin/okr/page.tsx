"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import AuthGuard from "@/components/auth/auth-guard"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Plus, Target, ListChecks, CheckCircle2, ChevronRight, BarChart 
} from "lucide-react"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogTrigger, DialogFooter, DialogDescription 
} from "@/components/ui/dialog"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { OkrObjective, OkrKeyResult } from "@/types"

export default function OkrFrameworkPage() {
  const okrs = useAppStore(state => state.okrObjectives) || []
  const kpis = useAppStore(state => state.kpiObjectives) || []
  const employees = useAppStore(state => state.employees) || []
  const addOkr = useAppStore(state => state.addOkr)
  const updateOkr = useAppStore(state => state.updateOkr)

  const [isAddOkrOpen, setIsAddOkrOpen] = useState(false)
  const [newOkr, setNewOkr] = useState<Partial<OkrObjective>>({
    title: "", description: "", period: "Quarter 1 - 2026", ownerId: ""
  })

  const [isAddKrOpen, setIsAddKrOpen] = useState(false)
  const [activeObjectiveId, setActiveObjectiveId] = useState<string | null>(null)
  const [newKr, setNewKr] = useState<Partial<OkrKeyResult>>({
    title: "", targetValue: 100, currentValue: 0, unit: "%", linkedKpiId: ""
  })

  // Create Parent Objective
  const handleAddObjective = () => {
    if (!newOkr.title) {
        toast.error("Judul Objective required")
        return;
    }
    const o: OkrObjective = {
        id: uuidv4(),
        title: newOkr.title || "",
        description: newOkr.description || "",
        period: newOkr.period || "Q1 2026",
        ownerId: newOkr.ownerId || "CEO",
        progress: 0,
        keyResults: []
    }
    addOkr(o)
    setIsAddOkrOpen(false)
    setNewOkr({ title: "", description: "", period: "Quarter 1 - 2026", ownerId: "" })
    toast.success("Strategic Objective Created")
  }

  // Add Key Result to specific Objective
  const handleAddKeyResult = () => {
     if(!activeObjectiveId || !newKr.title) {
         toast.error("Incomplete Key Result Data");
         return;
     }

     const targetOkr = okrs.find(o => o.id === activeObjectiveId);
     if(targetOkr) {
         const theKr: OkrKeyResult = {
             id: uuidv4(),
             objectiveId: activeObjectiveId,
             title: newKr.title || "",
             targetValue: Number(newKr.targetValue) || 100,
             currentValue: Number(newKr.currentValue) || 0,
             unit: newKr.unit || "%",
             linkedKpiId: newKr.linkedKpiId || undefined
         }

         // Add KR to array
         const updatedKRs = [...targetOkr.keyResults, theKr]
         
         // Auto-recalculate parent progress
         let totalProgress = 0;
         updatedKRs.forEach(kr => {
             const prog = (kr.currentValue / kr.targetValue) * 100;
             totalProgress += Math.min(prog, 100);
         });
         const newParentProgress = updatedKRs.length > 0 ? (totalProgress / updatedKRs.length) : 0;

         updateOkr(activeObjectiveId, { keyResults: updatedKRs, progress: newParentProgress });
         
         setIsAddKrOpen(false)
         setNewKr({ title: "", targetValue: 100, currentValue: 0, unit: "%", linkedKpiId: "" })
         setActiveObjectiveId(null)
         toast.success("Key Result berhasil ditempelkan")
     }
  }

  return (
    <AuthGuard allowedRoles={['ceo', 'super_admin', 'cmo']}>
      <div className="space-y-6 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight flex items-center gap-2 text-slate-900">
              <BarChart className="text-indigo-500 w-8 h-8" /> OKR Framework
            </h2>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Objectives and Key Results mapping tingkat eksekutif.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isAddOkrOpen} onOpenChange={setIsAddOkrOpen}>
              <DialogTrigger>
                <div className="inline-flex cursor-pointer items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 shadow-md font-bold rounded-xl h-10 px-4 text-sm transition-colors">
                  <Plus className="w-4 h-4 mr-2" /> Strategic Objective Baru
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-[2rem]">
                 <DialogHeader>
                    <DialogTitle className="text-xl font-black">Declare Objective</DialogTitle>
                    <DialogDescription>Goal ambisius makro yang akan dicapai tim.</DialogDescription>
                 </DialogHeader>
                 <div className="space-y-4 py-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase text-slate-500">Tujuan Strategis / Goal</Label>
                       <Input value={newOkr.title} onChange={e => setNewOkr({...newOkr, title: e.target.value})} className="h-11 rounded-xl" placeholder="Dominasi pasar properti JABODETABEK" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase text-slate-500">Keterangan / Deskripsi</Label>
                       <Input value={newOkr.description} onChange={e => setNewOkr({...newOkr, description: e.target.value})} className="h-11 rounded-xl" placeholder="Fokus pada peningkatan penjualan dan trust klien." />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase text-slate-500">Periode Tayang</Label>
                           <Input value={newOkr.period} onChange={e => setNewOkr({...newOkr, period: e.target.value})} className="h-11 rounded-xl" placeholder="Q1 2026" />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase text-slate-500">PIC / Owner</Label>
                           <select 
                               className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-indigo-500 bg-white"
                               value={newOkr.ownerId} 
                               onChange={e => setNewOkr({...newOkr, ownerId: e.target.value})}
                           >
                              <option value="CEO">CEO</option>
                              <option value="CMO">CMO</option>
                              <option value="Super Admin">Super Admin</option>
                           </select>
                        </div>
                    </div>
                 </div>
                 <DialogFooter>
                    <Button onClick={handleAddObjective} className="w-full h-12 rounded-xl bg-indigo-600 font-bold">Declare Objective</Button>
                 </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Global OKR Progress or Stats (Coming soon if okrs grow large) */}

        <div className="space-y-6 mt-6">
           {okrs.length === 0 ? (
              <div className="py-20 text-center flex justify-center items-center flex-col text-slate-400 border border-dashed border-slate-300 rounded-[2rem]">
                 <Target className="w-12 h-12 opacity-20 mb-4" />
                 <p className="font-bold">Framework OKR masih kosong. CEO / CMO bisa buat Objective besar sekarang!</p>
              </div>
           ) : (
              okrs.map(okr => (
                 <Card key={okr.id} className="border-slate-100 shadow-sm rounded-[2rem] overflow-hidden bg-white group hover:shadow-lg transition-all">
                    <div className="bg-slate-50 border-b border-slate-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                       <div className="flex-1">
                          <div className="flex items-center gap-3">
                              <h3 className="text-xl font-black text-slate-800">{okr.title}</h3>
                              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{okr.period}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-1 pr-6">{okr.description}</p>
                       </div>
                       
                       <div className="shrink-0 w-full md:w-64">
                          <div className="flex justify-between items-center text-xs font-bold mb-1">
                             <span className="text-slate-400">Total Progress</span>
                             <span className="text-indigo-600">{okr.progress.toFixed(0)}%</span>
                          </div>
                          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                             <div 
                               className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" 
                               style={{ width: `${okr.progress}%` }} 
                             />
                          </div>
                       </div>
                    </div>

                    <CardContent className="p-0">
                       <div className="divide-y divide-slate-50">
                          {okr.keyResults.map((kr, idx) => {
                             const isKpiLinked = !!kr.linkedKpiId;
                             let linkedTitle = "Manual Progress Tracking"
                             
                             // If linked to KPI, find the specific metric
                             if (isKpiLinked) {
                                  const linkedObj = kpis.find(k => k.id === kr.linkedKpiId)
                                  if (linkedObj) {
                                       const krEmp = employees.find(e => e.userId === linkedObj.assigneeUserId)
                                       linkedTitle = `Data ditarik automatis dari KPI: ${linkedObj.title} [${krEmp?.fullName || 'HR'}]`;
                                  }
                             }

                             const krProgress = Math.min((kr.currentValue / kr.targetValue) * 100, 100) || 0;

                             return (
                                <div key={kr.id} className="p-4 md:px-6 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                   <div className="flex items-start gap-4 flex-1">
                                      <div className="text-slate-400 font-black mt-1">KR{idx+1}</div>
                                      <div>
                                         <h4 className="font-bold text-slate-700 text-sm leading-tight">{kr.title}</h4>
                                         <div className="flex items-center gap-2 mt-1">
                                            {isKpiLinked && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                                            <p className="text-[10px] uppercase font-black tracking-wide text-slate-400">{linkedTitle}</p>
                                         </div>
                                      </div>
                                   </div>
                                   
                                   <div className="shrink-0 flex items-center gap-6 min-w-[250px]">
                                      <div className="w-full">
                                         <div className="flex justify-end gap-2 text-xs font-bold mb-1">
                                            <span className="text-slate-500 font-medium">{kr.currentValue} / {kr.targetValue}</span>
                                            <span className="text-slate-800">{krProgress.toFixed(0)}%</span>
                                         </div>
                                         <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex justify-end">
                                            <div 
                                              className={`h-full rounded-full transition-all ${krProgress >= 100 ? 'bg-emerald-400' : 'bg-rose-400'}`} 
                                              style={{ width: `${krProgress}%` }} 
                                            />
                                         </div>
                                      </div>
                                   </div>
                                </div>
                             )
                          })}
                       </div>

                       {/* Action Bar per OKR */}
                       <div className="bg-white p-4 border-t border-slate-100">
                          <Button 
                             onClick={() => {
                                 setActiveObjectiveId(okr.id)
                                 setIsAddKrOpen(true)
                             }}
                             variant="outline" 
                             className="w-full text-indigo-600 border-indigo-100 hover:bg-indigo-50 font-bold h-10 border-dashed rounded-xl"
                          >
                             <Plus className="w-4 h-4 mr-1" /> Turunkan Ke Strategi Baru (Key Result)
                          </Button>
                       </div>
                    </CardContent>
                 </Card>
              ))
           )}
        </div>

        {/* Modal: Add Key Result / Strategy */}
        <Dialog open={isAddKrOpen} onOpenChange={setIsAddKrOpen}>
           <DialogContent className="max-w-md rounded-[2rem]">
              <DialogHeader>
                 <DialogTitle>Bedah Strategi Key Result</DialogTitle>
                 <DialogDescription>
                    Pecah objective besar ke parameter target yang lebih detail.
                 </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-500">KR Metric / Strategi Judul</Label>
                    <Input placeholder="Contoh: Menambah 10 client baru wilayah selatan" value={newKr.title} onChange={e => setNewKr({...newKr, title: e.target.value})} className="h-11 rounded-xl" />
                 </div>
                 
                 <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-1">
                       <Label className="text-[10px] font-black uppercase text-slate-500">Angka Target</Label>
                       <Input type="number" value={newKr.targetValue} onChange={e => setNewKr({...newKr, targetValue: Number(e.target.value)})} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-2 col-span-2">
                       <Label className="text-[10px] font-black uppercase text-slate-500">Satuan Unit (% / #)</Label>
                       <Input value={newKr.unit} onChange={e => setNewKr({...newKr, unit: e.target.value})} className="h-11 rounded-xl" placeholder="Klien / Transaksi / %" />
                    </div>
                 </div>

                 <div className="space-y-2 border-t pt-4">
                    <Label className="text-[10px] flex items-center gap-1 font-black uppercase text-emerald-600"><Target className="w-3 h-3" /> Link ke KPI Otomatis (Optional)</Label>
                    <p className="text-xs text-slate-500 pb-1">Bila dihubungkan, progress Key Result ini akan mengikuti pencapaian personal HR karyawan tertentu.</p>
                    <select 
                        className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-emerald-500 bg-white"
                        value={newKr.linkedKpiId} 
                        onChange={e => setNewKr({...newKr, linkedKpiId: e.target.value})}
                    >
                       <option value="">(Tidak di link - Progress Update Manual)</option>
                       {kpis.map(kpi => {
                           const emp = employees.find(e => e.userId === kpi.assigneeUserId);
                           return (
                               <option key={kpi.id} value={kpi.id}>
                                   KPI: {kpi.title} [{emp?.fullName || 'N/A'}]
                               </option>
                           )
                       })}
                    </select>
                 </div>
              </div>
              <DialogFooter>
                 <Button onClick={handleAddKeyResult} className="w-full h-12 rounded-xl bg-slate-900 border-none font-bold text-white shadow-xl hover:bg-slate-800">Assign Strategi KR</Button>
              </DialogFooter>
           </DialogContent>
        </Dialog>

      </div>
    </AuthGuard>
  )
}
