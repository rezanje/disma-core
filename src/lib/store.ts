import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Client, Product, SalesOrder, SalesOrderItem, Purchase, 
  PurchaseItem, Delivery, Invoice, ChartOfAccount, JournalEntry, 
  JournalLine, OperationalExpense, User, Vendor, Role, Lead, Announcement, AppTask, AppNotification,
  BankAccount, CashTransaction, Reimbursement, FixedAsset,
  Employee, SmartKpi, OkrObjective, RolePermissionMap, AccessKey, PendingReturn
} from '@/types';
import { COA_SEED, CLIENTS_SEED, VENDORS_SEED, MOCK_USERS, KPI_SEED } from './constants';
import { PRODUCTS_SEED } from './products_seed';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

export interface NavItemConfig {
  order: string[] // List of item titles in order
  hidden: string[] // List of item keys that are hidden
  enabled?: boolean // Only for mobile
}

export interface RoleNavConfig {
  desktop: NavItemConfig
  mobile: NavItemConfig
}

interface AppState {
  // Auth
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  users: User[];
  addUser: (user: User) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  
  // Storage
  isSyncing: boolean;
  init: () => Promise<void>;
  saveToHdd: () => Promise<void>;
  syncTable: (table: string, data: any) => Promise<void>;

  // Sidebar State
  isSidebarMinimized: boolean;
  toggleSidebar: () => void;

  // Master Data
  clients: Client[];
  addClient: (client: Client) => void;
  updateClient: (id: string, data: Partial<Client>) => void;
  
  vendors: Vendor[];
  addVendor: (vendor: Vendor) => void;
  updateVendor: (id: string, data: Partial<Vendor>) => void;
  
  products: Product[];
  addProduct: (product: Product) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  
  coas: ChartOfAccount[];
  addCoa: (coa: ChartOfAccount) => void;

  // Operational Data
  salesOrders: SalesOrder[];
  addSalesOrder: (so: SalesOrder) => void;
  updateSalesOrder: (id: string, data: Partial<SalesOrder>) => void;

  salesOrderItems: SalesOrderItem[];
  addSalesOrderItem: (item: SalesOrderItem) => void;
  addSalesOrderItems: (items: SalesOrderItem[]) => void;
  updateSalesOrderItem: (id: string, data: Partial<SalesOrderItem>) => void;

  purchases: Purchase[];
  addPurchase: (p: Purchase) => void;
  updatePurchase: (id: string, data: Partial<Purchase>) => void;

  purchaseItems: PurchaseItem[];
  addPurchaseItem: (item: PurchaseItem) => void;
  updatePurchaseItem: (id: string, data: Partial<PurchaseItem>) => void;

  deliveries: Delivery[];
  addDelivery: (d: Delivery) => void;
  updateDelivery: (id: string, data: Partial<Delivery>) => void;

  expenses: OperationalExpense[];
  addExpense: (e: OperationalExpense) => void;
  updateExpense: (id: string, data: Partial<OperationalExpense>) => void;

  // Finance/Accounting Data
  invoices: Invoice[];
  addInvoice: (inv: Invoice) => void;
  updateInvoice: (id: string, data: Partial<Invoice>) => void;

  journalEntries: JournalEntry[];
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>, newLines: JournalLine[]) => void;

  journalLines: JournalLine[];
  addJournalLine: (line: JournalLine) => void;

  leads: Lead[];
  announcement: Announcement | null;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  updateAnnouncement: (announcement: Announcement | null) => void;

  // Task Tracker
  tasks: AppTask[];
  addTask: (task: AppTask) => void;
  updateTask: (id: string, data: Partial<AppTask>) => void;
  deleteTask: (id: string) => void;
  
  // Notifications
  notifications: AppNotification[];
  addNotification: (n: AppNotification) => void;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  
  // HR & KPI
  employees: Employee[];
  addEmployee: (emp: Employee) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  
  kpiObjectives: SmartKpi[];
  addKpi: (kpi: SmartKpi) => void;
  updateKpi: (id: string, data: Partial<SmartKpi>) => void;
  deleteKpi: (id: string) => void;
  
  // OKR Framework
  okrObjectives: OkrObjective[];
  addOkr: (okr: OkrObjective) => void;
  updateOkr: (id: string, data: Partial<OkrObjective>) => void;
  
  fixedAssets: FixedAsset[];
  addFixedAsset: (asset: FixedAsset) => void;
  updateFixedAsset: (id: string, updates: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;

  // Bank & Cash
  bankAccounts: BankAccount[];
  addBankAccount: (acc: BankAccount) => void;
  updateBankAccount: (id: string, data: Partial<BankAccount>) => void;
  updateBankBalance: (id: string, amount: number) => void;
  cashTransactions: CashTransaction[];
  addCashTransaction: (tx: CashTransaction) => void;

  // Reimbursements
  reimbursements: Reimbursement[];
  addReimbursement: (r: Reimbursement) => void;
  updateReimbursement: (id: string, data: Partial<Reimbursement>) => void;

  // Navigation Config
  navConfigs: Record<string, RoleNavConfig>;
  updateNavConfig: (role: string, config: RoleNavConfig) => void;

  // App Permissions (Dynamic Role Access Control)
  rolePermissions: RolePermissionMap;
  updateRolePermissions: (role: string, keys: AccessKey[]) => void;

  // Returns & Rejections
  pendingReturns: PendingReturn[];
  addPendingReturn: (ret: PendingReturn) => void;
  removePendingReturn: (id: string) => void;

  // Helpers
  resetDb: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  getHistoricalClientPrice: (clientId: string, productId: string) => number | undefined;
  
  // Dev & Simulation Helpers
  devHistorySnapshot: AppState | null;
  takeDevSnapshot: () => void;
  undoDevSnapshot: () => void;
}


const initialCOAs: ChartOfAccount[] = [
  // 1-XXXX ASSETS
  { id: 'coa-1', accountCode: '1-1000', accountName: 'Kas di Tangan (Petty Cash)', accountType: 'Asset' },
  { id: 'coa-1-2', accountCode: '1-1200', accountName: 'Bank BCA - Utama', accountType: 'Asset' },
  { id: 'coa-1-3', accountCode: '1-1300', accountName: 'Bank Mandiri - Operasional', accountType: 'Asset' },
  { id: 'coa-1-5', accountCode: '1-1500', accountName: 'Uang Muka Karyawan (Advance)', accountType: 'Asset' },
  { id: 'coa-2', accountCode: '1-2000', accountName: 'Piutang Usaha (Klien)', accountType: 'Asset' },
  { id: 'coa-3', accountCode: '1-3000', accountName: 'Persediaan Barang Dagang', accountType: 'Asset' },
  { id: 'coa-4', accountCode: '1-4000', accountName: 'Aset Tetap (Kendaraan/Alat)', accountType: 'Asset' },
  { id: 'coa-5', accountCode: '1-4999', accountName: 'Akumulasi Penyusutan Aset', accountType: 'Asset' },
  
  // 2-XXXX LIABILITIES
  { id: 'coa-10', accountCode: '2-1000', accountName: 'Utang Usaha (Vendor)', accountType: 'Liability' },
  { id: 'coa-10-2', accountCode: '2-2000', accountName: 'Utang Gaji & Honor', accountType: 'Liability' },
  { id: 'coa-10-3', accountCode: '2-3000', accountName: 'Utang Pajak (PPN/PPh)', accountType: 'Liability' },
  
  // 3-XXXX EQUITY
  { id: 'coa-11', accountCode: '3-1000', accountName: 'Modal Pemilik (Owner Capital)', accountType: 'Equity' },
  { id: 'coa-11-2', accountCode: '3-2000', accountName: 'Prive / Penarikan Pribadi', accountType: 'Equity' },
  
  // 4-XXXX REVENUE
  { id: 'coa-12', accountCode: '4-1000', accountName: 'Pendapatan Penjualan Produk', accountType: 'Revenue' },
  { id: 'coa-12-2', accountCode: '4-2000', accountName: 'Pendapatan Lain-lain', accountType: 'Revenue' },
  
  // 5-XXXX COST OF SALES
  { id: 'coa-13', accountCode: '5-1000', accountName: 'Harga Pokok Penjualan (HPP)', accountType: 'Expense' },
  { id: 'coa-14', accountCode: '5-2000', accountName: 'Beban Kerusakan/Retur Barang', accountType: 'Expense' },
  
  // 6-XXXX OPERATIONAL EXPENSES
  { id: 'coa-15', accountCode: '6-1000', accountName: 'Beban Gaji & Tunjangan', accountType: 'Expense' },
  { id: 'coa-15-2', accountCode: '6-1100', accountName: 'Beban Sewa Gedung/Workshop', accountType: 'Expense' },
  { id: 'coa-9-2', accountCode: '6-1200', accountName: 'Beban Listrik, Air & Internet', accountType: 'Expense' },
  { id: 'coa-9-3', accountCode: '6-1300', accountName: 'Beban Marketing & Iklan', accountType: 'Expense' },
  { id: 'coa-9-4', accountCode: '6-1400', accountName: 'Beban Transportasi & BBM', accountType: 'Expense' },
  { id: 'coa-9-5', accountCode: '6-1500', accountName: 'Beban ATK & Kantor', accountType: 'Expense' },
  { id: 'coa-9-6', accountCode: '6-1600', accountName: 'Biaya Admin Platform', accountType: 'Expense' },
  { id: 'coa-9-7', accountCode: '6-1700', accountName: 'Ongkos Kirim Pembelian', accountType: 'Expense' },
  { id: 'coa-9-9', accountCode: '6-9000', accountName: 'Beban Operasional Lainnya', accountType: 'Expense' },
  { id: 'coa-16', accountCode: '6-2000', accountName: 'Beban Penyusutan Aset', accountType: 'Expense' },
];

const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank-1', name: 'BCA (Utama)', accountNumber: '8001234455', accountCode: '1-1200', balance: 0 },
  { id: 'bank-2', name: 'Mandiri (Ops)', accountNumber: '123000998877', accountCode: '1-1300', balance: 0 },
  { id: 'bank-3', name: 'BRI (Simpanan)', accountNumber: '001122334455', accountCode: '1-1000', balance: 0 },
  { id: 'bank-4', name: 'Petty Cash', accountCode: '1-1000', balance: 0 },
  { id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', accountCode: '1-1500', balance: 0 }
];

const initialRolePermissions: RolePermissionMap = {
  super_admin: [],
  ceo: [],
  cmo: [],
  finance: ['finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices', 'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'tasks_global'],
  gudang: ['warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'tasks_global'],
  sourcing: ['sourcing_dashboard', 'sourcing_list', 'sourcing_expenses', 'tasks_global'],
  kurir: ['courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses', 'tasks_global'],
  admin_po: ['admin_dashboard', 'admin_sales_orders', 'admin_shopping_list', 'admin_clients', 'admin_products', 'warehouse_catalog', 'tasks_global'],
};

export const useAppStore = create<AppState>((set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      users: MOCK_USERS,
      rolePermissions: initialRolePermissions,
      navConfigs: {},
      addUser: async (user) => {
        set((state) => ({ users: [...state.users, user] }));
        await get().syncTable('users', user);
      },
      updateUser: async (id, data) => {
        set((state) => ({
          users: state.users.map(u => u.id === id ? { ...u, ...data } : u)
        }));
        const updated = get().users.find(u => u.id === id);
        if (updated) await get().syncTable('users', updated);
      },

      isSyncing: false,
      
      syncTable: async (table: string, data: any) => {
        set({ isSyncing: true });
        try {
          const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data })
          });
          if (!res.ok) throw new Error(`Sync failed for ${table}`);
        } catch (error) {
          console.error(`Sync Error (${table}):`, error);
        } finally {
          set({ isSyncing: false });
        }
      },

      init: async () => {
        try {
          const res = await fetch('/api/db?ts=' + Date.now(), { cache: 'no-store' });
          const data = await res.json();
          if (data && !data.error) {
            if (Object.keys(data).length === 0) return;

            const mergedCoas = [...initialCOAs];
            if (data.coas && Array.isArray(data.coas)) {
              data.coas.forEach((c: ChartOfAccount) => {
                const exists = mergedCoas.find(orig => orig.accountCode === c.accountCode);
                if (!exists) mergedCoas.push(c);
              });
            }

            const mergedPermissions = { ...initialRolePermissions };
            if (data.rolePermissions && typeof data.rolePermissions === 'object') {
              Object.keys(data.rolePermissions).forEach((role) => {
                mergedPermissions[role] = Array.from(new Set([
                  ...(mergedPermissions[role] || []),
                  ...(data.rolePermissions[role] || [])
                ]));
              });
            }

            let mergedBanks = data.bankAccounts && data.bankAccounts.length > 0 ? [...data.bankAccounts] : INITIAL_BANK_ACCOUNTS;
            
            set({ 
              ...data, 
              coas: mergedCoas, 
              rolePermissions: mergedPermissions,
              bankAccounts: mergedBanks,
              navConfigs: data.navConfigs || {},
              kpiObjectives: (data.kpiObjectives && data.kpiObjectives.length > 0) ? data.kpiObjectives : KPI_SEED
            });
          }
        } catch (error) {
          console.error('Store Init Error:', error);
        }
      },

      saveToHdd: async () => {
        const state = get();
        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: state.navConfigs,
          role_permissions: state.rolePermissions
        });
      },

      isSidebarMinimized: false,
      toggleSidebar: () => set((state) => ({ isSidebarMinimized: !state.isSidebarMinimized })),

      clients: CLIENTS_SEED,
      addClient: async (client) => {
        set((state) => ({ clients: [...state.clients, client] }));
        await get().syncTable('clients', client);
      },
      updateClient: async (id, data) => {
        set((state) => ({
          clients: state.clients.map(c => c.id === id ? { ...c, ...data } : c)
        }));
        const updated = get().clients.find(c => c.id === id);
        if (updated) await get().syncTable('clients', updated);
      },

      vendors: VENDORS_SEED,
      addVendor: async (vendor) => {
        set((state) => ({ vendors: [...state.vendors, vendor] }));
        await get().syncTable('vendors', vendor);
      },
      updateVendor: async (id, data) => {
        set((state) => ({
          vendors: state.vendors.map(v => v.id === id ? { ...v, ...data } : v)
        }));
        const updated = get().vendors.find(v => v.id === id);
        if (updated) await get().syncTable('vendors', updated);
      },

      products: PRODUCTS_SEED,
      addProduct: async (product) => {
        set((state) => ({ products: [...state.products, product] }));
        await get().syncTable('products', product);
      },
      updateProduct: async (id, data) => {
        set((state) => ({
          products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
        }));
        const updated = get().products.find(p => p.id === id);
        if (updated) await get().syncTable('products', updated);
      },

      coas: COA_SEED,
      addCoa: async (coa) => {
        set((state) => ({ coas: [...state.coas, coa] }));
        await get().syncTable('coas', coa);
      },

      salesOrders: [],
      addSalesOrder: async (so) => {
        set((state) => ({ salesOrders: [...state.salesOrders, so] }));
        await get().syncTable('sales_orders', so);
      },
      updateSalesOrder: async (id, data) => {
        set((state) => ({
          salesOrders: state.salesOrders.map(so => so.id === id ? { ...so, ...data } : so)
        }));
        const updated = get().salesOrders.find(so => so.id === id);
        if (updated) await get().syncTable('sales_orders', updated);
      },

      salesOrderItems: [],
      addSalesOrderItem: async (item) => {
        set((state) => ({ salesOrderItems: [...state.salesOrderItems, item] }));
        await get().syncTable('sales_order_items', item);
      },
      addSalesOrderItems: async (items: SalesOrderItem[]) => {
        set((state) => ({ salesOrderItems: [...state.salesOrderItems, ...items] }));
        await get().syncTable('sales_order_items', items);
      },
      updateSalesOrderItem: async (id, data) => {
        set((state) => ({
          salesOrderItems: state.salesOrderItems.map(item => item.id === id ? { ...item, ...data } : item)
        }));
        const updated = get().salesOrderItems.find(item => item.id === id);
        if (updated) await get().syncTable('sales_order_items', updated);
      },

      purchases: [],
      addPurchase: async (p) => {
        set((state) => ({ purchases: [...state.purchases, p] }));
        await get().syncTable('purchases', p);
      },
      updatePurchase: async (id, data) => {
        set((state) => ({
          purchases: state.purchases.map(p => p.id === id ? { ...p, ...data } : p)
        }));
        const updated = get().purchases.find(p => p.id === id);
        if (updated) await get().syncTable('purchases', updated);
      },

      purchaseItems: [],
      addPurchaseItem: async (item) => {
        set((state) => ({ purchaseItems: [...state.purchaseItems, item] }));
        await get().syncTable('purchase_items', item);
      },
      updatePurchaseItem: async (id, data) => {
        set((state) => ({
          purchaseItems: state.purchaseItems.map(pi => pi.id === id ? { ...pi, ...data } : pi)
        }));
        const updated = get().purchaseItems.find(pi => pi.id === id);
        if (updated) await get().syncTable('purchase_items', updated);
      },

      deliveries: [],
      addDelivery: async (d) => {
        set((state) => ({ deliveries: [...state.deliveries, d] }));
        await get().syncTable('deliveries', d);
      },
      updateDelivery: async (id, data) => {
        set((state) => ({
          deliveries: state.deliveries.map(d => d.id === id ? { ...d, ...data } : d)
        }));
        const updated = get().deliveries.find(d => d.id === id);
        if (updated) await get().syncTable('deliveries', updated);
      },

      expenses: [],
      addExpense: async (e) => {
        set((state) => ({ expenses: [...state.expenses, e] }));
        await get().syncTable('expenses', e);
      },
      updateExpense: async (id, data) => {
        set((state) => ({
          expenses: state.expenses.map(e => e.id === id ? { ...e, ...data } : e)
        }));
        const updated = get().expenses.find(e => e.id === id);
        if (updated) await get().syncTable('expenses', updated);
      },

      invoices: [],
      addInvoice: async (inv) => {
        set((state) => ({ invoices: [...state.invoices, inv] }));
        await get().syncTable('invoices', inv);
      },
      updateInvoice: async (id, data) => {
        set((state) => ({
          invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...data } : inv)
        }));
        const updated = get().invoices.find(inv => inv.id === id);
        if (updated) await get().syncTable('invoices', updated);
      },

      journalEntries: [],
      addJournalEntry: async (entry) => {
        set((state) => ({ journalEntries: [...state.journalEntries, entry] }));
        await get().syncTable('journal_entries', entry);
      },
      updateJournalEntry: async (id: string, updates: Partial<JournalEntry>, newLines: JournalLine[]) => {
        set((state) => ({
          journalEntries: state.journalEntries.map(e => e.id === id ? { ...e, ...updates } : e),
          journalLines: [
            ...state.journalLines.filter(l => l.journalEntryId !== id),
            ...newLines
          ]
        }));
        const updatedEntry = get().journalEntries.find(e => e.id === id);
        if (updatedEntry) await get().syncTable('journal_entries', updatedEntry);
        await get().syncTable('journal_lines', newLines);
      },

      journalLines: [],
      addJournalLine: async (line) => {
        set((state) => ({ journalLines: [...state.journalLines, line] }));
        await get().syncTable('journal_lines', line);
      },

      leads: [],
      announcement: {
        message: "Selamat Datang di DISMA CORE Relational! Sistem kini berjalan di atas database performa tinggi. 🚀",
        active: true,
        timestamp: new Date().toISOString()
      },
      addLead: async (lead) => {
        set((state) => ({ leads: [...state.leads, lead] }));
        await get().syncTable('leads', lead);
      },
      updateLead: async (id, updates) => {
        set((state) => ({
          leads: state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        }));
        const updated = get().leads.find(l => l.id === id);
        if (updated) await get().syncTable('leads', updated);
      },
      updateAnnouncement: (announcement) => set({ announcement }),

      tasks: [],
      addTask: async (task) => {
        set((state) => ({ tasks: [...state.tasks, task] }));
        await get().syncTable('disma_tasks', task);
      },
      updateTask: async (id, data) => {
        set((state) => ({
          tasks: state.tasks.map(t => t.id === id ? { ...t, ...data } : t)
        }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) await get().syncTable('disma_tasks', updated);
      },
      deleteTask: async (id) => {
        set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }));
      },
      
      notifications: [],
      addNotification: async (n) => {
        set((state) => ({ notifications: [n, ...state.notifications] }));
        await get().syncTable('notifications', n);
      },
      markNotificationRead: async (id: string) => {
        set((state) => ({
          notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
        }));
        const updated = get().notifications.find(n => n.id === id);
        if (updated) await get().syncTable('notifications', updated);
      },
      clearAllNotifications: () => set({ notifications: [] }),

      employees: [],
      addEmployee: async (emp) => {
        set((state) => ({ employees: [...state.employees, emp] }));
        await get().syncTable('employees', emp);
      },
      updateEmployee: async (id, data) => {
        set((state) => ({
          employees: state.employees.map(e => e.id === id ? { ...e, ...data } : e)
        }));
        const updated = get().employees.find(e => e.id === id);
        if (updated) await get().syncTable('employees', updated);
      },
      
      kpiObjectives: KPI_SEED,
      addKpi: async (kpi) => {
        set((state) => ({ kpiObjectives: [...state.kpiObjectives, kpi] }));
        await get().syncTable('kpis', kpi);
      },
      updateKpi: async (id, data) => {
        set((state) => ({
          kpiObjectives: state.kpiObjectives.map(k => k.id === id ? { ...k, ...data } : k)
        }));
        const updated = get().kpiObjectives.find(k => k.id === id);
        if (updated) await get().syncTable('kpis', updated);
      },
      deleteKpi: (id) => set((state) => ({ kpiObjectives: state.kpiObjectives.filter(k => k.id !== id) })),
      
      okrObjectives: [],
      addOkr: async (okr) => {
        set((state) => ({ okrObjectives: [...state.okrObjectives, okr] }));
        await get().syncTable('okr_objectives', okr);
      },
      updateOkr: async (id, data) => {
        set((state) => ({
          okrObjectives: state.okrObjectives.map(o => o.id === id ? { ...o, ...data } : o)
        }));
        const updated = get().okrObjectives.find(o => o.id === id);
        if (updated) await get().syncTable('okr_objectives', updated);
      },

      fixedAssets: [],
      addFixedAsset: async (asset: FixedAsset) => {
        set((state) => ({ fixedAssets: [...state.fixedAssets, asset] }));
        await get().syncTable('fixed_assets', asset);
      },
      updateFixedAsset: async (id: string, updates: Partial<FixedAsset>) => {
        set((state) => ({
          fixedAssets: state.fixedAssets.map(a => a.id === id ? { ...a, ...updates } : a)
        }));
        const updated = get().fixedAssets.find(a => a.id === id);
        if (updated) await get().syncTable('fixed_assets', updated);
      },
      deleteFixedAsset: (id: string) => set((state) => ({ fixedAssets: state.fixedAssets.filter(a => a.id !== id) })),

      bankAccounts: INITIAL_BANK_ACCOUNTS,
      addBankAccount: async (acc) => {
        set((state) => ({ bankAccounts: [...state.bankAccounts, acc] }));
        await get().syncTable('bank_accounts', acc);
      },
      updateBankAccount: async (id: string, data: Partial<BankAccount>) => {
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...data } : b)
        }));
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) await get().syncTable('bank_accounts', updated);
      },
      updateBankBalance: async (id, amount) => {
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, balance: b.balance + amount } : b)
        }));
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) await get().syncTable('bank_accounts', updated);
      },
      cashTransactions: [],
      addCashTransaction: async (tx) => {
        const balanceChange = tx.type === 'In' ? tx.amount : -tx.amount;
        set((state) => {
          const updatedAccounts = state.bankAccounts.map(b => 
            b.id === tx.bankAccountId ? { ...b, balance: b.balance + balanceChange } : b
          );
          return { 
            cashTransactions: [tx, ...state.cashTransactions],
            bankAccounts: updatedAccounts
          }
        });
        await get().syncTable('cash_transactions', tx);
        const updatedAccount = get().bankAccounts.find(b => b.id === tx.bankAccountId);
        if (updatedAccount) await get().syncTable('bank_accounts', updatedAccount);
      },

      reimbursements: [],
      addReimbursement: async (r) => {
        set((state) => ({ reimbursements: [r, ...state.reimbursements] }));
        await get().syncTable('reimbursements', r);
      },
      updateReimbursement: async (id, data) => {
        set((state) => ({
          reimbursements: state.reimbursements.map(r => r.id === id ? { ...r, ...data } : r)
        }));
        const updated = get().reimbursements.find(r => r.id === id);
        if (updated) await get().syncTable('reimbursements', updated);
      },

      updateNavConfig: async (role, config) => {
        set((state) => ({ navConfigs: { ...state.navConfigs, [role]: config } }));
        await get().saveToHdd();
      },

      pendingReturns: [],
      addPendingReturn: async (ret) => {
        set((state) => ({ pendingReturns: [...state.pendingReturns, ret] }));
        await get().syncTable('pending_returns', ret);
      },
      removePendingReturn: (id) => set((state) => ({ pendingReturns: state.pendingReturns.filter(r => r.id !== id) })),

      updateRolePermissions: async (role, keys) => {
        set((state) => ({ 
          rolePermissions: { ...state.rolePermissions, [role]: keys }
        }));
        await get().saveToHdd();
      },

      getHistoricalClientPrice: (clientId, productId) => {
        const state = get();
        const clientSos = state.salesOrders
          .filter(so => so.clientId === clientId && so.status !== 'Batal' && so.status !== 'Pending Approval')
          .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

        for (const so of clientSos) {
          const item = state.salesOrderItems.find(i => i.salesOrderId === so.id && i.productId === productId);
          if (item) return item.unitPrice;
        }
        return undefined;
      },

      devHistorySnapshot: null,
      takeDevSnapshot: () => {
        const state = get();
        const snapshot = { ...state, devHistorySnapshot: null };
        set({ devHistorySnapshot: snapshot });
      },
      undoDevSnapshot: () => {
        const { devHistorySnapshot } = get();
        if (devHistorySnapshot) {
          const { devHistorySnapshot: _, ...restoreData } = devHistorySnapshot;
          set(restoreData);
          toast.success("Undo Berhasil!", { description: "State sebelumnya telah dikembalikan." });
        } else {
          toast.error("Tidak ada history untuk di-undo.");
        }
      },

      resetSimulation: async () => {
        const state = get();
        state.takeDevSnapshot();

        toast.info("Sedang mereset data simulasi...");

        try {
          // 1. WIPE Phase
          toast.info("Menghapus data operasional...");
          let res = await fetch('/api/db/reset', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'wipe', wipeType: 'simulation' }) 
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Gagal Wipe');

          // 2. SEED Phase
          toast.info("Menanam ulang Bank...");
          res = await fetch('/api/db/reset', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'seed',
              seedData: { bank_accounts: INITIAL_BANK_ACCOUNTS }
            }) 
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Gagal Seed');
          
        } catch(e: any) { 
          console.error("Reset fail", e); 
          toast.error("Gagal reset di Server: " + e.message);
          return;
        }

        set({
          salesOrders: [], salesOrderItems: [], purchases: [], purchaseItems: [],
          deliveries: [], expenses: [], invoices: [], journalEntries: [],
          journalLines: [], leads: [], tasks: [], notifications: [],
          pendingReturns: [], reimbursements: [], cashTransactions: [],
          bankAccounts: INITIAL_BANK_ACCOUNTS, fixedAssets: []
        });

        toast.success("Simulation Reset Selesai! Me-reload halaman...");
        setTimeout(() => window.location.reload(), 800);
      },

      resetDb: async () => {
        get().takeDevSnapshot();

        toast.info("Sedang mereset SEMUA data... Mohon tunggu.");

        try {
          // 1. WIPE Phase
          toast.info("Menghapus seluruh database...");
          let res = await fetch('/api/db/reset', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'wipe', wipeType: 'full' }) 
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Gagal Wipe Database');

          // 2. SEED Phase (Chunked)
          const allSeedData = {
            users: MOCK_USERS,
            coas: COA_SEED,
            bank_accounts: INITIAL_BANK_ACCOUNTS,
            vendors: VENDORS_SEED,
            clients: CLIENTS_SEED,
            products: PRODUCTS_SEED
          };

          for (const [table, rows] of Object.entries(allSeedData)) {
            toast.info(`Menanam ulang data: ${table}...`);
            res = await fetch('/api/db/reset', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'seed', seedData: { [table]: rows } }) 
            });
            if (!res.ok) throw new Error((await res.json()).error || `Gagal seed ${table}`);
          }
        } catch(e: any) { 
          console.error("Reset fail", e); 
          toast.error("Gagal reset: " + e.message);
          return;
        }

        // Update local state to match what the server just seeded
        set({
          clients: CLIENTS_SEED, vendors: VENDORS_SEED, products: PRODUCTS_SEED, 
          salesOrders: [], salesOrderItems: [], purchases: [], purchaseItems: [],
          deliveries: [], expenses: [], invoices: [], journalEntries: [],
          journalLines: [], coas: COA_SEED, users: MOCK_USERS, leads: [],
          tasks: [], notifications: [], bankAccounts: INITIAL_BANK_ACCOUNTS,
          cashTransactions: [], reimbursements: [], fixedAssets: []
        });

        toast.success("Database Reset Berhasil! Me-reload halaman...");
        setTimeout(() => window.location.reload(), 1000);
      },
    })
);
