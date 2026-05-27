const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 1. Load current DB state from safety lock backup
const BACKUP_FILE_PATH = path.join(__dirname, '..', 'data', 'safety_lock_backup.json');
if (!fs.existsSync(BACKUP_FILE_PATH)) {
  console.error("Error: safety_lock_backup.json not found. Run backup/lock script first.");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(BACKUP_FILE_PATH, 'utf8'));

console.log("====================================================");
console.log("      SIMULASI ALUR MULTI-PO DENGAN FAST TRACK      ");
console.log("====================================================\n");

// 2. Select a Client and Products for our simulation
const client = db.clients.find(c => c.company_name) || db.clients[0];
const products = db.products.filter(p => p.base_price > 0).slice(0, 3).map(p => {
  const base = Number(p.base_price || 10000);
  const sell = Number(p.selling_price || 0) > 0 ? Number(p.selling_price) : Math.round(base * 1.35);
  return {
    ...p,
    base_price: base,
    selling_price: sell
  };
});

if (products.length < 3) {
  console.error("Error: Need at least 3 products with base_price > 0.");
  process.exit(1);
}

console.log(`Klien Terpilih: ${client.company_name} (ID: ${client.id})`);
console.log("Produk Terpilih:");
products.forEach((p, i) => console.log(`  ${i+1}. ${p.name} (SKU: ${p.sku_code}, Base Price: Rp ${p.base_price.toLocaleString('id-ID')}, Sell Price: Rp ${p.selling_price.toLocaleString('id-ID')})`));
console.log("\n");

// Initialize Mock Database State (in snake_case to match Supabase schema)
const state = {
  salesOrders: [...db.sales_orders],
  salesOrderItems: [...db.sales_order_items],
  purchases: [...db.purchases],
  purchaseItems: [...db.purchase_items],
  deliveries: [...db.deliveries],
  invoices: [...db.invoices],
  journalEntries: [...db.journal_entries],
  journalLines: [...db.journal_lines],
  stockMovements: [...db.stock_movements]
};

// Keep track of the initial totals for comparison
const initialAR = getAccountBalance('1-2000');
const initialInventory = getAccountBalance('1-3000');
const initialRevenue = getAccountBalance('4-1000');
const initialCOGS = getAccountBalance('5-1000');
const initialBCA = getAccountBalance('1-1200');

function getAccountBalance(accountCode) {
  const coa = db.coas.find(c => c.account_code === accountCode);
  if (!coa) return 0;
  
  let balance = 0;
  state.journalLines.forEach(line => {
    if (line.account_id === coa.id) {
      balance += Number(line.debit_amount || 0) - Number(line.credit_amount || 0);
    }
  });
  return balance;
}

// 3. Define 3 simulated POs
const poScenarios = [
  {
    poNumber: 'PO-SIM-001',
    items: [
      { productId: products[0].id, qty: 10, unitPrice: products[0].selling_price, customHpp: products[0].base_price * 0.9 },
      { productId: products[1].id, qty: 20, unitPrice: products[1].selling_price, customHpp: products[1].base_price * 0.85 }
    ]
  },
  {
    poNumber: 'PO-SIM-002',
    items: [
      { productId: products[2].id, qty: 50, unitPrice: products[2].selling_price, customHpp: products[2].base_price * 0.8 }
    ]
  },
  {
    poNumber: 'PO-SIM-003',
    items: [
      { productId: products[0].id, qty: 5, unitPrice: products[0].selling_price, customHpp: products[0].base_price * 0.95 },
      { productId: products[1].id, qty: 15, unitPrice: products[1].selling_price, customHpp: products[1].base_price * 0.9 },
      { productId: products[2].id, qty: 30, unitPrice: products[2].selling_price, customHpp: products[2].base_price * 0.85 }
    ]
  }
];

// Helper to simulate createAccountingEntry
async function createAccountingEntry(description, referenceType, referenceId, debits, credits, date = new Date().toISOString()) {
  const entryId = uuidv4();
  
  // Create Journal Entry
  state.journalEntries.push({
    id: entryId,
    description,
    reference_type: referenceType,
    reference_id: referenceId,
    transaction_date: date,
    posted: true
  });
  
  // Create Journal Lines
  debits.forEach(debitItem => {
    const coa = db.coas.find(c => c.account_code === debitItem.accountCode);
    if (!coa) {
      console.error(`Error: COA with code ${debitItem.accountCode} not found!`);
      return;
    }
    state.journalLines.push({
      id: uuidv4(),
      journal_entry_id: entryId,
      account_id: coa.id,
      debit_amount: debitItem.amount,
      credit_amount: 0
    });
  });

  credits.forEach(creditItem => {
    const coa = db.coas.find(c => c.account_code === creditItem.accountCode);
    if (!coa) {
      console.error(`Error: COA with code ${creditItem.accountCode} not found!`);
      return;
    }
    state.journalLines.push({
      id: uuidv4(),
      journal_entry_id: entryId,
      account_id: coa.id,
      debit_amount: 0,
      credit_amount: creditItem.amount
    });
  });
  
  return true;
}

// Simulated fast-track submission logic matching handleConfirmFastTrack
function runFastTrackSubmission(scenario) {
  const soId = uuidv4();
  const purchaseId = uuidv4();
  const deliveryId = uuidv4();
  const invoiceId = uuidv4();
  
  // 1. Create SalesOrder
  const salesOrder = {
    id: soId,
    po_number: scenario.poNumber,
    client_id: client.id,
    order_date: new Date().toISOString(),
    status: 'Awaiting Audit'
  };
  state.salesOrders.push(salesOrder);
  
  // 2. Create SalesOrderItems
  const soItems = scenario.items.map(item => {
    const soItem = {
      id: uuidv4(),
      sales_order_id: soId,
      product_id: item.productId,
      qty: item.qty,
      qty_final: item.qty,
      unit_price: item.unitPrice,
      subtotal: item.qty * item.unitPrice,
      subtotal_final: item.qty * item.unitPrice
    };
    state.salesOrderItems.push(soItem);
    return soItem;
  });

  // 3. Create mock Purchase and PurchaseItems (with custom HPP)
  const newPurchaseItems = scenario.items.map((item, idx) => {
    const soItem = soItems[idx];
    return {
      id: uuidv4(),
      purchase_id: purchaseId,
      product_id: item.productId,
      sales_order_id: soId,
      qty_target: item.qty,
      qty_purchased: item.qty,
      estimated_unit_price: products.find(p => p.id === item.productId).base_price || 0,
      actual_unit_price: item.customHpp,
      is_checked: true,
      is_qc_ed: true,
      purchase_method: 'Pasar'
    };
  });
  state.purchaseItems.push(...newPurchaseItems);

  const newPurchase = {
    id: purchaseId,
    date: new Date().toISOString(),
    purchaser_id: 'admin',
    status: 'Selesai',
    actual_spent: newPurchaseItems.reduce((sum, pi) => sum + (pi.qty_purchased * pi.actual_unit_price), 0),
    reconciliation_status: 'Terverifikasi',
    reconciliation_note: `Bypass fast-track untuk PO ${scenario.poNumber}`
  };
  state.purchases.push(newPurchase);

  // 4. Create Delivery
  const delivery = {
    id: deliveryId,
    sales_order_id: soId,
    courier_id: 'admin',
    status: 'Awaiting Audit',
    delivery_date: new Date().toISOString(),
    invoice_id: invoiceId,
    notes: 'Fast-track bypass dengan HPP kustom'
  };
  state.deliveries.push(delivery);

  // 5. Create Invoice
  const totalRevenue = soItems.reduce((sum, item) => sum + item.subtotal_final, 0);
  const invoice = {
    id: invoiceId,
    sales_order_id: soId,
    client_id: client.id,
    issue_date: new Date().toISOString(),
    total_amount: totalRevenue,
    amount_paid: 0,
    status: 'Unpaid'
  };
  state.invoices.push(invoice);

  console.log(`[SUBMIT] PO ${scenario.poNumber} Fast-Tracked! Total Nilai: Rp ${totalRevenue.toLocaleString('id-ID')}`);
  return { soId, deliveryId, invoiceId };
}

// Simulated Finance audit approval matching handleApproveDelivery & recordDeliveryAndInvoice
async function runFinanceAuditApproval(soId, deliveryId, invoiceId) {
  const so = state.salesOrders.find(s => s.id === soId);
  const delivery = state.deliveries.find(d => d.id === deliveryId);
  const invoice = state.invoices.find(i => i.id === invoiceId);
  const soItems = state.salesOrderItems.filter(i => i.sales_order_id === soId);
  
  const totalRevenue = soItems.reduce((sum, item) => sum + item.subtotal_final, 0);
  
  // COGS Calculation prioritizing matching sales_order_id
  let totalCogs = 0;
  const stockDeductionItems = [];
  
  soItems.forEach(item => {
    const finalQty = item.qty_final ?? item.qty;
    // Cari purchase item kustom hasil fast track untuk SO ini dahulu
    let pItem = state.purchaseItems.find(pi => pi.sales_order_id === soId && pi.product_id === item.product_id && pi.actual_unit_price > 0);
    if (!pItem) {
      pItem = state.purchaseItems.filter(pi => pi.product_id === item.product_id && pi.actual_unit_price > 0).pop();
    }
    const unitCogs = pItem ? pItem.actual_unit_price : (products.find(p => p.id === item.product_id).base_price || 0);
    totalCogs += (unitCogs * finalQty);
    stockDeductionItems.push({ productId: item.product_id, qty: finalQty });
  });

  // 1. Record Revenue (Invoice Terbit)
  const revSuccess = await createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: totalRevenue }], // Debit Piutang Usaha
    [{ accountCode: '4-1000', amount: totalRevenue }]  // Credit Pendapatan Penjualan
  );

  // 2. Record HPP/COGS for Fast Track (since procurement/sourcing was bypassed)
  const isFastTrack = delivery.notes.toLowerCase().includes('fast-track');
  if (revSuccess && isFastTrack && totalCogs > 0) {
    await createAccountingEntry(
      `Pengakuan HPP Fast-Track - Ref: ${invoiceId}`,
      'Invoice',
      invoiceId,
      [{ accountCode: '5-1000', amount: totalCogs }], // Debit HPP
      [{ accountCode: '1-3000', amount: totalCogs }]  // Credit Persediaan Barang Dagang
    );
  }

  // 3. Stock Movements (Inventory Deduction)
  if (revSuccess) {
    stockDeductionItems.forEach(item => {
      state.stockMovements.push({
        id: uuidv4(),
        date: new Date().toISOString(),
        product_id: item.productId,
        stock_delta: -item.qty,
        kind: 'DELIVERY_OUTBOUND',
        reference_type: 'Delivery',
        reference_id: deliveryId
      });
      
      // Update local product stock
      const p = products.find(prod => prod.id === item.productId);
      if (p) {
        p.current_stock = (p.current_stock || 0) - item.qty;
      }
    });
  }

  // 4. Update Statuses
  so.status = 'Terkirim';
  delivery.status = 'Terkirim';
  
  console.log(`[AUDIT] PO ${so.po_number} Disetujui! HPP Aktual: Rp ${totalCogs.toLocaleString('id-ID')} (Margin: ${((totalRevenue - totalCogs) / totalRevenue * 100).toFixed(1)}%)`);
}

// Simulated payment recording matching recordPaymentReceived
async function runPaymentReceived(invoiceId, paymentAmount, bankAccountId = 'bank-1') {
  const invoice = state.invoices.find(i => i.id === invoiceId);
  const so = state.salesOrders.find(s => s.id === invoice.sales_order_id);
  
  const bank = db.bank_accounts.find(b => b.id === bankAccountId) || { account_code: '1-1200' };
  const bankCoaCode = bank.account_code;
  
  const success = await createAccountingEntry(
    `Pembayaran Invoice - Ref: ${invoiceId}`,
    'Payment',
    invoiceId,
    [{ accountCode: bankCoaCode, amount: paymentAmount }], // Debit Bank BCA
    [{ accountCode: '1-2000', amount: paymentAmount }]   // Credit Piutang Usaha
  );

  if (success) {
    invoice.amount_paid += paymentAmount;
    invoice.status = invoice.amount_paid >= invoice.total_amount ? 'Paid' : 'Partial';
    if (invoice.status === 'Paid') {
      so.status = 'Selesai';
    }
  }

  console.log(`[PAYMENT] Penerimaan Piutang PO ${so.po_number}: Rp ${paymentAmount.toLocaleString('id-ID')} via ${bankCoaCode} (${invoice.status})`);
}

async function runSimulation() {
  console.log("--- 1. MENJALANKAN SUBMISSION FAST TRACK ---");
  const sim1 = runFastTrackSubmission(poScenarios[0]);
  const sim2 = runFastTrackSubmission(poScenarios[1]);
  const sim3 = runFastTrackSubmission(poScenarios[2]);
  console.log("\n");

  console.log("--- 2. MENJALANKAN AUDIT & FINALISASI OLEH FINANCE ---");
  await runFinanceAuditApproval(sim1.soId, sim1.deliveryId, sim1.invoiceId);
  await runFinanceAuditApproval(sim2.soId, sim2.deliveryId, sim2.invoiceId);
  await runFinanceAuditApproval(sim3.soId, sim3.deliveryId, sim3.invoiceId);
  console.log("\n");

  console.log("--- 3. MENJALANKAN PENERIMAAN PEMBAYARAN INVOICE ---");
  // PO 1: Lunas 100%
  const inv1 = state.invoices.find(i => i.id === sim1.invoiceId);
  await runPaymentReceived(sim1.invoiceId, inv1.total_amount);

  // PO 2: Lunas 100%
  const inv2 = state.invoices.find(i => i.id === sim2.invoiceId);
  await runPaymentReceived(sim2.invoiceId, inv2.total_amount);

  // PO 3: Bayar 50% (Outstanding sisa)
  const inv3 = state.invoices.find(i => i.id === sim3.invoiceId);
  await runPaymentReceived(sim3.invoiceId, inv3.total_amount * 0.5);
  console.log("\n");

  console.log("====================================================");
  console.log("          VERIFIKASI & ANALISA KEUANGAN             ");
  console.log("====================================================\n");

  // Verify journal ledger balance
  let totalDebits = 0;
  let totalCredits = 0;
  state.journalLines.forEach(line => {
    totalDebits += Number(line.debit_amount || 0);
    totalCredits += Number(line.credit_amount || 0);
  });
  console.log(`Neraca Saldo Jurnal (Trial Balance):`);
  console.log(`  Total Debet   : Rp ${totalDebits.toLocaleString('id-ID')}`);
  console.log(`  Total Kredit  : Rp ${totalCredits.toLocaleString('id-ID')}`);
  
  if (Math.abs(totalDebits - totalCredits) < 0.01) {
    console.log("  ✅ BALANCED! Total Debet sama dengan Total Kredit.");
  } else {
    console.error("  ❌ UNBALANCED! Ada selisih pada pembukuan.");
  }
  console.log("\n");

  // Calculate changes in Accounts (with correct signs for debit/credit normal balance)
  const finalAR = getAccountBalance('1-2000');
  const finalInventory = getAccountBalance('1-3000');
  const finalRevenue = getAccountBalance('4-1000');
  const finalCOGS = getAccountBalance('5-1000');
  const finalBCA = getAccountBalance('1-1200');

  const deltaAR = finalAR - initialAR;
  const deltaInventory = finalInventory - initialInventory;
  const deltaRevenue = -(finalRevenue - initialRevenue); // Negate because revenue has credit normal balance
  const deltaCOGS = finalCOGS - initialCOGS; // Debit normal balance
  const deltaBCA = finalBCA - initialBCA; // Debit normal balance

  console.log("Perubahan Saldo Akun dari 3 PO Simulasi:");
  console.log(`  1. Piutang Usaha (1-2000)                : Rp ${deltaAR.toLocaleString('id-ID')} (Sisa Piutang Aktif)`);
  console.log(`  2. Persediaan Barang Dagang (1-3000)     : Rp ${deltaInventory.toLocaleString('id-ID')} (Pengurangan Nilai Stok)`);
  console.log(`  3. Kas & Bank BCA (1-1200)               : Rp ${deltaBCA.toLocaleString('id-ID')} (Kas Masuk Baru)`);
  console.log(`  4. Pendapatan Penjualan Produk (4-1000)  : Rp ${deltaRevenue.toLocaleString('id-ID')} (Omset Penjualan)`);
  console.log(`  5. Harga Pokok Penjualan HPP (5-1000)    : Rp ${deltaCOGS.toLocaleString('id-ID')} (Beban Pokok Penjualan)`);
  console.log("\n");

  // Verify financial reports synchronization
  const totalRevenueSim = poScenarios.reduce((sum, po) => sum + po.items.reduce((s, item) => s + (item.qty * item.unitPrice), 0), 0);
  const totalCogsSim = poScenarios.reduce((sum, po) => sum + po.items.reduce((s, item) => s + (item.qty * item.customHpp), 0), 0);
  const expectedProfit = totalRevenueSim - totalCogsSim;
  const actualProfit = deltaRevenue - deltaCOGS;
  const expectedAR = totalRevenueSim - (inv1.total_amount + inv2.total_amount + (inv3.total_amount * 0.5));

  console.log("Sinkronisasi Laporan Keuangan:");
  console.log(`  - Pendapatan Penjualan Produk Cocok   : ${deltaRevenue === totalRevenueSim ? '✅ YA' : '❌ TIDAK'}`);
  console.log(`  - Harga Pokok Penjualan (HPP) Cocok   : ${deltaCOGS === totalCogsSim ? '✅ YA' : '❌ TIDAK'}`);
  console.log(`  - Sisa Piutang Usaha (AR) Cocok       : ${deltaAR === expectedAR ? '✅ YA' : '❌ TIDAK'}`);
  console.log(`  - Kas Masuk di Bank BCA Cocok         : ${deltaBCA === (totalRevenueSim - expectedAR) ? '✅ YA' : '❌ TIDAK'}`);
  console.log(`  - Pengurangan Persediaan Cocok        : ${deltaInventory === -totalCogsSim ? '✅ YA' : '❌ TIDAK'}`);
  console.log(`  - Laba Kotor Simulasi                 : Rp ${actualProfit.toLocaleString('id-ID')} (Margin: ${(actualProfit / totalRevenueSim * 100).toFixed(1)}%)`);
  
  if (Math.abs(actualProfit - expectedProfit) < 0.01) {
    console.log("  ✅ SINKRON! Laba bersih di Laporan Laba Rugi sinkron dengan mutasi aset neraca.");
  } else {
    console.error("  ❌ KETIDAKSINGKRONAN dideteksi!");
  }
}

runSimulation();
