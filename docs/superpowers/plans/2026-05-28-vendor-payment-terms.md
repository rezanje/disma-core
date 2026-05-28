# Vendor Payment Terms & Accounts Payable Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add payment terms configuration (tempo vs cash, and duration) to the Vendor Master interface and table, which automatically integrates with the existing accounts payable (Vendor Bill) flow.

**Architecture:** Extend the `formData` state and dialog inputs in `src/app/admin/vendors/page.tsx` to support editing `isTempo` and `paymentTermDays`. Display the "Metode Pembayaran" column in the vendors table.

**Tech Stack:** React, Next.js, Zustand, Lucide Icons, Shadcn components.

---

### Task 1: Update Vendor Master Page Component

**Files:**
- Modify: `src/app/admin/vendors/page.tsx`

- [ ] **Step 1: Import Checkbox component**
  Import `Checkbox` from `@/components/ui/checkbox` at the top imports section.

- [ ] **Step 2: Update form state initialization**
  Extend `formData` to include `isTempo` and `paymentTermDays`.
  ```typescript
  const [formData, setFormData] = useState({
    companyName: "",
    picName: "",
    email: "",
    phone: "",
    address: "",
    isTempo: true,
    paymentTermDays: 14
  })
  ```

- [ ] **Step 3: Update `resetForm` and `handleEdit` handlers**
  Ensure state resets and populates correctly when editing:
  ```typescript
  const resetForm = () => {
    setFormData({
      companyName: "",
      picName: "",
      email: "",
      phone: "",
      address: "",
      isTempo: true,
      paymentTermDays: 14
    })
    setEditingVendor(null)
  }

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setFormData({
      companyName: vendor.companyName,
      picName: vendor.picName,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      isTempo: vendor.isTempo !== false,
      paymentTermDays: vendor.paymentTermDays ?? 14
    })
    setIsOpen(true)
  }
  ```

- [ ] **Step 4: Update `handleSave` to save fields**
  Save payment fields (forcing `paymentTermDays` to 0 if not tempo):
  ```typescript
  const handleSave = () => {
    if (!formData.companyName || !formData.picName) {
      toast.error("Company name and PIC are required")
      return
    }

    const payload = {
      ...formData,
      paymentTermDays: formData.isTempo ? formData.paymentTermDays : 0
    }

    if (editingVendor) {
      updateVendor(editingVendor.id, payload)
      toast.success("Vendor updated successfully")
    } else {
      addVendor({
        id: uuidv4(),
        ...payload,
        createdAt: new Date().toISOString()
      })
      toast.success("Vendor added successfully")
    }
    
    setIsOpen(false)
    resetForm()
  }
  ```

- [ ] **Step 5: Add form inputs to the Dialog**
  Add the Checkbox for `isTempo` and numeric input for `paymentTermDays` under the address input in the Dialog component:
  ```tsx
  <div className="flex items-center gap-2 py-2">
    <Checkbox 
      id="isTempo" 
      checked={formData.isTempo} 
      onCheckedChange={(checked) => setFormData({...formData, isTempo: !!checked})}
    />
    <Label htmlFor="isTempo">Pembayaran Tempo</Label>
  </div>
  {formData.isTempo && (
    <div className="grid gap-2">
      <Label htmlFor="paymentTermDays">Jatuh Tempo (Hari)</Label>
      <Input 
        id="paymentTermDays" 
        type="number"
        value={formData.paymentTermDays}
        onChange={(e) => setFormData({...formData, paymentTermDays: parseInt(e.target.value) || 0})}
        placeholder="14" 
      />
    </div>
  )}
  ```

- [ ] **Step 6: Add column to the Table**
  Add `<TableHead>Metode Pembayaran</TableHead>` before `<TableHead className="w-[80px]">Actions</TableHead>`.
  Add the corresponding cell value:
  ```tsx
  <TableCell className="text-sm">
    {v.isTempo ? (
      <span className="text-blue-600 font-semibold">Tempo ({v.paymentTermDays || 14} hari)</span>
    ) : (
      <span className="text-emerald-600 font-semibold">Cash Langsung</span>
    )}
  </TableCell>
  ```

- [ ] **Step 7: Run build check to verify correctness**
  Run: `npm run build`
  Expected: Builds successfully with no TypeScript compilation errors.
