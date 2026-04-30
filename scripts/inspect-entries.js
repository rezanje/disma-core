const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const { data: entries, error } = await supabase.from('journal_entries').select('id, description, reference_type, reference_id');
  if (error) return console.error(error);

  console.log(`=== All Journal Entries (${entries.length}) ===`);
  for (const entry of entries) {
    console.log(`ID: ${entry.id} | Type: ${entry.reference_type} | Ref: ${entry.reference_id} | Desc: ${entry.description}`);
  }
}

main();
