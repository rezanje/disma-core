const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const suffix = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase() === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(dbUrl, dbKey);

async function main() {
  const { data: invoices, error } = await supabase.from('invoices').select('*');
  if (error) throw error;

  const monthly = {};

  invoices.forEach(inv => {
    const date = new Date(inv.issue_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthly[monthKey]) {
      monthly[monthKey] = { count: 0, total: 0 };
    }
    monthly[monthKey].count += 1;
    monthly[monthKey].total += inv.total_amount || 0;
  });

  console.log("Invoices by Month:");
  Object.keys(monthly).sort().forEach(month => {
    console.log(`Month: ${month}`);
    console.log(`  - Count: ${monthly[month].count}`);
    console.log(`  - Total Amount: Rp ${monthly[month].total.toLocaleString('id-ID')}`);
  });
}

main().catch(console.error);
