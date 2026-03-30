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

const ALL_KEYS: AccessKey[] = [
  'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products', 
  'admin_sales_orders', 'admin_shopping_list', 'admin_assets', 'admin_hr', 'admin_crm', 
  'admin_documents', 'admin_okr', 'admin_users', 'admin_settings', 'admin_tasks', 'admin_maintenance',
  'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 
  'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices', 
  'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit',
  'warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc',
  'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
  'courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses',
  'tasks_global', 'settings_global'
];

const initialRolePermissions: RolePermissionMap = {
  super_admin: ALL_KEYS,
  ceo: ALL_KEYS,
  cmo: ALL_KEYS,
  finance: ['finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices', 'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'tasks_global'],
  gudang: ['warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'tasks_global'],
  sourcing: ['sourcing_dashboard', 'sourcing_list', 'sourcing_expenses', 'tasks_global'],
  kurir: ['courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses', 'tasks_global'],
  admin_po: ['admin_dashboard', 'admin_sales_orders', 'admin_shopping_list', 'admin_clients', 'admin_products', 'warehouse_catalog', 'tasks_global'],
};

const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank-1', name: 'BCA (Utama)', accountNumber: '8001234455', accountCode: '1-1200', balance: 50000000 },
  { id: 'bank-2', name: 'Mandiri (Ops)', accountNumber: '123000998877', accountCode: '1-1300', balance: 120000000 },
  { id: 'bank-3', name: 'BRI (Simpanan)', accountNumber: '001122334455', accountCode: '1-1000', balance: 75000000 },
  { id: 'bank-4', name: 'Petty Cash', accountCode: '1-1000', balance: 5000000 },
  { id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', accountCode: '1-1500', balance: 0 }
];

export const useAppStore = create<AppState>((set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      users: MOCK_USERS,
      rolePermissions: initialRolePermissions,
      navConfigs: {},
      addUser: (user) => set((state) => ({ users: [...state.users, user] })),
      updateUser: (id, data) => set((state) => ({
        users: state.users.map(u => u.id === id ? { ...u, ...data } : u)
      })),

      isSyncing: false,
      init: async () => {
        try {
          const res = await fetch('/api/db');
          const data = await res.json();
          if (data && !data.error) {
            // Handle cases where DB is completely empty (first time run)
            if (Object.keys(data).length === 0) {
              console.log('Database returns empty state, skip overwriting defaults.');
              return; // Do not overwrite state with empty object. Let saveToHdd eventually populate it with defaults.
            }

            // Merge COAs to ensure mandatory ones exist
            const mergedCoas = [...initialCOAs];
            if (data.coas && Array.isArray(data.coas)) {
              data.coas.forEach((c: ChartOfAccount) => {
                const exists = mergedCoas.find(orig => orig.accountCode === c.accountCode);
                if (!exists) mergedCoas.push(c);
              });
            }
            // Merge rolePermissions to ensure new keys are always present even for old local storage
            const mergedPermissions = { ...initialRolePermissions };
            if (data.rolePermissions && typeof data.rolePermissions === 'object') {
              Object.keys(data.rolePermissions).forEach((role) => {
                mergedPermissions[role] = Array.from(new Set([
                  ...(mergedPermissions[role] || []),
                  ...(data.rolePermissions[role] || [])
                ]));
              });
            }

            // Ensure we don't clear default banks
            let mergedBanks = data.bankAccounts ? [...data.bankAccounts] : get().bankAccounts;
            if (Array.isArray(mergedBanks)) {
               const hasSourcing = mergedBanks.find((b: any) => b.id === 'bank-advance-sourcing');
               if (!hasSourcing) {
                 mergedBanks.push({ id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', accountCode: '1-1500', balance: 0 });
               }
            }

            set({ 
              ...data, 
              coas: mergedCoas, 
              rolePermissions: mergedPermissions,
              bankAccounts: mergedBanks,
              navConfigs: data.navConfigs || {},
              kpiObjectives: (data.kpiObjectives && data.kpiObjectives.length > 0 && data.kpiObjectives[0].assigneeUserId) ? data.kpiObjectives : KPI_SEED
            });
          }
        } catch (error) {
          console.error('Store Init Error:', error);
        }
      },

      saveToHdd: async () => {
        const state = get();
        // Remove functions and transient states before saving
        const { isSyncing, init, saveToHdd, setCurrentUser, addUser, updateUser, ...rest } = state;
        // This is a bit complex as state has many methods. 
        // Better to select specific keys.
        const dataToSave = {
          clients: state.clients,
          vendors: state.vendors,
          products: state.products,
          coas: state.coas,
          salesOrders: state.salesOrders,
          salesOrderItems: state.salesOrderItems,
          purchases: state.purchases,
          purchaseItems: state.purchaseItems,
          deliveries: state.deliveries,
          expenses: state.expenses,
          invoices: state.invoices,
          journalEntries: state.journalEntries,
          journalLines: state.journalLines,
          leads: state.leads,
          announcement: state.announcement,
          tasks: state.tasks,
          notifications: state.notifications,
          users: state.users,
          bankAccounts: state.bankAccounts,
          cashTransactions: state.cashTransactions,
          reimbursements: state.reimbursements,
          navConfigs: state.navConfigs,
          fixedAssets: state.fixedAssets,
          employees: state.employees,
          kpiObjectives: state.kpiObjectives,
          okrObjectives: state.okrObjectives,
          rolePermissions: state.rolePermissions,
        };

        try {
          set({ isSyncing: true });
          await fetch('/api/db', {
            method: 'POST',
            body: JSON.stringify(dataToSave),
            headers: { 'Content-Type': 'application/json' }
          });
        } finally {
          set({ isSyncing: false });
        }
      },
      isSidebarMinimized: false,
      toggleSidebar: () => set((state) => ({ isSidebarMinimized: !state.isSidebarMinimized })),

      clients: CLIENTS_SEED,
      addClient: (client) => set((state) => ({ clients: [...state.clients, client] })),
      updateClient: (id, data) => set((state) => ({
        clients: state.clients.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      vendors: VENDORS_SEED,
      addVendor: (vendor) => set((state) => ({ vendors: [...state.vendors, vendor] })),
      updateVendor: (id, data) => set((state) => ({
        vendors: state.vendors.map(v => v.id === id ? { ...v, ...data } : v)
      })),

      products: PRODUCTS_SEED,
      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      updateProduct: (id, data) => set((state) => ({
        products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
      })),

      coas: COA_SEED, // Initialize with seed data
      addCoa: (coa) => set((state) => ({ coas: [...state.coas, coa] })),

      salesOrders: [],
      addSalesOrder: (so) => set((state) => ({ salesOrders: [...state.salesOrders, so] })),
      updateSalesOrder: (id, data) => set((state) => ({
        salesOrders: state.salesOrders.map(so => so.id === id ? { ...so, ...data } : so)
      })),

      salesOrderItems: [],
      addSalesOrderItem: (item) => set((state) => ({ salesOrderItems: [...state.salesOrderItems, item] })),
      updateSalesOrderItem: (id, data) => set((state) => ({
        salesOrderItems: state.salesOrderItems.map(item => item.id === id ? { ...item, ...data } : item)
      })),

      purchases: [],
      addPurchase: (p) => set((state) => ({ purchases: [...state.purchases, p] })),
      updatePurchase: (id, data) => set((state) => ({
        purchases: state.purchases.map(p => p.id === id ? { ...p, ...data } : p)
      })),

      purchaseItems: [],
      addPurchaseItem: (item) => set((state) => ({ purchaseItems: [...state.purchaseItems, item] })),
      updatePurchaseItem: (id, data) => set((state) => ({
        purchaseItems: state.purchaseItems.map(pi => pi.id === id ? { ...pi, ...data } : pi)
      })),

      deliveries: [],
      addDelivery: (d) => set((state) => ({ deliveries: [...state.deliveries, d] })),
      updateDelivery: (id, data) => set((state) => ({
        deliveries: state.deliveries.map(d => d.id === id ? { ...d, ...data } : d)
      })),

      expenses: [
        { id: 'exp-1', date: new Date().toISOString(), reporterId: 'u4', category: 'Bensin', amount: 50000, description: 'Bensin Motor Kurir', status: 'Pending Audit' },
        { id: 'exp-2', date: new Date().toISOString(), reporterId: 'u2', category: 'Tol', amount: 25000, description: 'Tol JORR Sourcing', status: 'Pending Audit' }
      ],
      addExpense: (e) => set((state) => {
        const newState = { expenses: [...state.expenses, e] };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),
      updateExpense: (id, data) => set((state) => {
        const newState = { expenses: state.expenses.map(e => e.id === id ? { ...e, ...data } : e) };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),

      invoices: [],
      addInvoice: (inv) => set((state) => ({ invoices: [...state.invoices, inv] })),
      updateInvoice: (id, data) => set((state) => ({
        invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...data } : inv)
      })),

      journalEntries: [],
      addJournalEntry: (entry) => set((state) => ({ journalEntries: [...state.journalEntries, entry] })),
      updateJournalEntry: (id: string, updates: Partial<JournalEntry>, newLines: JournalLine[]) => set((state) => ({
        journalEntries: state.journalEntries.map(e => e.id === id ? { ...e, ...updates } : e),
        journalLines: [
          ...state.journalLines.filter(l => l.journalEntryId !== id),
          ...newLines
        ]
      })),

      journalLines: [],
      addJournalLine: (line) => set((state) => ({ journalLines: [...state.journalLines, line] })),

      leads: [],
      announcement: {
        message: "Selamat Datang di DISMA V2! Semua sistem operasional hulu ke hilir sudah online.",
        active: true,
        timestamp: new Date().toISOString()
      },
      addLead: (lead) => set((state) => ({ leads: [...state.leads, lead] })),
      updateLead: (id, updates) => set((state) => ({
        leads: state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
      })),
      updateAnnouncement: (announcement) => set({ announcement }),

      tasks: [],
      addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
      updateTask: (id, data) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, ...data } : t)
      })),
      deleteTask: (id) => set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id)
      })),
      
      notifications: [],
      addNotification: (n) => set((state) => ({ 
        notifications: [n, ...state.notifications] 
      })),
      markNotificationRead: (id: string) => set((state) => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      })),
      clearAllNotifications: () => set({ notifications: [] }),

      employees: [],
      addEmployee: (emp) => set((state) => ({ employees: [...state.employees, emp] })),
      updateEmployee: (id, data) => set((state) => ({
        employees: state.employees.map(e => e.id === id ? { ...e, ...data } : e)
      })),
      
      kpiObjectives: KPI_SEED,
      addKpi: (kpi) => set((state) => {
        const newState = { kpiObjectives: [...state.kpiObjectives, kpi] };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),
      updateKpi: (id, data) => set((state) => {
        const newState = { kpiObjectives: state.kpiObjectives.map(k => k.id === id ? { ...k, ...data } : k) };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),
      deleteKpi: (id) => set((state) => {
        const newState = { kpiObjectives: state.kpiObjectives.filter(k => k.id !== id) };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),
      
      okrObjectives: [],
      addOkr: (okr) => set((state) => ({ okrObjectives: [...state.okrObjectives, okr] })),
      updateOkr: (id, data) => set((state) => ({
        okrObjectives: state.okrObjectives.map(o => o.id === id ? { ...o, ...data } : o)
      })),

      fixedAssets: [],
      addFixedAsset: (asset: FixedAsset) => set((state) => ({ 
        fixedAssets: [...state.fixedAssets, asset] 
      })),
      updateFixedAsset: (id: string, updates: Partial<FixedAsset>) => set((state) => ({
        fixedAssets: state.fixedAssets.map(a => a.id === id ? { ...a, ...updates } : a)
      })),
      deleteFixedAsset: (id: string) => set((state) => ({
        fixedAssets: state.fixedAssets.filter(a => a.id !== id)
      })),

      bankAccounts: INITIAL_BANK_ACCOUNTS,
      addBankAccount: (acc) => set((state) => ({ bankAccounts: [...state.bankAccounts, acc] })),
      updateBankAccount: (id: string, data: Partial<BankAccount>) => set((state) => ({
        bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...data } : b)
      })),
      updateBankBalance: (id, amount) => set((state) => ({
        bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, balance: b.balance + amount } : b)
      })),
      cashTransactions: [],
      addCashTransaction: (tx) => set((state) => {
        // Automatically update bank balance
        const balanceChange = tx.type === 'In' ? tx.amount : -tx.amount;
        const updatedAccounts = state.bankAccounts.map(b => 
          b.id === tx.bankAccountId ? { ...b, balance: b.balance + balanceChange } : b
        );
        return { 
          cashTransactions: [tx, ...state.cashTransactions],
          bankAccounts: updatedAccounts
        }
      }),

      reimbursements: [
        { id: 're-1', date: new Date().toISOString(), userId: 'u4', title: 'Ganti Ban Bocor', amount: 150000, description: 'Ban bocor pas anter ke Bakmie Taat', status: 'Pending' },
        { id: 're-2', date: new Date().toISOString(), userId: 'u2', title: 'Beli ATK Pasar', amount: 75000, description: 'Beli nota & pulpen', status: 'Pending' }
      ],
      addReimbursement: (r) => set((state) => {
        const newState = { reimbursements: [r, ...state.reimbursements] };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),
      updateReimbursement: (id, data) => set((state) => {
        const newState = { reimbursements: state.reimbursements.map(r => r.id === id ? { ...r, ...data } : r) };
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),


      updateNavConfig: (role, config) => set((state) => {
        const newState = { navConfigs: { ...state.navConfigs, [role]: config } };
        // Save to HDD after state update
        setTimeout(() => get().saveToHdd(), 100);
        return newState;
      }),

      pendingReturns: [],
      addPendingReturn: (ret) => set((state) => ({ pendingReturns: [...state.pendingReturns, ret] })),
      removePendingReturn: (id) => set((state) => ({ pendingReturns: state.pendingReturns.filter(r => r.id !== id) })),

      updateRolePermissions: (role, keys) => set((state) => ({ 
        rolePermissions: { ...state.rolePermissions, [role]: keys }
      })),

      getHistoricalClientPrice: (clientId, productId) => {
        const state = get();
        // Find all SOs for this client, sorted by date DESC
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
        // Create a deep-ish copy (excluding functions and snapshot itself to avoid recursion)
        const snapshot = { ...state, devHistorySnapshot: null };
        set({ devHistorySnapshot: snapshot });
      },
      undoDevSnapshot: () => {
        const { devHistorySnapshot } = get();
        if (devHistorySnapshot) {
          // Flatten snapshot and restore functions by re-incorporating them
          // We only want the data part, but zustand set can take an object
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
        
        set({
          // Preserve Master Data
          clients: state.clients,
          products: state.products,
          users: state.users,
          coas: state.coas,
          
          // Reset Operational / Transactional Data
          salesOrders: [],
          salesOrderItems: [],
          purchases: [],
          purchaseItems: [],
          deliveries: [],
          expenses: [],
          invoices: [],
          journalEntries: [],
          journalLines: [],
          leads: [],
          tasks: [],
          notifications: [],
          pendingReturns: [],
          reimbursements: [],
          cashTransactions: [],
          
          // Reset Bank Balances to Initial Defaults
          bankAccounts: INITIAL_BANK_ACCOUNTS,
          fixedAssets: []
        });
        
        await get().saveToHdd();
        
        toast.success("MEMBERSIHKAN DATABASE...", {
          description: "Simulation & Bank Reset Selesai! Me-reload halaman..."
        });
        
        setTimeout(() => window.location.reload(), 800);
      },

      resetDb: async () => {
        get().takeDevSnapshot();
        set({
          clients: CLIENTS_SEED, vendors: VENDORS_SEED, products: PRODUCTS_SEED, 
          salesOrders: [], salesOrderItems: [],
          purchases: [], purchaseItems: [], deliveries: [], expenses: [],
          invoices: [], journalEntries: [], journalLines: [], coas: COA_SEED,
          users: MOCK_USERS, leads: [], tasks: [], notifications: [],
          bankAccounts: INITIAL_BANK_ACCOUNTS,
          cashTransactions: [],
          reimbursements: [],
          fixedAssets: []
        });
        
        await get().saveToHdd();

        toast.info("Database Reset ke Seed awal!");
        setTimeout(() => window.location.reload(), 500);
      },

    })
);
