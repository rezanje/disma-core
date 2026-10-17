import { 
  BarChart3, Landmark, Wallet, Layers, FileSpreadsheet, 
  ArrowRightLeft, FileText, Banknote, ShoppingBag, 
  Package, LayoutDashboard, Truck, Inbox, 
  ArrowUpToLine, ShieldCheck, ShoppingCart, Users, 
  Boxes, FileDigit, Briefcase, Target, Shield, 
  Search, ScrollText, CheckCircle2, History, Archive,
  Receipt, Landmark as Bank, UserPlus, Cog, ListChecks, RefreshCw, TrendingDown, AlertTriangle, ClipboardList, MapPin, PackageCheck
} from "lucide-react"
import { AccessKey, Role } from "@/types"
import { canAccessRoute } from './access-policy'

export interface NavItemConfig {
  key: AccessKey;
  /**
   * Kunci izin yang dipakai kalau menu ini menumpang izin menu lain.
   *
   * Baris izin tiap peran tersimpan di database dan dibuat sekali. Menu yang lahir
   * sesudahnya membawa kunci yang tidak dikenal baris itu, jadi menunya tidak pernah
   * muncul sampai ada yang ingat membuka layar izin — dan menu yang tidak terlihat
   * sama saja dengan tidak dibuat. Menumpang kunci menu sekerja menghindarkan itu.
   *
   * `key` tetap unik supaya React tidak menggambar dua menu dengan identitas sama.
   */
  access?: AccessKey;
  title: string;
  href: string;
  icon: React.ReactNode;
  category: 'Harian' | 'Uang' | 'Barang' | 'Sistem';
  children?: {
    key: string;
    title: string;
    href: string;
  }[];
}

export const APP_PAGES: NavItemConfig[] = [
  // Paling atas dengan sengaja, untuk semua peran: ini satu-satunya layar yang
  // dibuka tiap hari.
  { key: 'admin_hari_ini', title: 'Hari ini', href: '/admin/hari-ini', icon: <PackageCheck className="h-4 w-4" />, category: 'Harian' },
  // ==========================================
  // PHASE 1: FINANCE & ADMIN PO (PRIMARY)
  // ==========================================
  
  // Finance Section
  //
  // Menunya disusun mengikuti pekerjaannya, bukan isi database. Halaman yang selama
  // ini berdiri sendiri padahal satu pekerjaan sekarang jadi tab di satu layar
  // (Piutang, Laporan keuangan, Biaya), dan halaman lamanya turun jadi anak menu.
  // Alamat lamanya tetap hidup supaya tautan yang sudah tersimpan tidak mati.

  // --- Harian ---
  { key: 'finance_purchase_plan', title: 'Rencana belanja', href: '/finance/purchase-plan', icon: <ClipboardList className="h-4 w-4" />, category: 'Harian' },
  { key: 'finance_salin_belanja', access: 'finance_purchase_plan', title: 'Salin kertas belanja', href: '/finance/salin-belanja', icon: <ListChecks className="h-4 w-4" />, category: 'Harian' },
  {
    key: 'finance_approvals',
    title: 'Persetujuan',
    href: '/finance/approvals',
    icon: <ShieldCheck className="h-4 w-4" />,
    category: 'Harian',
    children: [
      // Nama tab harus persis sama dengan value TabsTrigger di halaman approvals
      // (settlement / audit_online / audit_ops_lain / delivery). Tab yang tidak
      // dikenali membuat isi halaman kosong tanpa pesan apa pun.
      { key: 'finance_settlement', title: 'Settlement sourcing', href: '/finance/approvals?tab=settlement' },
      { key: 'finance_settlement_dash', title: 'Salin berkas QC', href: '/finance/salin-qc' },
      // Rekonsiliasi dulu menu sendiri, padahal pintu ketiga ke pekerjaan yang sama.
      { key: 'finance_rekon', title: 'Rekonsiliasi', href: '/finance/reconciliation' },
      { key: 'finance_audit', title: 'Audit operasional', href: '/finance/approvals?tab=audit_ops_lain' },
      { key: 'finance_online_audit', title: 'Audit belanja online', href: '/finance/approvals?tab=audit_online' },
      // Layar khusus audit pengiriman, bukan tab di halaman Persetujuan yang sudah
      // kepenuhan. Tab lamanya masih ada di dalam halaman itu kalau dibutuhkan.
      { key: 'admin_audit_pengiriman', title: 'Audit pengiriman', href: '/admin/audit-pengiriman' },
    ]
  },
  { key: 'finance_daily_close', title: 'Tutup hari', href: '/finance/daily-close', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Harian' },

  // --- Uang ---
  { key: 'finance_disbursements', title: 'Pindah kas', href: '/finance/disbursements', icon: <ArrowRightLeft className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_cash_bank', title: 'Kas & bank', href: '/finance/cash-bank', icon: <Bank className="h-4 w-4" />, category: 'Uang' },
  {
    key: 'finance_piutang',
    title: 'Piutang',
    href: '/finance/piutang',
    icon: <ScrollText className="h-4 w-4" />,
    category: 'Uang',
    children: [
      { key: 'finance_invoices', title: 'Tagihan', href: '/finance/piutang?tab=tagihan' },
      { key: 'finance_collections', title: 'Penagihan', href: '/finance/piutang?tab=penagihan' },
      { key: 'finance_ar_aging', title: 'Umur piutang', href: '/finance/piutang?tab=umur' },
    ]
  },
  { key: 'finance_ap_aging', title: 'Hutang vendor', href: '/finance/ap-aging', icon: <ClipboardList className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_online_purchase', title: 'Belanja online', href: '/finance/online-purchase', icon: <ShoppingBag className="h-4 w-4" />, category: 'Uang' },
  {
    key: 'finance_laporan',
    title: 'Laporan keuangan',
    href: '/finance/laporan',
    icon: <FileSpreadsheet className="h-4 w-4" />,
    category: 'Uang',
    children: [
      // Ringkasan menunjuk ke /finance, halaman pendaratan setelah login. Itu juga
      // yang memberi izin ke seluruh /finance/*, jadi kuncinya tidak boleh hilang.
      { key: 'finance_dashboard', title: 'Ringkasan', href: '/finance' },
      { key: 'finance_reports', title: 'Laba rugi & neraca', href: '/finance/laporan?tab=laba-rugi' },
      { key: 'finance_ledger', title: 'Buku besar', href: '/finance/laporan?tab=buku-besar' },
      { key: 'finance_sku_pnl', title: 'Untung rugi per barang', href: '/finance/laporan?tab=per-barang' },
    ]
  },
  {
    key: 'finance_biaya',
    title: 'Biaya',
    href: '/finance/biaya',
    icon: <TrendingDown className="h-4 w-4" />,
    category: 'Uang',
    children: [
      { key: 'finance_expenses', title: 'Pengeluaran', href: '/finance/biaya?tab=pengeluaran' },
      { key: 'finance_reimbursements', title: 'Reimbursement', href: '/finance/biaya?tab=reimbursement' },
      // Dua form ini milik orang lapangan dan mencatat atas nama yang mengisinya,
      // jadi ditautkan — bukan ditarik jadi tab di layar Finance.
      { key: 'finance_biaya_sourcing', title: 'Biaya jalan sourcing', href: '/sourcing/expenses' },
      { key: 'finance_biaya_kurir', title: 'Biaya jalan kurir', href: '/courier/expenses' },
    ]
  },

  // --- Sistem ---
  // Dibuka sebulan sekali, dulu makan tiga baris menu tiap hari.
  {
    key: 'finance_arsip',
    title: 'Arsip',
    href: '/finance/documents',
    icon: <Archive className="h-4 w-4" />,
    category: 'Sistem',
    children: [
      { key: 'finance_documents', title: 'Dokumen', href: '/finance/documents' },
      { key: 'finance_assets', title: 'Aset', href: '/finance/assets' },
      { key: 'finance_sourcing_monitor', title: 'Pantau sourcing', href: '/finance/sourcing-monitor' },
    ]
  },
 
  // Admin & CEO Section
  // Paling atas dengan sengaja: ini satu-satunya layar yang dibuka tiap hari.
  { key: 'admin_dashboard', title: 'Kokpit', href: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Harian' },
  {
    key: 'admin_sales_orders',
    title: 'Pesanan',
    href: '/admin/sales-orders',
    icon: <ShoppingCart className="h-4 w-4" />,
    category: 'Harian',
    children: [
      // Jalur nyata tapi jarang dipakai: vendor mengantar langsung ke klien.
      { key: 'admin_dropship', title: 'Kiriman vendor', href: '/admin/dropship' },
    ]
  },
  { key: 'admin_tukar_faktur', title: 'Tukar faktur', href: '/admin/tukar-faktur', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_purchase_requests', title: 'Permintaan beli', href: '/admin/purchase-requests', icon: <ClipboardList className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_clients', title: 'Klien', href: '/admin/clients', icon: <Users className="h-4 w-4" />, category: 'Sistem' },
  { key: 'admin_price_lists', title: 'Harga jual', href: '/admin/client-prices', icon: <Banknote className="h-4 w-4" />, category: 'Sistem' },
  { key: 'admin_products', title: 'Barang', href: '/admin/products', icon: <Boxes className="h-4 w-4" />, category: 'Barang' },
  { key: 'admin_vendors', title: 'Vendor', href: '/admin/vendors', icon: <Truck className="h-4 w-4" />, category: 'Barang' },
  { key: 'admin_shopping_list', title: 'Konsolidasi pesanan', href: '/admin/shopping-list', icon: <ListChecks className="h-4 w-4" />, category: 'Harian' },
  // Kuncinya sengaja sama dengan Konsolidasi PO: dua layar ini satu pekerjaan yang
  // dipecah dua, dan kunci baru bikin menunya tak terlihat sampai ada yang ingat
  // membuka layar izin — layar yang tidak terlihat sama saja dengan tidak dibuat.
  { key: 'admin_konsolidasi_belanja', access: 'admin_shopping_list', title: 'Kertas belanja', href: '/admin/konsolidasi-belanja', icon: <ClipboardList className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_delivery_routes', title: 'Rute kirim', href: '/admin/delivery-routes', icon: <MapPin className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_crm', title: 'Pipeline klien', href: '/admin/crm', icon: <Target className="h-4 w-4" />, category: 'Sistem' },
  { 
    key: 'admin_users', 
    title: 'Pengguna', 
    href: '/admin/users', 
    icon: <Shield className="h-4 w-4" />, 
    category: 'Sistem',
    children: [
      { key: 'users_perms', title: 'Izin & otoritas', href: '/admin/users?tab=roles' },
    ]
  },
  { key: 'admin_settings', title: 'Setelan sistem', href: '/admin/settings', icon: <Cog className="h-4 w-4" />, category: 'Sistem' },
  { key: 'admin_activity_log', title: 'Riwayat aktivitas', href: '/admin/activity-log', icon: <History className="h-4 w-4" />, category: 'Sistem' },
  { key: 'admin_loss_analytics', title: 'Analisa kerugian', href: '/admin/loss-analytics', icon: <TrendingDown className="h-4 w-4" />, category: 'Uang' },

  // ==========================================
  // PARKED MODULES (SECONDARY)
  // ==========================================

  // Warehouse
  { key: 'warehouse_dashboard', title: 'Gudang', href: '/warehouse', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_catalog', title: 'Katalog stok', href: '/warehouse/catalog', icon: <Boxes className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_inbound', title: 'Barang masuk', href: '/warehouse/inbound', icon: <Inbox className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_outbound', title: 'Barang keluar', href: '/warehouse/outbound', icon: <ArrowUpToLine className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_qc', title: 'Periksa mutu', href: '/warehouse/qc', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_reject_monitor', title: 'Barang ditolak', href: '/warehouse/reject-monitor', icon: <Archive className="h-4 w-4" />, category: 'Barang' },
  { key: 'warehouse_opname', title: 'Opname stok', href: '/warehouse/opname', icon: <RefreshCw className="h-4 w-4" />, category: 'Barang' },

  // Sourcing
  { 
    key: 'sourcing_dashboard',
    title: 'Sourcing',
    // Menunjuk ke /sourcing, bukan ke /sourcing/list. Dulu induk dan anaknya
    // membuka halaman yang sama persis — dua menu satu layar — sementara ringkasan
    // sourcing di /sourcing (tempat orang sourcing mendarat setelah login) tidak
    // punya menu sama sekali.
    href: '/sourcing',
    icon: <Search className="h-4 w-4 opacity-50" />, 
    category: 'Harian',
    children: [
      { key: 'sourcing_list', title: 'Daftar belanja', href: '/sourcing/list' },
      { key: 'sourcing_expenses', title: 'Biaya operasional', href: '/sourcing/expenses' },
    ]
  },

  // Courier
  { key: 'courier_dashboard', title: 'Logistik', href: '/courier', icon: <Truck className="h-4 w-4 opacity-50" />, category: 'Harian' },
  { key: 'courier_list', title: 'Daftar kiriman', href: '/courier/list', icon: <ListChecks className="h-4 w-4 opacity-50" />, category: 'Harian' },
  { key: 'courier_handover', title: 'Serah terima', href: '/courier/handover', icon: <FileDigit className="h-4 w-4 opacity-50" />, category: 'Harian' },
  { key: 'courier_history', title: 'Riwayat kiriman', href: '/courier/history', icon: <History className="h-4 w-4 opacity-50" />, category: 'Harian' },
  { key: 'courier_expenses', title: 'Biaya jalan', href: '/courier/expenses', icon: <Receipt className="h-4 w-4 opacity-50" />, category: 'Harian' },

  // Global
  // Keduanya dulu berkategori 'Uang' — tidak ada hubungannya dengan uang, dan di
  // sidebar Finance ikut menggemukkan kelompok yang sudah paling panjang.
  { key: 'tasks_global', title: 'My Tasks', href: '/tasks', icon: <ListChecks className="h-4 w-4" />, category: 'Sistem' },
  { key: 'settings_global', title: 'Setelan', href: '/settings/profile', icon: <Cog className="h-4 w-4" />, category: 'Sistem' },
];

const taskGroups: Partial<Record<Role, NavItemConfig[]>> = {
  admin_po: [
    {key:'admin_hari_ini',title:'Hari ini',href:'/admin/hari-ini',icon:<PackageCheck/>,category:'Harian'},
    {key:'admin_sales_orders',title:'Pesanan klien',href:'/admin/sales-orders',icon:<ShoppingCart/>,category:'Harian'},
    {key:'admin_shopping_list',title:'Kebutuhan dan kertas',href:'/admin/shopping-list',icon:<ClipboardList/>,category:'Harian',children:[{key:'admin_shopping_list',title:'Konsolidasi kebutuhan',href:'/admin/shopping-list'},{key:'admin_konsolidasi_belanja',title:'Kertas lapangan',href:'/admin/konsolidasi-belanja'}]},
    {key:'admin_delivery_routes',title:'Barang dan pengiriman',href:'/admin/operasi',icon:<Truck/>,category:'Barang',children:[{key:'warehouse_qc',title:'Penerimaan dan QC',href:'/admin/operasi?workspace=qc'},{key:'warehouse_outbound',title:'Packing dan keluar',href:'/admin/operasi?workspace=packing'},{key:'courier_handover',title:'Serah terima',href:'/admin/operasi?workspace=handover'},{key:'admin_delivery_routes',title:'Rute dan kurir',href:'/admin/operasi?workspace=rute'},{key:'admin_results',title:'Hasil dan retur',href:'/admin/operasi?workspace=hasil'},{key:'admin_dropship',title:'Kiriman vendor',href:'/admin/dropship'}]},
    {key:'admin_clients',title:'Klien dan harga jual',href:'/admin/klien-harga',icon:<Users/>,category:'Sistem',children:[{key:'admin_clients',title:'Klien',href:'/admin/klien-harga?workspace=klien'},{key:'admin_price_lists',title:'Harga jual',href:'/admin/klien-harga?workspace=harga'},{key:'admin_products',title:'Katalog barang',href:'/admin/klien-harga?workspace=barang'}]},
  ],
  finance: [
    {key:'admin_hari_ini',title:'Hari ini',href:'/finance',icon:<PackageCheck/>,category:'Harian'},
    {key:'finance_purchase_plan',title:'Rencana dan pesanan vendor',href:'/finance/rencana',icon:<ClipboardList/>,category:'Harian',children:[{key:'finance_purchase_plan',title:'Rencana belanja',href:'/finance/rencana?workspace=rencana'},{key:'finance_online_purchase',title:'Pesanan vendor dan online',href:'/finance/rencana?workspace=pesanan'},{key:'admin_vendors',title:'Vendor',href:'/finance/rencana?workspace=vendor'},{key:'admin_dropship',title:'Konfirmasi kiriman langsung vendor',href:'/admin/dropship'}]},
    {key:'finance_salin_belanja',title:'Salin belanja dan biaya',href:'/finance/salin',icon:<ListChecks/>,category:'Harian',children:[{key:'finance_salin_belanja',title:'Kertas belanja',href:'/finance/salin?workspace=belanja'},{key:'finance_expenses',title:'Pengeluaran',href:'/finance/salin?workspace=biaya'},{key:'finance_biaya_sourcing',title:'Biaya sourcing',href:'/finance/salin?workspace=sourcing'},{key:'finance_biaya_kurir',title:'Biaya kurir',href:'/finance/salin?workspace=kurir'}]},
    {key:'finance_cash_bank',title:'Kas bank dan dana petugas',href:'/finance/kas',icon:<Landmark/>,category:'Uang',children:[{key:'finance_cash_bank',title:'Kas dan bank',href:'/finance/kas?workspace=saldo'},{key:'finance_disbursements',title:'Pindah kas dan dana',href:'/finance/kas?workspace=dana'},{key:'finance_rekon',title:'Rekonsiliasi bank',href:'/finance/kas?workspace=rekon'}]},
    {key:'finance_ap_aging',title:'Utang vendor',href:'/finance/utang',icon:<ClipboardList/>,category:'Uang',children:[{key:'finance_ap_aging',title:'Tagihan dan pembayaran',href:'/finance/utang?workspace=tagihan'},{key:'finance_vendor_settlements',title:'Uang muka dan klaim',href:'/finance/utang?workspace=uang-muka-retur'}]},
    {key:'finance_piutang',title:'Tagihan dan pembayaran klien',href:'/finance/tagihan',icon:<ScrollText/>,category:'Uang',children:[{key:'finance_invoices',title:'Invoice dan pembayaran',href:'/finance/tagihan?workspace=tagihan'},{key:'admin_tukar_faktur',title:'Tukar faktur',href:'/finance/tagihan?workspace=dokumen'},{key:'finance_collections',title:'Penagihan',href:'/finance/tagihan?workspace=tagihan&tab=penagihan'},{key:'admin_audit_pengiriman',title:'Bukti dan penerbitan invoice',href:'/finance/tagihan?workspace=terbit'}]},
    {key:'finance_daily_close',title:'Tutup hari dan laporan',href:'/finance/penutupan',icon:<FileSpreadsheet/>,category:'Uang',children:[{key:'finance_daily_close',title:'Tutup hari',href:'/finance/penutupan?workspace=hari'},{key:'finance_laporan',title:'Laporan keuangan',href:'/finance/penutupan?workspace=laporan'},{key:'finance_approvals',title:'Pemeriksaan transaksi',href:'/finance/penutupan?workspace=periksa'},{key:'finance_documents',title:'Arsip dokumen',href:'/finance/penutupan?workspace=arsip'}]},
  ],
  super_admin: [
    {key:'admin_dashboard',title:'Kokpit dan pengecualian',href:'/admin',icon:<LayoutDashboard/>,category:'Harian',children:[{key:'admin_hari_ini',title:'Operasi hari ini',href:'/admin/hari-ini'},{key:'finance_piutang',title:'Piutang',href:'/finance/piutang'},{key:'finance_ap_aging',title:'Utang vendor',href:'/finance/ap-aging'},{key:'finance_laporan',title:'Laporan keuangan',href:'/finance/laporan'},{key:'admin_loss_analytics',title:'Barang dan selisih',href:'/admin/loss-analytics'}]},
    {key:'admin_users',title:'Pengguna dan akses',href:'/admin/users',icon:<Users/>,category:'Sistem'},
    {key:'admin_activity_log',title:'Koreksi dan riwayat',href:'/admin/koreksi',icon:<History/>,category:'Sistem',children:[{key:'admin_payment_corrections',title:'Koreksi pembayaran',href:'/admin/koreksi?workspace=pembayaran'},{key:'warehouse_opname',title:'Pemeriksaan stok fisik',href:'/admin/koreksi?workspace=stok'},{key:'admin_activity_log',title:'Riwayat perubahan',href:'/admin/koreksi?workspace=riwayat'},{key:'finance_ledger',title:'Buku besar',href:'/finance/ledger'}]},
    {key:'admin_settings',title:'Master dan aturan bisnis',href:'/admin/settings',icon:<Cog/>,category:'Sistem',children:[{key:'admin_products',title:'Barang',href:'/admin/products'},{key:'admin_clients',title:'Klien dan syarat',href:'/admin/clients'},{key:'admin_vendors',title:'Vendor',href:'/admin/vendors'},{key:'admin_price_lists',title:'Harga jual',href:'/admin/client-prices'},{key:'finance_cash_bank',title:'Rekening dan kas',href:'/finance/cash-bank'}]},
    {key:'admin_maintenance',title:'Cadangan dan sistem',href:'/admin/settings/maintenance',icon:<Shield/>,category:'Sistem'},
  ],
};

export const getNavItemsForUser = (permissions: AccessKey[], role?: Role): NavItemConfig[] => {
  const groups = role ? taskGroups[role] : undefined;
  if (groups) return groups.map(group=>({...group,children:group.children?.filter(child=>canAccessRoute(role,child.href))}));
  return APP_PAGES.filter(page => permissions.includes(page.access || page.key));
};
