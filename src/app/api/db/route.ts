import { validateProtectedWrite, PROTECTED_COLUMNS } from '@/lib/db-write-policy';
import { assertTableWrite, publicUser } from '@/lib/server-session';
import { requireApiUser, apiAuthResponse } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { canManageClientDeletion, describeBlockers, type DeletionBlocker } from '@/lib/client-delete';

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
    await requireApiUser(request);
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
              if (isMissingTableError(error)) throw new Error(`Tabel ${table} belum tersedia`);
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

    // Vendor pickers must not depend on the heavier warehouse/price-history group.
    if (group === 'vendors') {
      return NextResponse.json({ vendors: toCamel(await fetchTable('vendors')) }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    // Baca ulang beberapa baris tertentu, by id.
    //
    // Dipakai alur yang menulis lewat fungsi database (RPC) lalu perlu melihat
    // hasilnya. Pembacaannya HARUS lewat sini: kunci publik di browser dihalangi
    // RLS dan mengembalikan NOL baris tanpa error, jadi layarnya diam-diam tidak
    // pernah menerima hasil tulisannya sendiri (Tukar Faktur terbit bernilai Rp0).
    //
    // Daftar tabelnya dikunci: rute ini memakai kunci server, jadi nama tabel dari
    // luar tidak boleh langsung dipercaya.
    const READABLE_BY_ID = new Set(['tukar_faktur', 'invoices', 'purchases', 'sales_orders']);
    const table = searchParams.get('table');
    if (table) {
      if (!READABLE_BY_ID.has(table)) {
        return NextResponse.json({ error: `Table ${table} tidak boleh dibaca lewat jalur ini.` }, { status: 400 });
      }
      const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ rows: [] });
      const { data, error } = await withRetry(
        async () => await supabase.from(table).select('*').in('id', ids),
        `select ${table} by ids`,
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(
        { rows: toCamel(data || []) },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    // --- GROUP 1: Core (users, clients, products, settings) ---
    if (group === '1') {
      const [users, clients, products, appSettings] = await Promise.all([
        fetchTable('users'), fetchTable('clients'), fetchTable('products'),
        fetchTable('app_settings')
      ]);
      const globalSettings = appSettings.find((s: any) => s.id === 'global-settings') || appSettings[0];
      return NextResponse.json({
        users: users.map(user => publicUser(toCamel(user))),
        clients: toCamel(clients),
        products: toCamel(products),
        navConfigs: globalSettings?.nav_configs || {},
        rolePermissions: globalSettings?.role_permissions || {},
        dailyCostConfig: globalSettings?.daily_cost_config || null,
        tierMargins: globalSettings?.nav_configs?.tier_margins || {},
        priceBaseline: globalSettings?.nav_configs?.price_baseline || null,
        minMarginPct: globalSettings?.nav_configs?.min_margin_pct ?? null,
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
      const [coas, bankAccounts, cashTransactions, journalEntries, journalLines, invoices, expenses, reimbursements, vendorBills, tukarFakturs, disbursementRequests, tutupHariKantong, dailyCloses, creditNotes] = await Promise.all([
        fetchTable('coas'), fetchTable('bank_accounts'),
        fetchTable('cash_transactions'), fetchTable('journal_entries'),
        fetchTable('journal_lines'), fetchTable('invoices'),
        fetchTable('expenses'), fetchTable('reimbursements'),
        fetchTable('vendor_bills'), fetchTable('tukar_faktur'),
        fetchTable('disbursement_requests'), fetchTable('tutup_hari_kantong'), fetchTable('daily_close'), fetchTable('credit_notes')
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
        disbursementRequests: toCamel(disbursementRequests),
        tutupHariKantong: toCamel(tutupHariKantong),
        dailyCloses: toCamel(dailyCloses),
        creditNotes: toCamel(creditNotes),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 4: Warehouse & Logistics ---
    if (group === '4') {
      const [vendors, deliveries, stockMovements, pendingReturns, rejectedItems, vendorPrices, vendorReturns, courierSpares] = await Promise.all([
        fetchTable('vendors'), fetchTable('deliveries'),
        fetchTable('stock_movements'), fetchTable('pending_returns'),
        fetchTable('rejected_items'), fetchTable('vendor_prices'),
        fetchTable('vendor_returns'), fetchTable('courier_spares')
      ]);
      return NextResponse.json({
        vendors: toCamel(vendors),
        deliveries: toCamel(deliveries),
        courierSpares: toCamel(courierSpares),
        stockMovements: toCamel(stockMovements),
        pendingReturns: toCamel(pendingReturns),
        rejectedItems: toCamel(rejectedItems),
        vendorPrices: toCamel(vendorPrices),
        vendorReturns: toCamel(vendorReturns),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 5: Misc (CRM, Tasks, Assets) ---
    if (group === '5') {
      const [leads, dismaTasks, notifications, fixedAssets] = await Promise.all([
        fetchTable('leads'), fetchTable('disma_tasks'), fetchTable('notifications'),
        fetchTable('fixed_assets')
      ]);
      return NextResponse.json({
        leads: toCamel(leads),
        tasks: toCamel(dismaTasks),
        notifications: toCamel(notifications),
        fixedAssets: toCamel(fixedAssets),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- GROUP 6: Client prices (split out of group 1) ---
    // ~20k rows / 5.7MB, an order of magnitude bigger than every other group
    // combined. It sits in its own group so the boot path can fetch it detached
    // instead of blocking the first render on it.
    if (group === '6') {
      const clientPrices = await fetchTable('client_prices');
      return NextResponse.json({
        clientPrices: toCamel(clientPrices),
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // --- NO GROUP: Return error instructing to use groups ---
    return NextResponse.json({ error: 'Use ?group=1 through ?group=6' }, { status: 400 });

  } catch (error) {
    const authError = apiAuthResponse(error);
    if (authError) return authError;
    console.error('API GET Error:', error);
    return NextResponse.json({ error: 'Failed to aggregate data' }, { status: 500 });
  }
}

// POST: Intelligent Sync (Updates only what is provided)
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const { table, data } = await request.json();
    assertTableWrite(user.role, table, 'POST');

    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });
    if (!table) return NextResponse.json({ error: 'Table name required' }, { status: 400 });

    // Columns that hold a verbatim snapshot of an app object rather than a set of
    // database fields. Renaming their keys corrupts the snapshot: the reader
    // (/api/history) deliberately does not undo it, so a rollback would feed
    // snake_case keys back into a camelCase record and report every field as changed.
    const OPAQUE_JSON_COLUMNS: Record<string, string[]> = {
      record_history: ['oldData', 'newData'],
    };

    // Convert camelCase to snake_case for the database
    const toSnake = (obj: any, opaqueKeys: string[] = []): any => {
        if (Array.isArray(obj)) return obj.map((item) => toSnake(item, opaqueKeys));
        if (obj === null || typeof obj !== 'object') return obj;
        const n: any = {};
        Object.keys(obj).forEach((k) => {
          let sk = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
          if (sk === 'is_q_ced') sk = 'is_qced';

          let val = obj[k];
          if (typeof val === 'string' && val === '' && sk.endsWith('_id')) {
             val = null;
          }

          // Only the column name is renamed; the payload is stored as-is.
          n[sk] = opaqueKeys.includes(k) ? val : toSnake(val, opaqueKeys);
        });
        return n;
    };

    let snakeData = table === 'app_settings' ? data : toSnake(data, OPAQUE_JSON_COLUMNS[table] || []);

    // Sanitization blocks are removed for local development to allow all fields to sync



    // Handle single item or array upsert
    const items = Array.isArray(snakeData) ? snakeData : [snakeData];
    
    // Never grant raw generic writes to posted financial state or credentials.
    let protectedExisting: any[] = [];
    if(PROTECTED_COLUMNS[table] || ['users','record_history','pending_returns','rejected_items','vendor_returns'].includes(table)) {
      const ids=items.map((row:any)=>row?.id).filter((id:unknown)=>typeof id==='string');
      const {data:existingRows,error:readError}=await supabase.from(table).select('*').in('id',ids);
      if(readError) throw readError;
      protectedExisting=existingRows || [];
      for(const row of items) {
        const existing=(existingRows || []).find((existing:any)=>existing.id===row?.id) || null;
        const context:any={};
        if(table==='sales_order_items') {
          const {data:parent,error}=await supabase.from('sales_orders').select('*').eq('id',existing?.sales_order_id || row.sales_order_id).maybeSingle();
          if(error) throw error; context.salesOrder=parent;
        }
        if(table==='purchase_items') {
          const {data:parent,error}=await supabase.from('purchases').select('*').eq('id',existing?.purchase_id || row.purchase_id).maybeSingle();
          if(error) throw error; context.purchase=parent;
        }
        if(table==='bank_accounts' && existing && row.account_code!==undefined && row.account_code!==existing.account_code) {
          const {count:cashCount,error:cashError}=await supabase.from('cash_transactions').select('id',{head:true,count:'exact'}).eq('bank_account_id',row.id);
          if(cashError) throw cashError;
          const {data:accounts,error:accountError}=await supabase.from('coas').select('id').eq('account_code',existing.account_code);
          if(accountError) throw accountError;
          const {count:journalCount,error:journalError}=await supabase.from('journal_lines').select('id',{head:true,count:'exact'}).in('account_id',(accounts || []).map((account:any)=>account.id));
          if(journalError) throw journalError;
          context.bankHasActivity=!!cashCount || !!journalCount;
        }
        if(table==='purchase_requests' && user.role==='super_admin') {
          if(row.status==='Approved' && existing?.status!=='Approved') row.approved_by_cfo=user.id;
          if(row.approved_by_cfo && row.approved_by_cfo!==existing?.approved_by_cfo) {
            row.approved_by_cfo=user.id;
            if(existing?.approved_by_cfo) {
              const {data:approver,error}=await supabase.from('users').select('id,role,is_active').eq('id',existing.approved_by_cfo).maybeSingle();
              if(error) throw error;
              context.cfoApprovalVerified=!!approver && approver.role==='super_admin' && approver.is_active!==false;
            }
          }
        }
        validateProtectedWrite(table,row,existing,user.role,context);
      }
    }
    if(table==='record_history') {
      for(const row of items) { row.user_id=user.id; row.user_name=user.name; row.user_role=user.role; row.created_at=new Date().toISOString(); }
      const {error:historyError}=await supabase.from(table).insert(items);
      if(historyError) return NextResponse.json({error:historyError.message},{status:409});
      return NextResponse.json({success:true,count:items.length});
    }

    if(PROTECTED_COLUMNS[table] || ['pending_returns','rejected_items','vendor_returns'].includes(table)) {
      // Insert and update separately: raw upsert can overwrite a concurrent receipt
      // between validation and persistence, even when its original snapshot was valid.
      for(const row of items) {
        const existing=protectedExisting.find(existing=>existing.id===row.id);
        let result;
        if(!existing) result=await supabase.from(table).insert(row);
        else {
          const patch={...row}; delete patch.id;
          for(const key of PROTECTED_COLUMNS[table] || []) {
            if(table==='bank_accounts' && user.role==='super_admin' && ['cfo_approval_required','owner_user_id','purpose'].includes(key)) continue;
            delete patch[key];
          }
          if(['pending_returns','rejected_items','vendor_returns'].includes(table)) for(const key of Object.keys(patch)) if(key!=='notes') delete patch[key];
          if(table==='purchase_requests') {
            if(user.role!=='super_admin' || !patch.approved_by_cfo) { delete patch.approved_by_cfo; delete patch.cfo_note; }
          }
          if(table==='tukar_faktur' && !(existing.status==='Issued' && patch.status==='Received')) delete patch.status;
          result=Object.keys(patch).length ? await supabase.from(table).update(patch).eq('id',row.id) : {error:null};
        }
        if(result.error) return NextResponse.json({error:result.error.message},{status:409});
      }
      return NextResponse.json({success:true,count:items.length});
    }

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
          return NextResponse.json({ error: `Tabel ${table} belum tersedia` }, { status: 503 });
        }
        console.error(`Supabase POST Error (${table} chunk ${i}):`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: items.length });

  } catch (error) {
    const authError = apiAuthResponse(error);
    if (authError) return authError;
    console.error('API POST Error:', error);
    return NextResponse.json({ error: 'Failed to sync data' }, { status: 500 });
  }
}

// DELETE: Remove record(s) from a table
export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const { table, id } = await request.json();
    assertTableWrite(user.role, table, 'DELETE');

    if (!supabase) return NextResponse.json({ error: 'Supabase not initialized' }, { status: 500 });
    if (!table || !id) return NextResponse.json({ error: 'Table and ID required' }, { status: 400 });

    const ids = Array.isArray(id) ? id : [id];
    if (table === 'clients') {
      if (!canManageClientDeletion(user.role)) {
        return NextResponse.json({ error: 'Hanya Super Admin atau Owner yang boleh menghapus klien.' }, { status: 403 });
      }
      if (typeof id !== 'string' || !id.trim()) {
        return NextResponse.json({ error: 'Hapus satu klien setiap kali.' }, { status: 400 });
      }
      const { data: client, error: readError } = await supabase.from('clients').select('id').eq('id', id).maybeSingle();
      if (readError) throw readError;
      if (!client) return NextResponse.json({ error: 'Klien tidak ditemukan.' }, { status: 404 });

      const links = [
        ['sales_orders', 'client_id', 'salesOrders'],
        ['invoices', 'client_id', 'invoices'],
        ['tukar_faktur', 'client_id', 'tukarFakturs'],
        ['clients', 'parent_id', 'branches'],
      ] as const;
      const blockers: DeletionBlocker[] = [];
      for (const [linkedTable, column, kind] of links) {
        const { count, error } = await supabase.from(linkedTable).select('id', { count: 'exact', head: true }).eq(column, id);
        if (error) throw error;
        if (count === null) throw new Error('Riwayat klien belum berhasil diperiksa.');
        if (count) blockers.push({ kind, count });
      }
      if (blockers.length > 0) {
        return NextResponse.json({ error: `Klien sudah punya ${describeBlockers(blockers)} — tidak bisa dihapus.` }, { status: 409 });
      }

      // Keep a copy of price rows until both deletes succeed, so a failed client delete
      // can restore its price list instead of silently losing it.
      const prices: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('client_prices').select('*').eq('client_id', id).order('id').range(offset, offset + 999);
        if (error) throw error;
        prices.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      try {
        const { error: priceError } = await supabase.from('client_prices').delete().eq('client_id', id);
        if (priceError) throw priceError;
        const { error: clientError } = await supabase.from('clients').delete().eq('id', id);
        if (clientError) throw clientError;
      } catch (error) {
        for (let offset = 0; offset < prices.length; offset += 200) {
          const { error: restoreError } = await supabase.from('client_prices').upsert(prices.slice(offset, offset + 200), { onConflict: 'id' });
          if (restoreError) {
            console.error('Client price rollback failed:', restoreError);
            return NextResponse.json({ error: 'Penghapusan gagal dan daftar harga belum berhasil dipulihkan. Hubungi Super Admin.' }, { status: 500 });
          }
        }
        throw error;
      }
      return NextResponse.json({ success: true, count: 1 });
    }
    const { error } = await withRetry(
      async () => await supabase.from(table).delete().in('id', ids),
      `delete ${table}`
    );

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: `Tabel ${table} belum tersedia` }, { status: 503 });
      }
      console.error(`Supabase DELETE Error (${table}):`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: ids.length });

  } catch (error) {
    const authError = apiAuthResponse(error);
    if (authError) return authError;
    console.error('API DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 });
  }
}
