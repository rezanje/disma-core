#!/usr/bin/env node
// Wipe every transactional table while preserving master data (products, clients, users, etc.).
// Stock & bank balances are reset to 0. Master rows themselves stay untouched.
// Usage: node scripts/clear-transactions.js [--profile local|production] [--yes]

const { createClient } = require('@supabase/supabase-js');
const {
  TRANSACTIONAL_TABLES,
  MASTER_RESETS,
  PRESERVED_TABLES,
  resolveProfile,
  loadEnv,
  getSupabaseCreds,
  ask,
} = require('./_simulation-tables');

loadEnv();

async function deleteAll(supabase, table) {
  // RLS: service-role key bypasses RLS, so .delete().neq(...) works on any RLS-on table.
  const { error } = await supabase.from(table).delete().neq('id', '__never__');
  if (error) {
    // Fallback for integer-id tables where `neq('id','')` won't typecast.
    const { error: alt } = await supabase.from(table).delete().gte('id', 0);
    if (alt) throw new Error(`${error.message} / fallback: ${alt.message}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const profile = resolveProfile(argv);
  const skipPrompt = argv.includes('--yes') || argv.includes('-y');
  const { url, serviceRoleKey } = getSupabaseCreds(profile);
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  console.log(`\n=== CLEAR TRANSACTIONS (profile=${profile}) ===`);
  console.log(`Wipe targets   : ${TRANSACTIONAL_TABLES.length} tables`);
  console.log(`Preserve master: ${PRESERVED_TABLES.length} tables (products, clients, users, vendors, coas, bank_accounts, client_prices, …)`);
  console.log(`Resets         : ${MASTER_RESETS.map((m) => `${m.table}.${m.column}=${m.value}`).join(', ')}`);

  if (profile === 'production' && !skipPrompt) {
    console.log('\n⚠️  PRODUCTION profile selected. This will erase live transactional data.');
  }
  if (!skipPrompt) {
    const answer = await ask(`\nLanjut wipe? Ketik "CLEAR ${profile.toUpperCase()}" untuk konfirmasi: `);
    if (answer !== `CLEAR ${profile.toUpperCase()}`) {
      console.log('Aborted. No data changed.');
      process.exit(0);
    }
  }

  console.log('\nClearing transactional tables …');
  for (const table of TRANSACTIONAL_TABLES) {
    process.stdout.write(`  ${table.padEnd(22)} … `);
    try {
      await deleteAll(supabase, table);
      console.log('cleared');
    } catch (err) {
      console.log(`SKIP (${err.message})`);
    }
  }

  console.log('\nResetting master columns …');
  for (const { table, column, value } of MASTER_RESETS) {
    process.stdout.write(`  ${table}.${column} → ${value} … `);
    const { error } = await supabase.from(table).update({ [column]: value }).neq('id', '__never__');
    if (error) console.log(`FAILED (${error.message})`);
    else console.log('ok');
  }

  console.log(`\n=== CLEAR COMPLETE ===`);
  console.log(`DB siap simulasi 0-transaksi. Master SKU & client tetap utuh.`);
  console.log(`Restore kalau perlu: node scripts/restore-transactions.js <backup-folder> --profile ${profile}\n`);
}

main().catch((err) => {
  console.error('\n[CLEAR FAILED]', err.message);
  process.exit(1);
});
