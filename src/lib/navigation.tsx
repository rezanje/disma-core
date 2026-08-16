import { 
  BarChart3, Landmark, Wallet, Layers, FileSpreadsheet, 
  ArrowRightLeft, FileText, Banknote, ShoppingBag, 
  Package, LayoutDashboard, Truck, Inbox, 
  ArrowUpToLine, ShieldCheck, ShoppingCart, Users, 
  Boxes, FileDigit, Briefcase, Target, Shield, 
  Search, ScrollText, CheckCircle2, History, Archive,
  Receipt, Landmark as Bank, UserPlus, Cog, ListChecks, RefreshCw, TrendingDown, AlertTriangle, ClipboardList, MapPin
} from "lucide-react"
import { AccessKey } from "@/types"

export interface NavItemConfig {
  key: AccessKey;
  title: string;
  href: string;
  icon: React.ReactNode;
  category: 'Admin' | 'Finance' | 'Warehouse' | 'Sourcing' | 'Courier' | 'Global';
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
  { key: 'finance_dashboard', title: 'Finance Dashboard', href: '/finance', icon: <BarChart3 className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_daily_close', title: 'Tutup Hari', href: '/finance/daily-close', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, category: 'Finance' },
  { key: 'finance_purchase_plan', title: 'Rencana Pembelian', href: '/finance/purchase-plan', icon: <ClipboardList className="h-4 w-4 text-amber-500" />, category: 'Finance' },
  { key: 'finance_disbursements', title: 'Disbursement (Kas Pindah)', href: '/finance/disbursements', icon: <ArrowRightLeft className="h-4 w-4 text-blue-500" />, category: 'Finance' },
  { key: 'finance_sourcing_monitor', title: 'Pantau Harian Sourcing', href: '/finance/sourcing-monitor', icon: <Banknote className="h-4 w-4 text-violet-500" />, category: 'Finance' },
  { 
    key: 'finance_approvals', 
    title: 'Finance Hub', 
    href: '/finance/approvals', 
    icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />, 
    category: 'Finance',
    children: [
      // Nama tab harus persis sama dengan value TabsTrigger di halaman approvals
      // (settlement / audit_online / audit_ops_lain / delivery). Tab yang tidak
      // dikenali membuat isi halaman kosong tanpa pesan apa pun.
      { key: 'finance_settlement', title: 'Sourcing Settlement', href: '/finance/approvals?tab=settlement' },
      { key: 'finance_settlement_dash', title: 'Dashboard Settlement', href: '/finance/approvals/sourcing-settlement' },
      { key: 'finance_audit', title: 'Audit Ops', href: '/finance/approvals?tab=audit_ops_lain' },
      { key: 'finance_online_audit', title: 'Audit Belanja Online', href: '/finance/approvals?tab=audit_online' },
      { key: 'finance_delivery', title: 'Audit Delivery', href: '/finance/approvals?tab=delivery' },
    ]
  },
  { key: 'finance_rekon', title: 'Rekonsiliasi', href: '/finance/reconciliation', icon: <RefreshCw className="h-4 w-4 text-amber-500" />, category: 'Finance' },
  { key: 'finance_reimbursements', title: 'Reimbursement', href: '/finance/reimbursements', icon: <Receipt className="h-4 w-4 text-blue-500" />, category: 'Finance' },
  { key: 'finance_cash_bank', title: 'Cash & Bank', href: '/finance/cash-bank', icon: <Bank className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_expenses', title: 'Pengeluaran Umum', href: '/finance/expenses', icon: <TrendingDown className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_reports', title: 'Financial Reports', href: '/finance/reports', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_sku_pnl', title: 'Untung Rugi per SKU', href: '/finance/sku-pnl', icon: <BarChart3 className="h-4 w-4 text-emerald-500" />, category: 'Finance' },
  { key: 'finance_invoices', title: 'Invoices (AR/AP)', href: '/finance/invoices', icon: <ScrollText className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_collections', title: 'AR Collections', href: '/finance/collections', icon: <History className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_ar_aging', title: 'AR Aging (Piutang)', href: '/finance/ar-aging', icon: <AlertTriangle className="h-4 w-4 text-rose-500" />, category: 'Finance' },
  { key: 'finance_ap_aging', title: 'AP Aging (Hutang)', href: '/finance/ap-aging', icon: <ClipboardList className="h-4 w-4 text-purple-500" />, category: 'Finance' },
  { key: 'finance_ledger', title: 'General Ledger', href: '/finance/ledger', icon: <ArrowRightLeft className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_online_purchase', title: 'Online Purchase', href: '/finance/online-purchase', icon: <ShoppingBag className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_assets', title: 'Asset Audit', href: '/finance/assets', icon: <Briefcase className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_documents', title: 'Dokumen & Arsip', href: '/finance/documents', icon: <Archive className="h-4 w-4 text-emerald-500" />, category: 'Finance' },
 
  // Admin & CEO Section
  { key: 'admin_dashboard', title: 'Dashboard Admin', href: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_sales_orders', title: 'Sales orders (PO)', href: '/admin/sales-orders', icon: <ShoppingCart className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_tukar_faktur', title: 'Tukar Faktur', href: '/admin/tukar-faktur', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_purchase_requests', title: 'Purchase Requests', href: '/admin/purchase-requests', icon: <ClipboardList className="h-4 w-4 text-emerald-500" />, category: 'Admin' },
  { key: 'admin_clients', title: 'Client Management', href: '/admin/clients', icon: <Users className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_price_lists', title: 'Price Lists', href: '/admin/client-prices', icon: <Banknote className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_products', title: 'Produk/SKU Master', href: '/admin/products', icon: <Boxes className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_vendors', title: 'Vendor Management', href: '/admin/vendors', icon: <Truck className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_shopping_list', title: 'Shopping List', href: '/admin/shopping-list', icon: <ListChecks className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_dropship', title: 'Kiriman Vendor', href: '/admin/dropship', icon: <Truck className="h-4 w-4 text-orange-500" />, category: 'Admin' },
  { key: 'admin_delivery_routes', title: 'Rencana Rute', href: '/admin/delivery-routes', icon: <MapPin className="h-4 w-4 text-sky-500" />, category: 'Admin' },
  { key: 'admin_crm', title: 'CRM & Pipeline', href: '/admin/crm', icon: <Target className="h-4 w-4" />, category: 'Admin' },
  { 
    key: 'admin_users', 
    title: 'User Management', 
    href: '/admin/users', 
    icon: <Shield className="h-4 w-4" />, 
    category: 'Admin',
    children: [
      { key: 'users_perms', title: 'Izin & Otoritas', href: '/admin/users?tab=roles' },
    ]
  },
  { key: 'admin_settings', title: 'System Settings', href: '/admin/settings', icon: <Cog className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_activity_log', title: 'Activity Log', href: '/admin/activity-log', icon: <History className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_loss_analytics', title: 'Analisa Kerugian & Stok', href: '/admin/loss-analytics', icon: <TrendingDown className="h-4 w-4 text-rose-500" />, category: 'Admin' },

  // ==========================================
  // PARKED MODULES (SECONDARY)
  // ==========================================

  // Warehouse
  { key: 'warehouse_dashboard', title: 'WH Dashboard', href: '/warehouse', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_catalog', title: 'Stock Catalog', href: '/warehouse/catalog', icon: <Boxes className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_inbound', title: 'Goods Inbound', href: '/warehouse/inbound', icon: <Inbox className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_outbound', title: 'Goods Outbound', href: '/warehouse/outbound', icon: <ArrowUpToLine className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_qc', title: 'Quality Control', href: '/warehouse/qc', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_reject_monitor', title: 'Rejection Monitor', href: '/warehouse/reject-monitor', icon: <Archive className="h-4 w-4 text-rose-500" />, category: 'Warehouse' },
  { key: 'warehouse_opname', title: 'Stock Opname', href: '/warehouse/opname', icon: <RefreshCw className="h-4 w-4" />, category: 'Warehouse' },

  // Sourcing
  { 
    key: 'sourcing_dashboard',
    title: 'Sourcing Home',
    // Menunjuk ke /sourcing, bukan ke /sourcing/list. Dulu induk dan anaknya
    // membuka halaman yang sama persis — dua menu satu layar — sementara ringkasan
    // sourcing di /sourcing (tempat orang sourcing mendarat setelah login) tidak
    // punya menu sama sekali.
    href: '/sourcing',
    icon: <Search className="h-4 w-4 opacity-50" />, 
    category: 'Sourcing',
    children: [
      { key: 'sourcing_list', title: 'Shopping List', href: '/sourcing/list' },
      { key: 'sourcing_expenses', title: 'Biaya Operasional', href: '/sourcing/expenses' },
    ]
  },

  // Courier
  { key: 'courier_dashboard', title: 'Logistics Home', href: '/courier', icon: <Truck className="h-4 w-4 opacity-50" />, category: 'Courier' },
  { key: 'courier_list', title: 'Delivery List', href: '/courier/list', icon: <ListChecks className="h-4 w-4 opacity-50" />, category: 'Courier' },
  { key: 'courier_handover', title: 'Handover Docs', href: '/courier/handover', icon: <FileDigit className="h-4 w-4 opacity-50" />, category: 'Courier' },
  { key: 'courier_history', title: 'Delivery History', href: '/courier/history', icon: <History className="h-4 w-4 opacity-50" />, category: 'Courier' },
  { key: 'courier_expenses', title: 'Operational Exp.', href: '/courier/expenses', icon: <Receipt className="h-4 w-4 opacity-50" />, category: 'Courier' },

  // Global
  { key: 'tasks_global', title: 'My Tasks', href: '/tasks', icon: <ListChecks className="h-4 w-4" />, category: 'Global' },
  { key: 'settings_global', title: 'Settings', href: '/settings/profile', icon: <Cog className="h-4 w-4" />, category: 'Global' },
];

export const getNavItemsForUser = (permissions: AccessKey[]) => {
  return APP_PAGES.filter(page => permissions.includes(page.key));
};
