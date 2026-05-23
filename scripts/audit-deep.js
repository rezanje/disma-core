const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(dbUrl, dbKey);

  console.log(`\n========== DEEP AUDIT: ${profile} database ==========\n`);

  // 1. Check all imported invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .like('id', 'inv-import-%')
    .order('id', { ascending: true });

  // 2. Check all clients
  const { data: clients } = await supabase
    .from('clients')
    .select('*');

  const clientMap = new Map();
  clients.forEach(c => clientMap.set(c.id, c));

  console.log(`Total imported invoices: ${invoices.length}`);
  console.log(`Total clients: ${clients.length}`);

  // 3. Check for orphan invoices (client_id doesn't exist)
  const orphans = invoices.filter(inv => !clientMap.has(inv.client_id));
  console.log(`\n--- ORPHAN INVOICES (missing client): ${orphans.length} ---`);
  orphans.forEach(inv => console.log(`  ${inv.id}: client_id=${inv.client_id}`));

  // 4. Check for NULL or empty critical fields
  const badFields = [];
  invoices.forEach(inv => {
    if (!inv.client_id) badFields.push({ id: inv.id, issue: 'NULL client_id' });
    if (!inv.issue_date) badFields.push({ id: inv.id, issue: 'NULL issue_date' });
    if (!inv.due_date) badFields.push({ id: inv.id, issue: 'NULL due_date' });
    if (inv.total_amount === null || inv.total_amount === undefined) badFields.push({ id: inv.id, issue: 'NULL total_amount' });
    if (inv.status === null || inv.status === undefined) badFields.push({ id: inv.id, issue: 'NULL status' });
    if (inv.total_amount === 0) badFields.push({ id: inv.id, issue: `total_amount=0 (client: ${inv.client_id})` });
  });
  console.log(`\n--- BAD FIELDS: ${badFields.length} ---`);
  badFields.forEach(bf => console.log(`  ${bf.id}: ${bf.issue}`));

  // 5. Check status logic consistency
  const statusIssues = [];
  invoices.forEach(inv => {
    const remaining = inv.total_amount - inv.amount_paid;
    if (inv.status === 'Paid' && remaining > 0.01) {
      statusIssues.push({ id: inv.id, issue: `Paid but remaining=${remaining}` });
    }
    if (inv.status === 'Unpaid' && inv.amount_paid > 0) {
      statusIssues.push({ id: inv.id, issue: `Unpaid but amount_paid=${inv.amount_paid}` });
    }
    if (inv.status === 'Partial' && inv.amount_paid <= 0) {
      statusIssues.push({ id: inv.id, issue: `Partial but amount_paid=0` });
    }
    if (inv.status === 'Partial' && remaining <= 0) {
      statusIssues.push({ id: inv.id, issue: `Partial but remaining=${remaining} (should be Paid)` });
    }
  });
  console.log(`\n--- STATUS CONSISTENCY ISSUES: ${statusIssues.length} ---`);
  statusIssues.forEach(si => console.log(`  ${si.id}: ${si.issue}`));

  // 6. Check payments array consistency  
  const paymentIssues = [];
  invoices.forEach(inv => {
    const payments = inv.payments || [];
    const paymentTotal = payments.reduce((s, p) => s + (p.amount || 0), 0);
    
    if (inv.amount_paid > 0 && payments.length === 0) {
      paymentIssues.push({ id: inv.id, issue: `amount_paid=${inv.amount_paid} but payments array is empty`, client: inv.client_id });
    }
    if (payments.length > 0 && Math.abs(paymentTotal - inv.amount_paid) > 0.01) {
      paymentIssues.push({ id: inv.id, issue: `payments total=${paymentTotal} != amount_paid=${inv.amount_paid}`, client: inv.client_id });
    }
    
    // Check payment has valid bankAccountId
    payments.forEach(p => {
      if (!p.bankAccountId) {
        paymentIssues.push({ id: inv.id, issue: `payment ${p.id} missing bankAccountId` });
      }
    });
  });
  console.log(`\n--- PAYMENT ARRAY ISSUES: ${paymentIssues.length} ---`);
  paymentIssues.forEach(pi => console.log(`  ${pi.id}: ${pi.issue}`));

  // 7. Date format check
  const dateIssues = [];
  invoices.forEach(inv => {
    if (inv.issue_date && !inv.issue_date.match(/^\d{4}-\d{2}-\d{2}T/)) {
      dateIssues.push({ id: inv.id, issue: `issue_date format: "${inv.issue_date}"` });
    }
    if (inv.due_date && !inv.due_date.match(/^\d{4}-\d{2}-\d{2}T/)) {
      dateIssues.push({ id: inv.id, issue: `due_date format: "${inv.due_date}"` });
    }
    // Check date validity
    if (inv.issue_date) {
      const d = new Date(inv.issue_date);
      if (isNaN(d.getTime())) dateIssues.push({ id: inv.id, issue: `issue_date INVALID: "${inv.issue_date}"` });
    }
    if (inv.due_date) {
      const d = new Date(inv.due_date);
      if (isNaN(d.getTime())) dateIssues.push({ id: inv.id, issue: `due_date INVALID: "${inv.due_date}"` });
    }
  });
  console.log(`\n--- DATE FORMAT ISSUES: ${dateIssues.length} ---`);
  dateIssues.forEach(di => console.log(`  ${di.id}: ${di.issue}`));

  // 8. Check clients for missing fields  
  const clientIssues = [];
  clients.forEach(c => {
    if (!c.company_name || c.company_name.trim() === '') {
      clientIssues.push({ id: c.id, issue: 'empty company_name' });
    }
    if (!c.created_at) {
      clientIssues.push({ id: c.id, issue: 'NULL created_at' });
    }
  });
  console.log(`\n--- CLIENT ISSUES: ${clientIssues.length} ---`);
  clientIssues.forEach(ci => console.log(`  ${ci.id}: ${ci.issue}`));

  // 9. Summary of the invoice states
  const summary = {
    Paid: invoices.filter(i => i.status === 'Paid'),
    Partial: invoices.filter(i => i.status === 'Partial'),
    Unpaid: invoices.filter(i => i.status === 'Unpaid'),
  };

  console.log('\n--- FINAL SUMMARY ---');
  console.log(`  Paid: ${summary.Paid.length} invoices`);
  summary.Paid.forEach(inv => console.log(`    ${inv.id} | ${inv.client_id} | total=${inv.total_amount} paid=${inv.amount_paid}`));
  console.log(`  Partial: ${summary.Partial.length} invoices`);
  summary.Partial.forEach(inv => console.log(`    ${inv.id} | ${inv.client_id} | total=${inv.total_amount} paid=${inv.amount_paid} remaining=${inv.total_amount - inv.amount_paid}`));
  console.log(`  Unpaid: ${summary.Unpaid.length} invoices`);

  // 10. Check for duplicate client names (could cause confusion)
  const nameMap = new Map();
  clients.forEach(c => {
    const name = c.company_name.trim().toUpperCase();
    if (!nameMap.has(name)) nameMap.set(name, []);
    nameMap.get(name).push(c.id);
  });
  const dupes = [...nameMap.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`\n--- DUPLICATE CLIENT NAMES: ${dupes.length} ---`);
  dupes.forEach(([name, ids]) => console.log(`  "${name}" => ${ids.join(', ')}`));
}

main();
