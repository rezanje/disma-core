const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  { id: "coa-10-4", account_code: "2-4000", account_name: "Pinjaman Bank (Utang)", account_type: "Liability" },
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
  { id: '00000000-0000-0000-0000-000000000000', name: 'System', role: 'super_admin', pin: '0000' },
  { id: '11111111-1111-1111-1111-111111111111', name: 'Bagus (Admin PO)', role: 'admin_po', pin: '1111' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Hilman (Sourcing)', role: 'sourcing', pin: '2222' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sandi (Inventory)', role: 'gudang', pin: '3333' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Rivai (Logistik)', role: 'kurir', pin: '4444' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Sifa (Admin Finance)', role: 'finance', pin: '5555' },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Reza (Super Admin)', role: 'super_admin', pin: '120194' },
  { id: '77777777-7777-7777-7777-777777777777', name: 'Damar (CEO)', role: 'ceo', pin: '6666' },
  { id: '88888888-8888-8888-8888-888888888888', name: 'Hanif (CMO)', role: 'cmo', pin: '7777' },
];

async function seed() {
  console.log('Upserting COAs...');
  for (const coa of COA_SEED) {
    const { error } = await supabase.from('coas').upsert(coa);
    if (error) console.error(`Failed to upsert COA ${coa.account_code}:`, error.message);
  }
  console.log('Upserting Users...');
  for (const user of USERS_SEED) {
    const { error } = await supabase.from('users').upsert(user);
    if (error) console.error(`Failed to upsert user ${user.name}:`, error.message);
  }
  console.log('Local COAs and Users seeding done!');
}

seed().catch(err => {
  console.error('Seeding failed:', err);
});
