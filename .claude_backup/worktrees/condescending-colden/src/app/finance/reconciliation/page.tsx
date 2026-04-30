"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { 
  ArrowRightLeft, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  FileText,
  Search,
  Link as LinkIcon
} from "lucide-react"
import { formatRupiah } from "@/lib/utils"
import { toast } from "sonner"

interface BankEntry {
  id: string
  date: string
  description: string
  amount: number
  type: 'CR' | 'DB'
  reconciled: boolean
  matchedJournalId?: string
}

export default function ReconciliationPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const products = useAppStore(state => state.products)
  const journalLines = useAppStore(state => state.journalLines)
  const journalEntries = useAppStore(state => state.journalEntries)
  const coas = useAppStore(state => state.coas)

  // Reconciliation State
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // 1. Margin Analysis Logic (Existing)
  const reconOrders = useMemo(() => {
    return salesOrders
      .filter(so => ['Packing', 'Terkirim'].includes(so.status))
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [salesOrders])

  // 2. Bank Reconciliation Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      // Simple CSV Parse: Date, Description, Amount, Type
      const lines = text.split('\n').filter(l => l.trim())
      const parsed: BankEntry[] = lines.slice(1).map((line, idx) => {
        const [date, desc, amt, type] = line.split(',')
        return {
          id: `be-${idx}`,
          date: date.trim(),
          description: desc.trim(),
          amount: Math.abs(parseFloat(amt)),
          type: type?.trim().toUpperCase() as 'CR' | 'DB' || 'CR',
          reconciled: false
        }
      })
      
      setBankEntries(parsed)
      setIsUploading(false)
      toast.success(`${parsed.length} data mutasi berhasil diimpor.`)
    }
    reader.readAsText(file)
  }

  // Matching Logic: Find journal lines that match bank entry
  const getSuggestedMatch = (entry: BankEntry) => {
    const bankDate = new Date(entry.date)
    return journalLines.find(jl => {
      const entryRef = journalEntries.find(e => e.id === jl.journalEntryId)
      if (!entryRef) return false
      
      const journalDate = new Date(entryRef.transactionDate)
      const diffTime = Math.abs(journalDate.getTime() - bankDate.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      // Match criteria: Exact amount and within 7 days
      const amountMatches = entry.type === 'CR' 
        ? jl.creditAmount === entry.amount 
        : jl.debitAmount === entry.amount
      
      // Also check if account is "Kas & Bank" (1-1000)
      const acc = coas.find(a => a.id === jl.accountId)
      const isCashAcc = acc?.accountCode === '1-1000'

      return amountMatches && diffDays <= 7 && isCashAcc && !entry.reconciled
    })
  }

  const handleMatch = (entryId: string, journalLineId: string) => {
    setBankEntries(prev => prev.map(entry => 
      entry.id === entryId 
        ? { ...entry, reconciled: true, matchedJournalId: journalLineId }
        : entry
    ))
    toast.success("Transaksi berhasil direkonsiliasi.")
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Financial Reconciliation</h2>
          <p className="text-muted-foreground">Audit dan penyelarasan data transaksi perusahaan.</p>
        </div>
      </div>

      <Tabs defaultValue="margin" className="space-y-6">
        <TabsList className="bg-white/50 dark:bg-slate-900/50 p-1 rounded-xl glass-card">
          <TabsTrigger value="margin" className="rounded-lg px-6">Analisa Margin PO</TabsTrigger>
          <TabsTrigger value="bank" className="rounded-lg px-6">Rekonsiliasi Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="margin">
           <Card className="border-none shadow-sm overflow-hidden">
             <CardHeader className="bg-slate-50 dark:bg-slate-800/50 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                   <ArrowRightLeft className="w-5 h-5 text-emerald-500" /> Analisa Profit per PO
                </CardTitle>
                <CardDescription>Bandingkan nilai jual ke Klien vs nilai beli aktual dari Pasar.</CardDescription>
             </CardHeader>
             <CardContent className="p-0">
               <Table>
                 <TableHeader>
                   <TableRow className="bg-slate-100/30 dark:bg-slate-950">
                     <TableHead>PO Number</TableHead>
                     <TableHead>Client</TableHead>
                     <TableHead className="text-right">Revenue</TableHead>
                     <TableHead className="text-right">HPP Aktual</TableHead>
                     <TableHead className="text-right">Profit</TableHead>
                     <TableHead>Status</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {reconOrders.length === 0 ? (
                     <TableRow>
                       <TableCell colSpan={6} className="h-24 text-center text-muted-foreground italic">
                         Belum ada data PO yang selesai dibelanjakan.
                       </TableCell>
                     </TableRow>
                   ) : (
                     reconOrders.map(so => {
                       const client = clients.find(c => c.id === so.clientId)
                       const items = salesOrderItems.filter(i => i.salesOrderId === so.id)
                       const totalRevenue = items.reduce((sum, item) => sum + item.subtotal, 0)
                       
                       let totalCogs = 0
                       items.forEach(item => {
                         const pItem = purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop()
                         const unitCost = pItem ? pItem.actualUnitPrice : (products.find(p => p.id === item.productId)?.basePrice || 0)
                         totalCogs += (item.qty * unitCost)
                       })

                       const profit = totalRevenue - totalCogs
                       const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

                       return (
                         <TableRow key={so.id}>
                           <TableCell className="font-bold text-slate-700 dark:text-slate-300">
                             {so.poNumber}
                           </TableCell>
                           <TableCell className="text-xs">{client?.companyName}</TableCell>
                           <TableCell className="text-right font-medium text-emerald-600">
                             {formatRupiah(totalRevenue)}
                           </TableCell>
                           <TableCell className="text-right font-medium text-rose-600">
                             {formatRupiah(totalCogs)}
                           </TableCell>
                           <TableCell className="text-right">
                             <div className={`font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                               {formatRupiah(profit)}
                             </div>
                             <div className={`text-[10px] font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                               ({marginPct.toFixed(1)}%)
                             </div>
                           </TableCell>
                           <TableCell>
                             <Badge variant="outline" className={so.status === 'Terkirim' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                               {so.status}
                             </Badge>
                           </TableCell>
                         </TableRow>
                       )
                     })
                   )}
                 </TableBody>
               </Table>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="bank">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-none shadow-sm h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Bank Statement Import</CardTitle>
                <CardDescription>Upload mutasi rekening koran (.csv)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 dark:bg-slate-900/50">
                  <Upload className="w-10 h-10 text-slate-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Klik untuk upload atau drag & drop</p>
                    <p className="text-xs text-slate-500">Format: CSV (Date, Desc, Amount, Type)</p>
                  </div>
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={handleFileUpload}
                  />
                  <Button variant="outline" size="sm" className="relative pointer-events-none">Pilih File</Button>
                </div>
                
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-500 flex items-center gap-1 mb-1">
                    <AlertCircle className="w-3 h-3" /> Tips Rekonsiliasi
                  </h4>
                  <ul className="text-[10px] text-amber-700 dark:text-amber-600 space-y-1 list-disc pl-3">
                    <li>Pastikan nilai Amount sesuai dengan Ledger (IDR).</li>
                    <li>Sistem otomatis mencari transaksi +/- 7 hari.</li>
                    <li>CR = Credit (Penerimaan), DB = Debit (Pengeluaran).</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-slate-50/50">
                <div>
                  <CardTitle className="text-lg">Daftar Mutasi Bank</CardTitle>
                  <CardDescription>{bankEntries.length} transaksi terdeteksi.</CardDescription>
                </div>
                <div className="flex gap-2 text-[10px] font-bold">
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Reconciled</div>
                   <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300" /> Pending</div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bankEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-48 text-center text-muted-foreground italic">
                           <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                           Belum ada data mutasi diunggah.
                        </TableCell>
                      </TableRow>
                    ) : (
                      bankEntries.map(entry => {
                        const suggestion = getSuggestedMatch(entry)
                        
                        return (
                          <TableRow key={entry.id} className={entry.reconciled ? "bg-emerald-50/30 font-medium" : ""}>
                            <TableCell className="text-xs whitespace-nowrap">{entry.date}</TableCell>
                            <TableCell>
                               <div className="text-xs font-medium max-w-[200px] truncate">{entry.description}</div>
                               {entry.reconciled && (
                                 <div className="text-[10px] text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> matched with ledger
                                 </div>
                               )}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${entry.type === 'CR' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {entry.type === 'DB' ? '-' : ''}{formatRupiah(entry.amount)}
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.reconciled ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Matched</Badge>
                              ) : suggestion ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 text-[10px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => handleMatch(entry.id, suggestion.id)}
                                >
                                  <LinkIcon className="w-3 h-3 mr-1" /> Match?
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] text-slate-400" disabled>
                                  <Search className="w-3 h-3 mr-1" /> No Match
                                </Button>
                              )}
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
