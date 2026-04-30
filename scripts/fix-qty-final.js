const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION,
  process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION
);

async function main() {
  console.log("=== Fixing Qty Final for Sales Order Items ===");
  
  const updates = [
    { id: 'a740b26f-43ea-467f-be8e-6de0364f1746', qty_final: 3 },
    { id: 'c4b5983f-85a2-48f7-a2ec-2919c68009ed', qty_final: 3 },
    { id: 'dc17b6ea-137b-41a4-a007-590627e30d44', qty_final: 5 },
    { id: 'e7f27b0e-0c8d-46ab-9f1d-86b759eeeb92', qty_final: 2 }
  ];

  for (const upd of updates) {
    const { data: item } = await supabase.from('sales_order_items').select('unit_price').eq('id', upd.id).single();
    const subtotal_final = upd.qty_final * (item?.unit_price || 0);
    
    const { error } = await supabase.from('sales_order_items').update({
      qty_final: upd.qty_final,
      subtotal_final: subtotal_final
    }).eq('id', upd.id);
    
    if (error) console.error(`Error updating ${upd.id}:`, error);
    else console.log(`Updated ${upd.id} -> Qty Final: ${upd.qty_final}`);
  }
}

main();
