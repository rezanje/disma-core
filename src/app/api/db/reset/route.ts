import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this heavy operation

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    
    let action = 'full';
    let seedData: any = null;
    try {
      const body = await request.json();
      action = body.action || 'full';
      seedData = body.seedData || null;
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

    // Determine what to wipe.
    const tablesToClear = action === 'simulation' 
      ? operationalTables 
      : [...operationalTables, ...masterTables];

    console.log(`[DB Reset] Starting wipe for ${tablesToClear.length} tables in mode: ${action}`);

    // PHASE 1: DELETE everything
    for (const table of tablesToClear) {
      const { error } = await supabaseAdmin.from(table).delete().not('id', 'is', null);
      if (error) {
        console.error(`[DB Reset] Error clearing ${table}:`, error.message);
        return NextResponse.json({ error: `Failed to clear ${table}: ${error.message}` }, { status: 500 });
      } else {
        console.log(`[DB Reset] ✅ Cleared: ${table}`);
      }
    }

    // PHASE 2: RE-SEED (only if seedData is provided — do it server-side to avoid browser timeout)
    const seededTables: string[] = [];
    if (seedData && typeof seedData === 'object') {
      // Convert camelCase keys to snake_case for Supabase
      const toSnake = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(toSnake);
        if (obj === null || typeof obj !== 'object') return obj;
        const n: any = {};
        Object.keys(obj).forEach((k) => {
          const sk = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
          n[sk] = toSnake(obj[k]);
        });
        return n;
      };

      // Process each table in the seedData
      for (const [table, rows] of Object.entries(seedData)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        
        const snakeRows = toSnake(rows);
        const CHUNK = 200; // Smaller chunks for reliability
        
        for (let i = 0; i < snakeRows.length; i += CHUNK) {
          const chunk = snakeRows.slice(i, i + CHUNK);
          const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict: 'id' });
          if (error) {
            console.error(`[DB Reset] Seed error ${table} chunk ${i}:`, error.message);
          }
        }
        
        console.log(`[DB Reset] 🌱 Seeded: ${table} (${(rows as any[]).length} rows)`);
        seededTables.push(table);
      }
    }

    return NextResponse.json({ 
      success: true, 
      cleared: tablesToClear,
      seeded: seededTables 
    });
  } catch (error) {
    console.error('API DB RESET Error:', error);
    return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
  }
}
