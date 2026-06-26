const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ckkohudfuisgzlrjipev.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra29odWRmdWlzZ3pscmppcGV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwMTY5OCwiZXhwIjoyMDkwMzc3Njk4fQ.6xxE7Y8uLwhDjCUc189TYq5ArZm3L87JNdxTZT9oApQ';
const supabase = createClient(supabaseUrl, supabaseKey);

function parseAmount(val) {
  if (!val) return 0;
  let clean = val.replace(/Rp|\s/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

const MONTHS = {
  'JANUARI': 0, 'FEBRUARI': 1, 'MARET': 2, 'APRIL': 3, 'MEI': 4, 'JUNI': 5,
  'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5
};

async function main() {
  // Fetch existing BCA journal entries
  const { data: lines, error } = await supabase
    .from('journal_lines')
    .select('id, journal_entry_id, debit_amount, credit_amount')
    .eq('account_id', 'coa-1-2');
    
  if (error) {
    console.error('Error fetching lines:', error);
    return;
  }
  
  const entryIds = lines.map(l => l.journal_entry_id);
  const { data: entries, error: entryError } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, description, reference_type, reference_id')
    .in('id', entryIds);
    
  if (entryError) {
    console.error('Error:', entryError);
    return;
  }
  
  const lineMap = {};
  lines.forEach(l => {
    lineMap[l.journal_entry_id] = l;
  });
  
  const dbPayments = entries.map(e => {
    const l = lineMap[e.id];
    return {
      id: e.id,
      date: new Date(e.transaction_date),
      amount: l.debit_amount || l.credit_amount,
      type: l.debit_amount > 0 ? 'In' : 'Out',
      description: e.description,
      refId: e.reference_id
    };
  });
  
  console.log(`Fetched ${dbPayments.length} BCA transactions from General Ledger.`);

  // Parse CSV
  const filePath = path.join(__dirname, 'file tambahan owner/Laporan Kas BCA 2026.csv');
  const content = fs.readFileSync(filePath, 'utf-8');
  const csvLines = content.split('\n');
  
  let currentMonthStr = '';
  let currentYearStr = '';
  let lastDateStr = '';
  
  const csvTxs = [];
  
  csvLines.forEach((line, idx) => {
    const parts = line.split(';');
    if (parts.length < 2) return;
    
    const monthMatch = parts[0].match(/LAPORAN KAS BCA DISMA BULAN (\w+) (\d{4})/i);
    if (monthMatch) {
      currentMonthStr = monthMatch[1].toUpperCase();
      currentYearStr = monthMatch[2];
      return;
    }
    
    const tgl = parts[0].trim();
    const desc = parts[1] ? parts[1].trim() : '';
    const kasMasukRaw = parts[3] ? parts[3].trim() : '';
    const kasKeluarRaw = parts[4] ? parts[4].trim() : '';
    
    if (tgl) {
      lastDateStr = tgl;
    }
    
    const kasMasuk = parseAmount(kasMasukRaw);
    const kasKeluar = parseAmount(kasKeluarRaw);
    
    if (kasMasuk === 0 && kasKeluar === 0) return;
    if (desc.toLowerCase().includes('saldo awal') || desc.toLowerCase().includes('saldo akhir') || desc.toLowerCase().includes('mutasi')) return;
    
    // Parse Date
    let date = null;
    if (lastDateStr) {
      const dateParts = lastDateStr.split('-');
      if (dateParts.length === 2) {
        const day = parseInt(dateParts[0]);
        const monthAbbr = dateParts[1].toUpperCase();
        const monthIndex = MONTHS[monthAbbr] !== undefined ? MONTHS[monthAbbr] : MONTHS[currentMonthStr];
        const year = parseInt(currentYearStr) || 2026;
        date = new Date(Date.UTC(year, monthIndex, day));
      }
    }
    
    if (!date) return;
    
    csvTxs.push({
      date,
      amount: kasMasuk > 0 ? kasMasuk : kasKeluar,
      type: kasMasuk > 0 ? 'In' : 'Out',
      description: desc,
      line: idx + 1
    });
  });

  console.log(`Parsed ${csvTxs.length} transactions from CSV.`);

  // Let's see how many matches we can find
  let matchCount = 0;
  csvTxs.forEach(csvTx => {
    // Find matching DB payment
    const match = dbPayments.find(dbTx => {
      // Compare amount
      const amountMatch = Math.abs(dbTx.amount - csvTx.amount) < 1; // minor float diff
      if (!amountMatch) return false;
      
      // Compare date (within 5 days range to allow for clearing/recording delays)
      const diffTime = Math.abs(dbTx.date.getTime() - csvTx.date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const dateMatch = diffDays <= 7;
      if (!dateMatch) return false;
      
      // Compare description / type
      const typeMatch = dbTx.type === csvTx.type;
      return typeMatch;
    });
    
    if (match) {
      matchCount++;
      if (matchCount <= 20) {
        console.log(`Match #${matchCount}:`);
        console.log(`  CSV: Line ${csvTx.line}, Date: ${csvTx.date.toISOString().slice(0,10)}, Amt: ${csvTx.amount}, Desc: ${csvTx.description}`);
        console.log(`  DB : Date: ${match.date.toISOString().slice(0,10)}, Amt: ${match.amount}, Desc: ${match.description}`);
      }
    }
  });
  
  console.log(`Total matches found (amount and date match): ${matchCount}`);
}
main();
