# Dropship (Vendor → Klien) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin PO mark a shopping-list row as delivered by the vendor straight to the client, then book the sale, the vendor obligation and any shortfall from a single confirmation screen — without the goods ever touching the warehouse.

**Architecture:** `Dropship` becomes a fourth `PurchaseMethod`. Because every downstream queue (sourcing, inbound, QC, packing) selects on `'Pasar'`, `'Online'` or `'Vendor'` explicitly, a new value drops out of all of them with no edits there. The confirmation screen replaces QC as the point where money moves. Arithmetic lives in a pure module with a runnable check; the accounting entries reuse `createAccountingEntry` and the existing vendor-payment helpers.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand store (`src/lib/store.ts`), Supabase via `/api/db`, jsPDF, Tailwind + shadcn/ui, `node:assert` checks run with `npx tsx`.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-08-04-dropship-vendor-ke-klien-design.md`.
- Dropship is selectable **only** on rows tied to a sales order. Manual/susulan rows have no delivery target.
- Dropship goods **never** produce a stock movement — not in, not out, not a booking.
- Dropship payment methods are **Transfer** and **Tempo** only. Cash is a sourcing-wallet concept and nobody from Disma is at the handover.
- Client is invoiced, and the vendor is owed, **only for the qty the client confirms receiving**.
- The shortfall goes into the existing susulan list (`rejectedItems`), not a new mechanism.
- No test framework in this repo. Checks are `*.check.ts` files using `node:assert/strict`, run with `npx tsx <path>`, ending in a `console.log('<name>: all checks passed')`.
- Indonesian for all user-facing copy; English for code, comments and commit messages.
- Existing accounts: `1-2000` piutang, `4-1000` pendapatan, `5-1000` HPP, `2-1100` GR/IR accrual, `2-1000` utang vendor.

---

### Task 1: Dropship as a fourth purchase method, with its arithmetic

**Files:**
- Modify: `src/types/index.ts:192`
- Create: `src/lib/dropship.ts`
- Test: `src/lib/dropship.check.ts`

**Interfaces:**
- Consumes: `roundQtyToBook`, `qtyOwed` from `src/lib/backorder.ts`.
- Produces:
  - `type PurchaseMethod = 'Pasar' | 'Vendor' | 'Online' | 'Dropship'`
  - `isDropship(item: { purchaseMethod?: string }): boolean`
  - `dropshipShortfall(orderedQty: number, receivedQty: number): number`
  - `dropshipLineValue(receivedQty: number, unitPrice: number): number`
  - `groupKey(vendorId: string | undefined, salesOrderId: string | undefined): string`
  - `type DropshipGroup = { key: string; vendorId?: string; salesOrderId?: string; items: T[] }`
  - `groupDropship<T extends { vendorId?: string; salesOrderId?: string }>(items: T[]): DropshipGroup<T>[]`

- [ ] **Step 1: Write the failing check**

Create `src/lib/dropship.check.ts`:

```ts
/**
 * Runnable check for the dropship arithmetic. No test framework in this repo —
 * run directly:  npx tsx src/lib/dropship.check.ts
 */
import assert from 'node:assert/strict';
import { isDropship, dropshipShortfall, dropshipLineValue, groupKey, groupDropship } from './dropship';

// isDropship keys off the purchase method, and only that method.
assert.equal(isDropship({ purchaseMethod: 'Dropship' }), true);
assert.equal(isDropship({ purchaseMethod: 'Vendor' }), false);
assert.equal(isDropship({ purchaseMethod: 'Pasar' }), false);
assert.equal(isDropship({}), false);

// Shortfall is what the client did not get. Never negative: a vendor who
// over-delivers does not create a negative susulan.
assert.equal(dropshipShortfall(10, 8), 2);
assert.equal(dropshipShortfall(10, 10), 0);
assert.equal(dropshipShortfall(10, 12), 0);
assert.equal(dropshipShortfall(10, 0), 10);

// Billing follows what was received, not what was ordered.
assert.equal(dropshipLineValue(8, 12_500), 100_000);
assert.equal(dropshipLineValue(0, 12_500), 0);

// One surat jalan per vendor+client pairing, so grouping is on both.
assert.equal(groupKey('v1', 'so1'), 'v1::so1');
assert.equal(groupKey(undefined, 'so1'), '::so1');

const grouped = groupDropship([
  { id: 'a', vendorId: 'v1', salesOrderId: 'so1' },
  { id: 'b', vendorId: 'v1', salesOrderId: 'so1' },
  { id: 'c', vendorId: 'v2', salesOrderId: 'so1' },
  { id: 'd', vendorId: 'v1', salesOrderId: 'so2' },
]);
assert.equal(grouped.length, 3);
const first = grouped.find(g => g.key === 'v1::so1');
assert.ok(first);
assert.deepEqual(first.items.map(i => i.id), ['a', 'b']);
assert.equal(first.vendorId, 'v1');
assert.equal(first.salesOrderId, 'so1');
// Same vendor, different order => a separate delivery note.
assert.equal(grouped.find(g => g.key === 'v1::so2')?.items.length, 1);

console.log('dropship: all checks passed');
```

- [ ] **Step 2: Run the check to verify it fails**

```bash
npx tsx src/lib/dropship.check.ts
```

Expected: FAIL — `Cannot find module './dropship'`.

- [ ] **Step 3: Write the pure module**

Create `src/lib/dropship.ts`:

```ts
// Pure arithmetic and grouping for dropship (vendor delivers straight to the
// client). No store/React imports so it stays trivially testable — same shape
// as backorder.ts.

/** A row is dropship purely by its purchase method. */
export function isDropship(item: { purchaseMethod?: string }): boolean {
  return item.purchaseMethod === 'Dropship';
}

/**
 * Qty the client did not receive, which becomes a susulan.
 * A vendor who over-delivers never creates a negative susulan.
 */
export function dropshipShortfall(orderedQty: number, receivedQty: number): number {
  return Math.max(0, orderedQty - receivedQty);
}

/** Money for a line: the client is billed, and the vendor owed, for what arrived. */
export function dropshipLineValue(receivedQty: number, unitPrice: number): number {
  return Math.max(0, receivedQty) * unitPrice;
}

/** One delivery note per vendor + sales order pairing. */
export function groupKey(vendorId: string | undefined, salesOrderId: string | undefined): string {
  return `${vendorId || ''}::${salesOrderId || ''}`;
}

export type DropshipGroup<T> = {
  key: string;
  vendorId?: string;
  salesOrderId?: string;
  items: T[];
};

export function groupDropship<T extends { vendorId?: string; salesOrderId?: string }>(
  items: T[]
): DropshipGroup<T>[] {
  const groups = new Map<string, DropshipGroup<T>>();
  items.forEach(item => {
    const key = groupKey(item.vendorId, item.salesOrderId);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, vendorId: item.vendorId, salesOrderId: item.salesOrderId, items: [item] });
    }
  });
  return Array.from(groups.values());
}
```

- [ ] **Step 4: Add the method to the type**

In `src/types/index.ts`, replace line 192:

```ts
export type PurchaseMethod = 'Pasar' | 'Vendor' | 'Online'; // lokasi ambil barang
```

with:

```ts
// 'Dropship' = vendor mengantar langsung ke klien, tidak lewat gudang sama sekali.
export type PurchaseMethod = 'Pasar' | 'Vendor' | 'Online' | 'Dropship'; // lokasi ambil barang
```

- [ ] **Step 5: Run the check to verify it passes**

```bash
npx tsx src/lib/dropship.check.ts
```

Expected: `dropship: all checks passed`

- [ ] **Step 6: Verify no queue silently swallows the new method**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors in `src/app/admin/loss-analytics/page.tsx` and `src/app/finance/disbursements/page.tsx`, and nothing else. If a new error appears, a `switch` or exhaustive map somewhere needs a `Dropship` branch — fix it there.

Then confirm by reading that these three filters exclude `Dropship` by construction (they select on explicit values, so no edit is needed — this step is a read, not a change):
- `src/app/sourcing/list/page.tsx:142` — `pi.purchaseMethod === 'Pasar'`
- `src/app/warehouse/inbound/page.tsx:29-32` — `'Pasar' || !purchaseMethod`, `'Online' && isOnlineOrdered`, `'Vendor'`
- `src/app/warehouse/qc/page.tsx:44-52` — same three, plus `inboundStatus === 'pra_inbound'` which only inbound sets

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/dropship.ts src/lib/dropship.check.ts
git commit -m "feat(dropship): add Dropship purchase method and its arithmetic"
```

---

### Task 2: Pick "Vendor → Klien" on a shopping-list row

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx` (state ~line 167, selectors ~line 388-410, draft load ~line 226, draft save ~line 247, row build ~line 494, bulk buttons ~line 1602, row buttons ~line 1874)
- Modify: `src/app/admin/purchase-requests/page.tsx` (`sourceLabel`, ~line 130)

**Interfaces:**
- Consumes: `isDropship` from Task 1; the `shopping_draft` row shape already saved by the page.
- Produces: `dropshipProductIds` as a new array field inside the saved draft JSON; rows whose `purchaseMethod` is `'Dropship'`.

- [ ] **Step 1: Add the state and its draft round-trip**

In `src/app/admin/shopping-list/page.tsx`, after the `vendorProductIds` state (currently ending line 170), add:

```tsx
  // Baris yang diantar vendor langsung ke klien — tidak lewat gudang sama sekali.
  const [dropshipProductIds, setDropshipProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_dropshipProductIds_v2') || '[]')) } catch { return new Set() }
  })
```

Next to the other persist effects (after the `vendorProductIds` one, currently line 207), add:

```tsx
  useEffect(() => { localStorage.setItem('shopping_dropshipProductIds_v2', JSON.stringify(Array.from(dropshipProductIds))) }, [dropshipProductIds])
```

In the draft-load effect, after the `vendorProductIds` line, add:

```tsx
          if (Array.isArray(d.dropshipProductIds)) setDropshipProductIds(new Set(d.dropshipProductIds))
```

In the draft-save effect, add to the `draft` object after `vendorProductIds`:

```tsx
      dropshipProductIds: Array.from(dropshipProductIds),
```

and add `dropshipProductIds` to that effect's dependency array.

- [ ] **Step 2: Make the four location选择 mutually exclusive**

`selectPasar`, `selectOnline` and `selectVendor` each clear the other two sets. Add `setDropshipProductIds` clearing to all three, in the same shape they already use, e.g. inside `selectPasar`:

```tsx
    setDropshipProductIds(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
```

Then add the new selector after `selectVendor` (currently ends line 405):

```tsx
  // Vendor mengantar langsung ke klien. Hanya untuk baris yang terikat sebuah PO —
  // baris stok manual tidak punya tujuan pengiriman. Uang tunai tidak berlaku:
  // tidak ada orang kita di lokasi serah terima, jadi turunkan Cash ke Transfer.
  const selectDropship = (key: string, salesOrderId?: string) => {
    if (!salesOrderId) {
      toast.error("Kiriman langsung ke klien cuma bisa untuk barang yang nempel ke PO.")
      return
    }
    saveToHistory()
    setStockBookedProductIds(prev => { const next = new Set(prev); next.delete(key); return next })
    setOnlineProductIds(prev => { const next = new Set(prev); next.delete(key); return next })
    setVendorProductIds(prev => { const next = new Set(prev); next.delete(key); return next })
    setDropshipProductIds(prev => { const next = new Set(prev); next.add(key); return next })
    setPaymentByProduct(prev => (prev[key] || 'Cash') === 'Cash' ? { ...prev, [key]: 'Transfer' } : prev)
  }
```

- [ ] **Step 3: Derive the row's purchase method**

In `rawConsolidatedList` (currently line 494), replace:

```tsx
          purchaseMethod: vendorProductIds.has(key) ? 'Vendor' : onlineProductIds.has(key) ? 'Online' : 'Pasar',
```

with:

```tsx
          purchaseMethod: dropshipProductIds.has(key) ? 'Dropship'
            : vendorProductIds.has(key) ? 'Vendor'
            : onlineProductIds.has(key) ? 'Online'
            : 'Pasar',
```

Widen the inline type annotation on the `reduce` accumulator (same statement, currently line 504) from `purchaseMethod: 'Pasar' | 'Online' | 'Vendor'` to `purchaseMethod: 'Pasar' | 'Online' | 'Vendor' | 'Dropship'`, and do the same for the `ShoppingListDocumentItem` type at line 29.

- [ ] **Step 4: Add the button to the row**

In the row's location button group, after the Vendor button (currently ends line 1884), add:

```tsx
                                            {/* Button Vendor → Klien */}
                                            <button
                                               onClick={() => selectDropship(rowKey(item), item.salesOrderId)}
                                               disabled={!item.salesOrderId}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed",
                                                  item.purchaseMethod === 'Dropship' && !item.fromStock
                                                     ? "bg-orange-100 border-orange-300 text-orange-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title={item.salesOrderId
                                                  ? "Vendor antar langsung ke klien (tidak lewat gudang)"
                                                  : "Cuma untuk barang yang nempel ke PO"}
                                            >
                                               Ke Klien
                                            </button>
```

And in the per-group bulk row (after the Vendor bulk button, currently ends line 1602):

```tsx
                                                onClick={() => { saveToHistory(); items.forEach(i => selectDropship(rowKey(i), i.salesOrderId)) }}
```

wrapped in a button matching its three siblings, labelled `Ke Klien`.

- [ ] **Step 5: Restrict the payment method for dropship rows**

In `setPaymentMethod` (currently line 407), add the guard:

```tsx
  const setPaymentMethod = (key: string, method: 'Cash' | 'Tempo' | 'Transfer') => {
    if (method === 'Cash' && dropshipProductIds.has(key)) {
      toast.error("Kiriman langsung ke klien nggak bisa bayar tunai — pilih Transfer atau Tempo.")
      return
    }
    saveToHistory()
    setPaymentByProduct(prev => ({ ...prev, [key]: method }))
  }
```

- [ ] **Step 6: Show it on the Purchase Request page**

In `src/app/admin/purchase-requests/page.tsx`, extend the `shoppingDraft` state to carry the new set:

```tsx
  const [shoppingDraft, setShoppingDraft] = useState<{
    onlineProductIds: Set<string>;
    dropshipProductIds: Set<string>;
    vendorAssignments: Record<string, string>
  }>({
    onlineProductIds: new Set(),
    dropshipProductIds: new Set(),
    vendorAssignments: {}
  })
```

Populate it in both the server and the localStorage branch of the loader (`d.dropshipProductIds` / `localStorage.getItem('shopping_dropshipProductIds_v2')`), and change `sourceLabel` so a dropship row says where it goes:

```tsx
      const sourceLabel = (productId: string, salesOrderId?: string) => {
        const key = rowKey(productId, salesOrderId)
        const vendorId = vendorAssignments[key] || products.find(p => p.id === productId)?.defaultVendorId
        const vendorName = vendorId ? vendors.find(v => v.id === vendorId)?.companyName : undefined
        if (dropshipProductIds.has(key)) return ` (${vendorName || 'Vendor'} → langsung ke klien)`
        if (vendorName) return ` (${vendorName})`
        return onlineProductIds.has(key) ? ' (Belanja Online)' : ''
      }
```

destructuring `dropshipProductIds` alongside the other two from `shoppingDraft`.

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors, nothing new.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/shopping-list/page.tsx src/app/admin/purchase-requests/page.tsx
git commit -m "feat(dropship): pick vendor-to-client delivery on a shopping list row"
```

---

### Task 3: Carry dropship through document generation

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx` (`handleGenerateDocument`, ~line 637-707)

**Interfaces:**
- Consumes: rows carrying `purchaseMethod: 'Dropship'` from Task 2.
- Produces: `purchase_items` rows with `purchaseMethod: 'Dropship'`, `vendorId` set, `qtyPurchased` pre-filled, which Task 5's screen reads.

- [ ] **Step 1: Pre-fill qty for dropship items**

In the `addPurchaseItems` call, the `qtyPurchased` line currently reads:

```tsx
        qtyPurchased: item.purchaseMethod === 'Vendor' ? item.totalQty : 0,
```

Replace with:

```tsx
        // Vendor dan Dropship sama-sama tidak lewat checklist sourcing, jadi tidak ada
        // langkah belakangan yang mengisi ini. Set di sini supaya layar berikutnya tidak
        // melihat qty 0 permanen; selisih sebenarnya ditangkap saat konfirmasi.
        qtyPurchased: (item.purchaseMethod === 'Vendor' || item.purchaseMethod === 'Dropship') ? item.totalQty : 0,
```

- [ ] **Step 2: Refuse to generate a dropship row without a vendor**

Immediately after the existing `if (consolidatedList.length === 0)` guard, add:

```tsx
    const dropshipWithoutVendor = consolidatedList.filter(i => i.purchaseMethod === 'Dropship' && !i.vendorId)
    if (dropshipWithoutVendor.length > 0) {
      toast.error(`Pilih vendornya dulu untuk ${dropshipWithoutVendor.length} barang yang mau diantar langsung ke klien.`)
      return
    }
```

- [ ] **Step 3: Clear the dropship picks after generating**

Next to the existing `setStockBookedProductIds` cleanup at the end of the try block, add:

```tsx
      // Baris dropship sudah jadi purchase item; setelannya tidak boleh menempel ke
      // putaran belanja berikutnya.
      const dropshipKeys = documentItems.filter(i => i.purchaseMethod === 'Dropship').map(i => rowKey(i))
      if (dropshipKeys.length > 0) {
        setDropshipProductIds(prev => {
          const next = new Set(prev)
          dropshipKeys.forEach(k => next.delete(k))
          return next
        })
      }
```

- [ ] **Step 4: Verify by hand against the running app**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

Then, with the dev server running (`preview_start` with `disma-dev`), sign in as Admin PO, mark one row of a real PO as `Ke Klien`, assign a vendor, and press generate. Confirm in the database that the row landed with the right method:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/purchase_items?purchase_method=eq.Dropship&select=id,product_id,vendor_id,qty_target,qty_purchased,purchase_method" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: one row, `qty_purchased` equal to `qty_target`, `vendor_id` populated. Then confirm the same item does **not** appear in Sourcing → List, Warehouse → Inbound, or Warehouse → QC.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/shopping-list/page.tsx
git commit -m "feat(dropship): carry vendor-to-client rows into the purchase document"
```

---

### Task 4: Delivery note listing only the dropship lines

**Files:**
- Modify: `src/lib/pdf.ts:169` (`generateSuratJalan`) and its drawer `drawSuratJalanOnDoc`

**Interfaces:**
- Consumes: `groupDropship`, `groupKey` from Task 1.
- Produces: `generateDropshipSuratJalan(salesOrderId: string, productIds: string[], vendorName: string, outputType?: 'save' | 'dataurl'): string | void`

- [ ] **Step 1: Let the drawer take a line filter**

`drawSuratJalanOnDoc` currently pulls every item of the sales order. Give it an optional allow-list, defaulting to today's behaviour:

```ts
function drawSuratJalanOnDoc(
  doc: jsPDF,
  poNumber: string,
  addPage: boolean,
  signatures?: { courier?: string, client?: string },
  onlyProductIds?: string[],
  subtitle?: string,
) {
```

Inside, right after the existing `const items = store.salesOrderItems.filter(...)`, narrow it:

```ts
  const lines = onlyProductIds
    ? items.filter(i => onlyProductIds.includes(i.productId))
    : items
```

and use `lines` everywhere the body previously used `items`. When `subtitle` is present, draw it under the header so the vendor knows the note covers only their goods.

- [ ] **Step 2: Add the dropship generator**

Below `generateSuratJalan`:

```ts
/**
 * Surat jalan atas nama Disma untuk dibawa vendor ke klien. Hanya memuat baris
 * yang diantar vendor itu — sisa isi PO dikirim terpisah dari gudang, jadi
 * mencetak seluruh PO akan menjanjikan barang yang tidak ikut di mobil vendor.
 */
export function generateDropshipSuratJalan(
  salesOrderId: string,
  productIds: string[],
  vendorName: string,
  outputType: 'save' | 'dataurl' = 'save'
) {
  const store = useAppStore.getState()
  const so = store.salesOrders.find(s => s.id === salesOrderId)
  if (!so) return
  const doc = new jsPDF({ compress: true })
  drawSuratJalanOnDoc(doc, so.poNumber, false, undefined, productIds, `Diantar oleh: ${vendorName}`)
  if (outputType === 'dataurl') return doc.output('datauristring')
  doc.save(`Surat_Jalan_${so.poNumber}_${vendorName.replace(/\s+/g, '_')}.pdf`)
}
```

- [ ] **Step 3: Drop the dead parameter while you are here**

`generateSuratJalan` and `generateBA` both accept an `adjustments` argument that is never forwarded to their drawer, so callers passing it get silently ignored output. Remove the parameter from `generateSuratJalan`'s signature and fix any caller the compiler flags. Leave `generateBA` alone — it is outside this feature.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

Then in the running app, open an existing PO's surat jalan from the page that already prints one and confirm it is unchanged — the default path must still list every line.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf.ts
git commit -m "feat(dropship): delivery note covering only the vendor's own lines"
```

---

### Task 5: Booking a confirmed dropship delivery

**Files:**
- Modify: `src/lib/accounting.ts` (add after `finalizeSalesOrderDelivery`, ~line 739)
- Test: `src/lib/dropship.check.ts` (extend)

**Interfaces:**
- Consumes: `createAccountingEntry`, `recordVendorBillFromInbound`, `recordVendorTransferPurchase` from the same file; `dropshipShortfall`, `dropshipLineValue` from Task 1; store actions `addInvoice`, `addDelivery`, `updatePurchaseItem`, `updateSalesOrderItem`, `updateSalesOrder`, `addRejectedItem`, `beginUndoableBatch`, `endUndoableBatch`.
- Produces:

```ts
export type DropshipConfirmLine = {
  purchaseItemId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  unitPrice: number;
};

export const recordDropshipDelivery = async (
  salesOrderId: string,
  vendorId: string,
  lines: DropshipConfirmLine[],
  confirmedBy: string,
  bankAccountId?: string,
  note?: string,
  proofUrl?: string,
) => Promise<boolean>
```

**Known sharp edge to respect:** `recordVendorTransferPurchase` writes a cash
transaction with the fixed id `transfer-buy-${purchaseId}`. One purchase document
holding dropship lines for two different vendors would collide on that id. Group
the confirmation per vendor (Task 6 already does) and, if the collision shows up
in testing, make the id include the vendor: `transfer-buy-${purchaseId}-${vendorId}`.

- [ ] **Step 1: Write the failing check for the money split**

Extend the existing `./dropship` import at the top of `src/lib/dropship.check.ts` with `splitDropshipTotals`, then append this above the final `console.log`:

```ts
// The invoice follows the selling price of what arrived; the vendor is owed the
// cost of what arrived; the susulan is what never turned up.
const totals = splitDropshipTotals([
  { qtyOrdered: 10, qtyReceived: 8, unitCost: 10_000, unitPrice: 15_000 },
  { qtyOrdered: 5, qtyReceived: 5, unitCost: 20_000, unitPrice: 26_000 },
]);
assert.equal(totals.revenue, 8 * 15_000 + 5 * 26_000);
assert.equal(totals.cogs, 8 * 10_000 + 5 * 20_000);
assert.deepEqual(totals.shortfalls, [{ index: 0, qty: 2 }]);

// Nothing received at all: no invoice, no vendor obligation, everything is a susulan.
const nothing = splitDropshipTotals([{ qtyOrdered: 4, qtyReceived: 0, unitCost: 1_000, unitPrice: 2_000 }]);
assert.equal(nothing.revenue, 0);
assert.equal(nothing.cogs, 0);
assert.deepEqual(nothing.shortfalls, [{ index: 0, qty: 4 }]);
```

- [ ] **Step 2: Run the check to verify it fails**

```bash
npx tsx src/lib/dropship.check.ts
```

Expected: FAIL — `splitDropshipTotals is not a function`.

- [ ] **Step 3: Add the splitter to the pure module**

Append to `src/lib/dropship.ts`:

```ts
export type DropshipTotalsLine = {
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  unitPrice: number;
};

/** Split a confirmed dropship delivery into what to bill, what to owe, what to re-buy. */
export function splitDropshipTotals(lines: DropshipTotalsLine[]) {
  let revenue = 0;
  let cogs = 0;
  const shortfalls: { index: number; qty: number }[] = [];
  lines.forEach((line, index) => {
    revenue += dropshipLineValue(line.qtyReceived, line.unitPrice);
    cogs += dropshipLineValue(line.qtyReceived, line.unitCost);
    const short = dropshipShortfall(line.qtyOrdered, line.qtyReceived);
    if (short > 0) shortfalls.push({ index, qty: short });
  });
  return { revenue, cogs, shortfalls };
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
npx tsx src/lib/dropship.check.ts
```

Expected: `dropship: all checks passed`

- [ ] **Step 5: Write the booking function**

Append to `src/lib/accounting.ts`, after `finalizeSalesOrderDelivery`:

```ts
export type DropshipConfirmLine = {
  purchaseItemId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  unitPrice: number;
};

/**
 * Books a dropship delivery the client has confirmed receiving.
 *
 * Goods went vendor → client and never entered the warehouse, so persediaan is
 * not involved on either side: the cost goes straight to HPP against the same
 * GR/IR accrual (2-1100) that QC would have raised, and the vendor payment
 * paths below clear it exactly as they do after QC. No stock movement is
 * written — writing one here would inflate on-hand for goods nobody ever held.
 *
 * Idempotent: every purchase item it books is flagged isQCed, so a repeat call
 * with the same lines returns early. This cannot lean on the invoice dup-guard
 * inside recordDeliveryAndInvoice — each call mints a fresh invoice id, so that
 * guard would never fire and a double press would bill the client twice.
 */
export const recordDropshipDelivery = async (
  salesOrderId: string,
  vendorId: string,
  lines: DropshipConfirmLine[],
  confirmedBy: string,
  bankAccountId?: string,
  note?: string,
  proofUrl?: string,
) => {
  const store = useAppStore.getState();
  const so = store.salesOrders.find(s => s.id === salesOrderId);
  if (!so) return false;

  // Already booked (double press, or two tabs open) — do nothing rather than
  // issue a second invoice for goods delivered once.
  const alreadyBooked = lines.every(l =>
    store.purchaseItems.find(pi => pi.id === l.purchaseItemId)?.isQCed
  );
  if (alreadyBooked) {
    console.warn('[Dropship] Lines already confirmed. Skipping.');
    return true;
  }

  const { revenue, cogs, shortfalls } = splitDropshipTotals(lines);

  store.beginUndoableBatch();
  try {
    const invoiceId = uuidv4();
    const deliveryId = uuidv4();

    if (revenue > 0) {
      await store.addInvoice({
        id: invoiceId,
        salesOrderId,
        clientId: so.clientId || '',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: revenue,
        amountPaid: 0,
        status: 'Unpaid',
      });
      await store.addDelivery({
        id: deliveryId,
        salesOrderId,
        courierId: '',
        status: 'Terkirim',
        deliveryDate: new Date().toISOString(),
        invoiceId,
        baUrl: proofUrl,
        notes: note || 'Diantar vendor langsung ke klien',
      });
      await createAccountingEntry(
        `Invoice Terbit (Kiriman Vendor) - Ref: ${invoiceId}`,
        'Invoice',
        invoiceId,
        [{ accountCode: '1-2000', amount: revenue }],
        [{ accountCode: '4-1000', amount: revenue }],
      );
    }

    if (cogs > 0) {
      // Dr HPP / Cr 2-1100 — persediaan dilewati, barangnya tidak pernah masuk gudang.
      await createAccountingEntry(
        `HPP Kiriman Vendor - Ref: ${deliveryId}`,
        'Delivery',
        deliveryId,
        [{ accountCode: '5-1000', amount: cogs }],
        [{ accountCode: '2-1100', amount: cogs }],
      );
    }

    // Vendor obligation, on the same two paths QC uses.
    const firstItem = store.purchaseItems.find(pi => pi.id === lines[0]?.purchaseItemId);
    if (cogs > 0 && firstItem?.paymentMethod === 'Tempo') {
      await recordVendorBillFromInbound(
        firstItem.id,
        vendorId,
        cogs,
        `Tempo kiriman vendor ke klien (${new Date().toLocaleDateString('id-ID')})`,
        firstItem.purchaseId,
      );
    } else if (cogs > 0 && firstItem?.paymentMethod === 'Transfer') {
      const bank = bankAccountId
        ? store.bankAccounts.find(b => b.id === bankAccountId)
        : store.bankAccounts.find(b => b.accountCode === '1-1200');
      if (bank) {
        await recordVendorTransferPurchase(firstItem.purchaseId, bank.id, cogs, confirmedBy);
      }
    }

    // Per-line bookkeeping: mark the purchase item done, credit the client's
    // order for what arrived, and push the shortfall into the susulan list.
    const soItems = store.salesOrderItems.filter(i => i.salesOrderId === salesOrderId);
    for (const line of lines) {
      await store.updatePurchaseItem(line.purchaseItemId, {
        isQCed: true,
        inboundStatus: line.qtyReceived === 0 ? 'rejected'
          : line.qtyReceived < line.qtyOrdered ? 'partial' : 'verified',
        inboundQtyReceived: line.qtyReceived,
        inboundVerifiedAt: new Date().toISOString(),
        inboundVerifiedBy: confirmedBy,
        actualUnitPrice: line.unitCost,
        qtyPurchased: line.qtyReceived,
      });

      const soItem = soItems.find(i => i.productId === line.productId);
      if (soItem) {
        await store.updateSalesOrderItem(soItem.id, {
          qtyFinal: null,
          qtyDelivered: (soItem.qtyDelivered ?? 0) + line.qtyReceived,
        });
      }
    }

    for (const short of shortfalls) {
      const line = lines[short.index];
      await store.addRejectedItem({
        id: uuidv4(),
        date: new Date().toISOString(),
        productId: line.productId,
        qty: short.qty,
        reason: `Kurang dikirim vendor (kiriman langsung ke klien)`,
        source: 'Dropship',
        referenceId: line.purchaseItemId,
        reportedBy: confirmedBy,
      });
    }

    // Order selesai hanya kalau tidak ada sisa di sisi mana pun — sisa barang gudang
    // pada PO campuran tetap menahan statusnya.
    const fresh = useAppStore.getState().salesOrderItems.filter(i => i.salesOrderId === salesOrderId);
    await store.updateSalesOrder(salesOrderId, { status: nextSoStatus(fresh) });

    return true;
  } finally {
    store.endUndoableBatch();
  }
};
```

Add the imports this needs at the top of `src/lib/accounting.ts`:

```ts
import { splitDropshipTotals } from './dropship';
import { nextSoStatus } from './backorder';
```

(`roundQtyToBook` is already imported from `./backorder` on line 7 — extend that import rather than adding a second one.)

- [ ] **Step 6: Widen the rejected-item source**

In `src/types/index.ts:645`, change:

```ts
  source: 'QC' | 'Return' | 'Gudang';
```

to:

```ts
  source: 'QC' | 'Return' | 'Gudang' | 'Dropship';
```

`pendingRejects` in the shopping list does not filter on source, so the shortfall shows up in the susulan queue with no further change. `src/app/warehouse/reject-monitor/page.tsx:94-96` falls through to a neutral badge for unknown sources, which is correct here.

- [ ] **Step 7: Verify**

```bash
npx tsx src/lib/dropship.check.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: `dropship: all checks passed`, then the same 4 pre-existing errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dropship.ts src/lib/dropship.check.ts src/lib/accounting.ts src/types/index.ts
git commit -m "feat(dropship): book a client-confirmed vendor delivery"
```

---

### Task 6: The monitoring and confirmation screen

**Files:**
- Create: `src/app/admin/dropship/page.tsx`
- Modify: `src/lib/navigation.tsx` (after line 73)
- Modify: `src/lib/store.ts:649,661,670,685` (default role permissions)
- Modify: `src/app/admin/settings/roles/page.tsx:29` (permission label list)

**Interfaces:**
- Consumes: `recordDropshipDelivery`, `DropshipConfirmLine` (Task 5); `groupDropship`, `isDropship` (Task 1); `generateDropshipSuratJalan` (Task 4).
- Produces: nav key `admin_dropship` at `/admin/dropship`.

- [ ] **Step 1: Register the page in navigation and permissions**

`src/lib/navigation.tsx`, after the `admin_shopping_list` entry:

```tsx
  { key: 'admin_dropship', title: 'Kiriman Vendor', href: '/admin/dropship', icon: <Truck className="h-4 w-4 text-orange-500" />, category: 'Admin' },
```

`Truck` is already imported in that file.

In `src/lib/store.ts`, add `'admin_dropship'` next to every existing `'admin_shopping_list'` in the default role permission arrays (lines 649, 661, 670 and the `admin_po` array on line 685).

In `src/app/admin/settings/roles/page.tsx`, after line 29:

```tsx
  { id: 'admin_dropship', label: 'Kiriman Vendor ke Klien', module: 'Operasional' },
```

- [ ] **Step 2: Build the screen**

Create `src/app/admin/dropship/page.tsx`. It is a client component reading `purchaseItems`, `purchases`, `salesOrders`, `salesOrderItems`, `clients`, `vendors`, `products`, `bankAccounts` from the store.

Outstanding deliveries are the dropship items nobody has confirmed yet:

```tsx
  const outstanding = useMemo(() => purchaseItems.filter(pi =>
    isDropship(pi) && !pi.isQCed
  ), [purchaseItems])

  const groups = useMemo(() => groupDropship(outstanding), [outstanding])
```

Render one card per group, showing vendor name, client name, PO number, target delivery date from the sales order, and the item lines. Each card carries two actions:

1. **Surat jalan** — calls `generateDropshipSuratJalan(salesOrderId, group.items.map(i => i.productId), vendorName)`.
2. **Konfirmasi diterima** — opens a dialog with one editable "jumlah diterima" number per line (defaulting to `qtyTarget`), an optional note, a proof-of-receipt upload, and a bank picker shown only when the group's payment method is `Transfer` (default the bank whose `accountCode` is `1-1200`).

The proof is the client's photo or signed receipt — the only evidence the goods arrived, since nobody from Disma was there. Reuse the existing component, which uploads to `/api/upload` and hands back a public URL:

```tsx
import ReceiptUpload from "@/components/ui/receipt-upload"

// inside the dialog
<ReceiptUpload
  label="Foto / tanda terima dari klien"
  currentFile={proofUrl}
  onFileSelect={(url) => setProofUrl(url)}
/>
```

Validate before submitting — refuse the whole submit and name the offending item:

```tsx
    const invalid = group.items.find(pi => {
      const qty = received[pi.id] ?? pi.qtyTarget
      return !Number.isFinite(qty) || qty < 0 || qty > pi.qtyTarget
    })
    if (invalid) {
      const name = products.find(p => p.id === invalid.productId)?.name || 'Barang'
      toast.error(`Jumlah diterima untuk ${name} harus antara 0 dan ${invalid.qtyTarget}.`)
      return
    }
    if (!proofUrl) {
      toast.error("Upload dulu foto atau tanda terima dari klien.")
      return
    }
    if (isSubmitting) return
    setIsSubmitting(true)
```

Then build the lines and call the booking function (wrap the call in `try/finally` so `setIsSubmitting(false)` always runs):

```tsx
    const lines: DropshipConfirmLine[] = group.items.map(pi => {
      const soItem = salesOrderItems.find(i => i.salesOrderId === pi.salesOrderId && i.productId === pi.productId)
      return {
        purchaseItemId: pi.id,
        productId: pi.productId,
        qtyOrdered: pi.qtyTarget,
        qtyReceived: received[pi.id] ?? pi.qtyTarget,
        unitCost: pi.estimatedUnitPrice,
        unitPrice: soItem?.unitPrice ?? 0,
      }
    })
    const ok = await recordDropshipDelivery(
      group.salesOrderId!, group.vendorId!, lines,
      currentUser?.name || currentUser?.id || 'Admin', transferBankId, confirmNote, proofUrl,
    )
    toast[ok ? 'success' : 'error'](ok
      ? 'Kiriman dikonfirmasi. Tagihan klien terbit dan kewajiban vendor tercatat.'
      : 'Gagal mencatat konfirmasi.')
```

Follow the visual language of `src/app/admin/purchase-requests/page.tsx`: `Card`/`CardHeader`/`CardContent`, `text-[9px] font-black uppercase tracking-wider` labels, `rounded-2xl` panels, `formatRupiah` for money.

Include a second section listing confirmed deliveries (`isDropship(pi) && pi.isQCed`) from the last 30 days, read-only, showing ordered vs received and a link to the proof image, so a shortfall stays visible after the fact.

- [ ] **Step 3: Verify the happy path end to end**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: the same 4 pre-existing errors.

Then with the dev server running, as Admin PO:
1. Mark two lines of a PO as `Ke Klien` with the same vendor, leave a third as `Pasar`, and generate the document.
2. Open Kiriman Vendor. The two lines appear as one card; the Pasar line does not.
3. Download the surat jalan. It lists exactly the two dropship lines and names the vendor.
4. Confirm with one line short (e.g. ordered 10, received 8).
5. Check the results:
   - a new invoice for the client exists, totalling the received qty at selling price;
   - AP Aging shows a vendor bill (Tempo) **or** Cash & Bank shows the transfer out (Transfer), for the received qty at cost;
   - Shopping List's susulan queue lists the 2 missing units;
   - Warehouse → Stock shows **no** movement for those products;
   - the Pasar line is still waiting in Sourcing, and the order is `Kurang Kirim`, not `Selesai`.
6. The proof image opens from the confirmed-deliveries section.
7. Press Konfirmasi again on the same card. Expect no second invoice — the card should be gone from the outstanding list entirely.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dropship/page.tsx src/lib/navigation.tsx src/lib/store.ts src/app/admin/settings/roles/page.tsx
git commit -m "feat(dropship): screen to track and confirm vendor deliveries"
```

---

### Task 7: Ship it

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-dropship-vendor-ke-klien.md` (tick the boxes as you go)

- [ ] **Step 1: Run every check in the repo**

```bash
npx tsx src/lib/dropship.check.ts && npx tsx src/lib/backorder.check.ts && npx tsx src/lib/settlement-model.check.ts && npx tsc --noEmit -p tsconfig.json
```

Expected: three "all checks passed" lines, then the same 4 pre-existing TypeScript errors and nothing else.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin feat/dropship-vendor-ke-klien
gh pr create --base main --title "feat(dropship): vendor delivers straight to the client"
```

The body should state what was verified by hand (the six checks in Task 6 Step 3) and what was not.

- [ ] **Step 3: Merge and confirm the deploy**

```bash
gh pr merge <N> --merge --repo rezanje/disma-core
```

Then confirm the production deployment reaches `success` before reporting the feature live.
