"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Plus, Trophy, AlertTriangle, Search, Trash2, CreditCard, Building2, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { format, differenceInDays, parseISO } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { formatRupiah, formatNumber, parseNumber } from "@/lib/utils"
import { createAccountingEntry } from "@/lib/accounting"
import { v4 as uuidv4 } from "uuid"
import type { VendorBill, VendorBillPayment } from "@/types"
import AuthGuard from "@/components/auth/AuthGuard"

type APBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'

const BUCKET_LABEL: Record<APBucket, string> = {
  'current': 'Belum Jatuh Tempo',
  '1-30': '1–30 hari',
  '31-60': '31–60 hari',
  '61-90': '61–90 hari',
  '90+': '90+ hari',
}

const BUCKET_COLOR: Record<APBucket, string> = {
  'current': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '1-30': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  '31-60': 'bg-orange-100 text-orange-700 border-orange-200',
  '61-90': 'bg-rose-100 text-rose-700 border-rose-200',
  '90+': 'bg-red-100 text-red-700 border-red-300',
}

function getBucket(days: number): APBucket {
  if (days <= 0) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

const BILL_CATEGORIES = [
  'Bahan Baku',
  'Operasional',
  'Inventaris',
  'Aset Tetap',
  'Jasa',
  'Lainnya',
]

export default function APAgingPage() {
  const vendors = useAppStore(s => s.vendors)
  const vendorBills = useAppStore(s => s.vendorBills)
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const addVendorBill = useAppStore(s => s.addVendorBill)
  const deleteVendorBill = useAppStore(s => s.deleteVendorBill)
  const payVendorBill = useAppStore(s => s.payVendorBill)
  const currentUser = useAppStore(s => s.currentUser)
  const isSyncing = useAppStore(s => s.isSyncing)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [payingBill, setPayingBill] = useState<VendorBill | null>(null)
  const [search, setSearch] = useState('')
  const [bucketFilter, setBucketFilter] = useState<'all' | APBucket>('all')

  // Add bill form
  const [fVendorId, setFVendorId] = useState('')
  const [fIssueDate, setFIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [fDueDate, setFDueDate] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fCategory, setFCategory] = useState('Bahan Baku')
  const [fAmount, setFAmount] = useState(0)

  // Payment form
  const [pAmount, setPAmount] = useState(0)
  const [pBankId, setPBankId] = useState('')
  const [pDate, setPDate] = useState(new Date().toISOString().split('T')[0])
  const [pNote, setPNote] = useState('')

  const resetAddForm = () => {
    setFVendorId(''); setFIssueDate(new Date().toISOString().split('T')[0])
    setFDueDate(''); setFDescription(''); setFCategory('Bahan Baku'); setFAmount(0)
  }
  const resetPayForm = () => {
    setPAmount(0); setPBankId(''); setPDate(new Date().toISOString().split('T')[0]); setPNote('')
  }

  // Compute aging
  const bills = useMemo(() => {
    const today = new Date()
    return vendorBills
      .filter(b => b.status !== 'Paid')
      .map(b => {
        const outstanding = b.totalAmount - (b.amountPaid || 0)
        const agingDays = differenceInDays(today, parseISO(b.dueDate))
        return { ...b, outstanding, agingDays, bucket: getBucket(agingDays) }
      })
      .sort((a, b) => b.agingDays - a.agingDays)
  }, [vendorBills])

  // TOP debt by vendor
  const topByVendor = useMemo(() => {
    const map: Record<string, { vendorId: string; vendorName: string; total: number; billCount: number; oldestAging: number }> = {}
    bills.forEach(b => {
      if (!map[b.vendorId]) {
        map[b.vendorId] = { vendorId: b.vendorId, vendorName: b.vendorName, total: 0, billCount: 0, oldestAging: b.agingDays }
      }
      map[b.vendorId].total += b.outstanding
      map[b.vendorId].billCount += 1
      if (b.agingDays > map[b.vendorId].oldestAging) map[b.vendorId].oldestAging = b.agingDays
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [bills])

  // Filtered bill list
  const filtered = useMemo(() => {
    return bills.filter(b => {
      if (bucketFilter !== 'all' && b.bucket !== bucketFilter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return b.vendorName.toLowerCase().includes(q) ||
        b.billNumber.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
    })
  }, [bills, search, bucketFilter])

  const totals = useMemo(() => {
    const t = { all: 0, current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    bills.forEach(b => {
      t.all += b.outstanding
      t[b.bucket] += b.outstanding
    })
    return t
  }, [bills])

  const totalOverdue = totals['1-30'] + totals['31-60'] + totals['61-90'] + totals['90+']
  const overdueCount = bills.filter(b => b.agingDays > 0).length

  // Map category → AP-debit COA when bill is created (the credit is always 2-1000 Utang Usaha)
  const categoryDebitCOA = (cat: string): string => {
    switch (cat) {
      case 'Bahan Baku': return '1-3000'    // Persediaan Barang Dagang
      case 'Operasional': return '6-9000'   // Beban Operasional Lainnya
      case 'Inventaris': return '1-4100'    // Inventaris & Furnitur Kantor
      case 'Aset Tetap': return '1-4000'    // Aset Tetap
      case 'Jasa': return '6-9000'
      default: return '6-9000'
    }
  }

  const handleAddBill = async () => {
    if (!fVendorId || !fDueDate || !fDescription || fAmount <= 0) {
      toast.error("Lengkapi semua field yang wajib."); return
    }
    const vendor = vendors.find(v => v.id === fVendorId)
    if (!vendor) { toast.error("Vendor tidak ditemukan"); return }
    const billId = uuidv4()
    const now = new Date().toISOString()
    const issueIso = new Date(fIssueDate).toISOString()
    const dueIso = new Date(fDueDate).toISOString()
    const billNumber = `VB-${format(new Date(), 'yyyyMM')}-${billId.slice(0, 6).toUpperCase()}`
    const loadingToast = toast.loading("Mencatat hutang vendor...")

    try {
      // 1. JE: Debit category account, Credit Utang Usaha (2-1000)
      const debitCOA = categoryDebitCOA(fCategory)
      const ok = await createAccountingEntry(
        `Hutang Vendor ${vendor.companyName}: ${fDescription}`,
        'Purchase',
        billId,
        [{ accountCode: debitCOA, amount: fAmount }],
        [{ accountCode: '2-1000', amount: fAmount }],
        issueIso
      )
      if (!ok) { toast.error("Gagal mencatat jurnal AP.", { id: loadingToast }); return }

      // 2. Add bill record
      const bill: VendorBill = {
        id: billId,
        billNumber,
        vendorId: fVendorId,
        vendorName: vendor.companyName,
        issueDate: issueIso,
        dueDate: dueIso,
        description: fDescription,
        category: fCategory,
        totalAmount: fAmount,
        amountPaid: 0,
        status: 'Unpaid',
        payments: [],
        createdAt: now,
        createdBy: currentUser?.id,
      }
      await addVendorBill(bill)

      toast.success("Hutang vendor dicatat!", { id: loadingToast })
      setIsAddOpen(false)
      resetAddForm()
    } catch (e: any) {
      toast.error("Gagal: " + e.message, { id: loadingToast })
    }
  }

  const handlePay = async () => {
    if (!payingBill) return
    if (!pBankId || pAmount <= 0) { toast.error("Pilih bank dan isi nominal."); return }
    if (pAmount > payingBill.outstanding + 1) {
      toast.error(`Pembayaran melebihi outstanding (${formatRupiah(payingBill.outstanding)})`); return
    }
    const bank = bankAccounts.find(b => b.id === pBankId)
    if (!bank) { toast.error("Bank tidak valid"); return }
    if (bank.balance < pAmount) {
      toast.error(`Saldo ${bank.name} tidak cukup. Saldo: ${formatRupiah(bank.balance)}`); return
    }
    const payId = uuidv4()
    const payIso = new Date(pDate).toISOString()
    const loadingToast = toast.loading("Mencatat pembayaran...")

    try {
      // JE: Debit Utang Usaha (2-1000), Credit Bank
      const ok = await createAccountingEntry(
        `Bayar Hutang ${payingBill.vendorName} (${payingBill.billNumber})`,
        'Payment',
        payId,
        [{ accountCode: '2-1000', amount: pAmount }],
        [{ accountCode: bank.accountCode || '1-1000', amount: pAmount }],
        payIso
      )
      if (!ok) { toast.error("Gagal mencatat jurnal pembayaran.", { id: loadingToast }); return }

      // Record payment + decrement bank
      const payment: VendorBillPayment = {
        id: payId, date: payIso, amount: pAmount, bankAccountId: pBankId, note: pNote,
      }
      await payVendorBill(payingBill.id, payment)

      // Also create a CashTransaction so it shows on cash-bank ledger
      const addCashTransaction = useAppStore.getState().addCashTransaction
      await addCashTransaction({
        id: payId,
        date: payIso,
        type: 'Out',
        amount: pAmount,
        bankAccountId: pBankId,
        category: 'Bayar Hutang Vendor',
        description: `${payingBill.vendorName} — ${payingBill.billNumber}`,
        counterpartName: payingBill.vendorName,
        referenceType: 'Manual',
      })

      toast.success("Pembayaran dicatat!", { id: loadingToast })
      setPayingBill(null)
      resetPayForm()
    } catch (e: any) {
      toast.error("Gagal: " + e.message, { id: loadingToast })
    }
  }

  const handleDelete = async (bill: VendorBill) => {
    if ((bill.amountPaid || 0) > 0) {
      toast.error("Hutang yang sudah ada pembayaran tidak dapat dihapus. Refund manual dulu."); return
    }
    if (!confirm(`Hapus hutang ${bill.vendorName} ${bill.billNumber}? Jurnal AP juga akan dihapus.`)) return
    const loadingToast = toast.loading("Menghapus hutang vendor...")
    try {
      // Reverse JE: Debit 2-1000, Credit category COA
      const debitCOA = categoryDebitCOA(bill.category || 'Operasional')
      await createAccountingEntry(
        `[REVERSAL] Hutang Vendor ${bill.vendorName}: ${bill.description}`,
        'Adjustment',
        `${bill.id}-reversal`,
        [{ accountCode: '2-1000', amount: bill.totalAmount }],
        [{ accountCode: debitCOA, amount: bill.totalAmount }],
        new Date().toISOString()
      )
      await deleteVendorBill(bill.id)
      toast.success("Dihapus.", { id: loadingToast })
    } catch (e: any) {
      toast.error("Gagal: " + e.message, { id: loadingToast })
    }
  }

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="p-4 md:p-8 max-w-[1500px] mx-auto space-y-6 pb-24">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white -mx-4 md:mx-0 p-6 md:p-8 md:rounded-[2.5rem] shadow-xl border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-600 text-white rounded-[1.5rem] flex items-center justify-center shadow-lg">
              <ClipboardList className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">AP Aging — Hutang Vendor</h1>
              <p className="text-sm text-slate-400 font-medium">Catat & track kewajiban ke supplier</p>
            </div>
          </div>
          <div className="flex gap-3 items-stretch">
            <div className="bg-purple-50 border border-purple-100 rounded-2xl px-5 py-3">
              <p className="text-[10px] font-black text-purple-700 uppercase tracking-widest">Total Hutang</p>
              {isSyncing ? (
                <div className="h-7 w-32 bg-purple-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-black text-purple-700">{formatRupiah(totals.all)}</p>
              )}
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl px-5 py-3">
              <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Overdue ({overdueCount})</p>
              {isSyncing ? (
                <div className="h-7 w-32 bg-rose-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-black text-rose-700">{formatRupiah(totalOverdue)}</p>
              )}
            </div>
            <Button onClick={() => setIsAddOpen(true)} className="bg-purple-600 hover:bg-purple-700 font-bold rounded-xl h-auto px-6">
              <Plus className="w-4 h-4 mr-1" /> Catat Hutang Vendor
            </Button>
          </div>
        </header>

        {/* Aging buckets */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['current', '1-30', '31-60', '61-90', '90+'] as APBucket[]).map(bucket => (
            <button
              key={bucket}
              onClick={() => setBucketFilter(bucketFilter === bucket ? 'all' : bucket)}
              className={`rounded-2xl border p-4 text-left transition-all ${BUCKET_COLOR[bucket]} ${bucketFilter === bucket ? 'ring-2 ring-offset-2 ring-slate-400' : 'hover:shadow-md'}`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{BUCKET_LABEL[bucket]}</p>
              <p className="text-lg font-black mt-1 tracking-tight">{formatRupiah(totals[bucket])}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* TOP debt vendor */}
          <Card className="lg:col-span-2 rounded-[2rem] border-slate-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <Trophy className="w-5 h-5 text-amber-500" /> TOP Hutang Vendor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {topByVendor.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada hutang vendor</p>
              )}
              {topByVendor.slice(0, 20).map((v, idx) => (
                <div key={v.vendorId} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{v.vendorName}</p>
                    <p className="text-xs text-slate-400">
                      {v.billCount} tagihan
                      {v.oldestAging > 0 && (
                        <span className="text-rose-500 font-bold ml-2">· terlama {v.oldestAging}h</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-purple-700">{formatRupiah(v.total)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Bills table */}
          <Card className="lg:col-span-3 rounded-[2rem] border-slate-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2 text-lg font-black">
                  <AlertTriangle className="w-5 h-5 text-rose-500" /> Daftar Hutang
                </CardTitle>
                <Badge className={bucketFilter !== 'all' ? `${BUCKET_COLOR[bucketFilter]}` : 'bg-slate-100 text-slate-600'}>
                  {bucketFilter === 'all' ? 'Semua' : BUCKET_LABEL[bucketFilter]}
                </Badge>
              </div>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Cari vendor, nomor, atau deskripsi..."
                    className="pl-9 rounded-xl h-10"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[10px] uppercase font-black tracking-wide">Vendor / Tagihan</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-wide">Jatuh Tempo</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-wide text-right">Outstanding</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-wide">Bucket</TableHead>
                    <TableHead className="text-[10px] uppercase font-black tracking-wide">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                        Tidak ada hutang vendor 🎉
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map(b => (
                    <TableRow key={b.id} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="font-bold text-sm">{b.vendorName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{b.billNumber}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{b.description}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-bold">{format(parseISO(b.dueDate), 'd MMM yy', { locale: localeId })}</div>
                        {b.agingDays > 0 ? (
                          <div className="text-[10px] text-rose-500 font-black">+{b.agingDays}h lewat</div>
                        ) : (
                          <div className="text-[10px] text-emerald-600 font-bold">sisa {Math.abs(b.agingDays)}h</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-black text-purple-700">{formatRupiah(b.outstanding)}</div>
                        {b.amountPaid > 0 && (
                          <div className="text-[10px] text-slate-400">paid {formatRupiah(b.amountPaid)}/{formatRupiah(b.totalAmount)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${BUCKET_COLOR[b.bucket]}`}>{BUCKET_LABEL[b.bucket]}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon" variant="ghost"
                            className="w-7 h-7 rounded-lg hover:bg-emerald-50 text-emerald-600"
                            onClick={() => { setPayingBill(b); setPAmount(b.outstanding) }}
                            title="Bayar"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="w-7 h-7 rounded-lg hover:bg-rose-50 text-rose-500"
                            onClick={() => handleDelete(b)}
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ADD BILL DIALOG */}
      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetAddForm() }}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Catat Hutang Vendor</DialogTitle>
            <DialogDescription>Buat AP entry. Jurnal akan dibuat otomatis: Debit kategori, Credit Utang Usaha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Select value={fVendorId} onValueChange={setFVendorId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Pilih vendor">
                      {vendors.find(v => v.id === fVendorId)?.companyName}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.length === 0 && <SelectItem value="__none__" disabled>Belum ada vendor</SelectItem>}
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue>{fCategory}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Tagihan</Label>
                <Input type="date" className="h-11 rounded-xl" value={fIssueDate} onChange={e => setFIssueDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Jatuh Tempo</Label>
                <Input type="date" className="h-11 rounded-xl" value={fDueDate} onChange={e => setFDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi Hutang</Label>
              <Input className="h-11 rounded-xl" placeholder="Belanja bahan baku 21 Mei, dll" value={fDescription} onChange={e => setFDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nominal Total (Rp)</Label>
              <Input
                type="text"
                className="h-12 rounded-xl text-xl font-black text-purple-700"
                placeholder="0"
                value={formatNumber(fAmount)}
                onChange={e => setFAmount(parseNumber(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-11 font-black rounded-xl bg-purple-600 hover:bg-purple-700" onClick={handleAddBill}>
              Simpan Hutang Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAY BILL DIALOG */}
      <Dialog open={!!payingBill} onOpenChange={(open) => { if (!open) { setPayingBill(null); resetPayForm() } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Bayar Hutang Vendor</DialogTitle>
            <DialogDescription>
              {payingBill && (
                <>
                  <span className="font-bold text-slate-700">{payingBill.vendorName}</span> · {payingBill.billNumber}
                  <br />Outstanding: <span className="font-black text-purple-700">{formatRupiah(payingBill.outstanding)}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Bayar Dari (Bank)</Label>
              <Select value={pBankId} onValueChange={setPBankId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Pilih bank">
                    {bankAccounts.find(b => b.id === pBankId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} — {formatRupiah(b.balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tanggal Bayar</Label>
                <Input type="date" className="h-11 rounded-xl" value={pDate} onChange={e => setPDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nominal (Rp)</Label>
                <Input
                  type="text"
                  className="h-11 rounded-xl font-bold"
                  placeholder="0"
                  value={formatNumber(pAmount)}
                  onChange={e => setPAmount(parseNumber(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Catatan (Opsional)</Label>
              <Input className="h-11 rounded-xl" placeholder="No referensi transfer, dll" value={pNote} onChange={e => setPNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-11 font-black rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={handlePay}>
              Simpan Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthGuard>
  )
}
