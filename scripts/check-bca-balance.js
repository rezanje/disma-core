require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const SUPABASE_URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkBCA() {
  // Get COAs
  const { data: coas } = await supabase.from('coas').select('*');
  
  // Get Journal entries
  const { data: entries, error: errEntries } = await supabase.from('journal_entries').select('*');
  if (errEntries) {
    console.error('Error fetching entries:', errEntries);
    return;
  }
  const entryMap = new Map(entries.map(e => [e.id, e]));

  // Get Journal lines for BCA (coa-1-2)
  const { data: lines, error: errLines } = await supabase
    .from('journal_lines')
    .select('*')
    .eq('account_id', 'coa-1-2');

  if (errLines) {
    console.error('Error fetching journal lines:', errLines);
    return;
  }

  console.log(`Total lines for coa-1-2 (BCA): ${lines.length}`);
  
  let debitSum = 0;
  let creditSum = 0;
  
  const combined = lines.map(l => {
    const entry = entryMap.get(l.journal_entry_id);
    return {
      ...l,
      entry
    };
  });

  combined.forEach(l => {
    debitSum += l.debit_amount || 0;
    creditSum += l.credit_amount || 0;
  });
  
  console.log(`\nDebit Sum (Inflow): ${debitSum}`);
  console.log(`Credit Sum (Outflow): ${creditSum}`);
  console.log(`Net Balance (Dr - Cr): ${debitSum - creditSum}`);
  
  // Let's print lines that have very large amounts
  console.log('\nTop 20 largest credits (outflows):');
  const sortedCredits = [...combined].sort((a,b) => b.credit_amount - a.credit_amount).slice(0, 20);
  sortedCredits.forEach(l => {
    console.log(`  Cr=${l.credit_amount}, Dr=${l.debit_amount}, Date=${l.entry?.transaction_date}, Desc=${l.entry?.description}`);
  });

  console.log('\nTop 20 largest debits (inflows):');
  const sortedDebits = [...combined].sort((a,b) => b.debit_amount - a.debit_amount).slice(0, 20);
  sortedDebits.forEach(l => {
    console.log(`  Dr=${l.debit_amount}, Cr=${l.credit_amount}, Date=${l.entry?.transaction_date}, Desc=${l.entry?.description}`);
  });
}

checkBCA();
