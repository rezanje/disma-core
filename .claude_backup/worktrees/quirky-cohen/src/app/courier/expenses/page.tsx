"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { recordOperationalExpense } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Fuel, 
  Car, 
  UtensilsCrossed, 
  MoreHorizontal, 
  Plus, 
  Camera, 
  Receipt,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { OperationalExpense } from "@/types"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import ReceiptUpload from "@/components/ui/receipt-upload"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function CourierExpensesPage() {
  const currentUser = useAppStore(state => state.currentUser)
  const expenses = useAppStore(state => state.expenses)
  const addExpense = useAppStore(state => state.addExpense)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [expenseType, setExpenseType] = useState<'Operational' | 'Kasbon'>('Operational')
  const [category, setCategory] = useState<OperationalExpense['category']>('Bensin')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState("")
  const [receiptUrl, setReceiptUrl] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter expenses reported by current user today
  const today = new Date().toISOString().split('T')[0]
  const todayExpenses = expenses.filter(e => 
    e.reporterId === (currentUser?.id || 'system') && 
    e.date.startsWith(today)
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const totalToday = todayExpenses.reduce((sum, e) => sum + e.amount, 0)

  const handleAddExpense = () => {
    if (amount <= 0) {
      toast.error("Masukkan jumlah biaya yang valid")
      return
    }

    setIsSubmitting(true)
    
    const expenseId = uuidv4()
    const newExpense: OperationalExpense = {
      id: expenseId,
      date: new Date().toISOString(),
      reporterId: currentUser?.id || 'system',
      category,
      amount,
      description: `${expenseType}: ${description}` || `${expenseType}: ${category}`,
      receiptUrl,
      status: 'Pending Audit'
    }

    // 1. Submission only creates an audit record. 
    // Data will reach the ledger once approved in Finance Hub.
    addExpense(newExpense)

    toast.success("Laporan biaya dikirim ke Finance.")
    setIsSubmitting(false)
    setIsAddOpen(false)
    
    // Reset form
    setAmount(0)
    setDescription("")
    setCategory('Bensin')
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Bensin': return <Fuel className="w-5 h-5" />
      case 'Tol': return <Car className="w-5 h-5" />
      case 'Parkir': return <Car className="w-5 h-5 text-slate-400" />
      case 'Makan': return <UtensilsCrossed className="w-5 h-5" />
      default: return <MoreHorizontal className="w-5 h-5" />
    }
  }

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Bensin': return 'bg-amber-100 text-amber-600'
      case 'Tol': return 'bg-blue-100 text-blue-600'
      case 'Parkir': return 'bg-slate-100 text-slate-600'
      case 'Makan': return 'bg-emerald-100 text-emerald-600'
      default: return 'bg-emerald-100 text-emerald-600'
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 -mx-4 -mt-4 p-4 border-b shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">Lapor Biaya</h2>
            <p className="text-sm text-slate-500">Catat bensin, tol, dan lainnya</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger render={
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 shadow-lg">
                <Plus className="w-4 h-4 mr-1" /> Catat Baru
              </Button>
            } />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Lapor Pengeluaran Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                   <Label className="uppercase text-[10px] font-black text-slate-400">Pilih Jenis Transaksi</Label>
                   <Tabs defaultValue="Operational" className="w-full" onValueChange={(val) => setExpenseType(val as any)}>
                      <TabsList className="grid w-full grid-cols-2 h-10 rounded-xl">
                         <TabsTrigger value="Operational" className="rounded-lg text-[10px] font-black uppercase">Operasional</TabsTrigger>
                         <TabsTrigger value="Kasbon" className="rounded-lg text-[10px] font-black uppercase">Kasbon</TabsTrigger>
                      </TabsList>
                   </Tabs>
                </div>
                
                <div className="space-y-2">
                  <Label>Kategori Biaya</Label>
                  <Select value={category} onValueChange={(val) => setCategory(val as any)}>
                    <SelectTrigger className="w-full h-12">
                      <SelectValue placeholder="Pilih Kategori">
                        {category}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bensin">⛽ Bensin / BBM</SelectItem>
                      <SelectItem value="Tol">🛣️ E-Toll / Jalan Tol</SelectItem>
                      <SelectItem value="Parkir">🅿️ Parkir</SelectItem>
                      <SelectItem value="Makan">🍱 Uang Makan</SelectItem>
                      <SelectItem value="Kuli">🚚 Bongkar Muat (Kuli)</SelectItem>
                      <SelectItem value="Lainnya">🧩 Lain-lain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Jumlah Biaya (Rp)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                    <Input 
                      type="text"
                      inputMode="numeric"
                      className="h-12 pl-10 text-lg font-bold"
                      placeholder="0"
                      value={formatNumber(amount)}
                      onChange={(e) => setAmount(parseNumber(e.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Keterangan (Opsional)</Label>
                  <Input 
                    type="text"
                    className="h-12"
                    placeholder="Contoh: Tol JORR, Bensin Pertalite"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                   <ReceiptUpload 
                      label="Bukti Struk (Wajib)" 
                      onFileSelect={setReceiptUrl} 
                   />
                </div>
              </div>
              <DialogFooter>
                <Button 
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-bold"
                  onClick={handleAddExpense}
                  disabled={isSubmitting || amount <= 0}
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan & Lapor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-gradient-to-br from-emerald-600 to-green-700 text-white border-none shadow-emerald-500/20 shadow-xl overflow-hidden">
        <CardContent className="p-6 relative">
          <div className="absolute right-[-20px] top-[-20px] opacity-10">
            <Receipt className="w-32 h-32 rotate-12" />
          </div>
          <div className="relative z-10">
            <p className="text-emerald-100 text-sm font-medium">Total Biaya Hari Ini</p>
            <h3 className="text-3xl font-black mt-1 tracking-tight">{formatRupiah(totalToday)}</h3>
            <div className="mt-4 flex items-center gap-2 text-xs bg-white/10 w-fit px-2 py-1 rounded-full border border-white/20">
              <AlertCircle className="w-3 h-3" />
              <span>Biaya diremburse ke Finance</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-500 px-1 uppercase tracking-wider">Laporan Hari Ini</h4>
        {todayExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 bg-white dark:bg-slate-900 rounded-xl border border-dashed text-slate-400">
            <Receipt className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">Belum ada biaya yang dicatat</p>
          </div>
        ) : (
          todayExpenses.map(expense => (
            <Card key={expense.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-slate-900/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${getCategoryColor(expense.category)}`}>
                  {getCategoryIcon(expense.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h5 className="font-bold text-sm truncate">{expense.description}</h5>
                    <span className="font-bold text-sm text-emerald-600">{formatRupiah(expense.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-500 font-bold uppercase">
                      {expense.category}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(expense.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
