/**
 * E2E billing flow — continuation of e2e-full-flow.js.
 * Assumes 4 POs already in 'Belanja' status from procurement test.
 *
 * Phases:
 * A. QC: PO3 has reject (qtyFinal < qty), add pending_returns
 * B. Advance SO status: Belanja → Sourcing → QC → Packing → Siap Kirim → Dikirim → Terkirim → Awaiting Audit
 * C. Create deliveries (1 per SO)
 * D. Kurir complete delivery → add invoice (Draft)
 * E. Finance audit delivery → recordDeliveryAndInvoice (post journal D Piutang / C Revenue)
 * F. Tukar Faktur: combine PO1 + PO2 into consolidated invoice
 * G. Payments:
 *    - Consolidated (PO1+PO2): Paid full
 *    - PO3 single: Partial 50%
 *    - PO4 single: Unpaid
 * H. Verify trial balance + balance sheet + P&L + Cash Flow
 */
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

const log = (...a) => console.log(...a);
const BCA = 'bank-1';

let _coas, _banks, _clients, _products, _users;

async function loadMasters() {
  _coas = (await sb.from('coas').select('*')).data;
  _banks = (await sb.from('bank_accounts').select('*')).data;
  _clients = (await sb.from('clients').select('*')).data;
  _products = (await sb.from('products').select('*')).data;
  _users = (await sb.from('users').select('*')).data;
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
  const bank = bankById(tx.bankAccountId);
  const newBal = (bank.balance || 0) + (tx.type === 'In' ? tx.amount : -tx.amount);
  bank.balance = newBal;
  await sb.from('bank_accounts').update({ balance: newBal }).eq('id', tx.bankAccountId);
}

let _sos; // existing 4 SOs ordered by po_number
let _soItems; // all SO items grouped per SO
let _deliveries = []; // [{soId, deliveryId, invoiceId, totalAmount}]

async function loadSOs() {
  _sos = (await sb.from('sales_orders').select('*').like('po_number', 'PO-E2E-%').order('po_number')).data;
  if (_sos.length < 4) throw new Error('Expected 4 E2E POs. Found ' + _sos.length);
  _soItems = {};
  for (const so of _sos) {
    const items = (await sb.from('sales_order_items').select('*').eq('sales_order_id', so.id)).data;
    _soItems[so.id] = items;
  }
  log('Loaded SOs:', _sos.map((s) => `${s.po_number}(${s.status})`).join(', '));
}

// ============================================================
// PHASE A: QC reject on PO3 (qtyFinal < qty for 1 item)
// ============================================================
async function applyQCReject() {
  log('\n=== PHASE A: QC Reject on PO3 ===');
  const po3 = _sos[2]; // index 2 = 3rd
  const items = _soItems[po3.id];
  // Reject 5 from first item
  const item = items[0];
  const qtyFinal = Math.max(1, Number(item.qty) - 5);
  await sb.from('sales_order_items').update({
    qty_final: qtyFinal,
    subtotal_final: qtyFinal * Number(item.unit_price),
    qty_adjustment_reason: 'QC Reject: busuk 5pcs',
  }).eq('id', item.id);
  log(`  PO3 (${po3.po_number}) item ${item.id.slice(0,8)}: qty ${item.qty} → qtyFinal ${qtyFinal}`);
  // Pending return entry
  await sb.from('pending_returns').insert({
    id: randomUUID(),
    product_id: item.product_id,
    original_so_id: po3.id,
    qty: Number(item.qty) - qtyFinal,
    reason: 'QC Reject: busuk',
    date: new Date().toISOString(),
    status: 'Pending QC',
  });
  log(`  pending_return ${Number(item.qty) - qtyFinal}pcs added`);
  // Reload items
  _soItems[po3.id] = (await sb.from('sales_order_items').select('*').eq('sales_order_id', po3.id)).data;
}

// ============================================================
// PHASE B: Advance status all SOs → 'Awaiting Audit' (delivered, awaiting finance audit)
// ============================================================
async function advanceStatusToAwaitingAudit() {
  log('\n=== PHASE B: Advance status to Awaiting Audit ===');
  for (const so of _sos) {
    await sb.from('sales_orders').update({ status: 'Awaiting Audit', handover_date: new Date().toISOString() }).eq('id', so.id);
  }
  log(`  All 4 SOs status → Awaiting Audit`);
}

// ============================================================
// PHASE C+D: Create deliveries + invoices (Draft, no journal yet)
// ============================================================
async function createDeliveriesAndInvoices() {
  log('\n=== PHASE C+D: Deliveries + Invoices (Draft) ===');
  for (const so of _sos) {
    const items = _soItems[so.id];
    const totalRevenue = items.reduce((s, it) => {
      const qty = Number(it.qty_final ?? it.qty);
      return s + qty * Number(it.unit_price);
    }, 0);
    const client = _clients.find((c) => c.id === so.client_id);

    const deliveryId = randomUUID();
    const invoiceId = randomUUID();
    const issueDate = new Date().toISOString();
    const dueDate = new Date(Date.now() + (client.payment_term_days || 30) * 86400e3).toISOString();

    await sb.from('deliveries').insert({
      id: deliveryId,
      sales_order_id: so.id,
      courier_id: 'u4',
      status: 'Awaiting Audit',
      delivery_date: issueDate,
      invoice_id: invoiceId,
    });
    await sb.from('invoices').insert({
      id: invoiceId,
      sales_order_id: so.id,
      client_id: client.id,
      issue_date: issueDate,
      due_date: dueDate,
      total_amount: totalRevenue,
      amount_paid: 0,
      status: 'Unpaid',
    });
    _deliveries.push({ soId: so.id, deliveryId, invoiceId, totalAmount: totalRevenue, clientId: client.id, items });
    log(`  ${so.po_number} (${client.company_name}): delivery+invoice created, total Rp${totalRevenue.toLocaleString()}`);
  }
}

// ============================================================
// PHASE E: Finance audit delivery → recordDeliveryAndInvoice (post journal)
// ============================================================
async function auditDeliveriesAndPostJournal() {
  log('\n=== PHASE E: Finance audit delivery (post Piutang+Revenue journal) ===');
  for (const d of _deliveries) {
    // Post Revenue + Piutang journal: D 1-2000 / C 4-1000
    await postJournal(
      `Invoice Terbit - Ref: ${d.invoiceId}`,
      'Invoice',
      d.invoiceId,
      [{ accountCode: '1-2000', amount: d.totalAmount }],
      [{ accountCode: '4-1000', amount: d.totalAmount }]
    );
    // Update SO + delivery status
    await sb.from('sales_orders').update({ status: 'Terkirim' }).eq('id', d.soId);
    await sb.from('deliveries').update({ status: 'Terkirim' }).eq('id', d.deliveryId);
    log(`  Posted: ${d.invoiceId.slice(0, 8)} D Piutang ${d.totalAmount.toLocaleString()} / C Revenue`);
  }
}

// ============================================================
// PHASE F: Tukar Faktur — combine PO1 + PO2 into consolidated invoice
// ============================================================
let _consolidatedInvoiceId;
let _consolidatedTotal;

async function consolidateInvoices() {
  log('\n=== PHASE F: Tukar Faktur (consolidate PO1 + PO2) ===');
  // The 2 single invoices for PO1+PO2 already exist + already journalized.
  // Tukar Faktur in this app: create a NEW invoice with isConsolidated=true that BUNDLES the 2 SO ids.
  // The original singles stay in DB but UI hides them via consolidatedInvoiceSalesOrderIds filter.
  // For accounting: no NEW journal needed — Revenue/Piutang already posted from singles.
  // But the consolidated invoice is what client pays against.
  const po1 = _deliveries[0];
  const po2 = _deliveries[1];
  _consolidatedTotal = po1.totalAmount + po2.totalAmount;
  _consolidatedInvoiceId = randomUUID();

  const issueDate = new Date().toISOString();
  const dueDate = new Date(Date.now() + 30 * 86400e3).toISOString();

  await sb.from('invoices').insert({
    id: _consolidatedInvoiceId,
    sales_order_id: null,
    sales_order_ids: [po1.soId, po2.soId],
    is_consolidated: true,
    consolidated_order_numbers: [_sos[0].po_number, _sos[1].po_number],
    client_id: po1.clientId, // billing entity — in app this requires same client OR central HQ. Here use PO1's client.
    issue_date: issueDate,
    due_date: dueDate,
    total_amount: _consolidatedTotal,
    amount_paid: 0,
    status: 'Unpaid',
  });
  log(`  Consolidated invoice ${_consolidatedInvoiceId.slice(0,8)} total Rp${_consolidatedTotal.toLocaleString()}`);
  log(`  NOTE: original PO1+PO2 single invoices remain in DB; UI hides them via consolidatedInvoiceSalesOrderIds.`);
}

// ============================================================
// PHASE G: Payments
// ============================================================
async function recordPayments() {
  log('\n=== PHASE G: Record Payments ===');

  // 1. Consolidated invoice (PO1+PO2) → Paid full
  await postJournal(
    `Pembayaran Invoice - Ref: ${_consolidatedInvoiceId}`,
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
    description: `Payment Consolidated Invoice - Ref: ${_consolidatedInvoiceId}`,
    referenceType: 'Payment',
    referenceId: _consolidatedInvoiceId,
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
      note: 'Lunas',
    }],
  }).eq('id', _consolidatedInvoiceId);
  log(`  Consolidated PO1+PO2 PAID FULL Rp${_consolidatedTotal.toLocaleString()}`);

  // 2. PO3 invoice → Partial 50%
  const po3 = _deliveries[2];
  const partialAmount = Math.floor(po3.totalAmount / 2);
  await postJournal(
    `Pembayaran Invoice (Partial) - Ref: ${po3.invoiceId}`,
    'Payment',
    po3.invoiceId,
    [{ accountCode: '1-1200', amount: partialAmount }],
    [{ accountCode: '1-2000', amount: partialAmount }]
  );
  await addCashTx({
    amount: partialAmount,
    type: 'In',
    bankAccountId: BCA,
    category: 'Sales',
    description: `Payment Partial PO3 - Ref: ${po3.invoiceId}`,
    referenceType: 'Payment',
    referenceId: po3.invoiceId,
  });
  await sb.from('invoices').update({
    amount_paid: partialAmount,
    status: 'Partial',
    payments: [{
      id: randomUUID(),
      date: new Date().toISOString(),
      amount: partialAmount,
      method: 'Transfer Bank',
      note: 'Partial 50%',
    }],
  }).eq('id', po3.invoiceId);
  log(`  PO3 (${_sos[2].po_number}) PARTIAL Rp${partialAmount.toLocaleString()} of Rp${po3.totalAmount.toLocaleString()}`);

  // 3. PO4 → Unpaid (no action). Invoice stays Unpaid.
  log(`  PO4 (${_sos[3].po_number}) UNPAID — Piutang Rp${_deliveries[3].totalAmount.toLocaleString()} outstanding`);
}

// ============================================================
// PHASE H: Verify
// ============================================================
async function verify() {
  log('\n=== PHASE H: Final Verification ===');
  const { data: lines } = await sb.from('journal_lines').select('*');
  const { data: coas } = await sb.from('coas').select('*');
  const totalsByCoa = {};
  for (const l of lines) {
    const t = totalsByCoa[l.account_id] || { debit: 0, credit: 0 };
    t.debit += Number(l.debit_amount);
    t.credit += Number(l.credit_amount);
    totalsByCoa[l.account_id] = t;
  }

  let totalD = 0, totalC = 0;
  const typeSums = { Asset: 0, Liability: 0, Equity: 0, Revenue: 0, Expense: 0 };
  log('\n  ACCOUNT BALANCES:');
  for (const coa of coas) {
    const t = totalsByCoa[coa.id];
    if (!t) continue;
    totalD += t.debit;
    totalC += t.credit;
    const net = ['Asset', 'Expense'].includes(coa.account_type) ? t.debit - t.credit : t.credit - t.debit;
    if (Math.abs(net) > 0.01) {
      typeSums[coa.account_type] += net;
      log(`    ${coa.account_code} ${coa.account_name.padEnd(35)} D ${t.debit.toLocaleString().padStart(18)} C ${t.credit.toLocaleString().padStart(18)} NET ${net.toLocaleString()}`);
    }
  }

  log('\n  TRIAL BALANCE:');
  log(`    Total Debit:  Rp${totalD.toLocaleString()}`);
  log(`    Total Credit: Rp${totalC.toLocaleString()}`);
  log(`    Balanced:     ${Math.abs(totalD - totalC) < 0.01 ? 'YES ✓' : 'NO ✗ DIFF ' + (totalD - totalC)}`);

  log('\n  BALANCE SHEET:');
  log(`    Assets:       Rp${typeSums.Asset.toLocaleString()}`);
  log(`    Liabilities:  Rp${typeSums.Liability.toLocaleString()}`);
  log(`    Equity:       Rp${typeSums.Equity.toLocaleString()}`);
  log(`    Revenue:      Rp${typeSums.Revenue.toLocaleString()}`);
  log(`    Expense:      Rp${typeSums.Expense.toLocaleString()}`);
  const netProfit = typeSums.Revenue - typeSums.Expense;
  const equityWithProfit = typeSums.Equity + netProfit;
  log(`    Net Profit:   Rp${netProfit.toLocaleString()}`);
  log(`    Equity + Profit: Rp${equityWithProfit.toLocaleString()}`);
  const liabPlusEq = typeSums.Liability + equityWithProfit;
  log(`    Assets vs (Liab + Equity + Profit): Rp${typeSums.Asset.toLocaleString()} vs Rp${liabPlusEq.toLocaleString()}`);
  log(`    Equation balanced: ${Math.abs(typeSums.Asset - liabPlusEq) < 0.01 ? 'YES ✓' : 'NO ✗ DIFF ' + (typeSums.Asset - liabPlusEq)}`);

  log('\n  BANK BALANCES:');
  const banks = (await sb.from('bank_accounts').select('*')).data;
  let bankTotal = 0;
  for (const b of banks) {
    if (Number(b.balance) === 0) continue;
    log(`    ${b.name.padEnd(30)} Rp${Number(b.balance).toLocaleString()}`);
    bankTotal += Number(b.balance);
  }
  log(`    Total bank balances: Rp${bankTotal.toLocaleString()}`);

  log('\n  INVOICE BREAKDOWN:');
  const { data: invoices } = await sb.from('invoices').select('*').order('issue_date');
  let totalInv = 0, totalPaid = 0;
  for (const inv of invoices) {
    log(
      `    inv ${inv.id.slice(0, 8)} ${inv.is_consolidated ? '[CONSOL]' : '[SINGLE]'} ${inv.status.padEnd(8)} total Rp${Number(inv.total_amount).toLocaleString().padStart(12)} paid Rp${Number(inv.amount_paid).toLocaleString().padStart(12)} client ${(_clients.find(c=>c.id===inv.client_id)?.company_name||'?').slice(0,25)}`
    );
    totalInv += Number(inv.total_amount);
    totalPaid += Number(inv.amount_paid);
  }
  log(`    Total invoiced (incl original singles+consol): Rp${totalInv.toLocaleString()}`);
  log(`    Total paid: Rp${totalPaid.toLocaleString()}`);
  log(`    Outstanding (incl duplicate from consol): Rp${(totalInv - totalPaid).toLocaleString()}`);
  log(`    NOTE: consolidated bundles PO1+PO2; original singles still in DB. UI hides them. Accounting Piutang reflects original 4 invoices only.`);

  log('\n  PIUTANG SANITY:');
  const piutangCoa = coas.find((c) => c.account_code === '1-2000');
  const piutangNet = totalsByCoa[piutangCoa.id];
  const piutangBalance = (piutangNet?.debit || 0) - (piutangNet?.credit || 0);
  // Expected: Sum of original 4 invoice totals - payments received
  // Payments: consolidated paid (= PO1+PO2 total) + PO3 partial
  const po3Inv = invoices.find((i) => i.sales_order_id === _sos[2].id && !i.is_consolidated);
  const expectedPiutang = _deliveries.reduce((s, d) => s + d.totalAmount, 0) - _consolidatedTotal - Number(po3Inv?.amount_paid || 0);
  log(`    Piutang (1-2000) net: Rp${piutangBalance.toLocaleString()}`);
  log(`    Expected (4 inv total - consol paid - PO3 partial paid): Rp${expectedPiutang.toLocaleString()}`);
  log(`    Match: ${piutangBalance === expectedPiutang ? 'YES ✓' : 'NO ✗ DIFF ' + (piutangBalance - expectedPiutang)}`);
}

(async () => {
  try {
    await loadMasters();
    await loadSOs();
    await applyQCReject();
    await advanceStatusToAwaitingAudit();
    await createDeliveriesAndInvoices();
    await auditDeliveriesAndPostJournal();
    await consolidateInvoices();
    await recordPayments();
    await verify();
    log('\n=== BILLING FLOW COMPLETE ===');
  } catch (e) {
    console.error('FATAL:', e);
    process.exit(1);
  }
})();
