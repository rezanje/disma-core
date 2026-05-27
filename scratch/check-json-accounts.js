const fs = require('fs');

const path = './data/DISMA_keuangan_20Mei2026.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== Accounts in JSON ===');
console.log(JSON.stringify(data.accounts, null, 2));
