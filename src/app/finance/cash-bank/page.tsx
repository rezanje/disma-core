"use client"

import Link from "next/link"
import { useState, useMemo, useRef } from "react"
import { useAppStore } from "@/lib/store"
import { tujuanTransaksi, tanpaRef } from "@/lib/tx-rujukan"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatBand } from "@/components/ui/stat-band"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Minus, Landmark, ArrowUpRight, ArrowDownRight, Search, History, Wallet, Wallet2, Building2, Receipt, FileText, Pencil, Settings2, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { formatRupiah, formatNumber, parseNumber, formatRupiahShort } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { v4 as uuidv4 } from "uuid"
import { recordCashTransfer, bankRequiresCfoApproval } from "@/lib/accounting"
import { recordManualCashCommand, recordBankOpeningCommand } from "@/lib/finance-commands"
import type { BankAccountPurpose } from "@/types"
import { computeBankBalances } from "@/lib/bank-balance"
import ReceiptUpload from "@/components/ui/receipt-upload"
import { Checkbox } from "@/components/ui/checkbox"
import { calculateLoanInterest, describeLoanInterest, loanPaymentDebits, type LoanInterestTerms } from "@/lib/loan-interest"

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
  const updateBankAccount = useAppStore(state => state.updateBankAccount)
  const deleteBankAccount = useAppStore(state => state.deleteBankAccount)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  // Balance derived from ledger (source of truth), not stored field — avoids lost-update race.
  const bankAccounts = useMemo(
    () => computeBankBalances(rawBankAccounts, cashTransactions),
    [rawBankAccounts, cashTransactions]
  )
  const coas = useAppStore(state => state.coas)
  const invoices = useAppStore(state => state.invoices)
  const salesOrders = useAppStore(state => state.salesOrders)
  const purchases = useAppStore(state => state.purchases)
  const users = useAppStore(state => state.users)

  // Bahan untuk menerjemahkan rujukan transaksi jadi nomor dokumen yang dikenal orang.
  const kamusRujukan = useMemo(
    () => ({ invoices, salesOrders, purchases }),
    [invoices, salesOrders, purchases],
  )

  const [isAddTxOpen, setIsAddTxOpen] = useState(false)
  const [isAddBankOpen, setIsAddBankOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<any>(null)
  const [bankForm, setBankForm] = useState<{ name: string; number: string; balance: number; accountCode: string; purpose: BankAccountPurpose; ownerUserId: string; cfoApprovalRequired: boolean }>({ name: '', number: '', balance: 0, accountCode: '1-1000', purpose: 'umum', ownerUserId: '', cfoApprovalRequired: false })

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
  const [loanMode, setLoanMode] = useState<LoanInterestTerms['mode']>('percent')
  const [loanPeriod, setLoanPeriod] = useState<LoanInterestTerms['period']>('monthly')
  const [loanValue, setLoanValue] = useState('')
  const [loanMonths, setLoanMonths] = useState('')
  const loanTerms: LoanInterestTerms = { mode: loanMode, period: loanPeriod, value: loanValue.trim() ? Number(loanValue.replace(',', '.')) : NaN, months: Number(loanMonths) }
  let loanEstimate: ReturnType<typeof calculateLoanInterest> | null = null
  try { loanEstimate = calculateLoanInterest(amount, loanTerms) } catch {}
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

  const pendingCash = useRef<{id:string;payload:string;date?:string}|null>(null)
  const pendingOpening = useRef<{id:string;payload:string;date?:string}|null>(null)
  const pendingAdjustment = useRef<{id:string;payload:string;date?:string}|null>(null)
  const cashBusy = useRef(false)
  const stableId = (attempt: {current:{id:string;payload:string;date?:string}|null}, payload: unknown) => {
    const encoded = JSON.stringify(payload)
    if (attempt.current && attempt.current.payload !== encoded) throw new Error('Percobaan sebelumnya belum terkonfirmasi. Ulangi data yang sama terlebih dahulu.')
    if (!attempt.current) attempt.current = {id:uuidv4(),payload:encoded,date:new Date().toISOString().slice(0,10)}
    return attempt.current.id
  }

  const handleCreateBank = async () => {
    if (cashBusy.current || !bankForm.name || !Number.isFinite(bankForm.balance) || bankForm.balance < 0) return toast.error('Isi nama dan saldo awal nol atau positif.')
    cashBusy.current = true; setIsSubmitting(true)
    try {
      const eventId = stableId(pendingOpening, bankForm)
      const ok = await recordBankOpeningCommand({eventId, bank:{id:`bank-${eventId}`,name:bankForm.name,accountNumber:bankForm.number,accountCode:bankForm.accountCode,purpose:bankForm.purpose,ownerUserId:bankForm.purpose==='sourcing_pocket'?bankForm.ownerUserId:undefined,cfoApprovalRequired:bankForm.cfoApprovalRequired,balance:0},amount:bankForm.balance,date:pendingOpening.current!.date!})
      if (!ok) throw new Error('Pembukaan bank belum terkonfirmasi; ulangi data yang sama.')
      pendingOpening.current=null; setIsAddBankOpen(false)
      setBankForm({name:'',number:'',balance:0,accountCode:'1-1000',purpose:'umum',ownerUserId:'',cfoApprovalRequired:false})
      toast.success('Bank dan saldo awal dicatat bersama.')
    } catch(e) { toast.error((e as Error).message) }
    finally {cashBusy.current=false;setIsSubmitting(false)}
  }

  const handleUpdateBank = async () => {
    if (cashBusy.current || !editingBank) return
    const original=bankAccounts.find(b=>b.id===editingBank.id)
    if (!original) return
    if (editingBank.accountCode!==original.accountCode && cashTransactions.some(tx=>tx.bankAccountId===original.id)) {toast.error('Kode akun bank yang sudah memiliki transaksi tidak dapat diganti.');return}
    const diff=Number(editingBank.balance)-original.balance
    if (!Number.isFinite(diff)) {toast.error('Saldo tidak valid.');return}
    cashBusy.current=true;setIsSubmitting(true)
    try {
      if(diff!==0) {
        if(!editingBank.adjCategory) throw new Error('Pilih kategori penyesuaian.')
        const eventId=stableId(pendingAdjustment,{id:original.id,balance:editingBank.balance,category:editingBank.adjCategory})
        const counterAccountCode=diff>0?({Investasi:'3-1000',Pendapatan:'4-2000',Pinjaman:'2-4000'} as Record<string,string>)[editingBank.adjCategory]:({Beban:'6-9000',Prive:'3-2000',Pajak:'6-9000'} as Record<string,string>)[editingBank.adjCategory]
        if(!counterAccountCode) throw new Error('Kategori penyesuaian tidak didukung.')
        const ok=await recordManualCashCommand({eventId,transaction:{id:eventId,date:pendingAdjustment.current!.date!,type:diff>0?'In':'Out',bankAccountId:original.id,amount:Math.abs(diff),category:`Penyesuaian: ${editingBank.adjCategory}`,description:`Penyesuaian saldo ${original.name}: ${editingBank.adjCategory}`,counterpartName:'Penyesuaian',referenceType:'Manual'},counterAccountCode})
        if(!ok) throw new Error('Penyesuaian belum terkonfirmasi; ulangi data yang sama.')
        pendingAdjustment.current=null
      }
      await updateBankAccount(original.id,{name:editingBank.name,accountNumber:editingBank.accountNumber,purpose:editingBank.purpose||'umum',ownerUserId:editingBank.purpose==='sourcing_pocket'?editingBank.ownerUserId:undefined,cfoApprovalRequired:!!editingBank.cfoApprovalRequired,accountCode:editingBank.accountCode})
      setEditingBank(null);toast.success('Informasi bank diperbarui.')
    } catch(e) {toast.error((e as Error).message)}
    finally {cashBusy.current=false;setIsSubmitting(false)}
  }

  const handleSaveEditTx = async () => {
    toast.error("Transaksi terposting harus dikoreksi dari sumbernya. Super Admin dapat memakai Koreksi Sumber untuk jenis penerimaan dan pembayaran yang didukung.")
  }

  const handleConfirmDelete = async () => {
    toast.error("Transaksi terposting harus dikoreksi dari sumbernya. Super Admin dapat memakai Koreksi Sumber untuk jenis penerimaan dan pembayaran yang didukung.")
  }

  const handleBulkDelete = async () => {
    toast.error("Transaksi terposting harus dikoreksi dari sumbernya. Super Admin dapat memakai Koreksi Sumber untuk jenis penerimaan dan pembayaran yang didukung.")
  }

  const handleSaveTx = async () => {
    if (cashBusy.current || isSubmitting) return
    if(!bankId || !Number.isFinite(amount) || amount<=0 || !description.trim() || !txDate) {toast.error('Lengkapi rekening, tanggal, nominal positif dan keterangan.');return}
    if(txType==='In' && category==='Pelunasan Piutang') {toast.error('Penerimaan piutang memerlukan alokasi invoice. Buka Piutang → Tagihan → Catat Bayar.');return}
    if((txType==='In' && ['Refund Vendor','Penjualan Tunai'].includes(category)) || (txType==='Out' && category==='Belanja Barang (HPP)')) {toast.error('Transaksi ini memerlukan sumber penjualan / pembelian / klaim retur. Gunakan alur sumber terkait agar tidak membukukan dua kali.');return}
    if(txType==='Transfer' && (!targetBankId || bankId===targetBankId)) {toast.error('Pilih rekening tujuan yang berbeda.');return}
    if(txType!=='In' && bankRequiresCfoApproval(bankId)) {toast.error('Rekening ini memerlukan persetujuan; gunakan alur Pindah Kas.');return}
    const counterAccounts:Record<string,string>={Investasi:'3-1000',Pinjaman:'2-4000','Pendapatan Lainnya':'4-2000','Beban Gaji':'6-1000','Sewa Gedung':'6-1100','Listrik/Air':'6-1200',Marketing:'6-1300','Bensin/Transport':'6-1400','ATK/Kantor':'6-1500','Inventaris Kantor':'1-4100',Perbaikan:'6-9000',Konsumsi:'6-9000','Biaya Admin':'6-1600',Pajak:'2-3000','Cicilan Pinjaman':'2-4000','Lainnya':'6-9000'}
    if(txType!=='Transfer' && !counterAccounts[category]) {toast.error('Pilih kategori yang didukung.');return}
    cashBusy.current=true;setIsSubmitting(true)
    try {
      let savedDescription=description
      if(txType==='In' && category==='Pinjaman') savedDescription+=`\n${describeLoanInterest(amount,loanTerms)}`
      const eventId=stableId(pendingCash,{txType,bankId,targetBankId,amount,txDate,category,description:savedDescription,counterpart,receiptUrl,cicilanPokok})
      const date=new Date(txDate).toISOString()
      const ok=txType==='Transfer'
        ? await recordCashTransfer({eventId,date,bankAccountId:bankId,targetBankAccountId:targetBankId,amount,description})
        : await recordManualCashCommand({eventId,transaction:{id:eventId,date,type:txType,amount,bankAccountId:bankId,category,description:savedDescription,counterpartName:counterpart,receiptUrl,referenceType:'Manual'},counterAccountCode:counterAccounts[category],...(txType==='Out' && category==='Cicilan Pinjaman'?{debits:loanPaymentDebits(amount,cicilanPokok),credits:[{accountCode:bankAccounts.find(b=>b.id===bankId)?.accountCode||'1-1000',amount}]}:{})})
      if(!ok) throw new Error('Transaksi belum terkonfirmasi. Ulangi data yang sama untuk memeriksa hasil tanpa menggandakan transaksi.')
      pendingCash.current=null;toast.success('Transaksi dicatat bersama jurnal dan saldo.')
      setIsAddTxOpen(false);setAmount(0);setDescription('');setCounterpart('');setCategory('');setTargetBankId('');setReceiptUrl('');setCicilanPokok(0);setLoanValue('');setLoanMonths('')
    } catch(e) {toast.error((e as Error).message)}
    finally {cashBusy.current=false;setIsSubmitting(false)}
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-[19px] leading-tight font-semibold text-slate-900">Kas &amp; bank</h2>
          <p className="mt-[3px] text-[12.5px] text-slate-400">
            Saldo gabungan {formatRupiahShort(bankAccounts.reduce((sum, b) => sum + Number(b.balance || 0), 0))} · {bankAccounts.length} akun
          </p>
        </div>
        <div className="flex gap-2">
           <Dialog open={isAddBankOpen} onOpenChange={setIsAddBankOpen}>
              <DialogTrigger render={
                 <Button variant="outline" className="rounded-xl h-11 px-6 font-bold uppercase text-[11px] tracking-widest border-slate-200">
                    <Building2 className="w-4 h-4 mr-2" /> Daftar Bank Baru
                 </Button>
              } />
              <DialogContent className="rounded-xl p-8 max-w-sm">
                 <DialogHeader>
                    <DialogTitle className="text-xl font-bold uppercase text-slate-800 tracking-tight text-center mb-4">Registrasi Akun Kas/Bank</DialogTitle>
                 </DialogHeader>
                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Nama Bank / Laci</label>
                       <Input value={bankForm.name} onChange={e => setBankForm({ ...bankForm, name: e.target.value })} placeholder="Misal: Bank Mandiri / Petty Cash" className="rounded-xl h-12 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">No Rekening (pasti/opsional)</label>
                       <Input value={bankForm.number} onChange={e => setBankForm({ ...bankForm, number: e.target.value })} placeholder="000-XXXXXXXX" className="rounded-xl h-12 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Saldo Awal (Rp)</label>
                       <Input type="number" value={bankForm.balance} onChange={e => setBankForm({ ...bankForm, balance: Number(e.target.value) })} className="rounded-xl h-12 font-bold text-emerald-600 text-center" />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Link ke Buku Besar (COA)</label>
                        <Select value={bankForm.accountCode} onValueChange={(val) => setBankForm({ ...bankForm, accountCode: val || '' })}>
                           <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                              <SelectValue placeholder="Pilih Akun">{bankForm.accountCode ? (() => { const acc = coas.find(c => c.accountCode === bankForm.accountCode); return acc ? `${acc.accountCode} - ${acc.accountName}` : bankForm.accountCode })() : undefined}</SelectValue>
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
                    <div className="space-y-1">
                       <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Peruntukan Rekening</label>
                        <Select value={bankForm.purpose} onValueChange={(val) => setBankForm({ ...bankForm, purpose: (val || 'umum') as BankAccountPurpose })}>
                           <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="umum">Umum</SelectItem>
                              <SelectItem value="sourcing">Kas Sourcing (pool bersama)</SelectItem>
                              <SelectItem value="sourcing_pocket">Kantong Sourcing (per orang)</SelectItem>
                              <SelectItem value="kurir">Kas Kurir</SelectItem>
                           </SelectContent>
                        </Select>
                    </div>
                    {bankForm.purpose === 'sourcing_pocket' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                        <Select value={bankForm.ownerUserId} onValueChange={(val) => setBankForm({ ...bankForm, ownerUserId: val || '' })}>
                          <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                          <SelectContent>
                            {users.filter(u => u.role === 'sourcing').map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
                      <Checkbox
                        id="cfo-gate-create"
                        checked={bankForm.cfoApprovalRequired}
                        onCheckedChange={(checked) => setBankForm({ ...bankForm, cfoApprovalRequired: checked === true })}
                      />
                      <label htmlFor="cfo-gate-create" className="text-[11px] font-bold text-slate-600 leading-tight">
                        Butuh Approval CFO untuk transfer KELUAR dari rekening ini (BRI, Mandiri)
                      </label>
                    </div>
                    <Button onClick={handleCreateBank} disabled={isSubmitting} className="w-full h-14 bg-slate-900 text-white rounded-xl font-bold uppercase text-[11px] tracking-widest shadow-sm mt-4">
                       {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buka Akun Kas/Bank"}
                    </Button>
                 </div>
              </DialogContent>
           </Dialog>

           <Dialog open={isAddTxOpen} onOpenChange={(open) => {
              setIsAddTxOpen(open)
              if (!open) {
                setAmount(0); setCategory(''); setDescription(''); setCounterpart(''); setLoanValue(''); setLoanMonths('')
                setCicilanPokok(0); setReceiptUrl(''); setTargetBankId('')
                setTxDate(new Date().toISOString().split('T')[0])
              }
           }}>
              <DialogTrigger render={
                 <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold shadow-sm dark:shadow-none h-11 px-6 rounded-xl">
                    <Plus className="w-4 h-4 mr-1" /> Catat Kas Masuk/Keluar
                 </Button>
              } />
              <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
                 <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">Input Transaksi Kas</DialogTitle>
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
                                             <SelectItem disabled value="Pelunasan Piutang">💰 Pelunasan Piutang (AR)</SelectItem>
                                             <SelectItem disabled value="Penjualan Tunai">🛒 Penjualan Tunai</SelectItem>
                                             <SelectItem value="Investasi">📈 Investasi Masuk</SelectItem>
                                             <SelectItem value="Pinjaman">🏦 Pinjaman Bank</SelectItem>
                                             <SelectItem disabled value="Refund Vendor">🔄 Refund Vendor</SelectItem>
                                             <SelectItem value="Pendapatan Lainnya">➕ Pendapatan Lain-lain</SelectItem>
                                          </>
                                       ) : (
                                          <>
                                             <SelectItem disabled value="Belanja Barang (HPP)">🛒 Belanja Barang (HPP)</SelectItem>
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

                     <p className="text-xs text-slate-500">Penerimaan tagihan dicatat lewat <Link className="underline text-blue-600" href="/finance/invoices">Piutang → Catat Bayar</Link>. Penjualan, belanja barang dan refund vendor mengikuti dokumen sumber masing-masing.</p>
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
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                           <Input
                              type="text"
                              className={`h-12 pl-12 text-2xl font-bold rounded-2xl border-2 tracking-tight ${txType === 'In' ? 'text-emerald-600 border-emerald-100' : txType === 'Transfer' ? 'text-indigo-600 border-indigo-100' : 'text-rose-600 border-rose-100'}`}
                              value={formatNumber(amount)}
                              onChange={(e) => setAmount(parseNumber(e.target.value))}
                           />
                        </div>
                     </div>

                     {category === 'Pinjaman' && txType === 'In' && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                           <p className="text-sm font-semibold text-emerald-800">Bunga pinjaman</p>
                           <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                 <Label htmlFor="loan-period">Periode bunga</Label>
                                 <Select value={loanPeriod} onValueChange={v => { if (v) setLoanPeriod(v as LoanInterestTerms['period']) }}>
                                    <SelectTrigger id="loan-period" className="w-full"><SelectValue>{loanPeriod === 'monthly' ? 'Per bulan (flat)' : 'Total selama pinjaman'}</SelectValue></SelectTrigger>
                                    <SelectContent><SelectItem value="monthly">Per bulan (flat)</SelectItem><SelectItem value="total">Total selama pinjaman</SelectItem></SelectContent>
                                 </Select>
                              </div>
                              <div className="space-y-1">
                                 <Label htmlFor="loan-mode">Isi bunga sebagai</Label>
                                 <Select value={loanMode} onValueChange={v => { if (v) { setLoanMode(v as LoanInterestTerms['mode']); setLoanValue('') } }}>
                                    <SelectTrigger id="loan-mode" className="w-full"><SelectValue>{loanMode === 'percent' ? 'Persentase (%)' : 'Nominal rupiah (Rp)'}</SelectValue></SelectTrigger>
                                    <SelectContent><SelectItem value="percent">Persentase (%)</SelectItem><SelectItem value="amount">Nominal rupiah (Rp)</SelectItem></SelectContent>
                                 </Select>
                              </div>
                              <div className="space-y-1">
                                 <Label htmlFor="loan-value">Bunga {loanPeriod === 'monthly' ? 'per bulan' : 'total'} ({loanMode === 'percent' ? '%' : 'Rp'})</Label>
                                 <Input id="loan-value" inputMode={loanMode === 'percent' ? 'decimal' : 'numeric'} value={loanMode === 'amount' && loanValue ? formatNumber(loanValue) : loanValue} placeholder="Isi 0 jika tanpa bunga" onChange={e => setLoanValue(loanMode === 'amount' ? e.target.value.replace(/\D/g, '') : e.target.value)} />
                              </div>
                              {loanPeriod === 'monthly' && (
                                 <div className="space-y-1">
                                    <Label htmlFor="loan-months">Lama pinjaman (bulan)</Label>
                                    <Input id="loan-months" type="number" min="1" step="1" value={loanMonths} placeholder="Contoh: 3" onChange={e => setLoanMonths(e.target.value)} />
                                 </div>
                              )}
                           </div>
                           <p className="text-xs text-emerald-800">Persentase dihitung dari pokok awal. Nominal transaksi di atas adalah pokok pinjaman yang diterima utuh.</p>
                           {loanEstimate && (
                              <div className="grid grid-cols-2 gap-3 text-sm text-emerald-900" aria-live="polite">
                                 <p>Total bunga<strong className="block">{formatRupiah(loanEstimate.totalInterest)}</strong></p>
                                 <p>Pokok + bunga<strong className="block">{formatRupiah(loanEstimate.totalRepayment)}</strong></p>
                              </div>
                           )}
                           <p className="text-xs text-slate-600">Ketentuan bunga disimpan di keterangan transaksi. Belum dibukukan sebagai beban saat pencairan. Saat membayar, pilih Kas Keluar → Cicilan Pinjaman dan pisahkan pokok dari bunga. Tidak ada pembukuan bunga bulanan otomatis.</p>
                        </div>
                     )}

                     {category === 'Cicilan Pinjaman' && txType === 'Out' && (
                        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
                           <p className="text-xs font-bold text-amber-700 ">📋 Rincian Cicilan Pinjaman</p>
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
                           <p className="text-[11px] text-amber-600">Pokok mengurangi utang. Bunga masuk beban bunga dan mengurangi laba. Isi pokok 0 jika hanya membayar bunga.</p>
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
                        className={`w-full h-12 font-bold text-base rounded-2xl duration-200 ${txType === 'In' ? 'bg-emerald-600 hover:bg-emerald-700' : txType === 'Transfer' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
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

      {bankAccounts.length > 0 && (
        <StatBand
          leader={{
            label: 'Saldo gabungan',
            value: formatRupiahShort(bankAccounts.reduce((sum, b) => sum + Number(b.balance || 0), 0)),
            note: `${bankAccounts.length} akun kas & bank`,
          }}
          items={bankAccounts.slice(0, 4).map(b => ({
            label: b.name,
            value: formatRupiahShort(Number(b.balance || 0)),
            tone: Number(b.balance || 0) < 0 ? 'risk' as const : 'ink' as const,
            note: b.accountNumber || 'tanpa nomor rekening',
          }))}
        />
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
         {bankAccounts.map(b => {
            const isSelected = selectedBankFilter === b.id;
            return (
            <Card
               key={b.id}
               onClick={() => setSelectedBankFilter(isSelected ? null : b.id)}
               className={`cursor-pointer transition-all duration-300 overflow-hidden group ${isSelected ? 'border-2 border-emerald-500 bg-emerald-50/30 shadow-md dark:border-emerald-600 dark:bg-emerald-900/20' : 'border border-transparent shadow-md dark:shadow-none hover:border-slate-200'}`}
            >
               <div className="p-3 relative">
                  <div className="flex justify-between items-start">
                     <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        {b.name.includes('Petty') ? <Wallet className="w-4 h-4" /> : <Building2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
                     </div>
                     <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className="text-[11px] font-bold tracking-tighter opacity-70">
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
                               if (confirm(`Hapus akun ${b.name}? Hanya akun bersaldo nol tanpa riwayat transaksi yang dapat dihapus.`)) {
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
                     <p className="text-[11px] text-slate-400 font-bold  truncate">{b.accountNumber || 'PHYSICAL CASH'}</p>
                     <p className="text-[11px] text-slate-500 font-bold  mt-0.5 truncate">{b.name}</p>
                     <p className="text-lg font-bold mt-0.5 tracking-tighter">{formatRupiah(b.balance)}</p>
                     {b.cfoApprovalRequired && (
                        <Badge variant="outline" className="mt-1 text-[11px] font-bold  bg-amber-50 text-amber-700 border-amber-200">
                           Butuh Approval CFO
                        </Badge>
                     )}
                  </div>
                  <div className="absolute right-[-8px] bottom-[-8px] opacity-[0.04] group-hover:rotate-12 transition-all duration-150">
                     <Landmark className="w-14 h-14" />
                  </div>
               </div>
            </Card>
            )
         })}
      </div>

      {/* EDIT BANK DIALOG */}
      <Dialog open={!!editingBank} onOpenChange={(open) => !open && setEditingBank(null)}>
        <DialogContent className="rounded-2xl p-8 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase text-slate-800 tracking-tight text-center mb-4">Edit Info Akun</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Nama Bank</label>
              <Input 
                value={editingBank?.name || ''} 
                onChange={e => setEditingBank({ ...editingBank, name: e.target.value })} 
                className="rounded-xl h-12 text-center font-bold" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">No Rekening</label>
              <Input 
                value={editingBank?.accountNumber || ''} 
                onChange={e => setEditingBank({ ...editingBank, accountNumber: e.target.value })} 
                className="rounded-xl h-12 text-center" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Koreksi Saldo</label>
              <Input 
                type="number"
                value={editingBank?.balance || 0} 
                onChange={e => setEditingBank({ ...editingBank, balance: Number(e.target.value) })} 
                className="rounded-xl h-12 text-center font-bold text-emerald-600" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Link ke Buku Besar (COA)</label>
              <Select value={editingBank?.accountCode || ''} onValueChange={(val) => setEditingBank({ ...editingBank, accountCode: val || '' })}>
                <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                  <SelectValue placeholder="Pilih Akun">{editingBank?.accountCode ? (() => { const acc = coas.find(c => c.accountCode === editingBank.accountCode); return acc ? `${acc.accountCode} - ${acc.accountName}` : editingBank.accountCode })() : undefined}</SelectValue>
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
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Peruntukan Rekening</label>
              <Select value={editingBank?.purpose || 'umum'} onValueChange={(val) => setEditingBank({ ...editingBank, purpose: val || 'umum' })}>
                <SelectTrigger className="h-12 rounded-xl text-center font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="umum">Umum</SelectItem>
                  <SelectItem value="sourcing">Kas Sourcing (pool bersama)</SelectItem>
                  <SelectItem value="sourcing_pocket">Kantong Sourcing (per orang)</SelectItem>
                  <SelectItem value="kurir">Kas Kurir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingBank?.purpose === 'sourcing_pocket' && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-slate-400 tracking-widest ml-1 text-center block">Pemilik Kantong (Sourcing)</label>
                <Select value={editingBank?.ownerUserId || ''} onValueChange={(val) => setEditingBank({ ...editingBank, ownerUserId: val || '' })}>
                  <SelectTrigger className="h-12 rounded-xl text-center font-bold"><SelectValue placeholder="Pilih sourcing..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.role === 'sourcing').map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
              <Checkbox
                id="cfo-gate-edit"
                checked={!!editingBank?.cfoApprovalRequired}
                onCheckedChange={(checked) => setEditingBank({ ...editingBank, cfoApprovalRequired: checked === true })}
              />
              <label htmlFor="cfo-gate-edit" className="text-[11px] font-bold text-slate-600 leading-tight">
                Butuh Approval CFO untuk transfer KELUAR dari rekening ini (BRI, Mandiri)
              </label>
            </div>

            {/* Adjustment Category Logic */}
            {editingBank && (Number(editingBank.balance) !== (bankAccounts.find(b => b.id === editingBank.id)?.balance || 0)) && (
              <div className="space-y-2 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <label className="text-[11px] font-bold uppercase text-amber-600 tracking-widest block text-center">Deteksi Selisih Saldo!</label>
                <p className="text-[11px] text-amber-500 font-bold text-center leading-tight mb-2">
                  Saldo berubah {formatRupiah(Math.abs(Number(editingBank.balance) - (bankAccounts.find(b => b.id === editingBank.id)?.balance || 0)))}. <br />
                  Kemana selisih ini dicatat di Buku Besar?
                </p>
                <Select value={editingBank.adjCategory || ''} onValueChange={(val) => setEditingBank({ ...editingBank, adjCategory: val || '' })}>
                  <SelectTrigger className="h-10 rounded-xl bg-white border-amber-200 text-amber-900 font-bold text-xs uppercase shadow-sm">
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
            <Button onClick={handleUpdateBank} disabled={isSubmitting} className="w-full h-14 bg-emerald-600 text-white rounded-xl font-bold uppercase text-[11px] tracking-widest shadow-sm mt-4">
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
              className="w-full h-12 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl font-bold uppercase text-[11px] tracking-widest mt-2 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Hapus Akun Bank
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-sm dark:shadow-none mt-8 rounded-lg overflow-hidden">
         <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b py-6 px-8">
            <div className="flex justify-between items-center">
               <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                     <History className="w-5 h-5 text-emerald-600" />
                     History Transaksi Kas
                     {selectedBankFilter && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 ml-2">
                           Bank: {bankAccounts.find(b => b.id === selectedBankFilter)?.name}
                        </Badge>
                     )}
                     {selectedCategoryFilter && (
                        <Badge variant="secondary" className="bg-muted text-slate-600 ml-2">
                           Kategori: {formatCategory(selectedCategoryFilter)}
                        </Badge>
                     )}
                  </CardTitle>
                  <CardDescription>Semua mutasi masuk dan keluar tervalidasi.</CardDescription>
               </div>
               <div className="flex items-center gap-4">
                  {selectedTxIds.length > 0 && (
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">{selectedTxIds.length} terpilih</span>
                        <Button 
                           variant="destructive" 
                           size="sm" 
                           className="h-8 rounded-lg px-3 font-bold text-[11px] "
                           disabled title="Gunakan Koreksi Sumber untuk pembalikan yang didukung"
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
                                 <span className="text-[11px] font-bold text-slate-400">{format(new Date(tx.date), 'dd/MM HH:mm')}</span>
                                 <Badge variant="secondary" className="text-[11px] font-bold h-4 px-1.5  bg-slate-100">
                                    {bank?.name || 'Bank'}
                                 </Badge>
                              </TableCell>
                              <TableCell>
                                 <div className="flex flex-col">
                                    {/* Id mentah diganti nomor dokumennya, dan barisnya
                                        dibuat bisa dibuka. Yang mencocokkan mutasi bank
                                        hafal nomor PO dan faktur — bukan id acak. */}
                                    {(() => {
                                      const tujuan = tujuanTransaksi(tx, kamusRujukan)
                                      const judul = tanpaRef(tx.description)
                                      if (!tujuan) return <span className="whitespace-pre-line font-bold text-sm">{judul}</span>
                                      return (
                                        <Link
                                          href={tujuan.href}
                                          className="w-max text-sm font-bold text-emerald-700 underline-offset-2 hover:underline"
                                          title={`Buka ${tujuan.label}`}
                                        >
                                          {judul} · {tujuan.label}
                                        </Link>
                                      )
                                    })()}
                                    <div className="flex flex-col gap-1 mt-1">
                                       {(() => {
                                          const isInternal = tx.category.toLowerCase().includes('uang muka') || tx.category.toLowerCase().includes('kembalian') || tx.category.toLowerCase().includes('pindah');
                                          const prefix = isInternal ? '🔄 Pindah Saldo Ke/Dari:' : (tx.type === 'In' ? '📥 Sumber Dana:' : '📤 Tujuan Kas Keluar:');
                                          return (
                                             <span className={`text-[11px] font-bold ${isInternal ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                {prefix} {tx.counterpartName || (isInternal ? 'Akun Internal' : 'Pihak Eksternal')}
                                             </span>
                                          )
                                       })()}
                                       {tx.receiptUrl && (
                                          <Dialog>
                                             <DialogTrigger render={
                                                <button className="text-[11px] text-emerald-600 font-bold hover:underline flex items-center gap-1 w-max">
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
                                    <Badge variant="outline" className={`text-[11px] font-bold uppercase ${tx.type === 'In' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                       {formatCategory(tx.category)}
                                    </Badge>
                                    {(() => {
                                       const isInternal = tx.category.toLowerCase().includes('uang muka') || tx.category.toLowerCase().includes('kembalian') || tx.category.toLowerCase().includes('pindah');
                                       const label = isInternal ? 'Transfer Internal' : (tx.type === 'In' ? 'Arus Kas Masuk' : 'Arus Kas Keluar');
                                       const color = isInternal ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : (tx.type === 'In' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-100 text-slate-500 border-slate-200');
                                       
                                       return (
                                          <Badge variant="outline" className={`text-[8.5px] font-bold  ${color}`}>
                                             {label}
                                          </Badge>
                                       )
                                    })()}
                                 </div>
                              </TableCell>
                              <TableCell className={`text-right px-8 font-bold text-lg font-mono ${tx.type === 'In' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 <div className="flex items-center justify-end gap-3">
                                    <span>{tx.type === 'In' ? '+' : '-'} {formatRupiah(tx.amount)}</span>
                                    <div className="flex items-center gap-1">
                                       <Button
                                          variant="ghost" size="icon"
                                          className="h-7 w-7 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                          disabled title="Gunakan Koreksi Sumber untuk pembalikan yang didukung"
                                       >
                                          <Trash2 className="h-3.5 w-3.5" />
                                       </Button>
                                       <Button
                                          variant="ghost" size="icon"
                                          className="h-7 w-7 text-slate-400 hover:text-slate-700 shrink-0"
                                          disabled title="Transaksi terposting tidak dapat diedit"
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
         <DialogContent className="rounded-xl max-w-sm p-8">
            <DialogHeader className="items-center text-center">
               <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
               </div>
               <DialogTitle className="text-xl font-bold ">Hapus Transaksi?</DialogTitle>
               <DialogDescription className="font-bold text-slate-500 mt-2">
                  Tindakan ini akan menghapus riwayat transaksi dan **mengembalikan saldo bank** ke posisi sebelum transaksi ini terjadi.
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col mt-6">
               <Button variant="destructive" className="w-full h-12 rounded-xl font-bold uppercase text-xs tracking-widest" onClick={handleConfirmDelete} disabled={isSubmitting}>
                 {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ya, Hapus Sekarang"}
               </Button>
               <Button variant="ghost" className="w-full h-12 rounded-xl font-bold text-slate-400" onClick={() => setTxToDelete(null)} disabled={isSubmitting}>Batalkan</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION DIALOG */}
      <Dialog open={isBulkDeleteConfirmOpen} onOpenChange={setIsBulkDeleteConfirmOpen}>
         <DialogContent className="rounded-xl max-w-sm p-8">
            <DialogHeader className="items-center text-center">
               <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                  <Trash2 className="w-8 h-8 text-rose-500" />
               </div>
               <DialogTitle className="text-xl font-bold ">Hapus {selectedTxIds.length} Transaksi?</DialogTitle>
               <DialogDescription className="font-bold text-slate-500 mt-2">
                  Anda akan menghapus {selectedTxIds.length} transaksi sekaligus. Saldo dari masing-masing akun bank terkait akan dikalkulasi ulang secara otomatis.
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col mt-6">
               <Button variant="destructive" className="w-full h-12 rounded-xl font-bold uppercase text-xs tracking-widest" onClick={handleBulkDelete} disabled={isSubmitting}>
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
            <DialogTitle className="text-lg font-bold">Edit Transaksi</DialogTitle>
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
                        <SelectItem disabled value="Pelunasan Piutang">Pelunasan Piutang (AR)</SelectItem>
                        <SelectItem disabled value="Penjualan Tunai">Penjualan Tunai</SelectItem>
                        <SelectItem value="Investasi">Investasi Masuk</SelectItem>
                        <SelectItem value="Pinjaman">Pinjaman Bank</SelectItem>
                        <SelectItem disabled value="Refund Vendor">Refund Vendor</SelectItem>
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
