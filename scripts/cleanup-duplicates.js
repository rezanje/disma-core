const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  // 1. Fix stuck purchase reconciliation status
  const { error: err1 } = await supabase
    .from('purchases')
    .update({ reconciliation_status: 'Terverifikasi' })
    .eq('id', '8edbd070-027c-4860-979b-f62d24e97cad');
  
  if (err1) console.error("Error updating purchase:", err1);
  else console.log("Purchase 8edbd070 updated to 'Terverifikasi'.");

  // 2. Delete duplicate journal entries and lines
  const duplicateEntryIds = [
    '74d2bc16-50a8-4809-a9ea-7dd259b3695c', // Duplicate Invoice
    '197c3961-f59a-436c-8534-15857d99cbcd', // Wrong HPP Delivery
    '203c155c-6135-400f-ab8f-ed62fc10b52d'  // Duplicate HPP Delivery
  ];

  for (const id of duplicateEntryIds) {
    // Delete lines first
    const { error: errLines } = await supabase
      .from('journal_lines')
      .delete()
      .eq('journal_entry_id', id);
    
    if (errLines) console.error(`Error deleting lines for ${id}:`, errLines);
    
    // Delete entry
    const { error: errEntry } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id);
    
    if (errEntry) console.error(`Error deleting entry ${id}:`, errEntry);
    else console.log(`Deleted duplicated journal entry & lines: ${id}`);
  }
}

main();
