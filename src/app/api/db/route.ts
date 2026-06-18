import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // Extend Vercel function timeout to 60s

const isMissingTableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  // Only treat genuine missing-TABLE errors as skippable. A missing-COLUMN
  // error also mentions "schema cache" ("Could not find the 'x' column ...")
  // but must NOT be silently skipped — that drops user data without warning.
  return /could not find the table/i.test(message);
};

const isNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Retry wrapper for transient Supabase network errors
async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === maxAttempts) throw err;
      const backoff = Math.min(500 * Math.pow(2, attempt - 1), 4000);
      console.warn(`[Retry] ${label} attempt ${attempt} failed (${(err as Error).message}). Retry in ${backoff}ms.`);
      await sleep(backoff);
    }
  }
  throw lastError;
}

// Helper to convert snake_case to camelCase for the frontend
const toCamel = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj === null || typeof obj !== 'object') return obj;
  const n: any = {};
  Object.keys(obj).forEach((k) => {
    let ck = k.replace(/(_\w)/g, (m) => m[1].toUpperCase());
    if (ck === 'isQced') ck = 'isQCed';
    n[ck] = toCamel(obj[k]);
  });
  return n;
};

// GET: Fetch tables by group (Hobby plan: must stay under 10s per call)
// Groups: 1=core, 2=orders, 3=finance, 4=warehouse, 5=misc
export async function GET(request: Request) {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group');

    const fetchTable = async (table: string) => {
        try {
          const PAGE_SIZE = 1000;
          let allData: any[] = [];
          let from = 0;
          
          while (true) {
            const { data, error } = await withRetry(
              async () => await supabase.from(table).select('*').order('id').range(from, from + PAGE_SIZE - 1),
              `select ${table}`
            );

            if (error) {
              if (isMissingTableError(error)) return [];
              throw new Error(`Error fetching ${table}: ${error.message}`);
            }
            
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            
            if (data.length < PAGE_SIZE) break; // Last page
            from += PAGE_SIZE;
          }
          
          return allData;
        } catch (e) {
          console.error(`Fetch exception for ${table}:`, e);
          throw e;
        }
    };

    // --- GROUP 1: Core (users, clients, products, settings) ---
    if (group === '1') {
      const [users, clients, products, appSettings, clientPrices] = await Promise.all([
        fetchTable('users'), fetchTable('clients'), fetchTable('products'),
        fetchTable('app_settings'), fetchTable('client_prices')
      ]);
      const globalSettings = appSettings.find((s: any) => s.id === 'global-settings') || appSettings[0];
      return NextResponse.json({
        users: toCamel(users),
        clients: toCamel(clients),
        products: toCamel(products),
        clientPrices: toCamel(clientPrices),
        navConfigs: globalSettings?.nav_configs || {},
        rolePermissions: globalSettings?.role_permissions || {},
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 2: Orders (sales orders, purchases) ---
    if (group === '2') {
      const [salesOrders, salesOrderItems, purchases, purchaseItems, purchaseRequests] = await Promise.all([
        fetchTable('sales_orders'), fetchTable('sales_order_items'),
        fetchTable('purchases'), fetchTable('purchase_items'),
        fetchTable('purchase_requests')
      ]);
      return NextResponse.json({
        salesOrders: toCamel(salesOrders),
        salesOrderItems: toCamel(salesOrderItems),
        purchases: toCamel(purchases),
        purchaseItems: toCamel(purchaseItems),
        purchaseRequests: toCamel(purchaseRequests),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 3: Finance ---
    if (group === '3') {
      const [coas, bankAccounts, cashTransactions, journalEntries, journalLines, invoices, expenses, reimbursements, vendorBills, tukarFakturs, budgetPlans, budgetCategories, budgetSubCategories, budgetAdjustments] = await Promise.all([
        fetchTable('coas'), fetchTable('bank_accounts'),
        fetchTable('cash_transactions'), fetchTable('journal_entries'),
        fetchTable('journal_lines'), fetchTable('invoices'),
        fetchTable('expenses'), fetchTable('reimbursements'),
        fetchTable('vendor_bills'), fetchTable('tukar_faktur'),
        fetchTable('budget_plans'), fetchTable('budget_categories'),
        fetchTable('budget_sub_categories'), fetchTable('budget_adjustments')
      ]);
      return NextResponse.json({
        coas: toCamel(coas),
        bankAccounts: toCamel(bankAccounts),
        cashTransactions: toCamel(cashTransactions),
        journalEntries: toCamel(journalEntries),
        journalLines: toCamel(journalLines),
        invoices: toCamel(invoices),
        expenses: toCamel(expenses),
        reimbursements: toCamel(reimbursements),
        vendorBills: toCamel(vendorBills),
        tukarFakturs: toCamel(tukarFakturs),
        budgetPlans: toCamel(budgetPlans),
        budgetCategories: toCamel(budgetCategories),
        budgetSubCategories: toCamel(budgetSubCategories),
        budgetAdjustments: toCamel(budgetAdjustments),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 4: Warehouse & Logistics ---
    if (group === '4') {
      const [vendors, deliveries, stockMovements, pendingReturns, rejectedItems] = await Promise.all([
        fetchTable('vendors'), fetchTable('deliveries'),
        fetchTable('stock_movements'), fetchTable('pending_returns'),
        fetchTable('rejected_items')
      ]);
      return NextResponse.json({
        vendors: toCamel(vendors),
        deliveries: toCamel(deliveries),
        stockMovements: toCamel(stockMovements),
        pendingReturns: toCamel(pendingReturns),
        rejectedItems: toCamel(rejectedItems),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 5: Misc (HR, CRM, Tasks, OKR, Assets) ---
    if (group === '5') {
      const [leads, dismaTasks, notifications, employees, kpis, okrObjectives, okrKeyResults, fixedAssets] = await Promise.all([
        fetchTable('leads'), fetchTable('disma_tasks'), fetchTable('notifications'),
        fetchTable('employees'), fetchTable('kpis'), fetchTable('okr_objectives'),
        fetchTable('okr_key_results'), fetchTable('fixed_assets')
      ]);
      const objectives = toCamel(okrObjectives);
      const krs = toCamel(okrKeyResults);
      return NextResponse.json({
        leads: toCamel(leads),
        tasks: toCamel(dismaTasks),
        notifications: toCamel(notifications),
        employees: toCamel(employees),
        kpiObjectives: toCamel(kpis),
        fixedAssets: toCamel(fixedAssets),
        okrObjectives: objectives.map((o: any) => ({
          ...o,
          keyResults: krs.filter((kr: any) => kr.objectiveId === o.id)
        })),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- NO GROUP: Return error instructing to use groups ---
    return NextResponse.json({ error: 'Use ?group=1 through ?group=5' }, { status: 400 });

  } catch (error) {
    console.error('API GET Error:', error);
    return NextResponse.json({ error: 'Failed to aggregate data' }, { status: 500 });
  }
}

// POST: Intelligent Sync (Updates only what is provided)
export async function POST(request: Request) {
  try {
    const { table, data } = await request.json();

    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });
    if (!table) return NextResponse.json({ error: 'Table name required' }, { status: 400 });

    // Convert camelCase to snake_case for the database
    const toSnake = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(toSnake);
        if (obj === null || typeof obj !== 'object') return obj;
        const n: any = {};
        Object.keys(obj).forEach((k) => {
          let sk = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
          if (sk === 'is_q_ced') sk = 'is_qced';
          
          let val = obj[k];
          if (typeof val === 'string' && val === '' && sk.endsWith('_id')) {
             val = null;
          }
          
          n[sk] = toSnake(val);
        });
        return n;
    };

    let snakeData = table === 'app_settings' ? data : toSnake(data);

    // Sanitization blocks are removed for local development to allow all fields to sync



    if (table === 'stock_movements') {
       const sanitize = (item: Record<string, unknown>) => {
          const { created_by_user_id, ...rest } = item;
          return rest;
       };
       snakeData = Array.isArray(snakeData) ? snakeData.map(sanitize) : sanitize(snakeData);
    }

    // Handle single item or array upsert
    const items = Array.isArray(snakeData) ? snakeData : [snakeData];
    
    // Chunk items to avoid Supabase/Postgrest limits (max ~1000 parameters/payload size)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const { error } = await withRetry(
        async () => await supabase.from(table).upsert(chunk, { onConflict: 'id' }),
        `upsert ${table} chunk ${i}`
      );

      if (error) {
        if (isMissingTableError(error)) {
          return NextResponse.json({ success: true, count: 0, skipped: true, missingTable: true });
        }
        console.error(`Supabase POST Error (${table} chunk ${i}):`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: items.length });

  } catch (error) {
    console.error('API POST Error:', error);
    return NextResponse.json({ error: 'Failed to sync data' }, { status: 500 });
  }
}

// DELETE: Remove record(s) from a table
export async function DELETE(request: Request) {
  try {
    const { table, id } = await request.json();

    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });
    if (!table || !id) return NextResponse.json({ error: 'Table and ID required' }, { status: 400 });

    const ids = Array.isArray(id) ? id : [id];
    const { error } = await withRetry(
      async () => await supabase.from(table).delete().in('id', ids),
      `delete ${table}`
    );

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ success: true, count: 0 });
      }
      console.error(`Supabase DELETE Error (${table}):`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: ids.length });

  } catch (error) {
    console.error('API DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 });
  }
}
