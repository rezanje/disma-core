const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const tables = ['products', 'clients', 'vendors', 'client_prices'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) console.log(`${t}: Error - ${error.message}`);
    else console.log(`${t}: ${count}`);
  }
}
run();
