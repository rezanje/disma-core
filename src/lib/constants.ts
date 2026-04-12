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
export const MOCK_USERS: User[] = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Bagus (Admin PO)', role: 'admin_po', pin: '1111' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Hilman (Sourcing)', role: 'sourcing', pin: '2222' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sandi (Inventory)', role: 'gudang', pin: '3333' },
  { id: '44444444-4444-4444-4444-444444444444', name: 'Rivai (Logistik)', role: 'kurir', pin: '4444' },
  { id: '55555555-5555-5555-5555-555555555555', name: 'Sifa (Admin Finance)', role: 'finance', pin: '5555' },
  { id: '66666666-6666-6666-6666-666666666666', name: 'Reza (Super Admin)', role: 'super_admin', pin: '120194' },
  { id: '77777777-7777-7777-7777-777777777777', name: 'Damar (CEO)', role: 'ceo', pin: '6666' },
  { id: '88888888-8888-8888-8888-888888888888', name: 'Hanif (CMO)', role: 'cmo', pin: '7777' },
  { id: '00000000-0000-0000-0000-000000000000', name: 'System', role: 'super_admin', pin: '0000' },
];

export const COA_SEED: ChartOfAccount[] = [
  { id: 'coa-1', accountCode: '1-1000', accountName: 'Kas di Tangan (Petty Cash)', accountType: 'Asset' },
  { id: 'coa-1-2', accountCode: '1-1200', accountName: 'Bank BCA - Utama', accountType: 'Asset' },
  { id: 'coa-1-3', accountCode: '1-1300', accountName: 'Bank Mandiri - Operasional', accountType: 'Asset' },
  { id: 'coa-1-5', accountCode: '1-1500', accountName: 'Uang Muka Karyawan (Advance)', accountType: 'Asset' },
  { id: 'coa-1-5-1', accountCode: '1-1510', accountName: 'Kas Operasional Kurir', accountType: 'Asset' },
  { id: 'coa-2', accountCode: '1-2000', accountName: 'Piutang Usaha', accountType: 'Asset' },
  { id: 'coa-3', accountCode: '1-3000', accountName: 'Persediaan Barang', accountType: 'Asset' },
  { id: 'coa-4', accountCode: '2-1000', accountName: 'Utang Usaha', accountType: 'Liability' },
  { id: 'coa-4-1', accountCode: '2-2000', accountName: 'Utang Gaji & Upah', accountType: 'Liability' },
  { id: 'coa-4-2', accountCode: '2-4000', accountName: 'Pinjaman Bank (Utang)', accountType: 'Liability' },
  { id: 'coa-5', accountCode: '3-1000', accountName: 'Modal Saham / Investasi', accountType: 'Equity' },
  { id: 'coa-5-1', accountCode: '3-2000', accountName: 'Prive / Penarikan Modal', accountType: 'Equity' },
  { id: 'coa-6', accountCode: '4-1000', accountName: 'Pendapatan Penjualan', accountType: 'Revenue' },
  { id: 'coa-6-1', accountCode: '4-2000', accountName: 'Pendapatan Lain-lain', accountType: 'Revenue' },
  { id: 'coa-7', accountCode: '5-1000', accountName: 'Harga Pokok Penjualan (HPP)', accountType: 'Expense' },
  { id: 'coa-8', accountCode: '5-2000', accountName: 'Beban Kerusakan Barang (Shrinkage)', accountType: 'Expense' },
  { id: 'coa-9', accountCode: '6-1000', accountName: 'Beban Gaji & Upah', accountType: 'Expense' },
  { id: 'coa-9-1', accountCode: '6-1100', accountName: 'Beban Sewa & Properti', accountType: 'Expense' },
  { id: 'coa-9-2', accountCode: '6-1200', accountName: 'Beban Listrik, Air & Internet', accountType: 'Expense' },
  { id: 'coa-9-3', accountCode: '6-1300', accountName: 'Beban Marketing & Iklan', accountType: 'Expense' },
  { id: 'coa-9-4', accountCode: '6-1400', accountName: 'Beban Transportasi & BBM', accountType: 'Expense' },
  { id: 'coa-9-5', accountCode: '6-1500', accountName: 'Beban ATK & Kantor', accountType: 'Expense' },
  { id: 'coa-9-6', accountCode: '6-1600', accountName: 'Biaya Admin Platform', accountType: 'Expense' },
  { id: 'coa-9-7', accountCode: '6-1700', accountName: 'Ongkos Kirim Pembelian', accountType: 'Expense' },
  { id: 'coa-9-9', accountCode: '6-9000', accountName: 'Beban Operasional Lainnya', accountType: 'Expense' },
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
  Batal: 'bg-rose-100 text-rose-800',
  Pending: 'bg-amber-100 text-amber-800',
  Selesai: 'bg-emerald-100 text-emerald-800',
  Unpaid: 'bg-rose-100 text-rose-800',
  Partial: 'bg-amber-100 text-amber-800',
  Paid: 'bg-emerald-100 text-emerald-800',
};

export { CLIENTS_SEED } from './clients_seed';

export const VENDORS_SEED: Vendor[] = [
  {
    id: 'v1',
    companyName: 'Supplier Sayur Segar',
    picName: 'Pak Rahman',
    email: 'rahman@sayursegar.com',
    phone: '081122334455',
    address: 'Pasar Induk Kramat Jati',
    createdAt: new Date().toISOString()
  }
];

export { PRODUCTS_SEED } from './products_seed';

import { SmartKpi } from '@/types';
export const KPI_SEED: SmartKpi[] = [
  {
    id: 'kpi-1', assigneeUserId: '11111111-1111-1111-1111-111111111111', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Efisiensi Input PO', category: 'Operasional',
    specific: 'Input 100% Sales Order divalidasi jadi PO dlm < 4 jam.',
    measurable: 'Timestamp SO vs PO.', achievable: 'Volume SO saat ini 15-20/hari.',
    relevant: 'Mempercepat supply chain.', timeBound: 'Setiap hari jam kerja.',
    weight: 40, targetValue: 100, actualValue: 85, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-2', assigneeUserId: '11111111-1111-1111-1111-111111111111', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Akurasi HPP', category: 'Finance',
    specific: 'Minimalisir selisih HPP sistem vs invoice vendor < 1%.',
    measurable: 'Audit invoice vendor.', achievable: 'Kalkulator HPP tersedia.',
    relevant: 'Menghindari kerugian margin.', timeBound: 'Bulanan.',
    weight: 60, targetValue: 99, actualValue: 98, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-3', assigneeUserId: '22222222-2222-2222-2222-222222222222', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Sourcing Savings', category: 'Finance',
    specific: 'Hemat belanja item vs estimasi budget di PO sebesar 5%.',
    measurable: 'Actual vs Estimated price.', achievable: 'Negosiasi supplier.',
    relevant: 'Meningkatkan bottom line.', timeBound: 'Bulanan.',
    weight: 50, targetValue: 5, actualValue: 4.2, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-4', assigneeUserId: '22222222-2222-2222-2222-222222222222', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Kecepatan Misi', category: 'Operasional',
    specific: '100% misi belanja selesai di hari yang sama dengan transfer.',
    measurable: 'Transfer date vs Mission Selesai.', achievable: 'Budget pagi hari.',
    relevant: 'Stock ready tim Produksi.', timeBound: 'Harian.',
    weight: 50, targetValue: 100, actualValue: 95, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-5', assigneeUserId: '33333333-3333-3333-3333-333333333333', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Akurasi Stock Opname', category: 'Quality',
    specific: 'Selisih fisik vs sistem saat stock opname mingguan < 0.5%.',
    measurable: 'Selisih record SO.', achievable: 'Input real-time mobile.',
    relevant: 'Data akurat procurement.', timeBound: 'Mingguan.',
    weight: 60, targetValue: 99.5, actualValue: 99.1, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-6', assigneeUserId: '44444444-4444-4444-4444-444444444444', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Lead Time Delivery', category: 'Customer',
    specific: 'Kirim area JABODETABEK < 6 jam sejak pick up.',
    measurable: 'Pickup vs Delivered time.', achievable: 'Optimasi rute maps.',
    relevant: 'Kepuasan customer b2b.', timeBound: 'Harian.',
    weight: 70, targetValue: 95, actualValue: 92, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  },
  {
    id: 'kpi-7', assigneeUserId: '55555555-5555-5555-5555-555555555555', assignedByUserId: '66666666-6666-6666-6666-666666666666', period: 'Maret 2026',
    title: 'Speed of Audit', category: 'Operasional',
    specific: 'Audit laporan sourcing dlm < 24 jam.',
    measurable: 'Timestamp Report vs Audit.', achievable: 'Nota terekam di sistem.',
    relevant: 'Penutupan Petty Cash cepat.', timeBound: 'Harian.',
    weight: 40, targetValue: 100, actualValue: 80, unit: '%', status: 'Active',
    createdAt: new Date().toISOString()
  }
];

// trigger deployment
