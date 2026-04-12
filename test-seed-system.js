const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const SYSTEM_USER = { id: '00000000-0000-0000-0000-000000000000', name: 'System', role: 'super_admin', pin: '0000' };

  await supabase.from('users').upsert(SYSTEM_USER);
  console.log("Seeded system user!");
}
run();
