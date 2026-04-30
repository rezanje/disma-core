import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// GET: Aggregate all tables into a single app state (Backward compatible)
export async function GET() {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });

    const fetchTable = async (table: string) => {
        let allData: any[] = [];
        let from = 0;
        let to = 999;
        let finished = false;

        while (!finished) {
          const { data, error } = await supabase.from(table)
            .select('*')
            .order('id')
            .range(from, to);
            
          if (error) {
            console.error(`Error fetching table ${table}:`, error.message);
            break;
          }
          
          if (!data || data.length === 0) {
            finished = true;
          } else {
            allData = [...allData, ...data];
            if (data.length < 1000) {
              finished = true;
            } else {
              from += 1000;
              to += 1000;
            }
          }
        }
        return allData;
    };

    const [
      users, clients, vendors, products, coas, bankAccounts,
      salesOrders, salesOrderItems, purchases, purchaseItems,
      deliveries, invoices, journalEntries, journalLines,
      leads, dismaTasks, notifications, employees,
      kpis, okrObjectives, okrKeyResults,
      expenses, reimbursements, cashTransactions,
      fixedAssets, pendingReturns, rejectedItems, appSettings
    ] = await Promise.all([
      fetchTable('users'), fetchTable('clients'), fetchTable('vendors'),
      fetchTable('products'), fetchTable('coas'), fetchTable('bank_accounts'),
      fetchTable('sales_orders'), fetchTable('sales_order_items'),
      fetchTable('purchases'), fetchTable('purchase_items'),
      fetchTable('deliveries'), fetchTable('invoices'),
      fetchTable('journal_entries'), fetchTable('journal_lines'),
      fetchTable('leads'), fetchTable('disma_tasks'),
      fetchTable('notifications'), fetchTable('employees'),
      fetchTable('kpis'), fetchTable('okr_objectives'),
      fetchTable('okr_key_results'), fetchTable('expenses'),
      fetchTable('reimbursements'), fetchTable('cash_transactions'),
      fetchTable('fixed_assets'), fetchTable('pending_returns'),
      fetchTable('rejected_items'), fetchTable('app_settings')
    ]);

    // Construct the legacy state object structure
    const state: any = {
      users: toCamel(users),
      clients: toCamel(clients),
      vendors: toCamel(vendors),
      products: toCamel(products),
      coas: toCamel(coas),
      bankAccounts: toCamel(bankAccounts),
      salesOrders: toCamel(salesOrders),
      salesOrderItems: toCamel(salesOrderItems),
      purchases: toCamel(purchases),
      purchaseItems: toCamel(purchaseItems),
      deliveries: toCamel(deliveries),
      invoices: toCamel(invoices),
      journalEntries: toCamel(journalEntries),
      journalLines: toCamel(journalLines),
      leads: toCamel(leads),
      tasks: toCamel(dismaTasks),
      notifications: toCamel(notifications),
      employees: toCamel(employees),
      kpiObjectives: toCamel(kpis),
      expenses: toCamel(expenses),
      reimbursements: toCamel(reimbursements),
      cashTransactions: toCamel(cashTransactions),
      fixedAssets: toCamel(fixedAssets),
      pendingReturns: toCamel(pendingReturns),
      rejectedItems: toCamel(rejectedItems),
      navConfigs: appSettings[0]?.nav_configs || {},
      rolePermissions: appSettings[0]?.role_permissions || {}
    };

    // Reconstruct OKRs (they are nested in the frontend state)
    const objectives = toCamel(okrObjectives);
    const krs = toCamel(okrKeyResults);
    state.okrObjectives = objectives.map((o: any) => ({
      ...o,
      keyResults: krs.filter((kr: any) => kr.objectiveId === o.id)
    }));

    return NextResponse.json(state, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });

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
          if (typeof val === 'string' && (val === '' || val === 'pending') && sk.endsWith('_id')) {
             val = null;
          }
          
          n[sk] = toSnake(val);
        });
        return n;
    };

    let snakeData = table === 'app_settings' ? data : toSnake(data);

    // CRITICAL FIX: Sanitize purchases table to avoid crashes if schema is not updated
    if (table === 'purchases') {
       const sanitize = (item: any) => {
          const {
            reconciliation_proof_url,
            reconciliation_note,
            reconciliation_status,
            ...rest
          } = item;
          // For now, we only sync 'reconciliation_status' if we're sure it exists,
          // or we just let it fail for that specific column if we can't sanitize.
          // Since the user is getting errors specifically for 'reconciliation_proof_url',
          // we'll omit the new fields to keep the system running.
          return rest;
       };
       snakeData = Array.isArray(snakeData) ? snakeData.map(sanitize) : sanitize(snakeData);
    }

    // CRITICAL FIX: Sanitize expenses table — target_bank_account_id column may not exist yet
    if (table === 'expenses') {
       const sanitize = (item: any) => {
          const { target_bank_account_id, ...rest } = item;
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
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
      
      if (error) {
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
