const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
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

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/Rp/gi, '').replace(/\s/g, '').replace(/,/g, '');
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  console.log(`Checking DB on profile: ${profile}`);

  // Get DB clients
  const { data: dbClients, error } = await supabase
    .from('clients')
    .select('id, company_name, total_order_jan_may');
  
  if (error) {
    console.error('Error fetching clients:', error);
    return;
  }

  // Parse CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');
  const csvMap = new Map();
  let csvTotal = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;

    const outletName = cols[0].trim();
    if (!outletName || outletName.toUpperCase() === 'TOTAL' || outletName.toUpperCase() === 'NAMA OUTLET') continue;

    const totalOrder = parseAmount(cols[1]);
    csvTotal += totalOrder;
    csvMap.set(outletName.toUpperCase(), totalOrder);
  }

  console.log(`Parsed CSV Total: ${csvTotal}`);
  console.log(`DB Client count: ${dbClients.length}`);

  let mismatches = 0;
  let missingInDb = 0;
  let dbTotal = 0;

  csvMap.forEach((csvVal, name) => {
    const dbClient = dbClients.find(c => c.company_name.trim().toUpperCase() === name);
    if (!dbClient) {
      console.log(`Missing in DB: ${name} (CSV Value: ${csvVal})`);
      missingInDb++;
      mismatches++;
    } else {
      dbTotal += Number(dbClient.total_order_jan_may || 0);
      if (Number(dbClient.total_order_jan_may || 0) !== csvVal) {
        console.log(`Mismatch for ${name}: CSV = ${csvVal}, DB = ${dbClient.total_order_jan_may}`);
        mismatches++;
      }
    }
  });

  console.log(`\nDB Total Order sum: ${dbTotal}`);
  console.log(`Total mismatches: ${mismatches}`);
  console.log(`Missing in DB: ${missingInDb}`);
}

main();
