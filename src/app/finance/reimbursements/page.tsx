"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Receipt, Search, FileText, User, Calendar, CreditCard, Send, Landmark } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { v4 as uuidv4 } from "uuid"
import { createAccountingEntry } from "@/lib/accounting"

export default function ReimbursementManagementPage() {
  const reimbursements = useAppStore(state => state.reimbursements)
  const users = useAppStore(state => state.users)
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const updateReimbursement = useAppStore(state => state.updateReimbursement)
  const addCashTransaction = useAppStore(state => state.addCashTransaction)

  const [searchTerm, setSearchTerm] = useState("")
  const [isPayOpen, setIsPayOpen] = useState(false)
  const [activeReimb, setActiveReimb] = useState<any>(null)
  const [payBankId, setPayBankId] = useState('')

  const filteredReimbs = reimbursements.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    users.find(u => u.id === r.userId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const handleApprove = async (id: string) => {
    const loadingToast = toast.loading("Approving reimbursement...")
    try {
      await updateReimbursement(id, { status: 'Approved', auditDate: new Date().toISOString() })
      toast.success("Reimbursement Approved! Lanjut ke Pembayaran.", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal approve: " + e.message, { id: loadingToast })
    }
  }

  const handleReject = async (id: string) => {
    const loadingToast = toast.loading("Rejecting reimbursement...")
    try {
      await updateReimbursement(id, { status: 'Rejected', auditDate: new Date().toISOString() })
      toast.info("Reimbursement Ditolak.", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal reject: " + e.message, { id: loadingToast })
    }
  }

  const handlePay = async () => {
    if (!activeReimb || !payBankId) return

    const loadingToast = toast.loading("Memproses pembayaran reimburse...")
    try {
      const now = new Date().toISOString()
      const txId = uuidv4()
      const user = users.find(u => u.id === activeReimb.userId)

      // 1. Mark Reimbursement as Paid
      await updateReimbursement(activeReimb.id, { 
        status: 'Paid', 
        paymentDate: now,
        paymentReference: txId
      })

      // 2. Add Cash Transaction (Outflow)
      await addCashTransaction({
        id: txId,
        date: now,
        type: 'Out',
        amount: activeReimb.amount,
        bankAccountId: payBankId,
        category: 'Reimbursement',
        description: `Reimburse: ${activeReimb.title} (${user?.name})`,
        referenceType: 'Reimbursement',
        referenceId: activeReimb.id,
        counterpartName: user?.name
      })

      // 3. Journal Entry
      const bank = bankAccounts.find(b => b.id === payBankId)
      const bankCode = bank?.accountCode || '1-1000'
      
      await createAccountingEntry(
        `Bayar Reimburs: ${activeReimb.title} (${user?.name})`,
        'Expense',
        activeReimb.id,
        [{ accountCode: '6-9000', amount: activeReimb.amount }], // 6-9000 for general reimbursement
        [{ accountCode: bankCode, amount: activeReimb.amount }],
        now
      )

      toast.success(`Pembayaran ${formatRupiah(activeReimb.amount)} Berhasil! Saldo Bank Berkurang.`, { id: loadingToast })
      setIsPayOpen(false)
      setActiveReimb(null)
    } catch (e: any) {
      toast.error("Gagal memproses pembayaran: " + e.message, { id: loadingToast })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Pengajuan Reimburse</h2>
          <p className="text-sm text-slate-500 font-medium">Validasi nota pengajuan & cairkan dana reimburse karyawan.</p>
        </div>
        <div className="flex items-center gap-3">
           <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 py-1.5 px-3 h-fit font-black rounded-lg text-[10px] uppercase shadow-sm">
             {reimbursements.filter(r => r.status === 'Pending').length} Request Baru
           </Badge>
        </div>
      </div>

      <Card className="border-none shadow-xl shadow-slate-200 dark:shadow-none bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardContent className="p-8">
           <div className="flex items-center gap-4 mb-8">
              <div className="relative flex-1 max-w-md">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                 <Input 
                   placeholder="Cari judul reimburse atau nama user..." 
                   className="pl-11 h-12 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl ring-offset-emerald-600 font-medium"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
              <div className="flex ml-auto gap-4 items-center">
                 <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Outstanding</span>
                    <span className="text-lg font-black text-rose-600">
                       {formatRupiah(reimbursements.filter(r => r.status === 'Approved').reduce((s,r) => s + r.amount, 0))}
                    </span>
                 </div>
              </div>
           </div>

           <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
             <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                   <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="font-bold text-slate-500 py-4 h-fit">User & Tanggal</TableHead>
                      <TableHead className="font-bold text-slate-500">Judul & Keterangan</TableHead>
                      <TableHead className="text-right font-bold text-slate-500">Nominal</TableHead>
                      <TableHead className="font-bold text-slate-500">Nota</TableHead>
                      <TableHead className="font-bold text-slate-500">Status</TableHead>
                      <TableHead className="text-right font-bold text-slate-500">Aksi</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                   {filteredReimbs.length === 0 ? (
                      <TableRow>
                         <TableCell colSpan={6} className="h-40 text-center text-slate-400 italic font-medium">
                            <Send className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            Belum ada pengajuan reimburse saat ini.
                         </TableCell>
                      </TableRow>
                   ) : (
                      filteredReimbs.map(r => {
                         const user = users.find(u => u.id === r.userId)
                         return (
                            <TableRow key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 py-5">
                               <TableCell className="py-5">
                                  <div className="flex flex-col">
                                     <span className="font-black text-sm flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px]">
                                           {user?.name.charAt(0)}
                                        </div>
                                        {user?.name}
                                     </span>
                                     <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-bold">
                                        <Calendar className="w-3 h-3" />
                                        {format(new Date(r.date), 'dd MMM yyyy')}
                                     </span>
                                  </div>
                               </TableCell>
                               <TableCell>
                                  <div className="flex flex-col max-w-xs">
                                     <span className="font-bold text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
                                     <span className="text-xs text-slate-500 line-clamp-1 h-fit leading-tight mt-0.5">{r.description}</span>
                                  </div>
                               </TableCell>
                               <TableCell className="text-right font-black text-rose-600 font-mono text-base tracking-tighter">
                                  {formatRupiah(r.amount)}
                               </TableCell>
                               <TableCell>
                                  <Dialog>
                                     <DialogTrigger render={
                                        <Button variant="ghost" size="sm" className="h-8 rounded-lg text-emerald-600 hover:bg-emerald-50 font-bold gap-1.5 border border-emerald-100 dark:border-emerald-900/50">
                                           <Receipt className="w-4 h-4" /> Cek Nota
                                        </Button>
                                     } />
                                     <DialogContent>
                                        <DialogHeader>
                                           <DialogTitle>Bukti Nota Reimburse: {r.title}</DialogTitle>
                                        </DialogHeader>
                                        <div className="bg-slate-50 aspect-square rounded-2xl flex flex-col items-center justify-center border-4 border-dashed border-slate-200 relative overflow-hidden group">
                                           <div className="bg-white p-6 rounded-3xl shadow-xl border relative z-10 flex flex-col items-center group-hover:scale-110 transition-transform duration-500">
                                              <FileText className="w-16 h-16 text-emerald-600 mb-2" />
                                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Document Proof</p>
                                           </div>
                                           <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500 to-transparent"></div>
                                        </div>
                                     </DialogContent>
                                  </Dialog>
                               </TableCell>
                               <TableCell>
                                  <Badge variant={
                                     r.status === 'Paid' ? 'default' :
                                     r.status === 'Approved' ? 'secondary' :
                                     r.status === 'Rejected' ? 'destructive' : 'outline'
                                  } className={`text-[9px] font-black uppercase tracking-tight py-1 px-2.5 rounded-full ${
                                     r.status === 'Paid' ? 'bg-emerald-600 hover:bg-emerald-600' : 
                                     r.status === 'Approved' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200' : ''
                                  }`}>
                                     {r.status}
                                  </Badge>
                               </TableCell>
                               <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                     {r.status === 'Pending' && (
                                        <>
                                           <Button 
                                             size="icon" 
                                             variant="outline" 
                                             className="h-8 w-8 rounded-lg border-rose-100 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                                             onClick={() => handleReject(r.id)}
                                           >
                                              <X className="w-4 h-4" />
                                           </Button>
                                           <Button 
                                             size="icon" 
                                             className="h-8 w-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 dark:shadow-none"
                                             onClick={() => handleApprove(r.id)}
                                           >
                                              <Check className="w-4 h-4" />
                                           </Button>
                                        </>
                                     )}
                                     {r.status === 'Approved' && (
                                        <Button 
                                          size="sm" 
                                          className="h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 font-bold shadow-lg shadow-orange-100 dark:shadow-none gap-2 animate-pulse hover:animate-none"
                                          onClick={() => {
                                             setActiveReimb(r)
                                             setIsPayOpen(true)
                                          }}
                                        >
                                           <CreditCard className="w-4 h-4" /> Cairkan Dana
                                        </Button>
                                     )}
                                     {r.status === 'Paid' && (
                                        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap italic">
                                           Transfer {format(new Date(r.paymentDate || ''), 'dd/MM')}
                                        </span>
                                     )}
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

      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
         <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
               <DialogTitle className="text-2xl font-black tracking-tight">Cairkan Pembayaran Reimburse</DialogTitle>
            </DialogHeader>
            <div className="py-6 space-y-6">
               <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-3xl border-2 border-dashed border-slate-200 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nominal Transfer</p>
                  <p className="text-4xl font-black text-rose-600 tracking-tighter">{formatRupiah(activeReimb?.amount || 0)}</p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-slate-600">
                     <User className="w-4 h-4" /> {users.find(u => u.id === activeReimb?.userId)?.name}
                  </div>
               </div>

               <div className="space-y-3">
                  <Label className="font-bold text-slate-700">Pilih Sumber Dana (Bank)</Label>
                  <Select value={payBankId} onValueChange={(val) => setPayBankId(val || '')}>
                     <SelectTrigger className="h-14 rounded-2xl border-2 hover:border-emerald-600 focus:ring-emerald-600 transition-all font-bold">
                        <SelectValue placeholder="Pilih Akun Bank">
                           {bankAccounts.find(b => b.id === payBankId)?.name}
                        </SelectValue>
                     </SelectTrigger>
                     <SelectContent className="rounded-2xl">
                        {bankAccounts.map(b => (
                           <SelectItem key={b.id} value={b.id} className="rounded-xl font-medium">
                              <div className="flex justify-between w-64">
                                 <span>{b.name}</span>
                                 <span className="font-black text-emerald-600">{formatRupiah(b.balance)}</span>
                              </div>
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
            </div>
            <DialogFooter>
               <Button 
                  className="w-full h-16 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-black text-xl shadow-xl shadow-emerald-200 dark:shadow-none"
                  onClick={handlePay}
                  disabled={!payBankId}
               >
                  Konfirmasi & Transfer Dana
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  )
}
