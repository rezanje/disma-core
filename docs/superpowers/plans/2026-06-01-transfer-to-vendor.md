# Transfer-to-Vendor Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `Transfer` purchase method (parallel to `Online`) so finance pays a vendor by bank transfer for market goods that sourcing only picks up — booked outside the sourcing advance, settled via QC inbound like Online.

**Architecture:** Mirror the existing `Online` flow. Items flagged `purchaseMethod='Transfer'` at shopping-list creation; finance pays them in a new section of `finance/online-purchase`; `recordVendorTransferPurchase` books the journal; reconciliation already only touches `Pasar`. The key correctness change is sweeping `purchaseMethod !== 'Online'` filters to `=== 'Pasar'` so Transfer is excluded from advance/HPP like Online.

**Tech Stack:** Next.js + React + Zustand + Supabase. Gate: `npx tsc --noEmit -p tsconfig.json` (no test runner). Pre-existing tsc errors in `accounting.ts` (337-338, ~1134-1168) + jspdf are NOT ours — ignore.

**Spec:** `docs/superpowers/specs/2026-06-01-transfer-to-vendor-design.md`

---

## Task 1: Prod DB columns

**Files:** none (Supabase `apply_migration`, project_id `ckkohudfuisgzlrjipev`).

- [ ] **Step 1:** Apply migration `add_transfer_fields_to_purchase_items`:
```sql
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS is_transfer_paid boolean;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS transfer_vendor_id text;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS transfer_ref text;
```
- [ ] **Step 2:** Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='purchase_items' AND column_name IN ('is_transfer_paid','transfer_vendor_id','transfer_ref');
```
Expected: 3 rows.

---

## Task 2: Types

**Files:** Modify `src/types/index.ts`

- [ ] **Step 1:** Change `PurchaseMethod`:
```ts
export type PurchaseMethod = 'Pasar' | 'Online' | 'Transfer';
```
- [ ] **Step 2:** In `interface PurchaseItem`, after `inboundNote?: string;` (near the other optional flags), add:
```ts
  isTransferPaid?: boolean;
  transferVendorId?: string;
  transferRef?: string;
```
- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "types/index"` → no output.
- [ ] **Step 4:** Commit: `git add src/types/index.ts && git commit -m "feat(types): add Transfer purchase method and transfer-paid fields"`

---

## Task 3: Filter sweep — treat Transfer like Online (exclude from advance/HPP)

**Files:** Modify `src/app/admin/shopping-list/page.tsx`, `src/app/finance/approvals/page.tsx`

Context: Many places compute the sourcing advance / market-cash / HPP set with `purchaseMethod !== 'Online'`. Transfer must be excluded too (finance pays it, not sourcing). Replace those with `=== 'Pasar'`; replace skip-conditions `purchaseMethod === 'Online'` with `!== 'Pasar'`.

- [ ] **Step 1:** In `src/app/admin/shopping-list/page.tsx`, replace every occurrence of `pi.purchaseMethod !== 'Online'` and `item.purchaseMethod !== 'Online'` with `… === 'Pasar'`. Exact sites: line 315 (`pi.purchaseMethod !== 'Online'` → `pi.purchaseMethod === 'Pasar'`), line 825 (`item.purchaseMethod !== 'Online'` → `item.purchaseMethod === 'Pasar'`), line 940 (`item.purchaseMethod !== 'Online'` → `item.purchaseMethod === 'Pasar'`). Use grep to confirm none remain: `grep -n "purchaseMethod !== 'Online'" src/app/admin/shopping-list/page.tsx` → empty.

- [ ] **Step 2:** In `src/app/finance/approvals/page.tsx`, replace:
  - line 234: `pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited` → `pi.purchaseMethod === 'Pasar' && !pi.isOnlineAudited`
  - line 288: `pi.purchaseMethod !== 'Online'` → `pi.purchaseMethod === 'Pasar'`
  - line 871: `pi.purchaseMethod !== 'Online'` → `pi.purchaseMethod === 'Pasar'`
  - line 1253: `pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited` → `pi.purchaseMethod === 'Pasar' && !pi.isOnlineAudited`
  - line 1423: `pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited` → `pi.purchaseMethod === 'Pasar' && !pi.isOnlineAudited`
  - line 507: `if (!item || item.isOnlineAudited || item.purchaseMethod === 'Online') return false` → `if (!item || item.isOnlineAudited || item.purchaseMethod !== 'Pasar') return false`
  - line 546: `if (!item || item.isOnlineAudited || item.purchaseMethod === 'Online') continue` → `if (!item || item.isOnlineAudited || item.purchaseMethod !== 'Pasar') continue`
  Confirm with `grep -n "purchaseMethod !== 'Online'\|purchaseMethod === 'Online'" src/app/finance/approvals/page.tsx` → empty (or only intentional display-only cases; there should be none left after these).

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "shopping-list|approvals/page"` → no output.
- [ ] **Step 4:** Commit: `git add src/app/admin/shopping-list/page.tsx src/app/finance/approvals/page.tsx && git commit -m "fix(purchase): exclude Transfer items from advance/HPP like Online"`

---

## Task 4: Shopping-list — 3-way method (Pasar/Online/Transfer)

**Files:** Modify `src/app/admin/shopping-list/page.tsx`

Context: Online is flagged via `onlineProductIds` Set (localStorage `shopping_onlineProductIds`) and a per-row toggle `toggleOnline(productId)`. Add a parallel `transferProductIds` Set (mutually exclusive with online) + a per-row Transfer toggle, and include it in the `purchaseMethod` assignment.

- [ ] **Step 1:** Add the transfer set state next to `onlineProductIds` (~line 79-83):
```ts
  const [transferProductIds, setTransferProductIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('shopping_transferProductIds') || '[]')) } catch { return new Set() }
  })
```
- [ ] **Step 2:** Persist it. Next to the existing `useEffect` that saves `onlineProductIds` (~line 103), add:
```ts
  useEffect(() => { localStorage.setItem('shopping_transferProductIds', JSON.stringify(Array.from(transferProductIds))) }, [transferProductIds])
```
- [ ] **Step 3:** Add a toggle handler. Find `toggleOnline` (grep `const toggleOnline`) and add right after it:
```ts
  const toggleTransfer = (productId: string) => {
    setTransferProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else { next.add(productId); setOnlineProductIds(o => { const n = new Set(o); n.delete(productId); return n }) }
      return next
    })
  }
```
Also make `toggleOnline` clear transfer when enabling online — inside `toggleOnline`, when adding to the online set, also remove from transfer: add `setTransferProductIds(t => { const n = new Set(t); n.delete(productId); return n })` in its add branch.
- [ ] **Step 4:** Update the `purchaseMethod` assignment (line ~187):
```ts
          purchaseMethod: transferProductIds.has(curr.productId) ? 'Transfer' : onlineProductIds.has(curr.productId) ? 'Online' : 'Pasar',
```
And update the inline array type annotation on the `reduce` (line ~193) from `purchaseMethod: 'Pasar' | 'Online'` to `purchaseMethod: 'Pasar' | 'Online' | 'Transfer'`.
- [ ] **Step 5:** Add a Transfer toggle button in the row, next to the online toggle (after the `</button>` of `toggleOnline` at ~line 794):
```tsx
                                <button
                                   onClick={() => toggleTransfer(item.productId)}
                                   className={cn(
                                      "p-2 rounded-xl border transition-all flex items-center justify-center hover:scale-110",
                                      item.purchaseMethod === 'Transfer'
                                         ? "bg-purple-50 border-purple-200 text-purple-600"
                                         : "bg-slate-50 border-slate-200 text-slate-400"
                                   )}
                                   title={item.purchaseMethod === 'Transfer' ? "Transfer: dibayar finance" : "Tandai dibayar via Transfer (finance)"}
                                >
                                   <Banknote className="w-4 h-4" />
                                </button>
```
Ensure `Banknote` is imported from `lucide-react` (add to the import if missing).
- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "shopping-list"` → no output.
- [ ] **Step 7:** Commit: `git add src/app/admin/shopping-list/page.tsx && git commit -m "feat(shopping-list): 3-way Pasar/Online/Transfer method toggle"`

---

## Task 5: Accounting — recordVendorTransferPurchase

**Files:** Modify `src/lib/accounting.ts`

Context: mirror `recordOnlinePurchase` (debit AP-accrual `2-1100`, credit bank, cash Out, mark item, set actualUnitPrice, update price history; HPP final at QC). Difference: counterpart is a chosen vendor, mark `isTransferPaid` instead of `isOnlineAudited`.

- [ ] **Step 1:** Append to `src/lib/accounting.ts`:
```ts
/** Finance pays a vendor by transfer for a market item; sourcing only picks it up.
 *  Mirrors recordOnlinePurchase: books goods to AP-accrual, HPP finalized at QC. */
export const recordVendorTransferPurchase = async (
  itemId: string,
  amount: number,
  productName: string,
  vendorId: string,
  vendorName: string,
  bankAccountId: string,
  transferRef: string = ''
) => {
  const store = useAppStore.getState();
  const total = Number(amount || 0);
  const existing = store.purchaseItems.find(pi => pi.id === itemId);
  if (existing?.isTransferPaid) {
    console.warn(`[Accounting] Transfer purchase already recorded for item ${itemId}`);
    return true;
  }

  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankAccountCode = bank?.accountCode || '1-1200';

  const success = await createAccountingEntry(
    `Transfer Vendor: ${productName} (${vendorName}) - Ref: ${itemId.slice(0, 8)}`,
    'Purchase',
    itemId,
    [{ accountCode: '2-1100', amount: total }],
    [{ accountCode: bankAccountCode, amount: total }]
  );

  if (success) {
    if (total > 0) {
      await store.addCashTransaction({
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: total,
        type: 'Out',
        category: 'Transfer Vendor',
        description: `Transfer Vendor: ${productName} (${vendorName})`,
        bankAccountId,
        counterpartName: vendorName,
        referenceId: itemId,
        referenceType: 'Purchase',
      });
    }
    const qty = existing?.qtyTarget || 1;
    await store.updatePurchaseItem(itemId, {
      isTransferPaid: true,
      transferVendorId: vendorId,
      vendorId,
      transferRef,
      actualUnitPrice: total / qty,
    });
    const product = store.products.find(p => p.id === existing?.productId);
    if (product) updateProductPriceHistory(product.id, total / qty, 'Transfer Vendor');
  }
  return success;
};
```
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "accounting"` → only pre-existing errors (337-338, 1134-1168), nothing new.
- [ ] **Step 3:** Commit: `git add src/lib/accounting.ts && git commit -m "feat(accounting): add recordVendorTransferPurchase (mirror online)"`

---

## Task 6: Finance hub — Transfer section + readiness gate

**Files:** Modify `src/app/finance/online-purchase/page.tsx`

Context: page lists Online items to order. Add a self-contained **Transfer Vendor** section listing items `purchaseMethod==='Transfer' && !isTransferPaid`, letting finance pick a vendor + source bank and pay (loops `recordVendorTransferPurchase` over selected items). Also fix the "all items ready" gate (~line 147) so Transfer items count as ready when paid.

- [ ] **Step 1:** Add imports + selectors at the top of the component. Add to the accounting import (line 5):
```ts
import { recordOnlinePurchase, recordVendorTransferPurchase } from "@/lib/accounting"
```
Add selectors near the other `useAppStore` calls (~line 17-20):
```ts
  const vendors = useAppStore(state => state.vendors) || []
  const bankAccounts = useAppStore(state => state.bankAccounts) || []
```
- [ ] **Step 2:** Add Transfer state + derived list + handler. After the existing state declarations (after ~line 25 calculatorState), add:
```ts
  const [transferSelected, setTransferSelected] = useState<Set<string>>(new Set())
  const [transferVendorId, setTransferVendorId] = useState("")
  const [transferBankId, setTransferBankId] = useState("")
  const [transferLoading, setTransferLoading] = useState(false)

  const transferItems = purchaseItems
    .filter(pi => pi.purchaseMethod === 'Transfer' && !pi.isTransferPaid)
    .map(pi => ({ ...pi, product: products.find(p => p.id === pi.productId) }))

  const toggleTransferItem = (id: string) => {
    setTransferSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const transferTotal = transferItems
    .filter(pi => transferSelected.has(pi.id))
    .reduce((s, pi) => s + (pi.estimatedUnitPrice || pi.product?.basePrice || 0) * (pi.qtyTarget || 0), 0)

  const handlePayTransfer = async () => {
    if (transferSelected.size === 0) { toast.error('Pilih minimal 1 item.'); return }
    if (!transferVendorId) { toast.error('Pilih vendor.'); return }
    if (!transferBankId) { toast.error('Pilih rekening sumber.'); return }
    const vendor = vendors.find(v => v.id === transferVendorId)
    setTransferLoading(true)
    const loadingId = toast.loading('Memproses transfer vendor...')
    try {
      const ref = `TRF-${Date.now().toString().slice(-6)}`
      for (const id of Array.from(transferSelected)) {
        const pi = transferItems.find(t => t.id === id)
        if (!pi) continue
        const amount = (pi.estimatedUnitPrice || pi.product?.basePrice || 0) * (pi.qtyTarget || 0)
        const ok = await recordVendorTransferPurchase(
          pi.id, amount, pi.product?.name || 'Item', transferVendorId, vendor?.companyName || 'Vendor', transferBankId, ref
        )
        if (!ok) throw new Error(`Gagal mencatat transfer untuk item ${pi.id}`)
      }
      toast.success('Transfer vendor tercatat ke ledger.', { id: loadingId })
      setTransferSelected(new Set()); setTransferVendorId(''); setTransferBankId('')
    } catch (e) {
      toast.error(`Gagal: ${e instanceof Error ? e.message : String(e)}`, { id: loadingId })
    } finally {
      setTransferLoading(false)
    }
  }
```
Confirm `toast` is imported (the page already uses it; if not, add `import { toast } from "sonner"`).
- [ ] **Step 3:** Render the Transfer section. Inside the returned JSX, just before the closing wrapper of the page body (after the Online items list), insert:
```tsx
        <div className="mt-8 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-purple-600 px-1">Transfer Vendor (Dibayar Finance)</h2>
          {transferItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-center text-xs font-bold text-slate-400">Tidak ada item transfer menunggu pembayaran.</div>
          ) : (
            <div className="rounded-2xl border border-slate-100 p-4 space-y-3 bg-white dark:bg-slate-900">
              <div className="space-y-2 max-h-[200px] overflow-auto">
                {transferItems.map(pi => (
                  <label key={pi.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2 text-xs font-bold cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={transferSelected.has(pi.id)} onChange={() => toggleTransferItem(pi.id)} className="accent-purple-600 h-4 w-4" />
                      <span className="truncate">{pi.product?.name || 'Item'} · {pi.qtyTarget} {pi.product?.uom || ''}</span>
                    </span>
                    <span className="text-purple-600 shrink-0">{formatRupiah((pi.estimatedUnitPrice || pi.product?.basePrice || 0) * (pi.qtyTarget || 0))}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={transferVendorId} onValueChange={(v) => setTransferVendorId(v ?? '')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Vendor --" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (<SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={transferBankId} onValueChange={(v) => setTransferBankId(v ?? '')}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="-- Rekening --" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500">Total: {formatRupiah(transferTotal)}</span>
                <Button onClick={handlePayTransfer} disabled={transferLoading} className="bg-purple-600 hover:bg-purple-700 text-white font-black uppercase text-[10px] tracking-widest h-10 rounded-xl px-5">
                  {transferLoading ? 'Memproses...' : 'Bayar Transfer'}
                </Button>
              </div>
            </div>
          )}
        </div>
```
Ensure `Select, SelectContent, SelectItem, SelectTrigger, SelectValue`, `Button`, and `formatRupiah` are imported in this file (add any missing from `@/components/ui/select`, `@/components/ui/button`, `@/lib/utils`).
- [ ] **Step 4:** Fix the readiness gate (~line 147). Replace:
```ts
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
```
with:
```ts
        if (pi.purchaseMethod === 'Online') return pi.isOnlineOrdered;
        if (pi.purchaseMethod === 'Transfer') return pi.isTransferPaid;
```
- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "online-purchase"` → no output.
- [ ] **Step 6:** Commit: `git add src/app/finance/online-purchase/page.tsx && git commit -m "feat(finance): Transfer Vendor payment section in purchase hub"`

---

## Task 7: Verify + PR

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "shopping-list|approvals/page|online-purchase|accounting|types/index"` — only pre-existing accounting errors (337-338, 1134-1168). Nothing else.
- [ ] **Step 2: DB smoke after deploy.** Flag a shopping-list item as Transfer → compile → item `purchase_items.purchase_method='Transfer'`, excluded from advance budget. In finance/online-purchase, Transfer section lists it; pick vendor+bank → Bayar → `is_transfer_paid=true`, journal balanced (debit 2-1100, credit bank), cash Out recorded. Reconciliation of the sourcing purchase ignores the Transfer item.
- [ ] **Step 3:** Push + PR:
```bash
git push -u origin claude/transfer-to-vendor
gh pr create --base main --title "feat: transfer-to-vendor payment (mirror Online)" --body "Implements docs/superpowers/specs/2026-06-01-transfer-to-vendor-design.md"
```

---

## Self-Review Notes
- **Spec coverage:** data model (Task 1/2), flagging at shopping-list (Task 4), advance/HPP exclusion (Task 3), finance hub payment + accounting (Task 5/6), readiness gate (Task 6 step 4), sourcing exclusion (already `=== 'Pasar'`, no change). Reconciliation untouched. Covered.
- **Critical correctness:** Task 3 sweep ensures Transfer is excluded from advance/HPP everywhere Online is. Missing a site would double-count Transfer in the advance — the implementer must grep-verify zero remaining `!== 'Online'` / `=== 'Online'` in the two files.
- **Type consistency:** `isTransferPaid` / `transferVendorId` / `transferRef` consistent across type, accounting helper, and hub. `recordVendorTransferPurchase` signature matches its call in Task 6.
- **Scope:** Transfer = paid now (cash transfer); no tempo on this path.
