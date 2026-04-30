const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log("Adding purchase_id to expenses...");
  // Since we cannot run raw DDL via supabase-js without an RPC function,
  // we will try to use the query API to just see if it exists, or instruct the user.
  // Actually, wait, supabase-js `rpc` can execute arbitrary sql if we made an `exec_sql` function.
  // BUT we don't have one.
  console.log("Supabase schema updates usually require running raw SQL.");
  console.log("Please run the following SQL manually in your Supabase SQL Editor:");
  console.log("ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS purchase_id text;");
  console.log("ALTER TABLE public.reimbursements ADD COLUMN IF NOT EXISTS purchase_id text;");
}

runMigration();
