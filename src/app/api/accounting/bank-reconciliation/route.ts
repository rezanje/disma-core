import { createHash } from 'node:crypto'
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
const roles = ['finance', 'super_admin'] as const
function camel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camel)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camel(item)]))
}
async function allRows(table: string) {
  const rows: unknown[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select('*').order('id').range(offset, offset + 999)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Reconciliation read did not return rows')
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
export async function GET(request: Request) {
  try {
    await requireApiUser(request, roles)
    const [statements, rows, matches] = await Promise.all([
      allRows('bank_reconciliation_statements'), allRows('bank_reconciliation_rows'), allRows('bank_reconciliation_matches'),
    ])
    return Response.json(camel({ statements, rows, matches }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return apiAuthResponse(error) || Response.json({ error: 'Data rekonsiliasi gagal dimuat.' }, { status: 503 })
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, roles)
    const input = await request.json()
    let rpc: 'import_bank_reconciliation' | 'match_bank_reconciliation'
    let args: Record<string, unknown>
    if (input?.action === 'import') {
      if (typeof input.bankAccountId !== 'string' || !input.bankAccountId || !Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 5000) throw new Error('Pilih rekening dan 1–5000 baris mutasi.')
      const rows = input.rows.map((row: Record<string, unknown>) => {
        if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(new Date(row.date).getTime()) || new Date(row.date).toISOString().slice(0, 10) !== row.date || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0 || Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.00001 || !['CR', 'DB'].includes(String(row.type)) || typeof row.description !== 'string') throw new Error('Baris mutasi tidak valid; gunakan tanggal YYYY-MM-DD, jumlah positif dan CR/DB.')
        return { date: row.date, description: row.description.trim(), amount: row.amount, type: row.type }
      })
      const contentHash = createHash('sha256').update(JSON.stringify({ bankAccountId: input.bankAccountId, rows })).digest('hex')
      rpc = 'import_bank_reconciliation'
      args = { p_statement: { id: `statement:${contentHash}`, contentHash, bankAccountId: input.bankAccountId, fileName: typeof input.fileName === 'string' ? input.fileName.slice(0, 255) : 'statement.csv', rows }, p_actor_id: user.id }
    } else if (input?.action === 'match') {
      for (const key of ['eventId', 'statementId', 'rowId', 'journalLineId']) if (typeof input[key] !== 'string' || !input[key] || input[key].length > 250) throw new Error('Referensi pencocokan tidak valid.')
      rpc = 'match_bank_reconciliation'
      args = { p_match: { eventId: input.eventId, statementId: input.statementId, rowId: input.rowId, journalLineId: input.journalLineId }, p_actor_id: user.id }
    } else throw new Error('Tindakan rekonsiliasi tidak valid.')
    const { data, error } = await supabaseAdmin.rpc(rpc, args)
    if (error) return Response.json({ error: error.message }, { status: 409 })
    if (!data || typeof data !== 'object' || !data.statement || !Array.isArray(data.rows) || !Array.isArray(data.matches)) throw new Error('Hasil rekonsiliasi belum terkonfirmasi.')
    return Response.json(camel(data), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return apiAuthResponse(error) || Response.json({ error: error instanceof Error ? error.message : 'Rekonsiliasi gagal.' }, { status: 400 })
  }
}
