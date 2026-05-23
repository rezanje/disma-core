const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const SUPABASE_URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`❌ Missing Supabase env for profile=${profile}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Fetch journal entries with pagination
  let entries = [];
  let fromEnt = 0;
  const pageSizeEnt = 1000;
  while (true) {
    const { data, error: entErr } = await supabase
      .from('journal_entries')
      .select('id, description, transaction_date')
      .range(fromEnt, fromEnt + pageSizeEnt - 1);
    
    if (entErr) {
      console.error('Error fetching journal entries:', entErr);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    entries = entries.concat(data);
    if (data.length < pageSizeEnt) break;
    fromEnt += pageSizeEnt;
  }

  // Fetch journal lines with pagination
  let lines = [];
  let fromLine = 0;
  const pageSizeLine = 1000;
  while (true) {
    const { data, error: lineErr } = await supabase
      .from('journal_lines')
      .select('*')
      .range(fromLine, fromLine + pageSizeLine - 1);
    
    if (lineErr) {
      console.error('Error fetching journal lines:', lineErr);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    lines = lines.concat(data);
    if (data.length < pageSizeLine) break;
    fromLine += pageSizeLine;
  }
  
  console.log(`Fetched ${lines.length} journal lines.`);

  // Group lines by journal_entry_id
  const entryLinesMap = {};
  for (const line of lines) {
    if (!entryLinesMap[line.journal_entry_id]) {
      entryLinesMap[line.journal_entry_id] = [];
    }
    entryLinesMap[line.journal_entry_id].push(line);
  }

  console.log(`=== Auditing Journal Entries (${profile.toUpperCase()}) ===`);
  let unbalancedCount = 0;
  for (const entry of entries) {
    const entryLines = entryLinesMap[entry.id] || [];
    let sumDebit = 0;
    let sumCredit = 0;
    for (const line of entryLines) {
      sumDebit += Number(line.debit_amount || 0);
      sumCredit += Number(line.credit_amount || 0);
    }
    
    // Check if balanced
    const diff = Math.abs(sumDebit - sumCredit);
    if (diff > 0.01) {
      unbalancedCount++;
      console.log(`Unbalanced JE: ${entry.id} | Date: ${entry.transaction_date} | Diff: Rp ${sumDebit - sumCredit}`);
      console.log(`  Desc: ${entry.description}`);
      console.log(`  Lines:`);
      for (const line of entryLines) {
        console.log(`    Account: ${line.account_id} | Debit: Rp ${line.debit_amount} | Credit: Rp ${line.credit_amount}`);
      }
      console.log();
    }
  }

  console.log(`Total unbalanced entries found: ${unbalancedCount}`);
}

main();
