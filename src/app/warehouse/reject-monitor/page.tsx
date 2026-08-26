"use client"

import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, Calendar, ClipboardList, User, Package, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { format } from "date-fns"
import { cn, formatRupiah } from "@/lib/utils"

export default function RejectionMonitorPage() {
  const rejectedItems = useAppStore(state => state.rejectedItems)
  const products = useAppStore(state => state.products)
  const users = useAppStore(state => state.users)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredItems = rejectedItems.filter(item => {
    const product = products.find(p => p.id === item.productId)
    return (
      product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reason.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })
  const totalMonetaryLoss = rejectedItems.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId)
    return sum + (item.qty * (product?.basePrice || 0))
  }, 0)
  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 uppercase">Monitor <span className="text-rose-600">Barang Reject</span></h2>
          <p className="text-slate-500 font-bold mt-1 uppercase text-[11px] tracking-widest">Pantau data barang rusak, expired, atau reject dari QC & Retur.</p>
        </div>
        
        <div className="relative w-full md:w-96">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
           <Input 
              placeholder="Cari barang atau alasan..."
              className="pl-12 h-14 rounded-2xl bg-white border-none shadow-sm font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <Card className="liquid-card bg-card shadow-sm">
            <CardContent className="p-6">
               <p className="text-[11px] font-bold uppercase text-slate-400 tracking-widest mb-1">Total Kejadian</p>
               <h3 className="text-3xl font-bold text-slate-900">{rejectedItems.length}</h3>
            </CardContent>
         </Card>
         <Card className="liquid-card bg-rose-500 text-white shadow-sm">
            <CardContent className="p-6">
               <p className="text-[11px] font-bold uppercase text-rose-100 tracking-widest mb-1">Total Unit Reject</p>
               <h3 className="text-3xl font-bold">{rejectedItems.reduce((sum, item) => sum + item.qty, 0)}</h3>
            </CardContent>
         </Card>
         <Card className="liquid-card bg-slate-900 text-white shadow-sm">
            <CardContent className="p-6">
               <p className="text-[11px] font-bold uppercase text-slate-400 tracking-widest mb-1">Estimasi Total Kerugian</p>
               <h3 className="text-3xl font-bold text-rose-400">{formatRupiah(totalMonetaryLoss)}</h3>
            </CardContent>
         </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
         {filteredItems.length === 0 ? (
           <div className="h-64 flex flex-col items-center justify-center text-slate-300">
              <ShieldAlert className="w-12 h-12 opacity-10 mb-4" />
              <p className="font-bold uppercase text-xs tracking-widest">Belum ada data reject</p>
           </div>
         ) : (
           filteredItems.map((item) => {
             const product = products.find(p => p.id === item.productId)
             const reporter = users.find(u => u.id === item.reportedBy)
             
             return (
               <Card key={item.id} className="liquid-card shadow-sm hover:shadow-sm transition-all group overflow-hidden">
                  <CardContent className="p-0 flex flex-col md:flex-row">
                     {item.imageUrl && (
                       <div className="w-full md:w-48 h-48 md:h-auto bg-slate-100 overflow-hidden shrink-0">
                          <img src={item.imageUrl} className="w-full h-full object-cover group- transition-transform duration-150" />
                       </div>
                     )}
                     <div className="p-6 flex-1 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                           <div>
                              <div className="flex items-center gap-2 mb-2">
                                 <Badge className={cn(
                                   "text-[11px] font-bold  border-none",
                                   item.source === 'QC' ? "bg-emerald-100 text-emerald-700" : 
                                   item.source === 'Return' ? "bg-muted text-slate-600" : "bg-slate-100 text-slate-700"
                                 )}>Source: {item.source}</Badge>
                                 <span className="text-[11px] font-bold text-slate-400">{format(new Date(item.date), 'dd MMM yyyy HH:mm')}</span>
                              </div>
                              <h4 className="text-xl font-bold text-slate-900 uppercase leading-none mb-2">{product?.name || 'Unknown Product'}</h4>
                              <p className="text-sm font-bold text-slate-500 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-rose-500" /> 
                                {item.reason}
                              </p>
                           </div>
                           <div className="text-right">
                              <h3 className="text-3xl font-bold text-rose-600">{item.qty}</h3>
                              <p className="text-[11px] font-bold uppercase text-slate-400">{product?.uom}</p>
                              <p className="text-xs font-bold text-rose-500 mt-1">{formatRupiah(item.qty * (product?.basePrice || 0))}</p>
                           </div>
                        </div>
                        
                        <div className="mt-6 pt-6 border-t border-slate-50 flex flex-wrap gap-6 items-center">
                           <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 ">
                              <User className="w-3 h-3" /> Reported by {reporter?.name || 'System'}
                           </div>
                           <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 ">
                              <ClipboardList className="w-3 h-3" /> Ref ID: {item.referenceId?.slice(0,8) || 'N/A'}
                           </div>
                        </div>
                     </div>
                  </CardContent>
               </Card>
             )
           })
         )}
      </div>
    </div>
  )
}
