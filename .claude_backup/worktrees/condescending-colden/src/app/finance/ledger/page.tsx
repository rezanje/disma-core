"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { 
  BookOpen, Filter, Pencil, Save, 
  AlertCircle, ArrowRightLeft, Building2,
  ChevronDown, Layers
} from "lucide-react"
import { toast } from "sonner"
import { ChartOfAccount, JournalEntry, JournalLine } from "@/types"

export default function LedgerPage() {
  const accountBalances = useAppStore(state => state.coas)
  const journalEntries = useAppStore(state => state.journalEntries)
  const journalLines = useAppStore(state => state.journalLines)
  const updateJournalEntry = useAppStore(state => state.updateJournalEntry)

  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [editLines, setEditLines] = useState<JournalLine[]>([])
  const [editDesc, setEditDesc] = useState("")

  const sortedEntries = [...journalEntries].sort((a, b) => 
    new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
  )

  const openEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setEditDesc(entry.description)
    const lines = journalLines.filter(jl => jl.journalEntryId === entry.id)
    setEditLines([...lines])
  }

  const handleSaveEdit = () => {
    const totalDebit = editLines.reduce((sum, l) => sum + Number(l.debitAmount), 0)
    const totalCredit = editLines.reduce((sum, l) => sum + Number(l.creditAmount), 0)

    if (totalDebit !== totalCredit) {
      toast.error(`Jurnal tidak balance! Selisih: Rp ${Math.abs(totalDebit - totalCredit).toLocaleString()}`)
      return
    }

    if (editingEntry) {
      updateJournalEntry(editingEntry.id, { description: editDesc }, editLines)
      setEditingEntry(null)
      toast.success("Catatan Jurnal berhasil dikoreksi.")
    }
  }

  const getBalance = (accountId: string, type: string) => {
    let balance = 0
    journalLines.filter(jl => jl.accountId === accountId).forEach(line => {
      if (['Asset', 'Expense'].includes(type)) {
        balance += line.debitAmount - line.creditAmount
      } else {
        balance += line.creditAmount - line.debitAmount
      }
    })
    return balance
  }

  const handleUpdateLine = (index: number, field: keyof JournalLine, value: any) => {
    const newLinesArr = [...editLines]
    newLinesArr[index] = { ...newLinesArr[index], [field]: value }
    setEditLines(newLinesArr)
  }

  const totals = {
    assets: accountBalances.filter(a => a.accountType === 'Asset').reduce((sum, a) => sum + getBalance(a.id, a.accountType), 0),
    liabilities: accountBalances.filter(a => a.accountType === 'Liability').reduce((sum, a) => sum + getBalance(a.id, a.accountType), 0),
    equity: accountBalances.filter(a => a.accountType === 'Equity').reduce((sum, a) => sum + getBalance(a.id, a.accountType), 0)
  }

  const groupedCoas = useMemo(() => {
    const groups: Record<string, ChartOfAccount[]> = {
      'Asset': [],
      'Liability': [],
      'Equity': [],
      'Revenue': [],
      'Expense': []
    }
    accountBalances.forEach(acc => {
      if (groups[acc.accountType]) groups[acc.accountType].push(acc)
    })
    return groups
  }, [accountBalances])

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center mb-0">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">General Ledger (Buku Besar)</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Audit Seluruh Transaksi Finansial DISMA</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Card className="bg-slate-900 border-none rounded-[2rem] shadow-2xl p-8 relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Total Nilai Aset (Harta)</p>
            <h3 className="text-4xl font-black text-white tracking-tighter group-hover:scale-105 transition-transform origin-left">{formatRupiah(totals.assets)}</h3>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-bold text-[9px] uppercase">Sehat</Badge>
              <span className="text-[10px] text-slate-500 font-bold uppercase">Kas, Bank, Piutang & Inventaris</span>
            </div>
          </div>
          <Building2 className="absolute right-[-20px] bottom-[-20px] w-40 h-40 text-white opacity-[0.03] group-hover:rotate-12 transition-all duration-700" />
        </Card>

        <Card className="bg-white border-2 border-slate-100 rounded-[2rem] shadow-xl p-8 relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Utang & Kewajiban</p>
            <h3 className="text-4xl font-black text-rose-500 tracking-tighter">{formatRupiah(totals.liabilities)}</h3>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-rose-50 text-rose-400 border-none font-bold text-[9px] uppercase">Liabilitas</Badge>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Utang Vendor & Pajak</span>
            </div>
          </div>
          <ArrowRightLeft className="absolute right-[-20px] bottom-[-20px] w-40 h-40 text-slate-900 opacity-[0.03] group-hover:-rotate-12 transition-all duration-700" />
        </Card>

        <Card className="bg-emerald-50 border-none rounded-[2rem] shadow-xl p-8 relative overflow-hidden group border border-emerald-100">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase text-emerald-600/50 tracking-widest mb-1">Kekayaan Bersih (Equity)</p>
            <h3 className="text-4xl font-black text-emerald-700 tracking-tighter">{formatRupiah(totals.equity)}</h3>
            <div className="mt-4 flex items-center gap-2">
              <Badge className="bg-emerald-600 text-white border-none font-bold text-[9px] uppercase">Owner Equity</Badge>
              <span className="text-[10px] text-emerald-600/50 font-bold uppercase">Modal & Laba Ditahan</span>
            </div>
          </div>
          <BookOpen className="absolute right-[-20px] bottom-[-20px] w-40 h-40 text-emerald-600 opacity-[0.05] group-hover:rotate-6 transition-all duration-700" />
        </Card>
      </div>

      {/* COMPACT GROUPED COAS */}
      <div className="space-y-8">
        {Object.entries(groupedCoas).map(([type, coas]) => (
          <div key={type} className="space-y-4">
             <div className="flex items-center gap-3">
                <div className={cn(
                   "w-8 h-8 rounded-xl flex items-center justify-center text-white",
                   type === 'Asset' ? "bg-emerald-500" :
                   type === 'Liability' ? "bg-rose-500" :
                   type === 'Equity' ? "bg-purple-500" :
                   type === 'Revenue' ? "bg-blue-500" : "bg-slate-400"
                )}>
                   <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">{type} Accounts ({coas.length})</h3>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {coas.map(acc => {
                  const balance = getBalance(acc.id, acc.accountType)
                  return (
                    <Card key={acc.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden">
                       <div className="p-4">
                          <p className="text-[8px] font-black text-slate-300 uppercase tracking-tighter mb-1">{acc.accountCode}</p>
                          <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-tight leading-none h-6 line-clamp-2">{acc.accountName}</h4>
                          <div className="mt-3 pt-3 border-t border-slate-50">
                             <p className={cn(
                               "text-xs font-black tracking-tighter",
                               balance < 0 ? "text-rose-500" : "text-emerald-600"
                             )}>
                               {formatRupiah(Math.abs(balance))}
                             </p>
                          </div>
                       </div>
                    </Card>
                  )
                })}
             </div>
          </div>
        ))}
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white mt-12">
        <div className="bg-slate-900 p-6 flex items-center justify-between">
          <h3 className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-emerald-400" /> Jurnal Entry Details
          </h3>
          <Button variant="ghost" className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest">
            <Filter className="w-4 h-4 mr-2" /> Filter Periode
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="text-[10px] font-black uppercase tracking-widest pl-8">Tanggal</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest">Deskripsi</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest">Detail Akun & Nominal</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                    Belum ada riwayat jurnal.
                  </TableCell>
                </TableRow>
              ) : (
                sortedEntries.map(entry => {
                  const lines = journalLines.filter(jl => jl.journalEntryId === entry.id)
                  return (
                    <TableRow key={entry.id} className="border-b-8 border-slate-50 hover:bg-slate-50/50 group transition-all">
                      <TableCell className="align-top py-8 pl-8">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                          {new Date(entry.transactionDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                        </p>
                        <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">
                          {new Date(entry.transactionDate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </TableCell>
                      <TableCell className="align-top py-8 pr-8 min-w-[300px]">
                        <div className="font-black text-slate-800 text-sm tracking-tight mb-2 uppercase">{entry.description}</div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-slate-100 text-slate-400 border-none rounded-md text-[8px] font-black tracking-widest">
                            REF: {entry.referenceType || 'MANUAL'}
                          </Badge>
                          <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">ID: {entry.id.substring(0,8)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 pr-8">
                        <div className="bg-white/50 rounded-2xl p-2 space-y-1">
                          {lines.map((line, idx) => {
                            const account = accountBalances.find(a => a.id === line.accountId)
                            const isDebit = line.debitAmount > 0
                            return (
                              <div key={idx} className="flex items-center justify-between text-[11px] p-2 rounded-xl hover:bg-slate-100/50 transition-all font-bold">
                                <span className={cn(
                                  "flex items-center gap-2",
                                  !isDebit && "pl-6 text-slate-400"
                                )}>
                                  {!isDebit && <ArrowRightLeft className="w-3 h-3 rotate-90 opacity-30" />}
                                  {account?.accountCode} - {account?.accountName}
                                </span>
                                <span className={cn(
                                  "font-black tracking-tighter",
                                  isDebit ? "text-emerald-600" : "text-slate-800"
                                )}>
                                  Rp {isDebit ? line.debitAmount.toLocaleString() : line.creditAmount.toLocaleString()}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-8 pr-8">
                         <Button 
                           variant="ghost" 
                           size="icon" 
                           onClick={() => openEdit(entry)}
                           className="text-slate-200 hover:text-emerald-500 hover:bg-emerald-50 rounded-full h-10 w-10 transition-all group-hover:scale-110"
                         >
                           <Pencil className="w-5 h-5" />
                         </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* EDIT MODAL */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent 
          className="!max-w-[1100px] !w-[95vw] p-0 overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-white focus:outline-none"
          style={{ maxWidth: '1100px', width: '95vw' }}
        >
          <DialogHeader className="p-10 bg-slate-900 text-white relative">
            <div className="absolute top-0 right-0 p-10 opacity-10">
              <Pencil className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <Badge className="bg-emerald-500 text-white border-none px-4 py-1.5 rounded-full font-black uppercase text-[9px] tracking-[0.2em]">Audit Mode</Badge>
                <div className="h-4 w-px bg-white/20" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID Transaksi: {editingEntry?.id}</span>
              </div>
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter">Koreksi Data Jurnal Entry</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-10 space-y-10 bg-slate-50">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Keterangan Jurnal (Deskripsi Transaksi)</label>
              <Input 
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="h-16 rounded-2xl border-none shadow-sm bg-white focus:ring-2 ring-emerald-500/20 transition-all font-black text-xl text-slate-800 px-6"
              />
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end px-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Audit Kamar Akun & Rincian Nominal</label>
                <div className="flex gap-8 bg-white px-8 py-4 rounded-[2rem] shadow-sm border border-slate-100">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">Total Debit</p>
                    <p className="text-xl font-black text-emerald-600 tracking-tighter">Rp {editLines.reduce((s, l) => s + Number(l.debitAmount), 0).toLocaleString()}</p>
                  </div>
                  <div className="w-px h-10 bg-slate-100 self-center" />
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-300 uppercase mb-1">Total Kredit</p>
                    <p className="text-xl font-black text-slate-800 tracking-tighter">Rp {editLines.reduce((s, l) => s + Number(l.creditAmount), 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-4 custom-scrollbar">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">
                  <div className="col-span-6">Pilih Akun (Kamar)</div>
                  <div className="col-span-3 text-center">Nominal Debit</div>
                  <div className="col-span-3 text-center">Nominal Kredit</div>
                </div>
                {editLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 group hover:border-emerald-200 transition-all">
                    <div className="col-span-6">
                       <Select 
                        value={line.accountId} 
                        onValueChange={(v) => handleUpdateLine(idx, 'accountId', v)}
                      >
                        <SelectTrigger className="h-12 border-none bg-slate-50 rounded-xl font-black text-xs text-slate-600 ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl min-w-[500px] bg-white p-2">
                          {accountBalances.map(acc => (
                            <SelectItem key={acc.id} value={acc.id} className="text-[11px] font-black uppercase py-4 rounded-xl focus:bg-emerald-50 focus:text-emerald-700 transition-all">
                              <div className="flex items-center gap-3">
                                <span className="opacity-30">{acc.accountCode}</span>
                                <span>{acc.accountName}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="col-span-3">
                      <Input 
                        type="number"
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-emerald-50/50 font-black text-emerald-700 text-center text-sm"
                        value={line.debitAmount || ''}
                        onChange={e => {
                          const newLines = [...editLines]
                          newLines[idx].debitAmount = Number(e.target.value)
                          setEditLines(newLines)
                        }}
                      />
                    </div>

                    <div className="col-span-3">
                      <Input 
                        type="number"
                        placeholder="0"
                        className="h-12 rounded-xl border-none bg-slate-100/50 font-black text-slate-800 text-center text-sm"
                        value={line.creditAmount || ''}
                        onChange={e => {
                          const newLines = [...editLines]
                          newLines[idx].creditAmount = Number(e.target.value)
                          setEditLines(newLines)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <DialogFooter className="pt-6">
              <Button 
                onClick={handleSaveEdit}
                className="w-full h-20 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-4 active:scale-[0.98] transition-all"
              >
                <Save className="w-6 h-6" /> Sahkan Koreksi Transaksi (Save)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
