#!/usr/bin/env node
/**
 * repair-bank-coa.js — one-pass fix so every bank owns a unique, dedicated COA.
 *
 * Rules:
 *  - For a COA code shared by >=2 banks: the bank whose name matches the COA's
 *    account_name keeps it (else the first by id). Every other bank on that code
 *    is reassigned a fresh code (nextBankCoaCode) + a new COA row (name = bank name).
 *  - The keeper's COA account_name is set to the keeper bank's name.
 *  - Any bank whose account_code has no COA row gets one minted.
 *
 * Does NOT touch balances or historical journal lines (that is Paket B).
 *
 * Creds from env (production by default):
 *   NEXT_PUBLIC_SUPABASE_URL_PRODUCTION  (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY_PRODUCTION (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Usage:
 *   node scripts/repair-bank-coa.js            # DRY RUN
 *   node scripts/repair-bank-coa.js --commit   # APPLY
 */
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const COMMIT = process.argv.includes('--commit');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION || process.env.SUPABASE_SERVICE_ROLE_KEY;
function die(m) { console.error('\n❌ ' + m + '\n'); process.exit(1); }
if (!URL || !KEY) die('Set NEXT_PUBLIC_SUPABASE_URL_PRODUCTION and SUPABASE_SERVICE_ROLE_KEY_PRODUCTION in your shell.');

function nextBankCoaCode(usedSet) {
  for (let h = 0; h <= 9; h++) { const c = `1-1${h}00`; if (!usedSet.has(c)) return c; }
  for (let x = 0; x <= 9; x++) for (let y = 1; y <= 9; y++) { const c = `1-1${x}${y}0`; if (!usedSet.has(c)) return c; }
  throw new Error('No free bank COA code in 1-1xxx');
}

const s = createClient(URL, KEY, { auth: { persistSession: false } });

(async () => {
  console.log(`\n=== repair-bank-coa  [${COMMIT ? 'COMMIT' : 'DRY RUN'}] ===`);
  console.log('Target:', URL, '\n');

  const { data: banks, error: be } = await s.from('bank_accounts').select('id,name,account_code,balance');
  if (be) die('read banks: ' + be.message);
  const { data: coas, error: ce } = await s.from('coas').select('id,account_code,account_name,account_type');
  if (ce) die('read coas: ' + ce.message);

  const used = new Set(coas.map(c => c.account_code));
  const byCode = new Map();
  banks.forEach(b => { if (!byCode.has(b.account_code)) byCode.set(b.account_code, []); byCode.get(b.account_code).push(b); });

  const plan = []; // {kind, ...}

  for (const [code, group] of byCode) {
    const coa = coas.find(c => c.account_code === code);
    if (group.length > 1) {
      // pick keeper
      let keeper = group.find(b => coa && b.name === coa.account_name) || group.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
      for (const b of group) {
        if (b.id === keeper.id) continue;
        const newCode = nextBankCoaCode(used); used.add(newCode);
        plan.push({ kind: 'reassign', bank: b, oldCode: code, newCode, coaId: randomUUID(), coaName: b.name });
      }
      if (coa && coa.account_name !== keeper.name) plan.push({ kind: 'rename-coa', coaId: coa.id, from: coa.account_name, to: keeper.name });
    }
    if (!coa) {
      // bank with no COA row at all
      for (const b of group) plan.push({ kind: 'mint', bank: b, code, coaId: randomUUID(), coaName: b.name });
    }
  }

  if (!plan.length) { console.log('✅ Nothing to repair — every bank already owns a unique COA.\n'); process.exit(0); }

  console.log('--- PLAN ---');
  plan.forEach(p => {
    if (p.kind === 'reassign') console.log(`  reassign  ${p.bank.name} (${p.bank.id}): ${p.oldCode} -> ${p.newCode}  + new COA "${p.coaName}"`);
    if (p.kind === 'rename-coa') console.log(`  rename COA ${p.coaId}: "${p.from}" -> "${p.to}"`);
    if (p.kind === 'mint') console.log(`  mint COA  ${p.code} "${p.coaName}" for bank ${p.bank.name}`);
  });

  if (!COMMIT) { console.log('\nDRY RUN — nothing written. Re-run with --commit.\n'); process.exit(0); }

  console.log('\nApplying...');
  for (const p of plan) {
    if (p.kind === 'reassign') {
      let r = await s.from('coas').insert({ id: p.coaId, account_code: p.newCode, account_name: p.coaName, account_type: 'Asset' });
      if (r.error) die(`insert coa ${p.newCode}: ${r.error.message}`);
      r = await s.from('bank_accounts').update({ account_code: p.newCode }).eq('id', p.bank.id);
      if (r.error) die(`update bank ${p.bank.id}: ${r.error.message}`);
    } else if (p.kind === 'rename-coa') {
      const r = await s.from('coas').update({ account_name: p.to }).eq('id', p.coaId);
      if (r.error) die(`rename coa ${p.coaId}: ${r.error.message}`);
    } else if (p.kind === 'mint') {
      const r = await s.from('coas').insert({ id: p.coaId, account_code: p.code, account_name: p.coaName, account_type: 'Asset' });
      if (r.error) die(`mint coa ${p.code}: ${r.error.message}`);
    }
  }
  console.log(`\n✅ Applied ${plan.length} change(s). Re-run dry to confirm idempotency.\n`);
})().catch(e => die(e.message || String(e)));
