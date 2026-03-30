import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log('🚀 Starting Industrial Migration to Relational Schema...');

  // 1. Fetch current blob
  const { data: blobRow, error: blobError } = await supabase
    .from('app_data')
    .select('data')
    .eq('id', 'disma-main')
    .single();

  if (blobError || !blobRow) {
    console.warn('⚠️ No existing data found in app_data (disma-main). Skipping migration.');
    return;
  }

  const data = blobRow.data;
  console.log('📦 Data Blob found. Mapping entities...');

  // Mapping Helper
  const mapData = (arr: any[], mapper: (item: any) => any) => (arr || []).map(mapper);

  // --- ENTITY MAPPINGS ---

  const users = mapData(data.users, (u) => ({
    id: u.id, name: u.name, role: u.role, pin: u.pin
  }));

  const clients = mapData(data.clients, (c) => ({
    id: c.id, company_name: c.companyName, pic_name: c.picName, email: c.email,
    phone: c.phone, address: c.address, payment_term_days: c.paymentTermDays, created_at: c.createdAt
  }));

  const vendors = mapData(data.vendors, (v) => ({
    id: v.id, company_name: v.companyName, pic_name: v.picName, email: v.email,
    phone: v.phone, address: v.address, created_at: v.createdAt
  }));

  const products = mapData(data.products, (p) => ({
    id: p.id, sku_code: p.skuCode, name: p.name, uom: p.uom,
    base_price: p.basePrice, selling_price: p.sellingPrice,
    current_stock: p.currentStock, price_history: p.priceHistory || [],
    weekly_price_range: p.weeklyPriceRange || {}
  }));

  const coas = mapData(data.coas, (c) => ({
    id: c.id, account_code: c.accountCode, account_name: c.accountName, account_type: c.accountType
  }));

  const bankAccounts = mapData(data.bankAccounts, (b) => ({
    id: b.id, name: b.name, account_number: b.accountNumber, account_code: b.accountCode, balance: b.balance
  }));

  const salesOrders = mapData(data.salesOrders, (so) => ({
    id: so.id, po_number: so.poNumber, client_id: so.clientId, order_date: so.orderDate,
    target_delivery_date: so.targetDeliveryDate, status: so.status,
    archived_surat_jalan_url: so.archivedSuratJalanUrl, archived_ba_url: so.archivedBaUrl,
    proof_of_delivery_url: so.proofOfDeliveryUrl, handover_date: so.handoverDate,
    handover_by: so.handoverBy, received_by: so.receivedBy,
    courier_signature: so.courierSignature, client_signature: so.clientSignature
  }));

  const salesOrderItems = mapData(data.salesOrderItems, (item) => ({
    id: item.id, sales_order_id: item.salesOrderId, product_id: item.productId,
    qty: item.qty, qty_final: item.qtyFinal, unit_price: item.unitPrice,
    subtotal: item.subtotal, subtotal_final: item.subtotalFinal,
    qty_adjustment_reason: item.qtyAdjustmentReason, is_packed: item.isPacked,
    is_handover_checked: item.isHandoverChecked
  }));

  const purchases = mapData(data.purchases, (p) => ({
    id: p.id, date: p.date, purchaser_id: p.purchaserId, status: p.status,
    budget_amount: p.budgetAmount, budget_transfer_date: p.budgetTransferDate,
    budget_transfered_by: p.budgetTransferedBy, budget_bank_account_id: p.budgetBankAccountId,
    operational_spare_amount: p.operationalSpareAmount, actual_spent: p.actualSpent,
    change_returned: p.changeReturned, reconciliation_note: p.reconciliationNote,
    reconciliation_status: p.reconciliationStatus
  }));

  const purchaseItems = mapData(data.purchaseItems, (item) => ({
    id: item.id, purchase_id: item.purchaseId, product_id: item.productId,
    sales_order_id: item.salesOrderId, qty_target: item.qtyTarget,
    qty_purchased: item.qtyPurchased, estimated_unit_price: item.estimatedUnitPrice,
    actual_unit_price: item.actualUnitPrice, notes: item.notes,
    receipt_url: item.receiptUrl, is_checked: item.isChecked,
    is_qced: item.isQCed, purchase_method: item.purchaseMethod,
    online_ref: item.onlineRef, online_order_date: item.onlineOrderDate,
    is_online_ordered: item.isOnlineOrdered
  }));

  const deliveries = mapData(data.deliveries, (d) => ({
    id: d.id, sales_order_id: d.salesOrderId, courier_id: d.courierId,
    status: d.status, delivery_date: d.deliveryDate, ba_url: d.baUrl
  }));

  const invoices = mapData(data.invoices, (i) => ({
    id: i.id, sales_order_id: i.salesOrderId, sales_order_ids: i.salesOrderIds || [],
    is_consolidated: i.isConsolidated, consolidated_order_numbers: i.consolidatedOrderNumbers || [],
    client_id: i.clientId, issue_date: i.issueDate, due_date: i.dueDate,
    total_amount: i.totalAmount, amount_paid: i.amountPaid,
    status: i.status, payments: i.payments || [], paid_date: i.paidDate
  }));

  const journalEntries = mapData(data.journalEntries, (j) => ({
    id: j.id, transaction_date: j.transactionDate, description: j.description,
    reference_type: j.referenceType, reference_id: j.referenceId
  }));

  const journalLines = mapData(data.journalLines, (l) => ({
    id: l.id, journal_entry_id: l.journalEntryId, account_id: l.accountId,
    debit_amount: l.debitAmount, credit_amount: l.creditAmount
  }));

  const leads = mapData(data.leads, (l) => ({
    id: l.id, company_name: l.companyName, contact_name: l.contactName,
    value: l.value, status: l.status, notes: l.notes, created_at: l.createdAt
  }));

  const dismaTasks = mapData(data.tasks, (t) => ({
    id: t.id, title: t.title, description: t.description, status: t.status,
    priority: t.priority, assigned_to_id: t.assignedToId,
    created_by_original_id: t.createdByOriginalId, due_date: t.dueDate,
    created_at: t.createdAt, progress: t.progress, comments: t.comments || [],
    attachments: t.attachments || []
  }));

  const notifications = mapData(data.notifications, (n) => ({
    id: n.id, user_id: n.userId, title: n.title, message: n.message,
    type: n.type, link: n.link, read: n.read, created_at: n.createdAt
  }));

  const employees = mapData(data.employees, (e) => ({
    id: e.id, user_id: e.userId, full_name: e.fullName, position: e.position,
    department: e.department, base_salary: e.baseSalary, kasbon: e.kasbon,
    join_date: e.joinDate, status: e.status
  }));

  const kpis = mapData(data.kpiObjectives, (k) => ({
    id: k.id, assignee_user_id: k.assigneeUserId, assigned_by_user_id: k.assignedByUserId,
    specific: k.specific, measurable: k.measurable, achievable: k.achievable,
    relevant: k.relevant, time_bound: k.timeBound, period: k.period,
    weight: k.weight, target_value: k.targetValue, actual_value: k.actualValue,
    unit: k.unit, title: k.title, category: k.category, status: k.status,
    evaluator_note: k.evaluatorNote, evaluated_at: k.evaluatedAt,
    evaluated_by: k.evaluatedBy, manual_grade: k.manualGrade,
    created_at: k.createdAt, updated_at: k.updatedAt
  }));

  const okrObjectives = mapData(data.okrObjectives, (o) => ({
    id: o.id, title: o.title, description: o.description, period: o.period,
    owner_id: o.ownerId, progress: o.progress
  }));

  const okrKeyResults: any[] = [];
  (data.okrObjectives || []).forEach((o: any) => {
    (o.keyResults || []).forEach((kr: any) => {
      okrKeyResults.push({
        id: kr.id, objective_id: o.id, title: kr.title,
        target_value: kr.targetValue, current_value: kr.currentValue,
        unit: kr.unit, linked_kpi_id: kr.linkedKpiId, linked_task_id: kr.linkedTaskId
      });
    });
  });

  const expenses = mapData(data.expenses, (e) => ({
    id: e.id, date: e.date, reporter_id: e.reporterId, category: e.category,
    amount: e.amount, admin_fee: e.adminFee, shipping_fee: e.shippingFee,
    description: e.description, receipt_url: e.receiptUrl, status: e.status,
    reference_id: e.referenceId, is_journaled: e.isJournaled, notes: e.notes,
    audit_date: e.auditDate, audit_note: e.auditNote
  }));

  const reimbursements = mapData(data.reimbursements, (r) => ({
    id: r.id, date: r.date, user_id: r.userId, title: r.title,
    amount: r.amount, description: r.description, receipt_url: r.receiptUrl,
    status: r.status, audit_date: r.auditDate, audit_note: r.auditNote,
    payment_date: r.paymentDate, payment_reference: r.paymentReference
  }));

  const cashTransactions = mapData(data.cashTransactions, (t) => ({
    id: t.id, date: t.date, type: t.type, amount: t.amount,
    bank_account_id: t.bankAccountId, category: t.category, description: t.description,
    reference_type: t.referenceType, reference_id: t.referenceId,
    counterpart_name: t.counterpartName, receipt_url: t.receiptUrl
  }));

  const fixedAssets = mapData(data.fixedAssets, (a) => ({
    id: a.id, name: a.name, category: a.category, purchase_date: a.purchaseDate,
    purchase_price: a.purchasePrice, economic_life_months: a.economicLifeMonths,
    salvage_value: a.salvageValue, current_value: a.currentValue,
    accumulated_depreciation: a.accumulatedDepreciation, status: a.status
  }));

  const pendingReturns = mapData(data.pendingReturns, (r) => ({
    id: r.id, product_id: r.productId, original_so_id: r.originalSoId,
    qty: r.qty, reason: r.reason, date: r.date, status: r.status
  }));

  const appSettings = [{
    id: 'global-settings',
    nav_configs: data.navConfigs || {},
    role_permissions: data.rolePermissions || {}
  }];

  // --- UPSERT TO DB ---

  const tables = [
    { name: 'users', rows: users },
    { name: 'clients', rows: clients },
    { name: 'vendors', rows: vendors },
    { name: 'products', rows: products },
    { name: 'coas', rows: coas },
    { name: 'bank_accounts', rows: bankAccounts },
    { name: 'sales_orders', rows: salesOrders },
    { name: 'sales_order_items', rows: salesOrderItems },
    { name: 'purchases', rows: purchases },
    { name: 'purchase_items', rows: purchaseItems },
    { name: 'deliveries', rows: deliveries },
    { name: 'invoices', rows: invoices },
    { name: 'journal_entries', rows: journalEntries },
    { name: 'journal_lines', rows: journalLines },
    { name: 'leads', rows: leads },
    { name: 'disma_tasks', rows: dismaTasks },
    { name: 'notifications', rows: notifications },
    { name: 'employees', rows: employees },
    { name: 'kpis', rows: kpis },
    { name: 'okr_objectives', rows: okrObjectives },
    { name: 'okr_key_results', rows: okrKeyResults },
    { name: 'expenses', rows: expenses },
    { name: 'reimbursements', rows: reimbursements },
    { name: 'cash_transactions', rows: cashTransactions },
    { name: 'fixed_assets', rows: fixedAssets },
    { name: 'pending_returns', rows: pendingReturns },
    { name: 'app_settings', rows: appSettings }
  ];

  for (const table of tables) {
    if (table.rows.length === 0) continue;
    
    console.log(`📤 Migrating ${table.rows.length} rows to ${table.name}...`);
    
    // Chunk upsert to avoid payload limits
    const chunkSize = 50;
    for (let i = 0; i < table.rows.length; i += chunkSize) {
      const chunk = table.rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(table.name).upsert(chunk);
      if (error) {
        console.error(`❌ Error in ${table.name}:`, error.message);
      }
    }
  }

  console.log('✅ Industrial migration complete!');
}

migrate();
