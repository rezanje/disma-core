"use client"

import { use, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Send, CheckCircle2, Trash2, Printer } from "lucide-react"
import { toast } from "sonner"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso?: string) {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function TukarFakturDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const tf = useAppStore(s => s.tukarFakturs.find(t => t.id === id))
  const clients = useAppStore(s => s.clients)
  const invoices = useAppStore(s => s.invoices)
  const currentUser = useAppStore(s => s.currentUser)
  const updateTukarFaktur = useAppStore(s => s.updateTukarFaktur)
  const issueTukarFaktur = useAppStore(s => s.issueTukarFaktur)
  const deleteTukarFaktur = useAppStore(s => s.deleteTukarFaktur)
  const updateInvoice = useAppStore(s => s.updateInvoice)

  const [receivedBy, setReceivedBy] = useState("")
  const [bulkDays, setBulkDays] = useState(0)
  const [busy, setBusy] = useState(false)

  const linkedInvoices = useMemo(() =>
    invoices.filter(inv => inv.tukarFakturId === id),
    [invoices, id]
  )

  if (!tf) {
    return <div className="p-10 text-slate-500">TF tidak ditemukan. <Link href="/admin/tukar-faktur" className="underline">Kembali</Link></div>
  }

  const client = clients.find(c => c.id === tf.clientId)
  const isLocked = tf.status === "Received" || tf.status === "Paid"
  const isDraftish = tf.status === "Draft" || tf.status === "Issued"

  async function handleIssue() {
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await issueTukarFaktur(id, linkedInvoices.map(i => i.id), today, currentUser?.id || "system")
      toast.success("TF berhasil di-Issue. Jatuh tempo invoice ter-update.")
    } catch (e) {
      toast.error(`Issue gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleMarkReceived() {
    if (!receivedBy.trim()) { toast.error("Isi nama PIC penerima."); return }
    setBusy(true)
    try {
      await updateTukarFaktur(id, {
        status: "Received",
        receivedAt: new Date().toISOString(),
        receivedBy: receivedBy.trim(),
      })
      toast.success("Ditandai diterima klien.")
      setReceivedBy("")
    } catch (e) {
      toast.error(`Update gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`Hapus TF ${tf?.tfNumber}? Invoice akan di-unlink & jatuh tempo direvert.`)) return
    setBusy(true)
    try {
      await deleteTukarFaktur(id)
      toast.success("TF dihapus.")
      router.push("/admin/tukar-faktur")
    } catch (e) {
      toast.error(`Delete gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleEditDueDate(invoiceId: string, newDate: string) {
    try {
      await updateInvoice(invoiceId, { dueDate: newDate })
    } catch (e) {
      toast.error(`Update dueDate gagal: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleBulkOverride() {
    if (bulkDays === 0) { toast.error("Isi jumlah hari (boleh negatif)."); return }
    setBusy(true)
    try {
      for (const inv of linkedInvoices) {
        const newDate = new Date(inv.dueDate)
        newDate.setDate(newDate.getDate() + bulkDays)
        await updateInvoice(inv.id, { dueDate: newDate.toISOString().slice(0, 10) })
      }
      toast.success(`${linkedInvoices.length} dueDate digeser ${bulkDays} hari.`)
      setBulkDays(0)
    } catch (e) {
      toast.error(`Bulk override gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      <Link href="/admin/tukar-faktur" className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Kembali
      </Link>

      <Card className="p-6 rounded-2xl border-slate-100">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{client?.companyName || tf.clientId}</p>
            <h1 className="text-2xl font-black mt-1">{tf.tfNumber}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Periode {formatDate(tf.periodStart)} – {formatDate(tf.periodEnd)}
              {tf.status === "Draft"
                ? <> · Rencana issue {formatDate(tf.issueDate)}</>
                : <> · Issued {formatDate(tf.issueDate)}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-none font-bold">{tf.status}</Badge>
            <Link href={`/admin/tukar-faktur/${id}/print`}>
              <Button variant="outline"><Printer className="w-4 h-4 mr-2" /> Print</Button>
            </Link>
            {tf.status === "Draft" && (
              <Button onClick={handleIssue} disabled={busy || linkedInvoices.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Send className="w-4 h-4 mr-2" /> Issue
              </Button>
            )}
            {!isLocked && (
              <Button variant="outline" onClick={handleDelete} disabled={busy} className="border-rose-200 text-rose-600 hover:bg-rose-50">
                <Trash2 className="w-4 h-4 mr-2" /> Hapus
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* PIC Penerimaan Section */}
      {tf.status === "Issued" && (
        <Card className="p-6 rounded-2xl border-slate-100 bg-slate-50 space-y-4">
          <div>
            <h3 className="font-bold text-sm">Konfirmasi Penerimaan Klien</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tandai bahwa dokumen TF fisik sudah diterima oleh klien.</p>
          </div>
          <div className="flex gap-2 max-w-md">
            <Input placeholder="Nama PIC Klien Penerima…" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
            <Button onClick={handleMarkReceived} disabled={busy || !receivedBy.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Diterima
            </Button>
          </div>
        </Card>
      )}

      {/* Detail Invoices */}
      <Card className="rounded-2xl overflow-hidden border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Invoice ID</th>
              <th className="text-left px-4 py-3">Issue Date</th>
              <th className="text-left px-4 py-3">Due Date (Jatuh Tempo)</th>
              <th className="text-right px-4 py-3">Total Amount</th>
              <th className="text-center px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {linkedInvoices.map(inv => (
              <tr key={inv.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">{inv.id.slice(0, 8)}</td>
                <td className="px-4 py-3">{formatDate(inv.issueDate)}</td>
                <td className="px-4 py-3">
                  {tf.status === "Draft" ? (
                    <Input type="date" value={inv.dueDate} onChange={e => handleEditDueDate(inv.id, e.target.value)} className="h-8 w-40 text-xs rounded-lg" />
                  ) : (
                    formatDate(inv.dueDate)
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold">{formatRupiah(inv.totalAmount)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge className={inv.status === "Paid" ? "bg-emerald-100 text-emerald-700 border-none font-bold" : "bg-rose-100 text-rose-700 border-none font-bold"}>
                    {inv.status}
                  </Badge>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-bold">
              <td colSpan={3} className="px-4 py-3 text-right">TOTAL TF:</td>
              <td className="px-4 py-3 text-right text-emerald-700">{formatRupiah(tf.totalAmount)}</td>
              <td className="px-4 py-3 text-center">{linkedInvoices.length} inv</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Bulk Override Due Date */}
      {tf.status === "Issued" && (
        <Card className="p-6 rounded-2xl border-slate-100 space-y-4">
          <div>
            <h3 className="font-bold text-sm">Undur / Geser Jatuh Tempo (Bulk)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Geser tanggal jatuh tempo semua invoice dalam TF ini sekaligus.</p>
          </div>
          <div className="flex items-center gap-2 max-w-sm">
            <Input type="number" placeholder="Jumlah hari (misal: 7 atau -7)…" value={bulkDays || ""} onChange={e => setBulkDays(Number(e.target.value))} />
            <Button onClick={handleBulkOverride} disabled={busy} className="bg-slate-800 hover:bg-slate-900 text-white whitespace-nowrap">
              Geser Tanggal
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
