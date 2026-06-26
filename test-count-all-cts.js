const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: cts, error } = await supabase
    .from('cash_transactions')
    .select('id, bank_account_id, description');
  console.log('Total Cash Txs in DB:', cts.length);
  const bcaTxs = cts.filter(c => c.bank_account_id === 'bank-1');
  console.log('BCA Cash Txs count:', bcaTxs.length);
  console.log('BCA Cash Txs samples:', bcaTxs.slice(0, 10));
}
main();
