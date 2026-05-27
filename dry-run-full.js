const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Database connection
const dbUrl = 'https://plzkrzzmqatjgsitvmfd.supabase.co';
const localKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ';

const csvPath = path.join(__dirname, 'Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');

// Date parser helpers
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

// Currency parser helper
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

// Slugifier matching client ID logic
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const getClientId = (name) => 'client-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');

async function main() {
  const supabase = createClient(dbUrl, localKey);

  // 1. Fetch existing clients
  const { data: existingClients, error: clientsError } = await supabase.from('clients').select('id, company_name');
  if (clientsError) {
    console.error('Error fetching clients:', clientsError);
    return;
  }
  console.log(`Fetched ${existingClients.length} clients from DB.\n`);

  const clientMap = new Map();
  existingClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  // 2. Read CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  let totalParsedRows = 0;
  let totalNominal = 0;
  let totalPaid = 0;
  let totalSisa = 0;

  const missingOutlets = new Set();
  const matchedOutlets = new Set();

  const statusCounts = { Paid: 0, Partial: 0, Unpaid: 0 };
  const rows = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;

    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') continue;

    // Parse data fields
    const orderStart = parseSingleDate(cols[1]);
    const orderEnd = parseSingleDate(cols[2]);
    const issueDate = parseSingleDate(cols[3]) || orderEnd; // fallback to orderEnd if missing
    const dueDate = parseSingleDate(cols[4]);
    const nominal = parseAmount(cols[5]);
    const payDate = parsePaymentDate(cols[6]);
    const paid = parseAmount(cols[7]);
    const remaining = parseAmount(cols[8]);

    totalParsedRows++;
    totalNominal += nominal;
    totalPaid += paid;
    totalSisa += remaining;

    const match = clientMap.get(outletName.toUpperCase());
    if (match) {
      matchedOutlets.add(outletName);
    } else {
      missingOutlets.add(outletName);
    }

    // Determine status
    let status = 'Unpaid';
    if (paid > 0 && remaining > 0) status = 'Partial';
    else if (remaining <= 0) status = 'Paid';

    statusCounts[status]++;

    rows.push({
      outletName,
      issueDate,
      dueDate,
      totalAmount: nominal,
      amountPaid: paid,
      remaining,
      status,
      payDate
    });
  }

  console.log(`=== DRY RUN SUMMARY ===`);
  console.log(`Total Rows Parsed: ${totalParsedRows}`);
  console.log(`Sum of Nominal Tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`);
  console.log(`Sum of Sudah Dibayar:   Rp ${totalPaid.toLocaleString('id-ID')}`);
  console.log(`Sum of Sisa Tagihan:    Rp ${totalSisa.toLocaleString('id-ID')}`);
  console.log(`Status breakdown:`, statusCounts);
  console.log(`\nMatched Outlets count: ${matchedOutlets.size}`);
  console.log(`Missing Outlets count: ${missingOutlets.size}`);
  if (missingOutlets.size > 0) {
    console.log(`Missing Outlets List:`, Array.from(missingOutlets).sort());
  }

  // Print first 5 rows for validation
  console.log(`\nSample parsed rows (first 5):`);
  console.log(rows.slice(0, 5));
}

main();
