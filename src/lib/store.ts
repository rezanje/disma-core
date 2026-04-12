import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Client, Product, SalesOrder, SalesOrderItem, Purchase, 
  PurchaseItem, Delivery, Invoice, ChartOfAccount, JournalEntry, 
  JournalLine, OperationalExpense, User, Vendor, Role, Lead, Announcement, AppTask, AppNotification,
  BankAccount, CashTransaction, Reimbursement, FixedAsset,
  Employee, SmartKpi, OkrObjective, RolePermissionMap, AccessKey, PendingReturn, RejectedItem, StockMovement
} from '@/types';
import { COA_SEED, CLIENTS_SEED, VENDORS_SEED, MOCK_USERS, KPI_SEED } from './constants';
import { PRODUCTS_SEED } from './products_seed';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

const LOCAL_PRODUCTS_CACHE_KEY = 'disma_local_products_cache';
const LOCAL_CLIENTS_CACHE_KEY = 'disma_local_clients_cache';
const LOCAL_SALES_ORDERS_CACHE_KEY = 'disma_local_sales_orders_cache';
const LOCAL_SALES_ORDER_ITEMS_CACHE_KEY = 'disma_local_sales_order_items_cache';
const LOCAL_PURCHASES_CACHE_KEY = 'disma_local_purchases_cache';
const LOCAL_PURCHASE_ITEMS_CACHE_KEY = 'disma_local_purchase_items_cache';

const loadLocalProductsCache = (): Product[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PRODUCTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalProductsCache = (products: Product[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

const loadLocalClientsCache = (): Client[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CLIENTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalClientsCache = (clients: Client[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_CLIENTS_CACHE_KEY, JSON.stringify(clients));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

const loadLocalSalesOrdersCache = (): SalesOrder[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SALES_ORDERS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalSalesOrdersCache = (salesOrders: SalesOrder[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SALES_ORDERS_CACHE_KEY, JSON.stringify(salesOrders));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

const loadLocalSalesOrderItemsCache = (): SalesOrderItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SALES_ORDER_ITEMS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalSalesOrderItemsCache = (salesOrderItems: SalesOrderItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SALES_ORDER_ITEMS_CACHE_KEY, JSON.stringify(salesOrderItems));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

const loadLocalPurchasesCache = (): Purchase[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PURCHASES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalPurchasesCache = (purchases: Purchase[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PURCHASES_CACHE_KEY, JSON.stringify(purchases));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

const loadLocalPurchaseItemsCache = (): PurchaseItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PURCHASE_ITEMS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalPurchaseItemsCache = (purchaseItems: PurchaseItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PURCHASE_ITEMS_CACHE_KEY, JSON.stringify(purchaseItems));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

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
  isResetting: boolean;
  init: () => Promise<void>;
  saveToHdd: () => Promise<void>;
  syncTable: (table: string, data: any, silent?: boolean) => Promise<void>;

  // Sidebar State
  isSidebarMinimized: boolean;
  toggleSidebar: () => void;

  clients: Client[];
  addClient: (client: Client) => void;
  addClients: (clients: Client[]) => void;
  clearClients: () => Promise<void>;
  updateClient: (id: string, data: Partial<Client>) => void;
  
  vendors: Vendor[];
  addVendor: (vendor: Vendor) => void;
  updateVendor: (id: string, data: Partial<Vendor>) => void;
  
  products: Product[];
  addProduct: (product: Product) => void;
  addProducts: (products: Product[]) => void;
  clearProducts: () => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => void;
  stockMovements: StockMovement[];
  addStockMovement: (movement: StockMovement) => Promise<void>;
  
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
  addPurchaseItems: (items: PurchaseItem[]) => void;
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
  addJournalLine: (line: JournalLine) => Promise<void>;
  addJournalLines: (lines: JournalLine[]) => Promise<void>;

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
  updateCashTransaction: (id: string, updates: Partial<CashTransaction>) => Promise<void>;
  deleteCashTransaction: (id: string) => Promise<void>;
  bulkDeleteCashTransactions: (ids: string[]) => Promise<void>;

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
  rejectedItems: RejectedItem[];
  addRejectedItem: (item: RejectedItem) => void;

  // Helpers
  resetDb: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  getHistoricalClientPrice: (clientId: string, productId: string) => number | undefined;
  
  // Dev & Simulation Helpers
  devHistoryStack: Partial<AppState>[];
  takeDevSnapshot: () => void;
  undoDevSnapshot: () => Promise<void>;
}


const initialCOAs: ChartOfAccount[] = [
  // 1-XXXX ASSETS
  { id: 'coa-1', accountCode: '1-1000', accountName: 'Kas di Tangan (Petty Cash)', accountType: 'Asset' },
  { id: 'coa-1-2', accountCode: '1-1200', accountName: 'Bank BCA - Utama', accountType: 'Asset' },
  { id: 'coa-1-3', accountCode: '1-1300', accountName: 'Bank Mandiri - Operasional', accountType: 'Asset' },
  { id: 'coa-1-5', accountCode: '1-1500', accountName: 'Uang Muka Karyawan (Advance)', accountType: 'Asset' },
  { id: 'coa-1-5-1', accountCode: '1-1510', accountName: 'Kas Operasional Kurir', accountType: 'Asset' },
  { id: 'coa-2', accountCode: '1-2000', accountName: 'Piutang Usaha (Klien)', accountType: 'Asset' },
  { id: 'coa-3', accountCode: '1-3000', accountName: 'Persediaan Barang Dagang', accountType: 'Asset' },
  { id: 'coa-4', accountCode: '1-4000', accountName: 'Aset Tetap (Kendaraan/Alat)', accountType: 'Asset' },
  { id: 'coa-5', accountCode: '1-4999', accountName: 'Akumulasi Penyusutan Aset', accountType: 'Asset' },
  
  // 2-XXXX LIABILITIES
  { id: 'coa-10', accountCode: '2-1000', accountName: 'Utang Usaha (Vendor)', accountType: 'Liability' },
  { id: 'coa-10-2', accountCode: '2-2000', accountName: 'Utang Gaji & Honor', accountType: 'Liability' },
  { id: 'coa-10-3', accountCode: '2-3000', accountName: 'Utang Pajak (PPN/PPh)', accountType: 'Liability' },
  { id: 'coa-10-4', accountCode: '2-4000', accountName: 'Pinjaman Bank (Utang)', accountType: 'Liability' },
  
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
  { id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', accountCode: '1-1500', balance: 0 },
  { id: 'bank-advance-sourcing-sandi', name: 'Kas Sourcing (Sandi)', accountCode: '1-1500', balance: 0 },
  { id: 'bank-advance-sourcing-rifai', name: 'Kas Sourcing (Rifai)', accountCode: '1-1500', balance: 0 },
  { id: 'bank-advance-courier', name: 'Kas Kurir (Ops)', accountCode: '1-1510', balance: 0 }
];

const initialRolePermissions: RolePermissionMap = {
  super_admin: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products', 
    'admin_sales_orders', 'admin_shopping_list', 'admin_assets', 'admin_hr', 'admin_crm', 
    'admin_documents', 'admin_okr', 'admin_users', 'admin_settings', 'admin_tasks', 'admin_maintenance',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 
    'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices', 
    'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents',
    'warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor',
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses',
    'tasks_global', 'settings_global'
  ],
  ceo: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products', 
    'admin_sales_orders', 'admin_shopping_list', 'admin_assets', 'admin_hr', 'admin_crm', 
    'admin_documents', 'admin_okr', 'admin_users', 'admin_settings', 'admin_tasks',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 
    'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices',
    'finance_audit', 'finance_documents',
    'warehouse_dashboard', 'warehouse_catalog', 'tasks_global', 'settings_global'
  ],
  cmo: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products', 
    'admin_sales_orders', 'admin_shopping_list', 'admin_crm', 
    'admin_documents', 'admin_okr', 'admin_tasks',
    'finance_dashboard', 'finance_reports', 'tasks_global', 'settings_global'
  ],
  finance: ['finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 'finance_budget', 'finance_cash_bank', 'finance_ledger', 'finance_invoices', 'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'tasks_global'],
  gudang: ['warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor', 'tasks_global'],
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
      isResetting: false,
      
      syncTable: async (table: string, data: any, silent = false) => {
        set({ isSyncing: true });
        try {
          const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMessage = String(errData.error || res.statusText || '');
            if (/could not find the table|schema cache/i.test(errMessage)) {
              console.warn(`[Sync] ${table} table not available yet in Supabase dev, skipping remote sync.`);
              return;
            }
            throw new Error(`Sync failed for ${table}: ${errMessage}`);
          }

          // Broadcast to other tabs for INSTANT update (skip if silent)
          if (!silent && typeof window !== 'undefined') {
            const bc = new BroadcastChannel('disma_core_sync');
            bc.postMessage({ type: 'SYNC_UPDATE', table });
            bc.close();
          }
        } catch (error) {
          console.error(`Sync Error (${table}):`, error);
        } finally {
          set({ isSyncing: false });
        }
      },

      init: async () => {
        if (get().isSyncing) return; // Prevent overwriting in-flight changes
        
        try {
          const res = await fetch('/api/db?ts=' + Date.now(), { cache: 'no-store' });
          const data = await res.json();
          if (data && !data.error) {
            if (Object.keys(data).length === 0) return;

            // Self-Repair: If Master Data is missing or has wrong IDs in DB, re-sync
            const dbCoaIds = new Set((data.coas || []).map((c: any) => c.id));
            const hasIdMismatch = initialCOAs.some(c => !dbCoaIds.has(c.id));
            if ((!data.coas || data.coas.length === 0) || hasIdMismatch) {
               console.log("Master Seed: COAs missing or ID mismatch in Supabase. Re-syncing...");
               get().syncTable('coas', initialCOAs);
            }
            if ((!data.users || data.users.length === 0) && MOCK_USERS.length > 0) {
               console.log("Master Seed: Users missing in Supabase. Seeding...");
               get().syncTable('users', MOCK_USERS);
            }
            if ((!data.bankAccounts || data.bankAccounts.length === 0) && INITIAL_BANK_ACCOUNTS.length > 0) {
               console.log("Master Seed: Bank Accounts missing in Supabase. Seeding...");
               get().syncTable('bank_accounts', INITIAL_BANK_ACCOUNTS);
            }
            // DANGER: Automatic save to HDD in init() can cause data loss if fetch is empty.
            // Removed to prevent race conditions during polling.

            const mergedCoas = [...initialCOAs];
            if (data.coas && Array.isArray(data.coas)) {
              data.coas.forEach((c: ChartOfAccount) => {
                const exists = mergedCoas.find(orig => orig.accountCode === c.accountCode);
                if (!exists) mergedCoas.push(c);
              });
            }

            const mergedPermissions = { ...initialRolePermissions };
            const hasServerPermissions = data.rolePermissions && typeof data.rolePermissions === 'object' && Object.keys(data.rolePermissions).length > 0;
            
            if (hasServerPermissions) {
              Object.keys(data.rolePermissions).forEach((role) => {
                // If server has data for this role, it's the source of truth (allows revoking permissions)
                if (Array.isArray(data.rolePermissions[role])) {
                   mergedPermissions[role] = data.rolePermissions[role];
                }
              });
            }

            // --- INTELLIGENT BANK RE-HYDRATION ---
            // DB is authoritative for balance. Local additions (not yet in DB) are preserved.
            const localBanks = get().bankAccounts;
            let mergedBanks: BankAccount[];

            if (data.bankAccounts && Array.isArray(data.bankAccounts) && data.bankAccounts.length > 0) {
              // Use DB data as source of truth (has correct balances)
              mergedBanks = [...data.bankAccounts];
              // Preserve any local banks not yet synced to DB
              localBanks.forEach((localBank: BankAccount) => {
                if (!mergedBanks.find((b: BankAccount) => b.id === localBank.id)) {
                  mergedBanks.push(localBank);
                }
              });
            } else {
              // No DB data yet: fall back to local or seed
              mergedBanks = localBanks.length > 0 ? [...localBanks] : [...INITIAL_BANK_ACCOUNTS];
            }

            const missingSeedBanks = INITIAL_BANK_ACCOUNTS.filter((seedBank) => !mergedBanks.find((bank) => bank.id === seedBank.id));
            if (missingSeedBanks.length > 0) {
              mergedBanks = [...mergedBanks, ...missingSeedBanks];
              missingSeedBanks.forEach((bank) => get().syncTable('bank_accounts', bank, true));
            }

            // --- USER SEEDING & SHIELD ---
            let mergedUsers = data.users || [];
            // Preserve mock users if they don't exist in DB to ensure initial team exists
            MOCK_USERS.forEach(mock => {
              if (!mergedUsers.find((u: any) => u.id === mock.id)) {
                mergedUsers.push(mock);
                // No auto-sync here to avoid prompt storm, will sync on first edit
              }
            });
            // Preserve local users not yet in DB
            get().users.forEach(localUser => {
              if (!mergedUsers.find((u: any) => u.id === localUser.id)) {
                mergedUsers.push(localUser);
              }
            });

            // --- SELF-REPAIR: Recalculate bank balances from CashTransactions if corrupted ---
            // Jika saldo bank tidak sesuai dengan total CashTransactions, recalculate.
            if (data.cashTransactions && Array.isArray(data.cashTransactions) && data.cashTransactions.length > 0) {
              const txs: CashTransaction[] = data.cashTransactions;
              mergedBanks = mergedBanks.map((bank: BankAccount) => {
                const bankTxs = txs.filter((tx: CashTransaction) => tx.bankAccountId === bank.id);
                if (bankTxs.length === 0) return bank;
                const calculatedBalance = bankTxs.reduce((sum: number, tx: CashTransaction) => {
                  return sum + (tx.type === 'In' ? tx.amount : -tx.amount);
                }, 0);
                if (Math.abs(calculatedBalance - (bank.balance || 0)) > 1) {
                  console.log(`Balance repair: ${bank.name} DB=${bank.balance} Calc=${calculatedBalance}`);
                  return { ...bank, balance: calculatedBalance };
                }
                return bank;
              });
              // Sync repaired balances back to DB
              const repairedBanks = mergedBanks.filter((bank: BankAccount) => {
                const original = (data.bankAccounts || []).find((b: BankAccount) => b.id === bank.id);
                return original && Math.abs((original.balance || 0) - bank.balance) > 1;
              });
              if (repairedBanks.length > 0) {
                console.log(`Syncing ${repairedBanks.length} repaired bank balances to DB...`);
                repairedBanks.forEach((bank: BankAccount) => get().syncTable('bank_accounts', bank, true));
              }
            }

            // --- SMART MERGE FOR OPERATIONAL TABLES (PREVENT REGRESSION) ---
            const PROGRESS_RANK: Record<string, number> = {
              'Draft': 0, 'Pending': 1, 'Belanja': 2, 'Sourcing': 2.5, 'QC': 3, 'Surat Jalan': 4,
              'Selesai': 5, 'Approved': 5, 'Rejected': 5,
              'Belum Transfer': 0, 'Laporan Masuk': 1, 'Terverifikasi': 2,
              'Pending Audit': 0,
              // CRM Leads
              'Lead': 0, 'Meeting': 1, 'Quotation': 2, 'Closed': 3,
              // Tasks
              'Todo': 0, 'In Progress': 1, 'Done': 2, 'Cancelled': 2,
              // Reimbursements
              'Paid': 2,
              // Deliveries
              'Menunggu': 0, 'Dikirim': 1, 'Tunggu Konfirmasi': 2, 'Awaiting Audit': 3, 'Terkirim': 4,
              // Invoices
              'Unpaid': 0, 'Partial': 1
            };
            const smartMerge = (localArr: any[], serverArr: any[], immutable: boolean = false) => {
              if (!serverArr || !Array.isArray(serverArr)) return localArr;
              if (!localArr || localArr.length === 0) return serverArr;

              const merged = [...localArr];
              serverArr.forEach(item => {
                const existingIdx = merged.findIndex(m => m.id === item.id);
                if (existingIdx === -1) {
                  merged.push(item);
                } else if (!immutable) {
                  const localItem = merged[existingIdx];
                  const localStatusRank = PROGRESS_RANK[localItem.status] ?? -1;
                  const serverStatusRank = PROGRESS_RANK[item.status] ?? -1;
                  const localRekonRank = PROGRESS_RANK[localItem.reconciliationStatus] ?? -1;
                  const serverRekonRank = PROGRESS_RANK[item.reconciliationStatus] ?? -1;

                  // Keep whichever is more advanced (local or server)
                  const localIsAhead = localStatusRank > serverStatusRank || localRekonRank > serverRekonRank;
                  if (!localIsAhead) {
                    merged[existingIdx] = { ...item };
                  }
                }
              });
              return merged;
            };

            const localProductsCache = loadLocalProductsCache();
            const localClientsCache = loadLocalClientsCache();
            const localSalesOrdersCache = loadLocalSalesOrdersCache();
            const localSalesOrderItemsCache = loadLocalSalesOrderItemsCache();
            const localPurchasesCache = loadLocalPurchasesCache();
            const localPurchaseItemsCache = loadLocalPurchaseItemsCache();
            const mergedPurchases = smartMerge(localPurchasesCache.length > 0 ? localPurchasesCache : get().purchases, data.purchases);
            const mergedExpenses = smartMerge(get().expenses, data.expenses);
            const mergedSalesOrders = smartMerge(localSalesOrdersCache.length > 0 ? localSalesOrdersCache : get().salesOrders, data.salesOrders);
            const mergedSalesOrderItems = smartMerge(localSalesOrderItemsCache.length > 0 ? localSalesOrderItemsCache : get().salesOrderItems, data.salesOrderItems);
            const mergedItems = smartMerge(localPurchaseItemsCache.length > 0 ? localPurchaseItemsCache : get().purchaseItems, data.purchaseItems);
            const mergedClients = [...(data.clients || [])];
            localClientsCache.forEach((client: Client) => {
              if (!mergedClients.find((existing: Client) => existing.id === client.id)) {
                mergedClients.push(client);
              }
            });
            const mergedProducts = [...(data.products || [])];
            localProductsCache.forEach((product: Product) => {
              if (!mergedProducts.find((existing: Product) => existing.id === product.id)) {
                mergedProducts.push(product);
              }
            });

            // --- SMART MERGE: Protect finance tables from being overwritten by stale server data ---
            // Transactions and Journals are mostly immutable - don't overwrite local if ID matches
            const mergedCashTransactions = smartMerge(get().cashTransactions, data.cashTransactions, true);
            const mergedJournalEntries = smartMerge(get().journalEntries, data.journalEntries, true);
            const mergedJournalLines = smartMerge(get().journalLines, data.journalLines, true);
            const mergedInvoices = smartMerge(get().invoices, data.invoices);
            const mergedDeliveries = smartMerge(get().deliveries, data.deliveries);
            const mergedLeads = smartMerge(get().leads, data.leads);
            const mergedTasks = smartMerge(get().tasks, data.tasks);
            const mergedReimbursements = smartMerge(get().reimbursements, data.reimbursements);
            const mergedStockMovements = smartMerge(get().stockMovements, data.stockMovements, true);

            // --- FINAL STATE UPDATE ---
            // Defensive Check: If server returns empty for critical tables, but we have local data,
            // DO NOT overwrite the local cache with empty data yet. This prevents "startup wipe".
            const isServerResponseEmpty = !data.salesOrders || data.salesOrders.length === 0;
            const hasLocalData = (get().salesOrders.length > 0) || (localSalesOrdersCache.length > 0);
            
            // Only update rolePermissions and navConfigs if the server actually provided them
            const finalRolePermissions = hasServerPermissions ? mergedPermissions : get().rolePermissions;
            const finalNavConfigs = (data.navConfigs && Object.keys(data.navConfigs).length > 0) ? data.navConfigs : get().navConfigs;

            set({ 
              ...data, 
              coas: mergedCoas, 
              rolePermissions: finalRolePermissions,
              bankAccounts: mergedBanks,
              purchases: mergedPurchases,
              expenses: mergedExpenses,
              salesOrders: mergedSalesOrders,
              salesOrderItems: mergedSalesOrderItems,
              purchaseItems: mergedItems,
              cashTransactions: mergedCashTransactions,
              journalEntries: mergedJournalEntries,
              journalLines: mergedJournalLines,
              invoices: mergedInvoices,
              deliveries: mergedDeliveries,
              leads: mergedLeads,
              tasks: mergedTasks,
              reimbursements: mergedReimbursements,
              clients: mergedClients.length > 0 ? mergedClients : get().clients,
              products: mergedProducts.length > 0 ? mergedProducts : get().products,
              users: mergedUsers.length > 0 ? mergedUsers : get().users,
              stockMovements: mergedStockMovements,
              navConfigs: finalNavConfigs,
              kpiObjectives: (data.kpiObjectives && data.kpiObjectives.length > 0) ? data.kpiObjectives : KPI_SEED
            });

            // --- DEFENSIVE CACHING ---
            // Only update local HDD cache if the server actually had data.
            // This prevents a "dead/empty" server from wiping the user's local backup.
            if (!isServerResponseEmpty || (get().salesOrders.length > 0)) {
              if (mergedClients.length > 0) saveLocalClientsCache(get().clients);
              if (mergedProducts.length > 0) saveLocalProductsCache(get().products);
              if (mergedSalesOrders.length > 0) saveLocalSalesOrdersCache(get().salesOrders);
              if (mergedSalesOrderItems.length > 0) saveLocalSalesOrderItemsCache(get().salesOrderItems);
              if (mergedPurchases.length > 0) saveLocalPurchasesCache(get().purchases);
              if (mergedItems.length > 0) saveLocalPurchaseItemsCache(get().purchaseItems);
              
              if (isServerResponseEmpty && hasLocalData) {
                 console.warn("[Storage] Server seems empty, but Local Data exists. Preserving Local Cache.");
              }
            } else {
              console.log("[Storage] Skipping HDD Cache update: Server and Local are both empty.");
            }

            // --- LEGACY HPP BACKFILL ---
            // Before the HPP mapping fix, market sourcing settlements were posted to inventory (1-3000).
            // Repair them in-place so historical P&L reports reflect the correct cost of goods sold.
            const repairLegacyHppSettlements = async () => {
              const current = get();
              const hppCoa = current.coas.find(c => c.accountCode === '5-1000');
              const legacyInventoryCoa = current.coas.find(c => c.accountCode === '1-3000');

              if (!hppCoa || !legacyInventoryCoa) return 0;

              const targetEntries = current.journalEntries.filter(entry => {
                const desc = (entry.description || '').toLowerCase();
                return (
                  desc.includes('penyelesaian belanja sourcing') ||
                  desc.includes('belanja pasar disetujui') ||
                  desc.includes('sourcing (hpp)')
                );
              });

              let repaired = 0;
              for (const entry of targetEntries) {
                const entryLines = current.journalLines.filter(line => line.journalEntryId === entry.id);
                const hasLegacyDebit = entryLines.some(line => line.accountId === legacyInventoryCoa.id && Number(line.debitAmount || 0) > 0);
                const hasHppDebit = entryLines.some(line => line.accountId === hppCoa.id && Number(line.debitAmount || 0) > 0);

                if (!hasLegacyDebit || hasHppDebit) continue;

                const updatedLines = entryLines.map(line => (
                  line.accountId === legacyInventoryCoa.id && Number(line.debitAmount || 0) > 0
                    ? { ...line, accountId: hppCoa.id }
                    : line
                ));

                await get().updateJournalEntry(entry.id, {}, updatedLines);
                repaired += 1;
              }

              if (repaired > 0) {
                console.log(`Legacy HPP backfill complete: repaired ${repaired} journal entr${repaired === 1 ? 'y' : 'ies'}.`);
              }

              return repaired;
            };

            await repairLegacyHppSettlements();

            const repairDuplicateSettlementRecords = async () => {
              const current = get();

              const cashTransactions = [...current.cashTransactions];
              const seenCashKeys = new Set<string>();
              const dedupedCashTransactions = cashTransactions.filter((tx) => {
                const cashKey = [
                  tx.type,
                  tx.category,
                  tx.bankAccountId,
                  tx.referenceId || '',
                  tx.amount,
                  tx.description || '',
                ].join('|');

                if (seenCashKeys.has(cashKey)) return false;
                seenCashKeys.add(cashKey);
                return true;
              });

              const linesByEntry = new Map<string, JournalLine[]>();
              current.journalLines.forEach((line) => {
                const existing = linesByEntry.get(line.journalEntryId) || [];
                existing.push(line);
                linesByEntry.set(line.journalEntryId, existing);
              });

              const seenJournalKeys = new Set<string>();
              const dedupedJournalEntries = current.journalEntries.filter((entry) => {
                const normalizedLines = [...(linesByEntry.get(entry.id) || [])]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((line) => `${line.accountId}:${line.debitAmount}:${line.creditAmount}`)
                  .join('|');

                const journalKey = [
                  entry.referenceType || '',
                  entry.referenceId || '',
                  entry.description || '',
                  normalizedLines,
                ].join('|');

                if (seenJournalKeys.has(journalKey)) return false;
                seenJournalKeys.add(journalKey);
                return true;
              });

              const validJournalEntryIds = new Set(dedupedJournalEntries.map((entry) => entry.id));
              const dedupedJournalLines = current.journalLines.filter((line) => validJournalEntryIds.has(line.journalEntryId));

              const cashChanged = dedupedCashTransactions.length !== current.cashTransactions.length;
              const journalChanged = dedupedJournalEntries.length !== current.journalEntries.length;

              if (!cashChanged && !journalChanged) return 0;

              const recalculatedBanks = current.bankAccounts.map((bank) => {
                const balance = dedupedCashTransactions
                  .filter((tx) => tx.bankAccountId === bank.id)
                  .reduce((sum, tx) => sum + (tx.type === 'In' ? tx.amount : -tx.amount), 0);

                return { ...bank, balance };
              });

              set({
                cashTransactions: dedupedCashTransactions,
                journalEntries: dedupedJournalEntries,
                journalLines: dedupedJournalLines,
                bankAccounts: recalculatedBanks,
              });

              await fetch('/api/db/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'custom',
                  tables: ['journal_lines', 'journal_entries', 'cash_transactions', 'bank_accounts'],
                })
              });

              await fetch('/api/db/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'seed',
                  seedData: {
                    journal_entries: dedupedJournalEntries,
                    journal_lines: dedupedJournalLines,
                    cash_transactions: dedupedCashTransactions,
                    bank_accounts: recalculatedBanks,
                  }
                })
              });

              const removedCash = current.cashTransactions.length - dedupedCashTransactions.length;
              const removedJournal = current.journalEntries.length - dedupedJournalEntries.length;
              console.log(`Duplicate settlement repair complete: removed ${removedCash} cash transaction(s) and ${removedJournal} journal entr${removedJournal === 1 ? 'y' : 'ies'}.`);
              return removedCash + removedJournal;
            };

            await repairDuplicateSettlementRecords();

            // --- LEGACY INVENTORY STOCK CLEANUP ---
            // If there is no purchase history yet, any pre-filled product stock is stale seed data.
            // Reset it to zero so inventory only grows from real QC/inbound events.
            const repairLegacyInventoryStock = async () => {
              const current = get();
              const hasPurchaseHistory = Array.isArray(data.purchaseItems) && data.purchaseItems.length > 0;
              if (hasPurchaseHistory) return 0;

              const productsToRepair = current.products.filter(product => Number(product.currentStock || 0) !== 0);
              if (productsToRepair.length === 0) return 0;

              const zeroedProducts = current.products.map(product => (
                Number(product.currentStock || 0) !== 0
                  ? { ...product, currentStock: 0 }
                  : product
              ));

              set({ products: zeroedProducts });

              for (const product of productsToRepair) {
                await get().syncTable(
                  'products',
                  { ...product, currentStock: 0 },
                  true
                );
              }

              console.log(`Legacy inventory stock cleanup complete: reset ${productsToRepair.length} product stock record${productsToRepair.length === 1 ? '' : 's'}.`);
              return productsToRepair.length;
            };

            await repairLegacyInventoryStock();
          }
        } catch (error) {
          console.error('Store Init Error:', error);
        }
      },

      saveToHdd: async () => {
        const state = get();
        // Guard: Don't save if state looks suspicious/empty to avoid wiping DB during failed init
        const hasNav = Object.keys(state.navConfigs).length > 0;
        const hasPermissions = Object.values(state.rolePermissions).some(keys => keys.length > 0);
        
        if (!hasNav && !hasPermissions) {
           console.warn("[Storage] Suspending saveToHdd: state looks uninitialized.");
           return;
        }

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
        const updatedClients = [...get().clients, client];
        set({ clients: updatedClients });
        saveLocalClientsCache(updatedClients);
        await get().syncTable('clients', client);
      },
      addClients: async (items) => {
        const updatedClients = [...get().clients, ...items];
        set({ clients: updatedClients });
        saveLocalClientsCache(updatedClients);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          await get().syncTable('clients', chunk);
        }
      },
      clearClients: async () => {
        set({ isResetting: true });
        try {
          const res = await fetch('/api/db/reset', {
            method: 'POST',
            body: JSON.stringify({ action: 'clients_only' })
          });
          if (!res.ok) throw new Error('Failed to clear clients');
          set({ clients: [] });
          saveLocalClientsCache([]);
          toast.success("Semua klien berhasil dihapus!");
        } catch (error: any) {
          toast.error("Gagal menghapus klien: " + error.message);
        } finally {
          set({ isResetting: false });
        }
      },
      updateClient: async (id, data) => {
        const updatedClients = get().clients.map(c => c.id === id ? { ...c, ...data } : c);
        set({ clients: updatedClients });
        saveLocalClientsCache(updatedClients);
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
        const updatedProducts = [...get().products, product];
        set({ products: updatedProducts });
        saveLocalProductsCache(updatedProducts);
        await get().syncTable('products', product);
      },
      addProducts: async (items) => {
        const updatedProducts = [...get().products, ...items];
        set({ products: updatedProducts });
        saveLocalProductsCache(updatedProducts);
        
        // Chunk on the client to avoid server timeouts
        const CHUNK_SIZE = 50;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          await get().syncTable('products', chunk);
        }
      },
      clearProducts: async () => {
        set({ isResetting: true });
        try {
          const res = await fetch('/api/db/reset', {
            method: 'POST',
            body: JSON.stringify({ action: 'products_only' })
          });
          if (!res.ok) throw new Error('Failed to clear products');
          set({ products: [] });
          saveLocalProductsCache([]);
          toast.success("Semua produk berhasil dihapus!");
        } catch (error: any) {
          toast.error("Gagal menghapus produk: " + error.message);
        } finally {
          set({ isResetting: false });
        }
      },
      updateProduct: async (id, data) => {
        const updatedProducts = get().products.map(p => p.id === id ? { ...p, ...data } : p);
        set({ products: updatedProducts });
        saveLocalProductsCache(updatedProducts);
        const updated = get().products.find(p => p.id === id);
        if (updated) await get().syncTable('products', updated);
      },
      stockMovements: [],
      addStockMovement: async (movement) => {
        set((state) => ({ stockMovements: [movement, ...state.stockMovements] }));
        await get().syncTable('stock_movements', movement);
      },

      coas: COA_SEED,
      addCoa: async (coa) => {
        set((state) => ({ coas: [...state.coas, coa] }));
        await get().syncTable('coas', coa);
      },

      salesOrders: [],
      addSalesOrder: async (so) => {
        get().takeDevSnapshot();
        const updatedSalesOrders = [...get().salesOrders, so];
        set({ salesOrders: updatedSalesOrders });
        saveLocalSalesOrdersCache(updatedSalesOrders);
        await get().syncTable('sales_orders', so);
      },
      updateSalesOrder: async (id, data) => {
        const updatedSalesOrders = get().salesOrders.map(so => so.id === id ? { ...so, ...data } : so);
        set({ salesOrders: updatedSalesOrders });
        saveLocalSalesOrdersCache(updatedSalesOrders);
        const updated = get().salesOrders.find(so => so.id === id);
        if (updated) await get().syncTable('sales_orders', updated);
      },

      salesOrderItems: [],
      addSalesOrderItem: async (item) => {
        const updatedSalesOrderItems = [...get().salesOrderItems, item];
        set({ salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);
        await get().syncTable('sales_order_items', item);
      },
      addSalesOrderItems: async (items: SalesOrderItem[]) => {
        const updatedSalesOrderItems = [...get().salesOrderItems, ...items];
        set({ salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);
        await get().syncTable('sales_order_items', items);
      },
      updateSalesOrderItem: async (id, data) => {
        const updatedSalesOrderItems = get().salesOrderItems.map(item => item.id === id ? { ...item, ...data } : item);
        set({ salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);
        const updated = get().salesOrderItems.find(item => item.id === id);
        if (updated) await get().syncTable('sales_order_items', updated);
      },

      purchases: [],
      addPurchase: async (p) => {
        const updatedPurchases = [...get().purchases, p];
        set({ purchases: updatedPurchases });
        saveLocalPurchasesCache(updatedPurchases);
        await get().syncTable('purchases', p);
      },
      updatePurchase: async (id, data) => {
        const updatedPurchases = get().purchases.map(p => p.id === id ? { ...p, ...data } : p);
        set({ purchases: updatedPurchases });
        saveLocalPurchasesCache(updatedPurchases);
        const updated = get().purchases.find(p => p.id === id);
        if (updated) await get().syncTable('purchases', updated);
      },

      purchaseItems: [],
      addPurchaseItem: async (item) => {
        const updatedPurchaseItems = [...get().purchaseItems, item];
        set({ purchaseItems: updatedPurchaseItems });
        saveLocalPurchaseItemsCache(updatedPurchaseItems);
        await get().syncTable('purchase_items', item);
      },
      addPurchaseItems: async (items: PurchaseItem[]) => {
        const updatedPurchaseItems = [...get().purchaseItems, ...items];
        set({ purchaseItems: updatedPurchaseItems });
        saveLocalPurchaseItemsCache(updatedPurchaseItems);
        await get().syncTable('purchase_items', items);
      },
      updatePurchaseItem: async (id, data) => {
        const updatedPurchaseItems = get().purchaseItems.map(pi => pi.id === id ? { ...pi, ...data } : pi);
        set({ purchaseItems: updatedPurchaseItems });
        saveLocalPurchaseItemsCache(updatedPurchaseItems);
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
      addJournalLines: async (lines) => {
        set((state) => ({ journalLines: [...state.journalLines, ...lines] }));
        await get().syncTable('journal_lines', lines);
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
        // Auto-snapshot sebelum setiap transaksi kas supaya bisa di-undo step by step
        get().takeDevSnapshot();
        const balanceChange = tx.type === 'In' ? tx.amount : -tx.amount;
        let accountToSync: BankAccount | undefined;

        set((state) => {
          const updatedAccounts = state.bankAccounts.map(b => 
            b.id === tx.bankAccountId ? { ...b, balance: (b.balance || 0) + balanceChange } : b
          );
          accountToSync = updatedAccounts.find(b => b.id === tx.bankAccountId);
          
          return { 
            cashTransactions: [tx, ...state.cashTransactions],
            bankAccounts: updatedAccounts
          }
        });

        // Sync history first
        await get().syncTable('cash_transactions', tx);
        
        // Sync updated balance using the state captured BEFORE the first await
        if (accountToSync) {
          await get().syncTable('bank_accounts', accountToSync);
        }
      },

      updateCashTransaction: async (id, updates) => {
        const existing = get().cashTransactions.find(tx => tx.id === id);
        if (!existing) return;

        const oldChange = existing.type === 'In' ? existing.amount : -existing.amount;
        const newTx = { ...existing, ...updates };
        const newChange = newTx.type === 'In' ? newTx.amount : -newTx.amount;
        const oldBankId = existing.bankAccountId;
        const newBankId = newTx.bankAccountId;

        let banksToSync: BankAccount[] = [];
        set((state) => {
          // Reverse old effect, apply new effect on bank balances
          const updatedBanks = state.bankAccounts.map(b => {
            if (oldBankId === newBankId && b.id === oldBankId) {
              return { ...b, balance: (b.balance || 0) - oldChange + newChange };
            }
            if (b.id === oldBankId) return { ...b, balance: (b.balance || 0) - oldChange };
            if (b.id === newBankId) return { ...b, balance: (b.balance || 0) + newChange };
            return b;
          });
          banksToSync = updatedBanks.filter(b => b.id === oldBankId || b.id === newBankId);
          return {
            cashTransactions: state.cashTransactions.map(tx => tx.id === id ? newTx : tx),
            bankAccounts: updatedBanks,
          };
        });

        await get().syncTable('cash_transactions', newTx);
        for (const b of banksToSync) await get().syncTable('bank_accounts', b);
      },

      deleteCashTransaction: async (id) => {
        const existing = get().cashTransactions.find(tx => tx.id === id);
        if (!existing) return;

        get().takeDevSnapshot();
        const changeToReverse = existing.type === 'In' ? existing.amount : -existing.amount;
        let accountToSync: BankAccount | undefined;

        set((state) => {
          const updatedAccounts = state.bankAccounts.map(b => 
            b.id === existing.bankAccountId ? { ...b, balance: (b.balance || 0) - changeToReverse } : b
          );
          accountToSync = updatedAccounts.find(b => b.id === existing.bankAccountId);
          
          return { 
            cashTransactions: state.cashTransactions.filter(tx => tx.id !== id),
            bankAccounts: updatedAccounts
          }
        });

        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'cash_transactions', id })
        });
        
        if (accountToSync) await get().syncTable('bank_accounts', accountToSync);
      },

      bulkDeleteCashTransactions: async (ids) => {
        if (!ids.length) return;
        get().takeDevSnapshot();
        
        const txsToDelete = get().cashTransactions.filter(tx => ids.includes(tx.id));
        const bankDeltas: Record<string, number> = {};
        
        txsToDelete.forEach(tx => {
          const changeToReverse = tx.type === 'In' ? tx.amount : -tx.amount;
          bankDeltas[tx.bankAccountId] = (bankDeltas[tx.bankAccountId] || 0) - changeToReverse;
        });

        let updatedBanks: BankAccount[] = [];
        set((state) => {
          updatedBanks = state.bankAccounts.map(b => {
             if (bankDeltas[b.id]) {
                return { ...b, balance: (b.balance || 0) + bankDeltas[b.id] };
             }
             return b;
          });
          return {
            cashTransactions: state.cashTransactions.filter(tx => !ids.includes(tx.id)),
            bankAccounts: updatedBanks
          };
        });

        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'cash_transactions', id: ids })
        });

        for (const bankId of Object.keys(bankDeltas)) {
           const b = updatedBanks.find(x => x.id === bankId);
           if (b) await get().syncTable('bank_accounts', b);
        }
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

      rejectedItems: [],
      addRejectedItem: async (item) => {
        set((state) => ({ rejectedItems: [item, ...state.rejectedItems] }));
        await get().syncTable('rejected_items', item);
      },

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

      devHistoryStack: [],
      takeDevSnapshot: () => {
        const state = get();
        // Simpan hanya data operasional yang relevan (bukan functions/stack itu sendiri)
        const snapshot: Partial<AppState> = {
          salesOrders: state.salesOrders,
          salesOrderItems: state.salesOrderItems,
          purchases: state.purchases,
          purchaseItems: state.purchaseItems,
          deliveries: state.deliveries,
          expenses: state.expenses,
          invoices: state.invoices,
          journalEntries: state.journalEntries,
          journalLines: state.journalLines,
          stockMovements: state.stockMovements,
          cashTransactions: state.cashTransactions,
          bankAccounts: state.bankAccounts,
          pendingReturns: state.pendingReturns,
          reimbursements: state.reimbursements,
          rejectedItems: state.rejectedItems,
          products: state.products,
        };
        const currentStack = get().devHistoryStack;
        // Max 10 history steps
        const newStack = [...currentStack, snapshot].slice(-10);
        set({ devHistoryStack: newStack });
      },
      undoDevSnapshot: async () => {
        const { devHistoryStack } = get();
        if (devHistoryStack.length === 0) {
          toast.error("Tidak ada history untuk di-undo.");
          return;
        }
        const toastId = toast.loading(`Undoing... (${devHistoryStack.length} step tersisa)`);
        const newStack = [...devHistoryStack];
        const snapshot = newStack.pop()!;
        // Restore state lokal
        set({ ...snapshot, devHistoryStack: newStack });
        if (snapshot.clients) saveLocalClientsCache(snapshot.clients);
        if (snapshot.products) saveLocalProductsCache(snapshot.products);
        if (snapshot.salesOrders) saveLocalSalesOrdersCache(snapshot.salesOrders);
        if (snapshot.salesOrderItems) saveLocalSalesOrderItemsCache(snapshot.salesOrderItems);
        if (snapshot.purchases) saveLocalPurchasesCache(snapshot.purchases);
        if (snapshot.purchaseItems) saveLocalPurchaseItemsCache(snapshot.purchaseItems);

        // Sync ke DB — wipe semua tabel operasional lalu seed ulang dari snapshot
        try {
          const tablesToWipe = [
            'sales_order_items', 'purchase_items', 'journal_lines',
            'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries',
            'reimbursements', 'expenses', 'cash_transactions', 'pending_returns', 'rejected_items',
            'stock_movements',
            'bank_accounts', 'products',
          ];
          // Step 1: Wipe semua tabel sekaligus
          await fetch('/api/db/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'custom', tables: tablesToWipe })
          });

          // Step 2: Seed dari snapshot — kirim semua sekaligus
          const seedData: Record<string, any[]> = {
            sales_orders: snapshot.salesOrders || [],
            sales_order_items: snapshot.salesOrderItems || [],
            purchases: snapshot.purchases || [],
            purchase_items: snapshot.purchaseItems || [],
            deliveries: snapshot.deliveries || [],
            expenses: snapshot.expenses || [],
            invoices: snapshot.invoices || [],
            journal_entries: snapshot.journalEntries || [],
            journal_lines: snapshot.journalLines || [],
            stock_movements: snapshot.stockMovements || [],
            cash_transactions: snapshot.cashTransactions || [],
            bank_accounts: snapshot.bankAccounts || [],
            reimbursements: snapshot.reimbursements || [],
            rejected_items: snapshot.rejectedItems || [],
            products: snapshot.products || [],
          };
          await fetch('/api/db/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'seed', seedData })
          });

          toast.success(`Undo berhasil! (${newStack.length} step tersisa)`, { id: toastId });
        } catch(e: any) {
          toast.error("Undo local OK, tapi gagal sync DB: " + e.message, { id: toastId });
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
            body: JSON.stringify({ action: 'simulation' }) 
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
          journalLines: [], stockMovements: [], leads: [], tasks: [], notifications: [],
          pendingReturns: [], rejectedItems: [], reimbursements: [], cashTransactions: [],
          bankAccounts: INITIAL_BANK_ACCOUNTS, fixedAssets: []
        });
        saveLocalClientsCache(get().clients);
        saveLocalProductsCache(get().products);
        saveLocalSalesOrdersCache([]);
        saveLocalSalesOrderItemsCache([]);
        saveLocalPurchasesCache([]);
        saveLocalPurchaseItemsCache([]);

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
            products: PRODUCTS_SEED,
            stock_movements: []
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
          journalLines: [], stockMovements: [], coas: COA_SEED, users: MOCK_USERS, leads: [],
          tasks: [], notifications: [], bankAccounts: INITIAL_BANK_ACCOUNTS,
          rejectedItems: [],
          cashTransactions: [], reimbursements: [], fixedAssets: []
        });
        saveLocalClientsCache(CLIENTS_SEED);
        saveLocalProductsCache(PRODUCTS_SEED);
        saveLocalSalesOrdersCache([]);
        saveLocalSalesOrderItemsCache([]);
        saveLocalPurchasesCache([]);
        saveLocalPurchaseItemsCache([]);

        toast.success("Database Reset Berhasil! Me-reload halaman...");
        setTimeout(() => window.location.reload(), 1000);
      },
    })
);
