"use client"

import { useMemo, useState } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trophy, AlertTriangle, Search, Phone, MessageSquare, Clock, TrendingUp, Users } from "lucide-react"
import { format, differenceInDays, parseISO } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { cn, formatRupiah, formatRupiahShort } from "@/lib/utils"
import type { Invoice, Client } from "@/types"
import AuthGuard from "@/components/auth/auth-guard"

type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'

const BUCKET_LABEL: Record<AgingBucket, string> = {
  'current': 'Belum Jatuh Tempo',
  '1-30': '1–30 hari',
  '31-60': '31–60 hari',
  '61-90': '61–90 hari',
  '90+': '90+ hari',
}

const BUCKET_COLOR: Record<AgingBucket, string> = {
  'current': 'bg-emerald-50 text-emerald-600',
  '1-30': 'bg-amber-100 text-amber-500',
  '31-60': 'bg-amber-100 text-amber-500',
  '61-90': 'bg-rose-50 text-rose-500',
  '90+': 'bg-rose-50 text-rose-700',
}

/** Warna batang umur — makin tua makin gelap, bukan makin ramai. */
const BUCKET_BAR: Record<AgingBucket, string> = {
  'current': 'bg-emerald-600',
  '1-30': 'bg-amber-400',
  '31-60': 'bg-amber-500',
  '61-90': 'bg-rose-500',
  '90+': 'bg-rose-700',
}

function getAgingBucket(agingDays: number): AgingBucket {
  if (agingDays <= 0) return 'current'
  if (agingDays <= 30) return '1-30'
  if (agingDays <= 60) return '31-60'
  if (agingDays <= 90) return '61-90'
  return '90+'
}

function isActiveAR(inv: Invoice): boolean {
  // exclude superseded (consolidated absorbed) invoices to avoid double-counting
  if (inv.supersededByInvoiceId) return false
  if (['Draft','Cancelled','Paid'].includes(inv.status)) return false
  return (inv.totalAmount - (inv.amountPaid || 0)) > 0
}

export default function ARAgingPage({ embedded }: { embedded?: boolean } = {}) {
  const invoices = useAppStore(s => s.invoices)
  const clients = useAppStore(s => s.clients)
  const isSyncing = useAppStore(s => s.isSyncing)

  const [search, setSearch] = useState('')
  const [bucketFilter, setBucketFilter] = useState<'all' | AgingBucket>('all')

  const clientById = useMemo(() => {
    const m: Record<string, Client> = {}
    clients.forEach(c => { m[c.id] = c })
    return m
  }, [clients])

  // Compute outstanding per invoice
  const arInvoices = useMemo(() => {
    const today = new Date()
    return invoices
      .filter(isActiveAR)
      .map(inv => {
        const outstanding = inv.totalAmount - (inv.amountPaid || 0)
        const agingDays = differenceInDays(today, parseISO(inv.dueDate))
        return {
          ...inv,
          outstanding,
          agingDays,
          bucket: getAgingBucket(agingDays),
          clientName: clientById[inv.clientId]?.companyName || '— Unknown —',
          clientPhone: clientById[inv.clientId]?.phone || '',
        }
      })
      .sort((a, b) => b.agingDays - a.agingDays)
  }, [invoices, clientById])

  // TOP outstanding by client (grouped)
  const topByClient = useMemo(() => {
    const map: Record<string, { clientId: string; clientName: string; clientPhone: string; total: number; invoiceCount: number; oldestAging: number }> = {}
    arInvoices.forEach(inv => {
      if (!map[inv.clientId]) {
        map[inv.clientId] = {
          clientId: inv.clientId,
          clientName: inv.clientName,
          clientPhone: inv.clientPhone,
          total: 0, invoiceCount: 0, oldestAging: inv.agingDays,
        }
      }
      map[inv.clientId].total += inv.outstanding
      map[inv.clientId].invoiceCount += 1
      if (inv.agingDays > map[inv.clientId].oldestAging) {
        map[inv.clientId].oldestAging = inv.agingDays
      }
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [arInvoices])

  // Overdue list (filtered)
  const overdueList = useMemo(() => {
    return arInvoices
      .filter(inv => inv.agingDays > 0)
      .filter(inv => {
        if (bucketFilter !== 'all' && inv.bucket !== bucketFilter) return false
        if (!search) return true
        const q = search.toLowerCase()
        return inv.clientName.toLowerCase().includes(q) || inv.id.toLowerCase().includes(q)
      })
  }, [arInvoices, search, bucketFilter])

  // Totals
  const totals = useMemo(() => {
    const t = { all: 0, current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    arInvoices.forEach(inv => {
      t.all += inv.outstanding
      t[inv.bucket] += inv.outstanding
    })
    return t
  }, [arInvoices])

  const totalOverdue = totals['1-30'] + totals['31-60'] + totals['61-90'] + totals['90+']
  const overdueCount = arInvoices.filter(inv => inv.agingDays > 0).length

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className={embedded ? "pb-6" : "-m-4 pb-24 md:-m-6 lg:-m-8"}>
        {!embedded && (
          <PageHeader
            title="Piutang"
            context={`${formatRupiah(totals.all)} belum tertagih · ${overdueCount} invoice lewat jatuh tempo`}
          />
        )}

        <div className={embedded ? "space-y-[18px]" : "space-y-[18px] px-6 py-6 md:px-7"}>
          {/* Bar umur bertumpuk — panjang bar yang bicara, bukan warna lencana */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {(['current', '1-30', '31-60', '61-90', '90+'] as AgingBucket[]).map(bucket => {
                const pct = totals.all > 0 ? (totals[bucket] / totals.all) * 100 : 0
                return pct > 0 ? (
                  <div key={bucket} className={BUCKET_BAR[bucket]} style={{ width: `${pct}%` }} title={BUCKET_LABEL[bucket]} />
                ) : null
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-px md:grid-cols-5">
              {(['current', '1-30', '31-60', '61-90', '90+'] as AgingBucket[]).map(bucket => (
                <button
                  key={bucket}
                  onClick={() => setBucketFilter(bucketFilter === bucket ? 'all' : bucket)}
                  className={cn(
                    "border-hairline px-4 py-3 text-left transition-colors duration-150 hover:bg-row-head",
                    bucketFilter === bucket && "bg-row-selected"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={cn("h-2 w-2 rounded-full", BUCKET_BAR[bucket])} />
                    {BUCKET_LABEL[bucket]}
                  </span>
                  <span className="tabular mt-1.5 block text-[19px] leading-tight font-semibold text-slate-900">
                    {formatRupiahShort(totals[bucket])}
                  </span>
                </button>
              ))}
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* TOP outstanding clients */}
          <Card className="lg:col-span-2 rounded-xl border-slate-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                Piutang per outlet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {topByClient.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada piutang outstanding</p>
              )}
              {topByClient.slice(0, 20).map((c, idx) => (
                <div key={c.clientId} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-400'}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{c.clientName}</p>
                    <p className="text-xs text-slate-400">
                      {c.invoiceCount} invoice
                      {c.oldestAging > 0 && (
                        <span className="text-rose-500 font-bold ml-2">· terlama {c.oldestAging}h</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-blue-700">{formatRupiah(c.total)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Overdue list */}
          <Card className="lg:col-span-3 rounded-xl border-slate-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2 text-lg font-bold">
                  <AlertTriangle className="w-5 h-5 text-rose-500" /> Daftar Tagihan Jatuh Tempo
                </CardTitle>
                <Badge className={bucketFilter !== 'all' ? `${BUCKET_COLOR[bucketFilter]}` : 'bg-slate-100 text-slate-600'}>
                  {bucketFilter === 'all' ? 'Semua bucket' : BUCKET_LABEL[bucketFilter]}
                </Badge>
              </div>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Cari klien atau invoice..."
                    className="pl-9 rounded-xl h-10"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <Select value={bucketFilter} onValueChange={v => setBucketFilter(v as any)}>
                  <SelectTrigger className="h-10 rounded-xl w-44">
                    <SelectValue placeholder="Bucket" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Bucket</SelectItem>
                    <SelectItem value="1-30">1–30 hari</SelectItem>
                    <SelectItem value="31-60">31–60 hari</SelectItem>
                    <SelectItem value="61-90">61–90 hari</SelectItem>
                    <SelectItem value="90+">90+ hari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[11px] uppercase font-bold tracking-wide">Klien</TableHead>
                    <TableHead className="text-[11px] uppercase font-bold tracking-wide">Jatuh Tempo</TableHead>
                    <TableHead className="text-[11px] uppercase font-bold tracking-wide text-right">Outstanding</TableHead>
                    <TableHead className="text-[11px] uppercase font-bold tracking-wide">Bucket</TableHead>
                    <TableHead className="text-[11px] uppercase font-bold tracking-wide">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                        Tidak ada tagihan yang jatuh tempo 🎉
                      </TableCell>
                    </TableRow>
                  )}
                  {overdueList.map(inv => (
                    <TableRow key={inv.id} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="font-bold text-sm">{inv.clientName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{inv.id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-bold">{format(parseISO(inv.dueDate), 'd MMM yy', { locale: localeId })}</div>
                        <div className="text-[11px] text-rose-500 font-bold">+{inv.agingDays}h lewat</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-bold text-rose-600">{formatRupiah(inv.outstanding)}</div>
                        {inv.amountPaid > 0 && (
                          <div className="text-[11px] text-slate-400">paid {formatRupiah(inv.amountPaid)}/{formatRupiah(inv.totalAmount)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold ${BUCKET_COLOR[inv.bucket]}`}>{BUCKET_LABEL[inv.bucket]}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inv.clientPhone && (
                            <a href={`https://wa.me/${inv.clientPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-lg hover:bg-emerald-50 text-emerald-600">
                                <MessageSquare className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                          )}
                          {inv.clientPhone && (
                            <a href={`tel:${inv.clientPhone}`}>
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-lg hover:bg-blue-50">
                                <Phone className="w-3.5 h-3.5" />
                              </Button>
                            </a>
                          )}
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
      </div>
    </AuthGuard>
  )
}
