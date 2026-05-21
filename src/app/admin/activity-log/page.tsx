"use client"

import { useEffect, useState, useMemo } from "react"
import AuthGuard from "@/components/auth/auth-guard"
import { useAppStore } from "@/lib/store"
import { RecordHistory } from "@/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { History, RefreshCw, Loader2 } from "lucide-react"
import HistoryRow from "./components/history-row"
import RollbackDialog from "./components/rollback-dialog"

const ROLLBACKABLE_TABLES = [
  'sales_orders', 'sales_order_items', 'purchases', 'purchase_items',
  'expenses', 'invoices', 'reimbursements', 'deliveries',
  'cash_transactions', 'journal_entries',
  'clients', 'vendors', 'products', 'bank_accounts', 'users',
  'client_prices', 'employees', 'kpis', 'okr_objectives',
  'fixed_assets', 'leads', 'disma_tasks',
]

export default function ActivityLogPage() {
  const currentUser = useAppStore(state => state.currentUser)
  const users = useAppStore(state => state.users)

  const [rows, setRows] = useState<RecordHistory[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const LIMIT = 100

  const [filterTable, setFilterTable] = useState<string>('')
  const [filterUserId, setFilterUserId] = useState<string>('')
  const [filterFrom, setFilterFrom] = useState<string>('')
  const [filterTo, setFilterTo] = useState<string>('')

  const [rollbackTarget, setRollbackTarget] = useState<RecordHistory | null>(null)

  const fetchPage = async (reset = false) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      sp.set('limit', String(LIMIT))
      sp.set('offset', String(reset ? 0 : offset))
      if (currentUser?.role) sp.set('userRole', currentUser.role)
      if (filterTable) sp.set('table', filterTable)
      if (filterUserId) sp.set('userId', filterUserId)
      if (filterFrom) sp.set('from', new Date(filterFrom).toISOString())
      if (filterTo) {
        const end = new Date(filterTo)
        end.setHours(23, 59, 59, 999)
        sp.set('to', end.toISOString())
      }
      const res = await fetch(`/api/history?${sp.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.missingTable) {
        setRows([])
        setTotal(0)
        return
      }
      const fetched: RecordHistory[] = data.rows || []
      setTotal(data.total ?? 0)
      setRows(prev => reset ? fetched : [...prev, ...fetched])
      setOffset(prev => (reset ? fetched.length : prev + fetched.length))
    } catch (e) {
      console.error('Fetch history failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleApplyFilter = () => {
    setOffset(0)
    fetchPage(true)
  }

  const handleClearFilter = () => {
    setFilterTable('')
    setFilterUserId('')
    setFilterFrom('')
    setFilterTo('')
    setOffset(0)
    setTimeout(() => fetchPage(true), 0)
  }

  const tableOptions = useMemo(() => ROLLBACKABLE_TABLES.concat(['record_history']).sort(), [])

  return (
    <AuthGuard allowedRoles={['super_admin', 'ceo']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <History className="h-6 w-6 text-emerald-500" /> Activity Log
            </h2>
            <p className="text-muted-foreground text-sm">Riwayat semua perubahan data. Hanya super_admin & CEO.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchPage(true)} disabled={loading} className="rounded-xl">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Filter</CardTitle>
            <CardDescription className="text-xs">Sempitkan riwayat berdasarkan entity, user, atau tanggal.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Entity</label>
              <select
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs"
                value={filterTable}
                onChange={e => setFilterTable(e.target.value)}
              >
                <option value="">Semua</option>
                {tableOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">User</label>
              <select
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs"
                value={filterUserId}
                onChange={e => setFilterUserId(e.target.value)}
              >
                <option value="">Semua</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dari</label>
              <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-10 rounded-xl text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sampai</label>
              <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-10 rounded-xl text-xs" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApplyFilter} className="h-10 rounded-xl flex-1">Terapkan</Button>
              <Button variant="outline" onClick={handleClearFilter} className="h-10 rounded-xl">Reset</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Timeline
              <Badge variant="secondary" className="text-[10px] font-black">{total} total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 && !loading ? (
              <div className="py-12 text-center text-sm text-slate-400">Tidak ada riwayat.</div>
            ) : (
              <div className="space-y-3">
                {rows.map(r => (
                  <HistoryRow
                    key={r.id}
                    entry={r}
                    canRollback={ROLLBACKABLE_TABLES.includes(r.tableName) && r.action !== 'create'}
                    onRollback={() => setRollbackTarget(r)}
                  />
                ))}
                {rows.length < total && (
                  <div className="pt-4 flex justify-center">
                    <Button variant="outline" onClick={() => fetchPage(false)} disabled={loading} className="rounded-xl">
                      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Muat lebih banyak ({total - rows.length} sisa)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {rollbackTarget && (
          <RollbackDialog
            entry={rollbackTarget}
            onClose={() => setRollbackTarget(null)}
            onSuccess={() => {
              setRollbackTarget(null)
              fetchPage(true)
            }}
          />
        )}
      </div>
    </AuthGuard>
  )
}
