"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordOperationalExpense, recordOnlinePurchase } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Receipt, Search, FileText, User, Calendar } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function AuditTransitionPage() {
  const expenses = useAppStore(state => state.expenses)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const users = useAppStore(state => state.users)
  const updateExpense = useAppStore(state => state.updateExpense)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeRejectionId, setActiveRejectionId] = useState<string | null>(null)
  const [rejectionNote, setRejectionNote] = useState("")

  const pendingExpenses = expenses.filter(e => 
    e.status === 'Pending Audit' && 
    (e.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
     users.find(u => u.id === e.reporterId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const approvedExpenses = expenses.filter(e => e.status === 'Approved')
  const approvedOutflow = approvedExpenses.reduce((sum, e) => sum + e.amount, 0)
  const approvedInflow = 0 

  const handleApprove = async (expenseId: string) => {
    const expense = expenses.find(e => e.id === expenseId)
    if (!expense) return

    updateExpense(expenseId, { 
      status: 'Approved',
      auditDate: new Date().toISOString()
    })

    let success = false
    if (expense.category === 'Belanja Online' && expense.referenceId) {
      const pItem = purchaseItems.find(i => i.id === expense.referenceId)
      const pName = pItem ? (products.find(p => p.id === pItem.productId)?.name || expense.description) : expense.description
      success = await recordOnlinePurchase(expense.referenceId, expense.amount, pName)
    } else {
      success = await recordOperationalExpense(
        expense.id,
        expense.amount,
        `${expense.category}: ${expense.description}`,
        expense.date
      )
    }

    if (success) {
      toast.success("Transaksi Valid & Terposting ke Ledger!")
    } else {
      toast.error("Validasi gagal - Data reference tidak valid.")
    }
  }

  const handleConfirmReject = () => {
    if (!activeRejectionId) return
    if (!rejectionNote.trim()) {
      toast.error("Mohon masukkan alasan penolakan.")
      return
    }

    const expense = expenses.find(e => e.id === activeRejectionId)
    if (!expense) return

    updateExpense(activeRejectionId, { 
      status: 'Rejected',
      auditDate: new Date().toISOString(),
      auditNote: rejectionNote
    })

    if (expense.category === 'Belanja Online' && expense.referenceId) {
      useAppStore.getState().updatePurchaseItem(expense.referenceId, {
        isOnlineOrdered: false,
        actualUnitPrice: 0,
        qtyPurchased: 0
      })
    }

    toast.info(`Transaksi ${expense.category} ditolak & dikembalikan ke pengaju.`)
    setActiveRejectionId(null)
    setRejectionNote("")
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight uppercase">Audit <span className="text-blue-600">Transition Room</span></h2>
          <p className="text-muted-foreground font-bold italic text-xs mt-1">Ruang validasi transaksi divisi sebelum masuk ke Buku Besar & Laporan Keuangan.</p>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 py-1 px-3 h-fit font-black uppercase text-[10px]">
             {pendingExpenses.length} Perlu Validasi
           </Badge>
        </div>
      </div>

      <Card className="liquid-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Cari transaksi atau reporter..." 
                className="pl-9 h-11 font-bold rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-[10px] font-black uppercase text-slate-400">
               Integrity & Verification Gate
            </div>
          </div>

          <div className="rounded-[2rem] border bg-white dark:bg-slate-950 overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-black uppercase text-[10px] text-slate-500">Waktu & Reporter</TableHead>
                  <TableHead className="font-black uppercase text-[10px] text-slate-500">Kategori & Info</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] text-slate-500">Nominal</TableHead>
                  <TableHead className="font-black uppercase text-[10px] text-slate-500">Bukti Nota</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] text-slate-500">Aksi Validasi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center text-muted-foreground italic">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-4xl">🏜️</span>
                        <p className="font-black text-slate-300 uppercase tracking-widest text-xs mt-2">Buku Besar Bersih</p>
                        <p className="text-[10px] font-bold">Semua transaksi di ruang transisi sudah divalidasi.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingExpenses.map((exp) => {
                    const reporter = users.find(u => u.id === exp.reporterId)
                    return (
                      <TableRow key={exp.id} className="group hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors border-slate-50">
                        <TableCell>
                           <div className="flex flex-col">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5 capitalize">
                                 {reporter?.name || 'Unknown'} 
                                 <span className="text-[9px] text-slate-400 font-black uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                                   {reporter?.role}
                                 </span>
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                                 {format(new Date(exp.date), 'dd MMM yyyy, HH:mm')}
                              </span>
                           </div>
                        </TableCell>
                        <TableCell>
                           <div className="flex flex-col">
                              <Badge className="w-fit text-[9px] h-5 bg-blue-50 text-blue-600 font-black uppercase border-none hover:bg-blue-100 mb-1">
                                 {exp.category}
                              </Badge>
                              <span className="text-sm font-bold text-slate-600 line-clamp-1">{exp.description}</span>
                           </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-base font-black text-rose-600">
                             {formatRupiah(exp.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                           <Dialog>
                              <DialogTrigger render={
                                 <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 font-black gap-1 bg-blue-50/50 hover:bg-blue-100 rounded-xl px-4 transition-all">
                                    <Receipt className="w-4 h-4" /> Cek Nota
                                 </Button>
                              } />
                              <DialogContent>
                                 <DialogHeader>
                                    <DialogTitle>Bukti Nota Pembelian - {exp.category}</DialogTitle>
                                 </DialogHeader>
                                 <div className="mt-4 border rounded-xl overflow-hidden bg-slate-50 min-h-[400px]">
                                    {exp.receiptUrl?.startsWith('data:application/pdf') ? (
                                       <div className="flex flex-col h-[70vh]">
                                          <iframe 
                                             src={exp.receiptUrl} 
                                             className="w-full h-full border-none"
                                             title="PDF Receipt"
                                          />
                                       </div>
                                    ) : exp.receiptUrl ? (
                                       <img src={exp.receiptUrl} alt="Receipt" className="w-full object-contain max-h-[70vh]" />
                                    ) : (
                                       <div className="p-12 flex flex-col items-center justify-center h-full">
                                          <FileText className="w-16 h-16 text-slate-300 mb-2" />
                                          <p className="text-sm text-slate-500 font-bold italic">Bukti Nota Tidak Tersedia</p>
                                       </div>
                                    )}
                                 </div>
                              </DialogContent>
                           </Dialog>
                        </TableCell>
                        <TableCell className="text-right">
                           <div className="flex justify-end gap-2">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-rose-200 text-rose-600 hover:bg-rose-50 font-black rounded-xl px-4"
                                onClick={() => setActiveRejectionId(exp.id)}
                              >
                                <X className="w-4 h-4 mr-1" /> Reject
                              </Button>
                              <Button 
                                size="sm" 
                                className="bg-emerald-600 hover:bg-emerald-700 font-black rounded-xl px-4 shadow-lg shadow-emerald-200"
                                onClick={() => handleApprove(exp.id)}
                              >
                                <Check className="w-4 h-4 mr-1" /> Approve
                              </Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
         <Card className="bg-slate-900 border-none shadow-xl rounded-[2.5rem]">
            <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="text-emerald-500 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Inflow Validated
               </CardTitle>
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-black text-white">{formatRupiah(approvedInflow)}</div>
               <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight italic">Total kas masuk divalidasi</p>
            </CardContent>
         </Card>
         <Card className="bg-slate-900 border-none shadow-xl rounded-[2.5rem]">
            <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="text-rose-500 h-1.5 w-1.5 rounded-full bg-rose-500" /> Outflow Validated
               </CardTitle>
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-black text-white">{formatRupiah(approvedOutflow)}</div>
               <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight italic">Total kas keluar divalidasi</p>
            </CardContent>
         </Card>
         <Card className="bg-slate-900 border-none shadow-xl rounded-[2.5rem]">
            <CardHeader className="pb-2">
               <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                 <span className="text-amber-500 h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" /> Waiting in Transition
               </CardTitle>
            </CardHeader>
            <CardContent>
               <div className="text-2xl font-black text-white">
                  {formatRupiah(pendingExpenses.reduce((sum, e) => sum + e.amount, 0))}
               </div>
               <p className="text-[9px] text-slate-500 mt-1 font-bold uppercase tracking-tight italic">Dana tertahan di transisi</p>
            </CardContent>
         </Card>
      </div>

       <Dialog open={!!activeRejectionId} onOpenChange={(open) => !open && setActiveRejectionId(null)}>
          <DialogContent className="sm:max-w-md rounded-[2rem]">
             <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-rose-600 font-black uppercase tracking-tight">
                   <X className="w-5 h-5" /> Penolakan Transaksi
                </DialogTitle>
             </DialogHeader>
             <div className="py-4 space-y-4">
                <p className="text-sm text-slate-500 font-bold italic">
                   Mohon berikan alasan penolakan agar pengaju dapat memperbaiki datanya.
                </p>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Alasan Penolakan</label>
                   <Input 
                      placeholder="Contoh: Bon tidak jelas / Nominal salah..."
                      className="h-12 font-bold rounded-xl"
                      value={rejectionNote}
                      onChange={(e) => setRejectionNote(e.target.value)}
                   />
                </div>
             </div>
             <div className="flex justify-end gap-3 border-t pt-4 mt-2">
                <Button variant="ghost" className="font-bold" onClick={() => setActiveRejectionId(null)}>Batal</Button>
                <Button className="bg-rose-600 hover:bg-rose-700 font-black px-6 rounded-xl" onClick={handleConfirmReject}>
                   Kirim Penolakan
                </Button>
             </div>
          </DialogContent>
       </Dialog>
    </div>
  )
}
