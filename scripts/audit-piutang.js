const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Force production profile (where the data actually went)
const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const csvPath = path.join(__dirname, '../Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');

// === Same parsing helpers as import script ===
function parseSingleDate(str) {
  if (!str) return null;
  let cleaned = str.replace(/-/g, ' ').trim();
  const match = cleaned.match(/^(\d{1,2})\s*([A-Za-z]+)\s*['\s]*(\d{2,4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const monthStr = match[2].toLowerCase();
  const yearStr = match[3];
  const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', april: '04',
    mei: '05', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', agu: '08', agust: '08', sep: '09', sept: '09',
    oct: '10', okt: '10', nov: '11', dec: '12', des: '12'
  };
  const month = months[monthStr];
  if (!month) return null;
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function parsePaymentDate(str) {
  if (!str) return null;
  str = str.trim();
  if (!str) return null;
  const segments = str.split(/[&,]/).map(s => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (/[A-Za-z]+/.test(seg)) {
      const parsed = parseSingleDate(seg);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/Rp/gi, '').replace(/\s/g, '').replace(/,/g, '');
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  const supabase = createClient(dbUrl, dbKey);

  // 1. Fetch all imported invoices
  console.log(`\n========== AUDIT: ${profile} database ==========\n`);
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .like('id', 'inv-import-%')
    .order('id', { ascending: true });
  if (invErr) { console.error('Error:', invErr); return; }

  // 2. Parse CSV to build expected data
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');
  const expected = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;
    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') continue;

    const orderEnd = parseSingleDate(cols[2]);
    const issueDate = parseSingleDate(cols[3]) || orderEnd;
    const dueDate = parseSingleDate(cols[4]);
    const nominal = parseAmount(cols[5]);
    const payDateRaw = cols[6];
    const payDate = parsePaymentDate(cols[6]);
    const paid = parseAmount(cols[7]);
    const remaining = parseAmount(cols[8]);

    let status = 'Unpaid';
    if (paid > 0 && remaining > 0) status = 'Partial';
    else if (remaining <= 0) status = 'Paid';

    expected.push({
      csvLine: i + 1,
      outletName,
      issueDate,
      dueDate,
      nominal,
      payDateRaw: payDateRaw?.trim() || '',
      payDate,
      paid,
      remaining,
      status
    });
  }

  console.log(`CSV rows: ${expected.length}`);
  console.log(`DB invoices (inv-import-*): ${invoices.length}`);

  if (expected.length !== invoices.length) {
    console.log(`\n⚠️  COUNT MISMATCH: CSV has ${expected.length} rows but DB has ${invoices.length} invoices!\n`);
  }

  // 3. Compare row-by-row
  const issues = [];

  for (let idx = 0; idx < expected.length; idx++) {
    const exp = expected[idx];
    const invId = `inv-import-${String(idx + 1).padStart(4, '0')}`;
    const inv = invoices.find(i => i.id === invId);

    if (!inv) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `MISSING in DB: ${invId}` });
      continue;
    }

    // Check amounts
    if (Number(inv.total_amount) !== exp.nominal) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `total_amount: DB=${inv.total_amount} CSV=${exp.nominal}` });
    }
    if (Number(inv.amount_paid) !== exp.paid) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `amount_paid: DB=${inv.amount_paid} CSV=${exp.paid}` });
    }
    if (inv.status !== exp.status) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `status: DB="${inv.status}" CSV="${exp.status}"` });
    }
    if (inv.issue_date !== exp.issueDate) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `issue_date: DB="${inv.issue_date}" CSV="${exp.issueDate}"` });
    }
    if (inv.due_date !== exp.dueDate) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `due_date: DB="${inv.due_date}" CSV="${exp.dueDate}"` });
    }

    // Check status edge cases
    // "Paid" with negative remaining (overpayment) — CSV says -Rp xxx meaning remaining is negative
    if (exp.remaining < 0 && inv.status !== 'Paid') {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `Overpaid row not marked Paid. remaining=${exp.remaining}` });
    }

    // Check payment date parsing issues
    if (exp.payDateRaw && !exp.payDate) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `UNPARSED payment date: "${exp.payDateRaw}"` });
    }

    // Check payments array
    const payments = inv.payments || [];
    if (exp.paid > 0 && payments.length === 0) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `paid=${exp.paid} but no payments recorded in DB` });
    }
    if (exp.paid === 0 && payments.length > 0) {
      issues.push({ csvLine: exp.csvLine, outlet: exp.outletName, issue: `paid=0 but DB has ${payments.length} payment(s)` });
    }
  }

  // 4. Summary
  console.log(`\n--- ISSUES FOUND: ${issues.length} ---`);
  if (issues.length === 0) {
    console.log('✅ All rows match perfectly!');
  } else {
    for (const iss of issues) {
      console.log(`  Line ${iss.csvLine} | ${iss.outlet} | ${iss.issue}`);
    }
  }

  // 5. Spot-check some specific tricky rows
  console.log('\n--- SPOT CHECKS (tricky rows) ---');

  // Row 43: CENTRAL KITCHEN with "1&27April'26 & 5Mei'26" payment date and negative remaining
  const ck43 = invoices.find(i => i.id === 'inv-import-0042');
  if (ck43) {
    console.log(`\nCK SEINDONESIA (line 43): id=${ck43.id}`);
    console.log(`  total_amount=${ck43.total_amount} (expected 140357400)`);
    console.log(`  amount_paid=${ck43.amount_paid} (expected 140359480)`);
    console.log(`  status=${ck43.status} (expected Paid, remaining -2080)`);
    console.log(`  paid_date=${ck43.paid_date}`);
    console.log(`  payments=${JSON.stringify(ck43.payments)}`);
  }

  // Row 82: MEAT A MEAT with "1 & 6 Apr 2026" payment and negative remaining
  const meat82 = invoices.find(i => i.id === 'inv-import-0081');
  if (meat82) {
    console.log(`\nMEAT A MEAT (line 82): id=${meat82.id}`);
    console.log(`  total_amount=${meat82.total_amount} (expected 960000)`);
    console.log(`  amount_paid=${meat82.amount_paid} (expected 1950000)`);
    console.log(`  status=${meat82.status} (expected Paid, remaining -990000)`);
    console.log(`  paid_date=${meat82.paid_date}`);
    console.log(`  payments=${JSON.stringify(meat82.payments)}`);
  }

  // Row 7: HOLYCOW CIJANTUNG with "2,13,17Mar'26" payment date
  const hc7 = invoices.find(i => i.id === 'inv-import-0005');
  if (hc7) {
    console.log(`\nHOLYCOW CIJANTUNG (line 7): id=${hc7.id}`);
    console.log(`  total_amount=${hc7.total_amount} (expected 9582500)`);
    console.log(`  amount_paid=${hc7.amount_paid} (expected 9492500)`);
    console.log(`  status=${hc7.status} (expected Partial, remaining 90000)`);
    console.log(`  paid_date=${hc7.paid_date}`);
    console.log(`  payments=${JSON.stringify(hc7.payments)}`);
  }

  // Row 29: FRESH BOX with "5,12,19Mei'26" payment date
  const fb29 = invoices.find(i => i.id === 'inv-import-0028');
  if (fb29) {
    console.log(`\nFRESH BOX (line 29): id=${fb29.id}`);
    console.log(`  total_amount=${fb29.total_amount} (expected 128234400)`);
    console.log(`  amount_paid=${fb29.amount_paid} (expected 113155950)`);
    console.log(`  status=${fb29.status} (expected Partial, remaining 15078450)`);
    console.log(`  payments=${JSON.stringify(fb29.payments)}`);
  }

  // 6. Check total amounts match CSV grand total
  const csvTotalNominal = expected.reduce((s, e) => s + e.nominal, 0);
  const csvTotalPaid = expected.reduce((s, e) => s + e.paid, 0);
  const csvTotalRemaining = expected.reduce((s, e) => s + e.remaining, 0);
  const dbTotalAmount = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const dbTotalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);

  console.log('\n--- GRAND TOTALS ---');
  console.log(`CSV Total Nominal:   Rp ${csvTotalNominal.toLocaleString()}`);
  console.log(`DB  Total Amount:    Rp ${dbTotalAmount.toLocaleString()}`);
  console.log(`Match: ${csvTotalNominal === dbTotalAmount ? '✅' : '❌'}`);
  console.log(`CSV Total Paid:      Rp ${csvTotalPaid.toLocaleString()}`);
  console.log(`DB  Total Paid:      Rp ${dbTotalPaid.toLocaleString()}`);
  console.log(`Match: ${csvTotalPaid === dbTotalPaid ? '✅' : '❌'}`);
  console.log(`CSV Total Remaining: Rp ${csvTotalRemaining.toLocaleString()}`);

  // 7. Status breakdown
  const statusCounts = {};
  for (const inv of invoices) {
    statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
  }
  console.log('\n--- STATUS BREAKDOWN ---');
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  
  // 8. Check for negative remaining that's wrongly classified
  const negativeRemaining = expected.filter(e => e.remaining < 0);
  console.log(`\n--- NEGATIVE REMAINING (overpayments): ${negativeRemaining.length} ---`);
  for (const nr of negativeRemaining) {
    console.log(`  Line ${nr.csvLine}: ${nr.outletName} - remaining=${nr.remaining}, paid=${nr.paid}, nominal=${nr.nominal}`);
  }
}

main();
