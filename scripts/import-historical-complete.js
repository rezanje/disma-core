const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manual env parser to support running in any Node environment cleanly
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const profile = (process.env.NEXT_PUBLIC_SUPABASE_PROFILE || 'local').toLowerCase();
const suffix = profile === 'production' ? '_PRODUCTION' : '_LOCAL';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dbUrl || !dbKey) {
  console.error(`Missing Supabase credentials for profile: ${profile}`);
  process.exit(1);
}

// CLI arguments
const isCommit = process.argv.includes('--commit');

console.log(`====================================================`);
console.log(`  DISMA COMPLETE HISTORICAL DATA IMPORT UTILITY`);
console.log(`  Target Profile : ${profile.toUpperCase()}`);
console.log(`  Mode           : ${isCommit ? 'COMMIT (WRITE TO DB)' : 'DRY-RUN (READ-ONLY CHECK)'}`);
console.log(`====================================================\n`);

const piutangCsvPath = path.join(__dirname, '../Rekap Piutang 2026 UPDATE-5.xlsx - rangkuman.csv');
const totalOrderCsvPath = path.join(__dirname, '../total order januari - mei.csv');
const kasTunaiCsvPath = path.join(__dirname, '../Laporan Kas Tunai sampe 20 mei 2026.csv');

// Date parser helpers
function parseSingleDate(str) {
  if (!str) return null;
  let cleaned = str.replace(/-/g, ' ').trim();
  
  // Try matching DD Month YYYY (e.g. 01-Jan-2026 or 01 Jan 26)
  let match = cleaned.match(/^(\d{1,2})\s*([A-Za-z]+)\s*['\s]*(\d{2,4})$/);
  let day, monthStr, year;
  
  if (match) {
    day = match[1].padStart(2, '0');
    monthStr = match[2].toLowerCase();
    const yearStr = match[3];
    year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
  } else {
    // Try matching DD Month (e.g. 01-May or 01 May)
    match = cleaned.match(/^(\d{1,2})\s*([A-Za-z]+)$/);
    if (!match) return null;
    day = match[1].padStart(2, '0');
    monthStr = match[2].toLowerCase();
    year = '2026'; // Default to 2026
  }
  
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', april: '04',
    mei: '05', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', agu: '08', agust: '08', sep: '09', sept: '09',
    oct: '10', okt: '10', nov: '11', dec: '12', des: '12'
  };
  const month = months[monthStr];
  if (!month) return null;
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function parsePaymentDate(str) {
  if (!str) return null;
  str = str.trim();
  if (!str) return null;
  
  const segments = str.split(/[&,]/).map(s => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (/[A-Za-z]+/.test(seg)) {
      const parsed = parseSingleDate(seg);
      if (parsed) return parsed;
    }
  }
  return null;
}

// Currency parser helper
function parseAmount(str) {
  if (!str) return 0;
  // Handle Indonesian format where dot is thousands and comma is decimals
  let cleaned = str.replace(/Rp/gi, '').replace(/\s/g, '').trim();
  if (!cleaned) return 0;
  
  // If string contains dots and commas, or starts looking like Indon format (e.g. 200.000,00)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // If it only has comma, treat it as decimal separator if followed by 2 digits, otherwise thousands
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      cleaned = cleaned.replace(/,/g, '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes('.') && !cleaned.includes(',')) {
    // E.g. 200.000 (meaning 200 thousand in Indonesian)
    // In English, 200.000 is 200. So let's look at the decimal digits or position
    const parts = cleaned.split('.');
    if (parts[parts.length - 1].length !== 3) {
      // Treat as decimal
    } else {
      // Treat as thousands
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseCSVLine(line, delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const getClientId = (name) => 'client-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-');
const nowIso = new Date().toISOString();

async function main() {
  const supabase = createClient(dbUrl, dbKey);

  // ==========================================
  // PHASE 0: COA & BANK ACCOUNTS PREPARATION
  // ==========================================
  console.log('--- PHASE 0: Fetching & Verifying Accounts ---');
  
  // 1. Fetch COAs to get their database UUID mapping
  const { data: coas, error: coaErr } = await supabase.from('coas').select('id, account_code, account_name');
  if (coaErr) {
    console.error('Error fetching COAs:', coaErr.message);
    return;
  }
  console.log(`Fetched ${coas.length} Chart of Accounts (COAs) from DB.`);
  
  const coaMap = new Map();
  coas.forEach(c => coaMap.set(c.account_code, c.id));
  
  // 2. Fetch Bank Accounts & ensure BCA/Petty Cash exist
  const { data: dbBanks, error: bankErr } = await supabase.from('bank_accounts').select('id, name, account_code');
  if (bankErr) {
    console.error('Error fetching bank accounts:', bankErr.message);
    return;
  }
  
  const bankMap = new Map();
  dbBanks.forEach(b => bankMap.set(b.id, b));
  
  const requiredBanks = [
    { id: 'bank-bca', name: 'BCA (Utama)', account_code: '1-1200' },
    { id: 'bank-petty', name: 'Petty Cash', account_code: '1-1000' }
  ];
  
  for (const rb of requiredBanks) {
    if (!bankMap.has(rb.id)) {
      console.log(`Bank account "${rb.id}" (${rb.name}) missing. Creating it...`);
      if (isCommit) {
        const { error: insBankErr } = await supabase.from('bank_accounts').insert({
          id: rb.id,
          name: rb.name,
          account_number: rb.id === 'bank-bca' ? '000-000-0001' : '',
          account_code: rb.account_code,
          balance: 0
        });
        if (insBankErr) console.error(`Failed to create bank ${rb.id}:`, insBankErr.message);
        else console.log(`Created bank ${rb.id} successfully.`);
      }
    }
  }

  // ==========================================
  // PHASE 1: CLIENTS & TOTAL ORDERS IMPORT
  // ==========================================
  console.log('\n--- PHASE 1: Importing Clients & Total Orders ---');
  
  const { data: dbClients, error: clientErr } = await supabase.from('clients').select('id, company_name');
  if (clientErr) {
    console.error('Error fetching clients:', clientErr.message);
    return;
  }
  console.log(`Found ${dbClients.length} clients in database.`);
  
  const clientMap = new Map();
  dbClients.forEach(c => {
    clientMap.set(c.company_name.trim().toUpperCase(), c);
  });
  
  // Parse total order januari - mei.csv
  let totalOrderData = [];
  if (fs.existsSync(totalOrderCsvPath)) {
    const totalOrderContent = fs.readFileSync(totalOrderCsvPath, 'utf8');
    const totalOrderLines = totalOrderContent.split('\n');
    
    for (let i = 1; i < totalOrderLines.length; i++) {
      const line = totalOrderLines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);
      if (cols.length < 2) continue;
      
      const outletName = cols[0].trim();
      if (!outletName || outletName.toUpperCase() === 'TOTAL' || outletName.toUpperCase() === 'NAMA OUTLET') continue;
      
      const totalOrderVal = parseAmount(cols[1]);
      const upperOutlet = outletName.toUpperCase();
      let clientId;
      
      if (clientMap.has(upperOutlet)) {
        clientId = clientMap.get(upperOutlet).id;
      } else {
        clientId = getClientId(outletName);
        // Add to client map to prevent duplicates
        clientMap.set(upperOutlet, { id: clientId, company_name: outletName });
      }
      
      totalOrderData.push({
        id: clientId,
        company_name: outletName,
        total_order_jan_may: totalOrderVal
      });
    }
    console.log(`Parsed ${totalOrderData.length} client total order statistics.`);
  } else {
    console.warn(`File "${totalOrderCsvPath}" not found. Skipping client total order update.`);
  }
  
  // Upsert Clients with their Jan-May total order amounts
  const newClients = [];
  const clientUpdates = [];
  
  totalOrderData.forEach(tod => {
    const exists = dbClients.some(c => c.id === tod.id);
    if (!exists) {
      newClients.push({
        id: tod.id,
        company_name: tod.company_name,
        pic_name: 'PIC ' + tod.company_name,
        email: '',
        phone: '',
        address: '',
        payment_term_days: 30,
        total_order_jan_may: tod.total_order_jan_may,
        created_at: nowIso
      });
    } else {
      clientUpdates.push(tod);
    }
  });
  
  console.log(`Clients to create: ${newClients.length}`);
  console.log(`Clients to update total_order: ${clientUpdates.length}`);
  
  if (isCommit) {
    if (newClients.length > 0) {
      const { error: insClientErr } = await supabase.from('clients').upsert(newClients, { onConflict: 'id' });
      if (insClientErr) console.error('Failed to insert new clients:', insClientErr.message);
      else console.log(`Created ${newClients.length} new clients successfully.`);
    }
    
    for (const up of clientUpdates) {
      await supabase.from('clients').update({ total_order_jan_may: up.total_order_jan_may }).eq('id', up.id);
    }
    console.log(`Updated client order stats.`);
  }

  // Re-fetch clients to ensure we have all client IDs mapped
  const { data: updatedClients } = await supabase.from('clients').select('id, company_name');
  const finalClientMap = new Map();
  (updatedClients || []).forEach(c => {
    finalClientMap.set(c.company_name.trim().toUpperCase(), c);
  });

  // ==========================================
  // PHASE 2: POs, INVOICES & ACC JOURNAL IMPORT
  // ==========================================
  console.log('\n--- PHASE 2: Importing Invoices, POs & Journal Entries ---');
  
  if (!fs.existsSync(piutangCsvPath)) {
    console.error(`Missing critical file: ${piutangCsvPath}`);
    return;
  }
  
  const piutangContent = fs.readFileSync(piutangCsvPath, 'utf8');
  const piutangLines = piutangContent.split('\n');
  
  const salesOrdersToInsert = [];
  const salesOrderItemsToInsert = [];
  const invoicesToInsert = [];
  const journalEntriesToInsert = [];
  const journalLinesToInsert = [];
  const cashTransactionsToInsert = [];
  
  let invoiceIdx = 1;
  let journalIdx = 1;
  let cashTxIdx = 1;
  
  let sumTotalTagihan = 0;
  let sumTotalTerbayar = 0;

  for (let i = 2; i < piutangLines.length; i++) {
    const line = piutangLines[i].trim();
    if (!line) continue;
    
    const cols = parseCSVLine(line);
    if (cols.length < 9) continue;
    
    const outletName = cols[0].trim();
    if (!outletName || outletName === 'Nama Outlet' || outletName.toUpperCase() === 'TOTAL') continue;
    
    const orderStart = parseSingleDate(cols[1]);
    const orderEnd = parseSingleDate(cols[2]);
    const issueDate = parseSingleDate(cols[3]) || orderEnd || nowIso;
    const dueDate = parseSingleDate(cols[4]) || new Date(new Date(issueDate).getTime() + 30*24*3600*1000).toISOString();
    const nominal = parseAmount(cols[5]);
    const payDate = parsePaymentDate(cols[6]);
    const paid = parseAmount(cols[7]);
    const remaining = parseAmount(cols[8]);
    
    sumTotalTagihan += nominal;
    sumTotalTerbayar += paid;
    
    const upperOutlet = outletName.toUpperCase();
    const matchedClient = finalClientMap.get(upperOutlet);
    if (!matchedClient) {
      console.warn(`[Warning] Client "${outletName}" on line ${i+1} could not be matched. Skipping.`);
      continue;
    }
    
    const clientId = matchedClient.id;
    const soId = `so-import-${String(invoiceIdx).padStart(4, '0')}`;
    const invoiceId = `inv-import-${String(invoiceIdx).padStart(4, '0')}`;
    const poNum = cols[1] ? `PO-HIST-${invoiceIdx}` : `PO-HIST-${invoiceIdx}`;
    
    // 1. Create Sales Order (PO)
    salesOrdersToInsert.push({
      id: soId,
      po_number: poNum,
      client_id: clientId,
      order_date: orderStart || issueDate,
      target_delivery_date: orderEnd || dueDate,
      status: 'Selesai' // Histori diset Selesai
    });
    
    // 2. Create generic item inside sales order
    salesOrderItemsToInsert.push({
      id: `soi-import-${String(invoiceIdx).padStart(4, '0')}`,
      sales_order_id: soId,
      product_id: 'prod-historical', // Generic or mock product
      qty: 1,
      qty_final: 1,
      unit_price: nominal,
      subtotal: nominal,
      subtotal_final: nominal,
      is_packed: true,
      is_handover_checked: true
    });
    
    // 3. Create Invoice
    let invoiceStatus = 'Unpaid';
    if (paid > 0 && remaining > 0) invoiceStatus = 'Partial';
    else if (remaining <= 0) invoiceStatus = 'Paid';
    
    const paymentsJson = [];
    if (paid > 0) {
      paymentsJson.push({
        id: `pay-${invoiceIdx}`,
        date: payDate || issueDate,
        amount: paid,
        bankAccountId: 'bank-bca',
        note: 'Pembayaran Piutang (Imported)'
      });
    }
    
    invoicesToInsert.push({
      id: invoiceId,
      sales_order_id: soId,
      sales_order_ids: [soId],
      is_consolidated: false,
      consolidated_order_numbers: [],
      client_id: clientId,
      issue_date: issueDate,
      due_date: dueDate,
      total_amount: nominal,
      amount_paid: paid,
      status: invoiceStatus,
      payments: paymentsJson,
      paid_date: invoiceStatus === 'Paid' ? (payDate || issueDate) : null
    });
    
    // 4. Jurnal Piutang & Pendapatan (GL: Debit Piutang, Credit Pendapatan)
    const jeSaleId = `je-sale-${String(journalIdx).padStart(4, '0')}`;
    journalEntriesToInsert.push({
      id: jeSaleId,
      transaction_date: issueDate,
      description: `Penjualan Historis - Ref: ${invoiceId} Klien: ${outletName}`,
      reference_type: 'Invoice',
      reference_id: invoiceId
    });
    
    journalLinesToInsert.push(
      // Debit Piutang Usaha (1-2000)
      {
        id: `jl-sale-${String(journalIdx).padStart(4, '0')}-d`,
        journal_entry_id: jeSaleId,
        account_id: coaMap.get('1-2000') || 'coa-2',
        debit_amount: nominal,
        credit_amount: 0
      },
      // Credit Pendapatan (4-1000)
      {
        id: `jl-sale-${String(journalIdx).padStart(4, '0')}-c`,
        journal_entry_id: jeSaleId,
        account_id: coaMap.get('4-1000') || 'coa-12',
        debit_amount: 0,
        credit_amount: nominal
      }
    );
    journalIdx++;

    // 4.1 Jurnal HPP Historis (75% dari nominal penjualan, GL: Debit HPP 5-1000, Credit Persediaan 1-3000)
    const hppValue = Math.round(nominal * 0.75);
    const jeHppId = `je-hpp-${String(journalIdx).padStart(4, '0')}`;
    journalEntriesToInsert.push({
      id: jeHppId,
      transaction_date: issueDate,
      description: `HPP Historis (75%) - Ref: ${invoiceId} Klien: ${outletName}`,
      reference_type: 'Invoice',
      reference_id: invoiceId
    });

    journalLinesToInsert.push(
      // Debit HPP (5-1000)
      {
        id: `jl-hpp-${String(journalIdx).padStart(4, '0')}-d`,
        journal_entry_id: jeHppId,
        account_id: coaMap.get('5-1000') || 'coa-15',
        debit_amount: hppValue,
        credit_amount: 0
      },
      // Credit Persediaan (1-3000)
      {
        id: `jl-hpp-${String(journalIdx).padStart(4, '0')}-c`,
        journal_entry_id: jeHppId,
        account_id: coaMap.get('1-3000') || 'coa-4',
        debit_amount: 0,
        credit_amount: hppValue
      }
    );
    journalIdx++;
    
    // 5. Jurnal Penerimaan Kas jika sudah ada pembayaran (GL: Debit Kas BCA, Credit Piutang)
    if (paid > 0) {
      const jePayId = `je-pay-${String(journalIdx).padStart(4, '0')}`;
      journalEntriesToInsert.push({
        id: jePayId,
        transaction_date: payDate || issueDate,
        description: `Penerimaan Pelunasan Historis - Ref: ${invoiceId} Klien: ${outletName}`,
        reference_type: 'Invoice',
        reference_id: invoiceId
      });
      
      journalLinesToInsert.push(
        // Debit Bank BCA (1-1200)
        {
          id: `jl-pay-${String(journalIdx).padStart(4, '0')}-d`,
          journal_entry_id: jePayId,
          account_id: coaMap.get('1-1200') || 'coa-1-2',
          debit_amount: paid,
          credit_amount: 0
        },
        // Credit Piutang Usaha (1-2000)
        {
          id: `jl-pay-${String(journalIdx).padStart(4, '0')}-c`,
          journal_entry_id: jePayId,
          account_id: coaMap.get('1-2000') || 'coa-2',
          debit_amount: 0,
          credit_amount: paid
        }
      );
      journalIdx++;
      
      // Tambahkan mutasi bank (cash_transactions)
      cashTransactionsToInsert.push({
        id: `ct-pay-${String(cashTxIdx).padStart(4, '0')}`,
        date: payDate || issueDate,
        type: 'In',
        amount: paid,
        bank_account_id: 'bank-bca',
        category: 'Pelunasan Invoice',
        description: `Penerimaan Pelunasan Invoice ${invoiceId} dari ${outletName}`,
        reference_type: 'Invoice',
        reference_id: invoiceId,
        counterpart_name: outletName
      });
      cashTxIdx++;
    }
    
    invoiceIdx++;
  }
  
  console.log(`Parsed total sales orders: ${salesOrdersToInsert.length}`);
  console.log(`Parsed total invoices: ${invoicesToInsert.length}`);
  console.log(`Parsed total cash incoming txs: ${cashTransactionsToInsert.length}`);
  console.log(`Parsed total journal lines: ${journalLinesToInsert.length}`);
  console.log(`Total Sales Value (Omzet)  : Rp ${sumTotalTagihan.toLocaleString('id-ID')}`);
  console.log(`Total Payments Received     : Rp ${sumTotalTerbayar.toLocaleString('id-ID')}`);
  console.log(`Total Unpaid Receivables (AR): Rp ${(sumTotalTagihan - sumTotalTerbayar).toLocaleString('id-ID')}`);
  
  if (isCommit) {
    // Perform bulk insertions in chunks
    const CHUNK_SIZE = 100;
    
    // Insert Sales Orders
    for (let i = 0; i < salesOrdersToInsert.length; i += CHUNK_SIZE) {
      await supabase.from('sales_orders').upsert(salesOrdersToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    }
    console.log('Inserted Sales Orders.');

    // Insert Sales Order Items
    for (let i = 0; i < salesOrderItemsToInsert.length; i += CHUNK_SIZE) {
      await supabase.from('sales_order_items').upsert(salesOrderItemsToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    }
    console.log('Inserted Sales Order Items.');
    
    // Insert Invoices
    for (let i = 0; i < invoicesToInsert.length; i += CHUNK_SIZE) {
      await supabase.from('invoices').upsert(invoicesToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    }
    console.log('Inserted Invoices.');
    
    // Insert Journal Entries & Lines
    for (let i = 0; i < journalEntriesToInsert.length; i += CHUNK_SIZE) {
      await supabase.from('journal_entries').upsert(journalEntriesToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    }
    for (let i = 0; i < journalLinesToInsert.length; i += CHUNK_SIZE) {
      await supabase.from('journal_lines').upsert(journalLinesToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
    }
    console.log('Inserted GL Journal Entries & Lines.');
    
    // Insert Cash Transactions (BCA Payments)
    if (cashTransactionsToInsert.length > 0) {
      for (let i = 0; i < cashTransactionsToInsert.length; i += CHUNK_SIZE) {
        await supabase.from('cash_transactions').upsert(cashTransactionsToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
      }
      console.log('Inserted BCA Cash Transactions.');
    }
  }

  let finalPettyBalance = 0;

  // ==========================================
  // PHASE 3: LAPORAN KAS TUNAI IMPORT
  // ==========================================
  console.log('\n--- PHASE 3: Importing Laporan Kas Tunai (Petty Cash) ---');
  
  if (fs.existsSync(kasTunaiCsvPath)) {
    const kasTunaiContent = fs.readFileSync(kasTunaiCsvPath, 'utf8');
    const kasTunaiLines = kasTunaiContent.split('\n');
    
    const cashTxsPettyToInsert = [];
    const pettyJournalEntriesToInsert = [];
    const pettyJournalLinesToInsert = [];
    
    let previousDate = null;
    let initialBalance = 0;
    
    // Find starting balance row (Line 5 / Index 4)
    // Row 5 has Starting Balance
    if (kasTunaiLines.length > 4) {
      const startingRow = parseCSVLine(kasTunaiLines[4], ';');
      if (startingRow.length >= 6) {
        initialBalance = parseAmount(startingRow[2]) || parseAmount(startingRow[5]) || 0;
        console.log(`Detected Historical Starting Petty Cash Balance: Rp ${initialBalance.toLocaleString('id-ID')}`);
      }
    }
    
    let currentPettyIndex = 1;
    let currentPettyJournalIndex = journalIdx; // resume index
    let totalCashIn = 0;
    let totalCashOut = 0;
    
    for (let i = 5; i < kasTunaiLines.length; i++) {
      const line = kasTunaiLines[i].trim();
      if (!line) continue;
      
      const cols = parseCSVLine(line, ';');
      if (cols.length < 5) continue;
      
      // Parse Date
      let txDateRaw = cols[0].trim();
      let txDate = null;
      if (txDateRaw) {
        txDate = parseSingleDate(txDateRaw);
        previousDate = txDate;
      } else {
        txDate = previousDate; // Reuse previous row's date
      }
      
      if (!txDate) {
        // Skip rows without dates or starting empty rows
        continue;
      }
      
      const description = cols[1].trim();
      if (!description || description.startsWith('SALDO AKHIR') || description.startsWith('TOTAL')) continue;
      
      const cashIn = parseAmount(cols[3]);
      const cashOut = parseAmount(cols[4]);
      
      if (cashIn === 0 && cashOut === 0) continue; // Skip helper total/summary lines
      
      const type = cashIn > 0 ? 'In' : 'Out';
      const amount = cashIn > 0 ? cashIn : cashOut;
      
      if (type === 'In') totalCashIn += amount;
      else totalCashOut += amount;
      
      const txId = `ct-petty-${String(currentPettyIndex).padStart(4, '0')}`;
      
      // 1. Create Cash Transaction
      cashTxsPettyToInsert.push({
        id: txId,
        date: txDate,
        type: type,
        amount: amount,
        bank_account_id: 'bank-petty',
        category: cashIn > 0 ? 'Lain-lain' : 'Operasional',
        description: description,
        reference_type: 'Manual',
        reference_id: null,
        counterpart_name: 'Petty Cash'
      });
      
      // 2. Identify Expense Account or Income Account based on keywords in description
      let counterpartAccountId = coaMap.get('6-9000'); // Default: Beban Operasional Lainnya
      
      const lowerDesc = description.toLowerCase();
      if (type === 'Out') {
        if (lowerDesc.includes('bensin') || lowerDesc.includes('bbm') || lowerDesc.includes('mobil') || lowerDesc.includes('ban') || lowerDesc.includes('lalamove') || lowerDesc.includes('ongkir') || lowerDesc.includes('grab') || lowerDesc.includes('gojek')) {
          counterpartAccountId = coaMap.get('6-1400'); // Beban Transportasi & BBM
        } else if (lowerDesc.includes('kuota') || lowerDesc.includes('internet') || lowerDesc.includes('listrik') || lowerDesc.includes('token') || lowerDesc.includes('wifi') || lowerDesc.includes('pulsa')) {
          counterpartAccountId = coaMap.get('6-1200'); // Beban Listrik, Air & Internet
        } else if (lowerDesc.includes('tissue') || lowerDesc.includes('kertas') || lowerDesc.includes('galon') || lowerDesc.includes('sapu') || lowerDesc.includes('keran') || lowerDesc.includes('air galon') || lowerDesc.includes('lem') || lowerDesc.includes('atk') || lowerDesc.includes('bohlam') || lowerDesc.includes('lampu')) {
          counterpartAccountId = coaMap.get('6-1500'); // Beban ATK & Kantor
        } else if (lowerDesc.includes('sewa')) {
          counterpartAccountId = coaMap.get('6-1100'); // Beban Sewa
        } else if (lowerDesc.includes('gaji') || lowerDesc.includes('honor') || lowerDesc.includes('bonus') || lowerDesc.includes('insentif') || lowerDesc.includes(' THR ')) {
          counterpartAccountId = coaMap.get('6-1000'); // Beban Gaji
        }
      } else {
        // Cash In (Setoran modal atau kembalian uang sourcing)
        if (lowerDesc.includes('modal') || lowerDesc.includes('setoran modal')) {
          counterpartAccountId = coaMap.get('3-1000'); // Owner Capital
        } else if (lowerDesc.includes('kembalian') || lowerDesc.includes('pengembalian') || lowerDesc.includes('sisa')) {
          counterpartAccountId = coaMap.get('1-1500'); // Owner/Sourcing Advance (refund)
        } else {
          counterpartAccountId = coaMap.get('4-2000'); // Pendapatan Lain-lain
        }
      }
      
      const jeId = `je-petty-${String(currentPettyIndex).padStart(4, '0')}`;
      pettyJournalEntriesToInsert.push({
        id: jeId,
        transaction_date: txDate,
        description: `Petty Cash: ${description}`,
        reference_type: 'CashTransaction',
        reference_id: txId
      });
      
      if (type === 'In') {
        pettyJournalLinesToInsert.push(
          // Debit Petty Cash Account (1-1000)
          {
            id: `jl-petty-${String(currentPettyIndex).padStart(4, '0')}-d`,
            journal_entry_id: jeId,
            account_id: coaMap.get('1-1000') || 'coa-1',
            debit_amount: amount,
            credit_amount: 0
          },
          // Credit Counterpart Account
          {
            id: `jl-petty-${String(currentPettyIndex).padStart(4, '0')}-c`,
            journal_entry_id: jeId,
            account_id: counterpartAccountId,
            debit_amount: 0,
            credit_amount: amount
          }
        );
      } else {
        pettyJournalLinesToInsert.push(
          // Debit Expense Account
          {
            id: `jl-petty-${String(currentPettyIndex).padStart(4, '0')}-d`,
            journal_entry_id: jeId,
            account_id: counterpartAccountId,
            debit_amount: amount,
            credit_amount: 0
          },
          // Credit Petty Cash Account (1-1000)
          {
            id: `jl-petty-${String(currentPettyIndex).padStart(4, '0')}-c`,
            journal_entry_id: jeId,
            account_id: coaMap.get('1-1000') || 'coa-1',
            debit_amount: 0,
            credit_amount: amount
          }
        );
      }
      
      currentPettyIndex++;
    }
    
    console.log(`Parsed Petty Cash entries: ${cashTxsPettyToInsert.length}`);
    console.log(`  Total Cash Incoming : Rp ${totalCashIn.toLocaleString('id-ID')}`);
    console.log(`  Total Cash Outgoing : Rp ${totalCashOut.toLocaleString('id-ID')}`);
    finalPettyBalance = initialBalance + totalCashIn - totalCashOut;
    
    // Add Petty Cash Starting Balance Journal Entry (Setoran Modal Awal ke Kas Petty Cash)
    if (initialBalance > 0) {
      const jeStartId = 'je-petty-initial-balance';
      pettyJournalEntriesToInsert.unshift({
        id: jeStartId,
        transaction_date: '2026-05-01T00:00:00.000Z', // start of May
        description: 'Saldo Awal Kas Tunai (Mei 2026)',
        reference_type: 'Manual',
        reference_id: 'petty-start-balance'
      });
      
      pettyJournalLinesToInsert.unshift(
        // Debit Petty Cash (1-1000)
        {
          id: 'jl-petty-initial-d',
          journal_entry_id: jeStartId,
          account_id: coaMap.get('1-1000') || 'coa-1',
          debit_amount: initialBalance,
          credit_amount: 0
        },
        // Credit Owner Capital (3-1000)
        {
          id: 'jl-petty-initial-c',
          journal_entry_id: jeStartId,
          account_id: coaMap.get('3-1000') || 'coa-11',
          debit_amount: 0,
          credit_amount: initialBalance
        }
      );
    }
    
    if (isCommit) {
      const CHUNK_SIZE = 100;
      
      // Insert Petty Cash Entries
      for (let i = 0; i < cashTxsPettyToInsert.length; i += CHUNK_SIZE) {
        await supabase.from('cash_transactions').upsert(cashTxsPettyToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
      }
      console.log('Inserted Petty Cash Transactions.');
      
      // Insert Petty Cash GL Journal entries
      for (let i = 0; i < pettyJournalEntriesToInsert.length; i += CHUNK_SIZE) {
        await supabase.from('journal_entries').upsert(pettyJournalEntriesToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
      }
      for (let i = 0; i < pettyJournalLinesToInsert.length; i += CHUNK_SIZE) {
        await supabase.from('journal_lines').upsert(pettyJournalLinesToInsert.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
      }
      console.log('Inserted Petty Cash Journal Entries & Lines.');
    }
  } else {
    console.warn(`File "${kasTunaiCsvPath}" not found. Skipping Petty Cash import.`);
  }

  // ==========================================
  // PHASE 4: UPDATE BANK ACCOUNT BALANCES
  // ==========================================
  console.log('\n--- PHASE 4: Updating Active Bank/Cash Balances ---');
  
  // Calculate final balances from accounting entries
  // BCA (bank-bca) balance = Starting balance (0) + Sum of BCA Payments (sumTotalTerbayar)
  const finalBcaBalance = sumTotalTerbayar; 
  
  // Petty Cash (bank-petty) balance is calculated in Phase 3
  
  console.log(`Target Bank Balances:`);
  console.log(`  BCA (Utama) : Rp ${finalBcaBalance.toLocaleString('id-ID')}`);
  console.log(`  Petty Cash  : Rp ${finalPettyBalance.toLocaleString('id-ID')}`);
  
  if (isCommit) {
    await supabase.from('bank_accounts').update({ balance: finalBcaBalance }).eq('id', 'bank-bca');
    await supabase.from('bank_accounts').update({ balance: finalPettyBalance }).eq('id', 'bank-petty');
    console.log('✅ Updated Bank Account balances in database.');
  }

  console.log(`\n====================================================`);
  console.log(`  IMPORT PROCESS COMPLETED`);
  if (!isCommit) {
    console.log(`  [DRY-RUN] No records were actually written to Supabase.`);
    console.log(`  To write to the database, run:`);
    console.log(`  node scripts/import-historical-complete.js --commit`);
  } else {
    console.log(`  [COMMIT] All historical data successfully seeded to Supabase!`);
  }
  console.log(`====================================================`);
}

main().catch(err => {
  console.error('Fatal import error:', err);
});
