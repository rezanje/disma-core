const fs = require('fs');
const path = require('path');
async function main() {
  const filePath = path.join(__dirname, 'file tambahan owner/Laporan Kas BCA 2026.csv');
  const content = fs.readFileSync(filePath, 'utf-8');
  const csvLines = content.split('\n');
  console.log('Line 1061:', csvLines[1061 - 1]);
  console.log('Line 1081:', csvLines[1081 - 1]);
}
main();
