"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Printer, 
  FileText, 
  Download, 
  FolderLock, 
  Folders, 
  Archive, 
  Search,
  ChevronRight,
  Receipt,
  CreditCard,
  History,
  ImageIcon,
  Eye,
  ArrowUpRight
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type FinanceDrawerCategory = 'Expenses' | 'Payments' | 'Invoices'

export default function FinanceDocumentsPage() {
  const expenses = useAppStore(state => state.expenses)
  const cashTransactions = useAppStore(state => state.cashTransactions)
  const invoices = useAppStore(state => state.invoices)
  const clients = useAppStore(state => state.clients)
  const users = useAppStore(state => state.users)
  
  const [activeDrawer, setActiveDrawer] = useState<FinanceDrawerCategory>('Expenses')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // Categorized Documents
  const receipts = expenses.filter(e => e.receiptUrl).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const paymentProofs = cashTransactions.filter(tx => tx.receiptUrl).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  
  // Recent Invoices
  const recentInvoices = [...invoices].sort((a,b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())

  const drawers = [
    { id: 'Expenses', label: 'Laci Pengeluaran', icon: <Receipt className="w-5 h-5" />, sub: 'Nota Sourcing & Ops' },
    { id: 'Payments', label: 'Laci Bukti Bayar', icon: <CreditCard className="w-5 h-5" />, sub: 'Transfer & Reimburse' },
    { id: 'Invoices', label: 'Laci Digital Invoice', icon: <FileText className="w-5 h-5" />, sub: 'Tagihan Klien Terarsip' },
  ]

  const handlePreview = (url: string) => {
    setPreviewImage(url)
  }

  const handleDownload = (id: string) => {
    toast.success(`Mengunduh dokumen ${id.slice(0,8)}...`)
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 flex items-center gap-3">
             <Archive className="text-emerald-500 w-8 h-8" /> Finance File Cabinet
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic shadow-sm bg-white w-fit px-3 py-1 rounded-full border border-slate-100">
             Ruang Arsip Keuangan • Laci Digital
          </p>
        </div>
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
           <input 
             type="text" 
             value={search}
             onChange={(e) => setSearch(e.target.value)}
             placeholder="Cari arsip..." 
             className="h-12 pl-10 pr-6 rounded-2xl border-none bg-white shadow-sm font-bold text-xs ring-1 ring-slate-100 focus:ring-2 focus:ring-emerald-500 transition-all w-64"
           />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Drawer Selector */}
        <div className="w-full lg:w-80 space-y-4">
           {drawers.map((d) => (
             <button
               key={d.id}
               onClick={() => setActiveDrawer(d.id as FinanceDrawerCategory)}
               className={cn(
                 "w-full text-left p-6 rounded-[2.5rem] transition-all duration-300 relative overflow-hidden group border",
                 activeDrawer === d.id 
                  ? "bg-slate-900 border-slate-800 shadow-2xl scale-[1.02] -translate-y-1" 
                  : "bg-white border-white hover:border-slate-200 hover:shadow-lg"
               )}
             >
                <div className="flex items-center gap-4 relative z-10">
                   <div className={cn(
                     "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                     activeDrawer === d.id ? "bg-emerald-500 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500"
                   )}>
                      {d.icon}
                   </div>
                   <div>
                      <h4 className={cn(
                         "font-black text-sm uppercase tracking-tight leading-none",
                         activeDrawer === d.id ? "text-white" : "text-slate-700"
                      )}>{d.label}</h4>
                      <p className={cn(
                         "text-[10px] font-bold uppercase tracking-widest mt-1",
                         activeDrawer === d.id ? "text-slate-400" : "text-slate-400"
                      )}>{d.sub}</p>
                   </div>
                </div>
                {activeDrawer === d.id && (
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                     <FolderLock className="w-24 h-24 text-white" />
                  </div>
                )}
             </button>
           ))}
        </div>

        {/* Active Content: The "Open Drawer" View */}
        <div className="flex-1 min-w-0">
           <Card className="rounded-[3.5rem] border-none shadow-2xl shadow-slate-200/50 bg-white/50 backdrop-blur-xl overflow-hidden min-h-[600px]">
              <div className="bg-slate-900 p-10 text-white relative h-32 flex items-center">
                 <div className="relative z-10">
                    <h3 className="text-2xl font-black uppercase tracking-tight">{drawers.find(d => d.id === activeDrawer)?.label}</h3>
                    <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mt-1 italic">Arsip Digital & Bukti Otentik</p>
                 </div>
                 <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-20">
                    {drawers.find(d => d.id === activeDrawer)?.icon}
                 </div>
              </div>

              <CardContent className="p-8">
                 {/* SEARCH RESULTS / LIST */}
                 <div className="grid gap-4">
                   {activeDrawer === 'Expenses' && (
                     <>
                       {receipts.length === 0 ? (
                         <div className="py-20 text-center border-4 border-dashed border-slate-50 rounded-[2.5rem] bg-slate-50/20">
                            <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Belum ada nota terarsip</p>
                         </div>
                       ) : (
                         receipts.map(exp => (
                           <div key={exp.id} className="p-5 rounded-3xl bg-white border border-slate-100 flex items-center justify-between hover:shadow-xl hover:scale-[1.01] transition-all group">
                              <div className="flex items-center gap-5">
                                 <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                    <Receipt className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" />
                                 </div>
                                 <div>
                                    <p className="text-sm font-black text-slate-800 uppercase line-clamp-1">{exp.description}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                       <span className="text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-md">{exp.category}</span>
                                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                          {new Date(exp.date).toLocaleDateString()} • {users.find(u => u.id === exp.reporterId)?.name}
                                       </span>
                                    </div>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <Button variant="ghost" size="sm" onClick={() => handlePreview(exp.receiptUrl!)} className="rounded-xl hover:bg-emerald-50 text-emerald-600 font-bold text-[10px] px-4">
                                    LIHAT <Eye className="w-3 h-3 ml-2" />
                                 </Button>
                                 <Button variant="ghost" size="sm" onClick={() => handleDownload(exp.id)} className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400">
                                    <Download className="w-4 h-4" />
                                 </Button>
                              </div>
                           </div>
                         ))
                       )}
                     </>
                   )}

                   {activeDrawer === 'Payments' && (
                     <>
                       {paymentProofs.length === 0 ? (
                         <div className="py-20 text-center border-4 border-dashed border-slate-50 rounded-[2.5rem] bg-slate-50/20">
                            <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Belum ada bukti transfer terunggah</p>
                         </div>
                       ) : (
                         paymentProofs.map(tx => (
                           <div key={tx.id} className="p-5 rounded-3xl bg-white border border-slate-100 flex items-center justify-between hover:shadow-xl hover:scale-[1.01] transition-all group">
                              <div className="flex items-center gap-5">
                                 <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                    <ImageIcon className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" />
                                 </div>
                                 <div>
                                    <p className="text-sm font-black text-slate-800 uppercase line-clamp-1">{tx.description}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                       <span className={cn(
                                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md",
                                          tx.type === 'In' ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                                       )}>{tx.category}</span>
                                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                          {new Date(tx.date).toLocaleDateString()} • {tx.counterpartName || 'Internal'}
                                       </span>
                                    </div>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 <Button variant="ghost" size="sm" onClick={() => handlePreview(tx.receiptUrl!)} className="rounded-xl hover:bg-emerald-50 text-emerald-600 font-bold text-[10px] px-4">
                                    LIHAT <Eye className="w-3 h-3 ml-2" />
                                 </Button>
                                 <Button variant="ghost" size="sm" onClick={() => handleDownload(tx.id)} className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400">
                                    <Download className="w-4 h-4" />
                                 </Button>
                              </div>
                           </div>
                         ))
                       )}
                     </>
                   )}

                   {activeDrawer === 'Invoices' && (
                     <>
                        <div className="grid md:grid-cols-2 gap-4">
                           {recentInvoices.map(inv => {
                              const client = clients.find(c => c.id === inv.clientId)
                              return (
                                 <div key={inv.id} className="p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-xl transition-all group relative overflow-hidden">
                                    <div className="flex justify-between items-start relative z-10">
                                       <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
                                          <FileText className="w-6 h-6 text-emerald-500" />
                                       </div>
                                       <div className={cn(
                                          "text-[9px] font-black uppercase rounded-lg border-none px-2 py-1 flex items-center justify-center",
                                          inv.status === 'Paid' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                                       )}>
                                          {inv.status}
                                       </div>
                                    </div>
                                    <h4 className="text-lg font-black text-slate-800 tracking-tight uppercase leading-none">INV-{inv.id.slice(0,8)}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{client?.companyName}</p>
                                    
                                    <div className="mt-6 flex gap-2">
                                       <Button className="flex-1 rounded-xl bg-slate-900 hover:bg-black text-white text-[9px] font-black uppercase h-10">
                                          Download PDF <ArrowUpRight className="w-3 h-3 ml-1" />
                                       </Button>
                                       <Button variant="outline" className="w-10 h-10 rounded-xl border-slate-200">
                                          <Printer className="w-4 h-4 text-slate-400" />
                                       </Button>
                                    </div>
                                 </div>
                              )
                           })}
                        </div>
                     </>
                   )}
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>

      {/* PREVIEW DIALOG */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl w-[95vw] border-none rounded-[2rem] p-0 overflow-hidden bg-slate-100 shadow-2xl">
          <DialogHeader className="p-6 absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-slate-900/40 to-transparent">
             <DialogTitle className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2 drop-shadow-md">
                <ImageIcon className="w-4 h-4 text-emerald-400" /> Preview Dokumen
             </DialogTitle>
          </DialogHeader>
          <div className="w-full h-[75vh] md:h-[80vh] overflow-auto flex items-start justify-center p-4 pt-20 bg-slate-900/5">
             {previewImage && (
                <img 
                   src={previewImage} 
                   className="w-full h-auto shadow-2xl rounded-xl object-contain min-h-full" 
                   alt="Preview Digital" 
                />
             )}
          </div>
          <div className="p-4 bg-white flex justify-center border-t border-slate-100">
             <Button 
                className="rounded-2xl bg-slate-900 hover:bg-black text-white font-black px-12 h-12" 
                onClick={() => setPreviewImage(null)}
             >
                Tutup Preview
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
