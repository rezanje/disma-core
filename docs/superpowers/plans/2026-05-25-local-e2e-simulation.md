# E2E Local Flow Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat dan menjalankan skrip `scripts/e2e-local-simulation.js` untuk melakukan simulasi transaksi PO hingga Pembayaran di database lokal secara aman.

**Architecture:** Skrip Node.js mandiri yang menggunakan `@supabase/supabase-js` dan `.env.local` (local credentials) untuk memproses state bisnis step-by-step dan memvalidasi double-entry bookkeeping (jurnal umum).

**Tech Stack:** Node.js, Supabase JS SDK, dotenv.

---

### Task 1: Inisialisasi Skrip & Koneksi DB

**Files:**
- Create: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Buat file dengan inisialisasi basic**

```javascript
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL,
  process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL
);

const log = (...a) => console.log(...a);

async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  const { data, error } = await sb.from('bank_accounts').select('count');
  if (error) throw error;
  log("Koneksi DB lokal sukses!");
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Jalankan skrip awal**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Koneksi DB lokal sukses!"

---

### Task 2: Setup Klien & Bank Uji

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi fungsi check-and-insert Klien & Bank**

```javascript
// Tambahkan fungsi di atas main()
async function setupMasterData() {
  log("\n--- SETUP MASTER DATA ---");
  // 1. Klien PT TES PAK REZA
  const clientId = 'client-pt-tes-pak-reza';
  const { data: existingClient } = await sb.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!existingClient) {
    log("Klien PT TES PAK REZA tidak ada. Membuat baru...");
    await sb.from('clients').insert({
      id: clientId,
      company_name: "PT TES PAK REZA",
      pic_name: "Pak Reza",
      email: "reza@test.com",
      phone: "08123456789",
      address: "Kantor Pusat Reza",
      payment_term_days: 30,
      created_at: new Date().toISOString()
    });
  } else {
    log("Klien PT TES PAK REZA sudah ada.");
  }

  // 2. Bank Accounts
  const requiredBanks = [
    { id: 'bank-bca', name: 'BCA', account_code: '1-1200', balance: 1000000000 },
    { id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', account_code: '1-1500', balance: 0 }
  ];

  for (const rb of requiredBanks) {
    const { data: existingBank } = await sb.from('bank_accounts').select('id').eq('id', rb.id).maybeSingle();
    if (!existingBank) {
      log(`Bank account ${rb.name} tidak ada. Membuat baru...`);
      await sb.from('bank_accounts').insert(rb);
    }
  }
}
```

- [ ] **Step 2: Update main() untuk memanggil setupMasterData()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  log("Setup Master Data Selesai!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Setup Master Data Selesai!"

---

### Task 3: Simulasi Pembuatan & Approval PO (Sales Orders)

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi alur pembuatan SO & Purchase**

```javascript
// Tambahkan helper journal & cash_tx dari scripts/e2e-full-flow.js ke file
const HPP = '5-1000';
const ADVANCE_COA = '1-1500';
const SOURCING_HILMAN_BANK = 'bank-advance-sourcing';
const BCA = 'bank-bca';
const { randomUUID } = require('crypto');

let _coas, _banks;

async function loadMasters() {
  _coas = (await sb.from('coas').select('*')).data;
  _banks = (await sb.from('bank_accounts').select('*')).data;
}

const coaIdByCode = (code) => _coas.find((c) => c.account_code === code)?.id;
const bankById = (id) => _banks.find((b) => b.id === id);

async function postJournal(description, refType, refId, debits, credits, date) {
  const totalD = debits.reduce((s, d) => s + Number(d.amount), 0);
  const totalC = credits.reduce((s, c) => s + Number(c.amount), 0);
  if (Math.abs(totalD - totalC) > 0.01) {
    throw new Error(`Journal unbalanced: D ${totalD} vs C ${totalC} (${description})`);
  }
  const entryId = randomUUID();
  await sb.from('journal_entries').insert({
    id: entryId,
    transaction_date: date || new Date().toISOString(),
    description,
    reference_type: refType,
    reference_id: refId,
  });
  const lines = [];
  for (const d of debits) {
    const accountId = coaIdByCode(d.accountCode);
    if (!accountId) throw new Error(`COA not found ${d.accountCode}`);
    lines.push({ id: randomUUID(), journal_entry_id: entryId, account_id: accountId, debit_amount: d.amount, credit_amount: 0 });
  }
  for (const c of credits) {
    const accountId = coaIdByCode(c.accountCode);
    if (!accountId) throw new Error(`COA not found ${c.accountCode}`);
    lines.push({ id: randomUUID(), journal_entry_id: entryId, account_id: accountId, debit_amount: 0, credit_amount: c.amount });
  }
  const { error } = await sb.from('journal_lines').insert(lines);
  if (error) throw error;
  return entryId;
}

async function addCashTx(tx) {
  const id = tx.id || randomUUID();
  await sb.from('cash_transactions').insert({
    id,
    date: tx.date || new Date().toISOString(),
    type: tx.type,
    amount: tx.amount,
    bank_account_id: tx.bankAccountId,
    category: tx.category,
    description: tx.description,
    reference_type: tx.referenceType || null,
    reference_id: tx.referenceId || null,
    counterpart_name: tx.counterpartName || null,
  });
  // Update local memory & db bank balance
  const bank = bankById(tx.bankAccountId);
  const newBal = (Number(bank.balance) || 0) + (tx.type === 'In' ? tx.amount : -tx.amount);
  bank.balance = newBal;
  await sb.from('bank_accounts').update({ balance: newBal }).eq('id', tx.bankAccountId);
}

// Global state untuk menyimpan ID transaksi
let _soIds = [];
let _purchaseIds = [];
let _productsList = [];

async function simulatePOs() {
  log("\n--- SIMULASI PO & PROCUREMENT ---");
  // 1. Dapatkan produk acak
  const { data: prods } = await sb.from('products').select('*').limit(3);
  _productsList = prods;
  
  const clientId = 'client-pt-tes-pak-reza';
  const timestamp = Date.now();

  // Buat 2 Sales Orders
  for (let i = 0; i < 2; i++) {
    const soId = 'so-reza-' + timestamp + '-' + i;
    const poNumber = `PO-E2E-REZA-${timestamp}-${i + 1}`;
    
    await sb.from('sales_orders').insert({
      id: soId,
      po_number: poNumber,
      client_id: clientId,
      order_date: new Date().toISOString(),
      target_delivery_date: new Date(Date.now() + 3 * 86400e3).toISOString(),
      status: 'Pending Approval',
    });

    const items = _productsList.map((p, idx) => ({
      id: `soi-reza-${timestamp}-${i}-${idx}`,
      sales_order_id: soId,
      product_id: p.id,
      qty: 10 + idx,
      unit_price: Number(p.selling_price) || 20000,
      subtotal: (10 + idx) * (Number(p.selling_price) || 20000)
    }));
    await sb.from('sales_order_items').insert(items);
    _soIds.push(soId);
    log(`  SO ${poNumber} dibuat.`);

    // Approve PO & buat Purchase
    await sb.from('sales_orders').update({ status: 'Belanja' }).eq('id', soId);
    const purchaseId = 'pur-reza-' + timestamp + '-' + i;
    await sb.from('purchases').insert({
      id: purchaseId,
      date: new Date().toISOString(),
      purchaser_id: '11111111-1111-1111-1111-111111111111', // Bagus
      status: 'Pending'
    });

    const purchaseItems = items.map((soi, idx) => ({
      id: `pi-reza-${timestamp}-${i}-${idx}`,
      purchase_id: purchaseId,
      product_id: soi.product_id,
      sales_order_id: soId,
      qty_target: soi.qty,
      qty_purchased: 0,
      estimated_unit_price: soi.unit_price * 0.8, // HPP estimasi 80% dari harga jual
      actual_unit_price: 0,
      is_checked: false,
      purchase_method: 'Pasar'
    }));
    await sb.from('purchase_items').insert(purchaseItems);
    _purchaseIds.push(purchaseId);
    log(`  Purchase ${purchaseId} dibuat (Belanja Pasar).`);
  }
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  log("Simulasi PO sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Simulasi PO sukses!"

---

### Task 4: Pencairan Budget Sourcing

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi pencairanPO()**

```javascript
async function pencairanPO() {
  log("\n--- PENCAIRAN BUDGET SOURCING ---");
  for (const pId of _purchaseIds) {
    const items = (await sb.from('purchase_items').select('*').eq('purchase_id', pId)).data;
    const targetSpend = items.reduce((s, it) => s + Number(it.qty_target) * Number(it.estimated_unit_price), 0);
    const opsSpare = 50000;
    const budgetAmount = targetSpend + opsSpare;

    await sb.from('purchases').update({
      budget_amount: budgetAmount,
      budget_transfer_date: new Date().toISOString(),
      budget_transfered_by: '55555555-5555-5555-5555-555555555555', // Sifa
      budget_bank_account_id: BCA,
      operational_spare_amount: opsSpare,
      reconciliation_status: 'Dana Ditransfer'
    }).eq('id', pId);

    // Jurnal Uang Muka
    await postJournal(
      `Pencairan Advance Sourcing - Ref: ${pId}`,
      'Transfer',
      pId,
      [{ accountCode: ADVANCE_COA, amount: budgetAmount }],
      [{ accountCode: '1-1200', amount: budgetAmount }]
    );

    // Cash Out BCA
    await addCashTx({
      amount: budgetAmount,
      type: 'Out',
      bankAccountId: BCA,
      category: 'Transfer Uang Muka Sourcing',
      description: `Advance Sourcing Hilman - Ref: ${pId}`
    });

    // Cash In Kas Sourcing
    await addCashTx({
      amount: budgetAmount,
      type: 'In',
      bankAccountId: SOURCING_HILMAN_BANK,
      category: 'Transfer Uang Muka Sourcing',
      description: `Advance Sourcing Hilman - Ref: ${pId}`
    });

    log(`  Dana Sourcing disalurkan Rp${budgetAmount.toLocaleString()} ke Kas Sourcing.`);
  }
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  log("Pencairan sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Pencairan sukses!"

---

### Task 5: Settlement Offline

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi settlementOffline()**

```javascript
async function settlementOffline() {
  log("\n--- SETTLEMENT OFFLINE (REKONSILIASI) ---");
  for (const pId of _purchaseIds) {
    const items = (await sb.from('purchase_items').select('*').eq('purchase_id', pId)).data;
    const purchase = (await sb.from('purchases').select('*').eq('id', pId).single()).data;
    const advanceAmount = Number(purchase.budget_amount) || 0;

    const actualShopCost = Math.round(items.reduce((s, it) => s + Number(it.qty_target) * Number(it.estimated_unit_price), 0) * 0.95);
    const actualOpsCost = Math.round(Number(purchase.operational_spare_amount) * 0.8);

    // Jurnal HPP
    await postJournal(
      `Penyelesaian Belanja Offline - Ref: ${pId}`,
      'Purchase',
      pId,
      [{ accountCode: HPP, amount: actualShopCost }],
      [{ accountCode: ADVANCE_COA, amount: Math.min(actualShopCost, advanceAmount) }]
    );
    await addCashTx({
      amount: Math.min(actualShopCost, advanceAmount),
      type: 'Out',
      bankAccountId: SOURCING_HILMAN_BANK,
      category: 'Sourcing (HPP)',
      description: `Belanja Pasar disetujui - Ref: ${pId}`,
      referenceType: 'Purchase',
      referenceId: pId
    });

    // Jurnal Ops
    const remainingAdvance = Math.max(0, advanceAmount - actualShopCost);
    const opsFromAdvance = Math.min(actualOpsCost, remainingAdvance);
    if (opsFromAdvance > 0) {
      await postJournal(
        `Biaya Operasional Sourcing - Ref: ${pId}`,
        'Expense',
        pId,
        [{ accountCode: '6-1400', amount: opsFromAdvance }],
        [{ accountCode: ADVANCE_COA, amount: opsFromAdvance }]
      );
      await addCashTx({
        amount: opsFromAdvance,
        type: 'Out',
        bankAccountId: SOURCING_HILMAN_BANK,
        category: 'Operasional',
        description: `Beban Transportasi - Ref: ${pId}`,
        referenceType: 'Expense',
        referenceId: pId
      });
    }

    // Balikkan sisa
    const totalUsed = Math.min(actualShopCost, advanceAmount) + opsFromAdvance;
    const change = advanceAmount - totalUsed;
    if (change > 0) {
      await postJournal(
        `Pengembalian Sisa Uang Muka - Ref: ${pId}`,
        'Transfer',
        pId,
        [{ accountCode: '1-1200', amount: change }],
        [{ accountCode: ADVANCE_COA, amount: change }]
      );
      await addCashTx({
        amount: change,
        type: 'Out',
        bankAccountId: SOURCING_HILMAN_BANK,
        category: 'Setoran Pengembalian',
        description: `Pengembalian Sisa - Ref: ${pId}`,
        referenceType: 'Transfer',
        referenceId: pId
      });
      await addCashTx({
        amount: change,
        type: 'In',
        bankAccountId: BCA,
        category: 'Setoran Pengembalian',
        description: `Terima Pengembalian - Ref: ${pId}`,
        referenceType: 'Transfer',
        referenceId: pId
      });
    }

    await sb.from('purchases').update({
      reconciliation_status: 'Terverifikasi',
      actual_spent: actualShopCost,
      change_returned: change,
      status: 'Completed'
    }).eq('id', pId);

    // Update purchase_items
    for (const it of items) {
      await sb.from('purchase_items').update({
        is_checked: true,
        is_qced: true,
        qty_purchased: it.qty_target,
        actual_unit_price: it.estimated_unit_price * 0.95
      }).eq('id', it.id);
    }
    log(`  Settlement Offline Selesai: HPP=Rp${actualShopCost.toLocaleString()}, Sisa=Rp${change.toLocaleString()}`);
  }
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  log("Settlement sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Settlement sukses!"

---

### Task 6: QC Reject & Delivery / Invoice Draft

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi qcAndDelivery()**

```javascript
let _deliveriesList = [];

async function qcAndDelivery() {
  log("\n--- QC, DELIVERY & INVOICE DRAFT ---");
  const timestamp = Date.now();
  
  for (let i = 0; i < _soIds.length; i++) {
    const soId = _soIds[i];
    
    // Tarik items
    const { data: items } = await sb.from('sales_order_items').select('*').eq('sales_order_id', soId);

    // Simulasi QC Reject pada SO ke-2 item ke-1
    if (i === 1) {
      const targetItem = items[0];
      const qtyFinal = Math.max(1, Number(targetItem.qty) - 3); // Kurangi 3 pcs reject
      await sb.from('sales_order_items').update({
        qty_final: qtyFinal,
        subtotal_final: qtyFinal * Number(targetItem.unit_price),
        qty_adjustment_reason: 'QC Reject: rusak'
      }).eq('id', targetItem.id);

      await sb.from('pending_returns').insert({
        id: `ret-reza-${timestamp}-${i}`,
        product_id: targetItem.product_id,
        original_so_id: soId,
        qty: Number(targetItem.qty) - qtyFinal,
        reason: 'QC Reject: rusak',
        date: new Date().toISOString(),
        status: 'Pending QC'
      });
      log(`  SO-2: QC Reject 3pcs dicatat.`);
    }

    // Refresh items to calculate actual revenue
    const { data: updatedItems } = await sb.from('sales_order_items').select('*').eq('sales_order_id', soId);
    const totalRevenue = updatedItems.reduce((s, it) => s + Number(it.qty_final ?? it.qty) * Number(it.unit_price), 0);

    // Update SO status
    await sb.from('sales_orders').update({
      status: 'Awaiting Audit',
      handover_date: new Date().toISOString()
    }).eq('id', soId);

    // Buat Delivery & Invoice Draft
    const deliveryId = `del-reza-${timestamp}-${i}`;
    const invoiceId = `inv-reza-${timestamp}-${i}`;
    
    await sb.from('deliveries').insert({
      id: deliveryId,
      sales_order_id: soId,
      courier_id: '44444444-4444-4444-4444-444444444444', // Rivai
      status: 'Awaiting Audit',
      delivery_date: new Date().toISOString(),
      invoice_id: invoiceId
    });

    await sb.from('invoices').insert({
      id: invoiceId,
      sales_order_id: soId,
      client_id: 'client-pt-tes-pak-reza',
      issue_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 30 * 86400e3).toISOString(),
      total_amount: totalRevenue,
      amount_paid: 0,
      status: 'Unpaid'
    });

    _deliveriesList.push({
      soId,
      deliveryId,
      invoiceId,
      totalAmount: totalRevenue
    });
    log(`  Delivery & Invoice Draft ${invoiceId} (Rp${totalRevenue.toLocaleString()}) dibuat.`);
  }
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  await qcAndDelivery();
  log("QC & Delivery sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "QC & Delivery sukses!"

---

### Task 7: Audit Finance & Posting AR (Piutang)

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi auditAndPostAR()**

```javascript
async function auditAndPostAR() {
  log("\n--- AUDIT FINANCE & POSTING AR ---");
  for (const d of _deliveriesList) {
    // Jurnal AR: D Piutang (1-2000) / C Pendapatan (4-1000)
    await postJournal(
      `Invoice Terbit - Ref: ${d.invoiceId}`,
      'Invoice',
      d.invoiceId,
      [{ accountCode: '1-2000', amount: d.totalAmount }],
      [{ accountCode: '4-1000', amount: d.totalAmount }]
    );

    // Update SO & Delivery status
    await sb.from('sales_orders').update({ status: 'Terkirim' }).eq('id', d.soId);
    await sb.from('deliveries').update({ status: 'Terkirim' }).eq('id', d.deliveryId);
    log(`  Invoice ${d.invoiceId} di-audit dan jurnal AR diposting.`);
  }
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  await qcAndDelivery();
  await auditAndPostAR();
  log("Audit sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Audit sukses!"

---

### Task 8: Konsolidasi Invoice (Tukar Faktur)

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi consolidateInvoices()**

```javascript
let _consolidatedInvoiceId;
let _consolidatedTotal = 0;

async function consolidateInvoices() {
  log("\n--- KONSOLIDASI INVOICE (TUKAR FAKTUR) ---");
  const timestamp = Date.now();
  _consolidatedInvoiceId = `inv-consol-reza-${timestamp}`;
  _consolidatedTotal = _deliveriesList.reduce((s, d) => s + d.totalAmount, 0);

  // Tarik nomor PO untuk audit info
  const { data: sos } = await sb.from('sales_orders').select('po_number').in('id', _deliveriesList.map(d => d.soId));
  const poNumbers = sos.map(s => s.po_number);

  await sb.from('invoices').insert({
    id: _consolidatedInvoiceId,
    sales_order_ids: _deliveriesList.map(d => d.soId),
    is_consolidated: true,
    consolidated_order_numbers: poNumbers,
    client_id: 'client-pt-tes-pak-reza',
    issue_date: new Date().toISOString(),
    due_date: new Date(Date.now() + 30 * 86400e3).toISOString(),
    total_amount: _consolidatedTotal,
    amount_paid: 0,
    status: 'Unpaid'
  });

  log(`  Invoice Konsolidasi ${_consolidatedInvoiceId} dibuat dengan total Rp${_consolidatedTotal.toLocaleString()}.`);
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  await qcAndDelivery();
  await auditAndPostAR();
  await consolidateInvoices();
  log("Konsolidasi sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Konsolidasi sukses!"

---

### Task 9: Simulasi Pembayaran

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi recordPayments()**

```javascript
async function recordPayments() {
  log("\n--- RECORD PAYMENTS ---");
  
  // Bayar Lunas Invoice Konsolidasi
  await postJournal(
    `Pembayaran Invoice Konsolidasi - Ref: ${_consolidatedInvoiceId}`,
    'Payment',
    _consolidatedInvoiceId,
    [{ accountCode: '1-1200', amount: _consolidatedTotal }],
    [{ accountCode: '1-2000', amount: _consolidatedTotal }]
  );

  await addCashTx({
    amount: _consolidatedTotal,
    type: 'In',
    bankAccountId: BCA,
    category: 'Sales',
    description: `Pelunasan Invoice Konsolidasi PT TES PAK REZA - Ref: ${_consolidatedInvoiceId}`,
    referenceType: 'Payment',
    referenceId: _consolidatedInvoiceId
  });

  await sb.from('invoices').update({
    amount_paid: _consolidatedTotal,
    status: 'Paid',
    paid_date: new Date().toISOString(),
    payments: [{
      id: randomUUID(),
      date: new Date().toISOString(),
      amount: _consolidatedTotal,
      method: 'Transfer Bank',
      note: 'Lunas E2E Reza'
    }]
  }).eq('id', _consolidatedInvoiceId);

  log(`  Pembayaran Lunas untuk ${_consolidatedInvoiceId} sebesar Rp${_consolidatedTotal.toLocaleString()} berhasil dicatat.`);
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  await qcAndDelivery();
  await auditAndPostAR();
  await consolidateInvoices();
  await recordPayments();
  log("Pembayaran sukses!");
}
```

- [ ] **Step 3: Jalankan dan verifikasi**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Output "Pembayaran sukses!"

---

### Task 10: Audit Laporan Akuntansi Akhir

**Files:**
- Modify: `scripts/e2e-local-simulation.js`

- [ ] **Step 1: Implementasi auditAccounting()**

```javascript
async function auditAccounting() {
  log("\n--- AUDIT AKUNTANSI AKHIR (SIMULASI ONLY) ---");
  // Tarik semua journal lines khusus untuk reference_id yang kita buat
  const refIds = [..._soIds, ..._purchaseIds, ..._deliveriesList.map(d => d.invoiceId), _consolidatedInvoiceId];
  
  const { data: lines } = await sb.from('journal_lines').select('*, journal_entries!inner(reference_id)').in('journal_entries.reference_id', refIds);
  
  let totalDebit = 0;
  let totalCredit = 0;

  for (const l of lines) {
    totalDebit += Number(l.debit_amount);
    totalCredit += Number(l.credit_amount);
  }

  log(`  Total Jurnal Terkait Simulasi: ${lines.length} Baris`);
  log(`  Total Debit : Rp${totalDebit.toLocaleString()}`);
  log(`  Total Kredit: Rp${totalCredit.toLocaleString()}`);
  log(`  Balance     : ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'YA ✓' : 'TIDAK ✗'}`);

  // Cek saldo bank
  const { data: updatedBca } = await sb.from('bank_accounts').select('balance').eq('id', BCA).single();
  log(`  Saldo Akhir Bank BCA Lokal: Rp${Number(updatedBca.balance).toLocaleString()}`);
  
  log("\n=== E2E LOCAL SIMULATION COMPLETE ===");
}
```

- [ ] **Step 2: Update main()**

```javascript
async function main() {
  log("=== E2E LOCAL SIMULATION START ===");
  await setupMasterData();
  await loadMasters();
  await simulatePOs();
  await pencairanPO();
  await settlementOffline();
  await qcAndDelivery();
  await auditAndPostAR();
  await consolidateInvoices();
  await recordPayments();
  await auditAccounting();
}
```

- [ ] **Step 3: Jalankan final run**

Run: `NODE_PATH="./node_modules" node scripts/e2e-local-simulation.js`
Expected: Seluruh alur selesai dengan status Jurnal "Balance : YA ✓"
