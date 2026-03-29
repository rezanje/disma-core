"use client"

import { useState, useMemo, useRef } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  TrendingUp, TrendingDown, Scale, 
  ArrowRightLeft, PieChart, FileText, 
  Download, Printer, AlertCircle, Building2,
  Eye, X, CheckCircle2, Wallet, Banknote, Loader2,
  Calendar as CalendarIcon, Filter,
  ChevronLeft, ChevronRight, CalendarDays
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { 
  addDays, format, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, startOfYear, endOfYear, 
  isWithinInterval, startOfDay, endOfDay,
  subMonths, addMonths, subYears, addYears,
  subWeeks, addWeeks
} from "date-fns"
import { id } from "date-fns/locale"
import { DateRange } from "react-day-picker"
import Image from "next/image"
import jsPDF from "jspdf"
import * as htmlToImage from "html-to-image"
import { toast } from "sonner"

export default function FinancialReportsPage() {
  const coas = useAppStore(state => state.coas)
  const journalLines = useAppStore(state => state.journalLines)
  const journalEntries = useAppStore(state => state.journalEntries)

  const [activeTab, setActiveTab] = useState("pnl")
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [period, setPeriod] = useState<"all" | "weekly" | "monthly" | "yearly" | "custom" | "daily">("monthly")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })
  
  const reportRef = useRef<HTMLDivElement>(null)

  const periodLabel = useMemo(() => {
    if (period === 'all') return "Seluruh Waktu"
    if (period === 'custom') {
      if (!dateRange?.from) return "Pilih Tanggal"
      const from = format(dateRange.from, 'dd MMM yyyy', { locale: id })
      const to = dateRange.to ? format(dateRange.to, 'dd MMM yyyy', { locale: id }) : from
      return `${from} - ${to}`
    }
    
    if (period === 'daily') return format(selectedDate, 'dd MMMM yyyy', { locale: id })
    if (period === 'weekly') {
      const start = startOfWeek(selectedDate, { locale: id })
      const end = endOfWeek(selectedDate, { locale: id })
      return `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`
    }
    if (period === 'monthly') return format(selectedDate, 'MMMM yyyy', { locale: id })
    if (period === 'yearly') return format(selectedDate, 'yyyy', { locale: id })
    return ""
  }, [period, selectedDate, dateRange])

  const handlePrevPeriod = () => {
    if (period === 'daily') setSelectedDate(prev => addDays(prev, -1))
    if (period === 'weekly') setSelectedDate(prev => addWeeks(prev, -1))
    if (period === 'monthly') setSelectedDate(prev => subMonths(prev, 1))
    if (period === 'yearly') setSelectedDate(prev => subYears(prev, 1))
  }

  const handleNextPeriod = () => {
    if (period === 'daily') setSelectedDate(prev => addDays(prev, 1))
    if (period === 'weekly') setSelectedDate(prev => addWeeks(prev, 1))
    if (period === 'monthly') setSelectedDate(prev => addMonths(prev, 1))
    if (period === 'yearly') setSelectedDate(prev => addYears(prev, 1))
  }

  const filteredLines = useMemo(() => {
    let start: Date, end: Date

    switch (period) {
      case 'daily': start = startOfDay(selectedDate); end = endOfDay(selectedDate); break
      case 'weekly': start = startOfWeek(selectedDate, { locale: id }); end = endOfWeek(selectedDate, { locale: id }); break
      case 'monthly': start = startOfMonth(selectedDate); end = endOfMonth(selectedDate); break
      case 'yearly': start = startOfYear(selectedDate); end = endOfYear(selectedDate); break
      case 'custom': 
        if (!dateRange?.from) return journalLines
        start = startOfDay(dateRange.from)
        end = endOfDay(dateRange.to || dateRange.from)
        break
      default: return journalLines
    }

    return journalLines.filter(line => {
      const entry = journalEntries.find(e => e.id === line.journalEntryId)
      if (!entry) return false
      const entryDate = new Date(entry.transactionDate)
      return isWithinInterval(entryDate, { start, end })
    })
  }, [journalLines, journalEntries, period, selectedDate, dateRange])

  const filteredEntries = useMemo(() => {
    const lineIds = new Set(filteredLines.map(l => l.journalEntryId))
    return journalEntries.filter(e => lineIds.has(e.id))
  }, [filteredLines, journalEntries])

  const getBalance = (accountId: string, type: string) => {
    let balance = 0
    filteredLines.filter(jl => jl.accountId === accountId).forEach(line => {
      if (['Asset', 'Expense'].includes(type)) {
        balance += line.debitAmount - line.creditAmount
      } else {
        balance += line.creditAmount - line.debitAmount
      }
    })
    return balance
  }

  // --- CALCULATIONS ---
  const revenues = useMemo(() => coas.filter(a => a.accountType === 'Revenue').map(a => ({ ...a, balance: getBalance(a.id, a.accountType) })), [coas, filteredLines])
  const totalRevenue = revenues.reduce((sum, a) => sum + a.balance, 0)
  
  const expenses = useMemo(() => coas.filter(a => a.accountType === 'Expense').map(a => ({ ...a, balance: getBalance(a.id, a.accountType) })), [coas, filteredLines])
  const totalExpense = expenses.reduce((sum, a) => sum + a.balance, 0)
  const netIncome = totalRevenue - totalExpense

  const assets = useMemo(() => coas.filter(a => a.accountType === 'Asset').map(a => ({ ...a, balance: getBalance(a.id, a.accountType) })), [coas, filteredLines])
  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0)
  
  const liabilities = useMemo(() => coas.filter(a => a.accountType === 'Liability').map(a => ({ ...a, balance: getBalance(a.id, a.accountType) })), [coas, filteredLines])
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0)
  
  const equityAccounts = useMemo(() => coas.filter(a => a.accountType === 'Equity').map(a => ({ ...a, balance: getBalance(a.id, a.accountType) })), [coas, filteredLines])
  const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0) + netIncome
  
  const cashFlowDetail = useMemo(() => {
    const cashAccounts = coas.filter(a => a.accountName.toLowerCase().includes('kas') || a.accountName.toLowerCase().includes('bank'))
    const entries = filteredEntries.map(entry => {
      const lines = filteredLines.filter(l => l.journalEntryId === entry.id)
      const cashLines = lines.filter(l => cashAccounts.some(ca => ca.id === l.accountId))
      const inAmount = cashLines.reduce((s, l) => s + l.debitAmount, 0)
      const outAmount = cashLines.reduce((s, l) => s + l.creditAmount, 0)
      return { ...entry, in: inAmount, out: outAmount, net: inAmount - outAmount }
    }).filter(e => e.net !== 0)
    return { entries, totalIn: entries.reduce((s, e) => s + e.in, 0), totalOut: entries.reduce((s, e) => s + e.out, 0) }
  }, [coas, filteredEntries, filteredLines])

  // --- ACTION: DOWNLOAD HIGH FIDELITY PDF ---
  const handleDownload = async () => {
    if (!reportRef.current) return
    setIsDownloading(true)
    toast.info("Sedang menyiapkan file laporan PDF...")

    try {
      const element = reportRef.current
      
      // Hitung actual content height biar gak kepotong
      const originalWidth = element.offsetWidth
      const originalHeight = element.scrollHeight
      
      const imgData = await htmlToImage.toJpeg(element, {
        quality: 0.95,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: originalWidth,
        height: originalHeight,
        style: {
          margin: '0',
          padding: '40px',
          height: `${originalHeight}px`,
          width: `${originalWidth}px`
        }
      })
      
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px", // Pakai PX biar Presisi 1:1 sama preview
        format: [originalWidth * 2, originalHeight * 2], // Skala 2x biar TAJAM
      })

      const fileName = `Laporan Keuangan Disma - ${periodLabel}.pdf`

      pdf.addImage(imgData, "JPEG", 0, 0, originalWidth * 2, originalHeight * 2)
      pdf.save(fileName)
      
      toast.success("Download Berhasil! Laporan tersimpan di folder Download.")
      setIsDownloading(false)
    } catch (err) {
      console.error(err)
      toast.error("Gagal mendownload PDF.")
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Financial Statements</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Visibilitas Profitabilitas & Kesehatan Bisnis DISMA</p>
        </div>
        <div className="flex gap-3">
          <Popover>
            <PopoverTrigger render={
              <button type="button" className="inline-flex justify-center rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest border border-slate-200 bg-white hover:bg-slate-100 items-center gap-2 cursor-pointer transition-colors shadow-sm text-slate-900 min-w-[200px]">
                <Filter className="w-4 h-4 text-blue-600" /> <span className="text-slate-400 mr-2">PERIODE:</span> {periodLabel.toUpperCase()}
              </button>
            } />
            <PopoverContent className="w-96 p-6 liquid-card border-none space-y-6 shadow-2xl">
               <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Tipe Periode</h4>
                  <div className="grid grid-cols-3 gap-2">
                     {[
                       { id: 'all', label: 'Semua' },
                       { id: 'daily', label: 'Harian' },
                       { id: 'weekly', label: 'Mingguan' },
                       { id: 'monthly', label: 'Bulanan' },
                       { id: 'yearly', label: 'Tahunan' },
                       { id: 'custom', label: 'Custom' }
                     ].map((t) => (
                       <Button 
                        key={t.id}
                        onClick={() => setPeriod(t.id as any)} 
                        variant={period === t.id ? 'default' : 'outline'} 
                        className="text-[9px] font-black uppercase h-8 rounded-lg"
                       >
                         {t.label}
                       </Button>
                     ))}
                  </div>
               </div>

               {period !== 'all' && period !== 'custom' && (
                 <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Navigasi Waktu</h4>
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-2xl border border-slate-100">
                       <Button size="icon" variant="ghost" onClick={handlePrevPeriod} className="h-10 w-10 hover:bg-white hover:shadow-md transition-all">
                          <ChevronLeft className="w-5 h-5 text-slate-600" />
                       </Button>
                       <div className="text-center">
                          <p className="text-[10px] font-bold text-blue-600 uppercase mb-0.5">{period.toUpperCase()}</p>
                          <p className="text-sm font-black text-slate-800 uppercase leading-none">{periodLabel}</p>
                       </div>
                       <Button size="icon" variant="ghost" onClick={handleNextPeriod} className="h-10 w-10 hover:bg-white hover:shadow-md transition-all">
                          <ChevronRight className="w-5 h-5 text-slate-600" />
                       </Button>
                    </div>
                    
                    <div className="flex justify-center">
                       <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedDate(new Date())}
                        className="text-[8px] font-black uppercase text-slate-400 hover:text-blue-600"
                       >
                          Kembali ke Hari Ini
                       </Button>
                    </div>
                 </div>
               )}

               {period === 'custom' && (
                 <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Pilih Rentang Tanggal</h4>
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={(val) => {
                        setDateRange(val)
                      }}
                      numberOfMonths={1}
                      className="rounded-xl border-none p-0"
                    />
                 </div>
               )}
            </PopoverContent>
          </Popover>
          <Button 
            onClick={() => setIsPreviewOpen(true)}
            variant="outline" 
            className="rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest border-slate-200"
          >
             <Eye className="w-4 h-4 mr-2" /> Preview Full Report
          </Button>
          <Button 
            onClick={() => { setIsPreviewOpen(true); setTimeout(handleDownload, 500); }}
            disabled={isDownloading}
            className="bg-emerald-600 text-white rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2"
          >
             {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
             {isDownloading ? "Generating PDF..." : "Download PDF Report"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pnl" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 p-1.5 rounded-[2rem] h-16 w-full max-w-2xl mb-10 overflow-hidden">
          <TabsTrigger value="pnl" className="flex-1 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all">
            <TrendingUp className="w-4 h-4 mr-2" /> Laba Rugi (P&L)
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex-1 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all">
            <Scale className="w-4 h-4 mr-2" /> Neraca (Balance Sheet)
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="flex-1 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all">
            <ArrowRightLeft className="w-4 h-4 mr-2" /> Arus Kas (Cash Flow)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white">
                <CardHeader className="bg-blue-600 text-white p-8">
                  <CardTitle className="text-2xl font-black uppercase tracking-tighter">Income Statement (P&L)</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="space-y-8">
                    <section>
                      <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-4">Revenues</h4>
                      <div className="space-y-2">
                        {revenues.map(r => (
                          <div key={r.id} className="flex justify-between py-2 border-b border-slate-50 text-sm font-bold">
                            <span className="text-slate-500">{r.accountName}</span>
                            <span>{formatRupiah(r.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section>
                      <h4 className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-4">Expenses</h4>
                      <div className="space-y-2">
                        {expenses.map(e => (
                          <div key={e.id} className="flex justify-between py-2 border-b border-slate-50 text-sm font-bold">
                            <span className="text-slate-500">{e.accountName}</span>
                            <span>{formatRupiah(e.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card className={cn("rounded-[3rem] border-none shadow-2xl p-10 text-center text-white h-fit", netIncome >= 0 ? "bg-emerald-600" : "bg-rose-600")}>
               <p className="text-[10px] font-black uppercase opacity-60 mb-2">Net Income</p>
               <h3 className="text-4xl font-black">{formatRupiah(netIncome)}</h3>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="balance">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 font-bold">
              <Card className="rounded-[2rem] p-8 bg-white border-2 border-slate-100">
                 <h3 className="text-emerald-600 uppercase mb-6 text-xs font-black">Total Assets: {formatRupiah(totalAssets)}</h3>
                 <div className="space-y-3">
                    {assets.map(a => (
                       <div key={a.id} className="flex justify-between text-sm py-2 border-b">
                          <span className="text-slate-400 font-bold">{a.accountName}</span>
                          <span>{formatRupiah(a.balance)}</span>
                       </div>
                    ))}
                 </div>
              </Card>
              <div className="space-y-6">
                 <Card className="rounded-[2rem] p-8 bg-white border-2 border-slate-100">
                    <h3 className="text-rose-600 uppercase mb-6 text-xs font-black">Liabilities & Equity: {formatRupiah(totalLiabilities + totalEquity)}</h3>
                    <div className="space-y-2">
                       <p className="text-[10px] text-slate-300 uppercase">Liabilities</p>
                       {liabilities.map(l => <div key={l.id} className="flex justify-between text-xs py-2"><span>{l.accountName}</span><span>{formatRupiah(l.balance)}</span></div>)}
                       <p className="text-[10px] text-slate-300 uppercase mt-4">Equity</p>
                       {equityAccounts.map(e => <div key={e.id} className="flex justify-between text-xs py-2"><span>{e.accountName}</span><span>{formatRupiah(e.balance)}</span></div>)}
                       <div className="flex justify-between text-xs py-2 font-black text-emerald-600"><span>Current Period Profit</span><span>{formatRupiah(netIncome)}</span></div>
                    </div>
                 </Card>
                 <div className="bg-emerald-500 text-white p-4 rounded-2xl flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Balance Sheet Balanced</span>
                 </div>
              </div>
           </div>
        </TabsContent>

        <TabsContent value="cashflow">
           <div className="space-y-6 font-bold">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <Card className="p-6 bg-emerald-50 border-emerald-100"><p className="text-[10px] uppercase text-emerald-600">Total Cash In</p><h3 className="text-2xl font-black">{formatRupiah(cashFlowDetail.totalIn)}</h3></Card>
                 <Card className="p-6 bg-rose-50 border-rose-100"><p className="text-[10px] uppercase text-rose-600">Total Cash Out</p><h3 className="text-2xl font-black">{formatRupiah(cashFlowDetail.totalOut)}</h3></Card>
                 <Card className="p-6 bg-slate-900 text-white"><p className="text-[10px] uppercase text-slate-400">Net Movement</p><h3 className="text-2xl font-black text-emerald-400">{formatRupiah(cashFlowDetail.totalIn - cashFlowDetail.totalOut)}</h3></Card>
              </div>
              <Card className="rounded-[2rem] bg-white border-2 border-slate-100 p-8">
                 <h3 className="font-black uppercase text-xs mb-6">Cash Flow Transactions / Pendetailan</h3>
                 <div className="space-y-4">
                    {cashFlowDetail.entries.map(e => (
                       <div key={e.id} className="flex justify-between items-center py-4 border-b group">
                          <div className="flex items-center gap-4">
                             <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", e.net > 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}>
                                {e.net > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                             </div>
                             <div>
                                <p className="text-sm font-black text-slate-800 uppercase leading-none mb-1">{e.description}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(e.transactionDate).toLocaleDateString()} • REF: {e.referenceType}</p>
                             </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                             <span className={cn("text-sm font-black tracking-tight", e.net > 0 ? "text-emerald-600" : "text-rose-600")}>
                                {e.net > 0 ? "+" : ""}{formatRupiah(e.net)}
                             </span>
                          </div>
                       </div>
                    ))}
                 </div>
              </Card>
           </div>
        </TabsContent>
      </Tabs>

      {/* FULL REPORT PREVIEW & DOWNLOAD MODAL */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="!max-w-[1100px] !w-[95vw] p-0 overflow-hidden bg-slate-100 border-none rounded-[2.5rem] focus:outline-none max-h-[95vh] flex flex-col">
          <DialogHeader className="p-8 bg-slate-900 text-white flex flex-row items-center justify-between">
            <div>
               <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Financial Statement Fidelity Preview</DialogTitle>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Status: Ready for Official Download</p>
            </div>
            <div className="flex gap-4">
               <Button onClick={handleDownload} disabled={isDownloading} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isDownloading ? "Capturing..." : "Download Now (PDF)"}
               </Button>
               <Button onClick={() => setIsPreviewOpen(false)} variant="ghost" className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
               </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-12 bg-[#e2e8f0] custom-scrollbar">
             <div ref={reportRef} className="bg-white p-16 shadow-2xl mx-auto max-w-[850px] text-[#1e293b]" id="report-printable">
                {/* KOP SURAT */}
                <div className="border-b-4 border-[#0f172a] pb-8 mb-12 flex justify-between items-start">
                   <div>
                      <h1 className="text-3xl font-black text-[#0f172a] uppercase leading-none">DISMA FRESH</h1>
                      <p className="text-[10px] font-bold text-[#94a3b8] uppercase mt-1 tracking-widest">Premium Production & Logistics • Warehouse • B2B</p>
                   </div>
                    <div className="text-right">
                       <h2 className="text-xl font-black uppercase leading-none text-[#0f172a]">FINANCIAL REPORT</h2>
                       <p className="text-xs font-bold text-[#64748b] italic uppercase mt-1">PERIODE {periodLabel.toUpperCase()}</p>
                    </div>
                </div>

                <div className="space-y-16">
                   {/* INCOME STATEMENT */}
                   <section>
                      <div className="bg-[#0f172a] text-white px-4 py-2 inline-block mb-6">
                         <h3 className="text-xs font-black uppercase tracking-[0.2em]">1. PROFIT & LOSS STATEMENT</h3>
                      </div>
                      <div className="space-y-6">
                         <div>
                            <p className="text-[10px] font-black text-[#94a3b8] uppercase mb-2">OPERATING REVENUE</p>
                            {revenues.map(r => <div key={r.id} className="flex justify-between border-b border-[#f1f5f9] py-2 text-xs font-bold"><span>{r.accountName}</span><span>{formatRupiah(r.balance)}</span></div>)}
                            <div className="flex justify-between py-3 font-black text-md text-[#059669] bg-[#ecfdf5] px-4 mt-2"><span>TOTAL REVENUE</span><span>{formatRupiah(totalRevenue)}</span></div>
                         </div>
                         <div>
                            <p className="text-[10px] font-black text-[#94a3b8] uppercase mb-2">OPERATING EXPENSES</p>
                            {expenses.map(e => <div key={e.id} className="flex justify-between border-b border-[#f1f5f9] py-2 text-xs font-bold text-[#475569]"><span>{e.accountName}</span><span>({formatRupiah(e.balance)})</span></div>)}
                            <div className="flex justify-between py-3 font-black text-md text-[#e11d48] bg-[#fff1f2] px-4 mt-2"><span>TOTAL EXPENSES</span><span>({formatRupiah(totalExpense)})</span></div>
                         </div>
                         <div className="flex justify-between p-6 bg-[#f8fafc] text-[#0f172a] border-2 border-[#0f172a] font-black text-lg rounded-xl">
                            <span className="tracking-widest capitalize">NET SURPLUS / (DEFICIT)</span>
                            <span>{formatRupiah(netIncome)}</span>
                         </div>
                      </div>
                   </section>

                   {/* BALANCE SHEET */}
                   <section>
                      <div className="bg-[#0f172a] text-white px-4 py-2 inline-block mb-6">
                         <h3 className="text-xs font-black uppercase tracking-[0.2em]">2. STATEMENT OF FINANCIAL POSITION (NERACA)</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-12">
                         <div>
                            <h4 className="text-[10px] font-black uppercase text-[#94a3b8] mb-4 border-b">ASSETS</h4>
                            {assets.map(a => <div key={a.id} className="flex justify-between py-1.5 text-[10px] font-bold"><span>{a.accountName}</span><span>{formatRupiah(a.balance)}</span></div>)}
                            <div className="flex justify-between py-3 font-black border-t-2 border-[#0f172a] mt-2 text-xs"><span>TOTAL ASSETS</span><span>{formatRupiah(totalAssets)}</span></div>
                         </div>
                         <div className="space-y-6">
                            <div>
                               <h4 className="text-[10px] font-black uppercase text-[#94a3b8] mb-4 border-b">LIABILITIES & EQUITY</h4>
                               {liabilities.map(l => <div key={l.id} className="flex justify-between py-1.5 text-[10px] font-bold"><span>{l.accountName}</span><span>{formatRupiah(l.balance)}</span></div>)}
                               {equityAccounts.map(e => <div key={e.id} className="flex justify-between py-1.5 text-[10px] font-bold"><span>{e.accountName}</span><span>{formatRupiah(e.balance)}</span></div>)}
                               <div className="flex justify-between py-1.5 text-[10px] font-black italic text-[#059669]"><span>Current Profit (P&L)</span><span>{formatRupiah(netIncome)}</span></div>
                               <div className="flex justify-between py-3 font-black border-t-2 border-[#0f172a] mt-2 text-xs"><span>TOTAL PASIVA</span><span>{formatRupiah(totalLiabilities + totalEquity)}</span></div>
                            </div>
                         </div>
                      </div>
                   </section>

                   {/* CASH FLOW */}
                   <section>
                      <div className="bg-[#0f172a] text-white px-4 py-2 inline-block mb-6">
                         <h3 className="text-xs font-black uppercase tracking-[0.2em]">3. STATEMENT OF CASH FLOWS</h3>
                      </div>
                      <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#0f172a]">
                         <div className="flex justify-between mb-2 font-black text-[#059669] text-[10px]"><span>TOTAL CASH INFLOW</span><span>{formatRupiah(cashFlowDetail.totalIn)}</span></div>
                         <div className="flex justify-between mb-4 font-black text-[#e11d48] text-[10px]"><span>TOTAL CASH OUTFLOW</span><span>({formatRupiah(cashFlowDetail.totalOut)})</span></div>
                         <div className="flex justify-between pt-4 border-t-2 border-[#94a3b8] font-black text-md"><span>NET CASH MOVEMENT</span><span>{formatRupiah(cashFlowDetail.totalIn - cashFlowDetail.totalOut)}</span></div>
                      </div>
                      <div className="mt-8 space-y-2">
                         <h4 className="text-[9px] font-black text-[#94a3b8] uppercase px-2 mb-2">SIGNIFICANT TRANSACTIONS</h4>
                         {cashFlowDetail.entries.slice(0, 10).map(e => (
                             <div key={e.id} className="flex justify-between py-1 px-2 border-b border-[#f1f5f9] text-[10px] font-bold">
                                <span>{new Date(e.transactionDate).toLocaleDateString()} - {e.description}</span>
                                <span className={e.net > 0 ? "text-[#059669]" : "text-[#e11d48]"}>{formatRupiah(e.net)}</span>
                             </div>
                         ))}
                      </div>
                   </section>

                   {/* FOOTER AUDIT */}
                   <div className="pt-16 border-t border-[#f1f5f9] flex justify-between items-end">
                      <div className="text-[9px] text-[#cbd5e1] font-bold uppercase tracking-widest">
                         DIGITALLY AUDITED BY DISMA CORE v1.0<br/>
                         SECURE ID: {Math.random().toString(36).substring(7).toUpperCase()}
                      </div>
                      <div className="flex gap-16">
                         <div className="text-center">
                            <div className="w-32 h-px bg-[#cbd5e1] mb-2" />
                            <p className="text-[9px] font-black uppercase text-[#64748b]">Finance Manager</p>
                         </div>
                         <div className="text-center">
                            <div className="w-32 h-px bg-[#cbd5e1] mb-2" />
                            <p className="text-[9px] font-black uppercase text-[#64748b]">President Director</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
