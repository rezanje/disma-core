const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, status, total_amount, amount_paid, payments')
    .eq('status', 'Paid')
    .limit(5);
    
  if (error) {
    console.error('Error fetching invoices:', error);
  } else {
    console.log('Sample Paid Invoices:', JSON.stringify(invoices, null, 2));
  }
}
main();
