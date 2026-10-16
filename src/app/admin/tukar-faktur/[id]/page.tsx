"use client"

import { use, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { tukarFakturAmounts } from "@/lib/billing-document"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import ReceiptUpload from "@/components/ui/receipt-upload"
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
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10))
  const [receivedProof, setReceivedProof] = useState("")
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
  const amounts = tukarFakturAmounts(tf.totalAmount, linkedInvoices)
  const isLocked = tf.status === "Received" || tf.status === "Paid"
  const isDraftish = tf.status === "Draft" || tf.status === "Issued"

  async function handleIssue() {
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await issueTukarFaktur(id, linkedInvoices.map(i => i.id), today, currentUser?.id || "system")
      toast.success("TF berhasil diterbitkan. Jatuh tempo kontrak invoice tetap berlaku.")
    } catch (e) {
      toast.error(`Issue gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleMarkReceived() {
    if (busy || !receivedBy.trim() || !receivedProof || !receivedDate) { toast.error("Isi PIC, tanggal dan unggah bukti TF diterima."); return }
    setBusy(true)
    try {
      await updateTukarFaktur(id, {
        status: "Received",
        receivedAt: new Date(receivedDate).toISOString(),
        receivedProofUrl: receivedProof,
        receivedBy: receivedBy.trim(),
      })
      toast.success("Ditandai diterima klien.")
      setReceivedBy("")
    } catch (e) {
      toast.error(`Update gagal: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`Hapus TF ${tf?.tfNumber}? Invoice akan dilepas dari TF; jatuh tempo kontrak tetap berlaku.`)) return
    setBusy(true)
    try {
      await deleteTukarFaktur(id)
      toast.success("TF dihapus.")
      router.push("/admin/tukar-faktur")
    } catch (e) {
      toast.error(`Delete gagal: ${e instanceof Error ? e.message : String(e)}`)
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
            <p className="text-[11px] font-bold  text-slate-400">{client?.companyName || tf.clientId}</p>
            <h1 className="text-2xl font-bold mt-1">{tf.tfNumber}</h1>
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
          <ReceiptUpload label="Bukti tanda terima TF" currentFile={receivedProof} onFileSelect={setReceivedProof} />
          <Input type="date" aria-label="Tanggal diterima klien" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          <div className="flex gap-2 max-w-md">
            <Input placeholder="Nama PIC Klien Penerima…" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
            <Button onClick={handleMarkReceived} disabled={busy || !receivedBy.trim() || !receivedProof || !receivedDate} className="bg-blue-600 hover:bg-blue-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Diterima
            </Button>
          </div>
        </Card>
      )}

      {tf.receivedAt && <p className="text-sm">Diterima {tf.receivedBy || "(PIC belum tercatat)"} pada {formatDate(tf.receivedAt)}. {tf.receivedProofUrl ? <a className="underline" href={tf.receivedProofUrl} target="_blank" rel="noopener noreferrer">Lihat bukti</a> : "Bukti historis belum terunggah."}</p>}

      {/* Detail Invoices */}
      <Card className="rounded-2xl overflow-hidden border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[11px] ">
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
                  {formatDate(inv.dueDate)}
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
              <td colSpan={3} className="px-4 py-3 text-right">Nilai terbit:</td>
              <td className="px-4 py-3 text-right">{formatRupiah(amounts.issued)}</td>
              <td className="px-4 py-3 text-center">{linkedInvoices.length} inv</td>
            </tr>
            <tr><td colSpan={3} className="px-4 py-2 text-right">Koreksi (credit note):</td><td className="px-4 py-2 text-right">{formatRupiah(-amounts.correction)}</td><td /></tr>
            <tr className="font-bold"><td colSpan={3} className="px-4 py-2 text-right">Nilai bersih saat ini:</td><td className="px-4 py-2 text-right">{formatRupiah(amounts.net)}</td><td /></tr>
            <tr><td colSpan={3} className="px-4 py-2 text-right">Pembayaran diterima:</td><td className="px-4 py-2 text-right">{formatRupiah(amounts.paid)}</td><td /></tr>
            <tr className="font-bold text-emerald-700"><td colSpan={3} className="px-4 py-3 text-right">Sisa piutang:</td><td className="px-4 py-3 text-right">{formatRupiah(amounts.outstanding)}</td><td /></tr>
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-500">Jatuh tempo mengikuti kontrak invoice. Perubahan memerlukan kesepakatan dan pencatatan renegosiasi; penggeseran massal tidak tersedia.</p>
    </div>
  )
}
