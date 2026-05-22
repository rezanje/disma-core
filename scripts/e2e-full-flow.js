/**
 * E2E full-flow test:
 * 1. Seed initial saldo (pinjaman + modal pemilik)
 * 2. Create 4 sales orders (POs)
 * 3. Approve POs → generate purchases (shopping list)
 * 4. Mark some items online + add non-PO online items
 * 5. Pencairan budget sourcing (BCA → Kas Sourcing) + ops spare
 * 6. Settlement offline (HPP + Ops dari Kas Sourcing)
 * 7. Pay belanja online (HPP + admin + shipping)
 * 8. Final verification via trial balance + reports
 *
 * Mirrors src/lib/accounting.ts journal patterns 1:1.
 */
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

const log = (...a) => console.log(...a);
const HPP = '5-1000';
const SOURCING_HILMAN_BANK = 'bank-advance-sourcing';
const BCA = 'bank-1';
const ADVANCE_COA = '1-1500';

let _coas, _banks, _clients, _products, _users;

async function loadMasters() {
  _coas = (await sb.from('coas').select('*')).data;
  _banks = (await sb.from('bank_accounts').select('*')).data;
  _clients = (await sb.from('clients').select('id,company_name').limit(50)).data;
  _products = (await sb.from('products').select('id,name,sku_code').limit(50)).data;
  _users = (await sb.from('users').select('*')).data;
}

const coaIdByCode = (code) => _coas.find((c) => c.account_code === code)?.id;
const bankByCode = (code) => _banks.find((b) => b.account_code === code);
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
    lines.push({
      id: randomUUID(),
      journal_entry_id: entryId,
      account_id: accountId,
      debit_amount: d.amount,
      credit_amount: 0,
    });
  }
  for (const c of credits) {
    const accountId = coaIdByCode(c.accountCode);
    if (!accountId) throw new Error(`COA not found ${c.accountCode}`);
    lines.push({
      id: randomUUID(),
      journal_entry_id: entryId,
      account_id: accountId,
      debit_amount: 0,
      credit_amount: c.amount,
    });
  }
  const { error } = await sb.from('journal_lines').insert(lines);
  if (error) throw error;
  return entryId;
}

async function addCashTx(tx) {
  const id = tx.id || randomUUID();
  const { error } = await sb.from('cash_transactions').insert({
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
  if (error) throw error;
  // Update bank balance
  const bank = bankById(tx.bankAccountId);
  const newBal = (bank.balance || 0) + (tx.type === 'In' ? tx.amount : -tx.amount);
  bank.balance = newBal;
  await sb.from('bank_accounts').update({ balance: newBal }).eq('id', tx.bankAccountId);
}

// ============================================================
// PHASE 1: Initial saldo
// ============================================================
async function seedInitialSaldo() {
  log('\n=== PHASE 1: Saldo Awal ===');
  // Loan 600M → BCA
  await postJournal(
    'Pinjaman Bank dari Imandio Capital',
    'Adjustment',
    'init-loan-1',
    [{ accountCode: '1-1200', amount: 600_000_000 }],
    [{ accountCode: '2-4000', amount: 600_000_000 }]
  );
  await addCashTx({
    amount: 600_000_000,
    type: 'In',
    bankAccountId: BCA,
    category: 'Pinjaman',
    description: 'Pinjaman Bank: Imandio Capital',
    counterpartName: 'Imandio Capital',
    referenceType: 'Adjustment',
    referenceId: 'init-loan-1',
  });

  // Modal Pemilik 400M → BCA
  await postJournal(
    'Setoran Modal Pemilik (Investment)',
    'Adjustment',
    'init-modal-1',
    [{ accountCode: '1-1200', amount: 400_000_000 }],
    [{ accountCode: '3-1000', amount: 400_000_000 }]
  );
  await addCashTx({
    amount: 400_000_000,
    type: 'In',
    bankAccountId: BCA,
    category: 'Investasi',
    description: 'Setoran Modal Pemilik (Investment)',
    counterpartName: 'Owner',
    referenceType: 'Adjustment',
    referenceId: 'init-modal-1',
  });
  log('  Pinjaman 600M + Modal 400M → BCA. New BCA balance:', bankById(BCA).balance);
}

// ============================================================
// PHASE 2: Create 4 SOs
// ============================================================
const SO_PLAN = [
  { client: 0, items: [{ p: 0, qty: 10, price: 50000 }, { p: 1, qty: 5, price: 25000 }] }, // total 625k
  { client: 1, items: [{ p: 2, qty: 8, price: 30000 }, { p: 3, qty: 3, price: 80000 }] }, // total 480k
  { client: 2, items: [{ p: 4, qty: 20, price: 12000 }] }, // 240k
  { client: 3, items: [{ p: 0, qty: 15, price: 50000 }, { p: 2, qty: 10, price: 35000 }] }, // 1.1M
];

let _soIds = [];

async function createSOs() {
  log('\n=== PHASE 2: Create 4 POs ===');
  for (let i = 0; i < SO_PLAN.length; i++) {
    const plan = SO_PLAN[i];
    const soId = randomUUID();
    const clientId = _clients[plan.client].id;
    const poNumber = `PO-E2E-${Date.now()}-${i + 1}`;
    await sb.from('sales_orders').insert({
      id: soId,
      po_number: poNumber,
      client_id: clientId,
      order_date: new Date().toISOString(),
      target_delivery_date: new Date(Date.now() + 3 * 86400e3).toISOString(),
      status: 'Pending Approval',
    });
    const items = plan.items.map((it) => ({
      id: randomUUID(),
      sales_order_id: soId,
      product_id: _products[it.p].id,
      qty: it.qty,
      unit_price: it.price,
      subtotal: it.qty * it.price,
    }));
    await sb.from('sales_order_items').insert(items);
    _soIds.push(soId);
    const total = plan.items.reduce((s, it) => s + it.qty * it.price, 0);
    log(`  SO #${i + 1} ${poNumber} → ${_clients[plan.client].company_name}, total Rp${total.toLocaleString()}`);
  }
}

// ============================================================
// PHASE 3: Approve POs (status='Belanja') + create purchases
// ============================================================
let _purchaseIds = []; // 1 purchase per SO

async function approvePOsAndCreatePurchases() {
  log('\n=== PHASE 3: Approve POs + Create Purchases (Shopping List) ===');
  for (let i = 0; i < _soIds.length; i++) {
    const soId = _soIds[i];
    // Approve SO
    await sb.from('sales_orders').update({ status: 'Belanja' }).eq('id', soId);

    // Create purchase + items (linked to SO items)
    const purchaseId = randomUUID();
    await sb.from('purchases').insert({
      id: purchaseId,
      date: new Date().toISOString(),
      purchaser_id: 'u2', // Hilman
      status: 'Pending',
    });

    const soItems = (await sb.from('sales_order_items').select('*').eq('sales_order_id', soId)).data;
    const purchaseItems = soItems.map((soItem) => ({
      id: randomUUID(),
      purchase_id: purchaseId,
      product_id: soItem.product_id,
      sales_order_id: soId,
      qty_target: soItem.qty,
      qty_purchased: 0,
      estimated_unit_price: soItem.unit_price,
      actual_unit_price: 0,
      is_checked: false,
      purchase_method: 'Pasar', // default; some will switch to Online later
    }));
    await sb.from('purchase_items').insert(purchaseItems);
    _purchaseIds.push(purchaseId);
    log(`  PO #${i + 1} approved → purchase ${purchaseId.slice(0, 8)} created with ${purchaseItems.length} items`);
  }
}

// ============================================================
// PHASE 4: Mark some items online + add non-PO online items
// ============================================================
let _onlinePurchaseId; // separate purchase for non-PO online items

async function markOnlineAndAddNonPO() {
  log('\n=== PHASE 4: Mark Online + Add Non-PO Online ===');
  // For each purchase, flip the LAST item to purchase_method='Online'
  for (const pId of _purchaseIds) {
    const items = (await sb.from('purchase_items').select('id').eq('purchase_id', pId)).data;
    const lastItemId = items[items.length - 1].id;
    await sb.from('purchase_items').update({ purchase_method: 'Online', is_online_ordered: true }).eq('id', lastItemId);
    log(`  Purchase ${pId.slice(0, 8)}: marked item ${lastItemId.slice(0, 8)} as Online`);
  }

  // Create a separate purchase for non-PO online items (Hilman browsing tokopedia)
  _onlinePurchaseId = randomUUID();
  await sb.from('purchases').insert({
    id: _onlinePurchaseId,
    date: new Date().toISOString(),
    purchaser_id: 'u2',
    status: 'Pending',
  });

  // 2 non-PO online items
  const nonPOItems = [
    { p: 1, qty: 4, price: 30000 }, // 120k
    { p: 4, qty: 6, price: 18000 }, // 108k
  ];
  const nonPOItemRows = nonPOItems.map((it) => ({
    id: randomUUID(),
    purchase_id: _onlinePurchaseId,
    product_id: _products[it.p].id,
    qty_target: it.qty,
    qty_purchased: 0,
    estimated_unit_price: it.price,
    actual_unit_price: 0,
    is_checked: false,
    purchase_method: 'Online',
    is_online_ordered: true,
  }));
  await sb.from('purchase_items').insert(nonPOItemRows);
  log(`  Non-PO online purchase created: ${_onlinePurchaseId.slice(0, 8)} with ${nonPOItemRows.length} items`);
}

// ============================================================
// PHASE 5: Pencairan budget sourcing (BCA → Kas Sourcing) + ops spare
// Mirrors recordBudgetTransfer in accounting.ts
// ============================================================
async function pencairanPO() {
  log('\n=== PHASE 5: Pencairan Budget Sourcing ===');
  // Each PO has Pasar items needing offline shopping. Calculate HPP target + ops spare.
  for (let i = 0; i < _purchaseIds.length; i++) {
    const pId = _purchaseIds[i];
    const items = (await sb.from('purchase_items').select('*').eq('purchase_id', pId)).data;
    const pasarItems = items.filter((it) => it.purchase_method === 'Pasar');
    if (pasarItems.length === 0) continue;
    const targetSpend = pasarItems.reduce((s, it) => s + Number(it.qty_target) * Number(it.estimated_unit_price), 0);
    const opsSpare = 50000; // Rp50k for bensin/tol/parkir per trip
    const budgetAmount = targetSpend + opsSpare;

    // Update purchase row with budget meta
    await sb.from('purchases').update({
      budget_amount: budgetAmount,
      budget_transfer_date: new Date().toISOString(),
      budget_transfered_by: 'u5', // Sifa finance
      budget_bank_account_id: BCA,
      operational_spare_amount: opsSpare,
      reconciliation_status: 'Dana Ditransfer',
    }).eq('id', pId);

    // Journal: D Advance 1-1500 / C BCA 1-1200
    await postJournal(
      `Pencairan Budget Sourcing: Hilman (Sourcing) - Ref: ${pId.slice(0, 8)}`,
      'Transfer',
      pId,
      [{ accountCode: ADVANCE_COA, amount: budgetAmount }],
      [{ accountCode: '1-1200', amount: budgetAmount }]
    );
    // Cash out from BCA
    await addCashTx({
      amount: budgetAmount,
      type: 'Out',
      bankAccountId: BCA,
      category: 'Transfer Uang Muka Sourcing',
      description: `Pencairan Dana (Advance) ke Hilman (Sourcing) - Ref: ${pId.slice(0, 8)}`,
      counterpartName: 'Hilman (Sourcing)',
    });
    // Cash in to Kas Sourcing Hilman
    await addCashTx({
      amount: budgetAmount,
      type: 'In',
      bankAccountId: SOURCING_HILMAN_BANK,
      category: 'Transfer Uang Muka Sourcing',
      description: `Penerimaan Dana (Advance) dari Kantor - Ref: ${pId.slice(0, 8)}`,
      counterpartName: 'BCA (UTAMA)',
    });
    log(
      `  PO ${pId.slice(0, 8)}: target ${targetSpend.toLocaleString()} + ops ${opsSpare.toLocaleString()} = ${budgetAmount.toLocaleString()} transferred`
    );
  }
}

// ============================================================
// PHASE 6: Settlement offline (HPP actual + Ops actual dari Kas Sourcing)
// Mirrors recordReconciliationSettlement
// ============================================================
async function settlementOffline() {
  log('\n=== PHASE 6: Settlement Offline (Sourcing) ===');
  for (const pId of _purchaseIds) {
    const items = (await sb.from('purchase_items').select('*').eq('purchase_id', pId)).data;
    const pasarItems = items.filter((it) => it.purchase_method === 'Pasar');
    if (pasarItems.length === 0) continue;

    const purchase = (await sb.from('purchases').select('*').eq('id', pId).single()).data;
    const advanceAmount = Number(purchase.budget_amount) || 0;

    // Simulate sourcer's actual numbers — assume 95% of target HPP, 80% ops
    const actualShopCost = Math.round(
      pasarItems.reduce((s, it) => s + Number(it.qty_target) * Number(it.estimated_unit_price), 0) * 0.95
    );
    const actualOpsCost = Math.round(Number(purchase.operational_spare_amount) * 0.8);

    // Settlement HPP: D HPP / C Advance
    await postJournal(
      `Penyelesaian Belanja Sourcing - Ref: ${pId.slice(0, 8)}`,
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
      description: `Belanja Pasar disetujui - Ref: ${pId.slice(0, 8)}`,
      referenceType: 'Purchase',
      referenceId: pId,
    });

    // Settlement OPS: D Beban Transportasi 6-1400 / C Advance
    const remainingAdvance = Math.max(0, advanceAmount - actualShopCost);
    const opsFromAdvance = Math.min(actualOpsCost, remainingAdvance);
    if (opsFromAdvance > 0) {
      await postJournal(
        `Penyelesaian Ops Sourcing - Ref: ${pId.slice(0, 8)}`,
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
        description: `Biaya Ops disetujui - Ref: ${pId.slice(0, 8)}`,
        referenceType: 'Expense',
        referenceId: pId,
      });
    }

    // Pengembalian sisa advance → BCA (D BCA / C Advance)
    const totalUsed = Math.min(actualShopCost, advanceAmount) + opsFromAdvance;
    const change = advanceAmount - totalUsed;
    if (change > 0) {
      await postJournal(
        `Pengembalian Sisa Advance Sourcing - Ref: ${pId.slice(0, 8)}`,
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
        description: `Pengembalian Sisa Advance ke BCA - Ref: ${pId.slice(0, 8)}`,
        referenceType: 'Transfer',
        referenceId: pId,
      });
      await addCashTx({
        amount: change,
        type: 'In',
        bankAccountId: BCA,
        category: 'Setoran Pengembalian',
        description: `Terima Pengembalian Advance dari Hilman - Ref: ${pId.slice(0, 8)}`,
        referenceType: 'Transfer',
        referenceId: pId,
      });
    }

    // Mark purchase reconciled
    await sb.from('purchases').update({
      reconciliation_status: 'Terverifikasi',
      actual_spent: actualShopCost,
      change_returned: change,
    }).eq('id', pId);

    log(
      `  PO ${pId.slice(0, 8)}: HPP actual ${actualShopCost.toLocaleString()}, Ops ${opsFromAdvance.toLocaleString()}, change returned ${change.toLocaleString()}`
    );
  }
}

// ============================================================
// PHASE 7: Pay belanja online (HPP + admin + shipping, BCA out)
// Mirrors recordOnlinePurchase
// ============================================================
async function payOnline() {
  log('\n=== PHASE 7: Pay Belanja Online ===');
  // All online items from PO-linked purchases + non-PO purchase
  const allPurchases = [..._purchaseIds, _onlinePurchaseId];
  let totalSpent = 0;
  for (const pId of allPurchases) {
    const items = (await sb.from('purchase_items').select('*').eq('purchase_id', pId)).data;
    const onlineItems = items.filter((it) => it.purchase_method === 'Online' && !it.is_online_audited);
    for (const it of onlineItems) {
      const baseProductAmount = Math.round(Number(it.qty_target) * Number(it.estimated_unit_price) * 1.02); // pretend 2% markup vs estimate
      const adminFee = 2500;
      const shippingFee = 12000;
      const totalAmount = baseProductAmount + adminFee + shippingFee;

      const productName = _products.find((p) => p.id === it.product_id)?.name || 'Unknown';

      const debits = [{ accountCode: HPP, amount: baseProductAmount }];
      if (adminFee > 0) debits.push({ accountCode: '6-1600', amount: adminFee });
      if (shippingFee > 0) debits.push({ accountCode: '6-1700', amount: shippingFee });

      await postJournal(
        `Pembelian Online: ${productName} - Ref: ${it.id.slice(0, 8)}`,
        'Purchase',
        it.id,
        debits,
        [{ accountCode: '1-1200', amount: totalAmount }]
      );
      await addCashTx({
        amount: totalAmount,
        type: 'Out',
        bankAccountId: BCA,
        category: 'Belanja Online',
        description: `Belanja Online: ${productName} (Incl. Admin & Ongkir)`,
        referenceType: 'Purchase',
        referenceId: it.id,
      });
      await sb.from('purchase_items').update({
        is_online_audited: true,
        actual_unit_price: baseProductAmount / Number(it.qty_target),
        qty_purchased: it.qty_target,
      }).eq('id', it.id);
      totalSpent += totalAmount;
    }
  }
  log(`  Total spent online: Rp${totalSpent.toLocaleString()}`);
}

// ============================================================
// PHASE 8: Verify
// ============================================================
async function verify() {
  log('\n=== PHASE 8: Trial Balance + Balance Sheet Check ===');
  // Load all journal lines
  const { data: lines } = await sb.from('journal_lines').select('*');
  const { data: coas } = await sb.from('coas').select('*');
  const totalsByCoa = {};
  for (const l of lines) {
    const t = totalsByCoa[l.account_id] || { debit: 0, credit: 0 };
    t.debit += Number(l.debit_amount);
    t.credit += Number(l.credit_amount);
    totalsByCoa[l.account_id] = t;
  }

  let totalD = 0,
    totalC = 0;
  const typeSums = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 };
  log('\n  ACCOUNT BALANCES:');
  for (const coa of coas) {
    const t = totalsByCoa[coa.id];
    if (!t) continue;
    totalD += t.debit;
    totalC += t.credit;
    // Asset/Expense: net = D - C; Liability/Equity/Revenue: net = C - D
    const net = ['Asset', 'Expense'].includes(coa.account_type) ? t.debit - t.credit : t.credit - t.debit;
    if (Math.abs(net) > 0.01) {
      typeSums[coa.account_type] += net;
      log(`    ${coa.account_code} ${coa.account_name.padEnd(35)} D ${t.debit.toLocaleString().padStart(15)} C ${t.credit.toLocaleString().padStart(15)} NET ${net.toLocaleString()}`);
    }
  }

  log('\n  TRIAL BALANCE:');
  log(`    Total Debit:  Rp${totalD.toLocaleString()}`);
  log(`    Total Credit: Rp${totalC.toLocaleString()}`);
  log(`    Balanced:     ${Math.abs(totalD - totalC) < 0.01 ? 'YES ✓' : 'NO ✗ DIFF ' + (totalD - totalC)}`);

  log('\n  BALANCE SHEET (snapshot):');
  log(`    Assets:       Rp${typeSums.Asset.toLocaleString()}`);
  log(`    Liabilities:  Rp${typeSums.Liability.toLocaleString()}`);
  log(`    Equity:       Rp${typeSums.Equity.toLocaleString()}`);
  log(`    Revenue:      Rp${typeSums.Revenue.toLocaleString()}`);
  log(`    Expense:      Rp${typeSums.Expense.toLocaleString()}`);
  const netProfit = typeSums.Revenue - typeSums.Expense;
  const equityWithProfit = typeSums.Equity + netProfit;
  log(`    Net Profit:   Rp${netProfit.toLocaleString()}`);
  log(`    Equity + Profit: Rp${equityWithProfit.toLocaleString()}`);
  log(`    Assets vs (Liab + Equity + Profit): ${typeSums.Asset.toLocaleString()} vs ${(typeSums.Liability + equityWithProfit).toLocaleString()}`);
  log(`    Equation balanced: ${Math.abs(typeSums.Asset - typeSums.Liability - equityWithProfit) < 0.01 ? 'YES ✓' : 'NO ✗ DIFF ' + (typeSums.Asset - typeSums.Liability - equityWithProfit)}`);

  log('\n  BANK BALANCES (vs Asset coa net):');
  const banks = (await sb.from('bank_accounts').select('*')).data;
  let bankTotal = 0;
  for (const b of banks) {
    if (Number(b.balance) === 0) continue;
    log(`    ${b.name.padEnd(30)} Rp${Number(b.balance).toLocaleString()}`);
    bankTotal += Number(b.balance);
  }
  log(`    Total bank balances: Rp${bankTotal.toLocaleString()}`);

  log('\n  CASH TRANSACTIONS count:', (await sb.from('cash_transactions').select('id')).data.length);
  log('  JOURNAL ENTRIES count:', (await sb.from('journal_entries').select('id')).data.length);
  log('  JOURNAL LINES count:', lines.length);
}

(async () => {
  try {
    await loadMasters();
    await seedInitialSaldo();
    await createSOs();
    await approvePOsAndCreatePurchases();
    await markOnlineAndAddNonPO();
    await pencairanPO();
    await settlementOffline();
    await payOnline();
    await verify();
    log('\n=== ALL PHASES COMPLETE ===');
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
