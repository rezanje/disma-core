const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const SUPABASE_URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const jeId = 'je-sales-inv-import-0234';
  
  const { data: je, error: jeErr } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', jeId)
    .single();
    
  console.log('JE:', je);
  
  const { data: lines, error: lineErr } = await supabase
    .from('journal_lines')
    .select('*')
    .eq('journal_entry_id', jeId);
    
  console.log('Lines:', lines);
}

main();
