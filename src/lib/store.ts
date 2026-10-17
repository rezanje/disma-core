import { create } from 'zustand';
import { checkedDbMutation, withOptimisticRollback } from './store-durability';
import { 
  Client, Product, SalesOrder, SalesOrderItem, Purchase, 
  PurchaseItem, Delivery, Invoice, ChartOfAccount, JournalEntry,
  JournalLine, OperationalExpense, User, Vendor, Role, Lead, Announcement, AppTask, AppNotification,
  BankAccount, CashTransaction, Reimbursement, FixedAsset,
  RolePermissionMap, AccessKey, PendingReturn, VendorReturn, RejectedItem, StockMovement, ClientPrice, ClientPriceTier, PriceBaseline,
  VendorBill, VendorBillPayment, TukarFaktur, PurchaseRequest, VendorPrice,
  DisbursementRequest, TutupHariKantong,
  DailyClose, DailyCostConfig, CreditNote
} from '@/types';
import { COA_SEED, CLIENTS_SEED, VENDORS_SEED, MOCK_USERS } from './constants';

/** Credentials belong only in the provisioning request, never browser state/cache/audit. */
const publicStoreUser = (user: User): User => {
  const { pin, ...safe } = user;
  void pin;
  return safe;
};
const untukDb = <T extends object>(user: T): T => user;
import { PRODUCTS_SEED } from './products_seed';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { loadLocalCache, saveLocalCache } from './local-cache';
import { DEFAULT_MIN_MARGIN_PCT } from './price-ceiling';
import { clientDeletionBlockers, describeBlockers, canManageClientDeletion } from './client-delete';

const LOCAL_PRODUCTS_CACHE_KEY = 'disma_local_products_cache';
const LOCAL_CLIENTS_CACHE_KEY = 'disma_local_clients_cache';
const LOCAL_VENDORS_CACHE_KEY = 'disma_local_vendors_cache';
const LOCAL_SALES_ORDERS_CACHE_KEY = 'disma_local_sales_orders_cache';
const LOCAL_SALES_ORDER_ITEMS_CACHE_KEY = 'disma_local_sales_order_items_cache';
const LOCAL_PURCHASES_CACHE_KEY = 'disma_local_purchases_cache';
const LOCAL_PURCHASE_ITEMS_CACHE_KEY = 'disma_local_purchase_items_cache';
const LOCAL_CLIENT_PRICES_CACHE_KEY = 'disma_core_client_prices_cache';
const LOCAL_BANK_ACCOUNTS_CACHE_KEY = 'disma_local_bank_accounts_cache';
const LOCAL_JOURNAL_ENTRIES_CACHE_KEY = 'disma_local_journal_entries_cache';
const LOCAL_JOURNAL_LINES_CACHE_KEY = 'disma_local_journal_lines_cache';
const LOCAL_CASH_TRANSACTIONS_CACHE_KEY = 'disma_local_cash_transactions_cache';
const LOCAL_INVOICES_CACHE_KEY = 'disma_local_invoices_cache';
const LOCAL_DELIVERIES_CACHE_KEY = 'disma_local_deliveries_cache';
const LOCAL_LEADS_CACHE_KEY = 'disma_local_leads_cache';
const LOCAL_CURRENT_USER_KEY = 'disma_core_current_user';
const LOCAL_PURCHASE_REQUESTS_CACHE_KEY = 'disma_local_purchase_requests_cache';
const LOCAL_DISBURSEMENT_REQUESTS_CACHE_KEY = 'disma_local_disbursement_requests_cache';

const loadLocalDisbursementRequestsCache = (): DisbursementRequest[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_DISBURSEMENT_REQUESTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalDisbursementRequestsCache = (requests: DisbursementRequest[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_DISBURSEMENT_REQUESTS_CACHE_KEY, JSON.stringify(requests));
  } catch {}
};

const loadLocalPurchaseRequestsCache = (): PurchaseRequest[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PURCHASE_REQUESTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalPurchaseRequestsCache = (requests: PurchaseRequest[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_PURCHASE_REQUESTS_CACHE_KEY, JSON.stringify(requests));
  } catch {}
};

const calculateDynamicStockForProducts = (products: Product[], stockMovements: StockMovement[]): Product[] => {
  const mainStockMap: Record<string, number> = {};
  const b2cStockMap: Record<string, number> = {};

  (stockMovements || []).forEach(m => {
    const delta = Number(m.stockDelta || 0);
    const wh = m.warehouseId || 'main';
    if (wh === 'b2c') {
      b2cStockMap[m.productId] = (b2cStockMap[m.productId] || 0) + delta;
    } else {
      mainStockMap[m.productId] = (mainStockMap[m.productId] || 0) + delta;
    }
  });

  // Angka minus TIDAK dipaksa jadi 0. Stok minus artinya catatannya salah — barang
  // keluar tanpa pernah tercatat masuk, atau terpotong dua kali — dan itu justru yang
  // harus kelihatan. Dipaksa jadi 0, gudang cuma lihat "kosong" dan tidak ada yang
  // pernah memperbaikinya.
  return (products || []).map(p => ({
    ...p,
    currentStock: mainStockMap[p.id] || 0,
    b2cStock: b2cStockMap[p.id] || 0
  }));
};

const loadCurrentUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_CURRENT_USER_KEY);
    if (!raw) return null;
    return publicStoreUser(JSON.parse(raw));
  } catch { return null; }
};

const saveCurrentUserToStorage = (user: User | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      window.localStorage.setItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(publicStoreUser(user)));
    } else {
      window.localStorage.removeItem(LOCAL_CURRENT_USER_KEY);
    }
  } catch {}
};

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

const loadLocalBankAccountsCache = (): BankAccount[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_BANK_ACCOUNTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalBankAccountsCache = (bankAccounts: BankAccount[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_BANK_ACCOUNTS_CACHE_KEY, JSON.stringify(bankAccounts));
  } catch {
    // Ignore local cache write failures so the app can continue working.
  }
};

// --- Generic localStorage cache helpers for remaining tables ---
// Moved to ./local-cache so the "a cache write must never throw" contract can
// be tested on its own (local-cache.check.ts).

const loadLocalLeadsCache = (): Lead[] => loadLocalCache<Lead>(LOCAL_LEADS_CACHE_KEY);
const saveLocalLeadsCache = (leads: Lead[]) => saveLocalCache(LOCAL_LEADS_CACHE_KEY, leads);

type CashPostResponse = {
  transaction?: CashTransaction;
  bankAccount?: BankAccount;
  error?: string;
};

export const clearAllOperationalCaches = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_SALES_ORDERS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_SALES_ORDER_ITEMS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_PURCHASES_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_PURCHASE_ITEMS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_PURCHASE_REQUESTS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_PRODUCTS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_CLIENTS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_CLIENT_PRICES_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_BANK_ACCOUNTS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_JOURNAL_ENTRIES_CACHE_KEY);
  // Clear shopping list UI state
  window.localStorage.removeItem('shopping_manualItems');
  window.localStorage.removeItem('shopping_customPrices');
  window.localStorage.removeItem('shopping_onlineProductIds');
  window.localStorage.removeItem('shopping_shoppingDate');
  window.localStorage.removeItem('shopping_lastGeneratedDoc');
  window.localStorage.removeItem(LOCAL_JOURNAL_LINES_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_CASH_TRANSACTIONS_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_INVOICES_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_DELIVERIES_CACHE_KEY);
  window.localStorage.removeItem(LOCAL_LEADS_CACHE_KEY);
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
  // In-memory UI readiness only. Never restored from the cached identity;
  // every protected API still validates the server session independently.
  isSessionVerified: boolean;
  setServerSession: (user: User | null) => void;
  users: User[];
  addUser: (user: User) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  
  // Storage
  isSyncing: boolean;
  isHydrated: boolean;
  // True once Phase 1 restored a real localStorage snapshot. The loading gate
  // uses this to let the UI through while Phase 2 still fetches — without it,
  // a fresh browser would render the built-in seed data as if it were live.
  hydratedFromCache: boolean;
  isResetting: boolean;
  _ignoreBroadcastUntil: number;
  _lastLocalMutationAt: number;
  // Roles whose nav config the user edited THIS session. init() must never
  // overwrite these from a server snapshot — local preference is the source
  // of truth for the editor until the page reloads.
  _locallyEditedNavRoles: string[];
  _locallyEditedPermissionRoles: string[];
  init: () => Promise<void>;
  forceSync: () => Promise<void>;
  saveToHdd: () => Promise<void>;
  syncTable: (table: string, data: any, silent?: boolean) => Promise<void>;
  logHistory: (params: {
    table: string;
    recordId: string;
    action: 'create' | 'update' | 'delete' | 'rollback';
    oldData: any | null;
    newData: any | null;
    parentHistoryId?: string;
    reason?: string;
  }) => Promise<void>;

  // Sidebar State
  isSidebarMinimized: boolean;
  toggleSidebar: () => void;

  tierMargins: Record<ClientPriceTier, number>;
  updateTierMargins: (margins: Record<ClientPriceTier, number>) => Promise<void>;
  /** Margin minimum yang harus tersisa saat belanja. Dipakai menghitung batas harga beli. */
  minMarginPct: number;
  updateMinMarginPct: (pct: number) => Promise<void>;
  priceBaseline: PriceBaseline | null;

  clients: Client[];
  addClient: (client: Client) => void;
  addClients: (clients: Client[]) => void;
  clearClients: () => Promise<void>;
  updateClient: (id: string, data: Partial<Client>) => void;
  deleteClient: (id: string) => Promise<boolean>;
  setClientLocation: (clientId: string, lat: number, lng: number, note?: string) => Promise<void>;
  assignRoute: (updates: { salesOrderId: string; courierId: string | null; routeOrder: number }[]) => Promise<void>;
  updateMultipleClients: (updates: { id: string, data: Partial<Client> }[]) => Promise<void>;

  clientPrices: ClientPrice[];
  addClientPrice: (cp: ClientPrice) => Promise<void>;
  updateClientPrice: (id: string, updates: Partial<ClientPrice>) => Promise<void>;
  deleteClientPrice: (id: string) => Promise<void>;
  deleteMultipleClientPrices: (ids: string[]) => Promise<void>;
  
  vendors: Vendor[];
  vendorsLoading: boolean;
  vendorsError: string | null;
  refreshVendors: () => Promise<void>;
  addVendor: (vendor: Vendor) => void;
  updateVendor: (id: string, data: Partial<Vendor>) => void;
  vendorPrices: VendorPrice[];
  addVendorPrice: (vp: VendorPrice) => Promise<void>;
  updateVendorPrice: (id: string, data: Partial<VendorPrice>) => Promise<void>;
  deleteVendorPrice: (id: string) => Promise<void>;
  
  products: Product[];
  addProduct: (product: Product) => void;
  addProducts: (products: Product[]) => void;
  clearProducts: () => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => void;
  updateMultipleProducts: (updates: { id: string, data: Partial<Product> }[]) => Promise<void>;
  stockMovements: StockMovement[];
  addStockMovement: (movement: StockMovement) => Promise<void>;
  
  coas: ChartOfAccount[];
  addCoa: (coa: ChartOfAccount) => void;

  // Operational Data
  salesOrders: SalesOrder[];
  addSalesOrder: (so: SalesOrder) => void;
  updateSalesOrder: (id: string, data: Partial<SalesOrder>) => void;
  deleteSalesOrder: (id: string) => Promise<void>;
  deleteMultipleSalesOrders: (ids: string[]) => Promise<void>;

  salesOrderItems: SalesOrderItem[];
  addSalesOrderItem: (item: SalesOrderItem) => void;
  addSalesOrderItems: (items: SalesOrderItem[]) => void;
  updateSalesOrderItem: (id: string, data: Partial<SalesOrderItem>) => void;
  deleteSalesOrderItem: (id: string) => void;

  purchases: Purchase[];
  addPurchase: (p: Purchase) => void;
  updatePurchase: (id: string, data: Partial<Purchase>) => void;
  deletePurchase: (id: string) => Promise<void>;

  purchaseItems: PurchaseItem[];
  addPurchaseItem: (item: PurchaseItem) => void;
  addPurchaseItems: (items: PurchaseItem[]) => void;
  updatePurchaseItem: (id: string, data: Partial<PurchaseItem>) => void;
  deletePurchaseItem: (id: string) => Promise<void>;

  purchaseRequests: PurchaseRequest[];
  addPurchaseRequest: (pr: PurchaseRequest) => Promise<void>;
  updatePurchaseRequest: (id: string, updates: Partial<PurchaseRequest>) => Promise<void>;
  deletePurchaseRequest: (id: string) => Promise<void>;

  disbursementRequests: DisbursementRequest[];
  addDisbursementRequest: (dr: DisbursementRequest) => Promise<void>;
  updateDisbursementRequest: (id: string, updates: Partial<DisbursementRequest>) => Promise<void>;
  deleteDisbursementRequest: (id: string) => Promise<void>;

  tutupHariKantong: TutupHariKantong[];
  creditNotes: CreditNote[];
  addCreditNote: (cn: CreditNote) => Promise<void>;
  dailyCloses: DailyClose[];
  addDailyClose: (rec: DailyClose) => Promise<void>;
  dailyCostConfig: DailyCostConfig | null;
  saveDailyCostConfig: (cfg: DailyCostConfig) => Promise<void>;
  addTutupHariKantong: (rec: TutupHariKantong) => Promise<void>;

  deliveries: Delivery[];
  addDelivery: (d: Delivery) => void;
  updateDelivery: (id: string, data: Partial<Delivery>) => void;
  deleteDelivery: (id: string) => Promise<void>;

  expenses: OperationalExpense[];
  addExpense: (e: OperationalExpense) => void;
  updateExpense: (id: string, data: Partial<OperationalExpense>) => void;

  // Finance/Accounting Data
  invoices: Invoice[];
  addInvoice: (inv: Invoice) => void;
  updateInvoice: (id: string, data: Partial<Invoice>) => void;

  tukarFakturs: TukarFaktur[];
  addTukarFaktur: (tf: TukarFaktur) => Promise<void>;
  updateTukarFaktur: (id: string, data: Partial<TukarFaktur>) => Promise<void>;
  deleteTukarFaktur: (id: string) => Promise<void>;
  issueTukarFaktur: (tfId: string, invoiceIds: string[], issueDate: string, userId: string) => Promise<unknown>;
  linkInvoicesToTukarFaktur: (tfId: string, invoiceIds: string[]) => Promise<unknown>;
  recordTukarFakturPayment: (
    tfId: string,
    allocations: Record<string, number>,
    paymentDate: string,
    bankAccountId: string,
    totalAmount: number,
    paymentId?: string
  ) => Promise<boolean>;

  // Accounts Payable (Vendor Bills)
  vendorBills: VendorBill[];
  addVendorBill: (bill: VendorBill) => Promise<void>;
  updateVendorBill: (id: string, data: Partial<VendorBill>) => Promise<void>;
  deleteVendorBill: (id: string, cleanup?: { reason: 'failed-posting' }) => Promise<void>;
  payVendorBill: (billId: string, payment: VendorBillPayment) => Promise<void>;

  journalEntries: JournalEntry[];
  addJournalEntry: (entry: JournalEntry) => Promise<void>;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>, newLines: JournalLine[]) => Promise<void>;

  journalLines: JournalLine[];
  addJournalLine: (line: JournalLine) => Promise<void>;
  addJournalLines: (lines: JournalLine[]) => Promise<void>;

  leads: Lead[];
  announcement: Announcement | null;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
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
  
  fixedAssets: FixedAsset[];
  addFixedAsset: (asset: FixedAsset) => void;
  updateFixedAsset: (id: string, updates: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;

  // Bank & Cash
  bankAccounts: BankAccount[];
  addBankAccount: (acc: BankAccount) => void;
  updateBankAccount: (id: string, data: Partial<BankAccount>) => void;
  deleteBankAccount: (id: string) => Promise<void>;
  updateBankBalance: (id: string, amount: number) => Promise<void>;
  cashTransactions: CashTransaction[];
  addCashTransaction: (tx: CashTransaction) => Promise<void>;
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
  updatePendingReturn: (id: string, data: Partial<PendingReturn>) => Promise<void>;
  vendorReturns: VendorReturn[];
  addVendorReturn: (vr: VendorReturn) => Promise<void>;
  updateVendorReturn: (id: string, data: Partial<VendorReturn>) => Promise<void>;
  rejectedItems: RejectedItem[];
  addRejectedItem: (item: RejectedItem) => void;
  updateRejectedItem: (item: RejectedItem) => Promise<void>;

  // Helpers
  resetDb: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  getHistoricalClientPrice: (clientId: string, productId: string) => number | undefined;
  
  // Dev & Simulation Helpers
  devHistoryStack: Partial<AppState>[];
  _snapshotDepth: number;
  beginUndoableBatch: () => void;
  endUndoableBatch: () => void;
  takeDevSnapshot: () => void;
  undoDevSnapshot: () => Promise<void>;
  isUndoing: boolean;
  shoppingListUndo: (() => void) | null;
  shoppingListHistoryLength: number;
  setShoppingListUndo: (cb: (() => void) | null, length: number) => void;

}


// NOTE: empty array — bank accounts must be created via UI (admin) or via import seed.
// Previously this had hardcoded seed banks that auto-re-injected on every store init,
// causing duplicates whenever a real-data import used different bank IDs.
const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];

const initialRolePermissions: RolePermissionMap = {
  super_admin: [
    'admin_hari_ini', 'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
    'admin_sales_orders', 'admin_shopping_list', 'admin_dropship', 'admin_delivery_routes', 'admin_crm',
    'admin_users', 'users_perms', 'admin_settings', 'admin_tasks', 'admin_maintenance', 'admin_price_lists', 'admin_activity_log',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 
    'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging',
    'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'finance_disbursements', 'finance_sourcing_monitor', 'finance_purchase_plan', 'finance_salin_belanja', 'finance_daily_close',
    'warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor',
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses',
    'tasks_global', 'settings_global', 'admin_loss_analytics'
  ],
  ceo: [
    'admin_hari_ini', 'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
    'admin_sales_orders', 'admin_shopping_list', 'admin_dropship', 'admin_delivery_routes', 'admin_crm',
    'admin_users', 'users_perms', 'admin_settings', 'admin_tasks', 'admin_price_lists', 'admin_activity_log',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets',
    'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging', 'finance_collections',
    'finance_audit', 'finance_documents', 'finance_disbursements', 'finance_sourcing_monitor', 'finance_purchase_plan', 'finance_salin_belanja', 'finance_daily_close',
    'warehouse_dashboard', 'warehouse_catalog', 'tasks_global', 'settings_global', 'admin_loss_analytics'
  ],
  coo: [
    'admin_hari_ini', 'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
    'admin_sales_orders', 'admin_shopping_list', 'admin_dropship', 'admin_delivery_routes', 'admin_crm',
    'admin_users', 'users_perms', 'admin_settings', 'admin_tasks', 'admin_maintenance', 'admin_price_lists', 'admin_activity_log',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets',
    'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging', 'finance_collections',
    'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents',
    'warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor',
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses',
    'tasks_global', 'settings_global'
  ],
  // CMO dulu sengaja dikosongkan ("archived for Phase 1"), tapi akunnya tetap aktif
  // dan PIN-nya tetap bisa dipakai — hasilnya login yang berhasil ke layar kosong
  // tanpa penjelasan. Diberi menu sisi penjualan supaya akunnya masuk akal.
  cmo: ['admin_dashboard', 'admin_crm', 'admin_clients', 'admin_sales_orders', 'admin_price_lists', 'tasks_global', 'settings_global'],
  // 'admin_purchase_requests' ada di sini karena halaman itu punya tombol
  // Setujui/Tolak khusus Finance. Tanpa izin ini, orang yang tombolnya dibuat
  // untuk dia tidak pernah bisa membuka halamannya. AuthGuard meloloskan siapa
  // pun yang punya kunci izin halamannya, jadi tidak perlu ubah penjaga rute.
  // Disusun mengikuti pekerjaannya, bukan isi database (27 Agu 2026). Dari 38 menu
  // jadi 13: halaman yang satu pekerjaan digabung jadi tab (Piutang, Laporan
  // keuangan, Biaya), laporan bulanan turun jadi anak menu Arsip, dan layar milik
  // peran lain dilepas. Halaman lamanya tetap hidup di alamatnya sendiri.
  finance: [
    // Harian
    'admin_hari_ini', 'finance_purchase_plan', 'finance_salin_belanja', 'finance_daily_close',
    'admin_purchase_requests',
    'finance_approvals', 'finance_settlement', 'finance_settlement_dash', 'finance_rekon',
    'finance_audit', 'finance_online_audit', 'admin_audit_pengiriman',
    // Uang
    'finance_disbursements', 'finance_cash_bank', 'finance_ap_aging', 'finance_online_purchase',
    'finance_piutang', 'finance_invoices', 'finance_collections', 'finance_ar_aging',
    'finance_laporan', 'finance_dashboard', 'finance_reports', 'finance_ledger', 'finance_sku_pnl',
    'finance_biaya', 'finance_expenses', 'finance_reimbursements',
    // Mode Salin: biaya lapangan dicatat di kertas, Finance yang menyalinnya. Tanpa
    // dua izin ini satu-satunya jalan adalah meminjam PIN orang lapangan, dan seluruh
    // jejak audit jadi menunjuk orang yang salah.
    'finance_biaya_sourcing', 'finance_biaya_kurir',
    // Sistem
    'finance_arsip', 'finance_documents', 'finance_assets', 'finance_sourcing_monitor',
    'tasks_global', 'settings_global',
  ],
  gudang: ['warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor', 'warehouse_opname', 'tasks_global', 'settings_global'],
  sourcing: ['sourcing_dashboard', 'sourcing_list', 'sourcing_expenses', 'tasks_global', 'settings_global'],
  kurir: ['courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses', 'tasks_global', 'settings_global'],
  // 'admin_purchase_requests': Admin PO yang membuat pengajuan dananya (otomatis dari
  // dokumen belanja), tapi dulu tidak punya menunya — jadi dia tidak pernah bisa
  // melihat pengajuannya sudah disetujui Finance atau belum.
  // Satu rantai kerja: pesanan masuk → disatukan → jadi kertas belanja → dipantau →
  // ditutup jadi tagihan. Dari 24 menu jadi 12 (27 Agu 2026). Layar gudang, sourcing
  // dan kurir dilepas — bagian yang benar-benar dipakainya tiap hari sudah ada di
  // layar 'Hari ini', dan penyalinan biaya lapangan sekarang di Finance.
  admin_po: [
    'admin_hari_ini',
    'admin_sales_orders', 'admin_dropship',
    // Membuka 'Konsolidasi pesanan' sekaligus 'Kertas belanja' (menumpang izin ini).
    'admin_shopping_list',
    'admin_delivery_routes', 'admin_purchase_requests', 'admin_tukar_faktur',
    'admin_products', 'admin_clients', 'admin_price_lists',
    'tasks_global', 'settings_global',
  ],
};

/**
 * Baca ulang beberapa baris dari server, by id.
 *
 * Lewat `/api/db` (kunci server), BUKAN klien Supabase di browser: tabel transaksi
 * dikunci RLS untuk kunci publik, dan pembacaannya balik NOL baris tanpa error.
 * Alur yang menulis lewat fungsi database lalu membaca sendiri hasilnya jadi diam-diam
 * tidak pernah menerima apa pun — itu yang bikin Tukar Faktur baru terbit tampil Rp0
 * dan daftar invoice anaknya kosong sampai halaman dimuat ulang.
 *
 * Balikannya sudah camelCase (rute yang mengubahnya). Gagal baca = array kosong:
 * pemanggilnya menyimpan nilai lamanya, bukan menimpanya dengan kosong.
 */
const bacaBarisById = async <T,>(table: string, ids: string[]): Promise<T[]> => {
  const bersih = ids.filter(Boolean);
  if (bersih.length === 0) return [];
  try {
    const qs = `table=${encodeURIComponent(table)}&ids=${bersih.map(encodeURIComponent).join(',')}`;
    const res = await fetch(`/api/db?${qs}`, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[DB] Gagal baca ulang ${table}: ${res.status}`);
      return [];
    }
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json.rows) ? (json.rows as T[]) : [];
  } catch (e) {
    console.warn(`[DB] Gagal baca ulang ${table}:`, e);
    return [];
  }
};

function assertSalesOrderDeletable(state: AppState, ids: string[]) {
  for (const id of ids) {
    const order = state.salesOrders.find(row => row.id === id);
    const items = state.salesOrderItems.filter(row => row.salesOrderId === id);
    if (!order || order.status !== 'Draft' || order.shoppingListDocumentId
      || state.invoices.some(row => row.salesOrderId === id)
      || state.deliveries.some(row => row.salesOrderId === id)
      || state.purchaseItems.some(row => row.salesOrderId === id)
      || state.stockMovements.some(row => row.salesOrderId === id)
      || items.some(row => Number(row.qtyFinal || 0) > 0)
      || state.journalEntries.some(row => row.referenceId === id)
      || state.cashTransactions.some(row => row.referenceId === id)) {
      throw new Error('PO sudah memiliki progres atau dokumen turunan; penghapusan ditolak.');
    }
  }
}

async function commandTukarFaktur(action: 'issue' | 'link' | 'delete', params: Record<string, unknown>) {
  const response = await fetch('/api/tukar-faktur', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error) throw new Error(payload?.error || 'Perintah tukar faktur gagal.');
  return payload as { data?: unknown; error?: { message: string } };
}

export const useAppStore = create<AppState>((set, get) => {
  const actions: AppState = {
      currentUser: loadCurrentUserFromStorage(),
      isSessionVerified: false,
      setCurrentUser: (user) => {
        const safe = user ? publicStoreUser(user) : null;
        saveCurrentUserToStorage(safe);
        const previous = get().currentUser;
        set({ currentUser: safe, isSessionVerified: get().isSessionVerified && !!safe
          && safe.id === previous?.id && safe.role === previous?.role && safe.isActive !== false });
      },
      setServerSession: (user) => {
        const safe = user ? publicStoreUser(user) : null;
        saveCurrentUserToStorage(safe);
        set({ currentUser: safe, isSessionVerified: !!safe && safe.isActive !== false });
      },
      users: [],
      rolePermissions: initialRolePermissions,
      navConfigs: {},
      addUser: async (user) => {
        set((state) => ({ users: [...state.users, publicStoreUser(user)] }));
        await get().syncTable('users', user);
      },
      updateUser: async (id, data) => {
        const before = get().users.find(user => user.id === id);
        if (!before) throw new Error('Personel tidak ditemukan.');
        const transport = { ...before, ...data };
        const safe = publicStoreUser(transport);
        set(state => ({ users: state.users.map(user => user.id === id ? safe : user) }));
        await get().syncTable('users', transport);
        // PIN rotations are recorded by the authenticated server provisioning path.
        await get().logHistory({ table: 'users', recordId: id, action: 'update', oldData: publicStoreUser(before), newData: safe });
      },

      isSyncing: false,
      isHydrated: false,
      hydratedFromCache: false,
      isResetting: false,
      _ignoreBroadcastUntil: 0,
      _lastLocalMutationAt: 0,
      _locallyEditedNavRoles: [],
      _locallyEditedPermissionRoles: [],

      syncTable: async (table: string, data: any, silent = false) => {
        if (!table || !table.trim()) throw new Error('Database table is required.');
        set({ _lastLocalMutationAt: Date.now(), isSyncing: true });
        try {
          await checkedDbMutation('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data }),
          });
          if (!silent && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
            set({ _ignoreBroadcastUntil: Date.now() + 2000 });
            const bc = new BroadcastChannel('disma_core_sync');
            bc.postMessage({ type: 'SYNC_UPDATE', table });
            bc.close();
          }
        } catch (error) {
          if (!silent && typeof window !== 'undefined') toast.error(`Gagal menyimpan ${table}. Perubahan dibatalkan.`, { duration: 8000 });
          throw error;
        } finally {
          set({ isSyncing: false });
        }
      },

      logHistory: async (params) => {
        try {
          const user = get().currentUser;
          let changedFields: string[] = [];
          if (params.oldData && params.newData) {
            const keys = new Set([...Object.keys(params.oldData), ...Object.keys(params.newData)]);
            keys.forEach(k => {
              if (JSON.stringify(params.oldData[k]) !== JSON.stringify(params.newData[k])) {
                changedFields.push(k);
              }
            });
          }
          if (params.action === 'update' && changedFields.length === 0) return;

          const row = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            tableName: params.table,
            recordId: params.recordId,
            action: params.action,
            changedFields,
            oldData: params.oldData,
            newData: params.newData,
            userId: user?.id ?? null,
            userName: user?.name ?? null,
            userRole: user?.role ?? null,
            reason: params.reason ?? null,
            parentHistoryId: params.parentHistoryId ?? null,
            createdAt: new Date().toISOString(),
          };
          await get().syncTable('record_history', row, true);
        } catch (e) {
          console.warn('[Audit] logHistory failed (non-fatal):', e);
        }
      },

      init: async () => {
        if (get().isSyncing) return; // Prevent overwriting in-flight changes
        
        // === PHASE 1: INSTANT CACHE HYDRATION (< 1ms) ===
        // Load from localStorage immediately so UI is never blank
        if (typeof window !== 'undefined' && !get().isHydrated) {
          const cachedClients = loadLocalClientsCache();
          const cachedProducts = loadLocalProductsCache();
          const cachedSalesOrders = loadLocalSalesOrdersCache();
          const cachedSalesOrderItems = loadLocalSalesOrderItemsCache();
          const cachedPurchases = loadLocalPurchasesCache();
          const cachedPurchaseItems = loadLocalPurchaseItemsCache();
          const cachedBankAccounts = loadLocalBankAccountsCache();
          const cachedJournalEntries = loadLocalCache<JournalEntry>(LOCAL_JOURNAL_ENTRIES_CACHE_KEY);
          const cachedJournalLines = loadLocalCache<JournalLine>(LOCAL_JOURNAL_LINES_CACHE_KEY);
          const cachedCashTransactions = loadLocalCache<CashTransaction>(LOCAL_CASH_TRANSACTIONS_CACHE_KEY);
          const cachedInvoices = loadLocalCache<Invoice>(LOCAL_INVOICES_CACHE_KEY);
          const cachedDeliveries = loadLocalCache<Delivery>(LOCAL_DELIVERIES_CACHE_KEY);
          const cachedLeads = loadLocalLeadsCache();
          const cachedPurchaseRequests = loadLocalPurchaseRequestsCache();
          const cachedDisbursementRequests = loadLocalDisbursementRequestsCache();
          const cachedClientPrices = loadLocalCache<ClientPrice>(LOCAL_CLIENT_PRICES_CACHE_KEY);

          const hasCache = cachedClients.length > 0 || cachedProducts.length > 0 || cachedSalesOrders.length > 0 || cachedLeads.length > 0 || cachedPurchaseRequests.length > 0 || cachedDisbursementRequests.length > 0;
          if (hasCache) {
            console.log('[INIT] Phase 1: Hydrating from localStorage cache...');
            set({
              clients: cachedClients.length > 0 ? cachedClients : get().clients,
              products: cachedProducts.length > 0 ? cachedProducts : get().products,
              salesOrders: cachedSalesOrders.length > 0 ? cachedSalesOrders : get().salesOrders,
              salesOrderItems: cachedSalesOrderItems.length > 0 ? cachedSalesOrderItems : get().salesOrderItems,
              purchases: cachedPurchases.length > 0 ? cachedPurchases : get().purchases,
              purchaseItems: cachedPurchaseItems.length > 0 ? cachedPurchaseItems : get().purchaseItems,
              clientPrices: cachedClientPrices.length > 0 ? cachedClientPrices : get().clientPrices,
              bankAccounts: cachedBankAccounts.length > 0 ? cachedBankAccounts : get().bankAccounts,
              journalEntries: cachedJournalEntries.length > 0 ? cachedJournalEntries : get().journalEntries,
              journalLines: cachedJournalLines.length > 0 ? cachedJournalLines : get().journalLines,
              cashTransactions: cachedCashTransactions.length > 0 ? cachedCashTransactions : get().cashTransactions,
              invoices: cachedInvoices.length > 0 ? cachedInvoices : get().invoices,
              deliveries: cachedDeliveries.length > 0 ? cachedDeliveries : get().deliveries,
              leads: cachedLeads.length > 0 ? cachedLeads : get().leads,
              purchaseRequests: cachedPurchaseRequests.length > 0 ? cachedPurchaseRequests : get().purchaseRequests,
              disbursementRequests: cachedDisbursementRequests.length > 0 ? cachedDisbursementRequests : get().disbursementRequests,
            });
          }
          // Mark as hydrated — UI can render with cached data now
          set({ isHydrated: true, hydratedFromCache: hasCache });
        }

        // === PHASE 2: SEQUENTIAL API FETCH (one group at a time, no timeout) ===
        try {
          set({ isSyncing: true });
          console.log('[INIT] Phase 2: Fetching data via API (5 parallel groups)...');
          const ts = Date.now();
          // Baseline for stale-snapshot detection: if any local mutation lands AFTER
          // this point while we're still fetching, the server snapshot is stale and
          // applying it would flicker the just-changed values back to old.
          const fetchStartedAt = Date.now();
          
          // Grup yang gagal dimuat bikin sebagian layar tampil KOSONG padahal datanya
          // ada di server. Dulu hanya dicatat di konsol, jadi dari sisi pemakai
          // bedanya tidak kelihatan dengan "memang belum ada datanya".
          const failedGroups: number[] = [];

          const sekaliAmbil = async (group: number): Promise<Record<string, any> | null> => {
            const controller = new AbortController();
            // Vercel functions run up to 300s; 45s cukup untuk grup terbesar yang tersisa
            // sejak daftar harga klien dipisah ke grup 6.
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            try {
              const res = await fetch(`/api/db?group=${group}&ts=${ts}`, {
                cache: 'no-store',
                signal: controller.signal,
              });
              if (!res.ok) {
                console.warn(`[INIT] Group ${group} returned ${res.status}`);
                return null;
              }
              const json = await res.json();
              return (json && !json.error) ? json : {};
            } catch (e) {
              console.warn(`[INIT] Group ${group} failed:`, e);
              return null;
            } finally {
              clearTimeout(timeoutId);
            }
          };

          // Sekali gagal belum tentu datanya bermasalah — paling sering cuma koneksi ke
          // database yang sedang penuh. Dicoba ulang sekali sebelum menyerah, karena
          // menyerah artinya layar tampil kosong padahal datanya ada di server.
          const fetchGroup = async (group: number): Promise<Record<string, any>> => {
            const pertama = await sekaliAmbil(group);
            if (pertama) return pertama;
            await new Promise(r => setTimeout(r, 1200));
            const kedua = await sekaliAmbil(group);
            if (kedua) {
              console.log(`[INIT] Group ${group} berhasil di percobaan kedua.`);
              return kedua;
            }
            failedGroups.push(group);
            return {};
          };

          // Dua grup sekaligus, bukan lima.
          //
          // Tiap grup di server membuka sampai 14 kueri paralel ke Postgres. Lima grup
          // serentak berarti ~35 koneksi dalam satu tarikan napas — kolam koneksinya
          // habis, satu-dua permintaan balik 500, dan pemakai melihat peringatan "sebagian
          // data gagal dimuat" yang grupnya berganti-ganti tiap kali. Dua per gelombang
          // menahan angkanya di sekitar 15 tanpa membuat waktu bukanya terasa lebih lama.
          const hasil: Record<string, any>[] = [];
          for (let i = 1; i <= 5; i += 2) {
            const gelombang = [i, i + 1].filter(g => g <= 5);
            hasil.push(...await Promise.all(gelombang.map(fetchGroup)));
          }
          const [g1, g2, g3, g4, g5] = hasil;

          if (failedGroups.length > 0 && typeof window !== 'undefined') {
            const { toast } = await import('sonner');
            toast.error(
              `⚠️ Sebagian data gagal dimuat (grup ${failedGroups.join(', ')}). Layar tertentu bisa tampil kosong — muat ulang halaman.`,
              { duration: 10000 }
            );
          }

          // client_prices (group 6) is ~20k rows / 5.7MB — bigger than every
          // other group combined, and it used to dominate boot from inside
          // group 1. Nothing on the first screen reads it, so fetch it DETACHED:
          // the app renders on Phase 1's cached copy and the fresh rows swap in
          // when they land.
          // ponytail: still fetches all clients' prices; every consumer filters
          // to one client, so move to a per-client endpoint if 20k stops fitting.
          const pricesBefore = get().clientPrices;
          void fetchGroup(6).then((g6) => {
            if (g6.clientPrices === undefined) return;
            // A local price edit while this was in flight replaces the array, so
            // an unchanged reference means it is safe to apply the server copy.
            if (get().clientPrices !== pricesBefore) {
              console.warn('[INIT] Client prices edited during fetch — keeping local copy.');
              return;
            }
            set({ clientPrices: g6.clientPrices });
            // Best-effort: at ~5MB this is already at the per-origin quota and
            // usually will not fit, in which case saveLocalCache drops the older
            // copy instead of leaving a stale one to hydrate from.
            saveLocalCache(LOCAL_CLIENT_PRICES_CACHE_KEY, g6.clientPrices);
            console.log(`[INIT] Client prices loaded in background (${g6.clientPrices.length} rows).`);
          });

          // Merge all groups into a single data object
          const data: Record<string, any> = { ...g1, ...g2, ...g3, ...g4, ...g5 };
          
          // Check if we got meaningful data from the server
          const hasAnyData = Object.values(data).some(v => Array.isArray(v) && v.length > 0);
          
          // CRITICAL SAFETY: If server returned empty but we already have local data, DON'T wipe it.
          // This prevents the devastating bug where a timeout/hibernation causes all data to disappear.
          const currentState = get();
          const localHasData = (currentState.clients?.length > 0) || (currentState.products?.length > 0) || (currentState.salesOrders?.length > 0);
          
          if (!hasAnyData && localHasData) {
            console.warn('[INIT] ⚠️ Server returned EMPTY data but local state has data. REFUSING to overwrite. Server may be hibernating.');
            if (typeof window !== 'undefined') {
              const { toast } = await import('sonner');
              toast.warning('Server tidak merespon (mungkin hibernasi). Data lokal dipertahankan. Coba sync lagi dalam 1 menit.', { duration: 10000 });
            }
            return; // EXIT EARLY — do NOT replace state with empty data
          }
          
          if (hasAnyData) {

            // IDs from the database are authoritative. Code seeds must never
            // shadow a real account with the same code but another primary key.
            const mergedCoas = Array.isArray(data.coas) ? data.coas : get().coas;

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
            const localBanks = get().bankAccounts;
            let mergedBanks: BankAccount[] = [];

            const hasServerData = data.bankAccounts && Array.isArray(data.bankAccounts) && data.bankAccounts.length > 0;
            
            if (hasServerData) {
              // DB is truth.
              mergedBanks = [...data.bankAccounts];
              // Sync local to DB only if we have NEW local banks added during this session
              // We do not append local banks if we have server data.
              // The server is the absolute truth for bank accounts.
            } else {
              // DB is empty. Check if we have local data from previous sessions
              if (localBanks.length > 0) {
                mergedBanks = localBanks;
              } else {
                // Completely fresh: Seed
                mergedBanks = [...INITIAL_BANK_ACCOUNTS];
                // Missing master data is never seeded during hydration.
              }
            }
            
            // Final Deduplication based on ID
            const finalUniqueBanks: BankAccount[] = [];
            const seenIds = new Set();
            mergedBanks.forEach(b => {
              if (!seenIds.has(b.id)) {
                seenIds.add(b.id);
                finalUniqueBanks.push(b);
              }
            });
            mergedBanks = finalUniqueBanks;

            // Server identities and activation are authoritative; do not resurrect
            // deleted accounts or copy credentials from seeds/old browser state.
            const mergedUsers = (Array.isArray(data.users) ? data.users : get().users).map(publicStoreUser);

            // --- SERVER IS KING: No more smartMerge with local cache ---
            // Direct Supabase fetch succeeded. Use server data as the single source of truth.
            // This ensures ALL browsers/devices see the exact same data.

            let finalProducts = get().products;
            if (data.products !== undefined) {
              finalProducts = data.products;
            }
            const sm = data.stockMovements !== undefined ? data.stockMovements : get().stockMovements;
            finalProducts = calculateDynamicStockForProducts(finalProducts, sm);

            // --- HPP Re-mapping logic ---

            // Only update rolePermissions and navConfigs if the server actually provided them
            const finalRolePermissions = hasServerPermissions ? mergedPermissions : get().rolePermissions;
            let resolvedRolePermissions = { ...finalRolePermissions };
            // PER-ROLE LOCAL LOCK FOR PERMISSIONS: keeps local unsaved changes from being reverted by background poll
            const editedPermRoles = get()._locallyEditedPermissionRoles || [];
            if (editedPermRoles.length > 0) {
              const localPerms = get().rolePermissions;
              editedPermRoles.forEach((r) => {
                if (localPerms[r]) resolvedRolePermissions[r] = localPerms[r];
              });
            }

            let finalNavConfigs = (data.navConfigs && Object.keys(data.navConfigs).length > 0) ? data.navConfigs : get().navConfigs;
            // PER-ROLE LOCAL LOCK: any role the user edited this session keeps its
            // local value, regardless of what the server snapshot says. Prevents the
            // "save then revert a few seconds later" bug when an in-flight/poll init
            // applies a server snapshot taken before the save committed.
            const editedRoles = get()._locallyEditedNavRoles;
            if (editedRoles.length > 0) {
              const localNav = get().navConfigs;
              finalNavConfigs = { ...finalNavConfigs };
              editedRoles.forEach((r) => {
                if (localNav[r]) finalNavConfigs[r] = localNav[r];
              });
            }

            const defaultMargins = {
              'Standard': 0,
              'Tier 1': 30,
              'Tier 2': 25,
              'Tier 3': 20,
              'Tier 4': 10,
              'Tier 5': 15,
              'Custom': 0
            };

            // --- FINAL STATE UPDATE: SERVER DATA WINS ---
            const updatedState: Partial<AppState> = {
              coas: mergedCoas,
              rolePermissions: resolvedRolePermissions,
              navConfigs: finalNavConfigs,
              bankAccounts: mergedBanks,
              users: mergedUsers,
              tierMargins: data.tierMargins && typeof data.tierMargins === 'object' && Object.keys(data.tierMargins).length > 0
                ? { ...defaultMargins, ...data.tierMargins }
                : defaultMargins
            };

            const setIfDefined = (key: keyof AppState, val: any) => {
              if (val !== undefined) {
                (updatedState as any)[key] = val;
              }
            };

            setIfDefined('clients', data.clients);
            if (data.products !== undefined) updatedState.products = finalProducts;
            setIfDefined('salesOrders', data.salesOrders);
            setIfDefined('salesOrderItems', data.salesOrderItems);
            setIfDefined('purchases', data.purchases);
            setIfDefined('purchaseItems', data.purchaseItems);
            setIfDefined('purchaseRequests', data.purchaseRequests);
            setIfDefined('disbursementRequests', data.disbursementRequests);
            setIfDefined('tutupHariKantong', data.tutupHariKantong);
            setIfDefined('dailyCloses', data.dailyCloses);
            setIfDefined('creditNotes', data.creditNotes);
            setIfDefined('dailyCostConfig', data.dailyCostConfig);
            if (typeof data.minMarginPct === 'number') updatedState.minMarginPct = data.minMarginPct;
            setIfDefined('cashTransactions', data.cashTransactions);
            setIfDefined('journalEntries', data.journalEntries);
            setIfDefined('journalLines', data.journalLines);
            setIfDefined('invoices', data.invoices);
            setIfDefined('tukarFakturs', data.tukarFakturs);
            setIfDefined('vendorBills', data.vendorBills);
            setIfDefined('deliveries', data.deliveries);
            setIfDefined('leads', data.leads);
            setIfDefined('tasks', data.tasks);
            setIfDefined('reimbursements', data.reimbursements);
            setIfDefined('expenses', data.expenses);
            setIfDefined('stockMovements', data.stockMovements);
            // clientPrices intentionally absent — group 6 applies it detached above.
            setIfDefined('vendorPrices', data.vendorPrices);
            setIfDefined('vendors', data.vendors);
            setIfDefined('notifications', data.notifications);
            setIfDefined('fixedAssets', data.fixedAssets);
            setIfDefined('pendingReturns', data.pendingReturns);
            setIfDefined('vendorReturns', data.vendorReturns);
            setIfDefined('priceBaseline', data.priceBaseline);
            setIfDefined('rejectedItems', data.rejectedItems);

            // STALE-SNAPSHOT GUARD: a local mutation (transfer, cash tx, any write)
            // committed while this fetch was in flight. The data we just fetched
            // predates it — applying it would flicker the new values back to old.
            // Discard this snapshot; the next init()/poll will reconcile cleanly.
            if (get()._lastLocalMutationAt > fetchStartedAt) {
              console.warn('[INIT] Local mutation during fetch — discarding stale server snapshot to avoid flicker.');
              return;
            }

            set(updatedState);

            console.log('[INIT] Phase 2 complete. Server data applied as single source of truth.');

            // --- UPDATE LOCAL CACHE (for Phase 1 on next load) ---
            if (data.clients !== undefined) saveLocalClientsCache(data.clients);
            if (data.vendors !== undefined) saveLocalCache(LOCAL_VENDORS_CACHE_KEY, data.vendors);
            if (data.products !== undefined) saveLocalProductsCache(finalProducts);
            if (data.salesOrders !== undefined) saveLocalSalesOrdersCache(data.salesOrders);
            if (data.salesOrderItems !== undefined) saveLocalSalesOrderItemsCache(data.salesOrderItems);
            if (data.purchases !== undefined) saveLocalPurchasesCache(data.purchases);
            if (data.purchaseItems !== undefined) saveLocalPurchaseItemsCache(data.purchaseItems);
            if (data.purchaseRequests !== undefined) saveLocalPurchaseRequestsCache(data.purchaseRequests);
            saveLocalBankAccountsCache(mergedBanks);
            if (data.journalEntries !== undefined) saveLocalCache(LOCAL_JOURNAL_ENTRIES_CACHE_KEY, data.journalEntries);
            if (data.journalLines !== undefined) saveLocalCache(LOCAL_JOURNAL_LINES_CACHE_KEY, data.journalLines);
            if (data.cashTransactions !== undefined) saveLocalCache(LOCAL_CASH_TRANSACTIONS_CACHE_KEY, data.cashTransactions);
            if (data.invoices !== undefined) saveLocalCache(LOCAL_INVOICES_CACHE_KEY, data.invoices);
            if (data.deliveries !== undefined) saveLocalCache(LOCAL_DELIVERIES_CACHE_KEY, data.deliveries);
            if (data.leads !== undefined) saveLocalLeadsCache(data.leads);


          }
        } catch (error) {
          console.error('Store Init Error:', error);
        } finally {
          set({ isSyncing: false });
        }
      },

      forceSync: async () => {
        console.log('[SYNC] Force sync triggered — fetching fresh data from server...');
        // Step 1: Reset syncing flag so init() doesn't skip
        set({ isSyncing: false });
        // Step 2: Re-run init to fetch fresh data from server
        // NOTE: We do NOT clear caches first anymore!
        // init() has a safety check: it will NOT overwrite local data with empty server response.
        // Caches are updated AFTER successful fetch inside init() (line ~720).
        await get().init();
        console.log('[SYNC] Force sync complete.');
      },

      saveToHdd: async () => {
        const state = get();
        // Guard: Don't save if state looks suspicious/empty to avoid wiping DB during failed init
        const hasNav = Object.keys(state.navConfigs).length > 0;
        const hasPermissions = Object.keys(state.rolePermissions).some(
          (role) => (state.rolePermissions[role]?.length ?? 0) > 0
        );
        
        if (!hasNav && !hasPermissions) {
           console.warn("[Storage] Suspending saveToHdd: state looks uninitialized.");
           return;
        }

        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: {
            ...state.navConfigs,
            tier_margins: state.tierMargins,
            min_margin_pct: state.minMarginPct
          },
          role_permissions: state.rolePermissions
        }, true);
      },

      isSidebarMinimized: false,
      toggleSidebar: () => set((state) => ({ isSidebarMinimized: !state.isSidebarMinimized })),

      tierMargins: {
        'Standard': 0,
        'Tier 1': 30,
        'Tier 2': 25,
        'Tier 3': 20,
        'Tier 4': 10,
        'Tier 5': 15,
        'Custom': 0
      },
      updateTierMargins: async (margins) => {
        set({ tierMargins: margins });
        const state = get();
        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: {
            ...state.navConfigs,
            tier_margins: margins
          },
          role_permissions: state.rolePermissions
        }, true);
      },

      minMarginPct: DEFAULT_MIN_MARGIN_PCT,
      updateMinMarginPct: async (pct) => {
        set({ minMarginPct: pct });
        const state = get();
        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: {
            ...state.navConfigs,
            tier_margins: state.tierMargins,
            min_margin_pct: pct
          },
          role_permissions: state.rolePermissions
        }, true);
      },
      priceBaseline: null,

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
      // Untuk klien yang salah diinput dan belum pernah dipakai. Menolak kalau
      // klien sudah punya PO, tagihan, atau tukar faktur — lihat client-delete.ts
      // untuk alasannya. Daftar harganya ikut terhapus supaya tidak jadi yatim.
      deleteClient: async (id) => {
        const state = get();
        if (!state.currentUser || !canManageClientDeletion(state.currentUser.role)) {
          toast.error('Hanya Super Admin atau Owner yang boleh menghapus klien.');
          return false;
        }
        const before = state.clients.find(c => c.id === id);
        if (!before) return false;

        const blockers = clientDeletionBlockers(id, {
          salesOrders: state.salesOrders || [],
          invoices: state.invoices || [],
          tukarFakturs: state.tukarFakturs || [],
          clientPrices: state.clientPrices || [],
          clients: state.clients || [],
        });
        if (blockers.length > 0) {
          toast.error(`${before.companyName} sudah punya ${describeBlockers(blockers)} — tidak bisa dihapus.`);
          return false;
        }

        try {
          const res = await checkedDbMutation('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'clients', id, actor: { id: state.currentUser.id, pin: state.currentUser.pin } })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Gagal menghapus klien');
          }

          const remaining = get().clients.filter(c => c.id !== id);
          const remainingPrices = get().clientPrices.filter(p => p.clientId !== id);
          set({ clients: remaining, clientPrices: remainingPrices });
          saveLocalClientsCache(remaining);
          saveLocalCache(LOCAL_CLIENT_PRICES_CACHE_KEY, remainingPrices);
          await get().logHistory({ table: 'clients', recordId: id, action: 'delete', oldData: before, newData: null });
          toast.success(`Klien ${before.companyName} dihapus.`);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          toast.error(`Gagal menghapus klien: ${message}`);
          return false;
        }
      },
      setClientLocation: async (clientId, lat, lng, note) => {
        const before = get().clients.find(c => c.id === clientId);
        if (!before) return;
        const patch: Partial<Client> = { latitude: lat, longitude: lng };
        // Catatan patokan hanya ditimpa kalau memang diisi — kurir yang merekam
        // GPS tidak boleh menghapus patokan yang sudah ditulis Admin PO.
        if (note !== undefined) patch.locationNote = note;
        const updated = get().clients.map(c => c.id === clientId ? { ...c, ...patch } : c);
        set({ clients: updated });
        saveLocalClientsCache(updated);
        const after = updated.find(c => c.id === clientId);
        if (after) {
          await get().syncTable('clients', after);
          await get().logHistory({ table: 'clients', recordId: clientId, action: 'update', oldData: before, newData: after });
        }
      },

      // Satu simpanan untuk seluruh papan rencana. Menyimpan per baris berarti
      // puluhan permintaan tiap kali Admin PO menggeser satu perhentian.
      assignRoute: async (updates) => {
        if (updates.length === 0) return;
        const map = new Map(updates.map(u => [u.salesOrderId, u]));
        const updated = get().salesOrders.map(so => {
          const u = map.get(so.id);
          if (!u) return so;
          return { ...so, assignedCourierId: u.courierId || undefined, routeOrder: u.routeOrder };
        });
        set({ salesOrders: updated });
        saveLocalSalesOrdersCache(updated);
        const changed = updated.filter(so => map.has(so.id));
        const res = await checkedDbMutation('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'sales_orders', data: changed })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Gagal menyimpan rencana rute');
        }
      },

      updateClient: async (id, data) => {
        const before = get().clients.find(c => c.id === id);
        const updatedClients = get().clients.map(c => c.id === id ? { ...c, ...data } : c);
        set({ clients: updatedClients });
        saveLocalClientsCache(updatedClients);
        const updated = get().clients.find(c => c.id === id);
        if (updated) {
          await get().syncTable('clients', updated);
          if (before) await get().logHistory({ table: 'clients', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      updateMultipleClients: async (updates) => {
        if (!updates.length) return;
        set({ isSyncing: true });
        try {
          const beforeClients = [...(get().clients || [])];
          const clientMap = new Map(beforeClients.map(c => [c.id, c]));
          updates.forEach(update => {
            const c = clientMap.get(update.id);
            if (c) clientMap.set(update.id, { ...c, ...update.data });
          });
          const updatedClients = Array.from(clientMap.values());
          
          // Prepare payload with complete updated client data to satisfy DB constraints
          const clientsToSync = updates.map(u => updatedClients.find(c => c.id === u.id)).filter(Boolean);

          const response = await checkedDbMutation('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              table: 'clients', 
              data: clientsToSync
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Sync failed: ${errText}`);
          }

          const beforeById = new Map(beforeClients.map(row => [row.id, row]));
          const changedById = new Map(clientsToSync.map(row => [row!.id, row!]));
          const mergedClients = get().clients.map(row => row === beforeById.get(row.id) && changedById.has(row.id) ? changedById.get(row.id)! : row);
          set({ clients: mergedClients });
          saveLocalClientsCache(mergedClients);

          for (const u of updates) {
            const before = beforeClients.find(c => c.id === u.id);
            const after = updatedClients.find(c => c.id === u.id);
            if (before && after) {
              await get().logHistory({ table: 'clients', recordId: u.id, action: 'update', oldData: before, newData: after });
            }
          }
        } catch (e: any) {
          console.error("Failed to update multiple clients:", e);
          toast.error("Gagal melakukan pembaruan massal di database: " + e.message);
          throw e;
        } finally {
          set({ isSyncing: false });
        }
      },

      vendors: loadLocalCache<Vendor>(LOCAL_VENDORS_CACHE_KEY),
      vendorsLoading: false,
      vendorsError: null,
      refreshVendors: async () => {
        if (get().vendorsLoading) return;
        const before = get().vendors;
        set({ vendorsLoading: true, vendorsError: null });
        try {
          const response = await fetch('/api/db?group=vendors', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error('Vendor request failed');
          const data = await response.json();
          if (!Array.isArray(data.vendors)) throw new Error('Invalid vendor response');
          // Preserve vendors edited while the request was in flight.
          if (get().vendors === before) set({ vendors: data.vendors });
          saveLocalCache(LOCAL_VENDORS_CACHE_KEY, get().vendors);
        } catch {
          set({ vendorsError: 'Daftar vendor terbaru belum berhasil dimuat. Coba lagi.' });
        } finally {
          set({ vendorsLoading: false });
        }
      },
      addVendor: async (vendor) => {
        set((state) => ({ vendors: [...state.vendors, vendor] }));
        await get().syncTable('vendors', vendor);
      },
      updateVendor: async (id, data) => {
        const before = get().vendors.find(v => v.id === id);
        set((state) => ({
          vendors: state.vendors.map(v => v.id === id ? { ...v, ...data } : v)
        }));
        const updated = get().vendors.find(v => v.id === id);
        if (updated) {
          await get().syncTable('vendors', updated);
          if (before) await get().logHistory({ table: 'vendors', recordId: id, action: 'update', oldData: before, newData: updated });
        }
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
        const before = get().products.find(p => p.id === id);
        const updatedProducts = get().products.map(p => p.id === id ? { ...p, ...data } : p);
        set({ products: updatedProducts });
        saveLocalProductsCache(updatedProducts);
        const updated = updatedProducts.find(p => p.id === id);
        if (updated) {
          await get().syncTable('products', updated);
          if (before) await get().logHistory({ table: 'products', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      updateMultipleProducts: async (updates) => {
        if (!updates.length) return;
        set({ isSyncing: true });
        try {
          const productMap = new Map((get().products || []).map(p => [p.id, p]));
          updates.forEach(update => {
            const p = productMap.get(update.id);
            if (p) productMap.set(update.id, { ...p, ...update.data });
          });
          const updatedProducts = Array.from(productMap.values());
          set({ products: updatedProducts });
          saveLocalProductsCache(updatedProducts);

          // Bulk sync to DB
          await checkedDbMutation('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              table: 'products', 
              data: updates.map(u => ({ id: u.id, ...u.data })) // Supabase upsert will handle this
            })
          });
        } finally {
          set({ isSyncing: false });
        }
      },
      stockMovements: [],
      addStockMovement: async (movement) => {
        const updatedMovements = [movement, ...get().stockMovements];
        const updatedProducts = calculateDynamicStockForProducts(get().products, updatedMovements);
        set({ 
          stockMovements: updatedMovements,
          products: updatedProducts 
        });
        saveLocalProductsCache(updatedProducts);
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
        const before = get().salesOrders.find(so => so.id === id);
        const updatedSalesOrders = get().salesOrders.map(so => so.id === id ? { ...so, ...data } : so);
        set({ salesOrders: updatedSalesOrders });
        saveLocalSalesOrdersCache(updatedSalesOrders);
        const updated = get().salesOrders.find(so => so.id === id);
        if (updated) {
          await get().syncTable('sales_orders', updated);
          if (before) await get().logHistory({ table: 'sales_orders', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteSalesOrder: async (id: string) => {
        assertSalesOrderDeletable(get(), [id]);
        get().takeDevSnapshot();
        const orderBefore = get().salesOrders.find(so => so.id === id);
        const itemsToDelete = get().salesOrderItems.filter(item => item.salesOrderId === id);
        const itemIds = itemsToDelete.map(item => item.id);

        const updatedSalesOrders = get().salesOrders.filter(so => so.id !== id);
        const updatedSalesOrderItems = get().salesOrderItems.filter(item => item.salesOrderId !== id);

        set({ salesOrders: updatedSalesOrders, salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrdersCache(updatedSalesOrders);
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);

        try {
          if (itemIds.length > 0) {
            await checkedDbMutation('/api/db', {
              method: 'DELETE',
              body: JSON.stringify({ table: 'sales_order_items', id: itemIds }),
            });
          }
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            body: JSON.stringify({ table: 'sales_orders', id }),
          });

          if (orderBefore) await get().logHistory({ table: 'sales_orders', recordId: id, action: 'delete', oldData: orderBefore, newData: null });
        } catch (e) {
          console.error("Failed to delete sales order:", e);
          throw e;
        }
      },
      deleteMultipleSalesOrders: async (ids: string[]) => {
        assertSalesOrderDeletable(get(), ids);
        get().takeDevSnapshot();
        const ordersBefore = get().salesOrders.filter(so => ids.includes(so.id));
        const itemsToDelete = get().salesOrderItems.filter(item => ids.includes(item.salesOrderId));
        const itemIds = itemsToDelete.map(item => item.id);

        const updatedSalesOrders = get().salesOrders.filter(so => !ids.includes(so.id));
        const updatedSalesOrderItems = get().salesOrderItems.filter(item => !ids.includes(item.salesOrderId));

        set({ salesOrders: updatedSalesOrders, salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrdersCache(updatedSalesOrders);
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);

        try {
          if (itemIds.length > 0) {
            await checkedDbMutation('/api/db', {
              method: 'DELETE',
              body: JSON.stringify({ table: 'sales_order_items', id: itemIds }),
            });
          }
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            body: JSON.stringify({ table: 'sales_orders', id: ids }),
          });

          for (const order of ordersBefore) {
            await get().logHistory({ table: 'sales_orders', recordId: order.id, action: 'delete', oldData: order, newData: null });
          }
        } catch (e) {
          console.error("Failed to bulk delete sales orders:", e);
          throw e;
        }
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
        const before = get().salesOrderItems.find(item => item.id === id);
        const updatedSalesOrderItems = get().salesOrderItems.map(item => item.id === id ? { ...item, ...data } : item);
        set({ salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);
        const updated = get().salesOrderItems.find(item => item.id === id);
        if (updated) {
          await get().syncTable('sales_order_items', updated);
          if (before) await get().logHistory({ table: 'sales_order_items', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteSalesOrderItem: async (id) => {
        const before = get().salesOrderItems.find(item => item.id === id);
        const updatedSalesOrderItems = get().salesOrderItems.filter(item => item.id !== id);
        set({ salesOrderItems: updatedSalesOrderItems });
        saveLocalSalesOrderItemsCache(updatedSalesOrderItems);
        await checkedDbMutation('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'sales_order_items', id }) });
        if (before) await get().logHistory({ table: 'sales_order_items', recordId: id, action: 'delete', oldData: before, newData: null });
      },

      purchases: [],
      addPurchase: async (p) => {
        const updatedPurchases = [...get().purchases, p];
        set({ purchases: updatedPurchases });
        saveLocalPurchasesCache(updatedPurchases);
        await get().syncTable('purchases', p);
      },
      updatePurchase: async (id, data) => {
        const before = get().purchases.find(p => p.id === id);
        const updatedPurchases = get().purchases.map(p => p.id === id ? { ...p, ...data } : p);
        set({ purchases: updatedPurchases });
        saveLocalPurchasesCache(updatedPurchases);
        const updated = get().purchases.find(p => p.id === id);
        if (updated) {
          await get().syncTable('purchases', updated);
          if (before) await get().logHistory({ table: 'purchases', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deletePurchase: async (id: string) => {
        const state = get();
        const purchase = state.purchases.find(p => p.id === id);
        if (!purchase) throw new Error('Dokumen belanja tidak ditemukan.');
        const children = state.purchaseItems.filter(item => item.purchaseId === id);
        const refs = new Set([id, ...children.map(item => item.id)]);
        if (children.length || state.vendorBills.some(bill => bill.purchaseId === id)
          || state.salesOrders.some(order => order.shoppingListDocumentId === id)
          || state.stockMovements.some(row => refs.has(row.referenceId || ''))
          || state.cashTransactions.some(row => refs.has(row.referenceId || ''))
          || state.journalEntries.some(row => refs.has(row.referenceId || ''))
          || !['Draft', 'Pending'].includes(purchase.status)) {
          throw new Error('Dokumen belanja sudah memiliki detail atau riwayat. Penghapusan ditolak; gunakan pembatalan sumber.');
        }
        await checkedDbMutation('/api/db', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'purchases', id }) });
        const remaining = get().purchases.filter(row => row.id !== id);
        set({ purchases: remaining });
        saveLocalPurchasesCache(remaining);
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
        const before = get().purchaseItems.find(pi => pi.id === id);
        const updatedPurchaseItems = get().purchaseItems.map(pi => pi.id === id ? { ...pi, ...data } : pi);
        set({ purchaseItems: updatedPurchaseItems });
        saveLocalPurchaseItemsCache(updatedPurchaseItems);
        const updated = get().purchaseItems.find(pi => pi.id === id);
        if (updated) {
          await get().syncTable('purchase_items', updated);
          if (before) await get().logHistory({ table: 'purchase_items', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deletePurchaseItem: async (id: string) => {
        const item = get().purchaseItems.find(row => row.id === id);
        const purchase = get().purchases.find(row => row.id === item?.purchaseId);
        if (item && (get().vendorBills.some(row => row.purchaseId === item.purchaseId)
          || get().stockMovements.some(row => row.referenceId === id || row.referenceId === item.purchaseId)
          || get().cashTransactions.some(row => row.referenceId === id || row.referenceId === item.purchaseId)
          || get().journalEntries.some(row => row.referenceId === id || row.referenceId === item.purchaseId)
          || (purchase && !['Draft', 'Pending'].includes(purchase.status)))) {
          throw new Error('Detail belanja sudah memiliki riwayat; penghapusan ditolak.');
        }
        const before = get().purchaseItems.find(pi => pi.id === id);
        const remaining = get().purchaseItems.filter(pi => pi.id !== id);
        set({ purchaseItems: remaining });
        saveLocalPurchaseItemsCache(remaining);
        try {
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'purchase_items', id })
          });
          if (before) await get().logHistory({ table: 'purchase_items', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete purchase item from server:", e);
          throw e;
        }
      },

      purchaseRequests: [],
      addPurchaseRequest: async (pr) => {
        const updated = [...get().purchaseRequests, pr];
        set({ purchaseRequests: updated });
        saveLocalPurchaseRequestsCache(updated);
        await get().syncTable('purchase_requests', pr);
      },
      updatePurchaseRequest: async (id, data) => {
        const before = get().purchaseRequests.find(pr => pr.id === id);
        const updated = get().purchaseRequests.map(pr => pr.id === id ? { ...pr, ...data } : pr);
        set({ purchaseRequests: updated });
        saveLocalPurchaseRequestsCache(updated);
        const item = get().purchaseRequests.find(pr => pr.id === id);
        if (item) {
          await get().syncTable('purchase_requests', item);
          if (before) await get().logHistory({ table: 'purchase_requests', recordId: id, action: 'update', oldData: before, newData: item });
        }
      },
      deletePurchaseRequest: async (id) => {
        const before = get().purchaseRequests.find(pr => pr.id === id);
        const remaining = get().purchaseRequests.filter(pr => pr.id !== id);
        set({ purchaseRequests: remaining });
        saveLocalPurchaseRequestsCache(remaining);
        try {
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'purchase_requests', id })
          });
          if (before) await get().logHistory({ table: 'purchase_requests', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete purchase request from server:", e);
          throw e;
        }
      },

      disbursementRequests: [],
      addDisbursementRequest: async (dr) => {
        const updated = [...get().disbursementRequests, dr];
        set({ disbursementRequests: updated });
        saveLocalDisbursementRequestsCache(updated);
        await get().syncTable('disbursement_requests', dr);
      },
      updateDisbursementRequest: async (id, data) => {
        const before = get().disbursementRequests.find(dr => dr.id === id);
        const updated = get().disbursementRequests.map(dr => dr.id === id ? { ...dr, ...data } : dr);
        set({ disbursementRequests: updated });
        saveLocalDisbursementRequestsCache(updated);
        const item = get().disbursementRequests.find(dr => dr.id === id);
        if (item) {
          await get().syncTable('disbursement_requests', item);
          if (before) await get().logHistory({ table: 'disbursement_requests', recordId: id, action: 'update', oldData: before, newData: item });
        }
      },
      deleteDisbursementRequest: async (id) => {
        const before = get().disbursementRequests.find(dr => dr.id === id);
        const remaining = get().disbursementRequests.filter(dr => dr.id !== id);
        set({ disbursementRequests: remaining });
        saveLocalDisbursementRequestsCache(remaining);
        try {
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'disbursement_requests', id })
          });
          if (before) await get().logHistory({ table: 'disbursement_requests', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete disbursement request from server:", e);
          throw e;
        }
      },

      tutupHariKantong: [],
      addTutupHariKantong: async (rec) => {
        set({ tutupHariKantong: [...get().tutupHariKantong, rec] });
        await get().syncTable('tutup_hari_kantong', rec);
      },

      creditNotes: [],
      addCreditNote: async (cn) => {
        set({ creditNotes: [...get().creditNotes, cn] });
        await get().syncTable('credit_notes', cn);
      },

      dailyCloses: [],
      addDailyClose: async (rec) => {
        // Satu baris per tanggal. Menutup ulang hari yang sama menimpa catatannya,
        // bukan menumpuk baris kedua yang bertentangan dengan yang pertama.
        set({ dailyCloses: [...get().dailyCloses.filter(d => d.day !== rec.day), rec] });
        await get().syncTable('daily_close', rec);
      },

      dailyCostConfig: null,
      saveDailyCostConfig: async (cfg) => {
        set({ dailyCostConfig: cfg });
        // Baris app_settings ditulis utuh, memakai nama kolom apa adanya — sama seperti
        // updateRolePermissions. Mengirim satu kolom saja lewat jalur camelCase tidak
        // tersimpan, dan mengirim baris tanpa kolom lain berisiko mengosongkan izin
        // peran dan susunan menu yang menumpang di baris yang sama.
        const state = get();
        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: { ...state.navConfigs, tier_margins: state.tierMargins, min_margin_pct: state.minMarginPct },
          role_permissions: state.rolePermissions,
          daily_cost_config: cfg,
        }, true);
      },


      deliveries: [],
      addDelivery: async (d) => {
        set((state) => ({ deliveries: [...state.deliveries, d] }));
        await get().syncTable('deliveries', d);
      },
      updateDelivery: async (id, data) => {
        const before = get().deliveries.find(d => d.id === id);
        set((state) => ({
          deliveries: state.deliveries.map(d => d.id === id ? { ...d, ...data } : d)
        }));
        const updated = get().deliveries.find(d => d.id === id);
        if (updated) {
          await get().syncTable('deliveries', updated);
          if (before) await get().logHistory({ table: 'deliveries', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteDelivery: async (id) => {
        const before = get().deliveries.find(d => d.id === id);
        set((state) => ({ deliveries: state.deliveries.filter(d => d.id !== id) }));
        try {
          await checkedDbMutation('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'deliveries', id })
          });
          if (before) await get().logHistory({ table: 'deliveries', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          throw e;
        }
      },

      expenses: [],
      addExpense: async (e) => {
        set((state) => ({ expenses: [...state.expenses, e] }));
        await get().syncTable('expenses', e);
      },
      updateExpense: async (id, data) => {
        const before = get().expenses.find(e => e.id === id);
        set((state) => ({
          expenses: state.expenses.map(e => e.id === id ? { ...e, ...data } : e)
        }));
        const updated = get().expenses.find(e => e.id === id);
        if (updated) {
          await get().syncTable('expenses', updated);
          if (before) await get().logHistory({ table: 'expenses', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },

      invoices: [],
      addInvoice: async (inv) => {
        set((state) => ({ invoices: [...state.invoices, inv] }));
        await get().syncTable('invoices', inv);
      },
      updateInvoice: async (id, data) => {
        const before = get().invoices.find(inv => inv.id === id);
        set((state) => ({
          invoices: state.invoices.map(inv => inv.id === id ? { ...inv, ...data } : inv)
        }));
        const updated = get().invoices.find(inv => inv.id === id);
        if (updated) {
          await get().syncTable('invoices', updated);
          if (before) await get().logHistory({ table: 'invoices', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },

      tukarFakturs: [],
      addTukarFaktur: async (tf: TukarFaktur) => {
        set((state) => ({ tukarFakturs: [...state.tukarFakturs, tf] }));
        await get().syncTable('tukar_faktur', tf);
      },
      updateTukarFaktur: async (id: string, data: Partial<TukarFaktur>) => {
        const before = get().tukarFakturs.find(t => t.id === id);
        set((state) => ({
          tukarFakturs: state.tukarFakturs.map(t => t.id === id ? { ...t, ...data } : t)
        }));
        const updated = get().tukarFakturs.find(t => t.id === id);
        if (updated) {
          await get().syncTable('tukar_faktur', updated);
          if (before) await get().logHistory({ table: 'tukar_faktur', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteTukarFaktur: async (id: string) => {
        const before = get().tukarFakturs.find(t => t.id === id);
        const { error } = await commandTukarFaktur('delete', { p_tf_id: id });
        if (error) throw new Error(`Delete TF gagal: ${error.message}`);

        set((state) => ({
          tukarFakturs: state.tukarFakturs.filter(t => t.id !== id),
          invoices: state.invoices.map(inv => inv.tukarFakturId === id ? { ...inv, tukarFakturId: undefined } : inv),
        }));

        if (before) await get().logHistory({ table: 'tukar_faktur', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      issueTukarFaktur: async (tfId: string, invoiceIds: string[], issueDate: string, userId: string) => {
        const { data, error } = await commandTukarFaktur('issue', {
          p_tf_id: tfId,
          p_invoice_ids: invoiceIds,
          p_issue_date: issueDate,
          p_user_id: userId,
        });
        if (error) throw new Error(`Issue TF gagal: ${error.message}`);

        const [tfRows, invRows] = await Promise.all([
          bacaBarisById<TukarFaktur>('tukar_faktur', [tfId]),
          bacaBarisById<Invoice>('invoices', invoiceIds),
        ]);
        const tfRow = tfRows[0];
        if (tfRow) {
          set(state => ({
            tukarFakturs: state.tukarFakturs.map(t => t.id === tfId
              ? { ...t, ...tfRow, totalAmount: Number(tfRow.totalAmount) || 0 }
              : t),
          }));
        }
        if (invRows.length > 0) {
          set(state => ({
            invoices: state.invoices.map(inv => {
              const fresh = invRows.find(r => r.id === inv.id);
              if (!fresh) return inv;
              return { ...inv, tukarFakturId: fresh.tukarFakturId || undefined, dueDate: fresh.dueDate };
            }),
          }));
        }
        return data;
      },

      linkInvoicesToTukarFaktur: async (tfId: string, invoiceIds: string[]) => {
        const { data, error } = await commandTukarFaktur('link', {
          p_tf_id: tfId,
          p_invoice_ids: invoiceIds,
        });
        if (error) throw new Error(`Link TF gagal: ${error.message}`);

        const [tfRows, invRows] = await Promise.all([
          bacaBarisById<TukarFaktur>('tukar_faktur', [tfId]),
          bacaBarisById<Invoice>('invoices', invoiceIds),
        ]);
        const tfRow = tfRows[0];
        if (tfRow) {
          set(state => ({
            tukarFakturs: state.tukarFakturs.map(t => t.id === tfId ? {
              ...t,
              totalAmount: Number(tfRow.totalAmount) || 0,
            } : t),
          }));
        }
        if (invRows.length > 0) {
          set(state => ({
            invoices: state.invoices.map(inv => {
              const fresh = invRows.find(r => r.id === inv.id);
              if (!fresh) return inv;
              return { ...inv, tukarFakturId: fresh.tukarFakturId || undefined };
            }),
          }));
        }
        return data;
      },

      recordTukarFakturPayment: async (tfId, allocations, paymentDate, bankAccountId, totalAmount, paymentId = uuidv4()) => {
        const state = get();
        const requested = Object.entries(allocations).map(([invoiceId, amount]) => ({ invoiceId, amount }));
        if (!requested.length || !Number.isFinite(totalAmount) || totalAmount <= 0) return false;
        for (const allocation of requested) {
          const invoice = state.invoices.find(row => row.id === allocation.invoiceId);
          if (!invoice || !Number.isFinite(allocation.amount) || allocation.amount <= 0
            || (invoice.tukarFakturId !== tfId && invoice.supersededByInvoiceId !== tfId)) return false;
        }
        if (Math.abs(requested.reduce((sum, row) => sum + row.amount, 0) - totalAmount) > 0.01) return false;
        const { recordClientReceipt } = await import('./accounting');
        // The atomic command hydrates all committed invoice and money rows.
        return recordClientReceipt({ paymentId, date: paymentDate, bankAccountId, amount: totalAmount, allocations: requested });
      },

      // === Vendor Bills (Accounts Payable) ===
      vendorBills: [],
      addVendorBill: async (bill: VendorBill) => {
        set((state) => ({ vendorBills: [...state.vendorBills, bill] }));
        await get().syncTable('vendor_bills', bill);
      },
      updateVendorBill: async (id: string, data: Partial<VendorBill>) => {
        const existing = get().vendorBills.find(row => row.id === id);
        if (!existing) throw new Error('Tagihan vendor tidak ditemukan.');
        const posted = Number(existing.amountPaid || 0) > 0 || (existing.payments || []).length > 0
          || get().journalLines.some(line => line.vendorBillId === id);
        if (posted) throw new Error('Tagihan vendor tercatat tidak dapat diedit langsung. Gunakan pembayaran atau reversal sumber.');
        set((state) => ({
          vendorBills: state.vendorBills.map(vb => vb.id === id ? { ...vb, ...data } : vb)
        }));
        const updated = get().vendorBills.find(vb => vb.id === id);
        if (updated) await get().syncTable('vendor_bills', updated);
      },
      deleteVendorBill: async (id: string, cleanup?: { reason: 'failed-posting' }) => {
        const bill = get().vendorBills.find(row => row.id === id);
        if (cleanup?.reason !== 'failed-posting' || !bill || Number(bill.amountPaid || 0) !== 0
          || (bill.payments || []).length || get().journalLines.some(line => line.vendorBillId === id)) {
          throw new Error('Tagihan vendor tercatat tidak dapat dihapus. Gunakan reversal dokumen sumber.');
        }
        // Only a newly staged bill without a posted journal may be cleaned up.
        await checkedDbMutation('/api/db', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'vendor_bills', id }) });
        set(state => ({ vendorBills: state.vendorBills.filter(row => row.id !== id) }));
      },
      payVendorBill: async (billId: string, payment: VendorBillPayment) => {
        const { recordVendorPayment } = await import('./accounting');
        const success = await recordVendorPayment({
          paymentId: payment.id, billId, date: payment.date,
          bankAccountId: payment.bankAccountId, amount: payment.amount, note: payment.note,
        });
        if (!success) throw new Error('Pembayaran vendor belum tersimpan. Gunakan ID pembayaran yang sama untuk mencoba kembali.');
      },

      journalEntries: [],
      addJournalEntry: async (entry) => {
        if (get().journalEntries.some(row => row.id === entry.id)) throw new Error('Jurnal tercatat tidak dapat ditimpa.');
        const before = get().journalEntries;
        set({ journalEntries: [...before, entry] });
        try {
          await get().syncTable('journal_entries', entry);
        } catch (error) {
          throw error;
        }
      },
      updateJournalEntry: async () => {
        throw new Error('Jurnal tercatat tidak dapat diedit. Gunakan reversal dokumen sumber.');
      },

      journalLines: [],
      addJournalLine: async (line) => {
        if (get().journalLines.some(row => row.id === line.id)) throw new Error('Baris jurnal tercatat tidak dapat ditimpa.');
        const before = get().journalLines;
        set({ journalLines: [...before, line] });
        try {
          await get().syncTable('journal_lines', line);
        } catch (error) {
          throw error;
        }
      },
      addJournalLines: async (lines) => {
        if (new Set(lines.map(row => row.id)).size !== lines.length
          || lines.some(line => get().journalLines.some(row => row.id === line.id))) throw new Error('Baris jurnal tercatat tidak dapat ditimpa.');
        const before = get().journalLines;
        set({ journalLines: [...before, ...lines] });
        try {
          await get().syncTable('journal_lines', lines);
        } catch (error) {
          throw error;
        }
      },

      leads: [],
      announcement: {
        message: "Selamat Datang di DISMA CORE Relational! Sistem kini berjalan di atas database performa tinggi. 🚀",
        active: true,
        timestamp: new Date().toISOString()
      },
      addLead: async (lead) => {
        set((state) => {
          const updated = [...state.leads, lead];
          saveLocalLeadsCache(updated);
          return { leads: updated };
        });
        await get().syncTable('leads', lead);
      },
      updateLead: async (id, updates) => {
        const before = get().leads.find(l => l.id === id);
        set((state) => {
          const updated = state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l));
          saveLocalLeadsCache(updated);
          return { leads: updated };
        });
        const updated = get().leads.find(l => l.id === id);
        if (updated) {
          await get().syncTable('leads', updated);
          if (before) await get().logHistory({ table: 'leads', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteLead: async (id) => {
        const before = get().leads.find(l => l.id === id);
        set((state) => {
          const updated = state.leads.filter(l => l.id !== id);
          saveLocalLeadsCache(updated);
          return { leads: updated };
        });
        await checkedDbMutation('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'leads', id }) });
        if (before) await get().logHistory({ table: 'leads', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      updateAnnouncement: (announcement) => set({ announcement }),

      tasks: [],
      addTask: async (task) => {
        set((state) => ({ tasks: [...state.tasks, task] }));
        await get().syncTable('disma_tasks', task);
      },
      updateTask: async (id, data) => {
        const before = get().tasks.find(t => t.id === id);
        set((state) => ({
          tasks: state.tasks.map(t => t.id === id ? { ...t, ...data } : t)
        }));
        const updated = get().tasks.find(t => t.id === id);
        if (updated) {
          await get().syncTable('disma_tasks', updated);
          if (before) await get().logHistory({ table: 'disma_tasks', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteTask: async (id) => {
        const before = get().tasks.find(t => t.id === id);
        set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }));
        await checkedDbMutation('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'disma_tasks', id }) });
        if (before) await get().logHistory({ table: 'disma_tasks', recordId: id, action: 'delete', oldData: before, newData: null });
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

      fixedAssets: [],
      addFixedAsset: async (asset: FixedAsset) => {
        set((state) => ({ fixedAssets: [...state.fixedAssets, asset] }));
        await get().syncTable('fixed_assets', asset);
      },
      updateFixedAsset: async (id: string, updates: Partial<FixedAsset>) => {
        const before = get().fixedAssets.find(a => a.id === id);
        set((state) => ({
          fixedAssets: state.fixedAssets.map(a => a.id === id ? { ...a, ...updates } : a)
        }));
        const updated = get().fixedAssets.find(a => a.id === id);
        if (updated) {
          await get().syncTable('fixed_assets', updated);
          if (before) await get().logHistory({ table: 'fixed_assets', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteFixedAsset: (id: string) => {
        const before = get().fixedAssets.find(a => a.id === id);
        set((state) => ({ fixedAssets: state.fixedAssets.filter(a => a.id !== id) }));
        if (before) { void get().logHistory({ table: 'fixed_assets', recordId: id, action: 'delete', oldData: before, newData: null }); }
      },

      bankAccounts: [],
      addBankAccount: async (acc) => {
        if (Number(acc.balance || 0) !== 0) throw new Error('Saldo awal harus dicatat sebagai transaksi sumber.');
        set((state) => ({ bankAccounts: [...state.bankAccounts, acc] }));
        await get().syncTable('bank_accounts', acc);
      },
      updateBankAccount: async (id: string, data: Partial<BankAccount>) => {
        if ('balance' in data) throw new Error('Saldo bank hanya dapat berubah melalui transaksi sumber.');
        const before = get().bankAccounts.find(b => b.id === id);
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...data } : b)
        }));
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) {
          const { balance, ...metadata } = updated;
          void balance;
          await get().syncTable('bank_accounts', metadata);
          if (before) await get().logHistory({ table: 'bank_accounts', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteBankAccount: async (id: string) => {
        // Guardrail — caller (UI) should confirm preconditions, but enforce again here so the action
        // cannot be invoked from the console with a non-zero balance or with referencing transactions.
        const target = get().bankAccounts.find(b => b.id === id);
        if (!target) throw new Error(`Bank account ${id} not found.`);
        if (Math.abs(Number(target.balance) || 0) > 0.01) {
          throw new Error(`Saldo ${target.name} = ${target.balance}. Wajib 0 sebelum dihapus.`);
        }
        const hasTx = get().cashTransactions.some(tx => tx.bankAccountId === id);
        if (hasTx) {
          throw new Error(`${target.name} masih punya cash transactions. Tidak bisa dihapus.`);
        }

        const before = target;
        const newBanks = get().bankAccounts.filter(b => b.id !== id);
        set({ bankAccounts: newBanks });
        saveLocalBankAccountsCache(newBanks);

        const res = await checkedDbMutation('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'bank_accounts', id })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`Hapus bank account gagal: ${err.error || res.statusText}`);
        }
        if (before) await get().logHistory({ table: 'bank_accounts', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      updateBankBalance: async () => {
        throw new Error('Saldo bank hanya dapat berubah melalui transaksi sumber.');
      },
      cashTransactions: [],
      addCashTransaction: async (tx) => {
        // Auto-snapshot sebelum setiap transaksi kas supaya bisa di-undo step by step
        get().takeDevSnapshot();
        // Stamp local-mutation time (this path bypasses syncTable) so an in-flight
        // init() discards a stale snapshot instead of flickering the balance back.
        set({ _lastLocalMutationAt: Date.now() });
        try {
          const response = await fetch('/api/accounting/cash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx }),
          });

          const payload = await response.json().catch(() => ({})) as CashPostResponse;
          if (!response.ok || !payload.transaction || !payload.bankAccount) {
            throw new Error(payload.error || "Cash posting was not acknowledged.");
          }

          const serverTx = payload.transaction
            ? { ...payload.transaction, amount: Number(payload.transaction.amount || 0) }
            : tx;
          const serverBank = payload.bankAccount
            ? { ...payload.bankAccount, balance: Number(payload.bankAccount.balance || 0) }
            : undefined;

          set((state) => ({
            cashTransactions: [
              serverTx,
              ...state.cashTransactions.filter((candidate) => candidate.id !== serverTx.id),
            ],
            bankAccounts: serverBank
              ? state.bankAccounts.map((bank) => bank.id === serverBank.id ? serverBank : bank)
              : state.bankAccounts,
          }));

          if (serverBank) {
            saveLocalBankAccountsCache(get().bankAccounts);
          }
        } catch (error) {
          throw error;
        }
      },

      updateCashTransaction: async () => {
        throw new Error('Transaksi kas tercatat tidak dapat diedit. Gunakan reversal dokumen sumber.');
      },
      deleteCashTransaction: async () => {
        throw new Error('Transaksi kas tercatat tidak dapat dihapus. Gunakan reversal dokumen sumber.');
      },
      bulkDeleteCashTransactions: async () => {
        throw new Error('Transaksi kas tercatat tidak dapat dihapus massal.');
      },

      reimbursements: [],
      addReimbursement: async (r) => {
        set((state) => ({ reimbursements: [r, ...state.reimbursements] }));
        await get().syncTable('reimbursements', r);
      },
      updateReimbursement: async (id, data) => {
        const before = get().reimbursements.find(r => r.id === id);
        set((state) => ({
          reimbursements: state.reimbursements.map(r => r.id === id ? { ...r, ...data } : r)
        }));
        const updated = get().reimbursements.find(r => r.id === id);
        if (updated) {
          await get().syncTable('reimbursements', updated);
          if (before) await get().logHistory({ table: 'reimbursements', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },

      updateNavConfig: async (role, config) => {
        set((state) => ({
          navConfigs: { ...state.navConfigs, [role]: config },
          // Lock this role so a later init()/poll can't stomp the user's edit
          // with a stale server snapshot (the revert bug).
          _locallyEditedNavRoles: state._locallyEditedNavRoles.includes(role)
            ? state._locallyEditedNavRoles
            : [...state._locallyEditedNavRoles, role],
        }));
        await get().saveToHdd();
      },

      clientPrices: [],
      // These four deliberately do NOT write the localStorage cache. The array is
      // ~5MB at 20k rows — the whole per-origin quota — so re-serialising it on
      // every single price edit both cost a 5MB stringify per click and threw
      // QuotaExceededError, and the throw landed before the syncTable below: the
      // screen showed the new price and the database never heard about it.
      // The cache is written once per boot from server truth (see init()).
      addClientPrice: async (cp) => {
        set((state) => ({ clientPrices: [...state.clientPrices, cp] }));
        await get().syncTable('client_prices', cp);
      },
      updateClientPrice: async (id, data) => {
        const before = get().clientPrices.find(c => c.id === id);
        set((state) => ({
          clientPrices: state.clientPrices.map(c => c.id === id ? { ...c, ...data } : c)
        }));
        const updated = get().clientPrices.find(c => c.id === id);
        if (updated) {
          await get().syncTable('client_prices', updated);
          if (before) await get().logHistory({ table: 'client_prices', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteClientPrice: async (id) => {
        const before = get().clientPrices.find(c => c.id === id);
        set((state) => ({ clientPrices: state.clientPrices.filter(c => c.id !== id) }));
        await checkedDbMutation('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'client_prices', id })
        });
        if (before) await get().logHistory({ table: 'client_prices', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      deleteMultipleClientPrices: async (ids) => {
        if (!ids || ids.length === 0) return;
        const beforeMap = new Map(get().clientPrices.filter(c => ids.includes(c.id)).map(c => [c.id, { ...c }]));
        set((state) => ({ clientPrices: state.clientPrices.filter(c => !ids.includes(c.id)) }));
        await checkedDbMutation('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'client_prices', id: ids })
        });
        for (const id of ids) {
          const before = beforeMap.get(id);
          if (before) await get().logHistory({ table: 'client_prices', recordId: id, action: 'delete', oldData: before, newData: null, reason: 'Bulk delete' });
        }
      },

      vendorPrices: [],
      addVendorPrice: async (vp) => {
        set((state) => ({ vendorPrices: [...state.vendorPrices, vp] }));
        await get().syncTable('vendor_prices', vp);
      },
      updateVendorPrice: async (id, data) => {
        const before = get().vendorPrices.find(v => v.id === id);
        set((state) => ({
          vendorPrices: state.vendorPrices.map(v => v.id === id ? { ...v, ...data } : v)
        }));
        const updated = get().vendorPrices.find(v => v.id === id);
        if (updated) {
          await get().syncTable('vendor_prices', updated);
          if (before) await get().logHistory({ table: 'vendor_prices', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteVendorPrice: async (id) => {
        const before = get().vendorPrices.find(v => v.id === id);
        set((state) => ({ vendorPrices: state.vendorPrices.filter(v => v.id !== id) }));
        await checkedDbMutation('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'vendor_prices', id })
        });
        if (before) await get().logHistory({ table: 'vendor_prices', recordId: id, action: 'delete', oldData: before, newData: null });
      },

      pendingReturns: [],
      addPendingReturn: async (ret) => {
        set((state) => ({ pendingReturns: [...state.pendingReturns, ret] }));
        await get().syncTable('pending_returns', ret);
      },
      removePendingReturn: (id) => set((state) => ({ pendingReturns: state.pendingReturns.filter(r => r.id !== id) })),
      // Menandai retur selesai HARUS dipersist. removePendingReturn hanya membuang
      // dari state di memori, jadi barisnya kembali pada sinkronisasi berikutnya —
      // dan retur yang sudah di-restock bisa di-restock lagi.
      updatePendingReturn: async (id, data) => {
        const updated = get().pendingReturns.map(r => r.id === id ? { ...r, ...data } : r);
        set({ pendingReturns: updated });
        const row = updated.find(r => r.id === id);
        if (row) await get().syncTable('pending_returns', row);
      },

      vendorReturns: [],
      addVendorReturn: async (vr) => {
        set((state) => ({ vendorReturns: [...state.vendorReturns, vr] }));
        await get().syncTable('vendor_returns', vr);
      },
      updateVendorReturn: async (id, data) => {
        const updated = get().vendorReturns.map(v => v.id === id ? { ...v, ...data } : v);
        set({ vendorReturns: updated });
        const row = updated.find(v => v.id === id);
        if (row) await get().syncTable('vendor_returns', row);
      },

      rejectedItems: [],
      addRejectedItem: async (item) => {
        set((state) => ({ rejectedItems: [item, ...state.rejectedItems] }));
        await get().syncTable('rejected_items', item);
      },
      updateRejectedItem: async (item) => {
        set((state) => ({
          rejectedItems: state.rejectedItems.map(ri => ri.id === item.id ? item : ri)
        }));
        await get().syncTable('rejected_items', item);
      },

      updateRolePermissions: async (role, keys) => {
        set((state) => ({ 
          rolePermissions: { ...state.rolePermissions, [role]: keys },
          _locallyEditedPermissionRoles: state._locallyEditedPermissionRoles.includes(role)
            ? state._locallyEditedPermissionRoles
            : [...state._locallyEditedPermissionRoles, role],
        }));
        // Use syncTable directly with silent=true to prevent broadcast → init() race condition
        const state = get();
        await state.syncTable('app_settings', {
          id: 'global-settings',
          nav_configs: {
            ...state.navConfigs,
            tier_margins: state.tierMargins,
            min_margin_pct: state.minMarginPct
          },
          role_permissions: state.rolePermissions
        }, true);
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
      _snapshotDepth: 0,
      // Compatibility boundary for existing callers; no persisted snapshots are replayed.
      beginUndoableBatch: () => {
        if (get()._snapshotDepth === 0) get().takeDevSnapshot();
        set(s => ({ _snapshotDepth: s._snapshotDepth + 1 }));
      },
      endUndoableBatch: () => set(s => ({ _snapshotDepth: Math.max(0, s._snapshotDepth - 1) })),
      isUndoing: false,
      shoppingListUndo: null,
      shoppingListHistoryLength: 0,
      setShoppingListUndo: (cb, length) => set({ shoppingListUndo: cb, shoppingListHistoryLength: length }),
      takeDevSnapshot: () => { /* Financial history requires source-linked reversal. */ },
      undoDevSnapshot: async () => {
        throw new Error('Undo transaksi global dinonaktifkan. Gunakan pembatalan dari dokumen sumber.');
      },
      resetSimulation: async () => {
        const state = get();
        state.takeDevSnapshot();

        toast.info("Sedang mereset data simulasi...");

        // Cadangan wajib SEBELUM menghapus. takeDevSnapshot() di atas cuma hidup
        // di memori browser dan fungsi ini me-reload halaman di akhir, jadi undo
        // bawaannya tidak pernah bisa dipakai. Kalau cadangan gagal, hapusnya
        // dibatalkan — lebih baik menolak daripada menghapus tanpa jaring.
        try {
          toast.info("Menyimpan cadangan sebelum menghapus...");
          const backupRes = await fetch('/api/db/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'prewipe_save' })
          });
          if (!backupRes.ok) {
            const err = await backupRes.json().catch(() => ({}));
            throw new Error(err.error || backupRes.statusText);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          toast.error(`Cadangan gagal dibuat — penghapusan dibatalkan. (${message})`);
          return;
        }

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
          purchaseRequests: [],
          deliveries: [], expenses: [], invoices: [], tukarFakturs: [], vendorBills: [], journalEntries: [],
          journalLines: [], stockMovements: [], tasks: [], notifications: [],
          pendingReturns: [], rejectedItems: [], reimbursements: [], cashTransactions: [],
          bankAccounts: INITIAL_BANK_ACCOUNTS, fixedAssets: [], clientPrices: [], vendorPrices: []
        });
        
        clearAllOperationalCaches();

        toast.success("Data transaksi dihapus. Bisa dikembalikan lewat Settings › Maintenance.", { duration: 8000 });
        setTimeout(() => window.location.reload(), 1500);
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
            users: MOCK_USERS.map(untukDb),
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
          purchaseRequests: [],
          deliveries: [], expenses: [], invoices: [], tukarFakturs: [], vendorBills: [], journalEntries: [],
          journalLines: [], stockMovements: [], coas: COA_SEED, users: MOCK_USERS,
          tasks: [], notifications: [], bankAccounts: INITIAL_BANK_ACCOUNTS,
          rejectedItems: [],
          cashTransactions: [], reimbursements: [], fixedAssets: [], clientPrices: []
        });
        
        clearAllOperationalCaches();

        toast.success("Database Reset Berhasil! Me-reload halaman...");
        setTimeout(() => window.location.reload(), 1000);
      },
    };
  // Each action owns only its synchronous optimistic phase. Rollback compares
  // individual object identities, so rejected writes cannot restore stale arrays.
  for (const [name, value] of Object.entries(actions)) {
    if (typeof value !== 'function' || value.constructor.name !== 'AsyncFunction'
      || ['init', 'forceSync', 'syncTable', 'logHistory', 'refreshVendors', 'resetDb', 'resetSimulation'].includes(name)) continue;
    (actions as any)[name] = (...args: any[]) => withOptimisticRollback(get, set,
      () => (value as (...args: any[]) => Promise<unknown>)(...args), () => {
        const state = get();
        saveLocalClientsCache(state.clients);
        saveLocalProductsCache(state.products);
        saveLocalSalesOrdersCache(state.salesOrders);
        saveLocalSalesOrderItemsCache(state.salesOrderItems);
        saveLocalPurchasesCache(state.purchases);
        saveLocalPurchaseItemsCache(state.purchaseItems);
        saveLocalBankAccountsCache(state.bankAccounts);
        saveLocalPurchaseRequestsCache(state.purchaseRequests);
        saveLocalDisbursementRequestsCache(state.disbursementRequests);
        saveLocalLeadsCache(state.leads);
        saveLocalCache(LOCAL_DELIVERIES_CACHE_KEY, state.deliveries);
        saveLocalCache(LOCAL_JOURNAL_ENTRIES_CACHE_KEY, state.journalEntries);
        saveLocalCache(LOCAL_JOURNAL_LINES_CACHE_KEY, state.journalLines);
        saveLocalCache(LOCAL_CASH_TRANSACTIONS_CACHE_KEY, state.cashTransactions);
        saveLocalCache(LOCAL_VENDORS_CACHE_KEY, state.vendors);
        saveLocalCache(LOCAL_INVOICES_CACHE_KEY, state.invoices);
        saveLocalCache(LOCAL_CLIENT_PRICES_CACHE_KEY, state.clientPrices);
      });
  }
  return actions;
});
