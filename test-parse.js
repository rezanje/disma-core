const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split('\n');

for (let i = 0; i < Math.min(15, lines.length); i++) {
  const line = lines[i].trim();
  console.log(`Line ${i+1} raw: ${line}`);
  const parsed = parseCSVLine(line);
  console.log(`Line ${i+1} parsed:`, parsed);
  console.log('---');
}
