import { 
  BarChart3, Landmark, Wallet, Layers, FileSpreadsheet, 
  ArrowRightLeft, FileText, Banknote, ShoppingBag, 
  Package, LayoutDashboard, Truck, Inbox, 
  ArrowUpToLine, ShieldCheck, ShoppingCart, Users, 
  Boxes, FileDigit, Briefcase, Target, Shield, 
  Search, ScrollText, CheckCircle2, History, Archive,
  Receipt, Landmark as Bank, UserPlus, Cog, ListChecks, RefreshCw
} from "lucide-react"
import { AccessKey } from "@/types"

export interface NavItemConfig {
  key: AccessKey;
  title: string;
  href: string;
  icon: React.ReactNode;
  category: 'Admin' | 'Finance' | 'Warehouse' | 'Sourcing' | 'Courier' | 'Global';
}

export const APP_PAGES: NavItemConfig[] = [
  // Admin & CEO
  { key: 'admin_dashboard', title: 'Dashboard Admin', href: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Admin' },

  { key: 'admin_vendors', title: 'Vendor Management', href: '/admin/vendors', icon: <Truck className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_clients', title: 'Client Management', href: '/admin/clients', icon: <Users className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_products', title: 'Produk/SKU Master', href: '/admin/products', icon: <Boxes className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_sales_orders', title: 'Sales orders (PO)', href: '/admin/sales-orders', icon: <ShoppingCart className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_shopping_list', title: 'Shopping List', href: '/admin/shopping-list', icon: <ListChecks className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_assets', title: 'Asset Management', href: '/admin/assets', icon: <Briefcase className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_hr', title: 'HR & Personalia', href: '/admin/hr', icon: <Users className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_crm', title: 'CRM & Pipeline', href: '/admin/crm', icon: <Target className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_documents', title: 'Document Vault', href: '/admin/documents', icon: <FileText className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_okr', title: 'OKR Manager', href: '/admin/okr', icon: <Target className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_users', title: 'User Management', href: '/admin/users', icon: <Shield className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_settings', title: 'System Settings', href: '/admin/settings', icon: <Cog className="h-4 w-4" />, category: 'Admin' },
  { key: 'admin_tasks', title: 'Admin Tasks', href: '/admin/tasks', icon: <ListChecks className="h-4 w-4" />, category: 'Admin' },

  // Finance
  { key: 'finance_dashboard', title: 'Finance Dashboard', href: '/finance', icon: <BarChart3 className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_approvals', title: 'Finance Hub', href: '/finance/approvals', icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />, category: 'Finance' },
  { key: 'finance_cash_bank', title: 'Cash & Bank', href: '/finance/cash-bank', icon: <Bank className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_reports', title: 'Financial Reports', href: '/finance/reports', icon: <FileSpreadsheet className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_invoices', title: 'Invoices (AR/AP)', href: '/finance/invoices', icon: <ScrollText className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_ledger', title: 'General Ledger', href: '/finance/ledger', icon: <ArrowRightLeft className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_online_purchase', title: 'Online Purchase', href: '/finance/online-purchase', icon: <ShoppingBag className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_assets', title: 'Asset Audit', href: '/finance/assets', icon: <Briefcase className="h-4 w-4" />, category: 'Finance' },
  { key: 'finance_documents', title: 'Dokumen & Arsip', href: '/finance/documents', icon: <Archive className="h-4 w-4 text-emerald-500" />, category: 'Finance' },

  // Warehouse
  { key: 'warehouse_dashboard', title: 'WH Dashboard', href: '/warehouse', icon: <LayoutDashboard className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_catalog', title: 'Stock Catalog', href: '/warehouse/catalog', icon: <Boxes className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_inbound', title: 'Goods Inbound', href: '/warehouse/inbound', icon: <Inbox className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_outbound', title: 'Goods Outbound', href: '/warehouse/outbound', icon: <ArrowUpToLine className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_qc', title: 'Quality Control', href: '/warehouse/qc', icon: <CheckCircle2 className="h-4 w-4" />, category: 'Warehouse' },
  { key: 'warehouse_reject_monitor', title: 'Rejection Monitor', href: '/warehouse/reject-monitor', icon: <Archive className="h-4 w-4 text-rose-500" />, category: 'Warehouse' },

  // Sourcing
  { key: 'sourcing_dashboard', title: 'Sourcing Home', href: '/sourcing', icon: <Search className="h-4 w-4" />, category: 'Sourcing' },
  { key: 'sourcing_list', title: 'Shopping List', href: '/sourcing/list', icon: <ListChecks className="h-4 w-4" />, category: 'Sourcing' },

  // Courier
  { key: 'courier_dashboard', title: 'Logistics Home', href: '/courier', icon: <Truck className="h-4 w-4" />, category: 'Courier' },
  { key: 'courier_list', title: 'Delivery List', href: '/courier/list', icon: <ListChecks className="h-4 w-4" />, category: 'Courier' },
  { key: 'courier_handover', title: 'Handover Docs', href: '/courier/handover', icon: <FileDigit className="h-4 w-4" />, category: 'Courier' },
  { key: 'courier_history', title: 'Delivery History', href: '/courier/history', icon: <History className="h-4 w-4" />, category: 'Courier' },
  { key: 'courier_expenses', title: 'Operational Exp.', href: '/courier/expenses', icon: <Receipt className="h-4 w-4" />, category: 'Courier' },

  // Global
  { key: 'tasks_global', title: 'My Tasks', href: '/tasks', icon: <ListChecks className="h-4 w-4" />, category: 'Global' },
  { key: 'settings_global', title: 'Settings', href: '/settings', icon: <Cog className="h-4 w-4" />, category: 'Global' },
];

export const getNavItemsForUser = (permissions: AccessKey[]) => {
  return APP_PAGES.filter(page => permissions.includes(page.key));
};
