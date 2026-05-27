const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Read environment variables from .env.local
const envPath = path.join(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local file not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.substring(1, value.length - 1);
    env[match[1]] = value;
  }
});

const isProd = env.NEXT_PUBLIC_SUPABASE_PROFILE === 'production';
const url = isProd ? env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION : env.NEXT_PUBLIC_SUPABASE_URL_LOCAL;
const serviceKey = isProd ? env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION : env.SUPABASE_SERVICE_ROLE_KEY_LOCAL;

if (!url || !serviceKey) {
  console.error('Error: URL or Service Key not configured correctly in .env.local!');
  process.exit(1);
}

console.log(`Supabase Profile: ${env.NEXT_PUBLIC_SUPABASE_PROFILE}`);
console.log(`Supabase URL: ${url}`);

const supabase = createClient(url, serviceKey);

// Helper to update references across all tables
async function updateClientReferences(oldId, newId) {
  console.log(`Updating references for: ${oldId} -> ${newId}`);
  
  // 1. Invoices
  const { data: updatedInvs, error: invErr } = await supabase
    .from('invoices')
    .update({ client_id: newId })
    .eq('client_id', oldId)
    .select('id');
  if (invErr) throw invErr;
  if (updatedInvs.length > 0) {
    console.log(`  - Updated ${updatedInvs.length} invoices.`);
  }

  // 2. Sales Orders
  const { data: updatedSOs, error: soErr } = await supabase
    .from('sales_orders')
    .update({ client_id: newId })
    .eq('client_id', oldId)
    .select('id');
  if (soErr) throw soErr;
  if (updatedSOs.length > 0) {
    console.log(`  - Updated ${updatedSOs.length} sales orders.`);
  }

  // 3. Client Prices
  const { data: updatedPrices, error: priceErr } = await supabase
    .from('client_prices')
    .update({ client_id: newId })
    .eq('client_id', oldId)
    .select('id');
  if (priceErr) throw priceErr;
  if (updatedPrices.length > 0) {
    console.log(`  - Updated ${updatedPrices.length} client prices.`);
  }

  // 4. Clients parent_id (self-referential)
  const { data: updatedChildren, error: childErr } = await supabase
    .from('clients')
    .update({ parent_id: newId })
    .eq('parent_id', oldId)
    .select('id');
  if (childErr) throw childErr;
  if (updatedChildren.length > 0) {
    console.log(`  - Updated ${updatedChildren.length} child clients parent_id.`);
  }
}

async function run() {
  try {
    // Fetch all clients
    const { data: clients, error: fetchErr } = await supabase
      .from('clients')
      .select('*');
    if (fetchErr) throw fetchErr;

    console.log(`Loaded ${clients.length} clients.`);

    // 1. HOLYCOW BRANCHES DEDUPLICATION
    console.log('\n=== Starting Holycow Merges ===');
    const holycowTriple = clients.filter(c => c.id.startsWith('client-holycow-by-chef-afit---') || c.id === 'client-holycow-heritage-arjuna' || c.id === 'client-holycow-warehouse-stored' || c.id === 'client-holycow-warehouse-wolter');
    
    // Iterate over all triple-dash ones
    for (const tc of clients.filter(c => c.id.includes('---'))) {
      if (tc.id === 'client-headquarter-bar---pool') continue; // Handle separately
      
      let targetId = tc.id.replace('---', '-');
      // Special case: client-holycow-by-chef-afit---batutulis -> client-holycow-by-chef-afit-batu-tulis
      if (tc.id === 'client-holycow-by-chef-afit---batutulis') {
        targetId = 'client-holycow-by-chef-afit-batu-tulis';
      }

      const target = clients.find(c => c.id === targetId);
      if (!target) {
        console.warn(`Warning: Target client ${targetId} not found for source ${tc.id}`);
        continue;
      }

      console.log(`Consolidating ${tc.id} -> ${targetId}`);
      
      // Update references
      await updateClientReferences(tc.id, targetId);

      // Accumulate total_order_jan_may
      const newTotal = (target.total_order_jan_may || 0) + (tc.total_order_jan_may || 0);
      console.log(`  - Updating ${targetId} total_order_jan_may to: ${newTotal}`);
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ total_order_jan_may: newTotal })
        .eq('id', targetId);
      if (updateErr) throw updateErr;

      // Delete the old duplicate
      console.log(`  - Deleting duplicate record: ${tc.id}`);
      const { error: deleteErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', tc.id);
      if (deleteErr) throw deleteErr;
      
      // Update local array to keep calculations correct for sequential runs
      target.total_order_jan_may = newTotal;
    }

    // 2. HEADQUARTER BAR & POOL RENAME
    console.log('\n=== Renaming Headquarter Bar & Pool ===');
    const hq = clients.find(c => c.id === 'client-headquarter-bar---pool');
    if (hq) {
      const newHqId = 'client-headquarter-bar-pool';
      console.log(`Renaming client-headquarter-bar---pool -> ${newHqId}`);
      
      // First, create the new record (copying all fields)
      const newHqRecord = {
        ...hq,
        id: newHqId
      };
      
      const { error: insertErr } = await supabase
        .from('clients')
        .insert(newHqRecord);
      if (insertErr) throw insertErr;

      // Update references
      await updateClientReferences(hq.id, newHqId);

      // Delete old record
      const { error: deleteErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', hq.id);
      if (deleteErr) throw deleteErr;
      console.log(`Successfully renamed Headquarter.`);
    }

    // 3. PT MITRABOGA KREASI PRIMA CONSOLIDATION
    console.log('\n=== Consolidating PT Mitraboga Kreasi Prima ===');
    const mSourceId = 'client-pt-mitra-boga-kreasi-prima';
    const mTargetId = 'client-pt-mitraboga-kreasi-prima';
    
    const mSource = clients.find(c => c.id === mSourceId);
    const mTarget = clients.find(c => c.id === mTargetId);

    if (mSource && mTarget) {
      console.log(`Consolidating ${mSourceId} -> ${mTargetId}`);
      
      // Update references (invoices, etc.)
      await updateClientReferences(mSourceId, mTargetId);

      // Accumulate total_order_jan_may
      const newTotal = (mTarget.total_order_jan_may || 0) + (mSource.total_order_jan_may || 0);
      console.log(`  - Updating ${mTargetId} total_order_jan_may to: ${newTotal}`);
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ total_order_jan_may: newTotal })
        .eq('id', mTargetId);
      if (updateErr) throw updateErr;

      // Delete old duplicate
      console.log(`  - Deleting duplicate record: ${mSourceId}`);
      const { error: deleteErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', mSourceId);
      if (deleteErr) throw deleteErr;
    }

    // 4. PT MAJU BERSAMA DEDUPLICATION
    console.log('\n=== Deleting PT Maju Bersama Duplicate ===');
    const deleteMajuId = 'f6b23544-624c-4585-be95-dda677ad2728';
    const keepMajuId = 'b72db4b6-980b-4af5-9178-4adc5be8bfee';
    const deleteMaju = clients.find(c => c.id === deleteMajuId);
    if (deleteMaju) {
      console.log(`Deleting empty duplicate ${deleteMajuId}`);
      await updateClientReferences(deleteMajuId, keepMajuId);
      const { error: deleteErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', deleteMajuId);
      if (deleteErr) throw deleteErr;
    }

    console.log('\n=== DB MIGRATION COMPLETED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
