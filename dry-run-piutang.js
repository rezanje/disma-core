const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const dbUrl = 'https://plzkrzzmqatjgsitvmfd.supabase.co';
const dbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc3NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'; // Wait, let's verify if key has changed or we copy the correct local service key from .env.local
// Let's use the local service key from .env.local to be safe.
const localKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ';

const csvPath = path.join(__dirname, 'Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');

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

async function main() {
  const supabase = createClient(dbUrl, localKey);

  // 1. Fetch existing clients
  const { data: existingClients, error: clientsError } = await supabase.from('clients').select('id, company_name');
  if (clientsError) {
    console.error('Error fetching clients:', clientsError);
    return;
  }
  console.log(`Fetched ${existingClients.length} clients from DB.`);

  // Create a map of normalized company name -> client
  const clientMap = new Map();
  existingClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  // 2. Read CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  let parsedCount = 0;
  const uniqueCSVOutlets = new Set();
  const missingOutlets = new Set();

  // CSV has headers:
  // Row 1: empty/commas
  // Row 2: headers (Nama Outlet, Periode Order, etc.)
  // Data starts at row 3 (lines[2])
  
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;

    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet') continue;

    parsedCount++;
    uniqueCSVOutlets.add(outletName);

    const match = clientMap.get(outletName.toUpperCase());
    if (!match) {
      missingOutlets.add(outletName);
    }
  }

  console.log(`\nParsed ${parsedCount} rows from CSV.`);
  console.log(`Found ${uniqueCSVOutlets.size} unique outlets in CSV.`);
  console.log(`Outlets missing in DB: ${missingOutlets.size}`);
  if (missingOutlets.size > 0) {
    console.log('Missing outlets list:', Array.from(missingOutlets));
  } else {
    console.log('All CSV outlets found in DB!');
  }
}

main();
