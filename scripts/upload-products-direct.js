const fs = require('fs');
const crypto = require('crypto');

const SUPABASE_URL = 'https://ckkohudfuisgzlrjipev.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';

const CSV_PATH = '/Users/rezanje/Downloads/DATA/Spreadsheets & Reports/produkdisma.csv';

function inferCategory(name) {
  const n = name.toUpperCase();
  if (/SAUCE|KECAP|SAUS|SAMBAL|MAYO/.test(n)) return 'Saus & Bumbu';
  if (/MINYAK|OIL/.test(n)) return 'Minyak';
  if (/GULA|SUGAR/.test(n)) return 'Gula';
  if (/TEPUNG|FLOUR/.test(n)) return 'Tepung';
  if (/BERAS|RICE/.test(n)) return 'Beras';
  if (/SUSU|MILK|CREAM/.test(n)) return 'Susu & Dairy';
  if (/KOPI|COFFEE|TEH|TEA/.test(n)) return 'Minuman';
  if (/MIE|NOODLE|INDOMIE/.test(n)) return 'Mie & Pasta';
  if (/SABUN|SOAP|DETERGEN|RINSO|SUNLIGHT/.test(n)) return 'Kebersihan';
  return 'Lainnya';
}

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8').trim();
  const lines = raw.split('\n');
  
  // Parse header
  const header = lines[0].trim().replace(/\r/g, '');
  const delimiter = header.includes(';') ? ';' : ',';
  const headers = header.split(delimiter).map(h => h.trim().toUpperCase());
  
  console.log('Headers:', headers);
  console.log('Total lines (incl header):', lines.length);
  
  const products = [];
  const seen = new Set();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim().replace(/\r/g, '');
    if (!line) continue;
    
    const values = line.split(delimiter).map(v => v.trim());
    
    let sku = '', name = '', uom = 'PCS';
    
    headers.forEach((h, idx) => {
      const val = values[idx] || '';
      if (h === 'SKU' || h === 'KODE BRG' || h === 'SKUCODE') sku = val;
      else if (h === 'PRODUCT NAME' || h === 'NAMA BARANG' || h === 'NAME') name = val;
      else if (h === 'UOM' || h === 'SATUAN') uom = val || 'PCS';
    });
    
    if (!sku || !name || seen.has(sku)) continue;
    seen.add(sku);
    
    products.push({
      id: crypto.randomUUID(),
      sku_code: sku,
      name: name,
      uom: uom,
      base_price: 0,
      selling_price: 0,
      tier1_price: 0,
      tier2_price: 0,
      tier3_price: 0,
      tier4_price: 0,
      tier5_price: 0,
      current_stock: 0,
      price_history: [],
      weekly_price_range: {},
      category: inferCategory(name),
    });
  }
  
  console.log(`\nParsed ${products.length} unique products.`);
  
  // First, clean up test products
  await fetch(`${SUPABASE_URL}/rest/v1/products?id=in.(test-no-cat,test-with-cat)`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  
  // Upload in chunks of 200
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < products.length; i += CHUNK) {
    const chunk = products.slice(i, i + CHUNK);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(chunk),
    });
    
    if (res.status === 201 || res.status === 200) {
      total += chunk.length;
      console.log(`  ✅ Chunk ${Math.floor(i/CHUNK)+1}: ${chunk.length} products uploaded (total: ${total})`);
    } else {
      const err = await res.text();
      console.error(`  ❌ Chunk ${Math.floor(i/CHUNK)+1} FAILED:`, err);
    }
  }
  
  console.log(`\n=== DONE: ${total}/${products.length} products uploaded to new database ===`);
}

main().catch(console.error);
