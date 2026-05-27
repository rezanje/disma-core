const fs = require('fs');

const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== DISMA_keuangan_20Mei2026.json Keys ===');
for (const key of Object.keys(data)) {
  const item = data[key];
  if (Array.isArray(item)) {
    console.log(`${key}: Array, Length = ${item.length}`);
    if (item.length > 0) {
      console.log(`  Sample item keys:`, Object.keys(item[0]));
    }
  } else {
    console.log(`${key}:`, typeof item);
  }
}
