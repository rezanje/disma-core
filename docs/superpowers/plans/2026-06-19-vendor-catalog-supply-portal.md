# Vendor Catalog & Supply Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build vendor price catalog (admin UI), vendor supply portal (public link `/supply/[vendorId]`), approval gate, and shopping-list integration so vendors can commit prices for 7-day windows that admin can approve and push to product base prices.

**Architecture:** New `vendor_prices` DB table + Zustand store slice mirrors the existing `client_prices` pattern. Admin UI extends vendor detail modal. Vendor portal mirrors `/order/[clientId]` pattern as a public page `/supply/[vendorId]`.

**Tech Stack:** Next.js 15 App Router, Zustand (`useAppStore`), Supabase (via `syncTable` / `supabaseAdmin`), shadcn/ui, date-fns, lucide-react, sonner toast, uuid.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/index.ts` | Modify | Add `VendorPrice`, `VendorPriceStatus` types |
| `src/lib/store.ts` | Modify | Add `vendorPrices` state slice + CRUD actions |
| `src/app/api/db/backup/route.ts` | Modify | Add `vendor_prices` to table lists |
| `src/app/api/db/reset/route.ts` | Modify | Add `vendor_prices` to `operationalTables` |
| `src/app/admin/vendors/page.tsx` | Modify | Replace "Disupply" section with catalog + approval + copy-link |
| `src/app/supply/[vendorId]/page.tsx` | Create | Public vendor price submission portal |

---

## Task 1: DB Migration — create `vendor_prices` table

**Files:**
- Supabase migration (via MCP `apply_migration`)

- [ ] **Step 1: Apply migration**

Use Supabase MCP `apply_migration` on project `ckkohudfuisgzlrjipev`:

```sql
CREATE TABLE IF NOT EXISTS vendor_prices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES products(id) ON DELETE SET NULL,
  proposed_name text,
  price         numeric NOT NULL,
  uom           text NOT NULL,
  valid_from    date NOT NULL,
  valid_to      date NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  source        text NOT NULL DEFAULT 'portal',
  notes         text,
  last_updated  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_prices_vendor_id ON vendor_prices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_product_id ON vendor_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_vendor_prices_status ON vendor_prices(status);
```

- [ ] **Step 2: Verify table exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'vendor_prices' ORDER BY ordinal_position;
```
Expected: 11 rows (id, vendor_id, product_id, proposed_name, price, uom, valid_from, valid_to, status, source, notes, last_updated, created_at).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add vendor_prices table migration"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/types/index.ts` (after `Product` interface, ~line 92)

- [ ] **Step 1: Add types**

In `src/types/index.ts`, after the closing `}` of the `Product` interface (around line 92), add:

```typescript
export type VendorPriceStatus = 'pending' | 'active' | 'rejected' | 'expired';

export interface VendorPrice {
  id: string;
  vendorId: string;
  productId?: string;       // undefined = request for new product
  proposedName?: string;    // filled when productId is undefined
  price: number;
  uom: string;
  validFrom: string;        // ISO date 'YYYY-MM-DD'
  validTo: string;          // ISO date 'YYYY-MM-DD'
  status: VendorPriceStatus;
  source: 'portal' | 'admin';
  notes?: string;
  lastUpdated: string;      // ISO timestamp
  createdAt: string;        // ISO timestamp
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to VendorPrice.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add VendorPrice type"
```

---

## Task 3: Store slice — vendorPrices

**Files:**
- Modify: `src/lib/store.ts`

There are 4 locations to edit in store.ts:

**3a — Import type** (top of file, ~line 9 where other types are imported):

- [ ] **Step 1: Add VendorPrice to import**

Find the line:
```typescript
VendorBill, VendorBillPayment, TukarFaktur, PurchaseRequest,
```
Add `VendorPrice,` to that import block from `@/types`.

**3b — State interface** (~line 357, after `vendors:` block):

- [ ] **Step 2: Add to state interface**

Find the block:
```typescript
  vendors: Vendor[];
  addVendor: (vendor: Vendor) => void;
  updateVendor: (id: string, data: Partial<Vendor>) => void;
```
Add after it:
```typescript
  vendorPrices: VendorPrice[];
  addVendorPrice: (vp: VendorPrice) => Promise<void>;
  updateVendorPrice: (id: string, data: Partial<VendorPrice>) => Promise<void>;
  deleteVendorPrice: (id: string) => Promise<void>;
```

**3c — Implementation** (~line 2850, right after `deleteMultipleClientPrices` block ends):

- [ ] **Step 3: Add vendorPrices implementation**

Find the line:
```typescript
      pendingReturns: [],
```
Insert **before** it:
```typescript
      vendorPrices: [],
      addVendorPrice: async (vp) => {
        set((state) => ({ vendorPrices: [...state.vendorPrices, vp] }));
        await get().syncTable('vendor_prices', vp);
      },
      updateVendorPrice: async (id, data) => {
        const before = get().vendorPrices.find(v => v.id === id);
        set((state) => ({
          vendorPrices: state.vendorPrices.map(v => v.id === id ? { ...v, ...data } : v)
        }));
        const updated = get().vendorPrices.find(v => v.id === id);
        if (updated) {
          await get().syncTable('vendor_prices', updated);
          if (before) await get().logHistory({ table: 'vendor_prices', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteVendorPrice: async (id) => {
        const before = get().vendorPrices.find(v => v.id === id);
        set((state) => ({ vendorPrices: state.vendorPrices.filter(v => v.id !== id) }));
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'vendor_prices', id })
        });
        if (before) await get().logHistory({ table: 'vendor_prices', recordId: id, action: 'delete', oldData: before, newData: null });
      },

```

**3d — loadAllData / setIfDefined** (~line 1055):

- [ ] **Step 4: Add to data loader**

Find the line:
```typescript
            setIfDefined('clientPrices', data.clientPrices);
```
Add after it:
```typescript
            setIfDefined('vendorPrices', data.vendorPrices);
```

**3e — resetSimulation** (~line 3089):

- [ ] **Step 5: Add to simulation reset**

Find:
```typescript
          bankAccounts: INITIAL_BANK_ACCOUNTS, fixedAssets: [], clientPrices: []
```
Change to:
```typescript
          bankAccounts: INITIAL_BANK_ACCOUNTS, fixedAssets: [], clientPrices: [], vendorPrices: []
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(store): add vendorPrices slice with CRUD actions"
```

---

## Task 4: Backup & Reset — add vendor_prices to table lists

**Files:**
- Modify: `src/app/api/db/backup/route.ts`
- Modify: `src/app/api/db/reset/route.ts`

**backup/route.ts** (~line 11):

- [ ] **Step 1: Add to backup table lists**

Find:
```typescript
  'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
```
Change to:
```typescript
  'vendor_prices', 'client_prices', 'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
```

**reset/route.ts** (~line 26):

- [ ] **Step 2: Add to reset operationalTables**

Find:
```typescript
    const operationalTables = [
      'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
      'deliveries', 'invoices', 'tukar_faktur', 'sales_orders', 'vendor_bills', 'purchases', 'purchase_requests', 'journal_entries', 'stock_movements', 'rejected_items', 'okr_objectives',
      'reimbursements', 'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
      'notifications', 'disma_tasks', 'leads', 'employees', 'kpis'
    ];
```
Add `'vendor_prices',` at the beginning of the first line (before `'sales_order_items'`):
```typescript
    const operationalTables = [
      'vendor_prices', 'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
      'deliveries', 'invoices', 'tukar_faktur', 'sales_orders', 'vendor_bills', 'purchases', 'purchase_requests', 'journal_entries', 'stock_movements', 'rejected_items', 'okr_objectives',
      'reimbursements', 'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
      'notifications', 'disma_tasks', 'leads', 'employees', 'kpis'
    ];
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/db/backup/route.ts src/app/api/db/reset/route.ts
git commit -m "feat(backup): include vendor_prices in backup/reset table lists"
```

---

## Task 5: Vendor Detail — catalog tab + copy-link

**Files:**
- Modify: `src/app/admin/vendors/page.tsx`

This task replaces the "Barang yang Disupply" section with a full vendor price catalog table, adds a "Copy Link Portal" button, and adds a manual admin entry form.

- [ ] **Step 1: Add imports**

At top of `src/app/admin/vendors/page.tsx`, add to the existing lucide-react import:
```typescript
import { Plus, Pencil, History, Link2, Check, X, Copy } from "lucide-react"
```

Add after existing imports:
```typescript
import { useAppStore } from "@/lib/store"
import { VendorPrice } from "@/types"
import { v4 as uuidv4 } from "uuid"
import { isAfter, parseISO, addDays } from "date-fns"
```
(Note: `parseISO`, `format`, `differenceInDays` already imported; add `isAfter`, `addDays` if not present.)

- [ ] **Step 2: Add vendorPrices state + helper state**

Inside `VendorsPage()` function, after existing `const products = ...` line, add:
```typescript
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const addVendorPrice = useAppStore(state => state.addVendorPrice)
  const updateVendorPrice = useAppStore(state => state.updateVendorPrice)
  const deleteVendorPrice = useAppStore(state => state.deleteVendorPrice)

  const [copiedLink, setCopiedLink] = useState(false)
  const [isAddPriceOpen, setIsAddPriceOpen] = useState(false)
  const [priceForm, setPriceForm] = useState({
    productId: '',
    proposedName: '',
    price: 0,
    uom: '',
    validFrom: format(new Date(), 'yyyy-MM-dd'),
    validTo: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    notes: '',
  })
  const [priceProductSearch, setPriceProductSearch] = useState('')
```

- [ ] **Step 3: Add computed vendorPrices for detail**

After the existing `suppliedProducts` useMemo, add:
```typescript
  const detailVendorPrices = useMemo(() => {
    if (!detailVendor) return []
    return vendorPrices
      .filter(vp => vp.vendorId === detailVendor.id)
      .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
  }, [detailVendor, vendorPrices])

  const pendingPricesCount = useMemo(
    () => detailVendorPrices.filter(vp => vp.status === 'pending').length,
    [detailVendorPrices]
  )

  const handleCopyLink = () => {
    const link = `${window.location.origin}/supply/${detailVendor?.id}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
    toast.success('Link portal disalin!')
  }

  const handleApprovePrice = async (vp: VendorPrice, applyToProduct: boolean) => {
    await updateVendorPrice(vp.id, { status: 'active', lastUpdated: new Date().toISOString() })
    if (applyToProduct && vp.productId) {
      const products_state = useAppStore.getState().products
      const updateProduct = useAppStore.getState().updateProduct
      const product = products_state.find(p => p.id === vp.productId)
      if (product) {
        const priceHistory = [...(product.priceHistory || []), {
          date: new Date().toISOString(),
          price: vp.price,
          source: `vendor:${detailVendor?.companyName}`
        }]
        await updateProduct(vp.productId, { basePrice: vp.price, priceHistory })
        toast.success(`Harga ${product.name} diupdate ke ${formatRupiah(vp.price)}`)
      }
    } else {
      toast.success('Harga vendor disetujui')
    }
  }

  const handleRejectPrice = async (vpId: string) => {
    await updateVendorPrice(vpId, { status: 'rejected', lastUpdated: new Date().toISOString() })
    toast.success('Penawaran harga ditolak')
  }

  const handleAddAdminPrice = async () => {
    if (!detailVendor || !priceForm.price || (!priceForm.productId && !priceForm.proposedName)) {
      toast.error('Pilih produk dan isi harga')
      return
    }
    const selectedProduct = products.find(p => p.id === priceForm.productId)
    await addVendorPrice({
      id: uuidv4(),
      vendorId: detailVendor.id,
      productId: priceForm.productId || undefined,
      proposedName: priceForm.productId ? undefined : priceForm.proposedName,
      price: priceForm.price,
      uom: priceForm.uom || selectedProduct?.uom || '',
      validFrom: priceForm.validFrom,
      validTo: priceForm.validTo,
      status: 'active',
      source: 'admin',
      notes: priceForm.notes || undefined,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
    setIsAddPriceOpen(false)
    setPriceForm({
      productId: '', proposedName: '', price: 0, uom: '',
      validFrom: format(new Date(), 'yyyy-MM-dd'),
      validTo: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      notes: '',
    })
    toast.success('Harga vendor ditambahkan')
  }
```

- [ ] **Step 4: Replace "Barang yang Disupply" section**

Find and replace the entire block (lines ~371–394):
```typescript
          {/* Products supplied by this vendor (default vendor) */}
          <div className="rounded-md border">
            ...
          </div>
```

Replace with:
```tsx
          {/* Vendor Price Catalog */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/60 border-b">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  Katalog Harga ({detailVendorPrices.length})
                </p>
                {pendingPricesCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black">
                    {pendingPricesCount} pending
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-black gap-1"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedLink ? 'Tersalin!' : 'Link Portal'}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px] font-black gap-1"
                  onClick={() => setIsAddPriceOpen(true)}
                >
                  <Plus className="h-3 w-3" /> Tambah Harga
                </Button>
              </div>
            </div>
            {detailVendorPrices.length === 0 ? (
              <p className="h-16 flex items-center justify-center text-xs text-muted-foreground italic">
                Belum ada katalog harga. Bagikan link portal ke vendor atau tambah manual.
              </p>
            ) : (
              <div className="max-h-[240px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-[9px] uppercase font-black">Produk</TableHead>
                      <TableHead className="text-[9px] uppercase font-black text-right">Harga Beli</TableHead>
                      <TableHead className="text-[9px] uppercase font-black">Berlaku s/d</TableHead>
                      <TableHead className="text-[9px] uppercase font-black">Update</TableHead>
                      <TableHead className="text-[9px] uppercase font-black text-center">Status</TableHead>
                      <TableHead className="text-[9px] uppercase font-black w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailVendorPrices.map(vp => {
                      const product = products.find(p => p.id === vp.productId)
                      const productName = product?.name ?? vp.proposedName ?? '—'
                      const isExpired = vp.status === 'active' && isAfter(new Date(), parseISO(vp.validTo))
                      const displayStatus = isExpired ? 'expired' : vp.status
                      return (
                        <TableRow key={vp.id}>
                          <TableCell className="text-xs font-bold">
                            {productName}
                            {!vp.productId && (
                              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 font-black">request</span>
                            )}
                            <div className="text-[9px] text-slate-400">{vp.uom}</div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-black text-emerald-700">
                            {formatRupiah(vp.price)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {format(parseISO(vp.validTo), 'd MMM yy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="text-[10px] text-slate-400">
                            {format(parseISO(vp.lastUpdated), 'd MMM yy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                              displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'expired' ? 'bg-slate-100 text-slate-500' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </TableCell>
                          <TableCell>
                            {vp.status === 'pending' && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-emerald-600 hover:bg-emerald-50"
                                  title="Approve & apply ke base price"
                                  onClick={() => handleApprovePrice(vp, !!vp.productId)}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-rose-500 hover:bg-rose-50"
                                  title="Tolak"
                                  onClick={() => handleRejectPrice(vp.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
```

- [ ] **Step 5: Add "Tambah Harga" dialog**

After the main vendor detail Dialog closing tag (`</Dialog>`) — around line 446 — add:

```tsx
      {/* Add admin price dialog */}
      <Dialog open={isAddPriceOpen} onOpenChange={setIsAddPriceOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Tambah Harga Vendor Manual</DialogTitle>
            <DialogDescription>{detailVendor?.companyName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Produk</Label>
              <Input
                placeholder="Cari nama produk..."
                value={priceProductSearch}
                onChange={e => {
                  setPriceProductSearch(e.target.value)
                  setPriceForm(f => ({ ...f, productId: '', proposedName: e.target.value }))
                }}
              />
              {priceProductSearch && (
                <div className="border rounded-md max-h-32 overflow-y-auto divide-y bg-white shadow">
                  {products
                    .filter(p => p.name.toLowerCase().includes(priceProductSearch.toLowerCase()))
                    .slice(0, 6)
                    .map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                        onClick={() => {
                          setPriceForm(f => ({ ...f, productId: p.id, uom: p.uom }))
                          setPriceProductSearch(p.name)
                        }}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-slate-400 ml-1">({p.uom})</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Harga Beli (Rp)</Label>
                <Input
                  type="number"
                  value={priceForm.price || ''}
                  onChange={e => setPriceForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="15000"
                />
              </div>
              <div className="grid gap-1">
                <Label>UOM</Label>
                <Input
                  value={priceForm.uom}
                  onChange={e => setPriceForm(f => ({ ...f, uom: e.target.value }))}
                  placeholder="kg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Berlaku Dari</Label>
                <Input
                  type="date"
                  value={priceForm.validFrom}
                  onChange={e => setPriceForm(f => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Berlaku Sampai</Label>
                <Input
                  type="date"
                  value={priceForm.validTo}
                  onChange={e => setPriceForm(f => ({ ...f, validTo: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsAddPriceOpen(false)}>Batal</Button>
            <Button onClick={handleAddAdminPrice}>Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Verify no build errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/vendors/page.tsx
git commit -m "feat(vendors): add vendor price catalog with approval and copy-link"
```

---

## Task 6: Supply Portal `/supply/[vendorId]/page.tsx`

**Files:**
- Create: `src/app/supply/[vendorId]/page.tsx`

- [ ] **Step 1: Create the file**

```bash
mkdir -p src/app/supply/\[vendorId\]
```

Create `src/app/supply/[vendorId]/page.tsx`:

```tsx
"use client"

import { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { useAppStore } from "@/lib/store"
import { VendorPrice } from "@/types"
import { format, addDays, parseISO, isAfter } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { v4 as uuidv4 } from "uuid"
import { formatRupiah } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { Search, Plus, CheckCircle2, Clock, Store, Tag } from "lucide-react"

export default function VendorSupplyPortal() {
  const params = useParams()
  const vendorId = params.vendorId as string

  const vendors = useAppStore(state => state.vendors)
  const products = useAppStore(state => state.products)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const addVendorPrice = useAppStore(state => state.addVendorPrice)
  const updateVendorPrice = useAppStore(state => state.updateVendorPrice)

  const vendor = useMemo(() => vendors.find(v => v.id === vendorId), [vendors, vendorId])

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; uom: string } | null>(null)
  const [isRequestNew, setIsRequestNew] = useState(false)
  const [form, setForm] = useState({
    proposedName: "",
    price: "",
    uom: "",
    validFrom: format(new Date(), "yyyy-MM-dd"),
    validTo: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    notes: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const myPrices = useMemo(
    () => vendorPrices.filter(vp => vp.vendorId === vendorId).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated)),
    [vendorPrices, vendorId]
  )

  const searchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return []
    return products
      .filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.skuCode.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, 6)
  }, [products, searchTerm])

  const resetForm = () => {
    setSelectedProduct(null)
    setIsRequestNew(false)
    setSearchTerm("")
    setForm({
      proposedName: "",
      price: "",
      uom: "",
      validFrom: format(new Date(), "yyyy-MM-dd"),
      validTo: format(addDays(new Date(), 7), "yyyy-MM-dd"),
      notes: "",
    })
  }

  const handleSubmit = async () => {
    const price = parseFloat(form.price)
    if (!price || price <= 0) { toast.error("Isi harga dengan benar"); return }
    if (!form.uom) { toast.error("Isi satuan (UOM)"); return }
    if (!form.validFrom || !form.validTo) { toast.error("Isi rentang tanggal berlaku"); return }
    if (new Date(form.validTo) < new Date(form.validFrom)) { toast.error("Tanggal akhir harus setelah tanggal mulai"); return }
    if (!selectedProduct && !form.proposedName) { toast.error("Pilih produk atau isi nama produk baru"); return }

    setIsSubmitting(true)
    try {
      // Check if vendor already has a pending/active entry for this product
      const existing = selectedProduct
        ? myPrices.find(vp => vp.productId === selectedProduct.id && ['pending', 'active'].includes(vp.status))
        : null

      if (existing) {
        await updateVendorPrice(existing.id, {
          price,
          uom: form.uom,
          validFrom: form.validFrom,
          validTo: form.validTo,
          notes: form.notes || undefined,
          status: 'pending',
          lastUpdated: new Date().toISOString(),
        })
        toast.success("Penawaran harga diperbarui, menunggu persetujuan")
      } else {
        await addVendorPrice({
          id: uuidv4(),
          vendorId,
          productId: selectedProduct?.id,
          proposedName: selectedProduct ? undefined : form.proposedName,
          price,
          uom: form.uom,
          validFrom: form.validFrom,
          validTo: form.validTo,
          status: 'pending',
          source: 'portal',
          notes: form.notes || undefined,
          lastUpdated: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        })
        toast.success("Penawaran harga dikirim, menunggu persetujuan")
      }
      resetForm()
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-sm w-full text-center p-10 space-y-4">
          <Store className="w-12 h-12 mx-auto text-slate-300" />
          <p className="font-black text-slate-700">Vendor tidak ditemukan</p>
          <p className="text-xs text-slate-400">Link tidak valid atau vendor tidak terdaftar.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40 px-4 py-3 shadow-sm">
        <div className="max-w-xl mx-auto">
          <h1 className="text-base font-black text-slate-800">{vendor.companyName}</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Portal Penawaran Harga</p>
        </div>
      </div>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-6">
        {/* Success flash */}
        {submitted && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold">Penawaran dikirim — menunggu persetujuan admin.</p>
          </div>
        )}

        {/* Form input harga */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Input Penawaran Harga</p>

            {/* Product search */}
            {!selectedProduct && !isRequestNew && (
              <div className="space-y-2">
                <Label className="text-xs">Cari Produk</Label>
                <div className="relative">
                  <Input
                    placeholder="Ketik nama produk..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-xl overflow-hidden divide-y bg-white shadow">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center"
                        onClick={() => {
                          setSelectedProduct({ id: p.id, name: p.name, uom: p.uom })
                          setForm(f => ({ ...f, uom: p.uom }))
                          setSearchTerm("")
                        }}
                      >
                        <span className="text-sm font-bold">{p.name}</span>
                        <span className="text-[10px] text-slate-400">{p.uom}</span>
                      </button>
                    ))}
                    <button
                      className="w-full text-left px-3 py-2 text-xs text-amber-600 font-bold hover:bg-amber-50 flex items-center gap-1"
                      onClick={() => { setIsRequestNew(true); setForm(f => ({ ...f, proposedName: searchTerm })); setSearchTerm("") }}
                    >
                      <Plus className="w-3 h-3" /> Produk tidak ada? Request nama baru
                    </button>
                  </div>
                )}
                {searchTerm.length >= 2 && searchResults.length === 0 && (
                  <button
                    className="text-xs text-amber-600 font-bold flex items-center gap-1 mt-1"
                    onClick={() => { setIsRequestNew(true); setForm(f => ({ ...f, proposedName: searchTerm })); setSearchTerm("") }}
                  >
                    <Plus className="w-3 h-3" /> Request produk baru: &ldquo;{searchTerm}&rdquo;
                  </button>
                )}
              </div>
            )}

            {/* Selected product */}
            {selectedProduct && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-black text-emerald-800">{selectedProduct.name}</p>
                  <p className="text-[10px] text-emerald-600">{selectedProduct.uom}</p>
                </div>
                <button className="text-[10px] text-slate-400 hover:text-rose-500 font-bold" onClick={resetForm}>Ganti</button>
              </div>
            )}

            {/* New product request */}
            {isRequestNew && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Nama Produk Baru</Label>
                  <button className="text-[10px] text-slate-400 hover:text-rose-500 font-bold" onClick={resetForm}>Batal</button>
                </div>
                <Input
                  placeholder="Nama produk yang ingin ditawarkan"
                  value={form.proposedName}
                  onChange={e => setForm(f => ({ ...f, proposedName: e.target.value }))}
                />
                <p className="text-[10px] text-amber-600 font-medium">Admin akan verifikasi dan mapping ke SKU produk.</p>
              </div>
            )}

            {/* Price + UOM */}
            {(selectedProduct || isRequestNew) && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Harga Beli (Rp)</Label>
                    <Input
                      type="number"
                      placeholder="15000"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Satuan (UOM)</Label>
                    <Input
                      placeholder="kg / pcs / ikat"
                      value={form.uom}
                      onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Berlaku Dari</Label>
                    <Input
                      type="date"
                      value={form.validFrom}
                      onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Berlaku Sampai</Label>
                    <Input
                      type="date"
                      value={form.validTo}
                      onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Harga ini berlaku sebagai komitmen selama periode tersebut.</p>

                <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Mengirim..." : "Kirim Penawaran"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* My submitted prices */}
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 px-1">Penawaran yang Dikirim ({myPrices.length})</p>
          {myPrices.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">Belum ada penawaran harga yang dikirim.</div>
          ) : (
            myPrices.map(vp => {
              const product = products.find(p => p.id === vp.productId)
              const productName = product?.name ?? vp.proposedName ?? "—"
              const isExpired = vp.status === 'active' && isAfter(new Date(), parseISO(vp.validTo))
              const displayStatus = isExpired ? 'expired' : vp.status
              return (
                <div key={vp.id} className="bg-white border rounded-xl px-4 py-3 flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-sm font-black">{productName}</p>
                    <p className="text-xs font-black text-emerald-600">{formatRupiah(vp.price)} <span className="text-slate-400 font-medium">/ {vp.uom}</span></p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock className="w-2.5 h-2.5" />
                      {format(parseISO(vp.validFrom), 'd MMM', { locale: localeId })} — {format(parseISO(vp.validTo), 'd MMM yy', { locale: localeId })}
                      <span className="mx-1">•</span>
                      diupdate {format(parseISO(vp.lastUpdated), 'd MMM yy', { locale: localeId })}
                    </div>
                  </div>
                  <Badge className={`text-[9px] shrink-0 ${
                    displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700 border-none' :
                    displayStatus === 'pending' ? 'bg-amber-100 text-amber-700 border-none' :
                    displayStatus === 'expired' ? 'bg-slate-100 text-slate-500 border-none' :
                    'bg-rose-100 text-rose-700 border-none'
                  }`}>
                    {displayStatus}
                  </Badge>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep "supply" | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/supply/
git commit -m "feat(supply): add vendor supply portal /supply/[vendorId]"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Vendor detail catalog**

1. Go to `localhost:3000/admin/vendors`
2. Click any vendor row
3. Verify: "Katalog Harga (0)" section with "Link Portal" + "Tambah Harga" buttons visible
4. Click "Tambah Harga" → type a product name → select → fill price, uom, dates → Save
5. Verify row appears in catalog table with status `active`

- [ ] **Step 3: Copy link + supply portal**

1. In vendor detail, click "Link Portal" → verify toast "Link portal disalin!"
2. Open copied URL (`localhost:3000/supply/<vendorId>`) in new tab
3. Verify vendor name in header
4. Search a product → select → fill price + dates → "Kirim Penawaran"
5. Verify submission appears in "Penawaran yang Dikirim" with `pending` badge

- [ ] **Step 4: Approval flow**

1. Back in admin, open same vendor detail
2. Verify new pending row visible with amber badge + ✓ ✗ buttons
3. Click ✓ (approve) → verify status changes to `active`
4. Go to Products page → verify `basePrice` of that product updated

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(vendor-catalog): complete vendor catalog, supply portal, and approval flow"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Vendor detail shows products + prices (Task 5)
- ✅ Edit payment term — already existed, no change needed
- ✅ Supply portal `/supply/[vendorId]` (Task 6)
- ✅ Vendor can select from product master (Task 6 search)
- ✅ Request new product via free-text (Task 6 `isRequestNew`)
- ✅ Harga + valid_from/valid_to + lastUpdated stamp (Task 6 form)
- ✅ Admin approve/reject (Task 5 handleApprovePrice/handleRejectPrice)
- ✅ Approve → update basePrice → tier auto-recompute (existing formula, Task 5)
- ✅ vendor_prices in backup/reset (Task 4)
- ✅ DB migration (Task 1)

**Placeholder scan:** None found.

**Type consistency:**
- `VendorPrice` defined Task 2, used identically in Tasks 3, 5, 6
- `vendorId`, `productId`, `validFrom`, `validTo`, `lastUpdated` consistent throughout
- `status: VendorPriceStatus` ('pending'|'active'|'rejected'|'expired') consistent

**Shopping list integration:** Not included in this plan — vendor_prices buy price lookup in shopping list is a follow-on enhancement, low-risk to defer as the shopping list already has manual price override. Spec notes this as a "nice to have."
