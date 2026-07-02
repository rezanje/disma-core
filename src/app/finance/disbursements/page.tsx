"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRightLeft, Search, Plus, CheckCircle2, XCircle, Clock, Banknote, AlertCircle, FileText, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { v4 as uuidv4 } from "uuid"
import { recordBudgetTransfer } from "@/lib/accounting"
import { computeBankBalances } from "@/lib/bank-balance"
import { DisbursementRequest } from "@/types"

export default function DisbursementsPage() {
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)

  const rawDisbursements = useAppStore(state => state.disbursementRequests) || []
  const addDisbursementRequest = useAppStore(state => state.addDisbursementRequest)
  const updateDisbursementRequest = useAppStore(state => state.updateDisbursementRequest)
  const deleteDisbursementRequest = useAppStore(state => state.deleteDisbursementRequest)

  // Derive actual bank balances
  const derivedBankAccounts = useMemo(
    () => computeBankBalances(bankAccounts, cashTransactions),
    [bankAccounts, cashTransactions]
  )

  // Roles
  const isFinance = currentUser?.role === 'finance' || currentUser?.role === 'super_admin'
  const isCfo = currentUser?.role === 'ceo' || currentUser?.role === 'super_admin'

  // Local States
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedDisbursement, setSelectedDisbursement] = useState<DisbursementRequest | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Form States
  const [fromBankId, setFromBankId] = useState("")
  const [toBankId, setToBankId] = useState("")
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState("")
  
  // CFO Approval Notes
  const [cfoNote, setCfoNote] = useState("")

  // Filtered List
  const filteredDisbursements = useMemo(() => {
    return rawDisbursements.filter(dr => {
      const matchSearch = dr.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bankAccounts.find(b => b.id === dr.fromBankAccountId)?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (bankAccounts.find(b => b.id === dr.toBankAccountId)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchStatus = statusFilter === "ALL" ? true : dr.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [rawDisbursements, searchTerm, statusFilter, bankAccounts])

  // Summary Metrics
  const metrics = useMemo(() => {
    let pending = 0
    let approved = 0
    let transferred = 0
    rawDisbursements.forEach(dr => {
      if (dr.status === 'Pending_CFO') pending += dr.amount
      else if (dr.status === 'Approved') approved += dr.amount
      else if (dr.status === 'Transferred') transferred += dr.amount
    })
    return { pending, approved, transferred }
  }, [rawDisbursements])

  // Submit Request Handler
  const handleCreateRequest = async () => {
    if (!fromBankId || !toBankId || amount <= 0 || !description.trim()) {
      toast.error("Semua field wajib diisi dengan benar.")
      return
    }

    if (fromBankId === toBankId) {
      toast.error("Rekening asal dan tujuan tidak boleh sama.")
      return
    }

    const sourceBank = derivedBankAccounts.find(b => b.id === fromBankId)
    if (sourceBank && sourceBank.balance < amount) {
      toast.error(`Saldo ${sourceBank.name} tidak mencukupi (Tersedia: ${formatRupiah(sourceBank.balance)})`)
      return
    }

    const newRequest: DisbursementRequest = {
      id: uuidv4(),
      fromBankAccountId: fromBankId,
      toBankAccountId: toBankId,
      amount,
      description,
      requestedAt: new Date().toISOString(),
      requestedBy: currentUser?.name || currentUser?.id || "Finance Admin",
      status: 'Draft'
    }

    try {
      await addDisbursementRequest(newRequest)
      toast.success("Request disbursement berhasil dibuat dalam status Draft.")
      setIsCreateOpen(false)
      // Reset
      setFromBankId("")
      setToBankId("")
      setAmount(0)
      setDescription("")
    } catch (e) {
      console.error(e)
      toast.error("Gagal membuat request disbursement.")
    }
  }

  // Submit to CFO
  const handleSubmitToCfo = async (id: string) => {
    try {
      await updateDisbursementRequest(id, { status: 'Pending_CFO' })
      toast.success("Disbursement diajukan ke CFO untuk persetujuan.")
      setIsDetailOpen(false)
    } catch (e) {
      console.error(e)
      toast.error("Gagal mengajukan ke CFO.")
    }
  }

  // CFO Action Handler
  const handleCfoApproval = async (id: string, action: 'Approve' | 'Reject') => {
    if (!cfoNote.trim()) {
      toast.error("Catatan CFO wajib diisi.")
      return
    }

    try {
      await updateDisbursementRequest(id, {
        status: action === 'Approve' ? 'Approved' : 'Rejected',
        cfoNote: cfoNote,
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser?.name || currentUser?.id || "CFO"
      })
      toast.success(action === 'Approve' ? "Disbursement request disetujui CFO." : "Disbursement request ditolak CFO.")
      setCfoNote("")
      setIsDetailOpen(false)
    } catch (e) {
      console.error(e)
      toast.error("Gagal memproses approval.")
    }
  }

  // Execute Transfer Handler (Finance)
  const handleExecuteTransfer = async (dr: DisbursementRequest) => {
    toast.loading("Memproses transfer dana...", { id: "transfer-execution" })
    try {
      // 1. Record budget transfer in accounting ledger
      const success = await recordBudgetTransfer(
        dr.id,
        dr.amount,
        dr.fromBankAccountId,
        "Kas Sourcing / Operasional",
        dr.toBankAccountId
      )

      if (success) {
        // 2. Update disbursement request status
        await updateDisbursementRequest(dr.id, {
          status: 'Transferred',
          transferredAt: new Date().toISOString(),
          transferredBy: currentUser?.name || currentUser?.id || "Finance Admin"
        })
        toast.success("Saldo berhasil ditransfer dan tercatat di Ledger & Cash-Bank!", { id: "transfer-execution" })
        setIsDetailOpen(false)
      } else {
        toast.error("Gagal memproses jurnal transfer.", { id: "transfer-execution" })
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || "Gagal mengeksekusi transfer.", { id: "transfer-execution" })
    }
  }

  // Delete Draft
  const handleDeleteDraft = async (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus draft request ini?")) {
      try {
        await deleteDisbursementRequest(id)
        toast.success("Draft berhasil dihapus.")
        setIsDetailOpen(false)
      } catch (e) {
        console.error(e)
        toast.error("Gagal menghapus draft.")
      }
    }
  }

  // Status Badge Helper
  const renderStatus = (status: DisbursementRequest['status']) => {
    switch (status) {
      case 'Draft':
        return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-extrabold uppercase text-[9px] tracking-wider">Draft</Badge>
      case 'Pending_CFO':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-extrabold uppercase text-[9px] tracking-wider">Pending CFO</Badge>
      case 'Approved':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold uppercase text-[9px] tracking-wider">Approved</Badge>
      case 'Transferred':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-extrabold uppercase text-[9px] tracking-wider">Transferred</Badge>
      case 'Rejected':
        return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-extrabold uppercase text-[9px] tracking-wider">Rejected</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Disbursement (Kas Pindah)</h2>
          <p className="text-muted-foreground text-sm">Pemindahan dana kas utama ke kas operasional untuk kebutuhan belanja mingguan.</p>
        </div>
        {isFinance && (
          <Button onClick={() => setIsCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider px-5 py-2">
            <Plus className="w-4 h-4 mr-2" /> Request Baru
          </Button>
        )}
      </div>

      {/* SUMMARY METRICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[1.5rem] border border-slate-100 shadow-sm bg-gradient-to-br from-amber-50/30 to-amber-50/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Menunggu CFO Approval
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-800">{formatRupiah(metrics.pending)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-[1.5rem] border border-slate-100 shadow-sm bg-gradient-to-br from-emerald-50/30 to-emerald-50/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved (Siap Transfer)
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-800">{formatRupiah(metrics.approved)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-[1.5rem] border border-slate-100 shadow-sm bg-gradient-to-br from-blue-50/30 to-blue-50/10">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Berhasil Ditransfer
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-800">{formatRupiah(metrics.transferred)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Cari deskripsi atau rekening..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 border-slate-200 rounded-xl text-xs"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 border-slate-200 rounded-xl text-xs bg-white">
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Pending_CFO">Pending CFO</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Transferred">Transferred</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TABLE LIST VIEW */}
      <div className="rounded-[1.5rem] border border-slate-100 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="font-bold text-[10px] uppercase text-slate-500 py-3.5 px-4">Tanggal</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500">Keterangan / Tujuan</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500">Dari Rekening</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500 text-center">Ke Rekening</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500 text-right">Nominal</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500 text-center">Status</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-500 text-center w-20">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDisbursements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400 italic text-xs font-bold uppercase tracking-wider">
                  Tidak ada data disbursement request
                </TableCell>
              </TableRow>
            ) : (
              filteredDisbursements.map((dr) => {
                const sourceAcc = bankAccounts.find(b => b.id === dr.fromBankAccountId)
                const targetAcc = bankAccounts.find(b => b.id === dr.toBankAccountId)

                return (
                  <TableRow key={dr.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedDisbursement(dr); setIsDetailOpen(true) }}>
                    <TableCell className="py-4 px-4 font-bold text-slate-700">
                      {format(new Date(dr.requestedAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <p className="font-extrabold text-slate-800 leading-snug">{dr.description}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">Oleh: {dr.requestedBy}</p>
                    </TableCell>
                    <TableCell className="font-bold text-slate-600">
                      {sourceAcc ? sourceAcc.name : 'Unknown Account'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-black uppercase">
                        <ArrowRight className="w-3 h-3 text-blue-500" />
                        {targetAcc ? targetAcc.name : 'Unknown Account'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-black text-slate-900 text-sm">
                      {formatRupiah(dr.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {renderStatus(dr.status)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase hover:bg-slate-100 rounded-lg">
                        Buka
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* CREATE DISBURSEMENT REQUEST MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[450px] p-6 rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" /> Buat Request Disbursement
            </DialogTitle>
            <DialogDescription className="text-xs">
              Buat pengajuan transfer dana antar rekening bank internal.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-0.5">Rekening Asal (From Account)</Label>
              <Select value={fromBankId} onValueChange={setFromBankId}>
                <SelectTrigger className="h-10 border-slate-200 rounded-xl text-xs bg-white">
                  <SelectValue placeholder="Pilih rekening asal...">{fromBankId ? derivedBankAccounts.find(b => b.id === fromBankId)?.name : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {derivedBankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name} — ({formatRupiah(b.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-0.5">Rekening Tujuan (To Account)</Label>
              <Select value={toBankId} onValueChange={setToBankId}>
                <SelectTrigger className="h-10 border-slate-200 rounded-xl text-xs bg-white">
                  <SelectValue placeholder="Pilih rekening tujuan...">{toBankId ? derivedBankAccounts.find(b => b.id === toBankId)?.name : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {derivedBankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name} — ({formatRupiah(b.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-0.5">Nominal Transfer (IDR)</Label>
              <Input 
                type="number" 
                placeholder="Masukkan nominal..." 
                value={amount || ""} 
                onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-10 border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-0.5">Keperluan / Keterangan</Label>
              <Textarea 
                placeholder="Tulis alasan disbursement, contoh: Operasional Belanja Sourcing Sembako Mingguan..." 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px] rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl border-slate-200 text-xs">
              Batal
            </Button>
            <Button onClick={handleCreateRequest} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase px-6">
              Simpan Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL & ACTIONS MODAL/DRAWER */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] p-6 rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black tracking-tight">
              Detail Request Disbursement
            </DialogTitle>
            <DialogDescription className="text-xs">
              Status saat ini: {selectedDisbursement && renderStatus(selectedDisbursement.status)}
            </DialogDescription>
          </DialogHeader>

          {selectedDisbursement && (
            <div className="space-y-5 py-4">
              {/* DETAILS CARD */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Rekening Asal</span>
                    <span className="font-extrabold text-slate-700">
                      {bankAccounts.find(b => b.id === selectedDisbursement.fromBankAccountId)?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Rekening Tujuan</span>
                    <span className="font-extrabold text-slate-700">
                      {bankAccounts.find(b => b.id === selectedDisbursement.toBankAccountId)?.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Nominal</span>
                    <span className="font-black text-emerald-600 text-sm">
                      {formatRupiah(selectedDisbursement.amount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Tanggal Pengajuan</span>
                    <span className="font-extrabold text-slate-700">
                      {format(new Date(selectedDisbursement.requestedAt), "dd MMMM yyyy HH:mm")}
                    </span>
                  </div>
                </div>
                
                <div className="pt-2.5 border-t border-slate-200">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Keperluan</span>
                  <p className="text-xs text-slate-600 font-bold italic">"{selectedDisbursement.description}"</p>
                </div>
              </div>

              {/* CFO REVIEW NOTE IF EXISTS */}
              {selectedDisbursement.cfoNote && (
                <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs">
                  <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest block">Catatan CFO / Persetujuan</span>
                  <p className="text-blue-700 italic font-bold mt-1">"{selectedDisbursement.cfoNote}"</p>
                  <p className="text-[9px] text-blue-500 font-bold mt-0.5 text-right">— Oleh: {selectedDisbursement.approvedBy} ({format(new Date(selectedDisbursement.approvedAt || ""), "dd MMM yyyy")})</p>
                </div>
              )}

              {/* ACTION BLOCKS ACCORDING TO ROLE & STATUS */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                {/* 1. DRAFT ACTIONS (FINANCE ADMIN) */}
                {selectedDisbursement.status === 'Draft' && isFinance && (
                  <div className="space-y-2">
                    <Button 
                      onClick={() => handleSubmitToCfo(selectedDisbursement.id)}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl shadow-sm"
                    >
                      Ajukan Approval ke CFO
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleDeleteDraft(selectedDisbursement.id)}
                      className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                    >
                      Hapus Draft Request
                    </Button>
                  </div>
                )}

                {/* 2. PENDING CFO ACTIONS (CFO) */}
                {selectedDisbursement.status === 'Pending_CFO' && isCfo && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-0.5">Catatan Persetujuan CFO</Label>
                      <Textarea 
                        placeholder="Tulis keputusan kelayakan anggaran (wajib diisi)..." 
                        value={cfoNote}
                        onChange={(e) => setCfoNote(e.target.value)}
                        className="min-h-[85px] rounded-xl text-xs bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={() => handleCfoApproval(selectedDisbursement.id, 'Approve')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl shadow-md"
                      >
                        Setujui (Approve)
                      </Button>
                      <Button 
                        onClick={() => handleCfoApproval(selectedDisbursement.id, 'Reject')}
                        variant="outline"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold text-[10px] uppercase tracking-wider h-11 rounded-xl"
                      >
                        Tolak (Reject)
                      </Button>
                    </div>
                  </div>
                )}

                {/* 3. APPROVED ACTIONS — READY TO TRANSFER (FINANCE ADMIN) */}
                {selectedDisbursement.status === 'Approved' && isFinance && (
                  <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex flex-col items-center text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-emerald-600" />
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Persetujuan CFO Lengkap</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Klik tombol di bawah ini jika transfer fisik antar rekening BCA/Mandiri sudah selesai dilakukan. Jurnal & mutasi akan otomatis tercatat.
                      </p>
                    </div>
                    <Button 
                      onClick={() => handleExecuteTransfer(selectedDisbursement)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest h-11 rounded-xl shadow-md"
                    >
                      Eksekusi Transfer (Kas Pindah)
                    </Button>
                  </div>
                )}

                {/* 4. READ ONLY FOOTER IF COMPLETED */}
                {selectedDisbursement.status === 'Transferred' && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3.5 text-xs text-blue-700 font-extrabold">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-600" />
                    <div>
                      <p>Dana Telah Berhasil Ditransfer & Tercatat!</p>
                      <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mt-0.5">
                        Eksekusi: {selectedDisbursement.transferredBy} ({format(new Date(selectedDisbursement.transferredAt || ""), "dd MMM yyyy HH:mm")})
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="rounded-xl border-slate-200 text-xs">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
