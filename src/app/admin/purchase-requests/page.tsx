"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { PurchaseRequest, PurchaseRequestStatus } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { 
  ClipboardList, Plus, FileText, CheckCircle2, AlertTriangle, 
  XCircle, Clock, ShieldCheck, Landmark, DollarSign, Search, Sparkles
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

const CATEGORY_OPTIONS = [
  "Sourcing",
  "Operasional Gudang",
  "Logistik & Bensin",
  "Marketing & Promo",
  "Aset & Peralatan",
  "Lain-lain"
]

export default function PurchaseRequestsPage() {
  const purchaseRequests = useAppStore(state => state.purchaseRequests) || []
  const currentUser = useAppStore(state => state.currentUser)
  const addPurchaseRequest = useAppStore(state => state.addPurchaseRequest)
  const updatePurchaseRequest = useAppStore(state => state.updatePurchaseRequest)
  
  // List States
  const [filterStatus, setFilterStatus] = useState<string>("ALL")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedPRId, setSelectedPRId] = useState<string | null>(null)

  // Add PR Form States
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newAmountRaw, setNewAmountRaw] = useState("")
  const [newCategory, setNewCategory] = useState("Sourcing")

  // Audit / Action Notes States
  const [financeNote, setFinanceNote] = useState("")
  const [cfoNote, setCfoNote] = useState("")

  const activePR = purchaseRequests.find(pr => pr.id === selectedPRId)

  // Calculate Summary metrics
  const totalPRCount = purchaseRequests.length
  const pendingFinanceCount = purchaseRequests.filter(pr => pr.status === 'Pending_Finance').length
  const pendingCfoCount = purchaseRequests.filter(pr => pr.status === 'Pending_CFO').length
  const totalApprovedAmount = purchaseRequests
    .filter(pr => pr.status === 'Approved')
    .reduce((sum, pr) => sum + pr.amount, 0)

  // Filtering logic
  const filteredPRs = purchaseRequests.filter(pr => {
    const matchesStatus = filterStatus === "ALL" || pr.status === filterStatus
    const matchesSearch = pr.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          pr.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pr.requestedBy.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountVal = parseNumber(newAmountRaw)
    if (!newTitle.trim() || !newDescription.trim() || amountVal <= 0) {
      toast.error("Mohon isi form dengan lengkap dan nominal lebih dari 0!")
      return
    }

    const prId = `PR-${Math.floor(1000 + Math.random() * 9000)}`
    const prPayload: PurchaseRequest = {
      id: prId,
      title: newTitle,
      description: newDescription,
      amount: amountVal,
      category: newCategory,
      status: "Pending_Finance",
      requestedBy: currentUser?.name || currentUser?.id || "Karyawan",
      createdAt: new Date().toISOString()
    }

    toast.loading("Mengajukan Purchase Request...", { id: "create-pr" })
    try {
      await addPurchaseRequest(prPayload)
      toast.success(`Purchase Request ${prId} berhasil dibuat!`, { id: "create-pr" })
      // Reset Form
      setNewTitle("")
      setNewDescription("")
      setNewAmountRaw("")
      setNewCategory("Sourcing")
      setIsFormOpen(false)
    } catch (err) {
      console.error(err)
      toast.error("Gagal mengajukan Purchase Request", { id: "create-pr" })
    }
  }

  // Finance Verification Handler
  const handleFinanceVerify = async (status: 'Pending_CFO' | 'Rejected') => {
    if (!activePR) return
    if (!financeNote.trim()) {
      toast.error("Catatan Finance wajib diisi untuk verifikasi/penolakan!")
      return
    }

    toast.loading("Memproses verifikasi Finance...", { id: "finance-verify" })
    try {
      await updatePurchaseRequest(activePR.id, {
        status,
        approvedByFinance: currentUser?.name || currentUser?.id || "Finance Admin",
        financeNote: financeNote
      })
      toast.success(status === 'Pending_CFO' ? "PR Terverifikasi & diteruskan ke CFO!" : "PR berhasil ditolak oleh Finance.", { id: "finance-verify" })
      setFinanceNote("")
      setSelectedPRId(null)
    } catch (err) {
      console.error(err)
      toast.error("Gagal memproses verifikasi", { id: "finance-verify" })
    }
  }

  // CFO Approval / Release Funds Handler
  const handleCfoApprove = async (status: 'Approved' | 'Rejected') => {
    if (!activePR) return
    if (!cfoNote.trim()) {
      toast.error("Catatan CFO wajib diisi untuk approval/penolakan!")
      return
    }

    toast.loading("Memproses persetujuan CFO...", { id: "cfo-approve" })
    try {
      // 1. Update status PR
      await updatePurchaseRequest(activePR.id, {
        status,
        approvedByCfo: currentUser?.name || currentUser?.id || "CFO / Owner",
        cfoNote: cfoNote
      })

      // 2. Jika disetujui, kita bisa merekam transaksi cash di wallet target (sourcing / operasional)
      // Namun untuk PR general, ini akan dicairkan saat admin finance memproses vendor bill atau penarikan tunai.
      toast.success(status === 'Approved' ? "Dana berhasil disetujui & dilepas (Approved & Released)!" : "Pengajuan dana ditolak oleh CFO.", { id: "cfo-approve" })
      setCfoNote("")
      setSelectedPRId(null)
    } catch (err) {
      console.error(err)
      toast.error("Gagal memproses approval CFO", { id: "cfo-approve" })
    }
  }

  const getStatusBadge = (status: PurchaseRequestStatus) => {
    switch (status) {
      case "Pending_Finance":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 uppercase text-[10px] font-black tracking-wider">Verifikasi Finance</Badge>
      case "Pending_CFO":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 uppercase text-[10px] font-black tracking-wider">Approval CFO</Badge>
      case "Approved":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase text-[10px] font-black tracking-wider">Approved & Released</Badge>
      case "Rejected":
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200 uppercase text-[10px] font-black tracking-wider">Ditolak</Badge>
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200 uppercase text-[10px] font-black tracking-wider">{status}</Badge>
    }
  }

  const isFinanceRole = currentUser?.role === 'finance' || currentUser?.role === 'ceo' || currentUser?.role === 'super_admin'
  const isCfoRole = currentUser?.role === 'ceo' || currentUser?.role === 'super_admin'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/40 dark:shadow-none">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-emerald-600" />
            Purchase <span className="text-emerald-600">Requests</span>
          </h2>
          <p className="text-slate-400 font-bold mt-1 uppercase text-[10px] tracking-widest">
            Pengajuan Pembelian & Dana Operasional • Approval Flow 3-Tahap
          </p>
        </div>
        
        <Button 
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-6 h-12 font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          {isFormOpen ? "Tutup Form" : "Buat Pengajuan Baru"}
        </Button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-slate-100 text-slate-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Pengajuan</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{totalPRCount} PR</h3>
          </div>
        </Card>
        
        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-amber-50 text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider">Verifikasi Finance</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{pendingFinanceCount} PR</h3>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-md bg-white dark:bg-slate-900 p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Approval CFO</p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white">{pendingCfoCount} PR</h3>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-md bg-emerald-900 text-white p-6 flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-emerald-800 text-emerald-200">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">Total Released (CFO)</p>
            <h3 className="text-xl font-black">{formatRupiah(totalApprovedAmount)}</h3>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: PR FORM or PR LIST */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CREATE PR FORM */}
          {isFormOpen && (
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-4 duration-300">
              <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 p-8">
                <CardTitle className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-500" /> Form Pengajuan Dana (PR)
                </CardTitle>
                <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                  Isi data di bawah untuk mengajukan anggaran belanja
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleCreatePR} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pr-title" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Judul Pengajuan</Label>
                      <Input 
                        id="pr-title"
                        placeholder="Contoh: Pembelian Timbangan Digital Gudang"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="h-12 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pr-category" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kategori Anggaran</Label>
                      <Select value={newCategory} onValueChange={(v) => setNewCategory(v ?? '')}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Pilih Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pr-amount" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nominal Dana (Rp)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                      <Input 
                        id="pr-amount"
                        placeholder="Contoh: 1.500.000"
                        value={newAmountRaw}
                        onChange={(e) => setNewAmountRaw(formatNumber(e.target.value))}
                        className="h-12 rounded-xl pl-10 text-lg font-black text-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pr-desc" className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tujuan & Detail Penggunaan</Label>
                    <Textarea 
                      id="pr-desc"
                      placeholder="Jelaskan kebutuhan pembelian barang secara detail, spesifikasi, dan justifikasi finansialnya..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="min-h-[100px] rounded-xl"
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-widest text-xs rounded-xl mt-4">
                    Ajukan Sekarang
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* PR LIST */}
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-black text-slate-800 dark:text-white uppercase">Daftar Pengajuan</CardTitle>
                <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Riwayat pengajuan Purchase Request</CardDescription>
              </div>
              
              {/* Search & Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Cari..." 
                    className="pl-8 h-9 text-xs rounded-xl" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? '')}>
                  <SelectTrigger className="h-9 text-xs rounded-xl w-36 bg-slate-50 border-none font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs font-bold">Semua Status</SelectItem>
                    <SelectItem value="Pending_Finance" className="text-xs font-bold text-amber-600">Verifikasi Finance</SelectItem>
                    <SelectItem value="Pending_CFO" className="text-xs font-bold text-blue-600">Approval CFO</SelectItem>
                    <SelectItem value="Approved" className="text-xs font-bold text-emerald-600">Approved</SelectItem>
                    <SelectItem value="Rejected" className="text-xs font-bold text-rose-600">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredPRs.length === 0 ? (
                <div className="p-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-2">
                  <ClipboardList className="w-8 h-8 opacity-20" />
                  Tidak ada pengajuan purchase request yang cocok
                </div>
              ) : (
                <div className="divide-y divide-slate-50 dark:divide-slate-800/40">
                  {filteredPRs.map(pr => (
                    <button
                      key={pr.id}
                      onClick={() => setSelectedPRId(pr.id)}
                      className={cn(
                        "w-full p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 select-none",
                        selectedPRId === pr.id ? "bg-slate-50 dark:bg-slate-800/40 border-l-4 border-emerald-600" : ""
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider">{pr.id}</span>
                          <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-wider">{pr.category}</span>
                          {getStatusBadge(pr.status)}
                        </div>
                        <h4 className="font-extrabold text-slate-800 dark:text-white uppercase tracking-tight text-sm">{pr.title}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Diajukan oleh: <span className="text-slate-600 dark:text-slate-300">{pr.requestedBy}</span> • {new Date(pr.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}</p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <h4 className="text-lg font-black text-slate-900 dark:text-white">{formatRupiah(pr.amount)}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Nominal Pengajuan</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: DETAIL PR & ACTION FORM */}
        <div className="space-y-6">
          
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50 p-8">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Detail Pengajuan Dana</CardTitle>
              <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Detail dan riwayat persetujuan audit</CardDescription>
            </CardHeader>
            
            <CardContent className="p-8">
              {activePR ? (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 font-mono tracking-wider">{activePR.id}</span>
                      <h3 className="text-xl font-black text-slate-950 dark:text-white uppercase tracking-tight mt-1">{activePR.title}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Kategori</p>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{activePR.category}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Tanggal</p>
                        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">{new Date(activePR.createdAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'})}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Justifikasi Anggaran</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-2xl mt-1 border border-slate-100/50 dark:border-slate-800">
                        {activePR.description}
                      </p>
                    </div>

                    <div className="p-5 bg-emerald-950 text-white rounded-[2rem] shadow-md relative overflow-hidden group">
                      <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl" />
                      <p className="text-[9px] font-black uppercase text-emerald-300 tracking-wider">Total Dana Diajukan</p>
                      <h2 className="text-3xl font-black mt-1">{formatRupiah(activePR.amount)}</h2>
                    </div>
                  </div>

                  {/* APPROVAL TIMELINE */}
                  <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workflow State</h4>
                    
                    <div className="space-y-4">
                      {/* Step 1: Requested */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">1</div>
                          <div className="w-0.5 h-10 bg-emerald-600 mt-1" />
                        </div>
                        <div>
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Pengajuan Awal</h5>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.requestedBy}</p>
                        </div>
                      </div>

                      {/* Step 2: Verified */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.status !== 'Pending_Finance' && activePR.status !== 'Rejected' ? "bg-emerald-600 text-white" : 
                            activePR.status === 'Rejected' && !activePR.approvedByCfo ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>2</div>
                          <div className="w-0.5 h-10 bg-slate-200 dark:bg-slate-800 mt-1" />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Verifikasi Finance</h5>
                          {activePR.approvedByFinance ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.approvedByFinance}</p>
                              {activePR.financeNote && <p className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-slate-500 italic mt-1 font-bold">"{activePR.financeNote}"</p>}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu audit tim finance...</p>
                          )}
                        </div>
                      </div>

                      {/* Step 3: Approved & Released */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs",
                            activePR.status === 'Approved' ? "bg-emerald-600 text-white" : 
                            activePR.status === 'Rejected' && activePR.approvedByFinance ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"
                          )}>3</div>
                        </div>
                        <div className="flex-1">
                          <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Persetujuan CFO</h5>
                          {activePR.approvedByCfo ? (
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Oleh: {activePR.approvedByCfo}</p>
                              {activePR.cfoNote && <p className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-slate-500 italic mt-1 font-bold">"{activePR.cfoNote}"</p>}
                            </div>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 italic">Menunggu approval & rilis dana CFO...</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ACTION CONTROLS */}
                  {activePR.status === 'Pending_Finance' && isFinanceRole && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tindakan Audit Finance</Label>
                      <Textarea 
                        placeholder="Tambahkan catatan kelayakan anggaran untuk CFO..."
                        value={financeNote}
                        onChange={(e) => setFinanceNote(e.target.value)}
                        className="min-h-[80px] rounded-xl text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => handleFinanceVerify('Pending_CFO')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Verify & Diteruskan
                        </Button>
                        <Button 
                          onClick={() => handleFinanceVerify('Rejected')}
                          variant="outline"
                          className="border-rose-200 hover:bg-rose-50 text-rose-600 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Tolak (Reject)
                        </Button>
                      </div>
                    </div>
                  )}

                  {activePR.status === 'Pending_CFO' && isCfoRole && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tindakan Persetujuan CFO</Label>
                      <Textarea 
                        placeholder="Tambahkan catatan persetujuan CFO..."
                        value={cfoNote}
                        onChange={(e) => setCfoNote(e.target.value)}
                        className="min-h-[80px] rounded-xl text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => handleCfoApprove('Approved')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Approve & Rilis
                        </Button>
                        <Button 
                          onClick={() => handleCfoApprove('Rejected')}
                          variant="outline"
                          className="border-rose-200 hover:bg-rose-50 text-rose-600 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                        >
                          Tolak (Reject)
                        </Button>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <div className="h-60 flex flex-col items-center justify-center text-center text-slate-400 font-black uppercase text-[10px] tracking-widest gap-2">
                  <ClipboardList className="w-8 h-8 opacity-20" />
                  Pilih salah satu pengajuan untuk melihat detail
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
