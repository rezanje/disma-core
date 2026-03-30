const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabaseAdmin = createClient(
    'https://plzkrzzmqatjgsitvmfd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsemtyenptcWF0amdzaXR2bWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMzQ1OCwiZXhwIjoyMDkwMzc5NDU4fQ.xaSluKpM8JQiBZwbEX-Vrx8d-cIXcAGey8uKBDDsGtQ'
  );

  const operationalTables = [
      'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
      'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 'okr_objectives',
      'reimbursements', 'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
      'notifications', 'disma_tasks', 'leads', 'employees', 'kpis'
    ];
  const masterTables = [
      'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
    ];

  const tablesToClear = [...operationalTables, ...masterTables];
    
  for (const table of tablesToClear) {
      console.log(`Deleting ${table}...`);
      const { error } = await supabaseAdmin.from(table).delete().neq('id', 'null_id');
      if (error) {
        console.error(`ERROR clearing ${table}:`, error.message);
      } else {
        console.log(`SUCCESS clearing ${table}`);
      }
  }
}
run();
