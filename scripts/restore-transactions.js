#!/usr/bin/env node
// Restore transactional tables from a backup folder produced by backup-transactions.js.
// Master column snapshots (product stock, bank balance) are also restored.
// Usage: node scripts/restore-transactions.js <backup-folder> [--profile local|production] [--yes]

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const {
  TRANSACTIONAL_TABLES,
  MASTER_RESETS,
  resolveProfile,
  loadEnv,
  getSupabaseCreds,
  ask,
} = require('./_simulation-tables');

loadEnv();

async function insertChunks(supabase, table, rows) {
  if (!rows || rows.length === 0) return 0;
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`upsert ${table} chunk ${i / chunkSize} failed: ${error.message}`);
    inserted += chunk.length;
  }
  return inserted;
}

async function main() {
  const argv = process.argv.slice(2);
  const folderArg = argv.find((a) => !a.startsWith('-') && a !== 'local' && a !== 'production');
  if (!folderArg) {
    console.error('Usage: node scripts/restore-transactions.js <backup-folder> [--profile local|production]');
    process.exit(1);
  }

  const profile = resolveProfile(argv);
  const skipPrompt = argv.includes('--yes') || argv.includes('-y');
  const { url, serviceRoleKey } = getSupabaseCreds(profile);
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const backupRoot = path.resolve(__dirname, '..', 'backups');
  const backupDir = path.isAbsolute(folderArg) ? folderArg : path.join(backupRoot, folderArg);
  if (!fs.existsSync(backupDir)) throw new Error(`Backup folder not found: ${backupDir}`);

  const manifestPath = path.join(backupDir, '_manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

  console.log(`\n=== RESTORE (profile=${profile}) ===`);
  console.log(`Source: ${backupDir}`);
  if (manifest) {
    console.log(`Snapshot taken: ${manifest.timestamp}`);
    console.log(`Source profile: ${manifest.profile}`);
    if (manifest.profile !== profile) {
      console.log(`⚠️  Backup was taken on "${manifest.profile}" but restoring to "${profile}".`);
    }
  }

  if (!skipPrompt) {
    const answer = await ask(`\nLanjut restore (overwrite-via-upsert)? Ketik "RESTORE" untuk konfirmasi: `);
    if (answer !== 'RESTORE') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Wipe current transactional tables first so removed rows in the backup
  // don't linger after restore.
  console.log('\nWiping current transactional tables before restore …');
  for (const table of TRANSACTIONAL_TABLES) {
    process.stdout.write(`  ${table.padEnd(22)} … `);
    const { error } = await supabase.from(table).delete().neq('id', '__never__');
    if (error) console.log(`SKIP (${error.message})`);
    else console.log('cleared');
  }

  console.log('\nRestoring rows …');
  for (const table of TRANSACTIONAL_TABLES) {
    const file = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  ${table.padEnd(22)} … (no snapshot)`);
      continue;
    }
    process.stdout.write(`  ${table.padEnd(22)} … `);
    try {
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      const inserted = await insertChunks(supabase, table, rows);
      console.log(`${inserted} rows`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
    }
  }

  console.log('\nRestoring master column snapshots …');
  for (const { table, column } of MASTER_RESETS) {
    const file = path.join(backupDir, `_master_${table}_${column}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  ${table}.${column} … (no snapshot)`);
      continue;
    }
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    let restored = 0;
    for (const row of snapshot) {
      const { error } = await supabase.from(table).update({ [column]: row[column] }).eq('id', row.id);
      if (!error) restored++;
    }
    console.log(`  ${table}.${column} … ${restored}/${snapshot.length} rows`);
  }

  console.log(`\n=== RESTORE COMPLETE ===\n`);
}

main().catch((err) => {
  console.error('\n[RESTORE FAILED]', err.message);
  process.exit(1);
});
