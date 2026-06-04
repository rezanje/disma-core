"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Minus, Landmark, ArrowUpRight, ArrowDownRight, Search, History, Wallet, Wallet2, Building2, Receipt, FileText, Pencil, Settings2, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { v4 as uuidv4 } from "uuid"
import { createAccountingEntry } from "@/lib/accounting"
import { computeBankBalances } from "@/lib/bank-balance"
import ReceiptUpload from "@/components/ui/receipt-upload"
import { Checkbox } from "@/components/ui/checkbox"

const formatCategory = (cat: string) => {
  const map: Record<string, string> = {
    'BELANJA_BARANG_VENDOR': 'Belanja Barang (HPP)',
    'GAJI_OPERASIONAL_KARYAWAN': 'Beban Gaji',
    'MARKETING': 'Marketing',
    'KENDARAAN': 'Beban Kendaraan',
    'UTILITIES': 'Listrik/Air/Internet',
    'OPERASIONAL_KANTOR': 'Operasional Kantor',
    'ONGKIR_KIRIM': 'Ongkir Kirim',
    'BIAYA_BANK': 'Biaya Admin Bank',
    'LAINNYA': 'Lainnya',
    'PEMASUKAN_PIUTANG': 'Pelunasan Piutang (AR)',
    'PEMASUKAN_INVESTOR': 'Investasi Masuk',
    'PENGEMBALIAN_INVESTOR': 'Pengembalian Investor',
    'REFUND_MASUK': 'Refund Vendor',
  }
  return map[cat] || cat
}

export default function CashAndBankPage() {
  const rawBankAccounts = useAppStore(state => state.bankAccounts)
  const addBankAccount = useAppStore(state => state.addBankAccount)
  const updateBankAccount = useAppStore(state => state.updateBankAccount)
  const deleteBankAccount = useAppStore(state => state.deleteBankAccount)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  // Balance derived from ledger (source of truth), not stored field — avoids lost-update race.
  const bankAccounts = useMemo(
    () => computeBankBalances(rawBankAccounts, cashTransactions),
    [rawBankAccounts, cashTransactions]
  )
  const addCashTransaction = useAppStore(state => state.addCashTransaction)
  const updateCashTransaction = useAppStore(state => state.updateCashTransaction)
  const deleteCashTransaction = useAppStore(state => state.deleteCashTransaction)
  const bulkDeleteCashTransactions = useAppStore(state => state.bulkDeleteCashTransactions)
  const coas = useAppStore(state => state.coas)

  const [isAddTxOpen, setIsAddTxOpen] = useState(false)
  const [isAddBankOpen, setIsAddBankOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<any>(null)
  const [bankForm, setBankForm] = useState({ name: '', number: '', balance: 0, accountCode: '1-1000' })

  const [txType, setTxType] = useState<'In' | 'Out' | 'Transfer'>('In')
  const [bankId, setBankId] = useState('')
  const [targetBankId, setTargetBankId] = useState('')
  const [amount, setAmount] = useState(0)
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [counterpart, setCounterpart] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [cicilanPokok, setCicilanPokok] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")

  const [selectedBankFilter, setSelectedBankFilter] = useState<string | null>(null)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null)
  const [editingTx, setEditingTx] = useState<any>(null)
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([])
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [txToDelete, setTxToDelete] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  // Extract unique categories from cash transactions for the filter dropdown
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>()
    cashTransactions.forEach(tx => {
      if (tx.category) {
        cats.add(tx.category)
      }
    })
    return Array.from(cats).sort()
  }, [cashTransactions])

  // Build index map for tiebreaker: store prepends new tx, so lower index = newer.
  const txIndex = new Map(cashTransactions.map((tx, i) => [tx.id, i]))
  const filteredTxs = cashTransactions.filter(tx => {
    const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.counterpartName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchBank = selectedBankFilter ? tx.bankAccountId === selectedBankFilter : true;
    const matchCategory = selectedCategoryFilter ? tx.category === selectedCategoryFilter : true;
    return matchSearch && matchBank && matchCategory;
  }).sort((a,b) => {
    const timeA = new Date(a.date).getTime()
    const timeB = new Date(b.date).getTime()
    
    if (sortOrder === 'desc') {
      const dt = timeB - timeA
      if (dt !== 0) return dt
      // Tiebreaker: lower store index = newer (prepend pattern in addCashTransaction)
      return (txIndex.get(a.id) ?? 0) - (txIndex.get(b.id) ?? 0)
    } else {
      const dt = timeA - timeB
      if (dt !== 0) return dt
      // Tiebreaker: lower store index = newer, so reverse it for ascending (oldest first)
      return (txIndex.get(b.id) ?? 0) - (txIndex.get(a.id) ?? 0)
    }
  })

  const handleCreateBank = async () => {
    if (!bankForm.name) return toast.error("Nama bank harus diisi!")
    setIsSubmitting(true)
    const loadingToast = toast.loading("Mendaftarkan akun bank baru...")
    try {
      const bankId = `bank-${Date.now()}`
      await addBankAccount({
        id: bankId,
        name: bankForm.name,
        accountNumber: bankForm.number,
        accountCode: bankForm.accountCode,
        balance: bankForm.balance
      })

      if (Number(bankForm.balance) > 0) {
        const txId = `opb-${Date.now()}`
        const now = new Date().toISOString()

        // 1. Record Cash Transaction
        await addCashTransaction({
          id: txId,
          date: now,
          type: 'In',
          amount: bankForm.balance,
          bankAccountId: bankId,
          category: 'Investasi',
          description: `Saldo Awal: ${bankForm.name}`,
          counterpartName: 'Owner Capital',
          referenceType: 'Adjustment' as any
        })

        // 2. Create Journal Entry (Accounting Ledger)
        await createAccountingEntry(
          `Saldo Awal: ${bankForm.name}`,
          'Adjustment',
          txId,
          [{ accountCode: bankForm.accountCode || '1-1000', amount: bankForm.balance }],
          [{ accountCode: '3-1000', amount: bankForm.balance }], // Credit Owner Capital
          now
        )
      }

      setIsAddBankOpen(false)
      setBankForm({ name: '', number: '', balance: 0, accountCode: '1-1000' })
      toast.success(`${bankForm.name} berhasil didaftarkan!`, { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal mendaftarkan bank: " + e.message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateBank = async () => {
    if (!editingBank) return
    const original = bankAccounts.find(b => b.id === editingBank.id)
    if (!original) return

    setIsSubmitting(true)
    const loadingToast = toast.loading("Memperbarui info bank & menyesuaikan saldo...")
    const diff = Number(editingBank.balance) - original.balance
    
    try {
      // Create adjustment transaction & journal if balance changed
      if (diff !== 0) {
        if (!editingBank.adjCategory) {
          return toast.error("Pilih kategori penyesuaian untuk selisih saldo!", { id: loadingToast })
        }

        const absDiff = Math.abs(diff)
        const now = new Date().toISOString()
        const txId = `adj-${Date.now()}`

        // 1. Record in History (Cash Transaction)
        await addCashTransaction({
          id: txId,
          date: now,
          type: diff > 0 ? 'In' : 'Out',
          amount: absDiff,
          bankAccountId: editingBank.id,
          category: `Penyesuaian: ${editingBank.adjCategory}`,
          description: `Koreksi Saldo Manual (${editingBank.adjCategory})`,
          counterpartName: 'Adjustment System',
          referenceType: 'Adjustment' as any
        })

        // 2. Journal Entry (Accounting Ledger)
        let adjAccountCode = '6-9000'
        if (diff > 0) {
          switch(editingBank.adjCategory) {
            case 'Investasi': adjAccountCode = '3-1000'; break;
            case 'Pendapatan': adjAccountCode = '4-2000'; break;
            case 'Pinjaman': adjAccountCode = '2-4000'; break;
            default: adjAccountCode = '3-1000';
          }
          await createAccountingEntry(
            `Penyesuaian Saldo (Kenaikan): ${editingBank.name}`,
            'Adjustment',
            txId,
            [{ accountCode: editingBank.accountCode || '1-1000', amount: diff }],
            [{ accountCode: adjAccountCode, amount: diff }],
            now
          )
        } else {
          switch(editingBank.adjCategory) {
            case 'Beban': adjAccountCode = '6-9000'; break;
            case 'Prive': adjAccountCode = '3-2000'; break;
            case 'Pajak': adjAccountCode = '6-9000'; break;
            default: adjAccountCode = '6-9000';
          }
          await createAccountingEntry(
            `Penyesuaian Saldo (Penurunan): ${editingBank.name}`,
            'Adjustment',
            txId,
            [{ accountCode: adjAccountCode, amount: absDiff }],
            [{ accountCode: editingBank.accountCode || '1-1000', amount: absDiff }],
            now
          )
        }
      }

      await updateBankAccount(editingBank.id, {
        name: editingBank.name,
        accountNumber: editingBank.accountNumber,
        accountCode: editingBank.accountCode,
        // Balance is NOT updated here because addCashTransaction already updated it
      })
      setEditingBank(null)
      toast.success("Info bank & Jurnal penyesuaian berhasil diperbarui!", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal memperbarui bank: " + e.message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveEditTx = async () => {
    if (!editingTx) return
    setIsSubmitting(true)
    const loadingToast = toast.loading("Menyimpan perubahan transaksi...")
    try {
      await updateCashTransaction(editingTx.id, {
        bankAccountId: editingTx.bankAccountId,
        description: editingTx.description,
        amount: editingTx.amount,
        category: editingTx.category,
        counterpartName: editingTx.counterpartName,
      })
      setEditingTx(null)
      toast.success("Transaksi berhasil diperbarui!", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal memperbarui: " + e.message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!txToDelete) return
    setIsSubmitting(true)
    const loadingToast = toast.loading("Menghapus transaksi...")
    try {
      await deleteCashTransaction(txToDelete)
      setTxToDelete(null)
      toast.success("Transaksi berhasil dihapus!", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal menghapus: " + e.message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    setIsSubmitting(true)
    const loadingToast = toast.loading(`Menghapus ${selectedTxIds.length} transaksi...`)
    try {
       await bulkDeleteCashTransactions(selectedTxIds)
       setSelectedTxIds([])
       setIsBulkDeleteConfirmOpen(false)
       toast.success("Transaksi berhasil dihapus massal!", { id: loadingToast })
    } catch (e: any) {
       toast.error("Gagal menghapus massal: " + e.message, { id: loadingToast })
    } finally {
       setIsSubmitting(false)
    }
  }

  const handleSaveTx = async () => {
    if (txType === 'Transfer') {
      if (!bankId || !targetBankId || amount <= 0 || !description) {
        toast.error("Mohon lengkapi data transfer internal.")
        return
      }
      if (bankId === targetBankId) {
        toast.error("Akun sumber dan tujuan tidak boleh sama.")
        return
      }

      setIsSubmitting(true)
      const loadingToast = toast.loading("Memproses transfer internal...")
      
      try {
        const txId = uuidv4()
        const now = new Date(txDate).toISOString()
        const sourceBank = bankAccounts.find(b => b.id === bankId)
        const targetBank = bankAccounts.find(b => b.id === targetBankId)
        
        // 1. Journal Entry (Debit Target, Credit Source)
        const sourceBankCode = sourceBank?.accountCode || '1-1000'
        const targetBankCode = targetBank?.accountCode || '1-1000'
        const success = await createAccountingEntry(
          `Pindah Buku: ${description}`,
          'Transfer',
          txId,
          [{ accountCode: targetBankCode, amount }],
          [{ accountCode: sourceBankCode, amount }],
          now
        )

        if (success) {
          // Add OUT tx for source - AWAIT to ensure sequential update
          await addCashTransaction({
            id: txId,
            date: now,
            type: 'Out',
            amount,
            bankAccountId: bankId,
            category: 'Pindah Saldo Kas',
            description,
            counterpartName: targetBank?.name,
            receiptUrl,
            referenceType: 'Transfer'
          })
          
          // Add IN tx for target - AWAIT to ensure sequential update
          await addCashTransaction({
            id: uuidv4(),
            date: now,
            type: 'In',
            amount,
            bankAccountId: targetBankId,
            category: 'Pindah Saldo Kas',
            description,
            counterpartName: sourceBank?.name,
            receiptUrl,
            referenceType: 'Transfer'
          })
          
          toast.success("Transfer Internal Berhasil Dicatat!", { id: loadingToast })
          setIsAddTxOpen(false)
          setAmount(0)
          setTxDate(new Date().toISOString().split('T')[0])
          setDescription('')
          setCounterpart('')
          setTargetBankId('')
        } else {
          toast.error("Gagal mencatat jurnal transfer.", { id: loadingToast })
        }
      } catch (e: any) {
        toast.error("Gagal memproses transaksi: " + e.message, { id: loadingToast })
      } finally {
        setIsSubmitting(false)
      }
      return;
    }

    if (!bankId || amount <= 0 || !category || !description) {
      toast.error("Mohon lengkapi semua data transaksi.")
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading(`Mencatat transaksi kas ${txType === 'In' ? 'Masuk' : 'Keluar'}...`)
    
    try {
      const txId = uuidv4()
      const now = new Date(txDate).toISOString()
      const bank = bankAccounts.find(b => b.id === bankId)

      // Map Category to COA Account Code
      let targetAccountCode = '4-1000' // Default Revenue
      if (txType === 'In') {
        switch (category) {
          case 'Pelunasan Piutang': targetAccountCode = '1-2000'; break;
          case 'Penjualan Tunai': targetAccountCode = '4-1000'; break;
          case 'Investasi': targetAccountCode = '3-1000'; break;
          case 'Pinjaman': targetAccountCode = '2-4000'; break;
          case 'Refund Vendor': targetAccountCode = '1-3000'; break;
          case 'Pendapatan Lainnya': targetAccountCode = '4-2000'; break;
        }
      } else {
        switch (category) {
          case 'Belanja Barang (HPP)': targetAccountCode = '5-1000'; break;
          case 'Beban Gaji': targetAccountCode = '6-1000'; break;
          case 'Sewa Gedung': targetAccountCode = '6-1100'; break;
          case 'Listrik/Air': targetAccountCode = '6-1200'; break;
          case 'Marketing': targetAccountCode = '6-1300'; break;
          case 'Bensin/Transport': targetAccountCode = '6-1400'; break;
          case 'ATK/Kantor': targetAccountCode = '6-1500'; break;
          case 'Inventaris Kantor': targetAccountCode = '1-4100'; break;
          case 'Perbaikan': targetAccountCode = '6-9000'; break;
          case 'Konsumsi': targetAccountCode = '6-9000'; break;
          case 'Biaya Admin': targetAccountCode = '6-1600'; break;
          case 'Pajak': targetAccountCode = '2-3000'; break;
          default: targetAccountCode = '6-9000'; break;
        }
      }

      // Special case: Cicilan Pinjaman (split JE: pokok → liability, bunga → expense)
      const bankAccountCode = bank?.accountCode || '1-1000'
      if (txType === 'Out' && category === 'Cicilan Pinjaman') {
        const bunga = Math.max(0, amount - cicilanPokok)
        if (cicilanPokok <= 0 || cicilanPokok > amount) {
          toast.error("Bagian pokok cicilan tidak valid.", { id: loadingToast })
          return
        }
        // JE first — if it fails, no cash tx created (data integrity)
        const debits = [
          { accountCode: '2-4000', amount: cicilanPokok },
          ...(bunga > 0 ? [{ accountCode: '6-3000', amount: bunga }] : [])
        ]
        const success = await createAccountingEntry(
          `Cicilan Pinjaman: ${description}`, 'Adjustment', txId,
          debits, [{ accountCode: bankAccountCode, amount }], now
        )
        if (!success) { toast.error("Gagal mencatat jurnal cicilan.", { id: loadingToast }); return }
        await addCashTransaction({
          id: txId, date: now, type: 'Out', amount, bankAccountId: bankId,
          category: 'Cicilan Pinjaman', description, counterpartName: counterpart,
          receiptUrl, referenceType: 'Manual'
        })
        toast.success("Cicilan Pinjaman Dicatat!", { id: loadingToast })
        setIsAddTxOpen(false); setAmount(0); setDescription(''); setCounterpart(''); setCategory(''); setCicilanPokok(0)
        return
      }

      // 1. Add to store and AWAIT
      await addCashTransaction({
        id: txId,
        date: now,
        type: txType,
        amount,
        bankAccountId: bankId,
        category,
        description,
        counterpartName: counterpart,
        receiptUrl,
        referenceType: 'Manual'
      })

      // 2. Journal Entry (Corrected Mapping)
      // In: Debit Bank, Credit Target Account
      // Out: Debit Target Account, Credit Bank
      const success = await createAccountingEntry(
        `${txType === 'In' ? 'Penerimaan' : 'Pengiriman'} Kas: ${description}`,
        'Adjustment',
        txId,
        txType === 'In' ? [{ accountCode: bankAccountCode, amount }] : [{ accountCode: targetAccountCode, amount }],
        txType === 'In' ? [{ accountCode: targetAccountCode, amount }] : [{ accountCode: bankAccountCode, amount }],
        now
      )

      if (success) {
        toast.success("Transaksi Kas Berhasil Dicatat!", { id: loadingToast })
        setIsAddTxOpen(false)
        // Reset
        setAmount(0)
        setTxDate(new Date().toISOString().split('T')[0])
        setDescription('')
        setCounterpart('')
        setCategory('')
        setCicilanPokok(0)
      } else {
        toast.error("Gagal mencatat jurnal kas.", { id: loadingToast })
      }
    } catch (e: any) {
      toast.error("Gagal mencatat transaksi: " + e.message, { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Management Kas & Bank</h2>
          <p className="text-muted-foreground italic">Pantau saldo akun bank dan catat transaksi finansial harian.</p>
        </div>
        <div className="flex gap-2">
           <Dialog open={isAddBankOpen} onOpenChange={setIsAddBankOpen}>
              <DialogTrigger render={
                 <Button variant="outline" className="rounded-xl h-11 px-6 font-bold uppercase text-[10px] tracking-widest border-slate-200">
                    <Building2 className="w-4 h-4 mr-2" /> Daftar Bank Baru
                 </Button>
              } />
              <DialogContent className="rounded-[2rem] p-8 max-w-sm">
                 <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase text-slate-800 tracking-tight text-center mb-4">Registrasi Akun Kas/Bank</DialogTitle>
                 </DialogHeader>
                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Nama Bank / Laci</label>
                       <Input value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} placeholder="Misal: Bank Mandiri / Petty Cash" className="rounded-xl h-12 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">No Rekening (pasti/opsional)</label>
                       <Input value={bankForm.number} onChange={e => setBankForm({ ...bankForm, number: e.target.value })} placeholder="000-XXXXXXXX" className="rounded-xl h-12 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Saldo Awal (Rp)</label>
                       <Input type="number" value={bankForm.balance} onChange={e => setBankForm({ ...bankForm, balance: Number(e.target.value) })} className="rounded-xl h-12 font-black text-emerald-600 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Link ke Buku Besar (COA)</label>
                        <Select value={bankForm.accountCode} onValueChange={(val) => setBankForm({ ...bankForm, accountCode: val || '' })}>
                           <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                              <SelectValue placeholder="Pilih Akun" />
                           </SelectTrigger>
                           <SelectContent>
                              {coas.filter(c => c.accountType === 'Asset' && c.accountCode.startsWith('1-1')).map(c => (
                                 <SelectItem key={c.id} value={c.accountCode}>
                                    {c.accountCode} - {c.accountName}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleCreateBank} disabled={isSubmitting} className="w-full h-14 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
                       {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buka Akun Kas/Bank"}
                    </Button>
                 </div>
              </DialogContent>
           </Dialog>

           <Dialog open={isAddTxOpen} onOpenChange={(open) => {
              setIsAddTxOpen(open)
              if (!open) {
                setAmount(0); setCategory(''); setDescription(''); setCounterpart('')
                setCicilanPokok(0); setReceiptUrl(''); setTargetBankId('')
                setTxDate(new Date().toISOString().split('T')[0])
              }
           }}>
              <DialogTrigger render={
                 <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200 dark:shadow-none h-11 px-6 rounded-xl">
                    <Plus className="w-4 h-4 mr-1" /> Catat Kas Masuk/Keluar
                 </Button>
              } />
              <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
                 <DialogHeader>
                    <DialogTitle className="text-2xl font-black">Input Transaksi Kas</DialogTitle>
                 </DialogHeader>
                  <div className="space-y-4 py-2">
                     <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                        <Button 
                           variant={txType === 'In' ? 'default' : 'ghost'} 
                           className={`flex-1 rounded-lg font-bold ${txType === 'In' ? 'bg-emerald-600 shadow-md' : 'text-slate-500'}`}
                           onClick={() => setTxType('In')}
                        >
                           <ArrowDownRight className="w-4 h-4 mr-1" /> Kas Masuk
                        </Button>
                        <Button 
                           variant={txType === 'Out' ? 'default' : 'ghost'} 
                           className={`flex-1 rounded-lg font-bold ${txType === 'Out' ? 'bg-rose-600 shadow-md' : 'text-slate-500'}`}
                           onClick={() => setTxType('Out')}
                        >
                           <ArrowUpRight className="w-4 h-4 mr-1" /> Kas Keluar
                        </Button>
                        <Button 
                           variant={txType === 'Transfer' ? 'default' : 'ghost'} 
                           className={`flex-1 rounded-lg font-bold ${txType === 'Transfer' ? 'bg-indigo-600 shadow-md text-white' : 'text-slate-500'}`}
                           onClick={() => setTxType('Transfer')}
                        >
                           <Landmark className="w-4 h-4 mr-1" /> Pindah Buku
                        </Button>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label>{txType === 'Transfer' ? 'Pilih Akun Sumber' : 'Pilih Akun Bank'}</Label>
                           <Select value={bankId} onValueChange={(val) => setBankId(val || '')}>
                              <SelectTrigger className="h-12 rounded-xl">
                                 <SelectValue placeholder="Pilih Bank">
                                    {bankAccounts.find(b => b.id === bankId)?.name}
                                 </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                 {bankAccounts.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                           {txType === 'Transfer' ? (
                              <>
                                 <Label>Pilih Akun Tujuan</Label>
                                 <Select value={targetBankId} onValueChange={(val) => setTargetBankId(val || '')}>
                                    <SelectTrigger className="h-12 rounded-xl">
                                       <SelectValue placeholder="Pilih Bank Tujuan">
                                          {bankAccounts.find(b => b.id === targetBankId)?.name}
                                       </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                       {bankAccounts.filter(b => b.id !== bankId).map(b => (
                                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                       ))}
                                    </SelectContent>
                                 </Select>
                              </>
                           ) : (
                              <>
                                 <Label>Kategori {txType === 'In' ? 'Penerimaan' : 'Tujuan'}</Label>
                                 <Select value={category} onValueChange={(val) => setCategory(val || '')}>
                                    <SelectTrigger className="h-12 rounded-xl">
                                       <SelectValue placeholder="Pilih Kategori">
                                          {category}
                                       </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                       {txType === 'In' ? (
                                          <>
                                             <SelectItem value="Pelunasan Piutang">💰 Pelunasan Piutang (AR)</SelectItem>
                                             <SelectItem value="Penjualan Tunai">🛒 Penjualan Tunai</SelectItem>
                                             <SelectItem value="Investasi">📈 Investasi Masuk</SelectItem>
                                             <SelectItem value="Pinjaman">🏦 Pinjaman Bank</SelectItem>
                                             <SelectItem value="Refund Vendor">🔄 Refund Vendor</SelectItem>
                                             <SelectItem value="Pendapatan Lainnya">➕ Pendapatan Lain-lain</SelectItem>
                                          </>
                                       ) : (
                                          <>
                                             <SelectItem value="Belanja Barang (HPP)">🛒 Belanja Barang (HPP)</SelectItem>
                                             <SelectItem value="Beban Gaji">👥 Beban Gaji Karyawan</SelectItem>
                                             <SelectItem value="Sewa Gedung">🏢 Sewa Gedung/Gudang</SelectItem>
                                             <SelectItem value="Listrik/Air">🔌 Listrik, Air & Internet</SelectItem>
                                             <SelectItem value="Marketing">📢 Marketing & Iklan</SelectItem>
                                             <SelectItem value="Perbaikan">🛠️ Perbaikan & Pemeliharaan</SelectItem>
                                             <SelectItem value="Bensin/Transport">⛽ Bensin & Transport</SelectItem>
                                             <SelectItem value="Konsumsi">🍱 Konsumsi / Makan</SelectItem>
                                             <SelectItem value="ATK/Kantor">📝 ATK & Kebutuhan Kantor</SelectItem>
                                             <SelectItem value="Inventaris Kantor">🪑 Inventaris & Furnitur Kantor</SelectItem>
                                             <SelectItem value="Biaya Admin">📉 Beban Admin & Provisi</SelectItem>
                                             <SelectItem value="Pajak">🏛️ Pajak Negara</SelectItem>
                                             <SelectItem value="Cicilan Pinjaman">🏦 Cicilan Pinjaman (Utang)</SelectItem>
                                             <SelectItem value="Lainnya">🧩 Pengeluaran Lainnya</SelectItem>
                                          </>
                                       )}
                                    </SelectContent>
                                 </Select>
                              </>
                           )}
                        </div>
                     </div>

                     <div className="space-y-2">
                        <Label>Tanggal Transaksi</Label>
                        <Input
                           type="date"
                           className="h-12 rounded-xl"
                           value={txDate}
                           onChange={(e) => setTxDate(e.target.value)}
                        />
                     </div>

                     <div className="space-y-2">
                        <Label>Nominal (Rp)</Label>
                        <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                           <Input
                              type="text"
                              className={`h-12 pl-12 text-2xl font-black rounded-2xl border-2 tracking-tight ${txType === 'In' ? 'text-emerald-600 border-emerald-100' : txType === 'Transfer' ? 'text-indigo-600 border-indigo-100' : 'text-rose-600 border-rose-100'}`}
                              value={formatNumber(amount)}
                              onChange={(e) => setAmount(parseNumber(e.target.value))}
                           />
                        </div>
                     </div>

                     {category === 'Cicilan Pinjaman' && txType === 'Out' && (
                        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
                           <p className="text-xs font-black text-amber-700 uppercase tracking-widest">📋 Rincian Cicilan Pinjaman</p>
                           <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                 <Label className="text-xs text-amber-700">Bagian Pokok (Rp)</Label>
                                 <Input
                                    type="text"
                                    className="h-10 rounded-xl border-amber-300 font-bold"
                                    placeholder="0"
                                    value={formatNumber(cicilanPokok)}
                                    onChange={(e) => setCicilanPokok(parseNumber(e.target.value))}
                                 />
                              </div>
                              <div className="space-y-1">
                                 <Label className="text-xs text-amber-700">Bagian Bunga (auto)</Label>
                                 <div className="h-10 rounded-xl border border-amber-200 bg-amber-100 px-3 flex items-center font-bold text-amber-800 text-sm">
                                    {formatRupiah(Math.max(0, amount - cicilanPokok))}
                                 </div>
                              </div>
                           </div>
                           <p className="text-[10px] text-amber-600">Pokok kurangi utang di neraca. Bunga masuk beban P&L.</p>
                        </div>
                     )}

                     {txType !== 'Transfer' ? (
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label>{txType === 'In' ? 'Diterima Dari' : 'Dibayarkan Kepada'}</Label>
                           <Input className="h-12 rounded-xl" placeholder="Nama instansi/orang" value={counterpart} onChange={(e) => setCounterpart(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                           <Label>Keterangan Transaksi</Label>
                           <Input className="h-12 rounded-xl" placeholder="Detail transaksi..." value={description} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                     </div>
                     ) : (
                        <div className="space-y-2">
                           <Label>Keterangan Pindah Buku</Label>
                           <Input className="h-12 rounded-xl" placeholder="Alasan transfer..." value={description} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                     )}

                     <div className="space-y-2">
                        <ReceiptUpload 
                           label="Upload Bukti Struk / Transfer (Opsional)" 
                           onFileSelect={setReceiptUrl} 
                        />
                     </div>
                  </div>
                  <DialogFooter>
                     <Button 
                        className={`w-full h-12 font-black text-base rounded-2xl animate-in zoom-in-95 duration-200 ${txType === 'In' ? 'bg-emerald-600 hover:bg-emerald-700' : txType === 'Transfer' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                        onClick={handleSaveTx}
                        disabled={isSubmitting}
                     >
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : txType === 'Transfer' ? 'Simpan Transfer Internal' : `Simpan Transaksi ${txType === 'In' ? 'Masuk' : 'Keluar'}`}
                     </Button>
                  </DialogFooter>
               </DialogContent>
            </Dialog>
         </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         {bankAccounts.map(b => {
            const isSelected = selectedBankFilter === b.id;
            return (
            <Card
               key={b.id}
               onClick={() => setSelectedBankFilter(isSelected ? null : b.id)}
               className={`cursor-pointer transition-all duration-300 overflow-hidden group ${isSelected ? 'border-2 border-emerald-500 bg-emerald-50/30 shadow-md shadow-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/20' : 'border border-transparent shadow-md shadow-slate-100 dark:shadow-none hover:border-slate-200'}`}
            >
               <div className="p-3 relative">
                  <div className="flex justify-between items-start">
                     <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        {b.name.includes('Petty') ? <Wallet className="w-4 h-4 text-indigo-600" /> : <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                     </div>
                     <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold tracking-tighter opacity-70">
                           {b.accountNumber || 'PHYSICAL CASH'}
                        </Badge>
                        <div className="flex flex-row items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                           <Button
                             variant="ghost"
                             size="icon"
                             className="w-8 h-8 rounded-full text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"
                             onClick={(e) => { e.stopPropagation(); setEditingBank({ ...b }); }}
                           >
                             <Pencil className="w-3.5 h-3.5" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="w-8 h-8 rounded-full text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                             onClick={(e) => {
                               e.stopPropagation();
                               if (confirm(`Hapus akun ${b.name}? Data transaksi tidak akan hilang tapi link ke bank ini akan terputus.`)) {
                                 deleteBankAccount(b.id);
                               }
                             }}
                           >
                             <Trash2 className="w-3.5 h-3.5" />
                           </Button>
                        </div>
                     </div>
                  </div>
                  <div className="mt-2">
                     <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">{b.accountNumber || 'PHYSICAL CASH'}</p>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5 truncate">{b.name}</p>
                     <p className="text-lg font-black mt-0.5 tracking-tighter">{formatRupiah(b.balance)}</p>
                  </div>
                  <div className="absolute right-[-8px] bottom-[-8px] opacity-[0.04] group-hover:rotate-12 transition-all duration-500">
                     <Landmark className="w-14 h-14" />
                  </div>
               </div>
            </Card>
            )
         })}
      </div>

      {/* EDIT BANK DIALOG */}
      <Dialog open={!!editingBank} onOpenChange={(open) => !open && setEditingBank(null)}>
        <DialogContent className="rounded-[2.5rem] p-8 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-slate-800 tracking-tight text-center mb-4">Edit Info Akun</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Nama Bank</label>
              <Input 
                value={editingBank?.name || ''} 
                onChange={e => setEditingBank({ ...editingBank, name: e.target.value })} 
                className="rounded-xl h-12 text-center font-bold" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">No Rekening</label>
              <Input 
                value={editingBank?.accountNumber || ''} 
                onChange={e => setEditingBank({ ...editingBank, accountNumber: e.target.value })} 
                className="rounded-xl h-12 text-center" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Koreksi Saldo</label>
              <Input 
                type="number"
                value={editingBank?.balance || 0} 
                onChange={e => setEditingBank({ ...editingBank, balance: Number(e.target.value) })} 
                className="rounded-xl h-12 text-center font-black text-emerald-600" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1 text-center block">Link ke Buku Besar (COA)</label>
              <Select value={editingBank?.accountCode || ''} onValueChange={(val) => setEditingBank({ ...editingBank, accountCode: val || '' })}>
                <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                  <SelectValue placeholder="Pilih Akun" />
                </SelectTrigger>
                <SelectContent>
                  {coas.filter(c => c.accountType === 'Asset' && c.accountCode.startsWith('1-1')).map(c => (
                    <SelectItem key={c.id} value={c.accountCode}>
                      {c.accountCode} - {c.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Adjustment Category Logic */}
            {editingBank && (Number(editingBank.balance) !== (bankAccounts.find(b => b.id === editingBank.id)?.balance || 0)) && (
              <div className="space-y-2 p-4 bg-amber-50 rounded-2xl border border-amber-100 animate-in fade-in slide-in-from-top-2">
                <label className="text-[10px] font-black uppercase text-amber-600 tracking-widest block text-center">Deteksi Selisih Saldo!</label>
                <p className="text-[9px] text-amber-500 font-bold text-center leading-tight mb-2">
                  Saldo berubah {formatRupiah(Math.abs(Number(editingBank.balance) - (bankAccounts.find(b => b.id === editingBank.id)?.balance || 0)))}. <br />
                  Kemana selisih ini dicatat di Buku Besar?
                </p>
                <Select value={editingBank.adjCategory || ''} onValueChange={(val) => setEditingBank({ ...editingBank, adjCategory: val || '' })}>
                  <SelectTrigger className="h-10 rounded-xl bg-white border-amber-200 text-amber-900 font-black text-xs uppercase shadow-sm">
                    <SelectValue placeholder="Pilih Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {Number(editingBank.balance) > (bankAccounts.find(b => b.id === editingBank.id)?.balance || 0) ? (
                      <>
                        <SelectItem value="Investasi">📈 Modal / Investasi Owner</SelectItem>
                        <SelectItem value="Pendapatan">➕ Pendapatan Lainnya</SelectItem>
                        <SelectItem value="Pinjaman">🏦 Tambahan Pinjaman</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Beban">📉 Beban Ops / Selisih Kas</SelectItem>
                        <SelectItem value="Prive">💸 Prive / Ambil Pribadi</SelectItem>
                        <SelectItem value="Pajak">🏛️ Biaya Admin / Pajak</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleUpdateBank} disabled={isSubmitting} className="w-full h-14 bg-emerald-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan Perubahan"}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!editingBank) return
                if (!confirm(`Hapus akun "${editingBank.name}"?\n\nSyarat:\n• Saldo HARUS 0\n• Tidak boleh ada cash transaction yang terhubung\n\nLanjutkan?`)) return
                try {
                  await deleteBankAccount(editingBank.id)
                  toast.success(`Akun ${editingBank.name} dihapus.`)
                  setEditingBank(null)
                } catch (err: any) {
                  toast.error(err?.message || 'Gagal hapus akun')
                }
              }}
              className="w-full h-12 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-[1.25rem] font-black uppercase text-[10px] tracking-widest mt-2 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Hapus Akun Bank
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-xl shadow-slate-200 dark:shadow-none mt-8 rounded-3xl overflow-hidden">
         <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b py-6 px-8">
            <div className="flex justify-between items-center">
               <div>
                  <CardTitle className="text-xl font-black flex items-center gap-2">
                     <History className="w-5 h-5 text-emerald-600" />
                     History Transaksi Kas
                     {selectedBankFilter && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 ml-2 animate-in fade-in zoom-in">
                           Bank: {bankAccounts.find(b => b.id === selectedBankFilter)?.name}
                        </Badge>
                     )}
                     {selectedCategoryFilter && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 ml-2 animate-in fade-in zoom-in">
                           Kategori: {formatCategory(selectedCategoryFilter)}
                        </Badge>
                     )}
                  </CardTitle>
                  <CardDescription>Semua mutasi masuk dan keluar tervalidasi.</CardDescription>
               </div>
               <div className="flex items-center gap-4">
                  {selectedTxIds.length > 0 && (
                     <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                        <span className="text-xs font-bold text-slate-500">{selectedTxIds.length} terpilih</span>
                        <Button 
                           variant="destructive" 
                           size="sm" 
                           className="h-8 rounded-lg px-3 font-bold text-[10px] uppercase tracking-wider"
                           onClick={() => setIsBulkDeleteConfirmOpen(true)}
                        >
                           <Trash2 className="w-3 h-3 mr-1" /> Hapus Massal
                        </Button>
                     </div>
                  )}
                  <div className="w-56">
                     <Select 
                        value={selectedCategoryFilter || "all"} 
                        onValueChange={(val) => setSelectedCategoryFilter(val === "all" ? null : val)}
                     >
                        <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                           <SelectValue placeholder="Semua Kategori" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                           <SelectItem value="all">📁 Semua Kategori</SelectItem>
                           {uniqueCategories.map((cat) => (
                              <SelectItem key={cat} value={cat} className="text-xs">
                                 {formatCategory(cat)}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="w-48">
                     <Select 
                        value={sortOrder} 
                        onValueChange={(val) => setSortOrder(val as 'desc' | 'asc')}
                     >
                        <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-xs font-semibold">
                           <SelectValue placeholder="Urutkan Waktu" />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="desc" className="text-xs">🕒 Terbaru ke Terlama</SelectItem>
                           <SelectItem value="asc" className="text-xs">🕒 Terlama ke Terbaru</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="relative w-72">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                     <Input 
                       placeholder="Cari transaksi..." 
                       className="pl-9 h-10 bg-white dark:bg-slate-950 rounded-xl text-xs"
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                     />
                  </div>
               </div>
            </div>
         </CardHeader>
         <CardContent className="p-0">
            <Table>
               <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b">
                  <TableRow>
                     <TableHead className="w-12 px-8">
                        <Checkbox 
                          checked={selectedTxIds.length === filteredTxs.length && filteredTxs.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedTxIds(filteredTxs.map(tx => tx.id))
                            else setSelectedTxIds([])
                          }}
                        />
                     </TableHead>
                     <TableHead className="w-32 px-4">Tgl & Bank</TableHead>
                     <TableHead>Deskripsi & Info</TableHead>
                     <TableHead>Kategori</TableHead>
                     <TableHead className="text-right px-8">Jumlah</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {filteredTxs.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                           Belum ada transaksi kas yang dicatat.
                        </TableCell>
                     </TableRow>
                  ) : (
                     filteredTxs.map(tx => {
                        const bank = bankAccounts.find(b => b.id === tx.bankAccountId)
                        const isSelected = selectedTxIds.includes(tx.id)
                        return (
                           <TableRow key={tx.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors py-4 ${isSelected ? 'bg-emerald-50/50' : ''}`}>
                              <TableCell className="px-8">
                                 <Checkbox 
                                   checked={isSelected}
                                   onCheckedChange={(checked) => {
                                      if (checked) setSelectedTxIds([...selectedTxIds, tx.id])
                                      else setSelectedTxIds(selectedTxIds.filter(id => id !== tx.id))
                                   }}
                                 />
                              </TableCell>
                              <TableCell className="px-4 flex flex-col items-start gap-1">
                                 <span className="text-[10px] font-bold text-slate-400">{format(new Date(tx.date), 'dd/MM HH:mm')}</span>
                                 <Badge variant="secondary" className="text-[9px] font-black h-4 px-1.5 uppercase tracking-tighter bg-slate-100">
                                    {bank?.name || 'Bank'}
                                 </Badge>
                              </TableCell>
                              <TableCell>
                                 <div className="flex flex-col">
                                    <span className="font-bold text-sm">{tx.description}</span>
                                    <div className="flex flex-col gap-1 mt-1">
                                       {(() => {
                                          const isInternal = tx.category.toLowerCase().includes('uang muka') || tx.category.toLowerCase().includes('kembalian') || tx.category.toLowerCase().includes('pindah');
                                          const prefix = isInternal ? '🔄 Pindah Saldo Ke/Dari:' : (tx.type === 'In' ? '📥 Sumber Dana:' : '📤 Tujuan Kas Keluar:');
                                          return (
                                             <span className={`text-[10px] font-bold ${isInternal ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                {prefix} {tx.counterpartName || (isInternal ? 'Akun Internal' : 'Pihak Eksternal')}
                                             </span>
                                          )
                                       })()}
                                       {tx.receiptUrl && (
                                          <Dialog>
                                             <DialogTrigger render={
                                                <button className="text-[10px] text-emerald-600 font-bold hover:underline flex items-center gap-1 w-max">
                                                   <Receipt className="w-3 h-3" /> Lihat Bukti
                                                </button>
                                             } />
                                             <DialogContent className="sm:max-w-md">
                                                <DialogHeader>
                                                   <DialogTitle>Bukti Transaksi - {tx.category}</DialogTitle>
                                                </DialogHeader>
                                                <div className="mt-4 border rounded-xl overflow-hidden bg-slate-50 min-h-[400px]">
                                                   {tx.receiptUrl.startsWith('data:application/pdf') ? (
                                                      <div className="flex flex-col h-[70vh]">
                                                         <iframe 
                                                            src={tx.receiptUrl} 
                                                            className="w-full h-full border-none"
                                                            title="PDF Delivery Note"
                                                         />
                                                         <div className="p-3 bg-white border-t flex justify-center">
                                                            <a href={tx.receiptUrl} download={`bukti-${tx.id}.pdf`} className="text-emerald-600 font-bold underline text-sm">Download PDF</a>
                                                         </div>
                                                      </div>
                                                   ) : (
                                                      <img src={tx.receiptUrl} alt="Receipt" className="w-full object-contain max-h-[70vh]" />
                                                   )}
                                                </div>
                                             </DialogContent>
                                          </Dialog>
                                       )}
                                    </div>
                                 </div>
                              </TableCell>
                              <TableCell>
                                 <div className="flex flex-col items-start gap-1.5">
                                    <Badge variant="outline" className={`text-[10px] font-bold uppercase ${tx.type === 'In' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                       {formatCategory(tx.category)}
                                    </Badge>
                                    {(() => {
                                       const isInternal = tx.category.toLowerCase().includes('uang muka') || tx.category.toLowerCase().includes('kembalian') || tx.category.toLowerCase().includes('pindah');
                                       const label = isInternal ? 'Transfer Internal' : (tx.type === 'In' ? 'Arus Kas Masuk' : 'Arus Kas Keluar');
                                       const color = isInternal ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : (tx.type === 'In' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-100 text-slate-500 border-slate-200');
                                       
                                       return (
                                          <Badge variant="outline" className={`text-[8.5px] font-black uppercase tracking-widest ${color}`}>
                                             {label}
                                          </Badge>
                                       )
                                    })()}
                                 </div>
                              </TableCell>
                              <TableCell className={`text-right px-8 font-black text-lg font-mono ${tx.type === 'In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 <div className="flex items-center justify-end gap-3">
                                    <span>{tx.type === 'In' ? '+' : '-'} {formatRupiah(tx.amount)}</span>
                                    <div className="flex items-center gap-1">
                                       <Button
                                          variant="ghost" size="icon"
                                          className="h-7 w-7 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                          onClick={() => setTxToDelete(tx.id)}
                                       >
                                          <Trash2 className="h-3.5 w-3.5" />
                                       </Button>
                                       <Button
                                          variant="ghost" size="icon"
                                          className="h-7 w-7 text-slate-400 hover:text-slate-700 shrink-0"
                                          onClick={() => setEditingTx({ ...tx })}
                                       >
                                          <Pencil className="h-3.5 w-3.5" />
                                       </Button>
                                    </div>
                                 </div>
                              </TableCell>
                           </TableRow>
                        )
                     })
                  )}
               </TableBody>
            </Table>
         </CardContent>
      </Card>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!txToDelete} onOpenChange={(open) => !open && setTxToDelete(null)}>
         <DialogContent className="rounded-[2rem] max-w-sm p-8">
            <DialogHeader className="items-center text-center">
               <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
               </div>
               <DialogTitle className="text-xl font-black uppercase tracking-tight">Hapus Transaksi?</DialogTitle>
               <DialogDescription className="font-bold text-slate-500 mt-2">
                  Tindakan ini akan menghapus riwayat transaksi dan **mengembalikan saldo bank** ke posisi sebelum transaksi ini terjadi.
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col mt-6">
               <Button variant="destructive" className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest" onClick={handleConfirmDelete} disabled={isSubmitting}>
                 {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ya, Hapus Sekarang"}
               </Button>
               <Button variant="ghost" className="w-full h-12 rounded-xl font-bold text-slate-400" onClick={() => setTxToDelete(null)} disabled={isSubmitting}>Batalkan</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION DIALOG */}
      <Dialog open={isBulkDeleteConfirmOpen} onOpenChange={setIsBulkDeleteConfirmOpen}>
         <DialogContent className="rounded-[2rem] max-w-sm p-8">
            <DialogHeader className="items-center text-center">
               <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                  <Trash2 className="w-8 h-8 text-rose-500" />
               </div>
               <DialogTitle className="text-xl font-black uppercase tracking-tight">Hapus {selectedTxIds.length} Transaksi?</DialogTitle>
               <DialogDescription className="font-bold text-slate-500 mt-2">
                  Anda akan menghapus {selectedTxIds.length} transaksi sekaligus. Saldo dari masing-masing akun bank terkait akan dikalkulasi ulang secara otomatis.
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col mt-6">
               <Button variant="destructive" className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest" onClick={handleBulkDelete} disabled={isSubmitting}>
                 {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hapus Semua Terpilih"}
               </Button>
               <Button variant="ghost" className="w-full h-12 rounded-xl font-bold text-slate-400" onClick={() => setIsBulkDeleteConfirmOpen(false)} disabled={isSubmitting}>Batalkan</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(open) => { if (!open) setEditingTx(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">Edit Transaksi</DialogTitle>
          </DialogHeader>
          {editingTx && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Akun Bank</Label>
                <Select value={editingTx.bankAccountId} onValueChange={(val) => setEditingTx({ ...editingTx, bankAccountId: val })}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue>{bankAccounts.find(b => b.id === editingTx.bankAccountId)?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={editingTx.category} onValueChange={(val) => setEditingTx({ ...editingTx, category: val })}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue>{editingTx.category}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {editingTx.type === 'In' ? (
                      <>
                        <SelectItem value="Pelunasan Piutang">Pelunasan Piutang (AR)</SelectItem>
                        <SelectItem value="Penjualan Tunai">Penjualan Tunai</SelectItem>
                        <SelectItem value="Investasi">Investasi Masuk</SelectItem>
                        <SelectItem value="Pinjaman">Pinjaman Bank</SelectItem>
                        <SelectItem value="Refund Vendor">Refund Vendor</SelectItem>
                        <SelectItem value="Pendapatan Lainnya">Pendapatan Lain-lain</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="Beban Gaji">Beban Gaji Karyawan</SelectItem>
                        <SelectItem value="Sewa Gedung">Sewa Gedung/Gudang</SelectItem>
                        <SelectItem value="Listrik/Air">Listrik & Air</SelectItem>
                        <SelectItem value="Marketing">Marketing & Iklan</SelectItem>
                        <SelectItem value="Bensin/Transport">Bensin & Transport</SelectItem>
                        <SelectItem value="ATK/Kantor">ATK & Kebutuhan Kantor</SelectItem>
                        <SelectItem value="Lainnya">Pengeluaran Lainnya</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nominal (Rp)</Label>
                  <Input
                    type="text" inputMode="numeric"
                    className="h-11 rounded-xl font-bold"
                    value={formatNumber(editingTx.amount)}
                    onChange={(e) => setEditingTx({ ...editingTx, amount: parseNumber(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{editingTx.type === 'In' ? 'Diterima Dari' : 'Dibayarkan Kepada'}</Label>
                  <Input
                    className="h-11 rounded-xl"
                    value={editingTx.counterpartName || ''}
                    onChange={(e) => setEditingTx({ ...editingTx, counterpartName: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Keterangan</Label>
                <Input
                  className="h-11 rounded-xl"
                  value={editingTx.description}
                  onChange={(e) => setEditingTx({ ...editingTx, description: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTx(null)} disabled={isSubmitting}>Batal</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveEditTx} disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</> : "Simpan Perubahan"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
