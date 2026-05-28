# Quick Vendor and Payment Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add a new vendor on-the-fly from the Sourcing Settlement modal and customize the payment method (Cash vs Tempo) per item row.

**Architecture:** We will add a `payment_method` column to `purchase_items` in the database. In the UI, each item row in the Sourcing Settlement modal will show a payment method selection that defaults based on the selected vendor, but can be overridden. The settlement accounting logic will use this item override to calculate Cash vs Tempo totals.

**Tech Stack:** React, Next.js, Supabase, TypeScript, Tailwind CSS, Zustand

---

### Task 1: Update Database Schema and Types

**Files:**
- Create: `supabase/migrations/20260528_add_purchase_item_payment_method.sql`
- Modify: `supabase/dev-bootstrap.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create the SQL migration file**
  Write SQL to add `payment_method` column to `purchase_items`.
  ```sql
  -- supabase/migrations/20260528_add_purchase_item_payment_method.sql
  ALTER TABLE public.purchase_items
    ADD COLUMN IF NOT EXISTS payment_method text;
  ```

- [ ] **Step 2: Update local development bootstrap SQL**
  Modify [dev-bootstrap.sql](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/supabase/dev-bootstrap.sql) at line 138 to add the `payment_method` column.
  ```sql
    is_online_ordered boolean not null default false,
    payment_method text
  );
  ```

- [ ] **Step 3: Update TypeScript interface for PurchaseItem**
  Add `paymentMethod` field to `PurchaseItem` in [src/types/index.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/types/index.ts) at line 203.
  ```typescript
    vendorId?: string;
    paymentMethod?: 'Cash' | 'Tempo';
  }
  ```

- [ ] **Step 4: Commit schema changes**
  Run:
  ```bash
  git add supabase/migrations/20260528_add_purchase_item_payment_method.sql supabase/dev-bootstrap.sql src/types/index.ts
  git commit -m "schema: add paymentMethod field to purchase_items"
  ```

---

### Task 2: Update Accounting Settlement and Helper Logic

**Files:**
- Modify: `src/lib/accounting.ts`
- Modify: `src/lib/vendor-payable.ts`

- [ ] **Step 1: Update recordReconciliationSettlement in accounting.ts**
  Modify [accounting.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/lib/accounting.ts) at lines 830-835 to use `item.paymentMethod` if specified, falling back to `vendor.isTempo`.
  ```typescript
      const vId = item.vendorId!;
      const vendor = vendorMap.get(vId);
      const isTempo = item.paymentMethod 
        ? (item.paymentMethod === 'Tempo')
        : (vendor ? (vendor.isTempo !== false) : true);
      const cost = (item.actualUnitPrice || 0) * (item.qtyPurchased || 0);
  ```

- [ ] **Step 2: Update computeSettlementBreakdown in vendor-payable.ts**
  Modify [vendor-payable.ts](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/lib/vendor-payable.ts) at lines 29-33 to check `item.paymentMethod` first.
  ```typescript
      const isTempo = item.paymentMethod
        ? (item.paymentMethod === 'Tempo')
        : (vendor ? (vendor.isTempo !== false) : true);
      const cost = (item.actualUnitPrice || 0) * (item.qtyPurchased || 0);
  ```

- [ ] **Step 3: Update unit tests for vendor-payable**
  Add a test case in [test-vendor-payable.js](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/scripts/test-vendor-payable.js) at line 50 to verify the item payment method override works.
  ```javascript
    const itemsOverride = [
      { id: '1', vendorId: 'v-tempo', actualUnitPrice: 1000, qtyPurchased: 5, paymentMethod: 'Cash' }, // 5000 (overridden to cash)
      { id: '2', vendorId: 'v-cash', actualUnitPrice: 2000, qtyPurchased: 2, paymentMethod: 'Tempo' },  // 4000 (overridden to tempo)
    ];
    const resOverride = computeSettlementBreakdown(itemsOverride, vendors, 3000);
    assert('overridden tempo total is 4000', resOverride.tempoTotals.get('v-cash') === 4000);
    assert('overridden cashTotal is 5000', resOverride.cashTotal === 5000);
  ```

- [ ] **Step 4: Run unit tests and verify they pass**
  Run: `node scripts/test-vendor-payable.js`
  Expected: All tests pass.

- [ ] **Step 5: Commit accounting updates**
  Run:
  ```bash
  git add src/lib/accounting.ts src/lib/vendor-payable.ts scripts/test-vendor-payable.js
  git commit -m "feat(accounting): support per-item payment method override"
  ```

---

### Task 3: Implement Quick-Add Vendor and Payment Method Override UI

**Files:**
- Modify: `src/app/finance/approvals/page.tsx`

- [ ] **Step 1: Update page.tsx states**
  Add states for Quick Vendor modal and `itemIdForNewVendor` around line 188 in [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/finance/approvals/page.tsx). Also update the `settlementItems` React state type.
  ```typescript
  const [settlementItems, setSettlementItems] = useState<Record<string, { 
    actualPrice: number, 
    qtyPurchased: number, 
    vendorId?: string,
    paymentMethod?: 'Cash' | 'Tempo'
  }>>({})

  // Quick Vendor creation states
  const [isNewVendorOpen, setIsNewVendorOpen] = useState(false)
  const [itemIdForNewVendor, setItemIdForNewVendor] = useState<string | null>(null)
  const [newVendorForm, setNewVendorForm] = useState({
    companyName: "",
    picName: "",
    email: "",
    phone: "",
    address: "",
    paymentTermDays: 14,
    isTempo: true
  })
  ```

- [ ] **Step 2: Update openDirectSettle logic to fetch and store default paymentMethod**
  In [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/finance/approvals/page.tsx) at line 200, initialize `paymentMethod` from the vendor or default to Tempo.
  ```typescript
      const initialItems: Record<string, { actualPrice: number, qtyPurchased: number, vendorId?: string, paymentMethod?: 'Cash' | 'Tempo' }> = {}
      items.forEach(item => {
        const vendor = vendors.find(v => v.id === item.vendorId)
        const defaultPaymentMethod = item.paymentMethod || (vendor ? (vendor.isTempo ? 'Tempo' : 'Cash') : 'Tempo')
        initialItems[item.id] = { 
          actualPrice: item.actualUnitPrice || item.estimatedUnitPrice || 0, 
          qtyPurchased: item.qtyPurchased || item.qtyTarget, 
          vendorId: item.vendorId || "",
          paymentMethod: defaultPaymentMethod
        }
      })
  ```

- [ ] **Step 3: Update handleItemSettlement save logic to include paymentMethod**
  In [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/finance/approvals/page.tsx) at line 500, update `updatePurchaseItem` parameters.
  ```typescript
        await useAppStore.getState().updatePurchaseItem(itemId, { 
          actualUnitPrice: data.actualPrice, 
          qtyPurchased: data.qtyPurchased, 
          vendorId: data.vendorId,
          paymentMethod: data.paymentMethod,
          isChecked: true 
        })
  ```

- [ ] **Step 4: Add the inline "+ Tambah" button and "Tipe Bayar" select input**
  In [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/finance/approvals/page.tsx) around lines 1268-1285, replace the Vendor column label and content.
  ```tsx
  <div className="flex flex-col xl:flex-row gap-4 xl:items-center">
     <div className="flex-1">
        <p className="font-black text-slate-800 text-sm">{product?.name}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Target: {pi.qtyTarget} {product?.uom}</p>
     </div>
     <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
        {/* Vendor Selector */}
        <div className="space-y-1 w-44">
           <div className="flex items-center justify-between">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Vendor</label>
              <button 
                type="button"
                onClick={() => {
                  setItemIdForNewVendor(pi.id)
                  setIsNewVendorOpen(true)
                }}
                className="text-[9px] font-extrabold text-orange-500 hover:text-orange-600 uppercase flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" /> Tambah
              </button>
           </div>
           <Select 
             value={itemState.vendorId || ''} 
             onValueChange={(val) => {
               const selectedVendor = vendors.find(v => v.id === val)
               const defaultMethod = selectedVendor ? (selectedVendor.isTempo ? 'Tempo' : 'Cash') : 'Tempo'
               setSettlementItems(prev => ({
                 ...prev, 
                 [pi.id]: { ...itemState, vendorId: val || undefined, paymentMethod: defaultMethod }
               }))
             }}
           >
             <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-slate-200 bg-slate-50">
                <SelectValue placeholder="— Pilih Vendor —" />
             </SelectTrigger>
             <SelectContent>
                {vendors.map(v => (
                   <SelectItem key={v.id} value={v.id} className="text-xs font-bold">
                      {v.companyName} {v.isTempo ? `(tempo ${v.paymentTermDays || 14}d)` : '(cash)'}
                   </SelectItem>
                ))}
             </SelectContent>
           </Select>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-1 w-24">
           <label className="text-[9px] font-bold text-slate-400 uppercase">Tipe Bayar</label>
           <Select 
             value={itemState.paymentMethod || 'Tempo'} 
             onValueChange={(val) => setSettlementItems(prev => ({
               ...prev, 
               [pi.id]: { ...itemState, paymentMethod: val as 'Cash' | 'Tempo' }
             }))}
           >
             <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-slate-200 bg-slate-50">
                <SelectValue placeholder="— Tipe —" />
             </SelectTrigger>
             <SelectContent>
                <SelectItem value="Cash" className="text-xs font-bold">Cash</SelectItem>
                <SelectItem value="Tempo" className="text-xs font-bold">Tempo</SelectItem>
             </SelectContent>
           </Select>
        </div>
  ```

- [ ] **Step 5: Implement the Quick-Add Vendor dialog markup and submit handler**
  Add the dialog and submit function at the bottom of [page.tsx](file:///Users/rezanje/Antygravity/webapp%20kerja%20disma/disma-core/src/app/finance/approvals/page.tsx) before the closing tag of the main container.
  ```typescript
  const handleCreateVendor = async () => {
    if (!newVendorForm.companyName) {
      toast.error("Nama Vendor wajib diisi")
      return
    }
    const newVendor = {
      id: `vendor-${Date.now()}-${uuidv4().slice(0, 4)}`,
      companyName: newVendorForm.companyName,
      picName: newVendorForm.picName || "—",
      email: newVendorForm.email || `${newVendorForm.companyName.toLowerCase().replace(/\s+/g, '')}@example.com`,
      phone: newVendorForm.phone || "—",
      address: newVendorForm.address || "—",
      createdAt: new Date().toISOString(),
      paymentTermDays: newVendorForm.isTempo ? Number(newVendorForm.paymentTermDays) : undefined,
      isTempo: newVendorForm.isTempo
    }

    try {
      const addVendor = useAppStore.getState().addVendor
      await addVendor(newVendor)
      toast.success(`Vendor "${newVendor.companyName}" berhasil ditambahkan!`)
      
      // Auto-select for the active item
      if (itemIdForNewVendor) {
        setSettlementItems(prev => {
          const prevItem = prev[itemIdForNewVendor] || { actualPrice: 0, qtyPurchased: 0 }
          return {
            ...prev,
            [itemIdForNewVendor]: {
              ...prevItem,
              vendorId: newVendor.id,
              paymentMethod: newVendor.isTempo ? 'Tempo' : 'Cash'
            }
          }
        })
      }

      setIsNewVendorOpen(false)
      setNewVendorForm({
        companyName: "",
        picName: "",
        email: "",
        phone: "",
        address: "",
        paymentTermDays: 14,
        isTempo: true
      })
      setItemIdForNewVendor(null)
    } catch (err) {
      console.error("Failed to add vendor:", err)
      toast.error("Gagal menambahkan vendor baru.")
    }
  }
  ```
  Add the Dialog UI component in the JSX layout:
  ```tsx
  {/* Quick-Add Vendor Dialog */}
  <Dialog open={isNewVendorOpen} onOpenChange={setIsNewVendorOpen}>
     <DialogContent className="w-[95vw] sm:max-w-md border-none rounded-[2rem] p-6 bg-white shadow-2xl">
        <DialogHeader className="pb-4 border-b border-slate-100">
           <DialogTitle className="text-lg font-black text-slate-900 tracking-tight">TAMBAH VENDOR BARU</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
           <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama Vendor / Perusahaan *</label>
              <input 
                type="text"
                value={newVendorForm.companyName}
                onChange={(e) => setNewVendorForm(prev => ({ ...prev, companyName: e.target.value }))}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                placeholder="cth. PT Tani Makmur"
              />
           </div>
           <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama PIC</label>
                 <input 
                   type="text"
                   value={newVendorForm.picName}
                   onChange={(e) => setNewVendorForm(prev => ({ ...prev, picName: e.target.value }))}
                   className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                   placeholder="cth. Budi"
                 />
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">No Telepon</label>
                 <input 
                   type="text"
                   value={newVendorForm.phone}
                   onChange={(e) => setNewVendorForm(prev => ({ ...prev, phone: e.target.value }))}
                   className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                   placeholder="cth. 0812..."
                 />
              </div>
           </div>
           <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Alamat</label>
              <input 
                type="text"
                value={newVendorForm.address}
                onChange={(e) => setNewVendorForm(prev => ({ ...prev, address: e.target.value }))}
                className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                placeholder="Alamat lengkap vendor"
              />
           </div>
           <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Default Cara Bayar</label>
                 <Select 
                   value={newVendorForm.isTempo ? "Tempo" : "Cash"}
                   onValueChange={(val) => setNewVendorForm(prev => ({ ...prev, isTempo: val === "Tempo" }))}
                 >
                   <SelectTrigger className="h-11 rounded-xl text-xs font-bold border-slate-200 bg-slate-50">
                      <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="Cash" className="text-xs font-bold">Cash</SelectItem>
                      <SelectItem value="Tempo" className="text-xs font-bold">Tempo</SelectItem>
                   </SelectContent>
                 </Select>
              </div>
              {newVendorForm.isTempo && (
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Jatuh Tempo (Hari)</label>
                    <input 
                      type="number"
                      value={newVendorForm.paymentTermDays}
                      onChange={(e) => setNewVendorForm(prev => ({ ...prev, paymentTermDays: Number(e.target.value) || 14 }))}
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                      placeholder="14"
                    />
                 </div>
              )}
           </div>
        </div>
        <div className="flex gap-3 pt-4 border-t border-slate-100">
           <Button variant="outline" className="flex-1 h-11 rounded-xl font-bold text-xs uppercase" onClick={() => setIsNewVendorOpen(false)}>Batal</Button>
           <Button className="flex-1 h-11 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-xs uppercase" onClick={handleCreateVendor}>Simpan</Button>
        </div>
     </DialogContent>
  </Dialog>
  ```

- [ ] **Step 6: Verify and commit UI changes**
  Run:
  ```bash
  git add src/app/finance/approvals/page.tsx
  git commit -m "feat(ui): add quick vendor modal and per-item payment override"
  ```
