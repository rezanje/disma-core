"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Receipt, Search, TrendingDown, Building2, Calendar, Filter } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { createAccountingEntry } from "@/lib/accounting"
import ReceiptUpload from "@/components/ui/receipt-upload"
import { v4 as uuidv4 } from "uuid"
import AuthGuard from "@/components/auth/auth-guard"

const EXPENSE_CATEGORIES = [
  { value: 'Beban Gaji', label: '👥 Beban Gaji Karyawan', coa: '6-1000' },
  { value: 'Sewa Gedung', label: '🏢 Sewa Gedung/Gudang', coa: '6-1100' },
  { value: 'Listrik/Air', label: '🔌 Listrik, Air & Internet', coa: '6-1200' },
  { value: 'Marketing', label: '📢 Marketing & Iklan', coa: '6-1300' },
  { value: 'Bensin/Transport', label: '⛽ Bensin & Transport', coa: '6-1400' },
  { value: 'ATK/Kantor', label: '📝 ATK & Kebutuhan Kantor', coa: '6-1500' },
  { value: 'Inventaris Kantor', label: '🪑 Inventaris & Furnitur Kantor', coa: '1-4100' },
  { value: 'Perbaikan', label: '🛠️ Perbaikan & Pemeliharaan', coa: '6-9000' },
  { value: 'Konsumsi', label: '🍱 Konsumsi / Makan Tim', coa: '6-9000' },
  { value: 'Biaya Admin', label: '📉 Biaya Admin & Provisi Bank', coa: '6-1600' },
  { value: 'Pajak', label: '🏛️ Pajak Negara', coa: '2-3000' },
  { value: 'Cicilan Pinjaman', label: '🏦 Cicilan Pinjaman (Utang)', coa: 'special' },
  { value: 'Cuci/Perawatan', label: '🚗 Cuci & Perawatan Kendaraan', coa: '6-9000' },
  { value: 'Lainnya', label: '🧩 Pengeluaran Lainnya', coa: '6-9000' },
]

const CATEGORY_COLORS: Record<string, string> = {
  'Beban Gaji': 'bg-purple-100 text-purple-700',
  'Sewa Gedung': 'bg-orange-100 text-orange-700',
  'Listrik/Air': 'bg-yellow-100 text-yellow-700',
  'Marketing': 'bg-pink-100 text-pink-700',
  'Bensin/Transport': 'bg-blue-100 text-blue-700',
  'ATK/Kantor': 'bg-slate-100 text-slate-700',
  'Inventaris Kantor': 'bg-emerald-100 text-emerald-700',
  'Perbaikan': 'bg-red-100 text-red-700',
  'Konsumsi': 'bg-amber-100 text-amber-700',
  'Biaya Admin': 'bg-indigo-100 text-indigo-700',
  'Pajak': 'bg-rose-100 text-rose-700',
  'Cicilan Pinjaman': 'bg-cyan-100 text-cyan-700',
  'Cuci/Perawatan': 'bg-sky-100 text-sky-700',
  'Lainnya': 'bg-gray-100 text-gray-700',
}

export default function PengeluaranUmumPage() {
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const cashTransactions = useAppStore(s => s.cashTransactions)
  const addCashTransaction = useAppStore(s => s.addCashTransaction)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterBank, setFilterBank] = useState('')

  // Form state
  const [fDate, setFDate] = useState(new Date().toISOString().split('T')[0])
  const [fBankId, setFBankId] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fAmount, setFAmount] = useState(0)
  const [fDesc, setFDesc] = useState('')
  const [fCounterpart, setFCounterpart] = useState('')
  const [fReceipt, setFReceipt] = useState('')
  const [fPokok, setFPokok] = useState(0)

  // Filter: only show manual Out transactions (non-PO-linked)
  const expenseTxs = useMemo(() => {
    return cashTransactions
      .filter(tx =>
        tx.type === 'Out' &&
        tx.referenceType === 'Manual' &&
        tx.category !== 'Pindah Saldo Kas'
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [cashTransactions])

  const filtered = useMemo(() => {
    return expenseTxs.filter(tx => {
      const matchSearch = !search ||
        tx.description.toLowerCase().includes(search.toLowerCase()) ||
        tx.category.toLowerCase().includes(search.toLowerCase()) ||
        tx.counterpartName?.toLowerCase().includes(search.toLowerCase())
      const matchCat = !filterCat || tx.category === filterCat
      const matchBank = !filterBank || tx.bankAccountId === filterBank
      return matchSearch && matchCat && matchBank
    })
  }, [expenseTxs, search, filterCat, filterBank])

  const totalFiltered = filtered.reduce((sum, tx) => sum + tx.amount, 0)

  // Category breakdown for sidebar
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    expenseTxs.forEach(tx => {
      map[tx.category] = (map[tx.category] || 0) + tx.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenseTxs])

  const resetForm = () => {
    setFDate(new Date().toISOString().split('T')[0])
    setFBankId(''); setFCategory(''); setFAmount(0)
    setFDesc(''); setFCounterpart(''); setFReceipt(''); setFPokok(0)
  }

  const handleSave = async () => {
    if (!fBankId || !fCategory || fAmount <= 0 || !fDesc) {
      toast.error("Lengkapi semua field yang wajib.")
      return
    }
    const bank = bankAccounts.find(b => b.id === fBankId)
    const bankCode = bank?.accountCode || '1-1000'
    const catDef = EXPENSE_CATEGORIES.find(c => c.value === fCategory)
    const now = new Date(fDate).toISOString()
    const txId = uuidv4()
    const loadingToast = toast.loading("Mencatat pengeluaran...")

    try {
      let jeSuccess = false
      if (fCategory === 'Cicilan Pinjaman') {
        const bunga = Math.max(0, fAmount - fPokok)
        if (fPokok <= 0 || fPokok > fAmount) {
          toast.error("Bagian pokok tidak valid.", { id: loadingToast }); return
        }
        // JE first — only commit cash tx if JE succeeds
        const debits = [
          { accountCode: '2-4000', amount: fPokok },
          ...(bunga > 0 ? [{ accountCode: '6-3000', amount: bunga }] : [])
        ]
        jeSuccess = await createAccountingEntry(
          `Cicilan Pinjaman: ${fDesc}`, 'Adjustment', txId,
          debits, [{ accountCode: bankCode, amount: fAmount }], now
        )
        if (!jeSuccess) { toast.error("Gagal mencatat jurnal cicilan.", { id: loadingToast }); return }
        await addCashTransaction({
          id: txId, date: now, type: 'Out', amount: fAmount, bankAccountId: fBankId,
          category: fCategory, description: fDesc, counterpartName: fCounterpart,
          receiptUrl: fReceipt, referenceType: 'Manual'
        })
      } else {
        const coaCode = catDef?.coa || '6-9000'
        // JE first
        jeSuccess = await createAccountingEntry(
          `Pengeluaran Umum: ${fDesc}`, 'Adjustment', txId,
          [{ accountCode: coaCode, amount: fAmount }],
          [{ accountCode: bankCode, amount: fAmount }], now
        )
        if (!jeSuccess) { toast.error("Gagal mencatat jurnal.", { id: loadingToast }); return }
        await addCashTransaction({
          id: txId, date: now, type: 'Out', amount: fAmount, bankAccountId: fBankId,
          category: fCategory, description: fDesc, counterpartName: fCounterpart,
          receiptUrl: fReceipt, referenceType: 'Manual'
        })
      }
      toast.success("Pengeluaran berhasil dicatat!", { id: loadingToast })
      setIsAddOpen(false)
      resetForm()
    } catch (e: any) {
      toast.error("Gagal: " + e.message, { id: loadingToast })
    }
  }

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6 pb-24">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white -mx-4 md:mx-0 p-6 md:p-8 md:rounded-[2.5rem] shadow-xl border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg">
              <TrendingDown className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pengeluaran Umum</h1>
              <p className="text-sm text-slate-400 font-medium">Overhead & biaya non-orderan</p>
            </div>
          </div>
          <Button
            onClick={() => setIsAddOpen(true)}
            className="bg-rose-600 hover:bg-rose-700 font-bold shadow-lg h-11 px-6 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-1" /> Catat Pengeluaran
          </Button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Category breakdown sidebar */}
          <div className="md:col-span-1 space-y-3">
            <Card className="rounded-[1.5rem] border-slate-100 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black text-slate-500 uppercase tracking-widest">Per Kategori</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byCategory.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Belum ada data</p>
                )}
                {byCategory.map(([cat, total]) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all text-xs font-bold flex justify-between items-center ${filterCat === cat ? 'ring-2 ring-rose-400 bg-rose-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className={`px-2 py-0.5 rounded-lg ${CATEGORY_COLORS[cat] || 'bg-gray-100 text-gray-700'}`}>{cat}</span>
                    <span className="text-slate-600 font-black">{formatRupiah(total)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main table */}
          <div className="md:col-span-3 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Cari deskripsi, kategori..."
                  className="pl-9 rounded-xl h-10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterBank} onValueChange={v => setFilterBank(!v || v === 'all' ? '' : v)}>
                <SelectTrigger className="h-10 rounded-xl w-48">
                  <SelectValue placeholder="Semua Bank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Bank</SelectItem>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary bar */}
            <div className="bg-rose-50 border border-rose-100 rounded-2xl px-5 py-3 flex justify-between items-center">
              <span className="text-sm font-bold text-rose-700">{filtered.length} transaksi</span>
              <span className="text-lg font-black text-rose-700">{formatRupiah(totalFiltered)}</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-black text-xs uppercase tracking-wide">Tanggal</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wide">Kategori</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wide">Keterangan</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wide">Bank</TableHead>
                    <TableHead className="font-black text-xs uppercase tracking-wide text-right">Nominal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-16 text-slate-400 italic">
                        Belum ada pengeluaran umum. Klik "Catat Pengeluaran" untuk tambah.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(tx => {
                    const bank = bankAccounts.find(b => b.id === tx.bankAccountId)
                    return (
                      <TableRow key={tx.id} className="hover:bg-slate-50">
                        <TableCell className="text-xs text-slate-500 font-medium whitespace-nowrap">
                          {format(new Date(tx.date), 'd MMM yy', { locale: localeId })}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${CATEGORY_COLORS[tx.category] || 'bg-gray-100 text-gray-700'}`}>
                            {tx.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          <div>{tx.description}</div>
                          {tx.counterpartName && (
                            <div className="text-xs text-slate-400">{tx.counterpartName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-medium">{bank?.name || '-'}</TableCell>
                        <TableCell className="text-right font-black text-rose-600">{formatRupiah(tx.amount)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Catat Pengeluaran Umum</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank / Sumber Dana</Label>
                <Select value={fBankId} onValueChange={v => v && setFBankId(v)}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Pilih bank">{bankAccounts.find(b => b.id === fBankId)?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name} — {formatRupiah(b.balance)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={fCategory} onValueChange={v => v && setFCategory(v)}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Pilih kategori">{fCategory}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal</Label>
                <Input type="date" className="h-11 rounded-xl" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nominal (Rp)</Label>
                <Input
                  type="text"
                  className="h-11 rounded-xl font-bold text-rose-600 border-rose-100"
                  placeholder="0"
                  value={formatNumber(fAmount)}
                  onChange={e => setFAmount(parseNumber(e.target.value))}
                />
              </div>
            </div>

            {fCategory === 'Cicilan Pinjaman' && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest">📋 Rincian Cicilan</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-amber-700">Bagian Pokok</Label>
                    <Input
                      type="text" className="h-10 rounded-xl border-amber-300 font-bold"
                      placeholder="0"
                      value={formatNumber(fPokok)}
                      onChange={e => setFPokok(parseNumber(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-amber-700">Bagian Bunga (auto)</Label>
                    <div className="h-10 rounded-xl border border-amber-200 bg-amber-100 px-3 flex items-center font-bold text-amber-800 text-sm">
                      {formatRupiah(Math.max(0, fAmount - fPokok))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-amber-600">Pokok kurangi utang di neraca. Bunga masuk beban P&L.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Keterangan</Label>
                <Input className="h-11 rounded-xl" placeholder="Detail pengeluaran..." value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dibayarkan Kepada (opsional)</Label>
                <Input className="h-11 rounded-xl" placeholder="Nama vendor/instansi" value={fCounterpart} onChange={e => setFCounterpart(e.target.value)} />
              </div>
            </div>

            <ReceiptUpload label="Upload Bukti (Opsional)" onFileSelect={setFReceipt} />
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11 font-black rounded-xl bg-rose-600 hover:bg-rose-700"
              onClick={handleSave}
            >
              Simpan Pengeluaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthGuard>
  )
}
