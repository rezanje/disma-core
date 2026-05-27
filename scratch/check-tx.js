const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

const jsonPath = path.join(__dirname, '../data/DISMA_keuangan_20Mei2026.json');
const D = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

async function main() {
  const txIds = ['tx-import-0277', 'tx-import-0380', 'tx-import-0398'];
  
  console.log('--- Checking original JSON transaction rows ---');
  D.transactions_mei.forEach((t, idx) => {
    const id = `tx-import-${String(idx + 1).padStart(4, '0')}`;
    if (txIds.includes(id)) {
      console.log(`JSON Row ${id}:`, t);
    }
  });

  console.log('\n--- Checking DB Journal Lines for these transactions ---');
  for (const id of txIds) {
    const jeId = `je-${id}`;
    const { data: je } = await supabase.from('journal_entries').select('*').eq('id', jeId).single();
    const { data: lines } = await supabase.from('journal_lines').select('*').eq('journal_entry_id', jeId);
    
    console.log(`\nJournal Entry ${jeId}:`, je);
    for (const l of lines) {
      const { data: coa } = await supabase.from('coas').select('account_code, account_name').eq('id', l.account_id).single();
      console.log(`  Line: Account ${coa.account_code} (${coa.account_name}) | Debit: Rp ${l.debit_amount.toLocaleString()} | Credit: Rp ${l.credit_amount.toLocaleString()}`);
    }
  }
}

main();
