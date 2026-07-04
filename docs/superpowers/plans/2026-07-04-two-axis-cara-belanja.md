# Two-Axis "Cara Belanja" Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single conflated `purchaseMethod` ("Cara Belanja") into two independent authoritative axes — **Lokasi Ambil** (`purchaseMethod`: Pasar/Vendor/Online) and **Metode Bayar** (`paymentMethod`: Cash/Tempo/Transfer) — with `paymentMethod` driving all accounting/AP/BCA routing.

**Architecture:** `purchaseMethod` becomes pure logistics/location; `paymentMethod` becomes the authoritative payment router. Cash → draws sourcing pocket (Dr HPP/Cr 1-1500). Tempo → vendor AP bill via reconciliation settlement (Dr HPP-accrual/Cr 2-1000). Transfer → finance pays from BCA now via the online-purchase queue (Dr HPP/Cr 1-1200). Each of the ~13 `'Transfer'` literal sites is reclassified individually (some meant Tempo, some meant "Dibayar Kantor").

**Tech Stack:** Next.js App Router, TypeScript, Zustand store (`src/lib/store.ts`), Supabase persistence + migrations, jsPDF. No unit-test harness → verification is **tsc gating + targeted grep + browser smoke test**.

---

## Preconditions & Baseline (read before starting)

- **Branch base:** This plan MUST be executed on top of `docs/sourcing-pocket-daily-spec` (the pocket work). The worktree has already been fast-forwarded onto it (HEAD `85d16ce`). Do NOT rebase back onto old `main`.
- **tsc baseline = 9 errors** (`npx tsc --noEmit 2>&1 | grep -c "error TS"`). The gate for this work is **≤ 6 errors** at the end — the 3 in-scope `finance/online-purchase` errors get resolved; the other 6 are pre-existing and out of scope:
  - `admin/loss-analytics/page.tsx(624,56)` TS2322 (Select onChange) — pre-existing, leave
  - `admin/sales-orders/page.tsx(224,9)` TS2353 (deliveredAt) — pre-existing, leave
  - `admin/shopping-list/page.tsx(2128,78)` TS2551 (`sellPrice` → `sellingPrice`) — pre-existing; **opportunistically fixed in Task 7** (we edit that map anyway) → final may be 5
  - `finance/disbursements/page.tsx` 280/374/390 TS2322 ×3 (Select onChange) — pre-existing, leave
- **Verify baseline before Task 1:** run `npx tsc --noEmit 2>&1 | grep -c "error TS"` → expect `9`. If not 9, STOP and reconcile (branch base wrong).

## Site classification (the load-bearing reference — every `'Transfer'` literal)

| # | File:line | Current code | Meaning | New code |
|---|---|---|---|---|
| A | `types/index.ts:191` | `PurchaseMethod = 'Pasar'\|'Online'\|'Transfer'` | value | `'Pasar'\|'Vendor'\|'Online'` |
| B | `types/index.ts:237` | `paymentMethod?: 'Cash'\|'Tempo'` | value | `'Cash'\|'Tempo'\|'Transfer'`; + add `isTransferPaid?: boolean` |
| C | `lib/accounting.ts:1046` | filter `purchaseMethod === 'Pasar'` | settlement scope | `purchaseMethod !== 'Online' && paymentMethod !== 'Transfer'` |
| D | `lib/accounting.ts:1393` | docstring `purchaseMethod === 'Transfer'` | dead-code comment | update text (function unused) |
| E | `sourcing/list:141` | `purchaseMethod === 'Pasar' \|\| === 'Transfer'` | sourcer's physical list (location) | `=== 'Pasar' \|\| === 'Vendor'` |
| F | `sourcing/list:184` | `purchaseMethod === 'Transfer'` → skip vendor req | payment (finance handles) | `paymentMethod === 'Transfer'` |
| G | `sourcing/list:50,694` | `editPaymentMethod: 'Cash'\|'Tempo'` | payment editor | add `'Transfer'` + Select option |
| H | `sourcing/list:565,580` | `purchaseMethod === 'Transfer'` → "Tempo pickup" branch | payment (no cash out) | `paymentMethod !== 'Cash'` |
| I | `sourcing/list:239` | pocketSpend `pm !== 'Tempo' && purchaseMethod !== 'Online'` | pocket draw | `pm(item) === 'Cash' && purchaseMethod !== 'Online'` |
| J | `warehouse/qc:38` | `purchaseMethod === 'Transfer' && isChecked` | early-QC on pickup | `(paymentMethod === 'Tempo' \|\| paymentMethod === 'Transfer') && isChecked` |
| K | `lib/pdf.ts:412` | budget excludes `purchaseMethod !== 'Transfer'` | cash budget | `(item.paymentMethod ?? 'Cash') === 'Cash'` |
| L | `lib/pdf.ts:473` | `purchaseMethod === 'Transfer' ? '(Dibayar Kantor)'` | non-cash label | `(item.paymentMethod && item.paymentMethod !== 'Cash') ? '(Dibayar Kantor)'` |
| M | `pdf.ts:391,490,497` | item shape lacks `paymentMethod` | shape | add `paymentMethod?: 'Cash'\|'Tempo'\|'Transfer'` |
| N | `online-purchase:42` | `purchaseMethod === 'Transfer' && !isTransferPaid` | finance BCA queue | `paymentMethod === 'Transfer' && !isTransferPaid` |
| O | `online-purchase:200` | `purchaseMethod === 'Transfer'` → `isTransferPaid` | ready-check | `paymentMethod === 'Transfer'` |
| P | `online-purchase:5,70` | import/call `recordVendorTransferBulk` | missing fn | create fn in accounting (Task 2) |
| Q | `shopping-list:28,474` | local type `'Pasar'\|'Online'\|'Transfer'` | value | `'Pasar'\|'Vendor'\|'Online'` + `paymentMethod` |
| R | `shopping-list:465` | `transferProductIds.has() ? 'Transfer'` | compile (location) | `vendorProductIds.has() ? 'Vendor'` + `paymentMethod: paymentByProduct[id] \|\| 'Cash'` |
| S | `shopping-list:605` | addPurchaseItems carries only `purchaseMethod` | compile | also carry `paymentMethod` |
| T | `shopping-list:1714,2094,2129` | Transfer button / history badge | location UI | 'Vendor' + new payment button group |

**Sites that STAY (location-only, verified — do NOT change):** `admin/clients:1884` (display), `admin/purchase-requests:1038` (`=== 'Online'`), `warehouse/inbound:29-30,87-91` (Pasar/Online), `SourcingDashboard.tsx:14-15` (`=== 'Pasar'`), `simulation.ts:297` (seeds `'Pasar'`), `finance/approvals` (already keys `paymentMethod === 'Tempo'`), `lib/vendor-payable.ts` (already `paymentMethod === 'Tempo'`), `shopping-list:703,1850` (`=== 'Pasar'` print/filter), `accounting.ts:1067` (already `paymentMethod === 'Tempo'`).

## Judgment calls baked into this plan (flagged for reviewer)

1. **Pickup branch (H, J) keys on `paymentMethod !== 'Cash'`** — both Tempo and Transfer mean "sourcer picks up, pays no cash." A Cash-at-Vendor item stays in the normal buy flow.
2. **Settlement scope (C)** widened `=== 'Pasar'` → `!== 'Online' && paymentMethod !== 'Transfer'` so Vendor-location Tempo items also get AP bills, while Transfer items are excluded (finance pays via BCA).
3. **Existing-data migration:** no seed/sim rows use `'Transfer'` (confirmed via grep). Task 8 ships a conservative Supabase migration for any live rows; the app's reset/reseed flow otherwise regenerates data. Assumption documented in Task 8 — reviewer confirms.

---

### Task 1: Type model — rename location value + expand payment axis

**Files:**
- Modify: `src/types/index.ts:191` and `:237`

- [ ] **Step 1: Rename `PurchaseMethod` location value**

At `src/types/index.ts:191`, change:
```ts
export type PurchaseMethod = 'Pasar' | 'Online' | 'Transfer';
```
to:
```ts
export type PurchaseMethod = 'Pasar' | 'Vendor' | 'Online';
```

- [ ] **Step 2: Expand `paymentMethod` + add `isTransferPaid`**

At `src/types/index.ts:237`, change:
```ts
  paymentMethod?: 'Cash' | 'Tempo';
```
to:
```ts
  paymentMethod?: 'Cash' | 'Tempo' | 'Transfer';
  isTransferPaid?: boolean; // finance has paid this item's vendor via bank transfer (BCA)
```

- [ ] **Step 3: Run tsc — expect the error count to RISE (literal mismatches now surface)**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: **> 9** (new TS2367/TS2322 errors on every `=== 'Transfer'` compared against the new `PurchaseMethod` union, plus the two `online-purchase` `isTransferPaid` errors from baseline now RESOLVE). This is expected mid-migration; later tasks drive it back down.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(cara-belanja): split types — purchaseMethod=Pasar|Vendor|Online, paymentMethod adds Transfer + isTransferPaid"
```

---

### Task 2: accounting.ts — add `recordVendorTransferBulk` (Dr HPP/Cr BCA) + widen settlement scope

**Files:**
- Modify: `src/lib/accounting.ts` — add new export after `recordPocketPurchase` (ends ~line 991); edit filter at `:1046`; edit docstring at `:1393`

- [ ] **Step 1: Add `recordVendorTransferBulk`** (insert immediately after the closing `};` of `recordPocketPurchase`, ~line 991)

Mirrors `recordOnlinePurchase` posting shape but Dr HPP (goods received, no admin/ship split) / Cr bank, and marks items `isTransferPaid`:
```ts
// Finance pays vendor by bank transfer NOW (paymentMethod === 'Transfer').
// One combined transfer for same vendor+bank: Dr HPP / Cr bank (default BCA 1-1200).
// Marks each item isTransferPaid so it leaves the finance queue.
export const recordVendorTransferBulk = async (
  items: { itemId: string; amount: number }[],
  vendorId: string,
  vendorName: string,
  bankAccountId: string,
  ref: string
) => {
  const store = useAppStore.getState();
  const valid = items.filter(i => i.amount > 0);
  const total = valid.reduce((s, i) => s + i.amount, 0);
  if (total <= 0 || valid.length === 0) return false;
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankCode = bank?.accountCode || '1-1200';

  const ok = await createAccountingEntry(
    `Transfer Vendor (${vendorName}) - Ref: ${ref}`,
    'Purchase',
    ref,
    [{ accountCode: HPP_ACCOUNT_CODE, amount: total }],
    [{ accountCode: bankCode, amount: total, vendorId }]
  );
  if (!ok) return false;

  await store.addCashTransaction({
    id: uuidv4(),
    date: new Date().toISOString(),
    amount: total,
    type: 'Out',
    category: 'Transfer Vendor',
    description: `Transfer ke ${vendorName} (${valid.length} item) - Ref: ${ref}`,
    bankAccountId,
    counterpartName: vendorName,
    referenceId: ref,
    referenceType: 'Purchase',
  });

  for (const i of valid) {
    await store.updatePurchaseItem(i.itemId, { isTransferPaid: true, isChecked: true });
  }
  return true;
};
```

> NOTE: verify `HPP_ACCOUNT_CODE` (defined `accounting.ts:20 = '5-1000'`), `createAccountingEntry`, `uuidv4`, and `store.addCashTransaction` are already imported/in-scope in this file (they are — used by `recordPocketPurchase`/`recordOnlinePurchase`). `createAccountingEntry`'s credit line accepts an optional `vendorId` (see `PostingLineInput` usage at `:1129`).

- [ ] **Step 2: Widen the reconciliation-settlement item filter** at `src/lib/accounting.ts:1045-1047`

Change:
```ts
  const pItems = store.purchaseItems.filter(
    pi => pi.purchaseId === purchaseId && pi.isChecked && pi.purchaseMethod === 'Pasar'
  );
```
to:
```ts
  const pItems = store.purchaseItems.filter(
    pi => pi.purchaseId === purchaseId && pi.isChecked &&
      pi.purchaseMethod !== 'Online' && pi.paymentMethod !== 'Transfer'
  );
```
(Now Pasar + Vendor items settle; Cash→pocket already booked, Tempo→AP bill here; Online + Transfer are finance-paid elsewhere.)

- [ ] **Step 3: Update the dead-code docstring** at `src/lib/accounting.ts:1392-1396`

Change the opening line of the `recordVendorBillFromInbound` doc comment from `Tempo purchase (item.purchaseMethod === 'Transfer'):` to `Tempo purchase (item.paymentMethod === 'Tempo'):`. Add a line: `NOTE: currently unused (no callers) — Tempo AP bills are created in recordReconciliationSettlement.`

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep "recordVendorTransferBulk\|accounting.ts"`
Expected: no errors originating in `accounting.ts`; the `online-purchase(5,32) recordVendorTransferBulk` import error is now RESOLVED.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accounting.ts
git commit -m "feat(cara-belanja): add recordVendorTransferBulk (Dr HPP/Cr BCA); settle Pasar+Vendor, exclude Transfer"
```

---

### Task 3: sourcing/list — location filter, payment-based pickup branch, pocket draw, Transfer payment option

**Files:**
- Modify: `src/app/sourcing/list/page.tsx` (lines 50, 141, 184, 239, 547, 565-566, 580, 694-700)

- [ ] **Step 1: Expand `editPaymentMethod` state type** at `:50`

```ts
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Cash' | 'Tempo' | 'Transfer'>('Cash')
```

- [ ] **Step 2: Location filter for the sourcer's checklist** at `:139-142`

Change `(pi.purchaseMethod === 'Pasar' || pi.purchaseMethod === 'Transfer')` to:
```ts
    (pi.purchaseMethod === 'Pasar' || pi.purchaseMethod === 'Vendor')
```

- [ ] **Step 3: Skip vendor-required validation only for finance-Transfer items** at `:184`

Change `if (item.purchaseMethod === 'Transfer') return false;` to:
```ts
      if (item.paymentMethod === 'Transfer') return false;
```

- [ ] **Step 4: Pocket draw = Cash only** at `:238-239`

Change the `pocketSpend` reducer predicate `(pm(item) !== 'Tempo' && item.purchaseMethod !== 'Online')` to:
```ts
            (pm(item) === 'Cash' && item.purchaseMethod !== 'Online') ? sum + lineTotal(item) : sum, 0)
```

- [ ] **Step 5: Pickup-branch badge + branch condition** — payment-based, distinguish Tempo vs Transfer

At `:565-567` replace the `purchaseMethod === 'Transfer'` badge block with a payment-driven one:
```tsx
                            {item.paymentMethod === 'Tempo' && item.purchaseMethod === 'Vendor' && (
                               <Badge variant="outline" className="mt-1.5 bg-violet-50 text-violet-700 border-violet-200 text-[9px] font-black uppercase">📋 Tempo — Ambil Barang, Hutang Otomatis</Badge>
                            )}
                            {item.paymentMethod === 'Transfer' && (
                               <Badge variant="outline" className="mt-1.5 bg-purple-50 text-purple-700 border-purple-200 text-[9px] font-black uppercase">🏦 Dibayar Finance (Transfer)</Badge>
                            )}
```
> (Line 547's existing `paymentMethod === 'Tempo'` "Tempo" badge stays; it already labels Tempo regardless of location.)

At `:580` change the expanded-view branch condition `item.purchaseMethod === 'Transfer' ? (` to:
```tsx
                            item.paymentMethod !== 'Cash' ? (
```
(Non-cash = pickup flow: qty + note + "Tandai Sudah Diambil", no price/vendor entry. Cash = normal buy flow.)

- [ ] **Step 6: Add Transfer option to the payment Select** at `:694-700`

Change the Select value cast and add the option:
```tsx
                                  <Select value={editPaymentMethod} onValueChange={(val) => setEditPaymentMethod((val as 'Cash' | 'Tempo' | 'Transfer') ?? 'Cash')}>
                                    <SelectTrigger className="h-12 bg-white/50 border-2 transition-all focus:border-emerald-500 rounded-xl"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Cash">Cash (potong kas sourcing)</SelectItem>
                                      <SelectItem value="Tempo">Tempo (hutang ke vendor)</SelectItem>
                                      <SelectItem value="Transfer">Transfer (dibayar finance)</SelectItem>
                                    </SelectContent>
                                  </Select>
```

- [ ] **Step 7: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep "sourcing/list"`
Expected: no errors in `sourcing/list/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add src/app/sourcing/list/page.tsx
git commit -m "feat(cara-belanja): sourcing list — Vendor location, payment-based pickup branch + pocket draw, Transfer option"
```

---

### Task 4: warehouse/qc — early-QC gate keys on payment

**Files:**
- Modify: `src/app/warehouse/qc/page.tsx:38`

- [ ] **Step 1: Reclassify the early-QC gate**

Change `if (pi.purchaseMethod === 'Transfer' && pi.isChecked) return true;` to:
```ts
       if ((pi.paymentMethod === 'Tempo' || pi.paymentMethod === 'Transfer') && pi.isChecked) return true;
```
(Items the sourcer picked up without cash settlement enter QC on pickup, independent of the parent purchase's `Selesai` status.)

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep "warehouse/qc"`
Expected: no errors in `warehouse/qc/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/warehouse/qc/page.tsx
git commit -m "feat(cara-belanja): QC early gate keys on paymentMethod (Tempo/Transfer)"
```

---

### Task 5: pdf.ts — cash budget + "Dibayar Kantor" label key on payment

**Files:**
- Modify: `src/lib/pdf.ts` (item-shape types at 391, 490, 497; filters at 412, 473)

- [ ] **Step 1: Add `paymentMethod` to the three item-shape array types**

At lines 391, 490, and 497 the inline `Array<{... purchaseMethod?: string, vendorName?: string}>` type appears. In each, add `paymentMethod?: 'Cash' | 'Tempo' | 'Transfer',` before `vendorName?: string`. Example (line 391):
```ts
  items: Array<{productId: string, productName: string, skuCode: string, uom?: string, totalQty: number, estimatedPrice: number, purchaseMethod?: string, paymentMethod?: 'Cash' | 'Tempo' | 'Transfer', vendorName?: string}>,
```
Apply the identical insertion to the arrays at 490 and 497.

- [ ] **Step 2: Cash budget = Cash-paid items only** at `:411-413`

Change:
```ts
  const totalBudget = printItems
    .filter(item => item.purchaseMethod !== 'Transfer')
    .reduce((sum, item) => sum + ((item.estimatedPrice || 0) * (item.totalQty || 0)), 0)
```
to:
```ts
  const totalBudget = printItems
    .filter(item => (item.paymentMethod ?? 'Cash') === 'Cash')
    .reduce((sum, item) => sum + ((item.estimatedPrice || 0) * (item.totalQty || 0)), 0)
```

- [ ] **Step 3: Non-cash rows show "(Dibayar Kantor)"** at `:473`

Change:
```ts
      const priceText = item.purchaseMethod === 'Transfer' ? '(Dibayar Kantor)' : formatRupiah(item.estimatedPrice)
```
to:
```ts
      const priceText = (item.paymentMethod && item.paymentMethod !== 'Cash') ? '(Dibayar Kantor)' : formatRupiah(item.estimatedPrice)
```

- [ ] **Step 4: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep "pdf.ts"`
Expected: no errors in `pdf.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf.ts
git commit -m "feat(cara-belanja): PDF cash budget + Dibayar Kantor label key on paymentMethod"
```

---

### Task 6: finance/online-purchase — flip Transfer queue to `paymentMethod`

**Files:**
- Modify: `src/app/finance/online-purchase/page.tsx:42` and `:200` (import at :5 + call at :70 already resolved by Task 2)

- [ ] **Step 1: Transfer queue filter** at `:41-43`

Change `.filter(pi => pi.purchaseMethod === 'Transfer' && !pi.isTransferPaid)` to:
```ts
    .filter(pi => pi.paymentMethod === 'Transfer' && !pi.isTransferPaid)
```

- [ ] **Step 2: `isAllReady` ready-check** at `:199-201`

Change:
```ts
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
        if (pi.purchaseMethod === 'Transfer') return pi.isTransferPaid;
```
to:
```ts
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
        if (pi.paymentMethod === 'Transfer') return pi.isTransferPaid;
```

- [ ] **Step 3: Run tsc — the 3 in-scope baseline errors must now be GONE**

Run: `npx tsc --noEmit 2>&1 | grep "online-purchase"`
Expected: **no output** (the `isTransferPaid` and `recordVendorTransferBulk` errors resolved by Tasks 1+2, filters now valid).

- [ ] **Step 4: Commit**

```bash
git add src/app/finance/online-purchase/page.tsx
git commit -m "feat(cara-belanja): finance BCA-transfer queue keys on paymentMethod === 'Transfer'"
```

---

### Task 7: shopping-list — two column groups (Lokasi + Metode Bayar)

**Files:**
- Modify: `src/app/admin/shopping-list/page.tsx` (state 158-171, effects 196-200, history 208-249, mutators 264-319, local types 28/474, compile 465, addPurchaseItems 605, picker 1680-1730 + header 2082, history display 2090-2094/2104/2129, opportunistic `sellPrice` fix 2128)

This is the largest task — work top-to-bottom so tsc noise stays localized.

- [ ] **Step 1: Rename the location set `transferProductIds` → `vendorProductIds` + add payment map**

At `:162-165` change state + localStorage key:
```tsx
  const [vendorProductIds, setVendorProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_vendorProductIds') || '[]')) } catch { return new Set() }
  })
  const [paymentByProduct, setPaymentByProduct] = useState<Record<string, 'Cash' | 'Tempo' | 'Transfer'>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('shopping_paymentByProduct') || '{}') } catch { return {} }
  })
```

At `:197` replace the transfer-persist effect + add payment-persist:
```tsx
  useEffect(() => { localStorage.setItem('shopping_vendorProductIds', JSON.stringify(Array.from(vendorProductIds))) }, [vendorProductIds])
  useEffect(() => { localStorage.setItem('shopping_paymentByProduct', JSON.stringify(paymentByProduct)) }, [paymentByProduct])
```

- [ ] **Step 2: Update history snapshot type + save + restore**

At `:209` change `transferProductIds: Set<string>;` → `vendorProductIds: Set<string>;` and add `paymentByProduct: Record<string, 'Cash' | 'Tempo' | 'Transfer'>;`.
At `:225` change `transferProductIds: new Set(transferProductIds),` → `vendorProductIds: new Set(vendorProductIds),` and add `paymentByProduct: { ...paymentByProduct },`.
At `:246` change `setTransferProductIds(last.transferProductIds)` → `setVendorProductIds(last.vendorProductIds)` and add `setPaymentByProduct(last.paymentByProduct)`.

- [ ] **Step 3: Rename `selectTransfer` → `selectVendor`** at `:302-319`

Rename the function and its set calls (`setTransferProductIds` → `setVendorProductIds`, `add`); also update `selectPasar` (`:276`) and `selectOnline` (`:295`) to clear `setVendorProductIds` instead of `setTransferProductIds`:
```tsx
  const selectVendor = (productId: string) => {
    saveToHistory()
    setStockBookedProductIds(prev => { const next = new Set(prev); next.delete(productId); return next })
    setVendorProductIds(prev => { const next = new Set(prev); next.add(productId); return next })
    setOnlineProductIds(prev => { const next = new Set(prev); next.delete(productId); return next })
  }
```
And in `selectPasar`/`selectOnline`, replace the `setTransferProductIds(... next.delete(productId) ...)` block with `setVendorProductIds(... next.delete(productId) ...)`. Also update `toggleStockBooked` if it clears `transferProductIds` (check ~:321-340; if it clears the transfer set, rename to `setVendorProductIds`).

Add a payment setter:
```tsx
  const setPayment = (productId: string, method: 'Cash' | 'Tempo' | 'Transfer') => {
    saveToHistory()
    setPaymentByProduct(prev => ({ ...prev, [productId]: method }))
  }
```

- [ ] **Step 4: Local compile types** at `:28` and `:474`

Change both `purchaseMethod: 'Pasar' | 'Online' | 'Transfer'` occurrences to `purchaseMethod: 'Pasar' | 'Vendor' | 'Online'` and add `paymentMethod: 'Cash' | 'Tempo' | 'Transfer'` to the `:474` inline array element type (and the interface at `:28` if it declares the compiled row shape).

- [ ] **Step 5: Compile mapping** at `:465`

Change:
```ts
          purchaseMethod: transferProductIds.has(curr.productId) ? 'Transfer' : onlineProductIds.has(curr.productId) ? 'Online' : 'Pasar',
```
to:
```ts
          purchaseMethod: vendorProductIds.has(curr.productId) ? 'Vendor' : onlineProductIds.has(curr.productId) ? 'Online' : 'Pasar',
          paymentMethod: paymentByProduct[curr.productId] || 'Cash',
```

- [ ] **Step 6: Carry `paymentMethod` into created purchase items** at `:605`

Change the `addPurchaseItems(...)` object to add the field:
```ts
        purchaseMethod: item.purchaseMethod,
        paymentMethod: item.paymentMethod
```

- [ ] **Step 7: Per-row picker — relabel Transfer→"Diantar Vendor" (location) + add Metode Bayar group** at `:1680-1730`

Change the Transfer button (`:1710-1721`) to a Vendor location button:
```tsx
                                            {/* Button Diantar Vendor */}
                                            <button
                                               onClick={() => selectVendor(item.productId)}
                                               className={cn(
                                                  "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                  item.purchaseMethod === 'Vendor' && !item.fromStock
                                                     ? "bg-purple-100 border-purple-300 text-purple-700"
                                                     : "bg-slate-50 border-slate-200 text-slate-400"
                                               )}
                                               title="Diantar Vendor (barang dikirim vendor)"
                                            >
                                               Vendor
                                            </button>
```

Add a second button group for payment immediately after the location group's closing `</div>` (after the Gudang button block ends, before the `</TableCell>` at the picker column). Insert a small Cash/Tempo/Transfer row:
```tsx
                                            <div className="flex flex-wrap items-center justify-center gap-1 w-[140px] mt-1">
                                              {(['Cash','Tempo','Transfer'] as const).map(m => (
                                                <button key={m}
                                                  onClick={() => setPayment(item.productId, m)}
                                                  className={cn(
                                                    "px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all hover:scale-105",
                                                    (paymentByProduct[item.productId] || 'Cash') === m
                                                      ? "bg-amber-100 border-amber-300 text-amber-700"
                                                      : "bg-slate-50 border-slate-200 text-slate-400"
                                                  )}
                                                  title={`Metode bayar: ${m}`}
                                                >{m}</button>
                                              ))}
                                            </div>
```
> The location buttons keep their existing wrapper `<div className="flex flex-wrap ... w-[140px]">`; the payment group is a sibling below it. Update the column header at `:2082` from `Metode` to `Lokasi / Bayar` (widen `w-[90px]` → `w-[150px]` if cramped).

- [ ] **Step 8: History-dialog method display** at `:2090-2094`, `:2104`, `:2129`

At `:2090-2094` the `methodColor` ternary falls through to purple for the non-Pasar/Online case — that now covers `'Vendor'`; no code change needed but verify the label at `:2104` (`{item.purchaseMethod}`) reads fine ("VENDOR"). At `:2129` change the cast `as 'Pasar' | 'Online' | 'Transfer'` → `as 'Pasar' | 'Vendor' | 'Online'`.

- [ ] **Step 9: Opportunistic baseline fix** at `:2128`

Change `products.find(p => p.id === i.productId)?.sellPrice || 0` → `products.find(p => p.id === i.productId)?.sellingPrice || 0` (resolves pre-existing TS2551).

- [ ] **Step 10: Run tsc**

Run: `npx tsc --noEmit 2>&1 | grep "shopping-list"`
Expected: no errors in `shopping-list/page.tsx` (including the former `sellPrice` error).

- [ ] **Step 11: Commit**

```bash
git add src/app/admin/shopping-list/page.tsx
git commit -m "feat(cara-belanja): shopping list two-axis picker — Lokasi (Pasar/Vendor/Online) + Metode Bayar (Cash/Tempo/Transfer)"
```

---

### Task 8: Data migration for existing `'Transfer'` rows

**Files:**
- Create: `supabase/migrations/20260704000002_two_axis_cara_belanja.sql`

**Assumption (reviewer confirm):** legacy `purchase_method='Transfer'` rows meant "Tempo / dibayar kantor." Migrate them to a location + a payment. Conservative mapping: location → `Pasar` (legacy Transfer did not track vendor delivery), payment → `Tempo`. Adjust if the reviewer knows specific rows were finance-transfer.

- [ ] **Step 1: Write the migration** (guarded, idempotent). Verify the actual column names first:

Run: `git grep -n "purchase_method\|payment_method" -- supabase/ src/lib/store.ts | head`
Then create the file (adjust column/table names to match what the grep shows — the store may map camelCase↔snake_case):
```sql
-- Two-axis Cara Belanja split: migrate legacy conflated purchase_method='Transfer'.
-- Legacy 'Transfer' meant Tempo/dibayar-kantor. Split into location + payment.
UPDATE purchase_items
SET purchase_method = 'Pasar',
    payment_method  = COALESCE(NULLIF(payment_method, ''), 'Tempo')
WHERE purchase_method = 'Transfer';
```

- [ ] **Step 2: Sanity-check no code still emits `'Transfer'` as a location** (grep gate below in Task 9 covers this). Do not run the migration against prod here — it ships with the branch and applies on the normal migration path.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704000002_two_axis_cara_belanja.sql
git commit -m "chore(cara-belanja): migrate legacy purchase_method='Transfer' rows to Pasar + Tempo"
```

---

### Task 9: Full sweep, tsc gate, and browser verification

**Files:** none (verification only)

- [ ] **Step 1: Grep sweep — no stray location `'Transfer'` semantics remain**

Run:
```bash
git grep -n "purchaseMethod === 'Transfer'\|purchaseMethod === \"Transfer\"\|=== 'Transfer'\|transferProductIds" -- 'src/**/*.ts' 'src/**/*.tsx'
```
Expected: **no matches** except possibly intentional `paymentMethod === 'Transfer'` comparisons (those are correct). Any remaining `purchaseMethod === 'Transfer'` or `transferProductIds` is a miss — fix it.

- [ ] **Step 2: Grep the new axis is wired**

Run:
```bash
git grep -n "purchaseMethod === 'Vendor'\|paymentMethod === 'Transfer'\|isTransferPaid\|paymentByProduct\|recordVendorTransferBulk" -- src | wc -l
```
Expected: several matches across sourcing/list, online-purchase, shopping-list, accounting, types.

- [ ] **Step 3: tsc final gate**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: **≤ 6** (ideally 5 — the `sellPrice` fix). Then list them to confirm ONLY the known pre-existing ones remain:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | sort
```
Confirm the set is a subset of {loss-analytics:624, sales-orders:224, disbursements 280/374/390}. If ANY new error or any `online-purchase`/`shopping-list`/`sourcing`/`accounting`/`pdf`/`qc` error appears → STOP, fix.

- [ ] **Step 4: Production build smoke** (catches runtime-only issues tsc misses)

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds (Next.js compiles). If it fails on the edited pages, fix before browser testing.

- [ ] **Step 5: Browser verification** — REQUIRED SUB-SKILL: use the `run` / `verify` skill or `mcp__Claude_Preview__preview_start`. PINs: Finance `5555`, Sourcing/Hilman `2222`, Super Admin `120194`.

Walk the two-axis flow end-to-end and confirm each routing:
  1. **Super Admin (120194) → Shopping List:** compile a PO. For three rows set: (a) Lokasi=Pasar + Bayar=Cash, (b) Lokasi=Vendor + Bayar=Tempo, (c) Lokasi=Vendor + Bayar=Transfer. Generate document. Confirm both axes persist (reload page — localStorage) and the created purchase items carry both fields (check via app state / a Super Admin view).
  2. **Print PDF:** the Pasar+Cash row shows a price and counts toward "Estimasi Uang Tunai/Cash"; the Tempo and Transfer rows show "(Dibayar Kantor)" and are excluded from the cash total.
  3. **Sourcing (2222) → Belanja list:** Pasar+Cash and Vendor rows appear (Online excluded). Cash row = normal buy flow (price+vendor+Metode Bayar select incl. Transfer). Vendor+Tempo and Vendor+Transfer rows = pickup branch ("Tandai Sudah Diambil", no cash). Mark all, Submit Laporan. Confirm the pocket only draws the Cash amount (Kantong "Kepake" reflects Cash only; Tempo shown as "+ Tempo").
  4. **Finance (5555) → Belanja Online & Cost Calc:** the Vendor+Transfer item appears in the "Transfer Vendor (Dibayar Finance)" queue. Select it, pick vendor + source bank (BCA), "Bayar Transfer". Confirm success toast and the item leaves the queue (isTransferPaid). Check Cash & Bank / journal: Dr HPP (5-1000) / Cr BCA (1-1200), one CashTransaction Out.
  5. **Warehouse QC:** the Tempo and Transfer picked-up items appear in the QC queue after pickup. The Tempo item, on settlement, produces a vendor bill in AP Aging (Dr 2-1100 → Cr 2-1000). Verify AP Aging shows the Tempo bill and NOT the Transfer item (Transfer already expensed to BCA).

- [ ] **Step 6: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "test(cara-belanja): browser-verify two-axis routing (Cash pocket / Tempo AP / Transfer BCA)"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** ✅ Lokasi rename Pasar/Vendor/Online (Tasks 1,3,7); Metode Bayar Cash/Tempo/Transfer (Tasks 1,3,7); Cash→pocket (Task 3 pocket draw + accounting:1067 already correct); Tempo→AP (Task 2 settlement scope + accounting:1067); Transfer→BCA queue (Tasks 2,6); all 13 `'Transfer'` sites in the classification table (Tasks 3-7); compile carries both axes (Task 7); data migration (Task 8); grep + tsc + browser verification (Task 9).
- **Placeholder scan:** ✅ every code step shows literal code + exact line anchors; no TBD/TODO.
- **Type consistency:** `PurchaseMethod='Pasar'|'Vendor'|'Online'` and `paymentMethod='Cash'|'Tempo'|'Transfer'` used identically across Tasks 1,3,5,7; `isTransferPaid` defined in Task 1, consumed in Tasks 2,6; `recordVendorTransferBulk` signature `(items,vendorId,vendorName,bankAccountId,ref)` defined Task 2, matches the existing call at `online-purchase:70`.
- **Known deviation from spec summary:** spec said "all 10 Transfer sites → paymentMethod === 'Tempo'." Reality: sites split three ways (Tempo / Transfer / Vendor-location) — see classification table. This is per the spec's own Risks note ("trace each occurrence").
