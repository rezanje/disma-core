/**
 * Seed Disma webapp DB from DISMA_keuangan_20Mei2026.json
 *
 * Direct mode: writes to Supabase via @supabase/supabase-js (no dev server needed).
 * Profile selected by NEXT_PUBLIC_SUPABASE_PROFILE env var (local|production).
 *
 * Maps:
 *  - accounts          → bank_accounts (balance = saldo_akhir_20mei, cutoff state)
 *  - receivables       → clients + invoices (AR)
 *  - payables_vendor   → vendors + vendor_bills (AP, outstanding > 0 only)
 *  - payables_personal → vendors + vendor_bills (HILMAN, RIFAI)
 *  - payables_angel    → vendor + vendor_bill (Angel Investor 241.3jt outstanding)
 *  - transactions_mei  → cash_transactions (441 rows of May 1-20 movement)
 *  - JE per txn        → journal_entries + journal_lines (kategori → COA mapping)
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_PROFILE=local node scripts/seed-from-disma-json.js <json-path> [--dry] [--skip-je]
 *   NEXT_PUBLIC_SUPABASE_PROFILE=production node scripts/seed-from-disma-json.js <json-path>
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---------- CLI ----------
const args = process.argv.slice(2);
const jsonPath = args[0];
if (!jsonPath) { console.error('Usage: NEXT_PUBLIC_SUPABASE_PROFILE=local|production node seed-from-disma-json.js <json-path> [--dry] [--skip-je]'); process.exit(1); }
const DRY = args.includes('--dry');
const SKIP_JE = args.includes('--skip-je');

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const SUPABASE_URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error(`❌ Missing Supabase env for profile=${profile}`); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`▶ Profile: ${profile}`);
console.log(`▶ URL: ${SUPABASE_URL}`);
console.log(`▶ Dry run: ${DRY}`);
console.log(`▶ Skip JE: ${SKIP_JE}\n`);

// ---------- Load JSON ----------
const raw = fs.readFileSync(jsonPath, 'utf8');
const D = JSON.parse(raw);
console.log(`✓ Loaded ${jsonPath} (cutoff=${D.metadata.cutoff_date})\n`);

// ---------- Helpers ----------
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const isoDate = (d) => {
  if (!d) return null;
  if (typeof d !== 'string') return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    return d.length === 10 ? `${d}T00:00:00.000Z` : d;
  }
  // dd-MMM-yyyy (e.g. 26-Jan-2026)
  const m = d.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',aug:'08',agu:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12' };
    const mo = months[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}T00:00:00.000Z`;
  }
  // Comma-separated or messy → take first parseable date or return null
  const t = Date.parse(d);
  if (!isNaN(t)) return new Date(t).toISOString();
  return null;
};
const nowIso = new Date().toISOString();
const CUTOFF = D.metadata.cutoff_date; // 2026-05-20

// ---------- Bank account mapping ----------
const BANK_MAP = {
  'BCA':     { id: 'bank-bca',      name: 'BCA',      account_code: '1-1200', account_number: '' },
  'BRI':     { id: 'bank-bri',      name: 'BRI',      account_code: '1-1400', account_number: '' },
  'MANDIRI': { id: 'bank-mandiri',  name: 'Mandiri',  account_code: '1-1300', account_number: '' },
  'KAS':     { id: 'bank-petty',    name: 'Kas Tunai', account_code: '1-1000', account_number: '' },
  'KAS_TUNAI':{ id: 'bank-petty',   name: 'Kas Tunai', account_code: '1-1000', account_number: '' },
};

// ---------- COA mapping (kategori → debit COA) ----------
const COA_BCA = '1-1200', COA_BRI = '1-1400', COA_MANDIRI = '1-1300', COA_KAS = '1-1000';
const COA_AR = '1-2000', COA_AP = '2-1000', COA_INVENTORY = '1-3000';
const COA_LOAN_ANGEL = '2-4000', COA_LOAN_PERSONAL = '2-4000';
const COA_REVENUE = '4-1000', COA_OTHER_REVENUE = '4-2000';
const COA_EQUITY = '3-1000';

// Map bank name → COA
const bankCoa = (name) => BANK_MAP[name]?.account_code || COA_KAS;

// Map kategori → debit COA (when cash out)
const KATEGORI_COA = {
  'BELANJA_BARANG_VENDOR':    COA_INVENTORY,  // Dr Persediaan
  'GAJI_OPERASIONAL_KARYAWAN':'6-1000',       // Dr Beban Gaji
  'MARKETING':                '6-1300',
  'KENDARAAN':                '6-1400',
  'UTILITIES':                '6-1200',
  'OPERASIONAL_KANTOR':       '6-9000',
  'ONGKIR_KIRIM':             '6-1700',
  'BIAYA_BANK':               '6-1600',
  'LAINNYA':                  '6-9000',
  // Special handling (not simple expense):
  'TRANSFER_ANTAR_BANK':      null,
  'PEMASUKAN_PIUTANG':        COA_AR,        // Dr Bank, Cr Piutang
  'REFUND_MASUK':             COA_OTHER_REVENUE,
  'PEMASUKAN_INVESTOR':       COA_LOAN_ANGEL,  // Dr Bank, Cr Utang Investor
  'PENGEMBALIAN_INVESTOR':    COA_LOAN_ANGEL,  // Dr Utang Investor, Cr Bank
};

// ---------- Direct Supabase helper ----------
async function seedTable(table, data) {
  if (data.length === 0) { console.log(`  ⏭  ${table}: no rows`); return; }
  if (DRY) { console.log(`  [DRY] ${table}: would upsert ${data.length} rows`); return; }
  const CHUNK = 500;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      if (/could not find the table|schema cache/i.test(error.message)) {
        console.log(`  ⏭  ${table}: missing table (skip)`); return;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    console.log(`  ✅ ${table} chunk ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows`);
  }
}

// ============================================================
// BUILD SEED DATA
// ============================================================

// --- 0. Missing COA (BRI) ---
const missingCoas = [
  { id: 'coa-1-1400', account_code: '1-1400', account_name: 'Bank BRI', account_type: 'Asset' },
];

// --- 1. Bank Accounts ---
const bankAccounts = D.accounts.map(a => ({
  id: BANK_MAP[a.account_name]?.id || `bank-${slug(a.account_name)}`,
  name: BANK_MAP[a.account_name]?.name || a.account_name,
  account_number: BANK_MAP[a.account_name]?.account_number || '',
  account_code: BANK_MAP[a.account_name]?.account_code || COA_KAS,
  balance: Math.round(a.saldo_akhir_20mei * 100) / 100,
}));

// --- 2. Clients (from unique customers in receivables) ---
const clientMap = new Map();
D.receivables_outstanding.forEach(r => {
  if (!clientMap.has(r.customer)) {
    clientMap.set(r.customer, {
      id: `client-${slug(r.customer)}`,
      company_name: r.customer,
      pic_name: '',
      email: '',
      phone: '',
      address: '',
      payment_term_days: 30,
      created_at: nowIso,
    });
  }
});
const clients = Array.from(clientMap.values());

// --- 3. Invoices (241 outstanding) ---
const invoices = D.receivables_outstanding.map((r, idx) => {
  const totalAmount = r.nominal_tagihan;
  const amountPaid = r.sudah_dibayar || 0;
  const outstanding = r.outstanding;
  let status = 'Unpaid';
  if (amountPaid > 0 && amountPaid < totalAmount) status = 'Partial';
  if (outstanding <= 0) status = 'Paid';

  // Build payments array from "tanggal_bayar_partial" if any
  const payments = [];
  if (r.tanggal_bayar_partial && amountPaid > 0) {
    payments.push({
      id: `pay-${slug(r.customer)}-${idx}`,
      date: isoDate(r.tanggal_bayar_partial),
      amount: amountPaid,
      bankAccountId: 'bank-bca', // unknown, default
      note: 'Partial payment (imported)',
    });
  }

  return {
    id: `inv-import-${String(idx + 1).padStart(4, '0')}`,
    sales_order_id: null,
    sales_order_ids: [],
    is_consolidated: false,
    consolidated_order_numbers: [],
    client_id: `client-${slug(r.customer)}`,
    issue_date: isoDate(r.tanggal_invoice),
    due_date: isoDate(r.jatuh_tempo),
    total_amount: totalAmount,
    amount_paid: amountPaid,
    status,
    payments,
    paid_date: status === 'Paid' ? isoDate(r.tanggal_bayar_partial) || isoDate(CUTOFF) : null,
    superseded_by_invoice_id: null,
  };
});

// --- 4. Vendors (from payables_vendor + suppliers in purchases) ---
const vendorMap = new Map();
const addVendor = (name, extras = {}) => {
  const key = name.trim().toUpperCase();
  if (!vendorMap.has(key)) {
    vendorMap.set(key, {
      id: `vendor-${slug(name)}`,
      company_name: name,
      pic_name: extras.pic || '',
      email: '',
      phone: '',
      address: '',
      created_at: nowIso,
    });
  }
  return vendorMap.get(key).id;
};

D.payables_vendor_estimate.forEach(v => addVendor(v.supplier));
D.purchases_mei.forEach(p => { if (p.supplier) addVendor(p.supplier); });

// Special creditors: personal + angel
D.payables_personal.forEach(p => addVendor(p.creditor));
const ANGEL_VENDOR_ID = addVendor('ANGEL INVESTOR');

const vendors = Array.from(vendorMap.values());

// --- 5. Vendor Bills (AP) ---
const vendorBills = [];

// 5a. Estimated outstanding per supplier (single aggregate bill each)
D.payables_vendor_estimate.forEach(v => {
  if (!v.estimasi_hutang_outstanding || v.estimasi_hutang_outstanding <= 0) return;
  vendorBills.push({
    id: `vb-est-${slug(v.supplier)}`,
    bill_number: `EST-MEI-${slug(v.supplier).toUpperCase().slice(0, 8)}`,
    vendor_id: `vendor-${slug(v.supplier)}`,
    vendor_name: v.supplier,
    issue_date: isoDate('2026-05-01'),
    due_date: isoDate('2026-06-15'),
    description: `Estimasi hutang belanja Mei 1-20 (belanja ${v.belanja_mei_1_20}, bayar ${v.bayar_mei_1_20})`,
    category: 'Bahan Baku',
    total_amount: v.estimasi_hutang_outstanding,
    amount_paid: 0,
    status: 'Unpaid',
    payments: [],
    receipt_url: null,
    purchase_id: null,
    created_at: nowIso,
    created_by: 'import',
  });
});

// 5b. Personal payables
D.payables_personal.forEach((p, idx) => {
  vendorBills.push({
    id: `vb-personal-${slug(p.creditor)}`,
    bill_number: `PERSONAL-${slug(p.creditor).toUpperCase()}`,
    vendor_id: `vendor-${slug(p.creditor)}`,
    vendor_name: p.creditor,
    issue_date: isoDate('2026-01-01'),
    due_date: isoDate('2026-12-31'),
    description: p.jenis === 'cicilan_bulanan'
      ? `Cicilan bulanan ${p.cicilan_per_bulan}/bln, sisa ${p.sisa_bulan} bulan`
      : `Talangan operasional`,
    category: 'Lainnya',
    total_amount: p.total_outstanding,
    amount_paid: 0,
    status: 'Unpaid',
    payments: [],
    receipt_url: null,
    purchase_id: null,
    created_at: nowIso,
    created_by: 'import',
  });
});

// 5c. Angel investor outstanding
const angel = D.payables_angel_investor;
vendorBills.push({
  id: `vb-angel-investor`,
  bill_number: `ANGEL-MEI-2026`,
  vendor_id: ANGEL_VENDOR_ID,
  vendor_name: 'ANGEL INVESTOR',
  issue_date: isoDate(angel.tanggal_pendanaan),
  due_date: isoDate('2026-07-31'),
  description: `Pendanaan ${angel.total_pendanaan_mei}, sudah dikembalikan ${angel.pengembalian_6mei} (6 Mei), sisa outstanding`,
  category: 'Lainnya',
  total_amount: angel.estimasi_sisa_outstanding_per_20mei,
  amount_paid: 0,
  status: 'Unpaid',
  payments: [],
  receipt_url: null,
  purchase_id: null,
  created_at: nowIso,
  created_by: 'import',
});

// --- 6. Cash Transactions (441) ---
const cashTransactions = D.transactions_mei.map((t, idx) => {
  const bankId = BANK_MAP[t.akun]?.id || BANK_MAP['KAS'].id;
  const type = (t.kas_masuk && t.kas_masuk > 0) ? 'In' : 'Out';
  const amount = type === 'In' ? t.kas_masuk : t.kas_keluar;
  return {
    id: `tx-import-${String(idx + 1).padStart(4, '0')}`,
    date: isoDate(t.tgl),
    type,
    amount,
    bank_account_id: bankId,
    category: t.kategori || 'LAINNYA',
    description: t.keterangan || '',
    reference_type: 'Manual',
    reference_id: null,
    counterpart_name: '',
    receipt_url: null,
  };
});

// --- 7. Journal Entries (one per cash txn + opening balance) ---
const journalEntries = [];
const journalLines = [];

// 7a. Opening balance JE at 2026-04-30
// Use saldo_awal_mei + AR opening (recompute) + AP estimated + angel(0 at Apr 30) + personal
const openingId = `je-opening-2026-04-30`;
if (!SKIP_JE) {
  const sumSaldoAwal = D.accounts.reduce((s, a) => s + a.saldo_awal_mei, 0);

  // AR opening = receivables that existed before May 1
  const arOpening = D.receivables_outstanding
    .filter(r => r.tanggal_invoice < '2026-05-01')
    .reduce((s, r) => s + r.nominal_tagihan, 0);

  // AP opening = vendor estimate outstanding (rough, since this is at cutoff, but use as proxy)
  // Better: assume AP opening = 0 and build up via May transactions. But we don't have JE per
  // vendor bill creation. Use vendor estimate as opening-ish (this is approximate.)
  const apOpening = D.payables_vendor_estimate.reduce((s, v) => s + (v.estimasi_hutang_outstanding || 0), 0);
  const personalOpening = D.payables_personal.reduce((s, p) => s + p.total_outstanding, 0);
  // Angel = 0 at Apr 30, will be added when 5 Mei txn hits

  const debits = [];
  const credits = [];

  D.accounts.forEach(a => {
    const coa = BANK_MAP[a.account_name]?.account_code || COA_KAS;
    debits.push({ coa, amount: a.saldo_awal_mei });
  });
  if (arOpening > 0) debits.push({ coa: COA_AR, amount: arOpening });

  if (apOpening > 0) credits.push({ coa: COA_AP, amount: apOpening });
  if (personalOpening > 0) credits.push({ coa: COA_LOAN_PERSONAL, amount: personalOpening });

  const totalDr = debits.reduce((s, d) => s + d.amount, 0);
  const totalCr = credits.reduce((s, c) => s + c.amount, 0);
  // Balance with equity (Modal)
  const equityPlug = totalDr - totalCr;
  if (equityPlug > 0) credits.push({ coa: COA_EQUITY, amount: equityPlug });
  else if (equityPlug < 0) debits.push({ coa: COA_EQUITY, amount: -equityPlug });

  journalEntries.push({
    id: openingId,
    transaction_date: isoDate('2026-04-30'),
    description: 'Opening balance per 30 April 2026 (import dari Excel)',
    reference_type: 'Opening',
    reference_id: 'import-2026-05',
  });
  debits.forEach((d, i) => journalLines.push({
    id: `${openingId}-d${i}`, journal_entry_id: openingId, account_id: d.coa, debit_amount: d.amount, credit_amount: 0,
  }));
  credits.forEach((c, i) => journalLines.push({
    id: `${openingId}-c${i}`, journal_entry_id: openingId, account_id: c.coa, debit_amount: 0, credit_amount: c.amount,
  }));
}

// 7b. JE per cash transaction
if (!SKIP_JE) {
  D.transactions_mei.forEach((t, idx) => {
    const txId = `tx-import-${String(idx + 1).padStart(4, '0')}`;
    const jeId = `je-${txId}`;
    const bankCOA = bankCoa(t.akun);
    const cashIn = t.kas_masuk > 0;
    const amount = cashIn ? t.kas_masuk : t.kas_keluar;
    const kategori = t.kategori || 'LAINNYA';

    let drCOA, crCOA;
    let extraNote = '';

    if (kategori === 'TRANSFER_ANTAR_BANK') {
      // Skip: hard to know counterparty bank. Generate a self-balancing JE: Dr bank-X Cr bank-X (no-op).
      // Skip JE for transfers — too noisy.
      return;
    }

    if (cashIn) {
      // Money in: Dr Bank, Cr {something}
      drCOA = bankCOA;
      if (kategori === 'PEMASUKAN_PIUTANG') crCOA = COA_AR;
      else if (kategori === 'PEMASUKAN_INVESTOR') crCOA = COA_LOAN_ANGEL;
      else if (kategori === 'REFUND_MASUK') crCOA = COA_OTHER_REVENUE;
      else crCOA = COA_OTHER_REVENUE;
    } else {
      // Money out: Dr {expense/AP/loan}, Cr Bank
      crCOA = bankCOA;
      if (kategori === 'PENGEMBALIAN_INVESTOR') drCOA = COA_LOAN_ANGEL;
      else drCOA = KATEGORI_COA[kategori] || '6-9000';
    }

    journalEntries.push({
      id: jeId,
      transaction_date: isoDate(t.tgl),
      description: `${kategori}: ${t.keterangan || ''}`.slice(0, 200),
      reference_type: 'CashTx',
      reference_id: txId,
    });
    journalLines.push({
      id: `${jeId}-d`, journal_entry_id: jeId, account_id: drCOA, debit_amount: amount, credit_amount: 0,
    });
    journalLines.push({
      id: `${jeId}-c`, journal_entry_id: jeId, account_id: crCOA, debit_amount: 0, credit_amount: amount,
    });
  });
}

// ============================================================
// SUMMARY
// ============================================================
console.log('=== SEED SUMMARY ===');
console.log(`  bank_accounts:   ${bankAccounts.length}`);
console.log(`  clients:         ${clients.length}`);
console.log(`  invoices:        ${invoices.length}`);
console.log(`  vendors:         ${vendors.length}`);
console.log(`  vendor_bills:    ${vendorBills.length}`);
console.log(`  cash_transactions:${cashTransactions.length}`);
console.log(`  journal_entries: ${journalEntries.length}`);
console.log(`  journal_lines:   ${journalLines.length}`);
console.log();

// ============================================================
// RUN
// ============================================================
(async () => {
  try {
    console.log('=== UPSERTING ===');
    await seedTable('coas', missingCoas);
    await seedTable('bank_accounts', bankAccounts);
    await seedTable('clients', clients);
    await seedTable('vendors', vendors);
    await seedTable('invoices', invoices);
    await seedTable('vendor_bills', vendorBills);
    await seedTable('cash_transactions', cashTransactions);
    if (!SKIP_JE) {
      await seedTable('journal_entries', journalEntries);
      await seedTable('journal_lines', journalLines);
    }
    console.log('\n=== DONE ===');
  } catch (e) {
    console.error('\n❌ ERROR:', e.message);
    process.exit(1);
  }
})();
