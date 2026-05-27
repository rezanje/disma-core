const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/DISMA_keuangan_20Mei2026.json', 'utf8'));
console.log(JSON.stringify(data.payables_personal, null, 2));
