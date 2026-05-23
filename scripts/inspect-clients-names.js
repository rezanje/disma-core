const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const csvPath = path.join(__dirname, '../total order januari - mei.csv');

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
  console.log(`Using DB URL: ${dbUrl}`);

  const { data: dbClients, error } = await supabase
    .from('clients')
    .select('id, company_name, total_order_jan_may')
    .order('company_name');
  
  if (error) {
    console.error('Error:', error);
    return;
  }

  // Parse CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');
  const csvOutlets = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;

    const outletName = cols[0].trim();
    if (!outletName || outletName.toUpperCase() === 'TOTAL' || outletName.toUpperCase() === 'NAMA OUTLET') continue;
    csvOutlets.push(outletName.toUpperCase());
  }

  console.log(`=== DB CLIENTS (${dbClients.length} rows) ===`);
  dbClients.forEach(c => {
    console.log(`  ${c.id.padEnd(45)} | ${c.company_name.padEnd(50)} | Total Order: ${c.total_order_jan_may}`);
  });

  console.log(`\n=== DUPLICATE CHECK ===`);
  const seen = new Set();
  const dupes = [];
  dbClients.forEach(c => {
    const upper = c.company_name.trim().toUpperCase();
    if (seen.has(upper)) {
      dupes.push(c.company_name);
    }
    seen.add(upper);
  });
  console.log('Duplicates in DB:', dupes);

  console.log(`\n=== MISSING IN DB CHECK ===`);
  const dbNames = new Set(dbClients.map(c => c.company_name.trim().toUpperCase()));
  const missing = [];
  csvOutlets.forEach(name => {
    if (!dbNames.has(name)) {
      missing.push(name);
    }
  });
  console.log('Missing in DB:', missing);
}

main();
