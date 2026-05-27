const fs = require('fs');

const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== Executive Summary ===');
console.log(JSON.stringify(data.executive_summary, null, 2));
