const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const { data, error } = await supabase.from('users').select('*');
  console.log("Users len:", data?.length);
  const { error: err2 } = await supabase.from('expenses').insert({ id: 'test-uuid-9999', date: new Date().toISOString(), reporter_id: 'system', amount: 100, category: 'Test', description: 'Test', status: 'Pending Audit', reference_id: '123' });
  console.log("Expense system err:", err2);
  const { error: err3 } = await supabase.from('expenses').insert({ id: 'test-uuid-8888', date: new Date().toISOString(), reporter_id: '11111111-1111-1111-1111-111111111111', amount: 100, category: 'Test', description: 'Test', status: 'Pending Audit', reference_id: '123' });
  console.log("Expense uuid err:", err3);
}
run();
