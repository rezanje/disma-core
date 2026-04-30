const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabaseAdmin = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );

  console.log("Forcing bank_accounts balance to 0...");
  
  // Update all rows having id != null
  const { data, error } = await supabaseAdmin
    .from('bank_accounts')
    .update({ balance: 0 })
    .neq('id', 'null_placeholder');

  if (error) {
    console.error("Error updating bank_accounts:", error);
  } else {
    console.log("Successfully set all bank accounts to Rp 0.");
  }
}
run();
