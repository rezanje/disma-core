#!/usr/bin/env node
/**
 * fix-advance-source.js
 *
 * One-off production data correction for the "advance pulled from wrong bank"
 * bug (advance disbursement defaulted to the first bank in the array — Bank Jago —
 * instead of the intended source account, driving Bank Jago negative).
 *
 * It re-points the "Pencairan Dana (Advance)" Out cash-transactions from the
 * wrong source bank to the correct one, and keeps everything consistent:
 *   1. cash_transactions.bank_account_id : WRONG bank -> CORRECT bank
 *   2. bank_accounts.balance             : WRONG += sum (undo), CORRECT -= sum
 *   3. journal_lines.account_id          : credit line WRONG coa -> CORRECT coa
 *
 * Creds are read from env (NEVER hard-coded). Production by default:
 *   NEXT_PUBLIC_SUPABASE_URL_PRODUCTION  (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY_PRODUCTION (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Usage:
 *   node scripts/fix-advance-source.js                 # DRY RUN (default) — prints plan, writes nothing
 *   node scripts/fix-advance-source.js --to bank-bca   # specify correct source bank id
 *   node scripts/fix-advance-source.js --from bank-jago --to bank-bca
 *   node scripts/fix-advance-source.js --to bank-bca --commit   # APPLY
 *
 * Flags:
 *   --to <bankId>     Correct source bank id (default: auto-detect name ~ /bca/i)
 *   --from <bankId>   Wrong source bank id   (default: auto-detect from the advance Out tx)
 *   --ref <prefix>    Limit to tx whose description contains "Ref: <prefix>"
 *   --commit          Actually write changes (omit = dry run)
 *
 * Safe to re-run: tx already pointing at the correct bank are skipped, and
 * balances/journal are only adjusted for tx actually moved in this run.
 */
const { createClient } = require('@supabase/supabase-js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const COMMIT = process.argv.includes('--commit');
const FROM_ARG = arg('--from');
const TO_ARG = arg('--to');
const REF_ARG = arg('--ref');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION || process.env.SUPABASE_SERVICE_ROLE_KEY;

const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
function die(msg) { console.error('\n❌ ' + msg + '\n'); process.exit(1); }

if (!URL || !KEY) {
  die(
    'Missing production credentials. Set in your shell before running:\n' +
    '   export NEXT_PUBLIC_SUPABASE_URL_PRODUCTION="https://<prod>.supabase.co"\n' +
    '   export SUPABASE_SERVICE_ROLE_KEY_PRODUCTION="<service-role-key>"\n' +
    '(falls back to NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'
  );
}

const s = createClient(URL, KEY, { auth: { persistSession: false } });

(async () => {
  console.log(`\n=== fix-advance-source  [${COMMIT ? 'COMMIT' : 'DRY RUN'}] ===`);
  console.log('Target:', URL, '\n');

  const { data: banks, error: be } = await s.from('bank_accounts').select('id,name,account_code,balance');
  if (be) die('Read bank_accounts failed: ' + be.message);
  console.log('Banks:');
  console.table(banks.map(b => ({ id: b.id, name: b.name, code: b.account_code, balance: rupiah(b.balance) })));

  // The wrong "Out" advance transactions
  let q = s.from('cash_transactions')
    .select('id,date,type,amount,category,description,bank_account_id,reference_id')
    .eq('type', 'Out')
    .ilike('description', '%Pencairan Dana (Advance)%');
  if (REF_ARG) q = q.ilike('description', `%Ref: ${REF_ARG}%`);
  const { data: allTx, error: te } = await q;
  if (te) die('Read cash_transactions failed: ' + te.message);

  if (!allTx.length) die('No "Pencairan Dana (Advance)" Out transactions found. Nothing to do.');
  console.log('\nAll matching advance-out transactions:');
  console.table(allTx.map(t => ({
    id: t.id, date: t.date, amount: rupiah(t.amount),
    bank: (banks.find(b => b.id === t.bank_account_id) || {}).name || t.bank_account_id,
    ref: t.reference_id, desc: t.description,
  })));

  // Resolve WRONG (from) bank
  const fromBankIds = [...new Set(allTx.map(t => t.bank_account_id))];
  let fromBankId = FROM_ARG;
  if (!fromBankId) {
    if (fromBankIds.length === 1) fromBankId = fromBankIds[0];
    else die(`Multiple source banks on advance tx: ${fromBankIds.join(', ')}. Re-run with --from <bankId>.`);
  }
  const fromBank = banks.find(b => b.id === fromBankId);
  if (!fromBank) die(`--from bank "${fromBankId}" not found.`);

  // Resolve CORRECT (to) bank
  let toBankId = TO_ARG;
  if (!toBankId) {
    const guess = banks.filter(b => /bca/i.test(b.name));
    if (guess.length === 1) toBankId = guess[0].id;
    else die(`Could not auto-detect the correct bank (name ~ /bca/i matched ${guess.length}). Re-run with --to <bankId>.`);
  }
  const toBank = banks.find(b => b.id === toBankId);
  if (!toBank) die(`--to bank "${toBankId}" not found.`);
  if (toBankId === fromBankId) die('--from and --to are the same bank.');

  // Tx actually needing a move (idempotent)
  const moveTx = allTx.filter(t => t.bank_account_id === fromBankId);
  if (!moveTx.length) {
    console.log(`\n✅ Nothing to move — no advance tx currently point at "${fromBank.name}". Already corrected?`);
    process.exit(0);
  }
  const sum = moveTx.reduce((a, t) => a + Number(t.amount), 0);

  // COA mapping for the journal credit line
  const { data: coas, error: ce } = await s.from('coas').select('id,account_code,account_name');
  if (ce) die('Read coas failed: ' + ce.message);
  const fromCoa = coas.find(c => c.account_code === fromBank.account_code);
  const toCoa = coas.find(c => c.account_code === toBank.account_code);
  if (!fromCoa) die(`No COA for wrong bank code ${fromBank.account_code}.`);
  if (!toCoa) die(`No COA for correct bank code ${toBank.account_code}.`);

  // Journal lines to fix: credit side of the matching "Pencairan Budget Sourcing" entries
  const refs = [...new Set(moveTx.map(t => t.reference_id).filter(Boolean))];
  const { data: entries, error: ee } = await s.from('journal_entries')
    .select('id,description,reference_id')
    .in('reference_id', refs.length ? refs : ['__none__'])
    .ilike('description', '%Pencairan Budget Sourcing%');
  if (ee) die('Read journal_entries failed: ' + ee.message);

  let creditLines = [];
  if (entries.length) {
    const { data: lines, error: le } = await s.from('journal_lines')
      .select('id,journal_entry_id,account_id,debit_amount,credit_amount')
      .in('journal_entry_id', entries.map(e => e.id));
    if (le) die('Read journal_lines failed: ' + le.message);
    creditLines = lines.filter(l => Number(l.credit_amount) > 0 && l.account_id === fromCoa.id);
  }

  // ---- Plan ----
  console.log('\n--- CORRECTION PLAN ---');
  console.log(`WRONG bank   : ${fromBank.name} (${fromBank.id}, code ${fromBank.account_code})`);
  console.log(`CORRECT bank : ${toBank.name} (${toBank.id}, code ${toBank.account_code})`);
  console.log(`Transactions to re-point: ${moveTx.length}  | total ${rupiah(sum)}`);
  moveTx.forEach(t => console.log(`   • ${t.id}  ${rupiah(t.amount)}  ref ${t.reference_id}`));
  console.log(`\nBalance changes:`);
  console.log(`   ${fromBank.name}: ${rupiah(fromBank.balance)} -> ${rupiah(Number(fromBank.balance) + sum)}  (+${rupiah(sum)})`);
  console.log(`   ${toBank.name}: ${rupiah(toBank.balance)} -> ${rupiah(Number(toBank.balance) - sum)}  (-${rupiah(sum)})`);
  console.log(`\nJournal credit lines to re-point (${fromCoa.account_code} -> ${toCoa.account_code}): ${creditLines.length}`);
  creditLines.forEach(l => console.log(`   • line ${l.id}  credit ${rupiah(l.credit_amount)}`));
  if (!creditLines.length) {
    console.log('   ⚠️  No matching journal credit lines found. GL may already be corrected,');
    console.log('       or entries use a different description. Verify before trusting the GL.');
  }

  if (!COMMIT) {
    console.log('\nDRY RUN — no changes written. Re-run with --commit to apply.\n');
    process.exit(0);
  }

  // ---- Apply ----
  console.log('\nApplying...');

  for (const t of moveTx) {
    const { error } = await s.from('cash_transactions').update({ bank_account_id: toBankId }).eq('id', t.id);
    if (error) die(`Update cash_transaction ${t.id} failed: ${error.message}. STOPPED — re-run dry to inspect.`);
  }
  console.log(`  ✓ ${moveTx.length} cash_transactions re-pointed`);

  // Re-read balances to avoid stale writes, then adjust
  const { data: freshBanks } = await s.from('bank_accounts').select('id,balance').in('id', [fromBankId, toBankId]);
  const fb = freshBanks.find(b => b.id === fromBankId);
  const tb = freshBanks.find(b => b.id === toBankId);
  const ef = await s.from('bank_accounts').update({ balance: Number(fb.balance) + sum }).eq('id', fromBankId);
  if (ef.error) die(`Update ${fromBank.name} balance failed: ${ef.error.message}`);
  const et = await s.from('bank_accounts').update({ balance: Number(tb.balance) - sum }).eq('id', toBankId);
  if (et.error) die(`Update ${toBank.name} balance failed: ${et.error.message}`);
  console.log(`  ✓ balances adjusted (${fromBank.name} +${rupiah(sum)}, ${toBank.name} -${rupiah(sum)})`);

  for (const l of creditLines) {
    const { error } = await s.from('journal_lines').update({ account_id: toCoa.id }).eq('id', l.id);
    if (error) die(`Update journal_line ${l.id} failed: ${error.message}`);
  }
  console.log(`  ✓ ${creditLines.length} journal credit lines re-pointed`);

  console.log('\n✅ Done. Verify in-app: Bank Jago should be back to 0, BCA reduced, GL balanced.\n');
})().catch(e => die(e.message || String(e)));
