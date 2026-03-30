import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    
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

    console.log(`[DB Reset] Starting wipe for ${tablesToClear.length} tables in mode: ${action}`);

    // Sequentially delete from tables using service_role client to bypass RLS.
    for (const table of tablesToClear) {
      const { error } = await supabaseAdmin.from(table).delete().not('id', 'is', null);
      if (error) {
        console.error(`[DB Reset] Error clearing ${table}:`, error.message);
      } else {
        console.log(`[DB Reset] Successfully cleared table: ${table}`);
      }
    }

    return NextResponse.json({ success: true, cleared: tablesToClear });
  } catch (error) {
    console.error('API DB RESET Error:', error);
    return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
  }
}
