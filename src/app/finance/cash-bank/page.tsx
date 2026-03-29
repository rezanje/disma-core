"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Minus, Landmark, ArrowUpRight, ArrowDownRight, Search, History, Wallet, Wallet2, Building2, Receipt, FileText, Pencil, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { v4 as uuidv4 } from "uuid"
import { createAccountingEntry } from "@/lib/accounting"
import ReceiptUpload from "@/components/ui/receipt-upload"

export default function CashAndBankPage() {
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const addBankAccount = useAppStore(state => state.addBankAccount)
  const updateBankAccount = useAppStore(state => state.updateBankAccount)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  const addCashTransaction = useAppStore(state => state.addCashTransaction)
  const coas = useAppStore(state => state.coas)

  const [isAddTxOpen, setIsAddTxOpen] = useState(false)
  const [isAddBankOpen, setIsAddBankOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<any>(null)
  const [bankForm, setBankForm] = useState({ name: '', number: '', balance: 0, accountCode: '1-1000' })

  const [txType, setTxType] = useState<'In' | 'Out' | 'Transfer'>('In')
  const [bankId, setBankId] = useState('')
  const [targetBankId, setTargetBankId] = useState('')
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [counterpart, setCounterpart] = useState('')
  const [receiptUrl, setReceiptUrl] = useState('')
  const [searchTerm, setSearchTerm] = useState("")

  const [selectedBankFilter, setSelectedBankFilter] = useState<string | null>(null)

  const filteredTxs = cashTransactions.filter(tx => {
    const matchSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.counterpartName?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchBank = selectedBankFilter ? tx.bankAccountId === selectedBankFilter : true;
    return matchSearch && matchBank;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const handleCreateBank = () => {
    if (!bankForm.name) return toast.error("Nama bank harus diisi!")
    addBankAccount({
      id: `bank-${Date.now()}`,
      name: bankForm.name,
      accountNumber: bankForm.number,
      accountCode: bankForm.accountCode,
      balance: bankForm.balance
    })
    setIsAddBankOpen(false)
    setBankForm({ name: '', number: '', balance: 0, accountCode: '1-1000' })
    toast.success(`${bankForm.name} berhasil didaftarkan!`)
  }

  const handleUpdateBank = () => {
    if (!editingBank) return
    const original = bankAccounts.find(b => b.id === editingBank.id)
    if (!original) return

    const diff = Number(editingBank.balance) - original.balance
    
    // Create adjustment journal if balance changed
    if (diff !== 0) {
      if (!editingBank.adjCategory) {
        return toast.error("Pilih kategori penyesuaian untuk selisih saldo!")
      }

      let adjAccountCode = '6-9000' // Default other expense
      if (diff > 0) {
        // Increase: Debit Bank, Credit Source
        switch(editingBank.adjCategory) {
          case 'Investasi': adjAccountCode = '3-1000'; break;
          case 'Pendapatan': adjAccountCode = '4-2000'; break;
          case 'Pinjaman': adjAccountCode = '2-4000'; break;
          default: adjAccountCode = '3-1000';
        }
        createAccountingEntry(
          `Penyesuaian Saldo (Kenaikan): ${editingBank.name}`,
          'Adjustment',
          `adj-${Date.now()}`,
          [{ accountCode: editingBank.accountCode || '1-1000', amount: diff }],
          [{ accountCode: adjAccountCode, amount: diff }],
          new Date().toISOString()
        )
      } else {
        // Decrease: Debit Purpose, Credit Bank
        const absDiff = Math.abs(diff)
        switch(editingBank.adjCategory) {
          case 'Beban': adjAccountCode = '6-9000'; break;
          case 'Prive': adjAccountCode = '3-2000'; break;
          case 'Pajak': adjAccountCode = '6-9000'; break;
          default: adjAccountCode = '6-9000';
        }
        createAccountingEntry(
          `Penyesuaian Saldo (Penurunan): ${editingBank.name}`,
          'Adjustment',
          `adj-${Date.now()}`,
          [{ accountCode: adjAccountCode, amount: absDiff }],
          [{ accountCode: editingBank.accountCode || '1-1000', amount: absDiff }],
          new Date().toISOString()
        )
      }
    }

    updateBankAccount(editingBank.id, {
      name: editingBank.name,
      accountNumber: editingBank.accountNumber,
      accountCode: editingBank.accountCode,
      balance: Number(editingBank.balance)
    })
    setEditingBank(null)
    toast.success("Info bank & Jurnal penyesuaian berhasil diperbarui!")
  }

  const handleSaveTx = () => {
    if (txType === 'Transfer') {
      if (!bankId || !targetBankId || amount <= 0 || !description) {
        toast.error("Mohon lengkapi data transfer internal.")
        return
      }
      if (bankId === targetBankId) {
        toast.error("Akun sumber dan tujuan tidak boleh sama.")
        return
      }
      
      const txId = uuidv4()
      const now = new Date().toISOString()
      const sourceBank = bankAccounts.find(b => b.id === bankId)
      const targetBank = bankAccounts.find(b => b.id === targetBankId)
      
      // 1. Journal Entry (Debit Target, Credit Source)
      const sourceBankCode = sourceBank?.accountCode || '1-1000'
      const targetBankCode = targetBank?.accountCode || '1-1000'
      const success = createAccountingEntry(
        `Pindah Buku: ${description}`,
        'Transfer',
        txId,
        [{ accountCode: targetBankCode, amount }],
        [{ accountCode: sourceBankCode, amount }],
        now
      )

      if (success) {
        // Add OUT tx for source
        addCashTransaction({
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
        
        // Add IN tx for target
        addCashTransaction({
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
        
        toast.success("Transfer Internal Berhasil Dicatat!")
        setIsAddTxOpen(false)
        setAmount(0)
        setDescription('')
        setCounterpart('')
        setTargetBankId('')
      } else {
        toast.error("Gagal mencatat jurnal transfer.")
      }
      return;
    }

    if (!bankId || amount <= 0 || !category || !description) {
      toast.error("Mohon lengkapi semua data transaksi.")
      return
    }

    const txId = uuidv4()
    const now = new Date().toISOString()
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
        case 'Beban Gaji': targetAccountCode = '6-1000'; break;
        case 'Sewa Gedung': targetAccountCode = '6-1100'; break;
        case 'Listrik/Air': targetAccountCode = '6-1200'; break;
        case 'Marketing': targetAccountCode = '6-1300'; break;
        case 'Bensin/Transport': targetAccountCode = '6-1400'; break;
        case 'ATK/Kantor': targetAccountCode = '6-1400'; break; // db.json has 6-1400 for Transport & ATK
        default: targetAccountCode = '6-9000'; break;
      }
    }

    // 1. Add to store
    addCashTransaction({
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
    const bankAccountCode = bank?.accountCode || '1-1000'
    const success = createAccountingEntry(
      `${txType === 'In' ? 'Penerimaan' : 'Pengiriman'} Kas: ${description}`,
      'Adjustment',
      txId,
      txType === 'In' ? [{ accountCode: bankAccountCode, amount }] : [{ accountCode: targetAccountCode, amount }],
      txType === 'In' ? [{ accountCode: targetAccountCode, amount }] : [{ accountCode: bankAccountCode, amount }],
      now
    )

    if (success) {
      toast.success("Transaksi Kas Berhasil Dicatat!")
      setIsAddTxOpen(false)
      // Reset
      setAmount(0)
      setDescription('')
      setCounterpart('')
    } else {
      toast.error("Gagal mencatat jurnal kas.")
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
                    <Button onClick={handleCreateBank} className="w-full h-14 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
                       Buka Akun Kas/Bank
                    </Button>
                 </div>
              </DialogContent>
           </Dialog>

           <Dialog open={isAddTxOpen} onOpenChange={setIsAddTxOpen}>
              <DialogTrigger render={
                 <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200 dark:shadow-none h-11 px-6 rounded-xl">
                    <Plus className="w-4 h-4 mr-1" /> Catat Kas Masuk/Keluar
                 </Button>
              } />
              <DialogContent className="sm:max-w-xl">
                 <DialogHeader>
                    <DialogTitle className="text-2xl font-black">Input Transaksi Kas</DialogTitle>
                 </DialogHeader>
                  <div className="space-y-6 py-4">
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
                                             <SelectItem value="Beban Gaji">👥 Beban Gaji Karyawan</SelectItem>
                                             <SelectItem value="Sewa Gedung">🏢 Sewa Gedung/Gudang</SelectItem>
                                             <SelectItem value="Listrik/Air">🔌 Listrik & Air (Utilitas)</SelectItem>
                                             <SelectItem value="Marketing">📢 Marketing & Iklan</SelectItem>
                                             <SelectItem value="Perbaikan">🛠️ Perbaikan & Pemeliharaan</SelectItem>
                                             <SelectItem value="Bensin/Transport">⛽ Bensin & Transport</SelectItem>
                                             <SelectItem value="Konsumsi">🍱 Konsumsi / Makan</SelectItem>
                                             <SelectItem value="ATK/Kantor">📝 ATK & Kebutuhan Kantor</SelectItem>
                                             <SelectItem value="Biaya Admin">📉 Beban Admin & Provisi</SelectItem>
                                             <SelectItem value="Pajak">🏛️ Pajak Negara</SelectItem>
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
                        <Label>Nominal (Rp)</Label>
                        <div className="relative">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                           <Input 
                              type="text"
                              className={`h-16 pl-12 text-3xl font-black rounded-2xl border-2 tracking-tight ${txType === 'In' ? 'text-emerald-600 border-emerald-100' : txType === 'Transfer' ? 'text-indigo-600 border-indigo-100' : 'text-rose-600 border-rose-100'}`}
                              value={formatNumber(amount)}
                              onChange={(e) => setAmount(parseNumber(e.target.value))}
                           />
                        </div>
                     </div>

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
                        className={`w-full h-14 font-black text-lg rounded-2xl animate-in zoom-in-95 duration-200 ${txType === 'In' ? 'bg-emerald-600 hover:bg-emerald-700' : txType === 'Transfer' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                        onClick={handleSaveTx}
                     >
                        {txType === 'Transfer' ? 'Simpan Transfer Internal' : `Simpan Transaksi ${txType === 'In' ? 'Masuk' : 'Keluar'}`}
                     </Button>
                  </DialogFooter>
               </DialogContent>
            </Dialog>
         </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {bankAccounts.map(b => {
            const isSelected = selectedBankFilter === b.id;
            return (
            <Card 
               key={b.id} 
               onClick={() => setSelectedBankFilter(isSelected ? null : b.id)}
               className={`cursor-pointer transition-all duration-300 overflow-hidden group ${isSelected ? 'border-2 border-emerald-500 bg-emerald-50/30 shadow-md shadow-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/20' : 'border border-transparent shadow-lg shadow-slate-200 dark:shadow-none hover:border-slate-200'}`}
            >
               <div className="p-6 relative">
                  <div className="flex justify-between items-start">
                     <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        {b.name.includes('Petty') ? <Wallet className="w-6 h-6 text-indigo-600" /> : <Building2 className="w-6 h-6 text-slate-600 dark:text-slate-300" />}
                     </div>
                     <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold tracking-tighter opacity-70">
                           {b.accountNumber || 'PHYSICAL CASH'}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-8 h-8 rounded-full text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all opacity-0 group-hover:opacity-100"
                          onClick={() => setEditingBank({ ...b })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                     </div>
                  </div>
                  <div className="mt-4">
                     <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{b.name}</p>
                     <p className="text-3xl font-black mt-1 tracking-tighter group-hover:scale-105 transition-transform origin-left duration-300">
                        {formatRupiah(b.balance)}
                     </p>
                  </div>
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:rotate-12 transition-all duration-500">
                     <Landmark className="w-24 h-24" />
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
            <Button onClick={handleUpdateBank} className="w-full h-14 bg-emerald-600 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl mt-4">
              Simpan Perubahan
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
                           Filter: {bankAccounts.find(b => b.id === selectedBankFilter)?.name}
                        </Badge>
                     )}
                  </CardTitle>
                  <CardDescription>Semua mutasi masuk dan keluar tervalidasi.</CardDescription>
               </div>
               <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Filter transaksi..." 
                    className="pl-9 bg-white dark:bg-slate-950 rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
            </div>
         </CardHeader>
         <CardContent className="p-0">
            <Table>
               <TableHeader className="bg-slate-50 dark:bg-slate-900 border-b">
                  <TableRow>
                     <TableHead className="w-32 px-8">Tgl & Bank</TableHead>
                     <TableHead>Deskripsi & Info</TableHead>
                     <TableHead>Kategori</TableHead>
                     <TableHead className="text-right px-8">Jumlah</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {filteredTxs.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">
                           Belum ada transaksi kas yang dicatat.
                        </TableCell>
                     </TableRow>
                  ) : (
                     filteredTxs.map(tx => {
                        const bank = bankAccounts.find(b => b.id === tx.bankAccountId)
                        return (
                           <TableRow key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors py-4">
                              <TableCell className="px-8 flex flex-col items-start gap-1">
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
                                       {tx.category}
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
                                 {tx.type === 'In' ? '+' : '-'} {formatRupiah(tx.amount)}
                              </TableCell>
                           </TableRow>
                        )
                     })
                  )}
               </TableBody>
            </Table>
         </CardContent>
      </Card>
    </div>
  )
}
