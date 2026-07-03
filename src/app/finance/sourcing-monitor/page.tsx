"use client"

import { useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatRupiah } from "@/lib/utils"
import AuthGuard from "@/components/auth/auth-guard"

export default function SourcingMonitorPage() {
  const cashTransactions = useAppStore(s => s.cashTransactions)
  const bankAccounts = useAppStore(s => s.bankAccounts)
  const closes = useAppStore(s => s.tutupHariKantong)
  const users = useAppStore(s => s.users)

  const pockets = useMemo(() => bankAccounts.filter(b => b.purpose === 'sourcing_pocket'), [bankAccounts])

  const rows = useMemo(() => {
    const map = new Map<string, { date: string; pocketId: string; sourcer: string; ditarik: number; belanja: number; disetor: number; closed: boolean; defisit: number }>()
    const keyOf = (pid: string, d: string) => `${pid}|${d}`
    for (const p of pockets) {
      const sourcer = users.find(u => u.id === p.ownerUserId)?.name || p.name
      for (const t of cashTransactions.filter(t => t.bankAccountId === p.id)) {
        const d = t.date.slice(0, 10)
        const k = keyOf(p.id, d)
        if (!map.has(k)) map.set(k, { date: d, pocketId: p.id, sourcer, ditarik: 0, belanja: 0, disetor: 0, closed: false, defisit: 0 })
        const row = map.get(k)!
        if (t.type === 'In' && t.category === 'Tarik Kantong Sourcing') row.ditarik += t.amount
        else if (t.type === 'Out' && t.category === 'Belanja Sourcing (HPP)') row.belanja += t.amount
        else if (t.type === 'Out' && t.category === 'Setor Sisa Kantong') row.disetor += t.amount
      }
    }
    for (const c of closes) {
      const k = keyOf(c.pocketBankAccountId, c.date)
      if (!map.has(k)) map.set(k, { date: c.date, pocketId: c.pocketBankAccountId, sourcer: users.find(u => u.id === c.sourcerId)?.name || c.sourcerId, ditarik: c.ditarik, belanja: c.belanja, disetor: c.disetor, closed: true, defisit: c.defisit })
      else { const r = map.get(k)!; r.closed = true; r.defisit = c.defisit }
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.sourcer.localeCompare(b.sourcer))
  }, [pockets, cashTransactions, closes, users])

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="space-y-6 max-w-6xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="text-xl font-black uppercase tracking-tight">Pantau Harian Sourcing</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Sourcing</TableHead>
                  <TableHead className="text-right">Ditarik</TableHead>
                  <TableHead className="text-right">Belanja</TableHead>
                  <TableHead className="text-right">Disetor</TableHead>
                  <TableHead className="text-right">Sisa/Defisit</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8 text-sm">Belum ada aktivitas kantong sourcing.</TableCell></TableRow>
                ) : rows.map((r) => {
                  const sisa = r.ditarik - r.belanja - r.disetor
                  return (
                    <TableRow key={`${r.pocketId}|${r.date}`}>
                      <TableCell className="text-xs font-bold">{r.date}</TableCell>
                      <TableCell className="text-xs font-black">{r.sourcer}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.ditarik)}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.belanja)}</TableCell>
                      <TableCell className="text-right text-xs">{formatRupiah(r.disetor)}</TableCell>
                      <TableCell className={`text-right text-xs font-black ${r.defisit > 0 ? 'text-rose-600' : 'text-slate-600'}`}>{r.defisit > 0 ? `-${formatRupiah(r.defisit)}` : formatRupiah(sisa)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={r.closed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>{r.closed ? 'Tutup' : 'Buka'}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  )
}
