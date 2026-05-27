const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Testing full upsert with created_at...');
  const { data, error } = await supabase.from('clients').upsert([
    {
      id: 'client-demie-bakmie-bintaro',
      company_name: 'DEMIE BAKMIE BINTARO',
      pic_name: '-',
      email: '',
      phone: '',
      address: '',
      payment_term_days: 30,
      created_at: new Date().toISOString(),
      parent_id: 'e89b5d73-2c01-401c-8814-086e8aae589c',
      is_brand: false
    }
  ], { onConflict: 'id' });

  if (error) {
    console.error('Upsert failed:', error);
  } else {
    console.log('Upsert succeeded!');
  }
}
main();
