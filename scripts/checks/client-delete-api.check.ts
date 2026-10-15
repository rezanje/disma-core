import assert from 'node:assert/strict';
import { MOCK_USERS } from '../../src/lib/constants';

// All database calls below are queued fakes. No real client is deleted.
async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_PROFILE = 'local';
  process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL = 'unit-test';
  process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL = 'unit-test';
  const { DELETE } = await import('../../src/app/api/db/route');
  const { supabaseAdmin } = await import('../../src/lib/supabase');
  type Step = { table: string; operation: string; result: object; rows?: unknown[] };
  let queue: Step[] = [];
  const originalFrom = supabaseAdmin.from;
  supabaseAdmin.from = (table: string) => {
    let operation = 'select';
    let rows: unknown[] | undefined;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: () => query,
      maybeSingle: () => query,
      delete: () => { operation = 'delete'; return query; },
      upsert: (value: unknown[]) => { operation = 'upsert'; rows = value; return query; },
      then: (resolve: (value: object) => unknown, reject: (reason: unknown) => unknown) => {
        const step = queue.shift();
        assert.ok(step, `unexpected ${operation} ${table}`);
        assert.equal(table, step.table);
        assert.equal(operation, step.operation);
        if (step.rows) assert.deepEqual(rows, step.rows);
        return Promise.resolve(step.result).then(resolve, reject);
      },
    };
    return query;
  };
  const select = (table: string, result: object): Step => ({ table, operation: 'select', result });
  const cleanClient = () => [
    select('clients', { data: { id: 'c1' }, error: null }),
    ...['sales_orders', 'invoices', 'tukar_faktur', 'clients'].map(table => select(table, { count: 0, error: null })),
  ];
  const request = (actor: unknown, id: unknown = 'c1') => new Request('http://localhost/api/db', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'clients', id, actor }),
  });
  try {
    for (const user of MOCK_USERS.filter(u => !['super_admin', 'ceo'].includes(u.role))) {
      assert.equal((await DELETE(request({ ...user, role: 'ceo' }))).status, 403);
      assert.equal(queue.length, 0);
    }
    assert.equal((await DELETE(request(null))).status, 403);
    const admin = MOCK_USERS.find(u => u.role === 'super_admin')!;
    assert.equal((await DELETE(request({ id: admin.id, pin: 'wrong' }))).status, 403);
    assert.equal((await DELETE(request({ id: 'wrong', pin: admin.pin }))).status, 403);
    assert.equal((await DELETE(request(admin, ['c1', 'c2']))).status, 400);

    for (const actor of MOCK_USERS.filter(u => ['super_admin', 'ceo'].includes(u.role))) {
      queue = [...cleanClient(), select('client_prices', { data: [], error: null }),
        { table: 'client_prices', operation: 'delete', result: { error: null } },
        { table: 'clients', operation: 'delete', result: { error: null } }];
      assert.equal((await DELETE(request(actor))).status, 200);
      assert.equal(queue.length, 0);
    }
    for (let i = 1; i <= 4; i++) {
      queue = cleanClient();
      queue[i].result = { count: 1, error: null };
      assert.equal((await DELETE(request(admin))).status, 409);
      assert.equal(queue.length, 0, 'linked clients must not reach a delete');
    }
    queue = [select('clients', { data: null, error: null })];
    assert.equal((await DELETE(request(admin))).status, 404);
    assert.equal(queue.length, 0);

    queue = cleanClient().slice(0, 2);
    queue[1].result = { count: null, error: null };
    const countError = console.error;
    try {
      console.error = () => {};
      assert.equal((await DELETE(request(admin))).status, 500);
    } finally { console.error = countError; }
    assert.equal(queue.length, 0, 'unavailable history must block deletion');

    const prices = [{ id: 'price1', client_id: 'c1', agreed_price: 100 }];
    queue = [...cleanClient(), select('client_prices', { data: prices, error: null }),
      { table: 'client_prices', operation: 'delete', result: { error: null } },
      { table: 'clients', operation: 'delete', result: { error: { message: 'test failure' } } },
      { table: 'client_prices', operation: 'upsert', rows: prices, result: { error: null } }];
    const originalError = console.error;
    try {
      console.error = () => {};
      assert.equal((await DELETE(request(admin))).status, 500);
    } finally { console.error = originalError; }
    assert.equal(queue.length, 0, 'failed deletion must restore the price list');
    console.log('client-delete-api: all checks passed');
  } finally { supabaseAdmin.from = originalFrom; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
