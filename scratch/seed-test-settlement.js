const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function run() {
  const purchaseId = 'pur-test-settle';
  const productId = '000862bb-45bb-4fe3-ad18-efa69bac6a9c';
  const userId = '22222222-2222-2222-2222-222222222222';
  const now = new Date().toISOString();

  console.log("Cleaning up old test data if exists...");
  await sb.from('purchase_items').delete().eq('purchase_id', purchaseId);
  await sb.from('expenses').delete().eq('purchase_id', purchaseId);
  await sb.from('purchases').delete().eq('id', purchaseId);

  console.log("Inserting test purchase...");
  const { error: errPur } = await sb.from('purchases').insert({
    id: purchaseId,
    date: now,
    purchaser_id: userId,
    status: 'Selesai',
    reconciliation_status: 'Laporan Masuk',
    budget_amount: 500000,
    operational_spare_amount: 100000,
    actual_spent: 350000,
    change_returned: 150000,
    budget_transfer_date: now,
    budget_bank_account_id: 'bank-bca'
  });
  if (errPur) {
    console.error("Failed to insert purchase:", errPur);
    process.exit(1);
  }

  console.log("Inserting test purchase item...");
  const { error: errItem } = await sb.from('purchase_items').insert({
    id: 'pi-test-settle',
    purchase_id: purchaseId,
    product_id: productId,
    qty_target: 5,
    qty_purchased: 5,
    estimated_unit_price: 100000,
    actual_unit_price: 70000,
    is_checked: true,
    purchase_method: 'Pasar'
  });
  if (errItem) {
    console.error("Failed to insert purchase item:", errItem);
    process.exit(1);
  }

  console.log("Inserting test return expense...");
  const { error: errExp } = await sb.from('expenses').insert({
    id: 'exp-test-ret',
    purchase_id: purchaseId,
    amount: 150000,
    category: 'Setoran Pengembalian',
    description: 'Setoran Tunai Sisa Kas (Rp 150.000) - Hilman (Sourcing) -> BCA',
    status: 'Pending Audit',
    reporter_id: userId,
    target_bank_account_id: 'bank-bca',
    date: now
  });
  if (errExp) {
    console.error("Failed to insert expense:", errExp);
    process.exit(1);
  }

  console.log("✅ Seed complete! Please refresh the page and check 'Sourcing Settlement' tab.");
}

run();
