#!/usr/bin/env node
// Dump every transactional table to JSON before a simulation run.
// Usage: node scripts/backup-transactions.js [--profile local|production]

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const {
  TRANSACTIONAL_TABLES,
  MASTER_RESETS,
  resolveProfile,
  loadEnv,
  getSupabaseCreds,
} = require('./_simulation-tables');

loadEnv();

async function fetchAll(supabase, table) {
  const rows = [];
  const chunkSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + chunkSize - 1);
    if (error) throw new Error(`Fetch ${table} failed at offset ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return rows;
}

async function main() {
  const profile = resolveProfile(process.argv.slice(2));
  const { url, serviceRoleKey } = getSupabaseCreds(profile);
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '..', 'backups', `${profile}-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`\n=== BACKUP START (profile=${profile}) ===`);
  console.log(`Target dir: ${backupDir}\n`);

  const manifest = { profile, timestamp, tables: {}, masterSnapshot: {} };

  for (const table of TRANSACTIONAL_TABLES) {
    process.stdout.write(`  ${table.padEnd(22)} … `);
    try {
      const rows = await fetchAll(supabase, table);
      const file = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));
      manifest.tables[table] = rows.length;
      console.log(`${rows.length} rows`);
    } catch (err) {
      console.log(`SKIP (${err.message})`);
      manifest.tables[table] = null;
    }
  }

  // Snapshot master columns we mutate later so restore can put them back too.
  for (const { table, column } of MASTER_RESETS) {
    process.stdout.write(`  (master) ${table}.${column} … `);
    try {
      const rows = await fetchAll(supabase, table);
      const snapshot = rows.map((r) => ({ id: r.id, [column]: r[column] }));
      const file = path.join(backupDir, `_master_${table}_${column}.json`);
      fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
      manifest.masterSnapshot[`${table}.${column}`] = snapshot.length;
      console.log(`${snapshot.length} rows`);
    } catch (err) {
      console.log(`SKIP (${err.message})`);
    }
  }

  fs.writeFileSync(path.join(backupDir, '_manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n=== BACKUP COMPLETE ===`);
  console.log(`Manifest: ${path.join(backupDir, '_manifest.json')}`);
  console.log(`\nNext step: node scripts/clear-transactions.js --profile ${profile}`);
  console.log(`Restore:   node scripts/restore-transactions.js ${path.basename(backupDir)} --profile ${profile}\n`);
}

main().catch((err) => {
  console.error('\n[BACKUP FAILED]', err.message);
  process.exit(1);
});
