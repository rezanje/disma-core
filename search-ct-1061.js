const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: cts, error: err1 } = await supabase
    .from('cash_transactions')
    .select('*')
    .like('description', "%Uang Belanja Hilman 18Maret'26%");
  console.log('Cash Txs:', cts);

  const { data: jes, error: err2 } = await supabase
    .from('journal_entries')
    .select('*')
    .like('description', "%Uang Belanja Hilman 18Maret'26%");
  console.log('Journal Entries:', jes);
}
main();
