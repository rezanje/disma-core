"use client"

import { useState } from "react"
import { RecordHistory } from "@/types"
import { useAppStore } from "@/lib/store"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Map table name → store action keys.
type StoreActions = ReturnType<typeof useAppStore.getState>
const TABLE_ACTIONS: Record<string, { update?: keyof StoreActions; create?: keyof StoreActions }> = {
  sales_orders: { update: 'updateSalesOrder', create: 'addSalesOrder' },
  sales_order_items: { update: 'updateSalesOrderItem', create: 'addSalesOrderItem' },
  purchases: { update: 'updatePurchase', create: 'addPurchase' },
  purchase_items: { update: 'updatePurchaseItem', create: 'addPurchaseItem' },
  expenses: { update: 'updateExpense', create: 'addExpense' },
  invoices: { update: 'updateInvoice', create: 'addInvoice' },
  reimbursements: { update: 'updateReimbursement', create: 'addReimbursement' },
  deliveries: { update: 'updateDelivery', create: 'addDelivery' },
  cash_transactions: { update: 'updateCashTransaction', create: 'addCashTransaction' },
  journal_entries: { update: 'updateJournalEntry', create: 'addJournalEntry' },
  clients: { update: 'updateClient', create: 'addClient' },
  vendors: { update: 'updateVendor', create: 'addVendor' },
  products: { update: 'updateProduct', create: 'addProduct' },
  bank_accounts: { update: 'updateBankAccount', create: 'addBankAccount' },
  users: { update: 'updateUser', create: 'addUser' },
  client_prices: { update: 'updateClientPrice', create: 'addClientPrice' },
  employees: { update: 'updateEmployee', create: 'addEmployee' },
  kpis: { update: 'updateKpi', create: 'addKpi' },
  okr_objectives: { update: 'updateOkr', create: 'addOkr' },
  fixed_assets: { update: 'updateFixedAsset', create: 'addFixedAsset' },
  leads: { update: 'updateLead', create: 'addLead' },
  disma_tasks: { update: 'updateTask', create: 'addTask' },
}

const ID_FIELD_REGEX = /Id$/

function detectMissingFKs(data: Record<string, any> | null, store: StoreActions): string[] {
  if (!data) return []
  const missing: string[] = []
  Object.entries(data).forEach(([key, value]) => {
    if (!ID_FIELD_REGEX.test(key) || !value || typeof value !== 'string') return
    // Best-effort: check common collections
    const collections: Array<{ name: string; field: string; items: any[] | undefined }> = [
      { name: 'clients', field: 'clientId', items: store.clients },
      { name: 'products', field: 'productId', items: store.products },
      { name: 'users', field: 'userId', items: store.users },
      { name: 'salesOrders', field: 'salesOrderId', items: store.salesOrders },
      { name: 'purchases', field: 'purchaseId', items: store.purchases },
      { name: 'bankAccounts', field: 'bankAccountId', items: store.bankAccounts },
      { name: 'vendors', field: 'vendorId', items: store.vendors },
    ]
    const match = collections.find(c => c.field === key)
    if (match && match.items && !match.items.some((it: any) => it?.id === value)) {
      missing.push(`${key}=${value} (tidak ada di ${match.name})`)
    }
  })
  return missing
}

export default function RollbackDialog({
  entry,
  onClose,
  onSuccess,
}: {
  entry: RecordHistory
  onClose: () => void
  onSuccess: () => void
}) {
  const [processing, setProcessing] = useState(false)

  const mapping = TABLE_ACTIONS[entry.tableName]
  const targetData = entry.action === 'delete' ? entry.oldData : entry.oldData

  const isDelete = entry.action === 'delete'
  const operationLabel = isDelete ? 'Pulihkan record (recreate)' : 'Kembalikan ke nilai sebelumnya'
  const missingFKs = detectMissingFKs(targetData, useAppStore.getState())

  const handleRollback = async () => {
    if (!mapping) {
      toast.error("Tabel ini belum support rollback.")
      return
    }
    if (!targetData) {
      toast.error("Data sumber rollback kosong.")
      return
    }
    if (missingFKs.length > 0) {
      toast.error("Rollback diblokir: ada referensi yang hilang.")
      return
    }

    setProcessing(true)
    try {
      const store = useAppStore.getState() as any
      if (isDelete) {
        const createFn = mapping.create ? store[mapping.create] : null
        if (typeof createFn !== 'function') throw new Error("Aksi create tidak ditemukan.")
        await createFn(targetData)
      } else {
        const updateFn = mapping.update ? store[mapping.update] : null
        if (typeof updateFn !== 'function') throw new Error("Aksi update tidak ditemukan.")
        await updateFn(entry.recordId, targetData)
      }
      // Annotate latest history row as rollback (best-effort, non-blocking).
      try {
        await store.logHistory({
          table: entry.tableName,
          recordId: entry.recordId,
          action: 'rollback',
          oldData: null,
          newData: targetData,
          parentHistoryId: entry.id,
          reason: `Rollback of history ${entry.id.slice(0, 8)}`,
        })
      } catch {}
      toast.success("Rollback berhasil.")
      onSuccess()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || "Rollback gagal.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" /> Konfirmasi Rollback
          </DialogTitle>
          <DialogDescription>
            {operationLabel} untuk <span className="font-mono font-bold">{entry.tableName}</span> #{entry.recordId.slice(0, 8)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-xs leading-relaxed">
            <strong>Peringatan:</strong> Rollback ini hanya mengembalikan record sumber. Jurnal/kas/transaksi yang sudah dibuat sebelumnya <strong>TIDAK akan otomatis dibalikin</strong>. Lo yang bertanggung jawab nge-adjust downstream record secara manual kalau perlu.
            {entry.action === 'delete' && (
              <div className="mt-2">Untuk delete dgn cascade (mis. <code>deletePurchase</code> hapus <code>purchase_items</code> juga), tiap child harus di-rollback satu-satu.</div>
            )}
          </div>

          {missingFKs.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-900 text-xs">
              <strong>Rollback diblokir.</strong> Referensi berikut sudah tidak ada:
              <ul className="list-disc list-inside mt-2 space-y-1">
                {missingFKs.map(fk => <li key={fk}>{fk}</li>)}
              </ul>
            </div>
          )}

          {!mapping && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 text-xs">
              Tabel <code>{entry.tableName}</code> belum di-mapping ke aksi store. Rollback tidak tersedia.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>Batal</Button>
          <Button
            onClick={handleRollback}
            disabled={processing || !mapping || missingFKs.length > 0 || !targetData}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Konfirmasi Rollback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
