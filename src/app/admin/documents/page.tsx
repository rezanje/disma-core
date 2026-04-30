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
  ClipboardList, 
  Truck, 
  Users, 
  ShieldCheck,
  Search,
  BookOpen,
  ArrowRight,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import { generateSuratJalan } from "@/lib/pdf"
import { cn } from "@/lib/utils"

type DrawerCategory = 'Sales' | 'Logistics' | 'Master'

export default function DocumentsPage() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const [activeDrawer, setActiveDrawer] = useState<DrawerCategory>('Sales')

  // Logistics: Orders in "Packing" status need SJ
  const packingOrders = salesOrders.filter(so => so.status === 'Packing')
  
  // Sales: Recent Orders (Completed/Delivered)
  const recentOrders = salesOrders.filter(so => ['Terkirim', 'Selesai'].includes(so.status)).slice(0, 10)

  const handlePrintSuratJalan = (poNumber: string) => {
    toast.success(`Menyiapkan Surat Jalan untuk ${poNumber}...`)
    generateSuratJalan(poNumber)
  }

  const drawers = [
    { id: 'Sales', label: 'Laci Penjualan', icon: <Folders className="w-5 h-5" />, sub: 'PO, Invoice, & Order' },
    { id: 'Logistics', label: 'Laci Logistik', icon: <Truck className="w-5 h-5" />, sub: 'Surat Jalan & BAST' },
    { id: 'Master', label: 'Laci Master Data', icon: <BookOpen className="w-5 h-5" />, sub: 'Katalog & Database' },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-800 flex items-center gap-3">
             <Archive className="text-emerald-500 w-8 h-8" /> Digital Document Center
          </h2>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 italic shadow-sm bg-white w-fit px-3 py-1 rounded-full border border-slate-100 italic">
             Ruang Arsip Digital • Terenkripsi & Terintegrasi
          </p>
        </div>
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
           <input 
             type="text" 
             placeholder="Cari dokumen..." 
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
               onClick={() => setActiveDrawer(d.id as DrawerCategory)}
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
           <Card className="rounded-[3.5rem] border-none shadow-2xl shadow-slate-200/50 bg-white/50 backdrop-blur-xl overflow-hidden min-h-[500px]">
              <div className="bg-slate-900 p-10 text-white relative">
                 <div className="relative z-10">
                    <h3 className="text-2xl font-black uppercase tracking-tight">{drawers.find(d => d.id === activeDrawer)?.label}</h3>
                    <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mt-1 italic">Daftar Arsip Aktif & Siap Cetak</p>
                 </div>
                 <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-20">
                    {drawers.find(d => d.id === activeDrawer)?.icon}
                 </div>
              </div>

              <CardContent className="p-10">
                 {activeDrawer === 'Logistics' && (
                    <div className="space-y-6">
                       <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                             <Printer className="w-4 h-4" /> Dokumen Siap Cetak (SJ/BAST)
                          </h4>
                          <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full">{packingOrders.length} Dokumen</span>
                       </div>
                       
                       {packingOrders.length === 0 ? (
                          <div className="py-20 text-center border-4 border-dashed border-slate-50 rounded-[2.5rem] bg-slate-50/30">
                             <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                             <p className="text-sm font-black text-slate-400 uppercase">Belum ada order di status Packing</p>
                             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Selesaikan QC terlebih dahulu</p>
                          </div>
                       ) : (
                          <div className="grid gap-3">
                             {packingOrders.map(so => {
                               const client = clients.find(c => c.id === so.clientId)
                               return (
                                 <div key={so.id} className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-xl transition-all group">
                                    <div className="flex items-center gap-5">
                                       <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:bg-emerald-50 transition-colors">
                                          <FileText className="w-6 h-6 text-slate-400 group-hover:text-emerald-500" />
                                       </div>
                                       <div>
                                          <p className="text-sm font-black text-slate-800 uppercase">{so.poNumber}</p>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{client?.companyName} • {new Date(so.targetDeliveryDate).toLocaleDateString()}</p>
                                       </div>
                                    </div>
                                    <Button 
                                      onClick={() => handlePrintSuratJalan(so.poNumber)}
                                      className="h-12 px-6 rounded-2xl bg-white text-emerald-600 border-2 border-emerald-50 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 font-black uppercase text-[10px] shadow-sm transition-all"
                                    >
                                       Cetak SJ <Printer className="w-4 h-4 ml-2" />
                                    </Button>
                                 </div>
                               )
                             })}
                          </div>
                       )}
                    </div>
                 )}

                 {activeDrawer === 'Sales' && (
                    <div className="space-y-6 text-slate-600">
                       <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                          <ClipboardList className="w-4 h-4" /> Arsip Order Selesai
                       </h4>
                       <div className="grid gap-3">
                          {recentOrders.map(so => (
                             <div key={so.id} className="p-5 rounded-3xl bg-white border border-slate-100 flex items-center justify-between hover:shadow-lg transition-all">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-black text-xs">PO</div>
                                   <div>
                                      <p className="text-sm font-black text-slate-800 uppercase">{so.poNumber}</p>
                                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{so.status}</p>
                                   </div>
                                </div>
                                <div className="flex items-center gap-2">
                                   <Button variant="ghost" size="sm" className="h-10 w-10 rounded-xl hover:bg-emerald-50 text-emerald-600">
                                      <Download className="w-4 h-4" />
                                   </Button>
                                   <Button variant="ghost" size="sm" className="h-10 w-10 rounded-xl hover:bg-slate-50 text-slate-400">
                                      <Printer className="w-4 h-4" />
                                   </Button>
                                </div>
                             </div>
                          ))}
                       </div>
                    </div>
                 )}

                 {activeDrawer === 'Master' && (
                    <div className="grid md:grid-cols-2 gap-6">
                       <div className="p-8 rounded-[2.5rem] bg-emerald-50 border border-emerald-100 group hover:shadow-2xl transition-all cursor-pointer">
                          <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500 text-white flex items-center justify-center mb-6 shadow-xl shadow-emerald-200">
                             <Download className="w-8 h-8" />
                          </div>
                          <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Katalog Produk</h4>
                          <p className="text-xs font-bold text-slate-500 uppercase mt-2 leading-relaxed">Download database master SKU dalam format Excel/PDF untuk inventori.</p>
                          <Button className="mt-8 h-12 w-full rounded-2xl bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-500 hover:text-white font-black uppercase text-[10px] tracking-widest group-hover:scale-105 transition-all">
                             Export Catalog <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                       </div>

                       <div className="p-8 rounded-[2.5rem] bg-blue-50 border border-blue-100 group hover:shadow-2xl transition-all cursor-pointer">
                          <div className="w-16 h-16 rounded-[1.5rem] bg-blue-500 text-white flex items-center justify-center mb-6 shadow-xl shadow-blue-200">
                             <Users className="w-8 h-8" />
                          </div>
                          <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Database Client</h4>
                          <p className="text-xs font-bold text-slate-500 uppercase mt-2 leading-relaxed">Export daftar pelanggan tetap & syarat pembayaran (Terms) aktif.</p>
                          <Button className="mt-8 h-12 w-full rounded-2xl bg-white text-blue-600 border border-blue-200 hover:bg-blue-500 hover:text-white font-black uppercase text-[10px] tracking-widest group-hover:scale-105 transition-all">
                             Export Clients <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                       </div>
                    </div>
                 )}
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}

