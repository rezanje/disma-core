import { ChartOfAccount, Client, Product, Role, User, Vendor } from '@/types';

export const ROLES: Record<string, Role> = {
  ADMIN: 'admin_po',
  SOURCING: 'sourcing',
  GUDANG: 'gudang',
  KURIR: 'kurir',
  FINANCE: 'finance',
  CEO: 'ceo',
  SUPER_ADMIN: 'super_admin',
  CMO: 'cmo',
};

// Mock Users for Auth
export const MOCK_USERS: any[] = [
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "pin": "1111",
    "name": "Bagus (Admin PO)",
    "role": "admin_po"
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "pin": "2222",
    "name": "Hilman (Sourcing)",
    "role": "sourcing",
    // Mode Salin (16 Agu 2026): tim lapangan mencatat di kertas dan tidak memakai
    // aplikasi. Selama PIN-nya hidup, satu-satunya kegunaannya adalah dipinjam
    // penyalin — dan itu membuat setiap jejak audit menunjuk orang yang salah.
    // Hidupkan lagi saat mereka mulai memakai aplikasi sendiri.
    "isActive": false
  },
  {
    "id": "33333333-3333-3333-3333-333333333333",
    "pin": "3333",
    "name": "Sandi (Inventory)",
    "role": "gudang",
    // Mode Salin (16 Agu 2026): tim lapangan mencatat di kertas dan tidak memakai
    // aplikasi. Selama PIN-nya hidup, satu-satunya kegunaannya adalah dipinjam
    // penyalin — dan itu membuat setiap jejak audit menunjuk orang yang salah.
    // Hidupkan lagi saat mereka mulai memakai aplikasi sendiri.
    "isActive": false
  },
  {
    "id": "44444444-4444-4444-4444-444444444444",
    "pin": "4444",
    "name": "Rivai (Logistik)",
    "role": "kurir",
    // Mode Salin (16 Agu 2026): tim lapangan mencatat di kertas dan tidak memakai
    // aplikasi. Selama PIN-nya hidup, satu-satunya kegunaannya adalah dipinjam
    // penyalin — dan itu membuat setiap jejak audit menunjuk orang yang salah.
    // Hidupkan lagi saat mereka mulai memakai aplikasi sendiri.
    "isActive": false
  },
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "pin": "5555",
    "name": "Sifa (Admin Finance)",
    "role": "finance"
  },
  {
    "id": "66666666-6666-6666-6666-666666666666",
    "pin": "120194",
    "name": "Reza (Super Admin)",
    "role": "super_admin"
  },
  {
    "id": "77777777-7777-7777-7777-777777777777",
    "pin": "6666",
    "name": "Damar (CEO)",
    "role": "ceo"
  },
  {
    "id": "88888888-8888-8888-8888-888888888888",
    "pin": "7777",
    "name": "Hanif (CMO)",
    "role": "cmo"
  },
  {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "pin": "8888",
    "name": "Syahmi (COO)",
    "role": "coo"
  }
];

export const COA_SEED: any[] = [
  {
    "id": "coa-1",
    "accountCode": "1-1000",
    "accountName": "Kas di Tangan (Petty Cash)",
    "accountType": "Asset"
  },
  {
    // Bank Jago dulu ikut menumpang di 1-1000 bersama BRI dan Petty Cash, jadi baris kas
    // di Neraca menggabungkan tiga rekening yang berbeda fungsi dan tidak bisa dibaca.
    "id": "coa-1-1",
    "accountCode": "1-1100",
    "accountName": "Bank Jago - Belanja",
    "accountType": "Asset"
  },
  {
    "id": "coa-1-2",
    "accountCode": "1-1200",
    "accountName": "Bank BCA - Utama",
    "accountType": "Asset"
  },
  {
    "id": "coa-1-3",
    "accountCode": "1-1300",
    "accountName": "Bank Mandiri - Operasional",
    "accountType": "Asset"
  },
  {
    "id": "coa-1-4",
    "accountCode": "1-1400",
    "accountName": "Bank BRI - Simpanan",
    "accountType": "Asset"
  },
  {
    "id": "coa-transfer-clearing",
    "accountCode": "1-1999",
    "accountName": "Transfer Antar Bank (Clearing)",
    "accountType": "Asset"
  },
  {
    "id": "coa-1-5",
    "accountCode": "1-1500",
    "accountName": "Uang Muka Karyawan (Advance)",
    "accountType": "Asset"
  },
  {
    "id": "coa-2",
    "accountCode": "1-2000",
    "accountName": "Piutang Usaha (Klien)",
    "accountType": "Asset"
  },
  {
    "id": "coa-vendor-return-claim",
    "accountCode": "1-2100",
    "accountName": "Piutang Retur ke Vendor",
    "accountType": "Asset"
  },
  {
    "id": "coa-3",
    "accountCode": "1-3000",
    "accountName": "Persediaan Barang Dagang",
    "accountType": "Asset"
  },
  {
    "id": "coa-4",
    "accountCode": "1-4000",
    "accountName": "Aset Tetap (Kendaraan/Alat)",
    "accountType": "Asset"
  },
  {
    "id": "coa-5",
    "accountCode": "1-4999",
    "accountName": "Akumulasi Penyusutan Aset",
    "accountType": "Asset"
  },
  {
    "id": "coa-10",
    "accountCode": "2-1000",
    "accountName": "Utang Usaha (Vendor)",
    "accountType": "Liability"
  },
  {
    "id": "coa-10-2",
    "accountCode": "2-2000",
    "accountName": "Utang Gaji & Honor",
    "accountType": "Liability"
  },
  {
    "id": "coa-10-3",
    "accountCode": "2-3000",
    "accountName": "Utang Pajak (PPN/PPh)",
    "accountType": "Liability"
  },
  {
    "id": "coa-11",
    "accountCode": "3-1000",
    "accountName": "Modal Pemilik (Owner Capital)",
    "accountType": "Equity"
  },
  {
    "id": "coa-11-2",
    "accountCode": "3-2000",
    "accountName": "Prive / Penarikan Pribadi",
    "accountType": "Equity"
  },
  {
    "id": "coa-12",
    "accountCode": "4-1000",
    "accountName": "Pendapatan Penjualan Produk",
    "accountType": "Revenue"
  },
  {
    "id": "coa-12-2",
    "accountCode": "4-2000",
    "accountName": "Pendapatan Lain-lain",
    "accountType": "Revenue"
  },
  {
    "id": "coa-13",
    "accountCode": "5-1000",
    "accountName": "Harga Pokok Penjualan (HPP)",
    "accountType": "Expense"
  },
  {
    "id": "coa-14",
    "accountCode": "5-2000",
    "accountName": "Beban Kerusakan/Retur Barang",
    "accountType": "Expense"
  },
  {
    "id": "coa-15",
    "accountCode": "6-1000",
    "accountName": "Beban Gaji & Tunjangan",
    "accountType": "Expense"
  },
  {
    "id": "coa-15-2",
    "accountCode": "6-1100",
    "accountName": "Beban Sewa Gedung/Workshop",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-2",
    "accountCode": "6-1200",
    "accountName": "Beban Listrik, Air & Internet",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-3",
    "accountCode": "6-1300",
    "accountName": "Beban Marketing & Iklan",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-4",
    "accountCode": "6-1400",
    "accountName": "Beban Transportasi & BBM",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-5",
    "accountCode": "6-1500",
    "accountName": "Beban ATK & Kantor",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-6",
    "accountCode": "6-1600",
    "accountName": "Biaya Admin Platform",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-7",
    "accountCode": "6-1700",
    "accountName": "Ongkos Kirim Pembelian",
    "accountType": "Expense"
  },
  {
    "id": "coa-9-9",
    "accountCode": "6-9000",
    "accountName": "Beban Operasional Lainnya",
    "accountType": "Expense"
  },
  {
    "id": "coa-16",
    "accountCode": "6-2000",
    "accountName": "Beban Penyusutan Aset",
    "accountType": "Expense"
  },
  {
    "id": "coa-4-2",
    "accountCode": "2-4000",
    "accountName": "Pinjaman Bank (Utang)",
    "accountType": "Liability"
  },
  {
    "id": "coa-10-talangan",
    "accountCode": "2-1500",
    "accountName": "Utang Talangan Karyawan",
    "accountType": "Liability"
  },
  {
    "id": "coa-ap-accrual",
    "accountCode": "2-1100",
    "accountName": "Hutang Akrual Belum Ditagih (AP Accrual)",
    "accountType": "Liability"
  },
  {
    "id": "coa-persediaan-b2c",
    "accountCode": "1-3100",
    "accountName": "Persediaan Peralihan B2C",
    "accountType": "Asset"
  }
];

export const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-200 text-slate-800',
  'Pending Approval': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Belanja: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  Sourcing: 'bg-purple-100 text-purple-800 border-purple-200',
  QC: 'bg-amber-100 text-amber-800 border-amber-200',
  Packing: 'bg-blue-100 text-blue-800 border-blue-200',
  'Siap Kirim': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Dikirim: 'bg-emerald-50 text-emerald-700',
  Terkirim: 'bg-emerald-100 text-emerald-800',
  'Kurang Kirim': 'bg-amber-100 text-amber-800 border-amber-200',
  Batal: 'bg-rose-100 text-rose-800',
  Pending: 'bg-amber-100 text-amber-800',
  Selesai: 'bg-emerald-100 text-emerald-800',
  Unpaid: 'bg-rose-100 text-rose-800',
  Partial: 'bg-amber-100 text-amber-800',
  Paid: 'bg-emerald-100 text-emerald-800',
};

export { CLIENTS_SEED } from './clients_seed';

export const VENDORS_SEED: any[] = [
  {
    "id": "v1",
    "email": "rahman@sayursegar.com",
    "phone": "081122334455",
    "address": "Pasar Induk Kramat Jati",
    "picName": "Pak Rahman",
    "createdAt": "2026-03-30T11:06:08.973Z",
    "companyName": "Supplier Sayur Segar"
  }
];

export { PRODUCTS_SEED } from './products_seed';


// trigger deployment
