const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // Fix the stuck purchase - already reconciled in journal but reconciliation_status was never saved
  const { error } = await supabase.from('purchases')
    .update({ reconciliation_status: 'Terverifikasi' })
    .eq('id', '8edbd070-4dfa-440b-84eb-3e954adf49f7');
  
  if (error) {
    // Try with shorter ID match
    const { data: purchases } = await supabase.from('purchases').select('id').like('id', '8edbd070%');
    if (purchases && purchases.length > 0) {
      const { error: err2 } = await supabase.from('purchases')
        .update({ reconciliation_status: 'Terverifikasi' })
        .eq('id', purchases[0].id);
      if (err2) console.error("Error:", err2);
      else console.log(`Fixed purchase ${purchases[0].id} -> reconciliation_status = Terverifikasi`);
    }
  } else {
    console.log("Fixed purchase 8edbd070... -> reconciliation_status = Terverifikasi");
  }
}

main();
