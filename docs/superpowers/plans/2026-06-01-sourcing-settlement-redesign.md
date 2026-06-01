# Sourcing Settlement Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Merge the 3-tab sourcing page into a single scrollable page, add a per-item Cash/Tempo payment-method selector, and make the cash-remaining math exclude Tempo items (which become AP debt, not cash spent).

**Architecture:** All changes in `src/app/sourcing/list/page.tsx` (~1206 lines). Accounting is untouched — `recordReconciliationSettlement` already splits cash vs tempo by `item.paymentMethod`. This is UI reorg + a selector + two display-math fixes. `PurchaseItem.paymentMethod: 'Cash' | 'Tempo'` already exists in the type.

**Tech Stack:** Next.js + React + Zustand. Gate: `npx tsc --noEmit -p tsconfig.json` (no test runner). Pre-existing tsc errors in `accounting.ts` (337-338, ~1134-1168) and jspdf are NOT ours — ignore.

**Spec:** `docs/superpowers/specs/2026-06-01-sourcing-settlement-redesign-design.md`

---

## Task 1: Payment-method state + edit-form selector

**Files:** Modify `src/app/sourcing/list/page.tsx`

- [ ] **Step 1:** Add state. After `const [editVendorId, setEditVendorId] = useState<string>('')` (~line 59), add:
```ts
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Cash' | 'Tempo'>('Cash')
```

- [ ] **Step 2:** Set it when expanding an item. Find `handleExpandItem` (~line 70). Inside the branch that populates the edit fields from the item (where `setEditPrice`, `setEditQty`, `setEditVendorId` are called), add:
```ts
      const v = vendors.find(vd => vd.id === item.vendorId)
      setEditPaymentMethod(item.paymentMethod || (v?.isTempo ? 'Tempo' : 'Cash'))
```
(If `handleExpandItem` receives `null` to collapse, leave the existing reset logic as-is; only add this in the populate branch.)

- [ ] **Step 3:** Add the selector in the edit form. After the vendor `<Select>` block closes (the `</Select>` + `</div>` at ~line 707-708, right before the "Keterangan / Alasan" block), insert:
```tsx
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metode Bayar</Label>
                      <Select value={editPaymentMethod} onValueChange={(val) => setEditPaymentMethod((val as 'Cash' | 'Tempo') ?? 'Cash')}>
                        <SelectTrigger className="h-12 bg-white/50 border-2 transition-all focus:border-emerald-500 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash (potong kas sourcing)</SelectItem>
                          <SelectItem value="Tempo">Tempo (hutang ke vendor)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
```

- [ ] **Step 4:** Persist on the inline "Tandai Selesai" save. In the `updatePurchaseItem(item.id, {...})` call inside the save button onClick (~line 744-750), add `paymentMethod: editPaymentMethod,` to the object:
```ts
                              updatePurchaseItem(item.id, {
                                actualUnitPrice: editPrice,
                                qtyPurchased: editQty || item.qtyTarget,
                                notes: editNote,
                                vendorId: editVendorId,
                                paymentMethod: editPaymentMethod,
                                isChecked: true
                              })
```

- [ ] **Step 5:** Persist on submit final-sync. In `handleSubmitLaporan`, the `updatePurchaseItem(activeItem.id, {...})` block (~line 277-282), add `paymentMethod: editPaymentMethod,`:
```ts
        updatePurchaseItem(activeItem.id, {
          actualUnitPrice: editPrice,
          qtyPurchased: editQty || activeItem.qtyTarget,
          notes: editNote,
          vendorId: editVendorId,
          paymentMethod: editPaymentMethod,
        })
```

- [ ] **Step 6:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "sourcing/list"` → no output.
- [ ] **Step 7:** Commit: `git add src/app/sourcing/list/page.tsx && git commit -m "feat(sourcing): add Cash/Tempo payment method selector per item"`

---

## Task 2: Cash-remaining math excludes Tempo

**Files:** Modify `src/app/sourcing/list/page.tsx`

Context: Tempo items become vendor debt (AP) — they do NOT consume sourcing cash. So real-time remaining and the stored `changeReturned` must count only Cash items. `actualSpent` keeps the full shop cost (cash+tempo) for HPP display; the settlement recomputes accounting itself.

- [ ] **Step 1:** Real-time remaining. Replace the `totalShopSpentActual` block (~line 404-408):
```ts
  const totalShopSpentActual = currentItems.reduce((sum, item) => {
    const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
    const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
    return item.isChecked ? sum + (qty * price) : sum
  }, 0)
```
with (exclude Tempo from cash spend, plus a separate tempo total for display):
```ts
  const itemPM = (item: PurchaseItem) => (activeItem?.id === item.id ? editPaymentMethod : (item.paymentMethod || 'Cash'))
  const itemLineTotal = (item: PurchaseItem) => {
    const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
    const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
    return qty * price
  }
  const totalShopSpentActual = currentItems.reduce((sum, item) =>
    (item.isChecked && itemPM(item) !== 'Tempo') ? sum + itemLineTotal(item) : sum, 0)
  const totalTempoActual = currentItems.reduce((sum, item) =>
    (item.isChecked && itemPM(item) === 'Tempo') ? sum + itemLineTotal(item) : sum, 0)
```

- [ ] **Step 2:** Submit-side `changeReturned` excludes Tempo. In `handleSubmitLaporan`, replace the per-purchase cost block (~line 286-302). Current:
```ts
        const pItems = currentItems.filter(item => item.purchaseId === p.id && item.isChecked)
        const pCost = pItems.reduce((sum, item) => {
           const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
           const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
           return sum + (qty * price)
        }, 0)
        const pBudget = (p.budgetAmount || 0) + (p.operationalSpareAmount || 0)
        
        await updatePurchase(p.id, { 
          status: 'Selesai',
          purchaserId: currentUser?.id || '22222222-2222-2222-2222-222222222222',
          actualSpent: pCost,
          changeReturned: pBudget > pCost ? pBudget - pCost : 0,
          reconciliationNote: reconciliationNote || 'Sesuai budget (Auto-Consolidated)',
          reconciliationStatus: 'Laporan Masuk',
          reconciliationProofUrl: proofImage || undefined
        })
```
Replace with (split total vs cash; `changeReturned` uses cash only):
```ts
        const pItems = currentItems.filter(item => item.purchaseId === p.id && item.isChecked)
        const lineTotal = (item: PurchaseItem) => {
          const price = activeItem?.id === item.id ? editPrice : (item.actualUnitPrice || 0)
          const qty = activeItem?.id === item.id ? (editQty || item.qtyTarget) : (item.qtyPurchased || 0)
          return qty * price
        }
        const pm = (item: PurchaseItem) => (activeItem?.id === item.id ? editPaymentMethod : (item.paymentMethod || 'Cash'))
        const pTotalCost = pItems.reduce((sum, item) => sum + lineTotal(item), 0)
        const pCashCost = pItems.reduce((sum, item) => pm(item) !== 'Tempo' ? sum + lineTotal(item) : sum, 0)
        const pBudget = (p.budgetAmount || 0) + (p.operationalSpareAmount || 0)
        
        await updatePurchase(p.id, { 
          status: 'Selesai',
          purchaserId: currentUser?.id || '22222222-2222-2222-2222-222222222222',
          actualSpent: pTotalCost,
          changeReturned: pBudget > pCashCost ? pBudget - pCashCost : 0,
          reconciliationNote: reconciliationNote || 'Sesuai budget (Auto-Consolidated)',
          reconciliationStatus: 'Laporan Masuk',
          reconciliationProofUrl: proofImage || undefined
        })
```

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "sourcing/list"` → no output.
- [ ] **Step 4:** Commit: `git add src/app/sourcing/list/page.tsx && git commit -m "fix(sourcing): exclude Tempo items from cash-remaining and change-returned"`

---

## Task 3: Tempo badge + tempo total in summary

**Files:** Modify `src/app/sourcing/list/page.tsx`

- [ ] **Step 1:** Tempo badge on checked items. In the item row render (the `.map(item => ...)` inside the belanja section, around the item header near line 611-660 where `item.isChecked` styling is applied), add a badge next to the product name. Read the row to find where the product name renders, then add after it:
```tsx
                {(item.paymentMethod === 'Tempo') && (
                  <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white">Tempo</span>
                )}
```

- [ ] **Step 2:** Show tempo total in the wallet summary. In the wallet "Estimasi Sisa" area (~line 456-458), after the Estimasi Sisa value, add a small line when `totalTempoActual > 0`:
```tsx
               {totalTempoActual > 0 && (
                 <p className="text-[8px] font-black uppercase text-amber-400 tracking-widest leading-none mt-1">+ Tempo (hutang): {formatRupiah(totalTempoActual)}</p>
               )}
```
Read lines ~451-460 first to place this inside the correct flex/grid cell.

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "sourcing/list"` → no output.
- [ ] **Step 4:** Commit: `git add src/app/sourcing/list/page.tsx && git commit -m "feat(sourcing): tempo badge on items and tempo total in summary"`

---

## Task 4: Merge 3 tabs into one scrollable page

**Files:** Modify `src/app/sourcing/list/page.tsx`

Context: The page currently has a tab switcher (~lines 525-557) and three mutually-exclusive blocks: `{activeTab === 'belanja' ? (...)` (~line 559), `) : activeTab === 'dompet' ? (...)` (~line 896), `{activeTab === 'ops' && (...)}` (~line 1085). Render all three stacked, each under its own header, and remove the tab UI. Do NOT change the inner content of each block.

- [ ] **Step 1:** Read lines 520-560, 890-900, and 1080-1090 to see the exact opening/closing of the tab switcher and the three conditional blocks.

- [ ] **Step 2:** Remove the tab switcher. Delete the JSX block containing the three `<Button ... onClick={() => setActiveTab('belanja'|'dompet'|'ops')}>` (the wrapping container at ~line 522-558). Replace it with nothing (the sections below become the page body).

- [ ] **Step 3:** Convert the three conditionals into always-rendered sections. Change the structure from:
```tsx
      {activeTab === 'belanja' ? (
        <BELANJA_CONTENT/>
      ) : activeTab === 'dompet' ? (
        <DOMPET_CONTENT/>
      ) : activeTab === 'ops' ? null}   // (current tail)
      ...
      {activeTab === 'ops' && (
        <OPS_CONTENT/>
      )}
```
to three stacked sections, each wrapped with a header. Concretely:
- Replace `{activeTab === 'belanja' ? (` with `<section className="space-y-4"><h2 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">Checklist Belanja</h2>` then the BELANJA_CONTENT, then close with `</section>`.
- Replace the `) : activeTab === 'dompet' ? (` divider so the DOMPET_CONTENT becomes its own `<section className="space-y-4"><h2 ...>Dompet & Setor Kas</h2> ... </section>`.
- Replace the `{activeTab === 'ops' && (` wrapper so OPS_CONTENT becomes `<section className="space-y-4"><h2 ...>Pemakaian Operasional</h2> ... </section>`.
- Remove the ternary `?`/`:` plumbing so all three render unconditionally in document order: Belanja, then Dompet, then Ops.

Because the exact JSX is large, do this carefully: keep each block's inner JSX identical; only change the conditional wrappers into `<section>` wrappers and ensure balanced tags. After editing, the render returns: Wallet Summary → Checklist Belanja section → Dompet section → Ops section → existing dialogs (new-vendor, etc.).

- [ ] **Step 4:** Remove now-unused tab state if fully orphaned. If `activeTab`/`setActiveTab` and the `tabParam` effect are no longer referenced anywhere, delete the `const [activeTab, ...]` (~line 42) and its `useEffect` (~line 44-45) and the `Tabs, TabsList, TabsTrigger` import on line 20 **only if** they are unused elsewhere (the ops sub-tabs at line 1092 use `TabsTrigger` — if so, KEEP the import). Verify with grep before deleting.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "sourcing/list"` → no output. Also visually confirm the JSX tags balance (tsc will error if not).

- [ ] **Step 6:** Commit: `git add src/app/sourcing/list/page.tsx && git commit -m "feat(sourcing): merge belanja/dompet/ops tabs into one page"`

---

## Task 5: Verify + PR

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "sourcing/list"` → no output.
- [ ] **Step 2: Manual smoke (after deploy).** Open sourcing list as a sourcing user: one scrollable page with Wallet → Checklist → Dompet → Ops. Check an item, set Tempo → item gets Tempo badge, "Estimasi Sisa" does NOT drop by that item, tempo total shows. Set Cash item → sisa drops. Submit → finance settlement still works (HPP for cash, VendorBill for tempo in AP Aging).
- [ ] **Step 3:** Push + PR:
```bash
git push -u origin claude/sourcing-settlement-redesign
gh pr create --base main --title "feat(sourcing): single-page settlement + Cash/Tempo per item" --body "Implements docs/superpowers/specs/2026-06-01-sourcing-settlement-redesign-design.md"
```

---

## Self-Review Notes
- **Spec coverage:** single page (Task 4), payment-method selector (Task 1), Tempo excluded from cash math (Task 2), Tempo badge + summary (Task 3). Covered.
- **Accounting untouched:** no edits to `accounting.ts`; settlement recomputes its own split. `actualSpent` stays full shop cost (cash+tempo) for HPP; only `changeReturned`/remaining excludes tempo.
- **Type consistency:** `editPaymentMethod: 'Cash' | 'Tempo'` consistent across state, selector, both persist sites, and the math helpers.
- **Risk note:** Task 4 (tab merge) is structural — implementer must keep inner JSX identical and balance tags; tsc is the safety net.
