"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordOperationalExpense } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatRupiah, formatNumber, parseNumber, cn } from "@/lib/utils"
import { Camera, Send, Wallet } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import ReceiptUpload from "@/components/ui/receipt-upload"

export default function ExpensesForm() {
  const currentUser = useAppStore(state => state.currentUser)
  const addExpense = useAppStore(state => state.addExpense)
  const addReimbursement = useAppStore(state => state.addReimbursement)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const expenses = useAppStore(state => state.expenses)

  // --- ROBUST WALLET CALCULATION ---
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const sourcingBank = bankAccounts.find(b => b.id === 'bank-advance-sourcing')
  const cashIn = sourcingBank?.balance || 0
  
  const myPurchaseItems = purchaseItems.filter(pi => 
    purchases.some(p => p.id === pi.purchaseId && (p.purchaserId === currentUser?.id || p.purchaserId === 'u2' || p.purchaserId === 'pending'))
  )
  const shopOut = myPurchaseItems
    .filter(i => i.isChecked)
    .reduce((sum, i) => sum + (i.qtyPurchased * i.actualUnitPrice), 0)
  
  const totalExpenses = expenses
    .filter(e => (e.reporterId === currentUser?.id || e.reporterId === 'u2') && e.status === 'Pending Audit')
    .reduce((sum, e) => sum + e.amount, 0)
  
  const walletBalance = cashIn - shopOut - totalExpenses

  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    transactionType: "Biaya Operasional", 
    category: "",
    amount: 0,
    description: "",
    receiptUrl: ""
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.category) return toast.error("Pilih kategori biaya dulu bro!")
    if (formData.amount <= 0) return toast.error("Nominal gak boleh nol!")
    if (!formData.description) return toast.error("Isi keterangan singkat buat apa duitnya!")
    
    // Receipt is mandatory ONLY for Reimbursement (Kasbon)
    if (formData.transactionType === 'Kasbon' && !formData.receiptUrl) {
      return toast.error("Foto bukti nota wajib diupload untuk reimbursement ya!")
    }

    setIsLoading(true)

    const id = uuidv4()
    let success = true

    if (formData.transactionType === 'Kasbon') {
       if (!formData.receiptUrl) {
         setIsLoading(false)
         return toast.error("Pengajuan Reimbursement (Talangan) wajib ada bukti nota bro!")
       }
       // Save to Reimbursement table
       addReimbursement({
          id,
          date: new Date().toISOString(),
          userId: currentUser?.id || 'system',
          title: `${formData.category}: ${formData.description}`,
          amount: formData.amount,
          description: formData.description,
          receiptUrl: formData.receiptUrl,
          status: 'Pending'
       })
       toast.success("Pengajuan Reimbursement (Talangan) berhasil dikirim!")
    } else {
       // Save to Expense Record (Potong Kas)
       // Submission only creates an audit record. 
       // Ledger/Cash recording happens during Finance Hub approval.
       addExpense({
         id,
         date: new Date().toISOString(),
         reporterId: currentUser?.id || 'u2',
         category: formData.category as any,
         amount: formData.amount,
         description: formData.description,
         receiptUrl: formData.receiptUrl,
         status: 'Pending Audit'
       })
       toast.success("Laporan biaya (Potong Kas) berhasil dikirim untuk audit!")
    }

    if (success) {
      setFormData({ transactionType: "Biaya Operasional", category: "", amount: 0, description: "", receiptUrl: "" })
    }
    setIsLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md -mx-4 -mt-4 p-6 border-b shadow-sm mb-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 animate-gradient-x" />
        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <Wallet className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Klaim Biaya Operasional</h2>
        <p className="text-sm text-slate-500 mt-1">
          Laporkan bensin, tol, makan, atau talangan pribadi
        </p>

        <div className="mt-6 inline-flex flex-col items-center px-8 py-4 bg-slate-900 rounded-[2rem] shadow-xl border border-white/10 group">
           <span className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em] mb-1">Kas Di Tangan</span>
           <span className={cn(
             "text-2xl font-black tracking-tighter transition-all group-hover:scale-110",
             walletBalance >= 0 ? "text-white" : "text-rose-400"
           )}>
             {formatRupiah(walletBalance)}
           </span>
           {walletBalance < 0 && (
             <span className="text-[9px] font-bold text-rose-300 uppercase mt-1 animate-pulse">(!) Saldo Minus (Talangan Pribadi)</span>
           )}
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-0">
            <div className="space-y-3">
              <Label className="text-base text-slate-700 font-black uppercase tracking-widest">Jenis Transaksi</Label>
              <Tabs 
                defaultValue="Biaya Operasional" 
                className="w-full"
                onValueChange={(val) => setFormData({...formData, transactionType: val})}
              >
                <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl">
                  <TabsTrigger value="Biaya Operasional" className="rounded-lg font-bold text-xs uppercase tracking-tight">Potong Saldo Kas</TabsTrigger>
                  <TabsTrigger value="Kasbon" className="rounded-lg font-bold text-xs uppercase tracking-tight">Reimbursement / Talangan</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <Label className="text-base text-slate-700 font-bold uppercase tracking-tighter">Kategori Biaya / Keperluan</Label>
              <Select 
                value={formData.category} 
                onValueChange={(val) => setFormData({...formData, category: val || 'Lainnya'})}
              >
                <SelectTrigger className="h-12 bg-white dark:bg-slate-900 border-slate-200">
                  <SelectValue placeholder="Pilih kategori pengeluaran">
                    {formData.category}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bensin">Bensin / Transport</SelectItem>
                  <SelectItem value="Tol">Biaya Tol</SelectItem>
                  <SelectItem value="Parkir">Karcis Parkir</SelectItem>
                  <SelectItem value="Kuli">Kuli / Bongkar Muat</SelectItem>
                  <SelectItem value="Makan">Uang Makan</SelectItem>
                  <SelectItem value="Lainnya">Lainnya...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-base text-slate-700">Nominal ({formatRupiah(formData.amount || 0)})</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-slate-500">Rp</span>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  className="h-14 pl-12 text-lg font-bold bg-white dark:bg-slate-900" 
                  placeholder="0"
                  value={formatNumber(formData.amount)}
                  onChange={(e) => setFormData({...formData, amount: parseNumber(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base text-slate-700">Keterangan Singkat</Label>
              <Input 
                className="h-12 bg-white dark:bg-slate-900" 
                placeholder="Misal: Parkir Pasar Induk"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="pt-2">
               <ReceiptUpload 
                  label="Bukti Struk/Kwitansi (Wajib)" 
                  onFileSelect={(val) => setFormData({...formData, receiptUrl: val})}
                  currentFile={formData.receiptUrl}
               />
            </div>

            <div className="pt-6">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoading ? "Mengirim..." : (
                  <>
                    <Send className="w-5 h-5 mr-2" /> Submit Pengeluaran
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
