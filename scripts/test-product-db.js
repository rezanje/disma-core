const BASE_URL = 'https://disma-core.vercel.app';

const DUMMY_PRODUCTS = [
  {
    id: "test-prod-1",
    sku_code: "TEST01",
    name: "Test Product",
    uom: "PCS",
    base_price: 1000,
    selling_price: 2000,
    category: "Test"
  }
];

async function seedTable(table, data) {
  console.log(`Seeding ${table} (${data.length} rows)...`);
  const res = await fetch(`${BASE_URL}/api/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, data }),
  });
  const json = await res.json();
  if (res.ok) {
    console.log(`  ✅ ${table}: ${JSON.stringify(json)}`);
  } else {
    console.error(`  ❌ ${table} FAILED:`, json);
  }
}

async function main() {
  await seedTable('products', DUMMY_PRODUCTS);
}

main();
