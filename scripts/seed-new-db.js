/**
 * Seed script for new Supabase database.
 * Sends COA, Users, and Bank Accounts to the production API.
 */

const BASE_URL = 'https://disma-core.vercel.app';

const COA_SEED = [
  { id: "coa-1", account_code: "1-1000", account_name: "Kas di Tangan (Petty Cash)", account_type: "Asset" },
  { id: "coa-1-2", account_code: "1-1200", account_name: "Bank BCA - Utama", account_type: "Asset" },
  { id: "coa-1-3", account_code: "1-1300", account_name: "Bank Mandiri - Operasional", account_type: "Asset" },
  { id: "coa-1-5", account_code: "1-1500", account_name: "Uang Muka Karyawan (Advance)", account_type: "Asset" },
  { id: "coa-2", account_code: "1-2000", account_name: "Piutang Usaha (Klien)", account_type: "Asset" },
  { id: "coa-3", account_code: "1-3000", account_name: "Persediaan Barang Dagang", account_type: "Asset" },
  { id: "coa-4", account_code: "1-4000", account_name: "Aset Tetap (Kendaraan/Alat)", account_type: "Asset" },
  { id: "coa-5", account_code: "1-4999", account_name: "Akumulasi Penyusutan Aset", account_type: "Asset" },
  { id: "coa-10", account_code: "2-1000", account_name: "Utang Usaha (Vendor)", account_type: "Liability" },
  { id: "coa-10-2", account_code: "2-2000", account_name: "Utang Gaji & Honor", account_type: "Liability" },
  { id: "coa-10-3", account_code: "2-3000", account_name: "Utang Pajak (PPN/PPh)", account_type: "Liability" },
  { id: "coa-4-2", account_code: "2-4000", account_name: "Pinjaman Bank (Utang)", account_type: "Liability" },
  { id: "coa-11", account_code: "3-1000", account_name: "Modal Pemilik (Owner Capital)", account_type: "Equity" },
  { id: "coa-11-2", account_code: "3-2000", account_name: "Prive / Penarikan Pribadi", account_type: "Equity" },
  { id: "coa-12", account_code: "4-1000", account_name: "Pendapatan Penjualan Produk", account_type: "Revenue" },
  { id: "coa-12-2", account_code: "4-2000", account_name: "Pendapatan Lain-lain", account_type: "Revenue" },
  { id: "coa-13", account_code: "5-1000", account_name: "Harga Pokok Penjualan (HPP)", account_type: "Expense" },
  { id: "coa-14", account_code: "5-2000", account_name: "Beban Kerusakan/Retur Barang", account_type: "Expense" },
  { id: "coa-15", account_code: "6-1000", account_name: "Beban Gaji & Tunjangan", account_type: "Expense" },
  { id: "coa-15-2", account_code: "6-1100", account_name: "Beban Sewa Gedung/Workshop", account_type: "Expense" },
  { id: "coa-9-2", account_code: "6-1200", account_name: "Beban Listrik, Air & Internet", account_type: "Expense" },
  { id: "coa-9-3", account_code: "6-1300", account_name: "Beban Marketing & Iklan", account_type: "Expense" },
  { id: "coa-9-4", account_code: "6-1400", account_name: "Beban Transportasi & BBM", account_type: "Expense" },
  { id: "coa-9-5", account_code: "6-1500", account_name: "Beban ATK & Kantor", account_type: "Expense" },
  { id: "coa-9-6", account_code: "6-1600", account_name: "Biaya Admin Platform", account_type: "Expense" },
  { id: "coa-9-7", account_code: "6-1700", account_name: "Ongkos Kirim Pembelian", account_type: "Expense" },
  { id: "coa-9-9", account_code: "6-9000", account_name: "Beban Operasional Lainnya", account_type: "Expense" },
  { id: "coa-16", account_code: "6-2000", account_name: "Beban Penyusutan Aset", account_type: "Expense" },
];

const USERS_SEED = [
  { id: "u1", pin: "1111", name: "Bagus (Admin PO)", role: "admin_po" },
  { id: "u2", pin: "2222", name: "Hilman (Sourcing)", role: "sourcing" },
  { id: "u3", pin: "3333", name: "Sandi (Inventory)", role: "gudang" },
  { id: "u4", pin: "4444", name: "Rivai (Logistik)", role: "kurir" },
  { id: "u5", pin: "5555", name: "Sifa (Admin Finance)", role: "finance" },
  { id: "u6", pin: "120194", name: "Reza (Super Admin)", role: "super_admin" },
  { id: "u7", pin: "6666", name: "Damar (CEO)", role: "ceo" },
  { id: "u8", pin: "7777", name: "Hanif (CMO)", role: "cmo" },
];

const BANK_ACCOUNTS_SEED = [
  { id: "bank-bca", name: "BCA (Utama)", account_number: "000-000-0001", account_code: "1-1200", balance: 0 },
  { id: "bank-mandiri", name: "Mandiri (Ops)", account_number: "000-000-0002", account_code: "1-1300", balance: 0 },
  { id: "bank-petty", name: "Petty Cash", account_number: "", account_code: "1-1000", balance: 0 },
];

async function seedTable(table, data) {
  console.log(`Seeding ${table} (${data.length} rows)...`);
  const res = await fetch(`${BASE_URL}/api/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, data }),
  });
  const json = await res.json();
  if (res.ok) {
    console.log(`  ✅ ${table}: ${JSON.stringify(json)}`);
  } else {
    console.error(`  ❌ ${table} FAILED:`, json);
  }
}

async function main() {
  console.log('=== SEEDING NEW DATABASE ===\n');
  await seedTable('coas', COA_SEED);
  await seedTable('users', USERS_SEED);
  await seedTable('bank_accounts', BANK_ACCOUNTS_SEED);
  console.log('\n=== DONE ===');
}

main();
