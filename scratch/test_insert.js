const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://plzkrzzmqatjgsitvmfd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDM0NTgsImV4cCI6MjA5MDM3OTQ1OH0.emqfLBO9wfYnBZ_jpD1zYLO5u7fPT2E6HQw-ysi6VxY'
);

async function run() {
  const { data, error } = await supabase.from('client_prices').insert([
    {
      id: 'test-id',
      client_id: 'test-client',
      product_id: 'test-product',
      agreed_price: 1000,
      tier: 'Standard',
      last_updated: new Date().toISOString(),
      updated_by_user_id: 'test-user'
    }
  ]);
  console.log('Insert Result:', data);
  console.log('Insert Error:', error);

  if (!error) {
    await supabase.from('client_prices').delete().eq('id', 'test-id');
  }
}
run();
