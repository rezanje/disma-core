const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const { error } = await supabase.from('purchases').insert({ id: 'b2dc8dc6-b7f5-46fd-8cb3-c820b5f543eb', date: new Date().toISOString(), purchaser_id: null, status: 'Pending' });
  console.log("Insert with null:", error);

  const { error: error2 } = await supabase.from('users').select('id').limit(1);
  console.log("Users:", error2);
}
run();
