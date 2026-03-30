import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });
    
    let action = 'full';
    try {
      const body = await request.json();
      action = body.action || 'full';
    } catch (e) {
      // Ignore if no body
    }

    // Tables ordered by dependency (children first, parents last) to avoid foreign key violations.
    const operationalTables = [
      'sales_order_items', 'purchase_items', 'journal_lines', 'okr_key_results',
      'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 'okr_objectives',
      'reimbursements', 'expenses', 'cash_transactions', 'pending_returns', 'fixed_assets', 
      'notifications', 'disma_tasks', 'leads', 'employees', 'kpis'
    ];

    // Master definition tables.
    const masterTables = [
      'bank_accounts', 'coas', 'products', 'vendors', 'clients', 'users'
    ];

    // Determine what to wipe. Simulation keeps the master data, full clears everything.
    const tablesToClear = action === 'simulation' 
      ? operationalTables 
      : [...operationalTables, ...masterTables];

    // Sequentially delete from tables.
    for (const table of tablesToClear) {
      // Dummy check that effectively deletes all rows
      const { error } = await supabase.from(table).delete().not('id', 'is', null);
      if (error) {
        console.error(`[DB Reset] Error clearing ${table}:`, error.message);
      }
    }

    return NextResponse.json({ success: true, cleared: tablesToClear });
  } catch (error) {
    console.error('API API RESET Error:', error);
    return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
  }
}
