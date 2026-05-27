const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl || !dbKey) {
  console.error("Missing database URL or Key in .env.local");
  process.exit(1);
}

const supabase = createClient(dbUrl, dbKey);

const TARGET_CLIENT_ID = 'b72db4b6-980b-4af5-9178-4adc5be8bfee'; // PT Maju Bersama

async function main() {
  console.log("====================================================");
  console.log("    PUSHING SIMULASI MULTI-PO KE DATABASE SUPABASE  ");
  console.log("====================================================\n");

  // 1. Fetch products
  const { data: dbProducts, error: pError } = await supabase
    .from('products')
    .select('*')
    .gt('base_price', 0)
    .limit(3);

  if (pError || !dbProducts || dbProducts.length < 3) {
    console.error("Error loading products from Supabase:", pError || "Not enough products found.");
    process.exit(1);
  }

  const products = dbProducts.map(p => {
    const base = Number(p.base_price || 10000);
    const sell = Number(p.selling_price || 0) > 0 ? Number(p.selling_price) : Math.round(base * 1.35);
    return { ...p, base_price: base, selling_price: sell };
  });

  console.log(`Products used:`);
  products.forEach((p, idx) => console.log(`  ${idx+1}. ${p.name} - Base: ${p.base_price}, Sell: ${p.selling_price}`));

  // 2. Fetch target client to verify it exists
  const { data: client, error: cError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', TARGET_CLIENT_ID)
    .single();

  if (cError || !client) {
    console.error("Error loading client from Supabase:", cError || "Client not found");
    process.exit(1);
  }
  console.log(`Target client found: ${client.company_name}\n`);

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

  // Records to insert
  const salesOrders = [];
  const salesOrderItems = [];
  const purchases = [];
  const purchaseItems = [];
  const deliveries = [];
  const invoices = [];
  const journalEntries = [];
  const journalLines = [];
  const stockMovements = [];
  const cashTransactions = [];

  // Helper to create journal entries
  function addJournalRecords(description, referenceType, referenceId, debits, credits) {
    const entryId = uuidv4();
    journalEntries.push({
      id: entryId,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
      transaction_date: new Date().toISOString()
    });

    debits.forEach(d => {
      journalLines.push({
        id: uuidv4(),
        journal_entry_id: entryId,
        account_id: d.id,
        debit_amount: d.amount,
        credit_amount: 0
      });
    });

    credits.forEach(c => {
      journalLines.push({
        id: uuidv4(),
        journal_entry_id: entryId,
        account_id: c.id,
        debit_amount: 0,
        credit_amount: c.amount
      });
    });
  }

  // Fetch COA IDs
  const { data: coas } = await supabase.from('coas').select('*');
  const coaMap = {};
  coas.forEach(c => { coaMap[c.account_code] = c.id; });

  // Compile scenarios
  for (let idx = 0; idx < poScenarios.length; idx++) {
    const scenario = poScenarios[idx];
    const soId = uuidv4();
    const purchaseId = uuidv4();
    const deliveryId = uuidv4();
    const invoiceId = uuidv4();

    // 1. SalesOrder
    salesOrders.push({
      id: soId,
      po_number: scenario.poNumber,
      client_id: client.id,
      order_date: new Date().toISOString(),
      target_delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: idx === 2 ? 'Terkirim' : 'Selesai' // PO 3 is partial (status Terkirim), PO 1 & 2 are Paid (Selesai)
    });

    // 2. SalesOrderItems
    const soItems = scenario.items.map(item => {
      const id = uuidv4();
      salesOrderItems.push({
        id,
        sales_order_id: soId,
        product_id: item.productId,
        qty: item.qty,
        qty_final: item.qty,
        unit_price: item.unitPrice,
        subtotal: item.qty * item.unitPrice,
        subtotal_final: item.qty * item.unitPrice,
        is_packed: true,
        is_handover_checked: true
      });
      return { id, productId: item.productId, qty: item.qty, subtotal: item.qty * item.unitPrice, customHpp: item.customHpp };
    });

    // 3. Purchase & PurchaseItems
    const totalHpp = soItems.reduce((sum, item) => sum + (item.qty * item.customHpp), 0);
    purchases.push({
      id: purchaseId,
      date: new Date().toISOString(),
      purchaser_id: 'admin',
      status: 'Selesai',
      actual_spent: totalHpp,
      reconciliation_status: 'Terverifikasi',
      reconciliation_note: `Bypass fast-track untuk PO ${scenario.poNumber}`
    });

    soItems.forEach(item => {
      purchaseItems.push({
        id: uuidv4(),
        purchase_id: purchaseId,
        product_id: item.productId,
        sales_order_id: soId,
        qty_target: item.qty,
        qty_purchased: item.qty,
        estimated_unit_price: products.find(p => p.id === item.productId).base_price,
        actual_unit_price: item.customHpp,
        is_checked: true,
        is_qced: true,
        purchase_method: 'Pasar'
      });
    });

    // 4. Delivery
    deliveries.push({
      id: deliveryId,
      sales_order_id: soId,
      courier_id: 'admin',
      status: 'Terkirim',
      delivery_date: new Date().toISOString(),
      invoice_id: invoiceId,
      notes: 'Fast-track bypass dengan HPP kustom'
    });

    // 5. Invoices & Journals
    const totalRevenue = soItems.reduce((sum, item) => sum + item.subtotal, 0);
    let amountPaid = 0;
    let invStatus = 'Unpaid';

    if (idx === 0 || idx === 1) {
      amountPaid = totalRevenue;
      invStatus = 'Paid';
    } else {
      amountPaid = totalRevenue * 0.5;
      invStatus = 'Partial';
    }

    invoices.push({
      id: invoiceId,
      sales_order_id: soId,
      client_id: client.id,
      issue_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      total_amount: totalRevenue,
      amount_paid: amountPaid,
      status: invStatus,
      payments: amountPaid > 0 ? [{ id: uuidv4(), amount: amountPaid, date: new Date().toISOString(), note: "Pembayaran diterima" }] : []
    });

    // Journal Entry: Invoice Revenue
    addJournalRecords(
      `Invoice Terbit - Ref: ${invoiceId}`,
      'Invoice',
      invoiceId,
      [{ id: coaMap['1-2000'], amount: totalRevenue }], // Debit Piutang
      [{ id: coaMap['4-1000'], amount: totalRevenue }]  // Credit Penjualan
    );

    // Journal Entry: HPP Fast Track
    addJournalRecords(
      `Pengakuan HPP Fast-Track - Ref: ${invoiceId}`,
      'Invoice',
      invoiceId,
      [{ id: coaMap['5-1000'], amount: totalHpp }], // Debit HPP
      [{ id: coaMap['1-3000'], amount: totalHpp }]  // Credit Persediaan
    );

    // Journal Entry: Payment Received (if any)
    if (amountPaid > 0) {
      addJournalRecords(
        `Pembayaran Invoice - Ref: ${invoiceId}`,
        'Payment',
        invoiceId,
        [{ id: coaMap['1-1200'], amount: amountPaid }], // Debit Bank BCA
        [{ id: coaMap['1-2000'], amount: amountPaid }]  // Credit Piutang
      );

      cashTransactions.push({
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: amountPaid,
        type: 'In',
        category: 'Sales',
        description: `Payment Invoice - Ref: ${invoiceId}`,
        bank_account_id: 'bank-1'
      });
    }

    // Stock Movements
    soItems.forEach(item => {
      stockMovements.push({
        id: uuidv4(),
        date: new Date().toISOString(),
        product_id: item.productId,
        stock_delta: -item.qty,
        resulting_stock: 100, // mock resulting stock
        direction: 'Out',
        kind: 'DELIVERY_OUTBOUND',
        source: 'Inventory',
        destination: client.company_name,
        reference_type: 'Delivery',
        reference_id: deliveryId
      });
    });
  }

  // Write to Supabase tables
  console.log("Writing to Supabase tables...");
  
  const tablesToWrite = [
    { name: 'sales_orders', data: salesOrders },
    { name: 'sales_order_items', data: salesOrderItems },
    { name: 'purchases', data: purchases },
    { name: 'purchase_items', data: purchaseItems },
    { name: 'deliveries', data: deliveries },
    { name: 'invoices', data: invoices },
    { name: 'journal_entries', data: journalEntries },
    { name: 'journal_lines', data: journalLines },
    { name: 'stock_movements', data: stockMovements },
    { name: 'cash_transactions', data: cashTransactions }
  ];

  for (const table of tablesToWrite) {
    console.log(`Inserting ${table.data.length} records into ${table.name}...`);
    const { error } = await supabase.from(table.name).insert(table.data);
    if (error) {
      console.error(`Error inserting into ${table.name}:`, error);
    }
  }

  console.log("\n✅ [SUCCESS] Simulation data written to live Supabase database!");
}

main().catch(err => {
  console.error("Main execution failed:", err);
});
