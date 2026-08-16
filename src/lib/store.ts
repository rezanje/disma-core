import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Client, Product, SalesOrder, SalesOrderItem, Purchase, 
  PurchaseItem, Delivery, Invoice, InvoiceStatus, ChartOfAccount, JournalEntry, 
  JournalLine, OperationalExpense, User, Vendor, Role, Lead, Announcement, AppTask, AppNotification,
  BankAccount, CashTransaction, Reimbursement, FixedAsset,
  Employee, SmartKpi, OkrObjective, OkrKeyResult, RolePermissionMap, AccessKey, PendingReturn, VendorReturn, RejectedItem, StockMovement, ClientPrice, ClientPriceTier, PriceBaseline,
  VendorBill, VendorBillPayment, TukarFaktur, PurchaseRequest, VendorPrice,
  BudgetPlan, BudgetCategory, BudgetSubCategory, BudgetAdjustment, DisbursementRequest, TutupHariKantong,
  DailyClose, DailyCostConfig
} from '@/types';
import { COA_SEED, CLIENTS_SEED, VENDORS_SEED, MOCK_USERS, KPI_SEED } from './constants';
import { PRODUCTS_SEED } from './products_seed';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { loadLocalCache, saveLocalCache } from './local-cache';
import { clientDeletionBlockers, describeBlockers, clientPriceIdsToRemove } from './client-delete';

const LOCAL_PRODUCTS_CACHE_KEY = 'disma_local_products_cache';
const LOCAL_CLIENTS_CACHE_KEY = 'disma_local_clients_cache';
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
const LOCAL_BUDGET_PLANS_CACHE_KEY = 'disma_local_budget_plans_cache';
const LOCAL_BUDGET_CATEGORIES_CACHE_KEY = 'disma_local_budget_categories_cache';
const LOCAL_BUDGET_SUB_CATEGORIES_CACHE_KEY = 'disma_local_budget_sub_categories_cache';
const LOCAL_BUDGET_ADJUSTMENTS_CACHE_KEY = 'disma_local_budget_adjustments_cache';
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
    return JSON.parse(raw);
  } catch { return null; }
};

const saveCurrentUserToStorage = (user: User | null) => {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      window.localStorage.setItem(LOCAL_CURRENT_USER_KEY, JSON.stringify(user));
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
  users: User[];
  addUser: (user: User) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  
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
    totalAmount: number
  ) => Promise<boolean>;

  // Accounts Payable (Vendor Bills)
  vendorBills: VendorBill[];
  addVendorBill: (bill: VendorBill) => Promise<void>;
  updateVendorBill: (id: string, data: Partial<VendorBill>) => Promise<void>;
  deleteVendorBill: (id: string) => Promise<void>;
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
  
  // HR & KPI
  employees: Employee[];
  addEmployee: (emp: Employee) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  
  kpiObjectives: SmartKpi[];
  addKpi: (kpi: SmartKpi) => void;
  updateKpi: (id: string, data: Partial<SmartKpi>) => void;
  deleteKpi: (id: string) => Promise<void>;
  
  // OKR Framework
  okrObjectives: OkrObjective[];
  addOkr: (okr: OkrObjective) => void;
  updateOkr: (id: string, data: Partial<OkrObjective>) => void;
  deleteOkr: (id: string) => Promise<void>;
  deleteKeyResult: (objectiveId: string, krId: string) => Promise<void>;
  
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

  // Budget Planning
  budgetPlans: BudgetPlan[];
  budgetCategories: BudgetCategory[];
  budgetSubCategories: BudgetSubCategory[];
  budgetAdjustments: BudgetAdjustment[];
  upsertBudgetPlan: (plan: BudgetPlan) => Promise<void>;
  deleteBudgetPlan: (id: string) => Promise<void>;
  upsertBudgetCategory: (category: BudgetCategory) => Promise<void>;
  upsertBudgetSubCategory: (subCategory: BudgetSubCategory) => Promise<void>;
  upsertBudgetAdjustment: (adjustment: BudgetAdjustment) => Promise<void>;
}


const initialCOAs: ChartOfAccount[] = [
  // 1-XXXX ASSETS
  { id: 'coa-1', accountCode: '1-1000', accountName: 'Kas di Tangan (Petty Cash)', accountType: 'Asset' },
  { id: 'coa-1-2', accountCode: '1-1200', accountName: 'Bank BCA - Utama', accountType: 'Asset' },
  { id: 'coa-1-3', accountCode: '1-1300', accountName: 'Bank Mandiri - Operasional', accountType: 'Asset' },
  { id: 'coa-1-4', accountCode: '1-1400', accountName: 'Bank BRI - Simpanan', accountType: 'Asset' },
  { id: 'coa-transfer-clearing', accountCode: '1-1999', accountName: 'Transfer Antar Bank (Clearing)', accountType: 'Asset' },
  { id: 'coa-1-5', accountCode: '1-1500', accountName: 'Uang Muka Karyawan (Advance)', accountType: 'Asset' },
  { id: 'coa-1-5-1', accountCode: '1-1510', accountName: 'Kas Operasional Kurir', accountType: 'Asset' },
  { id: 'coa-2', accountCode: '1-2000', accountName: 'Piutang Usaha (Klien)', accountType: 'Asset' },
  { id: 'coa-3', accountCode: '1-3000', accountName: 'Persediaan Barang Dagang', accountType: 'Asset' },
  { id: 'coa-4', accountCode: '1-4000', accountName: 'Aset Tetap (Kendaraan/Alat)', accountType: 'Asset' },
  { id: 'coa-4-1', accountCode: '1-4100', accountName: 'Inventaris & Furnitur Kantor', accountType: 'Asset' },
  { id: 'coa-5', accountCode: '1-4999', accountName: 'Akumulasi Penyusutan Aset', accountType: 'Asset' },
  
  // 2-XXXX LIABILITIES
  { id: 'coa-10', accountCode: '2-1000', accountName: 'Utang Usaha (Vendor)', accountType: 'Liability' },
  { id: 'coa-10-talangan', accountCode: '2-1500', accountName: 'Utang Talangan Karyawan', accountType: 'Liability' },
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
  { id: 'coa-17', accountCode: '6-3000', accountName: 'Beban Bunga Pinjaman', accountType: 'Expense' },
];

// NOTE: empty array — bank accounts must be created via UI (admin) or via import seed.
// Previously this had hardcoded seed banks that auto-re-injected on every store init,
// causing duplicates whenever a real-data import used different bank IDs.
const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];

const initialRolePermissions: RolePermissionMap = {
  super_admin: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
    'admin_sales_orders', 'admin_shopping_list', 'admin_dropship', 'admin_delivery_routes', 'admin_crm',
    'admin_users', 'users_perms', 'admin_settings', 'admin_tasks', 'admin_maintenance', 'admin_price_lists', 'admin_activity_log',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 
    'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging',
    'finance_reconciliation', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'finance_disbursements', 'finance_sourcing_monitor', 'finance_purchase_plan', 'finance_daily_close',
    'warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor',
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses',
    'tasks_global', 'settings_global', 'admin_loss_analytics'
  ],
  ceo: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
    'admin_sales_orders', 'admin_shopping_list', 'admin_dropship', 'admin_delivery_routes', 'admin_crm',
    'admin_users', 'users_perms', 'admin_settings', 'admin_tasks', 'admin_price_lists', 'admin_activity_log',
    'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets',
    'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging', 'finance_collections',
    'finance_audit', 'finance_documents', 'finance_disbursements', 'finance_sourcing_monitor', 'finance_purchase_plan', 'finance_daily_close',
    'warehouse_dashboard', 'warehouse_catalog', 'tasks_global', 'settings_global', 'admin_loss_analytics'
  ],
  coo: [
    'admin_dashboard', 'admin_vendors', 'admin_clients', 'admin_products',
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
  finance: ['admin_purchase_requests', 'finance_dashboard', 'finance_approvals', 'finance_reports', 'finance_assets', 'finance_cash_bank', 'finance_expenses', 'finance_ledger', 'finance_invoices', 'finance_ar_aging', 'finance_ap_aging', 'finance_reconciliation', 'finance_rekon', 'finance_reimbursements', 'finance_online_purchase', 'finance_audit', 'finance_documents', 'finance_collections', 'finance_sku_pnl', 'finance_settlement', 'finance_settlement_dash', 'finance_online_audit', 'finance_delivery', 'tasks_global', 'settings_global', 'admin_price_lists', 'finance_disbursements', 'finance_sourcing_monitor', 'finance_purchase_plan', 'finance_daily_close',
    // Mode Salin (16 Agu 2026): tim lapangan mencatat di kertas, Admin PO dan Finance
    // yang menyalin. Tanpa izin ini satu-satunya jalan adalah meminjam PIN mereka, dan
    // itu membuat seluruh jejak audit menunjuk orang yang salah. Ditulis penuh, bukan
    // lewat konstanta bersama, karena nav-permissions.check.ts membaca berkas ini
    // sebagai teks dan tidak melihat spread.
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'warehouse_inbound', 'warehouse_qc', 'warehouse_outbound', 'warehouse_opname',
    'courier_list', 'courier_handover', 'courier_expenses'],
  gudang: ['warehouse_dashboard', 'warehouse_catalog', 'warehouse_inbound', 'warehouse_outbound', 'warehouse_qc', 'warehouse_reject_monitor', 'warehouse_opname', 'tasks_global', 'settings_global'],
  sourcing: ['sourcing_dashboard', 'sourcing_list', 'sourcing_expenses', 'tasks_global', 'settings_global'],
  kurir: ['courier_dashboard', 'courier_list', 'courier_handover', 'courier_history', 'courier_expenses', 'tasks_global', 'settings_global'],
  // 'admin_purchase_requests': Admin PO yang membuat pengajuan dananya (otomatis dari
  // dokumen belanja), tapi dulu tidak punya menunya — jadi dia tidak pernah bisa
  // melihat pengajuannya sudah disetujui Finance atau belum.
  admin_po: ['admin_dashboard', 'admin_sales_orders', 'admin_shopping_list', 'admin_purchase_requests', 'admin_dropship', 'admin_delivery_routes', 'admin_clients', 'admin_products', 'warehouse_catalog', 'tasks_global', 'settings_global', 'admin_price_lists', 'finance_invoices', 'admin_tukar_faktur',
    // Mode Salin — lihat catatan di daftar izin finance di atas.
    'sourcing_dashboard', 'sourcing_list', 'sourcing_expenses',
    'warehouse_inbound', 'warehouse_qc', 'warehouse_outbound', 'warehouse_opname',
    'courier_list', 'courier_handover', 'courier_expenses'],
};

export const useAppStore = create<AppState>((set, get) => ({
      currentUser: loadCurrentUserFromStorage(),
      setCurrentUser: (user) => {
        saveCurrentUserToStorage(user);
        set({ currentUser: user });
      },
      users: MOCK_USERS,
      rolePermissions: initialRolePermissions,
      navConfigs: {},
      budgetPlans: [],
      budgetCategories: [],
      budgetSubCategories: [],
      budgetAdjustments: [],
      addUser: async (user) => {
        set((state) => ({ users: [...state.users, user] }));
        await get().syncTable('users', user);
      },
      updateUser: async (id, data) => {
        const before = get().users.find(u => u.id === id);
        set((state) => ({
          users: state.users.map(u => u.id === id ? { ...u, ...data } : u)
        }));
        const updated = get().users.find(u => u.id === id);
        if (updated) {
          await get().syncTable('users', updated);
          if (before) await get().logHistory({ table: 'users', recordId: id, action: 'update', oldData: before, newData: updated });
        }
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
        // Stamp local-mutation time so an in-flight init() can detect and discard
        // a stale server snapshot taken before this write (prevents value flicker).
        set({ _lastLocalMutationAt: Date.now() });
        set({ isSyncing: true });

        const attemptSync = async (): Promise<boolean> => {
          const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data })
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errMessage = String(errData.error || res.statusText || '');
            // Only skip on genuine missing-TABLE errors. A missing-COLUMN error
            // also mentions "schema cache" but must surface, not be swallowed.
            if (/could not find the table/i.test(errMessage)) {
              console.warn(`[Sync] ${table} table not available yet, skipping.`);
              return true; // Not a real failure, table just doesn't exist yet
            }
            // Kolom yang tidak ada = bug kode, bukan gangguan jaringan. Postgres
            // menolak SELURUH baris, jadi datanya HILANG — dan menunggu 2 detik lalu
            // mengulang tidak akan pernah menolongnya. Ini persis yang dulu bikin PO
            // kurang kirim tidak pernah tercatat: layar bilang berhasil, database
            // tidak pernah menerimanya. Gagalkan langsung supaya pemanggilnya tahu.
            if (/could not find the '.*' column/i.test(errMessage)) {
              const err = new Error(`Sync failed for ${table}: ${errMessage}`);
              (err as Error & { fatalSchema?: boolean }).fatalSchema = true;
              throw err;
            }
            throw new Error(`Sync failed for ${table}: ${errMessage}`);
          }
          return true;
        };

        try {
          await attemptSync();

          // Broadcast to other tabs for INSTANT update (skip if silent)
          if (!silent && typeof window !== 'undefined') {
            set({ _ignoreBroadcastUntil: Date.now() + 2000 });
            const bc = new BroadcastChannel('disma_core_sync');
            bc.postMessage({ type: 'SYNC_UPDATE', table });
            bc.close();
          }
        } catch (firstError) {
          // Beda kolom tidak akan sembuh dengan diulang — teriakkan sekarang.
          if ((firstError as Error & { fatalSchema?: boolean })?.fatalSchema) {
            set({ isSyncing: false });
            if (!silent && typeof window !== 'undefined') {
              const { toast } = await import('sonner');
              toast.error(`⚠️ ${table} TIDAK tersimpan — struktur datanya tidak cocok. Lapor ke developer, jangan diulang.`, { duration: 12000 });
            }
            throw firstError;
          }
          // RETRY ONCE after 2s — Supabase may be waking from hibernation
          console.warn(`[Sync] First attempt failed for ${table}, retrying in 2s...`, firstError);
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await attemptSync();
            console.log(`[Sync] Retry succeeded for ${table}`);
          } catch (retryError) {
            console.error(`[Sync] FAILED after retry for ${table}:`, retryError);
            // Show visible error to user — NEVER fail silently
            if (!silent && typeof window !== 'undefined') {
              const { toast } = await import('sonner');
              toast.error(`⚠️ Gagal menyimpan ${table} ke server! Data tersimpan lokal saja. Coba sync lagi nanti.`, { duration: 8000 });
            }
            // CRITICAL: accounting tables MUST propagate failure so callers (e.g. createAccountingEntry)
            // can abort and prevent silent data corruption (transaction marked done without journal).
            const CRITICAL_TABLES = ['journal_entries', 'journal_lines', 'cash_transactions', 'bank_accounts'];
            if (CRITICAL_TABLES.includes(table)) {
              set({ isSyncing: false });
              throw retryError;
            }
          }
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
          const cachedBudgetPlans = loadLocalCache<BudgetPlan>(LOCAL_BUDGET_PLANS_CACHE_KEY);
          const cachedBudgetCategories = loadLocalCache<BudgetCategory>(LOCAL_BUDGET_CATEGORIES_CACHE_KEY);
          const cachedBudgetSubCategories = loadLocalCache<BudgetSubCategory>(LOCAL_BUDGET_SUB_CATEGORIES_CACHE_KEY);
          const cachedBudgetAdjustments = loadLocalCache<BudgetAdjustment>(LOCAL_BUDGET_ADJUSTMENTS_CACHE_KEY);
          const cachedDisbursementRequests = loadLocalDisbursementRequestsCache();
          const cachedClientPrices = loadLocalCache<ClientPrice>(LOCAL_CLIENT_PRICES_CACHE_KEY);

          const hasCache = cachedClients.length > 0 || cachedProducts.length > 0 || cachedSalesOrders.length > 0 || cachedLeads.length > 0 || cachedPurchaseRequests.length > 0 || cachedBudgetPlans.length > 0 || cachedDisbursementRequests.length > 0;
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
              budgetPlans: cachedBudgetPlans.length > 0 ? cachedBudgetPlans : get().budgetPlans,
              budgetCategories: cachedBudgetCategories.length > 0 ? cachedBudgetCategories : get().budgetCategories,
              budgetSubCategories: cachedBudgetSubCategories.length > 0 ? cachedBudgetSubCategories : get().budgetSubCategories,
              budgetAdjustments: cachedBudgetAdjustments.length > 0 ? cachedBudgetAdjustments : get().budgetAdjustments,
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

          const fetchGroup = async (group: number): Promise<Record<string, any>> => {
            try {
              const controller = new AbortController();
              // Group 1 ships ~5.7MB (20k client_prices rows) and takes 13-15s from
              // production, so the old 9s budget aborted it on every boot and left the
              // app on its stale local snapshot. Vercel functions run up to 300s.
              // ponytail: one timeout for all groups; split the fat tables out if the
              // payload keeps growing.
              const timeoutId = setTimeout(() => controller.abort(), 45000);
              const res = await fetch(`/api/db?group=${group}&ts=${ts}`, { 
                cache: 'no-store',
                signal: controller.signal 
              });
              clearTimeout(timeoutId);
              if (!res.ok) {
                console.warn(`[INIT] Group ${group} returned ${res.status}`);
                failedGroups.push(group);
                return {};
              }
              const json = await res.json();
              return (json && !json.error) ? json : {};
            } catch (e) {
              console.warn(`[INIT] Group ${group} failed:`, e);
              failedGroups.push(group);
              return {};
            }
          };

          // Fetch groups in PARALLEL. Each group is its own serverless
          // invocation with its own maxDuration, so running them concurrently
          // costs no extra timeout budget — total wall clock is the slowest
          // group instead of the sum of all five.
          const [g1, g2, g3, g4, g5] = await Promise.all([
            fetchGroup(1), fetchGroup(2), fetchGroup(3), fetchGroup(4), fetchGroup(5),
          ]);

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
                mergedBanks.forEach(b => get().syncTable('bank_accounts', b, true));
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
            saveLocalBankAccountsCache(mergedBanks);
            set({ bankAccounts: mergedBanks });

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
            setIfDefined('dailyCostConfig', data.dailyCostConfig);
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
            setIfDefined('employees', data.employees);
            setIfDefined('fixedAssets', data.fixedAssets);
            setIfDefined('pendingReturns', data.pendingReturns);
            setIfDefined('vendorReturns', data.vendorReturns);
            setIfDefined('priceBaseline', data.priceBaseline);
            setIfDefined('rejectedItems', data.rejectedItems);
            setIfDefined('okrObjectives', data.okrObjectives);
            setIfDefined('budgetPlans', data.budgetPlans);
            setIfDefined('budgetCategories', data.budgetCategories);
            setIfDefined('budgetSubCategories', data.budgetSubCategories);
            setIfDefined('budgetAdjustments', data.budgetAdjustments);
            if (data.kpiObjectives !== undefined) {
              updatedState.kpiObjectives = data.kpiObjectives.length > 0 ? data.kpiObjectives : KPI_SEED;
            }

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
            if (data.budgetPlans !== undefined) saveLocalCache(LOCAL_BUDGET_PLANS_CACHE_KEY, data.budgetPlans);
            if (data.budgetCategories !== undefined) saveLocalCache(LOCAL_BUDGET_CATEGORIES_CACHE_KEY, data.budgetCategories);
            if (data.budgetSubCategories !== undefined) saveLocalCache(LOCAL_BUDGET_SUB_CATEGORIES_CACHE_KEY, data.budgetSubCategories);
            if (data.budgetAdjustments !== undefined) saveLocalCache(LOCAL_BUDGET_ADJUSTMENTS_CACHE_KEY, data.budgetAdjustments);

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

              // NOTE: Bank balance is DB-authoritative (set via opening balance + cumulative deltas).
              // Recomputing balance = sum(In) - sum(Out) starting from 0 breaks imports / opening balances.
              // We only dedup the cash_tx + JE records, leave bank balances untouched.
              set({
                cashTransactions: dedupedCashTransactions,
                journalEntries: dedupedJournalEntries,
                journalLines: dedupedJournalLines,
              });

              // Only reset+reseed dedup-affected tables. Leave bank_accounts alone (DB-authoritative balance).
              await fetch('/api/db/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'custom',
                  tables: ['journal_lines', 'journal_entries', 'cash_transactions'],
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
            tier_margins: state.tierMargins
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
        const before = state.clients.find(c => c.id === id);
        if (!before) return false;

        const blockers = clientDeletionBlockers(id, {
          salesOrders: state.salesOrders || [],
          invoices: state.invoices || [],
          tukarFakturs: state.tukarFakturs || [],
          clientPrices: state.clientPrices || [],
        });
        if (blockers.length > 0) {
          toast.error(`${before.companyName} sudah punya ${describeBlockers(blockers)} — tidak bisa dihapus.`);
          return false;
        }

        const priceIds = clientPriceIdsToRemove(id, state.clientPrices || []);

        try {
          if (priceIds.length > 0) await state.deleteMultipleClientPrices(priceIds);

          const res = await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'clients', id })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Gagal menghapus klien');
          }

          const remaining = get().clients.filter(c => c.id !== id);
          set({ clients: remaining });
          saveLocalClientsCache(remaining);
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
        const res = await fetch('/api/db', {
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

          const response = await fetch('/api/db', {
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

          set({ clients: updatedClients });
          saveLocalClientsCache(updatedClients);

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
        } finally {
          set({ isSyncing: false });
        }
      },

      vendors: VENDORS_SEED,
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
          await fetch('/api/db', {
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
            await fetch('/api/db', {
              method: 'DELETE',
              body: JSON.stringify({ table: 'sales_order_items', id: itemIds }),
            });
          }
          await fetch('/api/db', {
            method: 'DELETE',
            body: JSON.stringify({ table: 'sales_orders', id }),
          });

          if (orderBefore) await get().logHistory({ table: 'sales_orders', recordId: id, action: 'delete', oldData: orderBefore, newData: null });
        } catch (e) {
          console.error("Failed to delete sales order:", e);
        }
      },
      deleteMultipleSalesOrders: async (ids: string[]) => {
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
            await fetch('/api/db', {
              method: 'DELETE',
              body: JSON.stringify({ table: 'sales_order_items', id: itemIds }),
            });
          }
          await fetch('/api/db', {
            method: 'DELETE',
            body: JSON.stringify({ table: 'sales_orders', id: ids }),
          });

          for (const order of ordersBefore) {
            await get().logHistory({ table: 'sales_orders', recordId: order.id, action: 'delete', oldData: order, newData: null });
          }
        } catch (e) {
          console.error("Failed to bulk delete sales orders:", e);
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
        await fetch('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'sales_order_items', id }) });
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
        // Cascade: remove related purchase_items + vendor_bills + unlink salesOrders shoppingListDocumentId
        const purchaseBefore = get().purchases.find(p => p.id === id);
        const itemsToDelete = get().purchaseItems.filter(pi => pi.purchaseId === id);
        const itemIds = itemsToDelete.map(pi => pi.id);

        const billsToDelete = get().vendorBills.filter(vb => vb.purchaseId === id);
        const billIds = billsToDelete.map(vb => vb.id);

        const remainingPurchases = get().purchases.filter(p => p.id !== id);
        const remainingItems = get().purchaseItems.filter(pi => pi.purchaseId !== id);
        const remainingVendorBills = get().vendorBills.filter(vb => vb.purchaseId !== id);

        set({
          purchases: remainingPurchases,
          purchaseItems: remainingItems,
          vendorBills: remainingVendorBills
        });
        saveLocalPurchasesCache(remainingPurchases);
        saveLocalPurchaseItemsCache(remainingItems);

        // Unlink sales orders referencing this purchase as shopping list doc
        const affectedSOs = get().salesOrders.filter(so => so.shoppingListDocumentId === id);
        const sosBeforeMap = new Map(affectedSOs.map(so => [so.id, { ...so }]));
        if (affectedSOs.length > 0) {
          const updatedSOs = get().salesOrders.map(so =>
            so.shoppingListDocumentId === id
              ? { ...so, status: 'Draft' as const, shoppingListDocumentId: null as any, shoppingListCompiledAt: null as any, shoppingListCompiledBy: null as any }
              : so
          );
          set({ salesOrders: updatedSOs });
          saveLocalSalesOrdersCache(updatedSOs);
          for (const so of affectedSOs) {
            const after = updatedSOs.find(s => s.id === so.id)!;
            await get().syncTable('sales_orders', after);
            const beforeSO = sosBeforeMap.get(so.id);
            if (beforeSO) await get().logHistory({ table: 'sales_orders', recordId: so.id, action: 'update', oldData: beforeSO, newData: after, reason: `Auto-unlink (deletePurchase ${id.slice(0,8)})` });
          }
        }

        try {
          if (billIds.length > 0) {
            await fetch('/api/db', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: 'vendor_bills', id: billIds })
            });
            for (const vb of billsToDelete) {
              await get().logHistory({ table: 'vendor_bills', recordId: vb.id, action: 'delete', oldData: vb, newData: null, reason: `Cascade from deletePurchase ${id.slice(0,8)}` });
            }
          }
          if (itemIds.length > 0) {
            await fetch('/api/db', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: 'purchase_items', id: itemIds })
            });
            for (const pi of itemsToDelete) {
              await get().logHistory({ table: 'purchase_items', recordId: pi.id, action: 'delete', oldData: pi, newData: null, reason: `Cascade from deletePurchase ${id.slice(0,8)}` });
            }
          }
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'purchases', id })
          });
          if (purchaseBefore) await get().logHistory({ table: 'purchases', recordId: id, action: 'delete', oldData: purchaseBefore, newData: null });
        } catch (e) {
          console.error("Failed to delete purchase from server:", e);
        }
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
        const before = get().purchaseItems.find(pi => pi.id === id);
        const remaining = get().purchaseItems.filter(pi => pi.id !== id);
        set({ purchaseItems: remaining });
        saveLocalPurchaseItemsCache(remaining);
        try {
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'purchase_items', id })
          });
          if (before) await get().logHistory({ table: 'purchase_items', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete purchase item from server:", e);
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
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'purchase_requests', id })
          });
          if (before) await get().logHistory({ table: 'purchase_requests', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete purchase request from server:", e);
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
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'disbursement_requests', id })
          });
          if (before) await get().logHistory({ table: 'disbursement_requests', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          console.error("Failed to delete disbursement request from server:", e);
        }
      },

      tutupHariKantong: [],
      addTutupHariKantong: async (rec) => {
        set({ tutupHariKantong: [...get().tutupHariKantong, rec] });
        await get().syncTable('tutup_hari_kantong', rec);
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
          nav_configs: { ...state.navConfigs, tier_margins: state.tierMargins },
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
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'deliveries', id })
          });
          if (before) await get().logHistory({ table: 'deliveries', recordId: id, action: 'delete', oldData: before, newData: null });
        } catch (e) {
          // Restore on failure
          if (before) set((state) => ({ deliveries: [before, ...state.deliveries] }));
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
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveSupabaseEnv } = await import('@/lib/supabase-env');
        const env = resolveSupabaseEnv();
        const sb = createClient(env.url, env.anonKey);
        const { error } = await sb.rpc('delete_tukar_faktur', { p_tf_id: id });
        if (error) throw new Error(`Delete TF gagal: ${error.message}`);

        set((state) => ({
          tukarFakturs: state.tukarFakturs.filter(t => t.id !== id),
          invoices: state.invoices.map(inv => inv.tukarFakturId === id ? { ...inv, tukarFakturId: undefined } : inv),
        }));

        if (before) await get().logHistory({ table: 'tukar_faktur', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      issueTukarFaktur: async (tfId: string, invoiceIds: string[], issueDate: string, userId: string) => {
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveSupabaseEnv } = await import('@/lib/supabase-env');
        const env = resolveSupabaseEnv();
        const sb = createClient(env.url, env.anonKey);
        const { data, error } = await sb.rpc('issue_tukar_faktur', {
          p_tf_id: tfId,
          p_invoice_ids: invoiceIds,
          p_issue_date: issueDate,
          p_user_id: userId,
        });
        if (error) throw new Error(`Issue TF gagal: ${error.message}`);

        const [{ data: tfRow }, { data: invRows }] = await Promise.all([
          sb.from('tukar_faktur').select('*').eq('id', tfId).single(),
          sb.from('invoices').select('*').in('id', invoiceIds),
        ]);
        if (tfRow) {
          const camelTf: TukarFaktur = {
            id: tfRow.id,
            tfNumber: tfRow.tf_number,
            clientId: tfRow.client_id,
            periodStart: tfRow.period_start,
            periodEnd: tfRow.period_end,
            issueDate: tfRow.issue_date,
            status: tfRow.status,
            totalAmount: Number(tfRow.total_amount) || 0,
            notes: tfRow.notes || undefined,
            issuedBy: tfRow.issued_by || undefined,
            receivedAt: tfRow.received_at || undefined,
            receivedBy: tfRow.received_by || undefined,
            createdAt: tfRow.created_at,
          };
          set(state => ({
            tukarFakturs: state.tukarFakturs.map(t => t.id === tfId ? camelTf : t),
          }));
        }
        if (invRows) {
          set(state => ({
            invoices: state.invoices.map(inv => {
              const fresh = invRows.find((r: { id: string }) => r.id === inv.id);
              if (!fresh) return inv;
              return { ...inv, tukarFakturId: fresh.tukar_faktur_id || undefined, dueDate: fresh.due_date };
            }),
          }));
        }
        return data;
      },

      linkInvoicesToTukarFaktur: async (tfId: string, invoiceIds: string[]) => {
        const { createClient } = await import('@supabase/supabase-js');
        const { resolveSupabaseEnv } = await import('@/lib/supabase-env');
        const env = resolveSupabaseEnv();
        const sb = createClient(env.url, env.anonKey);
        const { data, error } = await sb.rpc('link_invoices_to_tukar_faktur', {
          p_tf_id: tfId,
          p_invoice_ids: invoiceIds,
        });
        if (error) throw new Error(`Link TF gagal: ${error.message}`);

        const [{ data: tfRow }, { data: invRows }] = await Promise.all([
          sb.from('tukar_faktur').select('*').eq('id', tfId).single(),
          sb.from('invoices').select('*').in('id', invoiceIds),
        ]);
        if (tfRow) {
          set(state => ({
            tukarFakturs: state.tukarFakturs.map(t => t.id === tfId ? {
              ...t,
              totalAmount: Number(tfRow.total_amount) || 0,
            } : t),
          }));
        }
        if (invRows) {
          set(state => ({
            invoices: state.invoices.map(inv => {
              const fresh = invRows.find((r: { id: string }) => r.id === inv.id);
              if (!fresh) return inv;
              return { ...inv, tukarFakturId: fresh.tukar_faktur_id || undefined };
            }),
          }));
        }
        return data;
      },

      recordTukarFakturPayment: async (tfId, allocations, paymentDate, bankAccountId, totalAmount) => {
        const { recordPaymentReceived } = await import('./accounting');
        const state = get();
        
        let childUpdates: { id: string; data: Partial<Invoice> }[] = [];
        let success = true;

        for (const [childId, amount] of Object.entries(allocations)) {
          if (amount <= 0) continue;
          const child = state.invoices.find(i => i.id === childId);
          if (!child) continue;

          const apiSuccess = await recordPaymentReceived(childId, amount, paymentDate, bankAccountId);
          if (!apiSuccess) {
            success = false;
            break;
          }

          const newAmountPaid = (child.amountPaid || 0) + amount;
          const status: InvoiceStatus = newAmountPaid >= child.totalAmount ? 'Paid' : 'Partial';
          const paymentRecord = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            amount,
            date: paymentDate,
            note: `Pembayaran via Tukar Faktur ${tfId}`
          };

          childUpdates.push({
            id: childId,
            data: {
              amountPaid: newAmountPaid,
              status,
              payments: [...(child.payments || []), paymentRecord]
            }
          });
        }

        if (!success) return false;

        // Update child invoices in state
        const updatedInvoices = state.invoices.map(inv => {
          const update = childUpdates.find(u => u.id === inv.id);
          return update ? { ...inv, ...update.data } : inv;
        });

        // `tfId` bisa menunjuk ke dua jenis batch: invoice konsolidasi lama (punya baris
        // invoice sendiri sebagai induk) atau baris `tukar_faktur` dari sistem baru (tidak
        // punya invoice induk sama sekali). Dulu SELURUH penerapan hasil pembayaran ada di
        // dalam `if (parent)`, jadi untuk batch sistem baru pembayaran anaknya hilang dari
        // state dan tidak pernah tersimpan. Terapkan update anak lebih dulu, tanpa syarat.
        const parent = updatedInvoices.find(i => i.id === tfId);
        const invoicesToSync: Invoice[] = [];
        let finalInvoices = updatedInvoices;

        if (parent) {
          const parentChildren = updatedInvoices.filter(
            i => i.supersededByInvoiceId === tfId || i.tukarFakturId === tfId
          );
          const totalPaid = parentChildren.reduce((sum, c) => sum + (c.amountPaid || 0), 0);
          const status: InvoiceStatus = totalPaid >= parent.totalAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';

          const parentPaymentRecord = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            amount: totalAmount,
            date: paymentDate,
            note: `Pembayaran bulk Tukar Faktur`
          };

          const updatedParent = {
            ...parent,
            amountPaid: totalPaid,
            status,
            payments: [...(parent.payments || []), parentPaymentRecord]
          };

          finalInvoices = updatedInvoices.map(inv => inv.id === tfId ? updatedParent : inv);
          invoicesToSync.push(updatedParent);
        }

        set({ invoices: finalInvoices });
        saveLocalCache(LOCAL_INVOICES_CACHE_KEY, finalInvoices);

        for (const update of childUpdates) {
          const updatedChild = finalInvoices.find(i => i.id === update.id);
          if (updatedChild) invoicesToSync.push(updatedChild);
        }

        // Sync parent and child invoices to database in a single batch request
        if (invoicesToSync.length > 0) {
          await get().syncTable('invoices', invoicesToSync);
        }

        // Batch sistem baru: tandai baris tukar_faktur-nya lunas kalau semua anaknya lunas.
        const tf = get().tukarFakturs.find(t => t.id === tfId);
        if (tf) {
          const tfChildren = finalInvoices.filter(i => i.tukarFakturId === tfId);
          const fullyPaid = tfChildren.length > 0 && tfChildren.every(c => c.status === 'Paid');
          if (fullyPaid && tf.status !== 'Paid') {
            await get().updateTukarFaktur(tfId, { status: 'Paid' });
          }
        }

        return true;
      },

      // === Vendor Bills (Accounts Payable) ===
      vendorBills: [],
      addVendorBill: async (bill: VendorBill) => {
        set((state) => ({ vendorBills: [...state.vendorBills, bill] }));
        await get().syncTable('vendor_bills', bill);
      },
      updateVendorBill: async (id: string, data: Partial<VendorBill>) => {
        set((state) => ({
          vendorBills: state.vendorBills.map(vb => vb.id === id ? { ...vb, ...data } : vb)
        }));
        const updated = get().vendorBills.find(vb => vb.id === id);
        if (updated) await get().syncTable('vendor_bills', updated);
      },
      deleteVendorBill: async (id: string) => {
        set((state) => ({ vendorBills: state.vendorBills.filter(vb => vb.id !== id) }));
        try {
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'vendor_bills', id })
          });
        } catch (e) { console.warn('[deleteVendorBill] sync failed', e); }
      },
      payVendorBill: async (billId: string, payment: VendorBillPayment) => {
        const bill = get().vendorBills.find(vb => vb.id === billId);
        if (!bill) throw new Error('Vendor bill tidak ditemukan');

        // Idempotency: check if payment ID is already registered to avoid double payment
        const alreadyPaid = bill.payments?.some(p => p.id === payment.id);
        if (alreadyPaid) {
          console.warn(`Payment ${payment.id} already applied to bill ${billId}`);
          return;
        }

        const bank = get().bankAccounts.find(b => b.id === payment.bankAccountId);
        if (!bank) throw new Error('Bank account tidak ditemukan');

        // 1. Create Journal Entry dynamically to avoid circular import issues
        const { createAccountingEntry } = await import('@/lib/accounting');
        const journalDesc = `Bayar Hutang ${bill.vendorName} (${bill.billNumber})`;
        const ok = await createAccountingEntry(
          journalDesc,
          'Payment',
          payment.id,
          [{ accountCode: '2-1000', amount: payment.amount, vendorId: bill.vendorId, vendorBillId: bill.id }] as any,
          [{ accountCode: bank.accountCode || '1-1100', amount: payment.amount }] as any,
          payment.date
        );
        if (!ok) throw new Error('Gagal mencatat jurnal pembayaran');

        // 2. Add Cash Transaction (which updates bank balance & syncs table)
        await get().addCashTransaction({
          id: payment.id,
          date: payment.date,
          type: 'Out',
          amount: payment.amount,
          bankAccountId: payment.bankAccountId,
          category: 'Bayar Hutang Vendor',
          description: payment.note
            ? `${bill.vendorName} — ${bill.billNumber} (${payment.note})`
            : `${bill.vendorName} — ${bill.billNumber}`,
          counterpartName: bill.vendorName,
          referenceType: 'Manual',
        });

        // 3. Update VendorBill record
        const newPayments = [...(bill.payments || []), payment];
        const newAmountPaid = (bill.amountPaid || 0) + payment.amount;
        const newStatus: VendorBill['status'] =
          newAmountPaid >= bill.totalAmount ? 'Paid' : newAmountPaid > 0 ? 'PartialPaid' : 'Pending';

        const oldBill = { ...bill };
        await get().updateVendorBill(billId, {
          payments: newPayments,
          amountPaid: newAmountPaid,
          status: newStatus,
        });

        // 4. Log History
        await get().logHistory({
          table: 'vendor_bills',
          recordId: billId,
          action: 'update',
          oldData: oldBill,
          newData: { ...bill, payments: newPayments, amountPaid: newAmountPaid, status: newStatus }
        });
      },

      journalEntries: [],
      addJournalEntry: async (entry) => {
        const before = get().journalEntries;
        set({ journalEntries: [...before, entry] });
        try {
          await get().syncTable('journal_entries', entry);
        } catch (error) {
          set({ journalEntries: before });
          throw error;
        }
      },
      updateJournalEntry: async (id: string, updates: Partial<JournalEntry>, newLines: JournalLine[]) => {
        const beforeEntry = get().journalEntries.find(e => e.id === id);
        const beforeLines = get().journalLines.filter(l => l.journalEntryId === id);
        set((state) => ({
          journalEntries: state.journalEntries.map(e => e.id === id ? { ...e, ...updates } : e),
          journalLines: [
            ...state.journalLines.filter(l => l.journalEntryId !== id),
            ...newLines
          ]
        }));
        const updatedEntry = get().journalEntries.find(e => e.id === id);
        if (updatedEntry) {
          await get().syncTable('journal_entries', updatedEntry);
          if (beforeEntry) await get().logHistory({ table: 'journal_entries', recordId: id, action: 'update', oldData: { ...beforeEntry, lines: beforeLines }, newData: { ...updatedEntry, lines: newLines } });
        }
        await get().syncTable('journal_lines', newLines);
      },

      journalLines: [],
      addJournalLine: async (line) => {
        const before = get().journalLines;
        set({ journalLines: [...before, line] });
        try {
          await get().syncTable('journal_lines', line);
        } catch (error) {
          set({ journalLines: before });
          throw error;
        }
      },
      addJournalLines: async (lines) => {
        const before = get().journalLines;
        set({ journalLines: [...before, ...lines] });
        try {
          await get().syncTable('journal_lines', lines);
        } catch (error) {
          set({ journalLines: before });
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
        await fetch('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'leads', id }) });
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
        await fetch('/api/db', { method: 'DELETE', body: JSON.stringify({ table: 'disma_tasks', id }) });
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

      employees: [],
      addEmployee: async (emp) => {
        set((state) => ({ employees: [...state.employees, emp] }));
        await get().syncTable('employees', emp);
      },
      updateEmployee: async (id, data) => {
        const before = get().employees.find(e => e.id === id);
        set((state) => ({
          employees: state.employees.map(e => e.id === id ? { ...e, ...data } : e)
        }));
        const updated = get().employees.find(e => e.id === id);
        if (updated) {
          await get().syncTable('employees', updated);
          if (before) await get().logHistory({ table: 'employees', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      
      kpiObjectives: KPI_SEED,
      addKpi: async (kpi) => {
        set((state) => ({ kpiObjectives: [...state.kpiObjectives, kpi] }));
        await get().syncTable('kpis', kpi);
      },
      updateKpi: async (id, data) => {
        const before = get().kpiObjectives.find(k => k.id === id);
        set((state) => ({
          kpiObjectives: state.kpiObjectives.map(k => k.id === id ? { ...k, ...data } : k)
        }));
        const updated = get().kpiObjectives.find(k => k.id === id);
        if (updated) {
          await get().syncTable('kpis', updated);
          if (before) await get().logHistory({ table: 'kpis', recordId: id, action: 'update', oldData: before, newData: updated });

          // Propagate KPI updates to linked OKR Key Results
          const updatedObjectives: OkrObjective[] = [];
          const updatedKRsToSync: OkrKeyResult[] = [];
          const currentOkrs = get().okrObjectives;
          let okrsChanged = false;

          const newOkrs = currentOkrs.map(okr => {
            let krChanged = false;
            const newKrs = okr.keyResults.map(kr => {
              if (kr.linkedKpiId === id) {
                krChanged = true;
                const updatedKr: OkrKeyResult = {
                  ...kr,
                  currentValue: updated.actualValue !== undefined ? updated.actualValue : kr.currentValue,
                  targetValue: updated.targetValue !== undefined ? updated.targetValue : kr.targetValue,
                  unit: updated.unit !== undefined ? updated.unit : kr.unit,
                };
                updatedKRsToSync.push(updatedKr);
                return updatedKr;
              }
              return kr;
            });

            if (krChanged) {
              okrsChanged = true;
              let totalProgress = 0;
              newKrs.forEach(k => {
                const target = k.targetValue || 1;
                const prog = (k.currentValue / target) * 100;
                totalProgress += Math.max(0, Math.min(prog, 100));
              });
              const newParentProgress = newKrs.length > 0 ? (totalProgress / newKrs.length) : 0;

              const updatedOkr = {
                ...okr,
                keyResults: newKrs,
                progress: newParentProgress
              };
              updatedObjectives.push(updatedOkr);
              return updatedOkr;
            }
            return okr;
          });

          if (okrsChanged) {
            set({ okrObjectives: newOkrs });
            if (updatedKRsToSync.length > 0) {
              await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'okr_key_results', data: updatedKRsToSync })
              });
            }
            for (const okr of updatedObjectives) {
              const { keyResults, ...objectiveData } = okr;
              await get().syncTable('okr_objectives', objectiveData);
            }
          }
        }
      },
      deleteKpi: async (id) => {
        const before = get().kpiObjectives.find(k => k.id === id);
        set((state) => ({ kpiObjectives: state.kpiObjectives.filter(k => k.id !== id) }));
        
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'kpis', id })
        });
        
        if (before) {
          await get().logHistory({ table: 'kpis', recordId: id, action: 'delete', oldData: before, newData: null });
        }

        // Unlink any OKR Key Results referencing this KPI
        const updatedKRsToSync: any[] = [];
        const currentOkrs = get().okrObjectives;
        let okrsChanged = false;

        const newOkrs = currentOkrs.map(okr => {
          let krChanged = false;
          const newKrs = okr.keyResults.map(kr => {
            if (kr.linkedKpiId === id) {
              krChanged = true;
              const updatedKr = {
                ...kr,
                linkedKpiId: null as any
              };
              updatedKRsToSync.push(updatedKr);
              return updatedKr;
            }
            return kr;
          });

          if (krChanged) {
            okrsChanged = true;
            return {
              ...okr,
              keyResults: newKrs
            };
          }
          return okr;
        });

        if (okrsChanged) {
          set({ okrObjectives: newOkrs });
          if (updatedKRsToSync.length > 0) {
            await fetch('/api/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: 'okr_key_results', data: updatedKRsToSync })
            });
          }
        }
      },
      
      okrObjectives: [],
      addOkr: async (okr) => {
        set((state) => ({ okrObjectives: [...state.okrObjectives, okr] }));
        const { keyResults, ...objectiveData } = okr;
        await get().syncTable('okr_objectives', objectiveData);
      },
      updateOkr: async (id, data) => {
        const before = get().okrObjectives.find(o => o.id === id);
        set((state) => ({
          okrObjectives: state.okrObjectives.map(o => o.id === id ? { ...o, ...data } : o)
        }));
        const updated = get().okrObjectives.find(o => o.id === id);
        if (updated) {
          const { keyResults, ...objectiveData } = updated;
          await get().syncTable('okr_objectives', objectiveData);
          if (data.keyResults && data.keyResults.length > 0) {
              await fetch('/api/db', {
                  method: 'POST',
                  body: JSON.stringify({ table: 'okr_key_results', data: data.keyResults })
              });
          }
          if (before) await get().logHistory({ table: 'okr_objectives', recordId: id, action: 'update', oldData: before, newData: updated });
        }
      },
      deleteOkr: async (id) => {
        const before = get().okrObjectives.find(o => o.id === id);
        if (!before) return;
        
        set((state) => ({ okrObjectives: state.okrObjectives.filter(o => o.id !== id) }));
        
        const krIds = before.keyResults.map(kr => kr.id);
        if (krIds.length > 0) {
          await fetch('/api/db', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'okr_key_results', id: krIds })
          });
        }
        
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'okr_objectives', id })
        });
        
        await get().logHistory({ table: 'okr_objectives', recordId: id, action: 'delete', oldData: before, newData: null });
      },
      deleteKeyResult: async (objectiveId, krId) => {
        const parentObjective = get().okrObjectives.find(o => o.id === objectiveId);
        if (!parentObjective) return;
        
        const beforeKr = parentObjective.keyResults.find(k => k.id === krId);
        if (!beforeKr) return;
        
        const updatedKRs = parentObjective.keyResults.filter(k => k.id !== krId);
        
        let totalProgress = 0;
        updatedKRs.forEach(kr => {
          const target = kr.targetValue || 1;
          const prog = (kr.currentValue / target) * 100;
          totalProgress += Math.max(0, Math.min(prog, 100));
        });
        const newProgress = updatedKRs.length > 0 ? (totalProgress / updatedKRs.length) : 0;
        
        set((state) => ({
          okrObjectives: state.okrObjectives.map(o => 
            o.id === objectiveId 
              ? { ...o, keyResults: updatedKRs, progress: newProgress } 
              : o
          )
        }));
        
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'okr_key_results', id: krId })
        });
        
        const updatedOkr = get().okrObjectives.find(o => o.id === objectiveId);
        if (updatedOkr) {
          const { keyResults, ...objectiveData } = updatedOkr;
          await get().syncTable('okr_objectives', objectiveData);
          await get().logHistory({ table: 'okr_key_results', recordId: krId, action: 'delete', oldData: beforeKr, newData: null });
        }
      },

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
        set((state) => ({ bankAccounts: [...state.bankAccounts, acc] }));
        await get().syncTable('bank_accounts', acc);
      },
      updateBankAccount: async (id: string, data: Partial<BankAccount>) => {
        const before = get().bankAccounts.find(b => b.id === id);
        set((state) => ({
          bankAccounts: state.bankAccounts.map(b => b.id === id ? { ...b, ...data } : b)
        }));
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) {
          await get().syncTable('bank_accounts', updated);
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

        const res = await fetch('/api/db', {
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
      updateBankBalance: async (id: string, amount: number) => {
        const before = get().bankAccounts.find(b => b.id === id);
        const beforeBanks = get().bankAccounts;
        const newBanks = get().bankAccounts.map(b => b.id === id ? { ...b, balance: b.balance + amount } : b);
        set({ bankAccounts: newBanks });
        saveLocalBankAccountsCache(newBanks);
        const updated = get().bankAccounts.find(b => b.id === id);
        if (updated) {
          try {
            await get().syncTable('bank_accounts', updated);
            if (before) await get().logHistory({ table: 'bank_accounts', recordId: id, action: 'update', oldData: before, newData: updated });
          } catch (error) {
            set({ bankAccounts: beforeBanks });
            saveLocalBankAccountsCache(beforeBanks);
            throw error;
          }
        }
      },
      cashTransactions: [],
      addCashTransaction: async (tx) => {
        // Auto-snapshot sebelum setiap transaksi kas supaya bisa di-undo step by step
        get().takeDevSnapshot();
        // Stamp local-mutation time (this path bypasses syncTable) so an in-flight
        // init() discards a stale snapshot instead of flickering the balance back.
        set({ _lastLocalMutationAt: Date.now() });
        const previousCashTransactions = get().cashTransactions;
        const previousBankAccounts = get().bankAccounts;
        const balanceChange = tx.type === 'In' ? tx.amount : -tx.amount;

        set((state) => {
          const updatedAccounts = state.bankAccounts.map(b => 
            b.id === tx.bankAccountId ? { ...b, balance: (b.balance || 0) + balanceChange } : b
          );
          
          return { 
            cashTransactions: state.cashTransactions.some((candidate) => candidate.id === tx.id)
              ? state.cashTransactions.map((candidate) => candidate.id === tx.id ? tx : candidate)
              : [tx, ...state.cashTransactions],
            bankAccounts: updatedAccounts
          }
        });

        try {
          const response = await fetch('/api/accounting/cash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx }),
          });

          const payload = await response.json().catch(() => ({})) as CashPostResponse;
          if (!response.ok) {
            throw new Error(payload.error || response.statusText);
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
          set({
            cashTransactions: previousCashTransactions,
            bankAccounts: previousBankAccounts,
          });
          saveLocalBankAccountsCache(previousBankAccounts);
          throw error;
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
        await get().logHistory({ table: 'cash_transactions', recordId: id, action: 'update', oldData: existing, newData: newTx });
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
        await get().logHistory({ table: 'cash_transactions', recordId: id, action: 'delete', oldData: existing, newData: null });
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
        for (const tx of txsToDelete) {
          await get().logHistory({ table: 'cash_transactions', recordId: tx.id, action: 'delete', oldData: tx, newData: null, reason: 'Bulk delete' });
        }
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
        await fetch('/api/db', {
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
        await fetch('/api/db', {
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
        await fetch('/api/db', {
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
            tier_margins: state.tierMargins
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
      // Wrap a multi-step operation so it produces ONE undo snapshot instead of
      // one per addCashTransaction. Undo then reverses the whole op atomically.
      // ponytail: single global depth counter — fine for one-user client; make
      // it per-operation-id if concurrent batches ever appear.
      beginUndoableBatch: () => {
        if (get()._snapshotDepth === 0) get().takeDevSnapshot();
        set(s => ({ _snapshotDepth: s._snapshotDepth + 1 }));
      },
      endUndoableBatch: () => set(s => ({ _snapshotDepth: Math.max(0, s._snapshotDepth - 1) })),
      isUndoing: false,
      shoppingListUndo: null,
      shoppingListHistoryLength: 0,
      setShoppingListUndo: (cb, length) => set({ shoppingListUndo: cb, shoppingListHistoryLength: length }),
      takeDevSnapshot: () => {
        // Inside a batch, only the boundary snapshot (taken by beginUndoableBatch)
        // is kept; inner snapshots are suppressed so undo stays atomic.
        if (get()._snapshotDepth > 0) return;
        const state = get();
        // Simpan hanya data operasional yang relevan (bukan functions/stack itu sendiri)
        const snapshot: Partial<AppState> = {
          salesOrders: state.salesOrders,
          salesOrderItems: state.salesOrderItems,
          purchases: state.purchases,
          purchaseItems: state.purchaseItems,
          purchaseRequests: state.purchaseRequests,
          disbursementRequests: state.disbursementRequests,
          deliveries: state.deliveries,
          expenses: state.expenses,
          invoices: state.invoices,
          tukarFakturs: state.tukarFakturs,
          journalEntries: state.journalEntries,
          journalLines: state.journalLines,
          stockMovements: state.stockMovements,
          cashTransactions: state.cashTransactions,
          bankAccounts: state.bankAccounts,
          pendingReturns: state.pendingReturns,
          vendorReturns: state.vendorReturns,
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
        set({ isUndoing: true });
        const toastId = toast.loading(`Undoing... (${devHistoryStack.length} step tersisa)`);
        
        try {
          const newStack = [...devHistoryStack];
          const snapshot = newStack.pop()!;
          const state = get();

          const ZUSTAND_TO_DB_TABLES: Record<string, string> = {
            salesOrders: 'sales_orders',
            salesOrderItems: 'sales_order_items',
            purchases: 'purchases',
            purchaseItems: 'purchase_items',
            purchaseRequests: 'purchase_requests',
            disbursementRequests: 'disbursement_requests',
            deliveries: 'deliveries',
            expenses: 'expenses',
            invoices: 'invoices',
            tukarFakturs: 'tukar_faktur',
            journalEntries: 'journal_entries',
            journalLines: 'journal_lines',
            stockMovements: 'stock_movements',
            cashTransactions: 'cash_transactions',
            bankAccounts: 'bank_accounts',
            pendingReturns: 'pending_returns',
            vendorReturns: 'vendor_returns',
            reimbursements: 'reimbursements',
            rejectedItems: 'rejected_items',
            products: 'products',
          };

          for (const [storeKey, dbTable] of Object.entries(ZUSTAND_TO_DB_TABLES)) {
            const snapList = (snapshot as any)[storeKey] || [];
            const curList = (state as any)[storeKey] || [];

            const snapMap = new Map(snapList.map((r: any) => [r.id, r]));
            const curMap = new Map(curList.map((r: any) => [r.id, r]));

            const toDelete: string[] = [];
            const toUpsert: any[] = [];

            // 1. Find deleted or updated items
            for (const snapItem of snapList) {
              const curItem = curMap.get(snapItem.id);
              if (!curItem) {
                toUpsert.push(snapItem);
              } else if (JSON.stringify(snapItem) !== JSON.stringify(curItem)) {
                toUpsert.push(snapItem);
              }
            }

            // 2. Find inserted items
            for (const curItem of curList) {
              if (!snapMap.has(curItem.id)) {
                toDelete.push(curItem.id);
              }
            }

            // 3. Sync deletions
            if (toDelete.length > 0) {
              const delRes = await fetch('/api/db', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: dbTable, id: toDelete })
              });
              if (!delRes.ok) throw new Error(`Failed deletion for ${dbTable}`);
            }

            // 4. Sync upserts
            if (toUpsert.length > 0) {
              const upsRes = await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: dbTable, data: toUpsert })
              });
              if (!upsRes.ok) throw new Error(`Failed update/insert for ${dbTable}`);
            }
          }

          // Restore state lokal
          set({ ...snapshot, devHistoryStack: newStack });
          if (snapshot.clients) saveLocalClientsCache(snapshot.clients);
          if (snapshot.products) saveLocalProductsCache(snapshot.products);
          if (snapshot.salesOrders) saveLocalSalesOrdersCache(snapshot.salesOrders);
          if (snapshot.salesOrderItems) saveLocalSalesOrderItemsCache(snapshot.salesOrderItems);
          if (snapshot.purchases) saveLocalPurchasesCache(snapshot.purchases);
          if (snapshot.purchaseItems) saveLocalPurchaseItemsCache(snapshot.purchaseItems);
          if (snapshot.purchaseRequests) saveLocalPurchaseRequestsCache(snapshot.purchaseRequests);

          toast.success(`Undo berhasil! (${newStack.length} step tersisa)`, { id: toastId });
        } catch (e: any) {
          toast.error("Gagal melakukan undo: " + e.message, { id: toastId });
        } finally {
          set({ isUndoing: false });
        }
      },
      upsertBudgetPlan: async (plan) => {
        const plans = get().budgetPlans;
        const exists = plans.some(p => p.id === plan.id);
        const updatedPlans = exists ? plans.map(p => p.id === plan.id ? plan : p) : [...plans, plan];
        set({ budgetPlans: updatedPlans });
        saveLocalCache(LOCAL_BUDGET_PLANS_CACHE_KEY, updatedPlans);
        await get().syncTable('budget_plans', plan);
      },
      deleteBudgetPlan: async (id) => {
        const updatedPlans = get().budgetPlans.filter(p => p.id !== id);
        set({ budgetPlans: updatedPlans });
        saveLocalCache(LOCAL_BUDGET_PLANS_CACHE_KEY, updatedPlans);
        
        // Cascade delete local sub states to prevent sync issues
        const categoriesToDelete = get().budgetCategories.filter(c => c.planId === id);
        const categoryIds = categoriesToDelete.map(c => c.id);
        const updatedCategories = get().budgetCategories.filter(c => c.planId !== id);
        set({ budgetCategories: updatedCategories });
        saveLocalCache(LOCAL_BUDGET_CATEGORIES_CACHE_KEY, updatedCategories);

        const updatedSubCategories = get().budgetSubCategories.filter(sc => !categoryIds.includes(sc.categoryId));
        set({ budgetSubCategories: updatedSubCategories });
        saveLocalCache(LOCAL_BUDGET_SUB_CATEGORIES_CACHE_KEY, updatedSubCategories);

        const updatedAdjustments = get().budgetAdjustments.filter(a => a.planId !== id);
        set({ budgetAdjustments: updatedAdjustments });
        saveLocalCache(LOCAL_BUDGET_ADJUSTMENTS_CACHE_KEY, updatedAdjustments);

        // Delete remotely
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'budget_plans', id })
        });
      },
      upsertBudgetCategory: async (category) => {
        const categories = get().budgetCategories;
        const exists = categories.some(c => c.id === category.id);
        const updatedCategories = exists ? categories.map(c => c.id === category.id ? category : c) : [...categories, category];
        set({ budgetCategories: updatedCategories });
        saveLocalCache(LOCAL_BUDGET_CATEGORIES_CACHE_KEY, updatedCategories);
        await get().syncTable('budget_categories', category);
      },
      upsertBudgetSubCategory: async (subCategory) => {
        const subCategories = get().budgetSubCategories;
        const exists = subCategories.some(sc => sc.id === subCategory.id);
        const updatedSubCategories = exists ? subCategories.map(sc => sc.id === subCategory.id ? subCategory : sc) : [...subCategories, subCategory];
        set({ budgetSubCategories: updatedSubCategories });
        saveLocalCache(LOCAL_BUDGET_SUB_CATEGORIES_CACHE_KEY, updatedSubCategories);
        await get().syncTable('budget_sub_categories', subCategory);
      },
      upsertBudgetAdjustment: async (adjustment) => {
        const adjustments = get().budgetAdjustments;
        const exists = adjustments.some(a => a.id === adjustment.id);
        const updatedAdjustments = exists ? adjustments.map(a => a.id === adjustment.id ? adjustment : a) : [...adjustments, adjustment];
        set({ budgetAdjustments: updatedAdjustments });
        saveLocalCache(LOCAL_BUDGET_ADJUSTMENTS_CACHE_KEY, updatedAdjustments);
        await get().syncTable('budget_adjustments', adjustment);
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
    })
);
