# Customer Return QC — Three Decisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the customer-return QC tab a third outcome — "Retur ke Vendor" — that creates a tracked vendor-return, resolved later in a new follow-up tab as either a completed swap (replacement re-QC'd into stock) or a vendor refusal (written off).

**Architecture:** A new persisted `VendorReturn` entity flows through the existing store/sync/API plumbing exactly like `pendingReturns`. The customer-return QC handler splits the returned qty across three buckets (Masuk Stok / Buang / Retur ke Vendor). Vendor-return resolution lives in a new QC tab. All stock and loss movements reuse existing `recordStockMovement` / `recordShrinkage` / `addRejectedItem`.

**Tech Stack:** Next.js App Router, Zustand store (`src/lib/store.ts`), Supabase (server-side service_role via `/api/db`), TypeScript. No test framework — pure logic is verified with the repo's `.check.ts` + `npx tsx` convention (see `src/lib/backorder.check.ts`), everything else with `npx tsc --noEmit`, `npm run lint`, and browser preview.

---

## File Structure

- **Create** `src/lib/vendor-return.ts` — pure split-validation helpers (no React, no store).
- **Create** `src/lib/vendor-return.check.ts` — assert-based check for the helpers.
- **Create** `supabase/migrations/20260722000001_vendor_returns.sql` — the `vendor_returns` table.
- **Modify** `src/types/index.ts` — add `VendorReturn` interface.
- **Modify** `src/lib/store.ts` — state, actions, interface, hydration for `vendorReturns`.
- **Modify** `src/app/api/db/route.ts` — fetch `vendor_returns` in group 4.
- **Modify** `src/app/api/db/backup/route.ts` and `src/app/api/db/reset/route.ts` — include the table.
- **Modify** `src/app/warehouse/qc/page.tsx` — 3-bucket customer-return handler + vendor picker; new "Retur ke Vendor" tab + resolution handler; tab badges.

---

## Task 1: Pure split-validation module

**Files:**
- Create: `src/lib/vendor-return.ts`
- Test: `src/lib/vendor-return.check.ts`

- [ ] **Step 1: Write the failing check**

Create `src/lib/vendor-return.check.ts`:

```ts
import assert from 'node:assert/strict';
import { isReturnSplitValid, isSwapSplitValid } from './vendor-return';

// isReturnSplitValid: three buckets, non-negative, summing to the return total
assert.equal(isReturnSplitValid({ pass: 10, buang: 0, vendor: 0 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 5 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 4 }, 10), false); // sums to 9
assert.equal(isReturnSplitValid({ pass: -1, buang: 6, vendor: 5 }, 10), false); // negative
assert.equal(isReturnSplitValid({ pass: 0.1, buang: 0.2, vendor: 0.7 }, 1), true); // float tolerant
assert.equal(isReturnSplitValid({ pass: NaN, buang: 0, vendor: 0 }, 10), false); // NaN

// isSwapSplitValid: replacement QC split, non-negative, summing to the vendor-return qty
assert.equal(isSwapSplitValid({ pass: 5, reject: 0 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 2 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 1 }, 5), false); // sums to 4
assert.equal(isSwapSplitValid({ pass: 2, reject: -1 }, 1), false); // negative

console.log('vendor-return.check: all assertions passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/lib/vendor-return.check.ts`
Expected: FAIL — `Cannot find module './vendor-return'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/vendor-return.ts`:

```ts
export type ReturnSplit = { pass: number; buang: number; vendor: number };
export type SwapSplit = { pass: number; reject: number };

const EPS = 1e-6;
const bad = (n: number) => !Number.isFinite(n) || n < 0;

/** Three customer-return buckets: all non-negative and summing to the return total. */
export function isReturnSplitValid(split: ReturnSplit, total: number): boolean {
  const { pass, buang, vendor } = split;
  if ([pass, buang, vendor, total].some(bad)) return false;
  return Math.abs(pass + buang + vendor - total) < EPS;
}

/** Replacement QC split: non-negative and summing to the vendor-return qty. */
export function isSwapSplitValid(split: SwapSplit, total: number): boolean {
  const { pass, reject } = split;
  if ([pass, reject, total].some(bad)) return false;
  return Math.abs(pass + reject - total) < EPS;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx tsx src/lib/vendor-return.check.ts`
Expected: PASS — prints `vendor-return.check: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vendor-return.ts src/lib/vendor-return.check.ts
git commit -m "feat(returns): split-validation helpers for vendor-return QC"
```

---

## Task 2: VendorReturn type

**Files:**
- Modify: `src/types/index.ts` (after the `PendingReturn` interface, around line 623)

- [ ] **Step 1: Add the interface**

Insert directly after the closing brace of `PendingReturn` (line 623):

```ts
export interface VendorReturn {
  id: string;
  productId: string;
  vendorId: string;
  qty: number;
  reason: string;
  date: string;                  // ISO timestamp, created
  originalReturnId: string;      // the PendingReturn this came from
  status: 'Menunggu Vendor' | 'Selesai-Ditukar' | 'Selesai-Ditolak';
  resolvedDate?: string;         // ISO timestamp, set on resolution
  replacementPassQty?: number;   // set on Ditukar
  replacementRejectQty?: number; // set on Ditukar
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors — the type is not yet referenced).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(returns): add VendorReturn type"
```

---

## Task 3: Database table

**Files:**
- Create: `supabase/migrations/20260722000001_vendor_returns.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722000001_vendor_returns.sql`:

```sql
-- supabase/migrations/20260722000001_vendor_returns.sql
-- Vendor-return tracking for customer returns sent back to a vendor for swap.
-- Lifecycle: Menunggu Vendor -> Selesai-Ditukar | Selesai-Ditolak

CREATE TABLE IF NOT EXISTS public.vendor_returns (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    qty NUMERIC NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    date TIMESTAMPTZ DEFAULT NOW(),
    original_return_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Menunggu Vendor'
        CHECK (status IN ('Menunggu Vendor', 'Selesai-Ditukar', 'Selesai-Ditolak')),
    resolved_date TIMESTAMPTZ,
    replacement_pass_qty NUMERIC,
    replacement_reject_qty NUMERIC
);

CREATE INDEX IF NOT EXISTS vendor_returns_status_idx ON public.vendor_returns(status);
CREATE INDEX IF NOT EXISTS vendor_returns_vendor_idx ON public.vendor_returns(vendor_id);

ALTER TABLE public.vendor_returns ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.vendor_returns TO postgres;
GRANT ALL ON TABLE public.vendor_returns TO anon;
GRANT ALL ON TABLE public.vendor_returns TO authenticated;
GRANT ALL ON TABLE public.vendor_returns TO service_role;
```

- [ ] **Step 2: Apply the migration locally**

Run: `psql "$DATABASE_URL" -f supabase/migrations/20260722000001_vendor_returns.sql`
(or the project's usual local migration command — e.g. `supabase db push` if the Supabase CLI is wired up).
Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `GRANT` with no errors. If the table already exists the `IF NOT EXISTS` guards make it a no-op.

Note: RLS is enabled with no policies, matching `disbursement_requests`. The app reaches this table only through `/api/db` using the Supabase service_role key, which bypasses RLS — so no policy is needed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260722000001_vendor_returns.sql
git commit -m "feat(returns): vendor_returns table"
```

---

## Task 4: Store wiring

**Files:**
- Modify: `src/lib/store.ts` — type import; `StoreState` interface (~line 550); state+actions (after `updatePendingReturn`, ~line 3026); hydration (~line 1122).

- [ ] **Step 1: Import the type**

Find the existing type import from `@/types` in `src/lib/store.ts` (the large `import type { ... } from '@/types'` / `import { ... } from '@/types'` block near the top). Add `VendorReturn` to the imported names.

Run: `grep -n "PendingReturn" src/lib/store.ts | head -1` to locate the import line if `PendingReturn` is imported there; add `VendorReturn` alongside it.

- [ ] **Step 2: Add to the StoreState interface**

In the `// Returns & Rejections` section of the interface (right after `updatePendingReturn: (id: string, data: Partial<PendingReturn>) => Promise<void>;`, around line 550):

```ts
  vendorReturns: VendorReturn[];
  addVendorReturn: (vr: VendorReturn) => Promise<void>;
  updateVendorReturn: (id: string, data: Partial<VendorReturn>) => Promise<void>;
```

- [ ] **Step 3: Add state + actions**

Immediately after the `updatePendingReturn` action block (the closing `},` at line 3026), insert:

```ts
      vendorReturns: [],
      addVendorReturn: async (vr) => {
        set((state) => ({ vendorReturns: [...state.vendorReturns, vr] }));
        await get().syncTable('vendor_returns', vr);
      },
      updateVendorReturn: async (id, data) => {
        const updated = get().vendorReturns.map(v => v.id === id ? { ...v, ...data } : v);
        set({ vendorReturns: updated });
        const row = updated.find(v => v.id === id);
        if (row) await get().syncTable('vendor_returns', row);
      },
```

- [ ] **Step 4: Hydrate on load**

Directly after `setIfDefined('pendingReturns', data.pendingReturns);` (line 1122):

```ts
            setIfDefined('vendorReturns', data.vendorReturns);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If it errors on `VendorReturn` not found, the import in Step 1 is missing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(returns): store state + sync for vendorReturns"
```

---

## Task 5: API fetch + backup/reset lists

**Files:**
- Modify: `src/app/api/db/route.ts` (group 4, lines 160-173)
- Modify: `src/app/api/db/backup/route.ts` (table list, ~line 15)
- Modify: `src/app/api/db/reset/route.ts` (table list, ~line 29)

- [ ] **Step 1: Fetch the table in group 4**

Replace the group-4 block (lines 161-173) with:

```ts
      const [vendors, deliveries, stockMovements, pendingReturns, rejectedItems, vendorPrices, vendorReturns] = await Promise.all([
        fetchTable('vendors'), fetchTable('deliveries'),
        fetchTable('stock_movements'), fetchTable('pending_returns'),
        fetchTable('rejected_items'), fetchTable('vendor_prices'),
        fetchTable('vendor_returns')
      ]);
      return NextResponse.json({
        vendors: toCamel(vendors),
        deliveries: toCamel(deliveries),
        stockMovements: toCamel(stockMovements),
        pendingReturns: toCamel(pendingReturns),
        rejectedItems: toCamel(rejectedItems),
        vendorPrices: toCamel(vendorPrices),
        vendorReturns: toCamel(vendorReturns),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
```

- [ ] **Step 2: Add to backup list**

In `src/app/api/db/backup/route.ts`, add `'vendor_returns'` to the table-name array that currently contains `'pending_returns'` (around line 15). Place it next to `'pending_returns'`.

- [ ] **Step 3: Add to reset list**

In `src/app/api/db/reset/route.ts`, add `'vendor_returns'` to the table-name array that contains `'pending_returns'` (around line 29), next to `'pending_returns'`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/db/route.ts src/app/api/db/backup/route.ts src/app/api/db/reset/route.ts
git commit -m "feat(returns): load, back up, and reset vendor_returns"
```

---

## Task 6: Customer-return QC — third bucket + vendor picker

**Files:**
- Modify: `src/app/warehouse/qc/page.tsx` — imports (line 12); state (~line 337); `handleProcessReturnQC` (lines 341-405); returns-tab UI (lines 803-850); card onClick (lines 779-783).

- [ ] **Step 1: Add imports and selectors**

Add `Store` to the lucide import on line 12:

```ts
import { ShieldAlert, ShieldCheck, Tag, RefreshCcw, PackageSearch, AlertTriangle, Warehouse, Truck, ClipboardCheck, ChevronDown, Store } from "lucide-react"
```

Add the split-validation helper import after line 16 (`import { qtyOwed } from "@/lib/backorder"`):

```ts
import { isReturnSplitValid, isSwapSplitValid } from "@/lib/vendor-return"
```

Add store selectors near the other `useAppStore` selectors at the top of the component (after line 30, `const clients = ...`):

```ts
  const vendors = useAppStore(state => state.vendors)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const vendorReturns = useAppStore(state => state.vendorReturns)
```

- [ ] **Step 2: Add state for the third bucket + vendor**

After the existing return-tab state (`const [retReason, setRetReason] = useState("")`, line 339), add:

```ts
  const [retQtyVendor, setRetQtyVendor] = useState(0)
  const [retVendorId, setRetVendorId] = useState("")
```

- [ ] **Step 3: Default the buckets and vendor when a return is selected**

Replace the card `onClick` (lines 779-783) with one that resets all three buckets and auto-suggests the vendor from the product's active price:

```tsx
                            onClick={() => {
                              setSelectedReturnId(ret.id)
                              setRetQtyPass(ret.qty)
                              setRetQtyReject(0)
                              setRetQtyVendor(0)
                              const suggested = vendorPrices.find(vp => vp.productId === ret.productId && vp.status === 'active')?.vendorId || ""
                              setRetVendorId(suggested)
                            }}
```

- [ ] **Step 4: Rewrite `handleProcessReturnQC` for three buckets**

Replace the whole function body (lines 341-405) with:

```ts
  const handleProcessReturnQC = async () => {
    if (!activeReturn || !activeReturnProduct) return
    const currentUser = useAppStore.getState().currentUser

    if (!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)) {
      toast.error(`Total QC harus match dengan jumlah retur (${activeReturn.qty})`)
      return
    }
    if (retQtyVendor > 0 && !retVendorId) {
      toast.error("Pilih vendor tujuan retur dulu.")
      return
    }

    if (retQtyPass > 0) {
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyPass,
        stockDelta: retQtyPass,
        direction: 'In',
        kind: 'RETURN_RESTOCK',
        source: 'Return QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer lolos QC dan kembali ke inventory`,
        createdByUserId: currentUser?.id || 'system',
      })
      toast.success(`${retQtyPass} unit dikembalikan ke stok layak jual.`)
    }

    if (retQtyReject > 0) {
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, retQtyReject * (activeReturnProduct.basePrice || 0), `Return Reject - ${activeReturnProduct.name}: ${retReason || activeReturn.reason}`)
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'RETURN_REJECT',
        source: 'Return QC',
        destination: 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer reject: ${retReason || activeReturn.reason}`,
        createdByUserId: currentUser?.id || 'system',
      })
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeReturnProduct.id,
        qty: retQtyReject,
        reason: retReason || activeReturn.reason,
        source: 'Return',
        referenceId: activeReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      toast.error(`${retQtyReject} unit rusak/dibuang.`)
    }

    if (retQtyVendor > 0) {
      const vrId = uuidv4()
      await useAppStore.getState().addVendorReturn({
        id: vrId,
        productId: activeReturnProduct.id,
        vendorId: retVendorId,
        qty: retQtyVendor,
        reason: retReason || activeReturn.reason,
        date: new Date().toISOString(),
        originalReturnId: activeReturn.id,
        status: 'Menunggu Vendor',
      })
      // Notify Admin PO — they coordinate the swap with the vendor.
      const vendorName = vendors.find(v => v.id === retVendorId)?.name || 'vendor'
      const adminUsers = useAppStore.getState().users.filter(u => u.role === 'admin_po')
      for (const adminUser of adminUsers) {
        await useAppStore.getState().addNotification({
          id: uuidv4(),
          userId: adminUser.id,
          title: `Retur ke Vendor: ${activeReturnProduct.name}`,
          message: `${retQtyVendor} ${activeReturnProduct.uom} diretur ke ${vendorName} untuk ditukar.`,
          type: 'system',
          link: '/warehouse/qc',
          read: false,
          createdAt: new Date().toISOString()
        })
      }
      toast.success(`${retQtyVendor} unit diretur ke vendor untuk ditukar.`)
    }

    // Persist completion — a state-only mutation reappears on next sync.
    await updatePendingReturn(activeReturn.id, { status: 'Processed' })
    setSelectedReturnId("")
    setRetQtyPass(0)
    setRetQtyReject(0)
    setRetQtyVendor(0)
    setRetVendorId("")
    setRetReason("")
  }
```

- [ ] **Step 5: Add the third bucket + vendor picker to the UI**

Replace the two-column grid (lines 813-840, the `<div className="grid grid-cols-2 gap-6">` block) with a three-column grid plus a vendor dropdown that appears when the vendor bucket is used:

```tsx
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100/50 space-y-3">
                        <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <RefreshCcw className="w-4 h-4" /> Masuk Stok
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyPass}
                           onChange={(e) => setRetQtyPass(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-rose-50/50 p-5 rounded-[2rem] border border-rose-100/50 space-y-3">
                        <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Buang
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyReject}
                           onChange={(e) => setRetQtyReject(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-blue-50/50 p-5 rounded-[2rem] border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Store className="w-4 h-4" /> Retur ke Vendor
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyVendor}
                           onChange={(e) => setRetQtyVendor(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {retQtyVendor > 0 && (
                      <div className="bg-blue-50/50 p-5 rounded-[2rem] border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-black uppercase text-[10px] tracking-widest">Vendor Tujuan Retur</Label>
                        <select
                          className="w-full h-14 rounded-xl border border-blue-100 bg-white px-4 font-bold text-slate-700"
                          value={retVendorId}
                          onChange={(e) => setRetVendorId(e.target.value)}
                        >
                          <option value="">— Pilih vendor —</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
```

- [ ] **Step 6: Fix the confirm button's disabled guard**

Replace the button's `disabled` prop (line 844) so it validates the three-bucket sum:

```tsx
                      disabled={!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)}
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (`isSwapSplitValid` is imported but unused until Task 7 — if lint flags no-unused-vars, leave it; Task 7 uses it. If lint is set to error on unused imports, import `isSwapSplitValid` in Task 7 instead and import only `isReturnSplitValid` here.)

- [ ] **Step 8: Commit**

```bash
git add src/app/warehouse/qc/page.tsx
git commit -m "feat(returns): third QC outcome — retur ke vendor"
```

---

## Task 7: "Retur ke Vendor" follow-up tab

**Files:**
- Modify: `src/app/warehouse/qc/page.tsx` — TabsList (lines 468-489); new `<TabsContent value="vendor-returns">`; resolution state + handler.

- [ ] **Step 1: Add resolution state**

After the vendor-picker state from Task 6 (`const [retVendorId, setRetVendorId] = useState("")`), add:

```ts
  const [selectedVendorReturnId, setSelectedVendorReturnId] = useState("")
  const [swapPassQty, setSwapPassQty] = useState(0)
  const [swapRejectQty, setSwapRejectQty] = useState(0)
  const pendingVendorReturns = vendorReturns.filter(v => v.status === 'Menunggu Vendor')
  const activeVendorReturn = pendingVendorReturns.find(v => v.id === selectedVendorReturnId)
  const activeVendorReturnProduct = products.find(p => p.id === activeVendorReturn?.productId)
```

- [ ] **Step 2: Add the resolution handler**

Add this function next to `handleProcessReturnQC`:

```ts
  const handleResolveVendorReturn = async (mode: 'swap' | 'reject') => {
    if (!activeVendorReturn || !activeVendorReturnProduct) return
    const currentUser = useAppStore.getState().currentUser
    const prod = activeVendorReturnProduct

    if (mode === 'swap') {
      if (!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)) {
        toast.error(`Total QC pengganti harus match dengan jumlah retur (${activeVendorReturn.qty})`)
        return
      }
      if (swapPassQty > 0) {
        await recordStockMovement({
          productId: prod.id,
          quantity: swapPassQty,
          stockDelta: swapPassQty,
          direction: 'In',
          kind: 'RETURN_RESTOCK',
          source: 'Vendor Swap',
          destination: 'Inventory',
          referenceType: 'QC',
          referenceId: activeVendorReturn.id,
          note: `Barang pengganti dari vendor lolos QC, masuk stok`,
          createdByUserId: currentUser?.id || 'system',
        })
      }
      if (swapRejectQty > 0) {
        const rejectId = uuidv4()
        await recordShrinkage(rejectId, swapRejectQty * (prod.basePrice || 0), `Vendor Swap Reject - ${prod.name}`)
        await useAppStore.getState().addRejectedItem({
          id: rejectId,
          date: new Date().toISOString(),
          productId: prod.id,
          qty: swapRejectQty,
          reason: `Pengganti vendor gagal QC: ${activeVendorReturn.reason}`,
          source: 'Return',
          referenceId: activeVendorReturn.id,
          reportedBy: currentUser?.id || 'system'
        })
      }
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditukar',
        resolvedDate: new Date().toISOString(),
        replacementPassQty: swapPassQty,
        replacementRejectQty: swapRejectQty,
      })
      toast.success(`Tukar selesai: ${swapPassQty} masuk stok, ${swapRejectQty} dibuang.`)
    } else {
      // Vendor refused — the full quantity becomes a loss now.
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, activeVendorReturn.qty * (prod.basePrice || 0), `Vendor Tolak Retur - ${prod.name}`)
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: prod.id,
        qty: activeVendorReturn.qty,
        reason: `Vendor tolak tukar: ${activeVendorReturn.reason}`,
        source: 'Return',
        referenceId: activeVendorReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditolak',
        resolvedDate: new Date().toISOString(),
      })
      toast.error(`${activeVendorReturn.qty} unit ditolak vendor, dibuang.`)
    }

    setSelectedVendorReturnId("")
    setSwapPassQty(0)
    setSwapRejectQty(0)
  }
```

- [ ] **Step 3: Add the tab trigger with a badge**

In the `<TabsList>` (lines 468-489), after the `dispatch` trigger's closing `</TabsTrigger>` (line 488), add a fourth trigger. Match the existing triggers' className (copy it verbatim from the `returns` trigger at line 472) and append the badge:

```tsx
                <TabsTrigger value="vendor-returns" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                  <Store className="w-4 h-4" /> Retur ke Vendor
                  {pendingVendorReturns.length > 0 && (
                    <span className="ml-1 bg-blue-600 text-white rounded-full px-2 py-0.5 text-[9px]">{pendingVendorReturns.length}</span>
                  )}
                </TabsTrigger>
```

- [ ] **Step 4: Add a badge to the existing "returns" trigger too**

So the customer-return queue is equally visible, add the same badge pattern inside the `returns` trigger (line 472-479), using `pendingReturns.length`:

```tsx
                  {pendingReturns.length > 0 && (
                    <span className="ml-1 bg-blue-600 text-white rounded-full px-2 py-0.5 text-[9px]">{pendingReturns.length}</span>
                  )}
```

(Place it just before the trigger's closing `</TabsTrigger>`.)

- [ ] **Step 5: Add the tab content**

After the `returns` `</TabsContent>` (line 853), add:

```tsx
        <TabsContent value="vendor-returns">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <Store className="w-6 h-6 text-blue-600" /> Retur ke Vendor (Menunggu Tukar)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {pendingVendorReturns.length === 0 ? (
                <div className="h-40 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                  <Store className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Tidak ada retur vendor yang menunggu</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {pendingVendorReturns.map(vr => {
                    const p = products.find(prod => prod.id === vr.productId)
                    const vend = vendors.find(v => v.id === vr.vendorId)
                    return (
                      <button
                        key={vr.id}
                        onClick={() => {
                          setSelectedVendorReturnId(vr.id)
                          setSwapPassQty(vr.qty)
                          setSwapRejectQty(0)
                        }}
                        className={cn(
                          "p-5 rounded-[2rem] border text-left flex justify-between items-center transition-all",
                          selectedVendorReturnId === vr.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                        )}
                      >
                        <div>
                          <h4 className="font-black text-slate-800 uppercase tracking-tight">{p?.name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Vendor: {vend?.name} • Alasan: {vr.reason}</p>
                        </div>
                        <div className="bg-slate-100 px-4 py-2 rounded-2xl font-black text-sm text-slate-600">{vr.qty} {p?.uom}</div>
                      </button>
                    )
                  })}
                </div>
              )}

              {activeVendorReturn && activeVendorReturnProduct && (
                <div className="pt-8 border-t border-slate-50 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-blue-50 border border-blue-100 p-5 rounded-[2rem]">
                    <p className="font-black text-[10px] uppercase text-blue-700 tracking-widest mb-1">QC Barang Pengganti</p>
                    <p className="text-xs font-bold text-blue-800/80 leading-relaxed">Kalau vendor kasih pengganti, cek kondisinya lalu isi berapa yang layak masuk stok. Kalau vendor tolak tukar, pakai tombol merah.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100/50 space-y-3">
                      <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest">Pengganti Layak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                        value={swapPassQty}
                        onChange={(e) => setSwapPassQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="bg-rose-50/50 p-5 rounded-[2rem] border border-rose-100/50 space-y-3">
                      <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest">Pengganti Rusak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                        value={swapRejectQty}
                        onChange={(e) => setSwapRejectQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-black uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all"
                      disabled={!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)}
                      onClick={() => handleResolveVendorReturn('swap')}
                    >
                      Ditukar (Pengganti Masuk)
                    </Button>
                    <Button
                      className="h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-3xl font-black uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all"
                      onClick={() => handleResolveVendorReturn('reject')}
                    >
                      Ditolak Vendor (Buang)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/warehouse/qc/page.tsx
git commit -m "feat(returns): vendor-return follow-up tab with swap/reject resolution"
```

---

## Task 8: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the preview tooling (`.claude/launch.json` dev entry) to start the app and open `/warehouse/qc`.

- [ ] **Step 2: Verify the three-bucket customer-return UI**

With at least one `pendingReturn` present (a courier reduction from the parent flow), open the "Inspeksi Retur Customer" tab. Confirm:
- three inputs — Masuk Stok / Buang / Retur ke Vendor,
- the confirm button stays disabled until the three sum to the return qty,
- setting Retur ke Vendor > 0 reveals the vendor dropdown, pre-filled with the product's active vendor when one exists.

Check the browser console (read_console_messages) for errors.

- [ ] **Step 3: Verify the vendor-return lifecycle**

Split some qty to Retur ke Vendor and confirm. Then:
- the "Retur ke Vendor" tab shows a badge and the new row,
- **Ditukar** with a pass/reject split closes the row and the pass qty shows up as an inbound stock movement,
- a separate return resolved with **Ditolak Vendor** closes the row and appears in the Rejection Monitor.

- [ ] **Step 4: Confirm loss-analytics neutrality**

While a vendor-return is `Menunggu Vendor`, confirm its quantity appears as neither stock nor loss. After **Ditukar**, confirm it did not add a loss for the passed qty. Screenshot the loss-analytics view as proof.

- [ ] **Step 5: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "fix(returns): verification adjustments for vendor-return QC"
```

---

## Notes for the implementer

- **Persistence over state-only mutation:** always resolve returns via `updatePendingReturn` / `updateVendorReturn` (which `syncTable`), never a state-only filter — an un-synced status flip reappears on the next fetch and lets goods be restocked twice. This is why `removePendingReturn` is not used for completion.
- **No new cost is booked** anywhere in the vendor-swap path. A refused swap (`Ditolak Vendor`) is the only place a loss lands, and it lands at resolution time, not at creation.
- **`recordShrinkage` valuation** uses `basePrice` here, matching the existing customer-return reject path (`page.tsx:369`). Keep it consistent; do not switch to a different cost basis.
