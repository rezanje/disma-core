"use client"

import React, { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { formatRupiah } from '@/lib/utils'
import { format, differenceInDays } from 'date-fns'
import { 
  History, Search, Filter, AlertTriangle, 
  CheckCircle2, Clock, Phone, Mail, 
  ChevronRight, ArrowUpRight, MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Invoice, Client } from '@/types'
import { toast } from 'sonner'
import UniversalPDFPreview from '@/components/finance/UniversalPDFPreview'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ARCollectionsPage() {
  const { invoices, clients, updateInvoice } = useAppStore()
  const [activeTab, setActiveTab] = useState<string>("invoice")
  const [search, setSearch] = useState('')
  const [filterAging, setFilterAging] = useState<'all' | '30' | '60' | '90+'>('all')
  const [invoicePreview, setInvoicePreview] = useState<{ id: string, isConsolidated: boolean } | null>(null)

  // 1. Get only unpaid invoices
  const outstandingInvoices = useMemo(() => {
    return invoices.filter(inv => inv.status !== 'Paid' && inv.totalAmount > inv.amountPaid)
  }, [invoices])

  // 2. Add client info and aging days to invoices
  const enrichedInvoices = useMemo(() => {
    return outstandingInvoices.map(inv => {
      const client = clients.find(c => c.id === inv.clientId)
      const agingDays = differenceInDays(new Date(), new Date(inv.dueDate))
      return {
        ...inv,
        clientName: client?.companyName || 'Unknown Client',
        clientPic: client?.picName || '-',
        clientPhone: client?.phone || '-',
        agingDays
      }
    })
  }, [outstandingInvoices, clients])

  // 3. Filter and search
  const filteredInvoices = useMemo(() => {
    return enrichedInvoices.filter(inv => {
      const matchesSearch = inv.clientName.toLowerCase().includes(search.toLowerCase()) || 
                           inv.id.toLowerCase().includes(search.toLowerCase())
      
      let matchesAging = true
      if (filterAging === '30') matchesAging = inv.agingDays > 0 && inv.agingDays <= 30
      if (filterAging === '60') matchesAging = inv.agingDays > 30 && inv.agingDays <= 60
      if (filterAging === '90+') matchesAging = inv.agingDays > 60

      return matchesSearch && matchesAging
    }).sort((a, b) => (b.totalAmount - b.amountPaid) - (a.totalAmount - a.amountPaid))
  }, [enrichedInvoices, search, filterAging])

  // Stats for cards
  const stats = useMemo(() => {
    const total = filteredInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
    const overdueCount = enrichedInvoices.filter(inv => inv.agingDays > 0).length
    const criticalCount = enrichedInvoices.filter(inv => inv.agingDays > 60).length
    return { total, overdueCount, criticalCount }
  }, [filteredInvoices, enrichedInvoices])

  const groupedClients = useMemo(() => {
    const map = new Map<string, {
      client: Client
      totalDebt: number
      invoiceCount: number
      invoices: typeof enrichedInvoices
    }>()

    enrichedInvoices.forEach(inv => {
      const client = clients.find(c => c.id === inv.clientId)
      if (!client) return
      
      const unpaidAmount = inv.totalAmount - inv.amountPaid
      if (unpaidAmount <= 0) return

      if (!map.has(client.id)) {
        map.set(client.id, {
          client,
          totalDebt: 0,
          invoiceCount: 0,
          invoices: []
        })
      }

      const entry = map.get(client.id)!
      entry.totalDebt += unpaidAmount
      entry.invoiceCount += 1
      entry.invoices.push(inv)
    })

    return Array.from(map.values())
      .filter(item => item.client.companyName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.totalDebt - a.totalDebt)
  }, [enrichedInvoices, clients, search])

  const handleRemind = async (invId: string) => {
    toast.success("Reminder request sent to system queue")
    await updateInvoice(invId, { lastRemindedAt: new Date().toISOString() })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Daily Chase</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">AR Collections Command Center</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="liquid-card border-none shadow-xl bg-slate-900 text-white">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Outstanding Portfolio</p>
            <h3 className="text-2xl font-black">{formatRupiah(stats.total)}</h3>
            <div className="flex items-center gap-2 mt-2">
               <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[8px] font-black uppercase">Realtime Sync</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="liquid-card border-none shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Overdue Invoices</p>
            <h3 className="text-2xl font-black text-rose-600">{stats.overdueCount} Tagihan</h3>
          </CardContent>
        </Card>
        <Card className="liquid-card border-none shadow-xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Critical (&gt;60 Days)</p>
            <h3 className="text-2xl font-black text-rose-800">{stats.criticalCount} Tagihan</h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Input 
            placeholder="Cari client atau nomor invoice..." 
            className="h-14 pl-12 rounded-full bg-white border-none shadow-lg font-bold text-slate-700 focus-visible:ring-indigo-500/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        </div>
        <div className="flex gap-2">
           {['all', '30', '60', '90+'].map((age) => (
             <Button
               key={age}
               variant={filterAging === age ? 'default' : 'outline'}
               className={cn(
                 "flex-1 h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
                 filterAging === age ? "bg-indigo-600 shadow-lg shadow-indigo-200" : "bg-white border-none shadow-md hover:bg-slate-50"
               )}
               onClick={() => setFilterAging(age as any)}
             >
               {age === 'all' ? 'Semua' : `${age}D`}
             </Button>
           ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-2xl h-12 w-fit mb-4">
          <TabsTrigger value="invoice" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Invoice Individual
          </TabsTrigger>
          <TabsTrigger value="client" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Rekap per Klien
          </TabsTrigger>
          <TabsTrigger value="alert" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Alert Jatuh Tempo
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="invoice" className="m-0">
          <div className="liquid-card overflow-hidden bg-white border border-slate-100 shadow-xl rounded-[2.5rem]">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-8 py-6 font-black text-[10px] uppercase text-indigo-600">Invoice & Client</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 text-center">Aging Status</TableHead>
                  <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Amount Due</TableHead>
                  <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Last Follow-up</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                       <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Semua tagihan aman atau filter tidak ditemukan.</p>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
                      <TableCell className="pl-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-base">{inv.clientName}</span>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded-md">#{inv.id.substring(0,8)}</span>
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[150px]">{inv.clientPic}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                         <div className="flex flex-col items-center">
                            <Badge className={cn(
                              "text-[9px] font-black uppercase rounded-full px-3 py-1 border shadow-sm",
                              inv.agingDays <= 0 ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                              inv.agingDays <= 30 ? "bg-amber-100 text-amber-700 border-amber-200" :
                              "bg-rose-100 text-rose-700 border-rose-200"
                            )}>
                              {inv.agingDays <= 0 ? 'Not Overdue' : `${inv.agingDays} Days Late`}
                            </Badge>
                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Due: {format(new Date(inv.dueDate), 'dd MMM')}</span>
                         </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-lg">{formatRupiah(inv.totalAmount - inv.amountPaid)}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">of {formatRupiah(inv.totalAmount)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                           {inv.lastRemindedAt ? format(new Date(inv.lastRemindedAt), 'dd MMM HH:mm') : 'Never'}
                         </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                           <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-10 w-10 rounded-full text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setInvoicePreview({ id: inv.id, isConsolidated: inv.isConsolidated || false })}
                           >
                             <ArrowUpRight className="w-5 h-5" />
                           </Button>
                           <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-10 w-10 rounded-full text-emerald-600 hover:bg-emerald-50"
                            onClick={() => handleRemind(inv.id)}
                           >
                             <MessageSquare className="w-5 h-5" />
                           </Button>
                           <a href={`tel:${inv.clientPhone}`} className="h-10 w-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                             <Phone className="w-4 h-4" />
                           </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        <TabsContent value="client" className="m-0">
          <div className="liquid-card overflow-hidden bg-white border border-slate-100 shadow-xl rounded-[2.5rem]">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="pl-8 py-6 font-black text-[10px] uppercase text-indigo-600">Client & Contact</TableHead>
                  <TableHead className="font-black text-[10px] uppercase text-slate-400 text-center">Unpaid Invoices</TableHead>
                  <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Total Outstanding AR</TableHead>
                  <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No client debt records found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedClients.map(({ client, totalDebt, invoiceCount, invoices: clientInvs }) => (
                    <TableRow key={client.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
                      <TableCell className="pl-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 text-base">{client.companyName}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PIC: {client.picName} ({client.phone || '-'})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-indigo-100 text-indigo-700 border-none text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                          {invoiceCount} Tagihan
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-900 text-lg">
                        {formatRupiah(totalDebt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-10 w-10 rounded-full text-emerald-600 hover:bg-emerald-50"
                            onClick={() => {
                              const message = `Halo Kak/Bapak/Ibu di *${client.companyName}*,\n\nKami dari *Disma Fresh* ingin menginformasikan rekap tagihan tertunggak berikut:\n` +
                                clientInvs.map((inv, idx) => `${idx + 1}. Invoice #${inv.id.substring(0,8)} sebesar *${formatRupiah(inv.totalAmount - inv.amountPaid)}* (Jatuh Tempo: ${format(new Date(inv.dueDate), 'd MMM yyyy')})`).join('\n') +
                                `\n\n*Total Akumulasi Piutang: ${formatRupiah(totalDebt)}*\n\nMohon kesediaannya untuk melakukan pembayaran. Terima kasih banyak! 🙏😊`;
                              
                              let formattedPhone = (client.phone || '').replace(/[^0-9]/g, '');
                              if (formattedPhone.startsWith('0')) {
                                formattedPhone = '62' + formattedPhone.slice(1);
                              }
                              if (formattedPhone) {
                                window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
                              } else {
                                toast.error("Nomor WA tidak valid");
                              }
                            }}
                          >
                            <MessageSquare className="w-5 h-5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        <TabsContent value="alert" className="m-0">
          {/* Overdue alerts table */}
        </TabsContent>
      </Tabs>

      {invoicePreview && (
        <UniversalPDFPreview 
          isOpen={!!invoicePreview}
          onClose={() => setInvoicePreview(null)}
          invoiceId={invoicePreview.id}
          isConsolidated={invoicePreview.isConsolidated}
        />
      )}
    </div>
  )
}
