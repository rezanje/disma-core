const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  const soId = '76c27fa7-6683-4cc6-a003-8fd9e0fd0cd5';
  
  console.log("=== Cleaning up Purchase Items ===");
  
  // Get all purchase items for this SO
  const { data: pItems, error: piErr } = await supabase.from('purchase_items').select('*').eq('sales_order_id', soId);
  if (piErr) return console.error(piErr);
  
  // Find items that are not QCed
  const unQced = pItems.filter(pi => !pi.is_qced);
  
  if (unQced.length > 0) {
    console.log(`Found ${unQced.length} un-QCed purchase items. Deleting them to clear duplication...`);
    const idsToDelete = unQced.map(pi => pi.id);
    
    const { error: delErr } = await supabase.from('purchase_items').delete().in('id', idsToDelete);
    if (delErr) return console.error("Error deleting:", delErr);
    console.log("Deleted duplicate un-QCed purchase items.");
  } else {
    console.log("No un-QCed items found.");
  }

  // Now advance status to 'Packing'
  console.log("Advancing Sales Order status to 'Packing'...");
  const { error: soErr } = await supabase.from('sales_orders').update({ status: 'Packing' }).eq('id', soId);
  if (soErr) return console.error("Error updating SO status:", soErr);
  console.log("Successfully advanced Sales Order status to 'Packing'.");
}

main();
