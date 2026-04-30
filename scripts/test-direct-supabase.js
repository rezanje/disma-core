// Direct Supabase test - bypass Vercel API
const SUPABASE_URL = 'https://ckkohudfuisgzlrjipev.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';

async function testDirectInsert() {
  console.log('=== TEST 1: Check if products table exists ===');
  
  // First, query the table structure
  const structRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&limit=1`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  console.log('  GET products status:', structRes.status);
  const structBody = await structRes.text();
  console.log('  GET products body:', structBody.substring(0, 200));

  console.log('\n=== TEST 2: Check columns via information_schema ===');
  const colRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  });
  
  // Try inserting WITHOUT category first
  console.log('\n=== TEST 3: Insert product WITHOUT category ===');
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: 'test-no-cat',
      sku_code: 'TESTNOCAT',
      name: 'Test No Category',
      uom: 'PCS',
      base_price: 1000,
      selling_price: 2000,
    })
  });
  console.log('  Insert (no cat) status:', insertRes.status);
  const insertBody = await insertRes.text();
  console.log('  Insert (no cat) body:', insertBody.substring(0, 300));

  // Try inserting WITH category
  console.log('\n=== TEST 4: Insert product WITH category ===');
  const insertRes2 = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: 'test-with-cat',
      sku_code: 'TESTWITHCAT',
      name: 'Test With Category',
      uom: 'PCS',
      base_price: 1000,
      selling_price: 2000,
      category: 'Sayuran',
    })
  });
  console.log('  Insert (with cat) status:', insertRes2.status);
  const insertBody2 = await insertRes2.text();
  console.log('  Insert (with cat) body:', insertBody2.substring(0, 300));

  // Check what's there now
  console.log('\n=== TEST 5: Read back ===');
  const readRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,sku_code,name,category`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  console.log('  Read status:', readRes.status);
  const readBody = await readRes.text();
  console.log('  Read body:', readBody.substring(0, 500));
}

testDirectInsert().catch(console.error);
