const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/Rp/gi, '').replace(/\s/g, '').replace(/,/g, '');
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  const supabase = createClient(dbUrl, dbKey);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_id, total_amount, amount_paid, status, issue_date, due_date')
    .like('id', 'inv-import-%')
    .order('id', { ascending: true });

  const csvPath = path.join(__dirname, '../Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  console.log(`DB invoices: ${invoices.length}`);
  console.log('\n--- SIDE-BY-SIDE: First 10 rows ---');
  console.log('idx | inv_id            | DB client_id (amount)                      | CSV outlet (amount)');
  console.log('-'.repeat(120));

  let csvIdx = 0;
  for (let i = 2; i < lines.length && csvIdx < 10; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;
    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') continue;
    const nominal = parseAmount(cols[5]);

    const inv = invoices[csvIdx];
    const match = inv && Number(inv.total_amount) === nominal ? '✅' : '❌';
    console.log(`${String(csvIdx).padStart(3)} | ${inv?.id || 'MISSING'.padEnd(17)} | ${match} ${inv?.client_id?.slice(0, 40).padEnd(40)} (${inv?.total_amount}) | ${outletName.slice(0, 40).padEnd(40)} (${nominal})`);
    csvIdx++;
  }

  // Check mismatches in amounts for all rows
  let mismatches = 0;
  csvIdx = 0;
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;
    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') continue;
    const nominal = parseAmount(cols[5]);
    const paid = parseAmount(cols[7]);

    const inv = invoices[csvIdx];
    if (inv && (Number(inv.total_amount) !== nominal || Number(inv.amount_paid) !== paid)) {
      mismatches++;
      if (mismatches <= 20) {
        console.log(`\n❌ MISMATCH at idx=${csvIdx}: ${inv.id}`);
        console.log(`   DB:  total=${inv.total_amount} paid=${inv.amount_paid} client=${inv.client_id}`);
        console.log(`   CSV: total=${nominal} paid=${paid} outlet=${outletName}`);
      }
    }
    csvIdx++;
  }
  console.log(`\nTotal mismatches: ${mismatches} / ${csvIdx}`);
}

main();
