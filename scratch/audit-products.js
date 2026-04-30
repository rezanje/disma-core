const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );
  
  const { data, error } = await supabase.from('products').select('id, name, skuCode');
  if (error) {
     console.log("Error:", error.message);
  } else {
     console.log(`Total Products in DB: ${data.length}`);
     console.log("Sample (first 10):", data.slice(0, 10));
     console.log("Sample (last 10):", data.slice(-10));
  }
}
run();
