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

const getClientId = (name) => 'client-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  console.log(`Running total order import against ${profile} profile...`);

  // Column addition: If the column doesn't exist in production, the update will fail
  // with a clear error message telling the user to run the ALTER TABLE manually.

  // 2. Fetch existing clients from DB
  const { data: existingClients, error: clientsError } = await supabase.from('clients').select('id, company_name');
  if (clientsError) {
    console.error('Error fetching clients:', clientsError);
    return;
  }

  const clientMap = new Map();
  existingClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  // 3. Parse CSV
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  const updates = [];
  const notFound = [];
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

    const upperOutlet = outletName.toUpperCase();
    
    if (clientMap.has(upperOutlet)) {
      const client = clientMap.get(upperOutlet);
      updates.push({
        id: client.id,
        total_order_jan_may: totalOrder
      });
    } else {
      // Try to find by generated client ID
      const generatedId = getClientId(outletName);
      const foundById = existingClients.find(c => c.id === generatedId);
      if (foundById) {
        updates.push({
          id: foundById.id,
          total_order_jan_may: totalOrder
        });
      } else {
        notFound.push({
          id: generatedId,
          company_name: outletName,
          pic_name: '',
          email: '',
          phone: '',
          address: '',
          payment_term_days: 30,
          total_order_jan_may: totalOrder,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  console.log(`\nCSV entries: ${updates.length + notFound.length}`);
  console.log(`Matched to existing clients (updates): ${updates.length}`);
  console.log(`New clients to insert: ${notFound.length}`);
  console.log(`CSV Grand Total: Rp ${csvTotal.toLocaleString()}`);

  // 4. Update existing clients in DB
  if (updates.length > 0) {
    console.log(`\nUpdating ${updates.length} clients with total_order_jan_may...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const update of updates) {
      const { error } = await supabase
        .from('clients')
        .update({ total_order_jan_may: update.total_order_jan_may })
        .eq('id', update.id);
      
      if (error) {
        if (error.message.includes('schema cache') || error.message.includes('could not find')) {
          console.error(`\n❌ Column "total_order_jan_may" does not exist in production DB!`);
          console.log('Run this SQL in your Supabase dashboard:');
          console.log('  ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_order_jan_may numeric NOT NULL DEFAULT 0;');
          return;
        }
        failCount++;
        console.error(`  ❌ Failed to update ${update.id}: ${error.message}`);
      } else {
        successCount++;
      }
    }
    
    console.log(`\n✅ Updated: ${successCount}`);
    if (failCount > 0) console.log(`❌ Failed updates: ${failCount}`);
  }

  // 5. Insert new clients
  if (notFound.length > 0) {
    console.log(`\nInserting ${notFound.length} new clients...`);
    const { error: insertError } = await supabase
      .from('clients')
      .upsert(notFound, { onConflict: 'id' });
    
    if (insertError) {
      console.error(`❌ Failed to insert new clients: ${insertError.message}`);
    } else {
      console.log(`✅ Successfully inserted ${notFound.length} new clients.`);
    }
  }

  console.log('\nImport complete!');
}

main();
