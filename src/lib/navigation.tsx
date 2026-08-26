import { 
  BarChart3, Landmark, Wallet, Layers, FileSpreadsheet, 
  ArrowRightLeft, FileText, Banknote, ShoppingBag, 
  Package, LayoutDashboard, Truck, Inbox, 
  ArrowUpToLine, ShieldCheck, ShoppingCart, Users, 
  Boxes, FileDigit, Briefcase, Target, Shield, 
  Search, ScrollText, CheckCircle2, History, Archive,
  Receipt, Landmark as Bank, UserPlus, Cog, ListChecks, RefreshCw, TrendingDown, AlertTriangle, ClipboardList, MapPin, PackageCheck
} from "lucide-react"
import { AccessKey } from "@/types"

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
  // ==========================================
  // PHASE 1: FINANCE & ADMIN PO (PRIMARY)
  // ==========================================
  
  // Finance Section
  { key: 'finance_dashboard', title: 'Laporan', href: '/finance', icon: <BarChart3 className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_daily_close', title: 'Tutup hari', href: '/finance/daily-close', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Harian' },
  { key: 'finance_purchase_plan', title: 'Rencana belanja', href: '/finance/purchase-plan', icon: <ClipboardList className="h-4 w-4" />, category: 'Harian' },
  { key: 'finance_salin_belanja', access: 'finance_purchase_plan', title: 'Salin kertas belanja', href: '/finance/salin-belanja', icon: <ListChecks className="h-4 w-4" />, category: 'Harian' },
  { key: 'finance_disbursements', title: 'Pindah kas', href: '/finance/disbursements', icon: <ArrowRightLeft className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_sourcing_monitor', title: 'Pantau sourcing', href: '/finance/sourcing-monitor', icon: <Banknote className="h-4 w-4" />, category: 'Harian' },
  { 
    key: 'finance_approvals', 
    title: 'Persetujuan', 
    href: '/finance/approvals', 
    icon: <ShieldCheck className="h-4 w-4" />, 
    category: 'Uang',
    children: [
      // Nama tab harus persis sama dengan value TabsTrigger di halaman approvals
      // (settlement / audit_online / audit_ops_lain / delivery). Tab yang tidak
      // dikenali membuat isi halaman kosong tanpa pesan apa pun.
      { key: 'finance_settlement', title: 'Settlement sourcing', href: '/finance/approvals?tab=settlement' },
      { key: 'finance_settlement_dash', title: 'Ringkasan settlement', href: '/finance/approvals/sourcing-settlement' },
      { key: 'finance_audit', title: 'Audit operasional', href: '/finance/approvals?tab=audit_ops_lain' },
      { key: 'finance_online_audit', title: 'Audit belanja online', href: '/finance/approvals?tab=audit_online' },
      { key: 'finance_delivery', title: 'Audit pengiriman', href: '/finance/approvals?tab=delivery' },
    ]
  },
  { key: 'finance_rekon', title: 'Rekonsiliasi', href: '/finance/reconciliation', icon: <RefreshCw className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_reimbursements', title: 'Reimbursement', href: '/finance/reimbursements', icon: <Receipt className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_cash_bank', title: 'Kas & bank', href: '/finance/cash-bank', icon: <Bank className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_expenses', title: 'Pengeluaran', href: '/finance/expenses', icon: <TrendingDown className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_reports', title: 'Laporan keuangan', href: '/finance/reports', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_sku_pnl', title: 'Untung rugi per barang', href: '/finance/sku-pnl', icon: <BarChart3 className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_invoices', title: 'Piutang', href: '/finance/invoices', icon: <ScrollText className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_collections', title: 'Penagihan', href: '/finance/collections', icon: <History className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_ar_aging', title: 'Umur piutang', href: '/finance/ar-aging', icon: <AlertTriangle className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_ap_aging', title: 'Hutang vendor', href: '/finance/ap-aging', icon: <ClipboardList className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_ledger', title: 'Buku besar', href: '/finance/ledger', icon: <ArrowRightLeft className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_online_purchase', title: 'Belanja online', href: '/finance/online-purchase', icon: <ShoppingBag className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_assets', title: 'Aset', href: '/finance/assets', icon: <Briefcase className="h-4 w-4" />, category: 'Uang' },
  { key: 'finance_documents', title: 'Dokumen', href: '/finance/documents', icon: <Archive className="h-4 w-4" />, category: 'Uang' },
 
  // Admin & CEO Section
  // Paling atas dengan sengaja: ini satu-satunya layar yang dibuka tiap hari.
  { key: 'admin_hari_ini', title: 'Hari ini', href: '/admin/hari-ini', icon: <PackageCheck className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_dashboard', title: 'Kokpit', href: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_sales_orders', title: 'Pesanan', href: '/admin/sales-orders', icon: <ShoppingCart className="h-4 w-4" />, category: 'Harian' },
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
  { key: 'admin_audit_pengiriman', access: 'admin_sales_orders', title: 'Audit pengiriman', href: '/admin/audit-pengiriman', icon: <Truck className="h-4 w-4" />, category: 'Harian' },
  { key: 'admin_dropship', title: 'Kiriman vendor', href: '/admin/dropship', icon: <Truck className="h-4 w-4" />, category: 'Harian' },
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
  { key: 'tasks_global', title: 'My Tasks', href: '/tasks', icon: <ListChecks className="h-4 w-4" />, category: 'Uang' },
  { key: 'settings_global', title: 'Settings', href: '/settings/profile', icon: <Cog className="h-4 w-4" />, category: 'Uang' },
];

export const getNavItemsForUser = (permissions: AccessKey[]) => {
  return APP_PAGES.filter(page => permissions.includes(page.access || page.key));
};
