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

const COA_ID_MAP = {
  '1-1000': 'coa-1',
  '1-1200': 'coa-1-2',
  '1-1300': 'coa-1-3',
  '1-1400': 'coa-1-4',
  '1-1999': 'coa-transfer-clearing',
  '1-1500': 'coa-1-5',
  '1-1510': 'coa-1-5-1',
  '1-2000': 'coa-2',
  '1-3000': 'coa-3',
  '1-4000': 'coa-4',
  '1-4100': 'coa-4-1',
  '1-4999': 'coa-5',
  '2-1000': 'coa-10',
  '2-2000': 'coa-10-2',
  '2-3000': 'coa-10-3',
  '2-4000': 'coa-10-4',
  '3-1000': 'coa-11',
  '3-2000': 'coa-11-2',
  '4-1000': 'coa-12',
  '4-2000': 'coa-12-2',
  '5-1000': 'coa-13',
  '5-2000': 'coa-14',
  '6-1000': 'coa-15',
  '6-1100': 'coa-15-2',
  '6-1200': 'coa-9-2',
  '6-1300': 'coa-9-3',
  '6-1400': 'coa-9-4',
  '6-1500': 'coa-9-5',
  '6-1600': 'coa-9-6',
  '6-1700': 'coa-9-7',
  '6-3000': 'coa-17',
  '6-9000': 'coa-9-9'
};

const getCoaId = (code) => COA_ID_MAP[code] || code;

// Map bank name → COA
const bankCoa = (name) => BANK_MAP[name]?.account_code || COA_KAS;

// Map kategori → debit COA (when cash out)
const KATEGORI_COA = {
  'BELANJA_BARANG_VENDOR':    '5-1000',       // Dr HPP (instead of COA_INVENTORY)
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

// --- 0. Missing COA (BRI, Clearing) ---
const missingCoas = [
  { id: 'coa-1-4', account_code: '1-1400', account_name: 'Bank BRI', account_type: 'Asset' },
  { id: 'coa-transfer-clearing', account_code: '1-1999', account_name: 'Transfer Antar Bank (Clearing)', account_type: 'Asset' },
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
  if (r.customer && r.customer.toUpperCase().includes('FRESH BOX')) return; // Exclude Fresh Box client
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
const invoices = D.receivables_outstanding
  .filter(r => !(r.customer && r.customer.toUpperCase().includes('FRESH BOX'))) // Exclude Fresh Box invoices
  .map((r, idx) => {
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
const allowedSourcingVendors = {
  'AA UTOM': 20161400,
  'ALDIANSYAH': 25191050,
  'KEVIN': 26453500,
  'PESEK': 3960000,
  'SUMINTO': 807000,
  'TOKO ERNI': 42992000,
  'TOKO OMO': 1120000
};

D.payables_vendor_estimate.forEach(v => {
  const supplierKey = v.supplier.trim().toUpperCase();
  if (allowedSourcingVendors[supplierKey] === undefined) return;
  const outstandingAmount = allowedSourcingVendors[supplierKey];
  vendorBills.push({
    id: `vb-est-${slug(v.supplier)}`,
    bill_number: `EST-MEI-${slug(v.supplier).toUpperCase().slice(0, 8)}`,
    vendor_id: `vendor-${slug(v.supplier)}`,
    vendor_name: v.supplier,
    issue_date: isoDate('2026-05-01'),
    due_date: isoDate('2026-06-15'),
    description: `Estimasi hutang belanja Mei 1-20 (belanja ${v.belanja_mei_1_20}, bayar ${v.bayar_mei_1_20})`,
    category: 'Bahan Baku',
    total_amount: outstandingAmount,
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

// --- 6. Cash Transactions (non-zero transactions only) ---
const validTransactionsMei = D.transactions_mei.filter(t => {
  const masuk = Number(t.kas_masuk || 0);
  const keluar = Number(t.kas_keluar || 0);
  return masuk > 0 || keluar > 0;
});

const cashTransactions = validTransactionsMei.map((t, idx) => {
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

  // AR opening = receivables that existed before May 1 (excluding Fresh Box)
  const arOpening = D.receivables_outstanding
    .filter(r => r.tanggal_invoice < '2026-05-01' && !(r.customer && r.customer.toUpperCase().includes('FRESH BOX')))
    .reduce((s, r) => s + r.nominal_tagihan, 0);

  // AP opening = sourcing vendors (196,038,303.00) + personal payables (3,580,000.00)
  const apOpening = 199618303;
  const personalOpening = 0; // Included in apOpening (2-1000)
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
    id: `${openingId}-d${i}`, journal_entry_id: openingId, account_id: getCoaId(d.coa), debit_amount: d.amount, credit_amount: 0,
  }));
  credits.forEach((c, i) => journalLines.push({
    id: `${openingId}-c${i}`, journal_entry_id: openingId, account_id: getCoaId(c.coa), debit_amount: 0, credit_amount: c.amount,
  }));
}

// 7b. JE per cash transaction
if (!SKIP_JE) {
  validTransactionsMei.forEach((t, idx) => {
    const txId = `tx-import-${String(idx + 1).padStart(4, '0')}`;
    const jeId = `je-${txId}`;
    const bankCOA = bankCoa(t.akun);
    const cashIn = t.kas_masuk > 0;
    const amount = cashIn ? t.kas_masuk : t.kas_keluar;
    
    let kategori = t.kategori || 'LAINNYA';
    // Fix miscategorized transfer
    if (t.keterangan && t.keterangan.includes('Simpan Fixed Cost Disma Ke Mandiri')) {
      kategori = 'TRANSFER_ANTAR_BANK';
    }

    const isFreshBox = t.keterangan && t.keterangan.toUpperCase().includes('FRESH BOX');

    let drCOA, crCOA;

    if (isFreshBox) {
      // Net Method for pass-through project: map all Fresh Box cash flows to clearing account
      if (cashIn) {
        drCOA = bankCOA;
        crCOA = '1-1999'; // Transfer Clearing
      } else {
        drCOA = '1-1999'; // Transfer Clearing
        crCOA = bankCOA;
      }
    } else if (kategori === 'TRANSFER_ANTAR_BANK') {
      if (cashIn) {
        drCOA = bankCOA;
        crCOA = '1-1999';
      } else {
        drCOA = '1-1999';
        crCOA = bankCOA;
      }
    } else if (cashIn) {
      // Money in: Dr Bank, Cr {something}
      drCOA = bankCOA;
      if (kategori === 'PEMASUKAN_PIUTANG') crCOA = COA_AR;
      else if (kategori === 'PEMASUKAN_INVESTOR') crCOA = COA_LOAN_ANGEL;
      else if (kategori === 'REFUND_MASUK') crCOA = COA_OTHER_REVENUE;
      else crCOA = COA_OTHER_REVENUE;
    } else {
      // Money out: Dr {expense/AP/loan}, Cr Bank
      crCOA = bankCOA;
      if (kategori === 'PENGEMBALIAN_INVESTOR') {
        drCOA = COA_LOAN_ANGEL;
      } else if (kategori === 'PEMASUKAN_PIUTANG') {
        // Fix Fresh Box collection cash outflow bug: map to HPP (fallback, but shouldn't hit with isFreshBox check)
        drCOA = '5-1000';
      } else if (kategori === 'BELANJA_BARANG_VENDOR') {
        const desc = (t.keterangan || '').toLowerCase();
        const isAdvance = desc.includes('uang belanja') && (desc.includes('hilman') || desc.includes('bagus') || desc.includes('zaki'));
        if (isAdvance) {
          drCOA = COA_KAS; // '1-1000' (Kas Tunai/Petty Cash advance)
        } else {
          drCOA = COA_AP;  // '2-1000' (Accounts Payable payment)
        }
      } else {
        drCOA = KATEGORI_COA[kategori] || '6-9000';
      }
    }

    journalEntries.push({
      id: jeId,
      transaction_date: isoDate(t.tgl),
      description: `${kategori}: ${t.keterangan || ''}`.slice(0, 200),
      reference_type: 'CashTx',
      reference_id: txId,
    });
    journalLines.push({
      id: `${jeId}-d`, journal_entry_id: jeId, account_id: getCoaId(drCOA), debit_amount: amount, credit_amount: 0,
    });
    journalLines.push({
      id: `${jeId}-c`, journal_entry_id: jeId, account_id: getCoaId(crCOA), debit_amount: 0, credit_amount: amount,
    });
  });

  // 7c. JE per May invoice (recognized as Sales Revenue in May)
  invoices.forEach((inv) => {
    if (inv.issue_date && inv.issue_date >= '2026-05-01') {
      const jeId = `je-sales-${inv.id}`;
      journalEntries.push({
        id: jeId,
        transaction_date: inv.issue_date,
        description: `Recognize May sales revenue for invoice ${inv.id}`,
        reference_type: 'Invoice',
        reference_id: inv.id,
      });
      journalLines.push({
        id: `${jeId}-d`,
        journal_entry_id: jeId,
        account_id: getCoaId(COA_AR), // '1-2000' (Piutang Usaha)
        debit_amount: inv.total_amount,
        credit_amount: 0,
      });
      journalLines.push({
        id: `${jeId}-c`,
        journal_entry_id: jeId,
        account_id: getCoaId(COA_REVENUE), // '4-1000' (Sales Revenue)
        debit_amount: 0,
        credit_amount: inv.total_amount,
      });
    }
  });

  // 7d. JE to recognize Fresh Box project net fee (Net Method)
  const feeJeId = 'je-freshbox-fee';
  const feeAmount = 1717881;
  journalEntries.push({
    id: feeJeId,
    transaction_date: isoDate('2026-05-20'),
    description: 'Recognize Fresh Box net project fee (Net Method)',
    reference_type: 'Manual',
    reference_id: 'freshbox-fee-2026-05',
  });
  journalLines.push({
    id: `${feeJeId}-d`,
    journal_entry_id: feeJeId,
    account_id: getCoaId('1-1999'), // Transfer Clearing
    debit_amount: feeAmount,
    credit_amount: 0,
  });
  journalLines.push({
    id: `${feeJeId}-c`,
    journal_entry_id: feeJeId,
    account_id: getCoaId('4-2000'), // Pendapatan Lain-lain
    debit_amount: 0,
    credit_amount: feeAmount,
  });

  // 7e. May Purchases Journal Entry
  const hppJeId = 'je-may-hpp';
  journalEntries.push({
    id: hppJeId,
    transaction_date: isoDate('2026-05-20'),
    description: 'Manual JE: May Sourcing Purchases (HPP)',
    reference_type: 'Manual',
    reference_id: 'may-hpp-2026-05',
  });
  journalLines.push({
    id: `${hppJeId}-d`,
    journal_entry_id: hppJeId,
    account_id: getCoaId('5-1000'), // HPP
    debit_amount: 388519296.00,
    credit_amount: 0,
  });
  journalLines.push({
    id: `${hppJeId}-c`,
    journal_entry_id: hppJeId,
    account_id: getCoaId('2-1000'), // Accounts Payable
    debit_amount: 0,
    credit_amount: 388519296.00,
  });

  // 7f. Sourcing Settlement & OPEX Journal Entry
  const settlementJeId = 'je-sourcing-settlement';
  journalEntries.push({
    id: settlementJeId,
    transaction_date: isoDate('2026-05-20'),
    description: 'Manual JE: Sourcing Settlement & May OPEX',
    reference_type: 'Manual',
    reference_id: 'sourcing-settlement-2026-05',
  });
  // Debits:
  journalLines.push({
    id: `${settlementJeId}-d1`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('2-1000'), // Accounts Payable (cash vendor payments)
    debit_amount: 75174000.00,
    credit_amount: 0,
  });
  journalLines.push({
    id: `${settlementJeId}-d2`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('6-1400'), // Beban Transportasi & BBM
    debit_amount: 7458000.00,
    credit_amount: 0,
  });
  journalLines.push({
    id: `${settlementJeId}-d3`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('6-1000'), // Beban Gaji & Tunjangan
    debit_amount: 440000.00,
    credit_amount: 0,
  });
  journalLines.push({
    id: `${settlementJeId}-d4`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('6-9000'), // Beban Operasional Lainnya
    debit_amount: 6883000.00,
    credit_amount: 0,
  });
  // Credits:
  journalLines.push({
    id: `${settlementJeId}-c1`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('1-1000'), // Kas Tunai / Petty Cash (advance usage)
    debit_amount: 0,
    credit_amount: 78782000.00,
  });
  journalLines.push({
    id: `${settlementJeId}-c2`,
    journal_entry_id: settlementJeId,
    account_id: getCoaId('2-1000'), // Accounts Payable (employee out-of-pocket / reimbursement due)
    debit_amount: 0,
    credit_amount: 11173000.00,
  });

  // 7g. Adjusting Journal Entry for Overlapping April/May Revenue (May 1-3)
  const adjJeId = 'je-adjusting-revenue-overlap';
  const overlappingRevenueTxs = [
    { client: 'BAKMIE TAAT', date: '2026-05-02', po: '89099', invoice: '23952', total: 88250 },
    { client: 'DAILY BREAD EPICENTRUM', date: '2026-05-02', po: '89092', invoice: '23945', total: 1971440 },
    { client: 'CENTRAL KITCHEN SEINDONESIA KIAT ANANDA', date: '2026-05-01', po: 'P80066', invoice: '23930', total: 37990000 },
    { client: 'CENTRAL KITCHEN SEINDONESIA KIAT ANANDA', date: '2026-05-02', po: 'P80067', invoice: '23944', total: 34625000 },
    { client: 'CENTRAL KITCHEN SEINDONESIA KIAT ANANDA', date: '2026-05-03', po: 'P80068', invoice: '23958', total: 32220000 },
    { client: 'BAPAK DAMAR', date: '2026-05-01', po: '89087', invoice: '23934', total: 146250 },
    { client: 'MEAT A MEAT STEAK', date: '2026-05-01', po: '89089', invoice: '23936', total: 1010000 },
    { client: 'MEAT A MEAT STEAK', date: '2026-05-02', po: '89100', invoice: '23960', total: 650000 },
    { client: 'PEPR BURGER SENAYAN', date: '2026-05-01', po: '89091', invoice: '23938', total: 905000 },
    { client: 'PEPR BURGER SENAYAN', date: '2026-05-02', po: '89097', invoice: '23950', total: 640000 },
    { client: 'SHOTS COFFEE', date: '2026-05-02', po: '89096', invoice: '23949', total: 2433000 },
    { client: 'VIETNAMESE PHO 24 NOODLE', date: '2026-05-01', po: 'PO260400193/001', invoice: '23925', total: 1702000 },
    { client: 'PEPR BURGER UF CIPETE', date: '2026-05-01', po: '89090', invoice: '23937', total: 603000 },
    { client: 'PEPR BURGER UF CIPETE', date: '2026-05-02', po: '89098', invoice: '23951', total: 145000 },
    { client: 'NARASA', date: '2026-05-01', po: '89088', invoice: '23935', total: 1108500 },
    { client: 'KEDAI MIE TJAP 1000 TAHUN Senopati', date: '2026-05-01', po: 'PO202604300001', invoice: '23932', total: 105500 },
    { client: 'KEDAI MIE TJAP 1000 TAHUN SCBD', date: '2026-05-01', po: 'PO202604300001', invoice: '23933', total: 311000 },
    { client: 'KEDAI MIE TJAP 1000 TAHUN BINTARO', date: '2026-05-01', po: 'PO202604300003', invoice: '23931', total: 91000 },
    { client: 'THE HALAL GUYS SMB', date: '2026-05-02', po: '89095', invoice: '23948', total: 1118160 },
    { client: 'HOLYCOW BY CHEF AFIT - CITOS', date: '2026-05-01', po: 'PO2026042800035', invoice: '23928', total: 260000 },
    { client: 'HOLYCOW BY CHEF AFIT - CIBUBUR', date: '2026-05-02', po: 'PO2026042800067', invoice: '23942', total: 260000 },
    { client: 'HOLYCOW BY CHEF AFIT - ALAM SUTERA', date: '2026-05-01', po: 'PO2026042900068', invoice: '23926', total: 286000 },
    { client: 'HOLYCOW BY CHEF AFIT - KEBON JERUK', date: '2026-05-01', po: 'PO202604290066', invoice: '23927', total: 344000 },
    { client: 'HOLYCOW BY CHEF AFIT - KALIMALANG', date: '2026-05-02', po: 'PO202604300008', invoice: '23940', total: 260000 },
    { client: 'HOLYCOW BY CHEF AFIT - GADING SERPONG', date: '2026-05-02', po: 'PO2026043000031', invoice: '23941', total: 130000 },
    { client: 'HOLYCOW BY CHEF AFIT - WOLTER', date: '2026-05-01', po: 'PO202604300024', invoice: '23929', total: 130000 },
    { client: 'HOLYCOW BY CHEF AFIT - WOLTER', date: '2026-05-02', po: 'PO202604290079', invoice: '23939', total: 740000 },
    { client: 'HOLYCOW BY CHEF AFIT - MAMPANG', date: '2026-05-02', po: 'PO202604300053', invoice: '23943', total: 260000 },
    { client: 'SLICED PIZZA PONDOK PINANG', date: '2026-05-02', po: '89094', invoice: '23947', total: 132000 },
    { client: 'SLICED PIZZA CIBIS', date: '2026-05-02', po: '89093', invoice: '23946', total: 1368500 }
  ];

  const totalAdj = overlappingRevenueTxs.reduce((sum, tx) => sum + tx.total, 0);

  journalEntries.push({
    id: adjJeId,
    transaction_date: isoDate('2026-05-01'),
    description: 'Adjusting Journal Entry: Overlapping April-May revenue recognized in May',
    reference_type: 'Manual',
    reference_id: 'revenue-overlap-2026-05',
  });

  // Debit Equity (3-1000)
  journalLines.push({
    id: `${adjJeId}-d`,
    journal_entry_id: adjJeId,
    account_id: getCoaId(COA_EQUITY), // '3-1000'
    debit_amount: totalAdj,
    credit_amount: 0,
  });

  // Credit Revenue (4-1000) distributed per client/transaction
  overlappingRevenueTxs.forEach((tx, idx) => {
    journalLines.push({
      id: `${adjJeId}-c${idx}`,
      journal_entry_id: adjJeId,
      account_id: getCoaId(COA_REVENUE), // '4-1000'
      debit_amount: 0,
      credit_amount: tx.total,
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
    console.log('=== CLEANING OLD IMPORTED ENTRIES ===');
    if (!DRY) {
      const { error: jlErr } = await supabase.from('journal_lines').delete().like('id', 'je-%');
      if (jlErr) console.warn('  ⚠️  Warning clearing journal_lines:', jlErr.message);
      
      const { error: jeErr } = await supabase.from('journal_entries').delete().like('id', 'je-%');
      if (jeErr) console.warn('  ⚠️  Warning clearing journal_entries:', jeErr.message);

      const { error: txErr } = await supabase.from('cash_transactions').delete().like('id', 'tx-import-%');
      if (txErr) console.warn('  ⚠️  Warning clearing cash_transactions:', txErr.message);

      const { error: invErr } = await supabase.from('invoices').delete().like('id', 'inv-import-%');
      if (invErr) console.warn('  ⚠️  Warning clearing invoices:', invErr.message);
    }

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
