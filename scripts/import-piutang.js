const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Profile configuration (defaults to local)
const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl || !dbKey) {
  console.error(`Missing Supabase credentials for profile: ${profile}`);
  process.exit(1);
}

console.log(`Running import against ${profile} profile...`);

const csvPath = path.join(__dirname, '../Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');

// Helpers
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

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const getClientId = (name) => 'client-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
const nowIso = new Date().toISOString();

async function main() {
  const supabase = createClient(dbUrl, dbKey);

  console.log('Fetching existing clients...');
  const { data: existingClients, error: clientsError } = await supabase.from('clients').select('id, company_name');
  if (clientsError) {
    console.error('Error fetching clients:', clientsError);
    return;
  }

  const clientMap = new Map();
  existingClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  const missingClientsMap = new Map();
  const invoicesToInsert = [];

  let idx = 0;

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
    const payDate = parsePaymentDate(cols[6]);
    const paid = parseAmount(cols[7]);
    const remaining = parseAmount(cols[8]);

    const upperOutlet = outletName.toUpperCase();
    let clientId;

    if (clientMap.has(upperOutlet)) {
      clientId = clientMap.get(upperOutlet).id;
    } else {
      clientId = getClientId(outletName);
      if (!missingClientsMap.has(clientId)) {
        missingClientsMap.set(clientId, {
          id: clientId,
          company_name: outletName,
          pic_name: '',
          email: '',
          phone: '',
          address: '',
          payment_term_days: 30,
          created_at: nowIso
        });
      }
    }

    let status = 'Unpaid';
    if (paid > 0 && remaining > 0) status = 'Partial';
    else if (remaining <= 0) status = 'Paid';

    const payments = [];
    if (paid > 0 && payDate) {
      payments.push({
        id: `pay-${slug(outletName)}-${idx}`,
        date: payDate,
        amount: paid,
        bankAccountId: 'bank-bca',
        note: 'Partial payment (imported)'
      });
    } else if (paid > 0) {
       payments.push({
        id: `pay-${slug(outletName)}-${idx}`,
        date: issueDate || nowIso, // Fallback if no payment date explicitly defined
        amount: paid,
        bankAccountId: 'bank-bca',
        note: 'Partial payment (imported)'
      });
    }

    invoicesToInsert.push({
      id: `inv-import-${String(idx + 1).padStart(4, '0')}`,
      sales_order_id: null,
      sales_order_ids: [],
      is_consolidated: false,
      consolidated_order_numbers: [],
      client_id: clientId,
      issue_date: issueDate || nowIso, // Fallback to now if totally missing
      due_date: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      total_amount: nominal,
      amount_paid: paid,
      status,
      payments,
      paid_date: status === 'Paid' ? (payDate || issueDate || nowIso) : null
    });

    idx++;
  }

  const missingClientsArray = Array.from(missingClientsMap.values());
  if (missingClientsArray.length > 0) {
    console.log(`\nUpserting ${missingClientsArray.length} missing clients...`);
    const { error: insertClientsError } = await supabase.from('clients').upsert(missingClientsArray, { onConflict: 'id' });
    if (insertClientsError) {
      console.error('Error inserting clients:', insertClientsError);
      return;
    }
    console.log('Missing clients inserted successfully.');
  }

  if (invoicesToInsert.length > 0) {
    console.log(`\nUpserting ${invoicesToInsert.length} invoices...`);
    const CHUNK_SIZE = 100;
    for (let i = 0; i < invoicesToInsert.length; i += CHUNK_SIZE) {
      const chunk = invoicesToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertInvoicesError } = await supabase.from('invoices').upsert(chunk, { onConflict: 'id' });
      if (insertInvoicesError) {
         console.error(`Error inserting invoices chunk ${i/CHUNK_SIZE + 1}:`, insertInvoicesError);
         return;
      }
      console.log(`Inserted invoices chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} rows)`);
    }
    console.log('Invoices inserted successfully.');
  }

  console.log('\nImport complete!');
}

main();
