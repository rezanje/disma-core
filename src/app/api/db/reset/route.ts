import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this heavy operation

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase Admin not initialized' }, { status: 500 });
    
    let action = 'full';
    let seedData: any = null;
    let customTables: string[] = [];
    try {
      const body = await request.json();
      action = body.action || 'full';
      seedData = body.seedData || null;
      customTables = body.tables || [];
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

    const actionVal = action;
    const isWipeAction = ['wipe', 'full', 'simulation', 'master', 'products_only', 'custom'].includes(actionVal);

    if (actionVal === 'reset_stock') {
      const { error } = await supabaseAdmin.from('products').update({ current_stock: 0 }).neq('id', '99999999-9999-9999-9999-999999999999');
      if (error) {
        console.error('[DB Reset] Error resetting stock:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      console.log('[DB Reset] ✅ Resetted all stocks to 0');
      return NextResponse.json({ success: true, message: 'Stock reset to 0' });
    }

    if (isWipeAction) {
      let tablesToClear: string[] = [];
      
      if (actionVal === 'custom') {
        // Enforce deletion order by using predefined lists
        const sortedTables = [...operationalTables, ...masterTables];
        tablesToClear = sortedTables.filter(t => customTables.includes(t));
      } else if (actionVal === 'products_only') {
        tablesToClear = ['products'];
      } else if (actionVal === 'clients_only') {
        tablesToClear = ['clients'];
      } else if (actionVal === 'simulation') {
        tablesToClear = operationalTables;
      } else if (actionVal === 'master') {
        tablesToClear = [...operationalTables, 'products', 'vendors', 'clients', 'coas'];
      } else {
        tablesToClear = [...operationalTables, ...masterTables];
      }

      console.log(`[DB Reset] Starting wipe for ${tablesToClear.length} tables in mode: ${actionVal}`);

      for (const table of tablesToClear) {
        // Aggressive deletion
        const { error } = await supabaseAdmin.from(table).delete().neq('id', '99999999-9999-9999-9999-999999999999');
        if (error) {
          console.error(`[DB Reset] Error clearing ${table}:`, error.message);
          return NextResponse.json({ error: `Failed to clear ${table}: ${error.message}` }, { status: 500 });
        }
        console.log(`[DB Reset] ✅ Cleared: ${table}`);
      }

      // Reset bank balances to 0 if wiping simulation data
      if (actionVal === 'simulation') {
        const { error: bankErr } = await supabaseAdmin.from('bank_accounts').update({ balance: 0 }).neq('id', '99999999-9999-9999-9999-999999999999');
        if (bankErr) console.error("[DB Reset] Failed to reset bank balances:", bankErr.message);
        else console.log("[DB Reset] ✅ Reset all bank balances to 0");
      }

      // If it's just a wipe or specific subset, we can return early
      if (actionVal === 'wipe' || actionVal === 'simulation' || actionVal === 'products_only' || actionVal === 'master' || actionVal === 'custom') {
         return NextResponse.json({ success: true, cleared: tablesToClear });
      }
    }

    // PHASE 2: RE-SEED (if action is 'seed' or 'full')
    const seededTables: string[] = [];
    if (action === 'seed' || action === 'full') {
      if (seedData && typeof seedData === 'object') {
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

        for (const [table, rows] of Object.entries(seedData)) {
          if (!Array.isArray(rows) || (rows as any[]).length === 0) continue;
          
          const snakeRows = toSnake(rows);
          const CHUNK = 200; 
          
          for (let i = 0; i < snakeRows.length; i += CHUNK) {
            const chunk = snakeRows.slice(i, i + CHUNK);
            const { error } = await supabaseAdmin.from(table).upsert(chunk, { onConflict: 'id' });
            if (error) {
              console.error(`[DB Reset] Seed error ${table} chunk ${i}:`, error.message);
              return NextResponse.json({ error: `Failed to seed ${table}: ${error.message}` }, { status: 500 });
            }
          }
          
          console.log(`[DB Reset] 🌱 Seeded: ${table} (${(rows as any[]).length} rows)`);
          seededTables.push(table);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      cleared: seededTables, // In case of full reset, it returns what was cleared/seeded
      seeded: seededTables 
    });
  } catch (error: any) {
    console.error('API DB RESET Error:', error);
    return NextResponse.json({ error: 'Failed to reset database: ' + error.message }, { status: 500 });
  }
}
