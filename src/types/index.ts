export type Role = 'admin_po' | 'sourcing' | 'gudang' | 'kurir' | 'finance' | 'ceo' | 'super_admin' | 'cmo';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string;
}

export type AccessKey = 
  // Admin & CEO
  | 'admin_dashboard' | 'admin_vendors' | 'admin_clients' | 'admin_products' 
  | 'admin_sales_orders' | 'admin_shopping_list' | 'admin_assets' | 'admin_hr' | 'admin_crm' 
  | 'admin_documents' | 'admin_okr' | 'admin_users' | 'admin_settings' | 'admin_tasks' | 'admin_maintenance'
  // Finance
  | 'finance_dashboard' | 'finance_approvals' | 'finance_reports' | 'finance_assets' 
  | 'finance_budget' | 'finance_cash_bank' | 'finance_ledger' | 'finance_invoices' 
  | 'finance_reconciliation' | 'finance_reimbursements' | 'finance_online_purchase' | 'finance_audit' | 'finance_documents'
  // Warehouse
  | 'warehouse_dashboard' | 'warehouse_catalog' | 'warehouse_inbound' | 'warehouse_outbound' | 'warehouse_qc' | 'warehouse_reject_monitor'
  // Sourcing
  | 'sourcing_dashboard' | 'sourcing_list' | 'sourcing_list_legacy' | 'sourcing_expenses'
  // Courier
  | 'courier_dashboard' | 'courier_list' | 'courier_handover' | 'courier_history' | 'courier_expenses'
  // Global
  | 'tasks_global' | 'settings_global';

export interface RolePermissionMap {
  [role: string]: AccessKey[];
}

export interface Client {
  id: string;
  companyName: string;
  picName: string;
  email: string;
  phone: string;
  address: string;
  paymentTermDays: number;
  createdAt: string;
}

export interface Vendor {
  id: string;
  companyName: string;
  picName: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
}

export interface Product {
  id: string;
  skuCode: string;
  name: string;
  uom: string; // Unit of Measure (e.g., pcs, kg)
  basePrice: number;
  sellingPrice: number;
  currentStock: number;
  priceHistory?: { date: string, price: number, source: string }[];
  weeklyPriceRange?: { min: number, max: number, lastUpdated: string };
}

export type StockMovementDirection = 'In' | 'Out' | 'Transfer' | 'Info';
export type StockMovementKind =
  | 'QC_RECEIPT'
  | 'QC_INVENTORY'
  | 'QC_CLIENT_ALLOCATION'
  | 'ONLINE_PURCHASE'
  | 'DELIVERY_OUTBOUND'
  | 'RETURN_RESTOCK'
  | 'RETURN_REJECT'
  | 'ADJUSTMENT'
  | 'INITIAL';

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName?: string;
  skuCode?: string;
  quantity: number;
  stockDelta: number;
  resultingStock: number;
  direction: StockMovementDirection;
  kind: StockMovementKind;
  source: string;
  destination?: string;
  referenceType?: 'Purchase' | 'Delivery' | 'Invoice' | 'Expense' | 'Adjustment' | 'Transfer' | 'QC';
  referenceId?: string;
  purchaseItemId?: string;
  salesOrderId?: string;
  note?: string;
  createdByUserId?: string;
}

export type SalesOrderStatus = 'Pending Approval' | 'Draft' | 'Belanja' | 'Sourcing' | 'QC' | 'Packing' | 'Siap Kirim' | 'Dikirim' | 'Awaiting Audit' | 'Terkirim' | 'Selesai' | 'Batal';

export interface SalesOrder {
  id: string;
  poNumber: string;
  clientId: string;
  orderDate: string;
  targetDeliveryDate: string;
  status: SalesOrderStatus;
  archivedSuratJalanUrl?: string; // Full PDF signed archived
  archivedBaUrl?: string;         // Full PDF signed archived
  proofOfDeliveryUrl?: string;    // Image/Photo proof (legacy/secondary)
  handoverDate?: string;
  handoverBy?: string; // User ID from Gudang
  receivedBy?: string; // User ID from Kurir
  courierSignature?: string; // Base64 signature image
  clientSignature?: string;  // Base64 signature image
}

export interface SalesOrderItem {
  id: string;
  salesOrderId: string;
  productId: string;
  qty: number;              // Original PO quantity
  qtyFinal?: number;        // Actual quantity after QC (may differ due to reject/shortage)
  unitPrice: number;
  subtotal: number;         // Original subtotal (qty * unitPrice)
  subtotalFinal?: number;   // Adjusted subtotal (qtyFinal * unitPrice)
  qtyAdjustmentReason?: string; // Why the qty changed (e.g. "QC Reject: busuk")
  isPacked?: boolean; // Done by Warehouse (Packing/QC)
  isHandoverChecked?: boolean; // Done by Courier (Checklist before delivery)
}

export type PurchaseStatus = 'Pending' | 'Belanja' | 'Selesai';
export type PurchaseMethod = 'Pasar' | 'Online';
export type ReconciliationStatus = 'Belum Transfer' | 'Dana Ditransfer' | 'Laporan Masuk' | 'Terverifikasi' | 'Dispute';

export interface Purchase {
  id: string;
  date: string;
  purchaserId: string;
  status: PurchaseStatus;
  // Budget & Reconciliation
  budgetAmount?: number;        // Total estimated budget by Finance
  budgetTransferDate?: string;  // When Finance transferred funds
  budgetTransferedBy?: string;  // Finance user ID
  budgetBankAccountId?: string; // Source bank account
  operationalSpareAmount?: number; // Extra money for fuel, parking, etc.
  actualSpent?: number;         // Actual total spent by Sourcer
  changeReturned?: number;      // Kembalian from Sourcer
  reconciliationNote?: string;  // Sourcer's explanation for discrepancy
  reconciliationStatus?: ReconciliationStatus;
  reconciliationProofUrl?: string; // Optional: Image/Photo proof of return
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string; // Linked to the master product
  salesOrderId?: string; // Optional: Link back to the SO that triggered this
  qtyTarget: number;
  qtyPurchased: number;
  estimatedUnitPrice: number;
  actualUnitPrice: number;
  notes?: string;
  receiptUrl?: string;
  isChecked: boolean;
  isQCed?: boolean;
  purchaseMethod?: PurchaseMethod;
  onlineRef?: string; // e.g. Shopee Order ID
  onlineOrderDate?: string;
  isOnlineOrdered?: boolean;
  isOnlineAudited?: boolean;
}

export type DeliveryStatus = 'Menunggu' | 'Dikirim' | 'Tunggu Konfirmasi' | 'Awaiting Audit' | 'Terkirim';

export interface Delivery {
  id: string;
  salesOrderId: string;
  courierId: string;
  status: DeliveryStatus;
  deliveryDate?: string;
  baUrl?: string;
  invoiceId?: string;
  notes?: string; // Additional documentation for the delivery
}

export type InvoiceStatus = 'Unpaid' | 'Partial' | 'Paid';

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  method?: string;
  note?: string;
}

export interface Invoice {
  id: string;
  salesOrderId?: string; // Kept for backward compatibility
  salesOrderIds?: string[]; // For consolidated Invoices (Tukar Faktur)
  isConsolidated?: boolean;
  consolidatedOrderNumbers?: string[];
  clientId: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  status: InvoiceStatus;
  payments?: PaymentRecord[];
  paidDate?: string;
}

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface ChartOfAccount {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
}

export interface FixedAsset {
  id: string;
  name: string;
  category: 'Kendaraan' | 'Peralatan' | 'Bangunan' | 'Elektronik';
  purchaseDate: string;
  purchasePrice: number;
  economicLifeMonths: number; // e.g. 48 months (4 years)
  salvageValue: number; // Nilai sisa diakhir umur ekonomis
  currentValue: number; // Nilai buku saat ini
  accumulatedDepreciation: number;
  status: 'Active' | 'Disposed';
}

export interface JournalEntry {
  id: string;
  transactionDate: string;
  description: string;
  referenceType?: 'Purchase' | 'Delivery' | 'Invoice' | 'Payment' | 'Expense' | 'Adjustment' | 'Depreciation' | 'Reimbursement' | 'Transfer';
  referenceId?: string;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debitAmount: number;
  creditAmount: number;
}

export type ExpenseStatus = 'Pending Audit' | 'Approved' | 'Rejected';

export interface OperationalExpense {
  id: string;
  date: string;
  reporterId: string;
  category: 'Bensin' | 'Tol' | 'Parkir' | 'Kuli' | 'Makan' | 'Lainnya' | 'Belanja Online' | 'Sourcing (HPP)' | 'Sales Revenue' | 'Setoran Pengembalian';
  amount: number;
  adminFee?: number;
  shippingFee?: number;
  description: string;
  receiptUrl?: string;
  status: ExpenseStatus;
  referenceId?: string;
  isJournaled?: boolean;
  notes?: string;
  auditDate?: string;
  auditNote?: string;
  targetBankAccountId?: string; // Bank tujuan setoran (diisi sourcing, bisa dikoreksi finance)
}

export type ReimbursementStatus = 'Pending' | 'Approved' | 'Paid' | 'Rejected';

export interface Reimbursement {
  id: string;
  date: string;
  userId: string;
  title: string;
  amount: number;
  description: string;
  receiptUrl?: string;
  status: ReimbursementStatus;
  auditDate?: string;
  auditNote?: string;
  paymentDate?: string;
  paymentReference?: string;
}

export interface BankAccount {
  id: string;
  name: string; // e.g., 'BCA - 1234567890', 'Petty Cash'
  accountNumber?: string;
  accountCode?: string; // Linked COA
  balance: number;
}

export interface CashTransaction {
  id: string;
  date: string;
  type: 'In' | 'Out';
  amount: number;
  bankAccountId: string;
  category: string;
  description: string;
  referenceType?: 'Invoice' | 'Purchase' | 'Expense' | 'Reimbursement' | 'Transfer' | 'Manual';
  referenceId?: string;
  counterpartName?: string; // e.g., 'Diterima dari: Vendor A'
  receiptUrl?: string;
}

export type LeadStatus = 'Lead' | 'Meeting' | 'Quotation' | 'Closed';

export interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  value: number;
  status: LeadStatus;
  notes?: string;
  createdAt: string;
}
export interface Announcement {
  message: string;
  active: boolean;
  timestamp: string;
}

export type TaskStatus = 'Todo' | 'In Progress' | 'Done' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface AppTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId: string;
  createdByOriginalId: string;
  dueDate: string;
  createdAt: string;
  progress?: number; // 0 - 100
  comments?: { userId: string, text: string, date: string }[];
  attachments?: { name: string, url: string, type: 'file' | 'link' }[];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'task' | 'system';
  link?: string;
  read: boolean;
  createdAt: string;
}

// --- NEW FEATURES: HR & KPI --- //

export interface Employee {
  id: string;
  userId?: string; // Optional link to app User
  fullName: string;
  position: string;
  department: string;
  baseSalary: number;
  kasbon: number; // Kasbon/Hutang
  joinDate: string;
  status: 'Active' | 'Resigned' | 'Probation';
}

export type SmartKpiGrade = 'A' | 'B' | 'C' | 'D' | 'E' | '-';

export interface SmartKpi {
  id: string;
  // WHO
  assigneeUserId: string; // Direct link to User.id (not Employee)
  assignedByUserId: string; // CEO/Super Admin/CMO who created this
  
  // SMART Framework
  specific: string; // What exactly should be achieved?
  measurable: string; // How is it measured? (metric description)
  achievable: string; // Why is this target realistic?
  relevant: string; // How does this link to company goals?
  timeBound: string; // Deadline or period

  // Evaluation
  period: string; // e.g. "Q1 2026", "Maret 2026"
  weight: number; // 0-100, total weights per user per period should sum to 100
  targetValue: number;
  actualValue: number;
  unit: string; // e.g. '%', 'Rp', 'deals', 'item'
  
  // Meta
  title: string; // Short name e.g. "Closing Rate"
  category: string; // e.g. "Sales", "Operasional", "Quality"
  status: 'Draft' | 'Active' | 'Under Review' | 'Evaluated';
  
  // Review (filled by evaluator)
  evaluatorNote?: string;
  evaluatedAt?: string;
  evaluatedBy?: string;
  manualGrade?: SmartKpiGrade; // If evaluator overrides the auto-grade
  
  createdAt: string;
  updatedAt?: string;
}

// Grade Calculation Helper
// A = 90-100% | B = 75-89% | C = 60-74% | D = 40-59% | E = <40%
export const getKpiGrade = (actual: number, target: number, manualGrade?: SmartKpiGrade): SmartKpiGrade => {
  if (manualGrade && manualGrade !== '-') return manualGrade;
  if (target <= 0) return '-';
  const pct = (actual / target) * 100;
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 40) return 'D';
  return 'E';
};

export const GRADE_META: Record<SmartKpiGrade, { label: string; color: string; bg: string; desc: string }> = {
  'A': { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300', desc: 'Outstanding performer – KPI terpenuhi dan melampaui ekspektasi.' },
  'B': { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300', desc: 'Konsisten mencapai target – sangat baik.' },
  'C': { label: 'Satisfactory', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300', desc: 'Target tercapai sebagian – perlu improvement.' },
  'D': { label: 'Needs Improvement', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300', desc: 'Pencapaian di bawah standar – perlu coaching serius.' },
  'E': { label: 'Unsatisfactory', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300', desc: 'Tidak mencapai target minimum – perlu evaluasi lanjutan.' },
  '-': { label: 'Not Evaluated', color: 'text-slate-500', bg: 'bg-slate-100 border-slate-300', desc: 'Belum dievaluasi.' },
};

// --- NEW FEATURES: OKR --- //

export interface OkrKeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  linkedKpiId?: string; // Optional cross-ref to a KPI
  linkedTaskId?: string; // Optional cross-ref to a Task
}

export interface OkrObjective {
  id: string;
  title: string;
  description: string;
  period: string;
  ownerId: string; // Typically a Role or specific user ID
  progress: number; // 0-100, auto-calculated from KRs
  keyResults: OkrKeyResult[];
}

export interface PendingReturn {
  id: string;
  productId: string;
  originalSoId: string;
  qty: number;
  reason: string;
  date: string;
  status: 'Pending QC' | 'Processed';
}

export interface RejectedItem {
  id: string;
  date: string;
  productId: string;
  qty: number;
  reason: string;
  source: 'QC' | 'Return' | 'Gudang';
  referenceId?: string;
  reportedBy: string;
  imageUrl?: string;
}
