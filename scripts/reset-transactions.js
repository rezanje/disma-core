const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function resetAllTransactions() {
  const tablesToTruncate = [
    'sales_orders',
    'sales_order_items',
    'purchases',
    'purchase_items',
    'deliveries',
    'invoices',
    'expenses',
    'reimbursements',
    'cash_transactions',
    'journal_entries',
    'journal_lines',
    'document_archives',
    'rejected_items',
    'stock_movements',
    'stock_opname',
    'online_purchases',
    'client_prices'
  ];

  for (const table of tablesToTruncate) {
    console.log(`Clearing ${table}...`);
    // Delete all rows from table
    const { error } = await supabase.from(table).delete().neq('id', 'dummy-id-to-delete-all');
    if (error) {
       console.log(`Failed to clear ${table} via neq id, trying neq string...`);
       const { error2 } = await supabase.from(table).delete().neq('id', '');
       if (error2) console.log(`Error clearing ${table}:`, error2.message);
    }
  }

  console.log("Resetting product stocks to 0...");
  const { error: prodError } = await supabase.from('products').update({ current_stock: 0 }).neq('id', '');
  if (prodError) console.error("Error resetting products:", prodError.message);

  console.log("Resetting bank account balances to 0...");
  const { error: bankError } = await supabase.from('bank_accounts').update({ balance: 0 }).neq('id', '');
  if (bankError) console.error("Error resetting bank accounts:", bankError.message);

  console.log("Done resetting transactions!");
}

resetAllTransactions();
