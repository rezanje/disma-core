import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useAppStore } from './store';
import { createAccountingEntry, generateDocumentNumber, recordAdvanceReturn, recordBudgetTransfer, recordReconciliationSettlement, recordStockMovement, updateProductPriceHistory } from './accounting';
import type { BankAccount, Client, Delivery, Invoice, OperationalExpense, Product, Purchase, PurchaseItem, SalesOrder, SalesOrderItem } from '@/types';
import { PRODUCTS_SEED } from './products_seed';

const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'bank-1', name: 'BCA (Utama)', accountNumber: '8001234455', accountCode: '1-1200', balance: 0 },
  { id: 'bank-2', name: 'Mandiri (Ops)', accountNumber: '123000998877', accountCode: '1-1300', balance: 0 },
  { id: 'bank-3', name: 'BRI (Simpanan)', accountNumber: '001122334455', accountCode: '1-1000', balance: 0 },
  { id: 'bank-4', name: 'Petty Cash', accountCode: '1-1000', balance: 0 },
  { id: 'bank-advance-sourcing', name: 'Kas Sourcing (Hilman)', accountCode: '1-1500', balance: 0 },
  { id: 'bank-advance-courier', name: 'Kas Kurir (Rifai)', accountCode: '1-1510', balance: 0 },
];

const SIM_USERS = {
  sourcing: '22222222-2222-2222-2222-222222222222',
  warehouse: '33333333-3333-3333-3333-333333333333',
  courier: '44444444-4444-4444-4444-444444444444',
  finance: '55555555-5555-5555-5555-555555555555',
};

type AppStoreState = ReturnType<typeof useAppStore.getState>;

type ProductPlanItem = {
  product: Product;
  qty: number;
  buy: number;
  sell: number;
};

const buildDevSnapshot = (state: AppStoreState) => ({
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
});

const postReset = async (payload: Record<string, unknown>) => {
  const res = await fetch('/api/db/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body.error || 'Gagal reset database simulasi'));
  }
};

const getSimulationProducts = (products: Product[]) => {
  const preferred = products.filter((product) => product.basePrice > 0 && product.sellingPrice > product.basePrice);
  const pool = preferred.length >= 3 ? preferred : products;
  const chosen = pool.slice(0, 3);

  if (chosen.length < 2) {
    throw new Error('Produk belum cukup untuk simulasi multi-item.');
  }

  return chosen;
};

const ensureSimulationProducts = async () => {
  const store = useAppStore.getState();
  const existingIds = new Set(store.products.map((product) => product.id));

  if (store.products.length >= 2) {
    return store.products;
  }

  const fallbackProducts = PRODUCTS_SEED
    .filter((product) => product.basePrice > 0 && product.sellingPrice > product.basePrice)
    .slice(0, 3);

  const missingProducts = fallbackProducts.filter((product) => !existingIds.has(product.id));

  if (missingProducts.length > 0) {
    await useAppStore.getState().addProducts(missingProducts);
  }

  return useAppStore.getState().products;
};

const createProductPlan = (products: Product[], variantSeed: number): ProductPlanItem[] => {
  const templates = [
    [
      { qty: 30, buy: 6500, sell: 8500 },
      { qty: 12, buy: 27500, sell: 36000 },
      { qty: 8, buy: 43000, sell: 55000 },
    ],
    [
      { qty: 18, buy: 7200, sell: 9300 },
      { qty: 10, buy: 28900, sell: 37100 },
      { qty: 6, buy: 41800, sell: 56800 },
    ],
    [
      { qty: 24, buy: 6800, sell: 9000 },
      { qty: 14, buy: 26300, sell: 34900 },
      { qty: 5, buy: 45200, sell: 59000 },
    ],
  ];

  const template = templates[variantSeed % templates.length];
  return products.map((product, index) => ({
    product,
    qty: template[index]?.qty ?? 10,
    buy: template[index]?.buy ?? Math.max(5000, product.basePrice || 5000),
    sell: template[index]?.sell ?? Math.max(7500, product.sellingPrice || 7500),
  }));
};

const getInvoicesForSalesOrder = (state: AppStoreState, salesOrderId: string) => {
  return state.invoices.filter((invoice) => invoice.salesOrderId === salesOrderId || invoice.salesOrderIds?.includes(salesOrderId));
};

const isOutstandingSalesOrder = (state: AppStoreState, salesOrderId: string) => {
  const relatedInvoices = getInvoicesForSalesOrder(state, salesOrderId);
  const hasConsolidatedInvoice = relatedInvoices.some((invoice) => invoice.isConsolidated);
  const standaloneInvoices = relatedInvoices.filter((invoice) => !invoice.isConsolidated);
  const hasNoStandaloneInvoice = standaloneInvoices.length === 0;
  const hasUnpaidStandaloneInvoice = standaloneInvoices.some((invoice) => invoice.status !== 'Paid');

  return !hasConsolidatedInvoice && (hasNoStandaloneInvoice || hasUnpaidStandaloneInvoice);
};

const pickClientForScenario = (state: AppStoreState, appendToOutstanding: boolean) => {
  if (!appendToOutstanding) return state.clients[0];

  const clientOutstandingCounts = state.clients
    .map((client) => {
      const outstandingCount = state.salesOrders.filter((salesOrder) =>
        salesOrder.clientId === client.id &&
        ['Terkirim', 'Selesai'].includes(salesOrder.status) &&
        isOutstandingSalesOrder(state, salesOrder.id)
      ).length;

      return { client, outstandingCount };
    })
    .filter((entry) => entry.outstandingCount > 0)
    .sort((left, right) => right.outstandingCount - left.outstandingCount);

  return clientOutstandingCounts[0]?.client || state.clients[0];
};

const resetSimulationState = async (state: AppStoreState, previousHistory: AppStoreState['devHistoryStack']) => {
  const resetBanks = (state.bankAccounts.length > 0 ? state.bankAccounts : DEFAULT_BANK_ACCOUNTS).map((bank) => ({
    ...bank,
    balance: 0,
  }));

  await postReset({ action: 'simulation' });
  await postReset({
    action: 'seed',
    seedData: {
      bank_accounts: resetBanks,
    },
  });

  useAppStore.setState({
    salesOrders: [],
    salesOrderItems: [],
    purchases: [],
    purchaseItems: [],
    deliveries: [],
    expenses: [],
    invoices: [],
    journalEntries: [],
    journalLines: [],
    stockMovements: [],
    cashTransactions: [],
    pendingReturns: [],
    rejectedItems: [],
    reimbursements: [],
    bankAccounts: resetBanks,
    fixedAssets: [],
    devHistoryStack: previousHistory,
  });
};

const addSourcingExpenseAudit = async (expenseId: string, amount: number, description: string, date: string) => {
  await useAppStore.getState().updateExpense(expenseId, {
    status: 'Approved',
    auditDate: date,
    auditNote: 'Simulasi finance approve biaya sourcing.',
  });

  await createAccountingEntry(
    `Beban Sourcing: ${description}`,
    'Expense',
    expenseId,
    [{ accountCode: '6-1400', amount }],
    [{ accountCode: '1-1500', amount }],
    date
  );

  await useAppStore.getState().addCashTransaction({
    id: `exp-${expenseId}`,
    date,
    amount,
    type: 'Out',
    category: 'Bensin',
    description,
    bankAccountId: 'bank-advance-sourcing',
    referenceType: 'Expense',
    referenceId: expenseId,
  });
};

const createSingleScenario = async (client: Client, variantSeed: number, label: string) => {
  const products = getSimulationProducts(await ensureSimulationProducts());
  const productPlan = createProductPlan(products, variantSeed);

  const totalRevenue = productPlan.reduce((sum, item) => sum + item.qty * item.sell, 0);
  const totalShopCost = productPlan.reduce((sum, item) => sum + item.qty * item.buy, 0);
  const operationalCost = 50_000 + (variantSeed * 10_000);
  const shoppingBudget = Math.max(totalShopCost + 150_000, 1_200_000 + variantSeed * 100_000);
  const spareBudget = 150_000 + variantSeed * 25_000;
  const totalAdvance = shoppingBudget + spareBudget;
  const returnedCash = Math.max(25_000, totalAdvance - totalShopCost - operationalCost);

  const scenarioStart = new Date(Date.now() + variantSeed * 3_600_000);
  const atMinute = (minuteOffset: number) =>
    new Date(scenarioStart.getTime() + minuteOffset * 60_000).toISOString();

  const soId = uuidv4();
  const purchaseId = uuidv4();
  const deliveryId = uuidv4();
  const invoiceId = uuidv4();
  const opsExpenseId = uuidv4();
  const returnExpenseId = uuidv4();

  const salesOrder: SalesOrder = {
    id: soId,
    poNumber: generateDocumentNumber('PO'),
    clientId: client.id,
    orderDate: atMinute(0),
    targetDeliveryDate: atMinute(60 * 24),
    status: 'Draft',
  };
  await useAppStore.getState().addSalesOrder(salesOrder);

  const salesOrderItems: SalesOrderItem[] = productPlan.map((item) => ({
    id: uuidv4(),
    salesOrderId: soId,
    productId: item.product.id,
    qty: item.qty,
    qtyFinal: item.qty,
    unitPrice: item.sell,
    subtotal: item.qty * item.sell,
    subtotalFinal: item.qty * item.sell,
    isPacked: true,
    isHandoverChecked: true,
  }));
  await useAppStore.getState().addSalesOrderItems(salesOrderItems);
  await useAppStore.getState().updateSalesOrder(soId, { status: 'Belanja' });

  const purchase: Purchase = {
    id: purchaseId,
    date: atMinute(5),
    purchaserId: 'pending',
    status: 'Pending',
    reconciliationStatus: 'Belum Transfer',
  };
  await useAppStore.getState().addPurchase(purchase);

  const purchaseItems: PurchaseItem[] = productPlan.map((item) => ({
    id: uuidv4(),
    purchaseId,
    productId: item.product.id,
    salesOrderId: soId,
    qtyTarget: item.qty,
    qtyPurchased: item.qty,
    estimatedUnitPrice: item.buy,
    actualUnitPrice: item.buy,
    notes: `Auto-generated by ${label}`,
    isChecked: true,
    isQCed: false,
    purchaseMethod: 'Pasar',
  }));
  await useAppStore.getState().addPurchaseItems(purchaseItems);

  await recordBudgetTransfer(purchaseId, totalAdvance, 'bank-1', 'Hilman (Sourcing)');
  await useAppStore.getState().updatePurchase(purchaseId, {
    status: 'Belanja',
    purchaserId: SIM_USERS.sourcing,
    budgetAmount: shoppingBudget,
    operationalSpareAmount: spareBudget,
    budgetTransferDate: atMinute(15),
    budgetTransferedBy: SIM_USERS.finance,
    budgetBankAccountId: 'bank-1',
    reconciliationStatus: 'Dana Ditransfer',
  });

  const opsExpense: OperationalExpense = {
    id: opsExpenseId,
    date: atMinute(30),
    reporterId: SIM_USERS.sourcing,
    category: 'Bensin',
    amount: operationalCost,
    description: `Bensin mobil belanja sourcing (${label})`,
    status: 'Pending Audit',
  };
  await useAppStore.getState().addExpense(opsExpense);

  await useAppStore.getState().updatePurchase(purchaseId, {
    status: 'Selesai',
    purchaserId: SIM_USERS.sourcing,
    actualSpent: totalShopCost,
    changeReturned: returnedCash,
    reconciliationNote: `Simulasi ${label} selesai dan sesuai nota.`,
    reconciliationStatus: 'Laporan Masuk',
    reconciliationProofUrl: 'simulation://return-proof',
  });

  const returnExpense: OperationalExpense = {
    id: returnExpenseId,
    date: atMinute(40),
    reporterId: SIM_USERS.sourcing,
    category: 'Setoran Pengembalian',
    amount: returnedCash,
    description: `Setoran tunai sisa kas sourcing (${label})`,
    status: 'Pending Audit',
    targetBankAccountId: 'bank-1',
  };
  await useAppStore.getState().addExpense(returnExpense);

  await addSourcingExpenseAudit(opsExpenseId, operationalCost, opsExpense.description, atMinute(45));
  await useAppStore.getState().updateExpense(returnExpenseId, {
    status: 'Approved',
    auditDate: atMinute(46),
    auditNote: `Simulasi finance approve pengembalian kas (${label}).`,
  });
  await recordAdvanceReturn(returnedCash, SIM_USERS.sourcing, 'bank-1');
  await recordReconciliationSettlement(purchaseId, totalShopCost, 0, totalAdvance, 'bank-1');
  await useAppStore.getState().updatePurchase(purchaseId, {
    reconciliationStatus: 'Terverifikasi',
  });

  for (const item of purchaseItems) {
    const product = productPlan.find((candidate) => candidate.product.id === item.productId)?.product;
    if (!product) continue;

    await recordStockMovement({
      productId: product.id,
      quantity: item.qtyPurchased,
      stockDelta: 0,
      direction: 'Info',
      kind: 'QC_RECEIPT',
      source: 'Sourcing',
      destination: 'QC Inspection',
      referenceType: 'QC',
      referenceId: item.id,
      purchaseItemId: item.id,
      salesOrderId: soId,
      note: `Barang simulasi diterima dari sourcing untuk ${product.name}`,
      createdByUserId: SIM_USERS.warehouse,
      date: atMinute(60),
    });

    await recordStockMovement({
      productId: product.id,
      quantity: item.qtyPurchased,
      stockDelta: item.qtyPurchased,
      direction: 'In',
      kind: 'QC_INVENTORY',
      source: 'QC',
      destination: 'Inventory',
      referenceType: 'QC',
      referenceId: item.id,
      purchaseItemId: item.id,
      salesOrderId: soId,
      note: `Lolos QC dan masuk ke inventory (${label})`,
      createdByUserId: SIM_USERS.warehouse,
      date: atMinute(62),
    });

    await useAppStore.getState().updatePurchaseItem(item.id, { isQCed: true });
  }

  await useAppStore.getState().updateSalesOrder(soId, {
    status: 'Packing',
  });

  for (const item of productPlan) {
    updateProductPriceHistory(item.product.id, item.buy, `Simulasi ${label}`);
    await recordStockMovement({
      productId: item.product.id,
      quantity: item.qty,
      stockDelta: -item.qty,
      direction: 'Out',
      kind: 'DELIVERY_OUTBOUND',
      source: 'Inventory',
      destination: client.companyName,
      referenceType: 'Delivery',
      referenceId: deliveryId,
      salesOrderId: soId,
      note: `Barang simulasi keluar untuk PO ${salesOrder.poNumber}`,
      createdByUserId: SIM_USERS.warehouse,
      date: atMinute(90),
    });
  }

  await useAppStore.getState().updateSalesOrder(soId, {
    status: 'Siap Kirim',
    handoverDate: atMinute(85),
    handoverBy: SIM_USERS.warehouse,
  });

  const delivery: Delivery = {
    id: deliveryId,
    salesOrderId: soId,
    courierId: SIM_USERS.courier,
    status: 'Menunggu',
    deliveryDate: atMinute(120),
    invoiceId,
    notes: `Auto-generated by ${label}`,
  };
  await useAppStore.getState().addDelivery(delivery);
  await useAppStore.getState().updateSalesOrder(soId, {
    status: 'Dikirim',
    receivedBy: SIM_USERS.courier,
  });
  await useAppStore.getState().updateDelivery(deliveryId, {
    status: 'Dikirim',
    courierId: SIM_USERS.courier,
    deliveryDate: atMinute(120),
  });

  const dueDate = new Date(scenarioStart);
  dueDate.setDate(dueDate.getDate() + (client.paymentTermDays || 30));
  const invoice: Invoice = {
    id: invoiceId,
    salesOrderId: soId,
    clientId: client.id,
    issueDate: atMinute(121),
    dueDate: dueDate.toISOString(),
    totalAmount: totalRevenue,
    amountPaid: 0,
    status: 'Unpaid',
  };
  await useAppStore.getState().addInvoice(invoice);
  await createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: totalRevenue }],
    [{ accountCode: '4-1000', amount: totalRevenue }],
    atMinute(121)
  );

  await useAppStore.getState().updateDelivery(deliveryId, {
    status: 'Terkirim',
    invoiceId,
    notes: `Simulasi selesai: barang sudah diterima client (${label}).`,
  });
  await useAppStore.getState().updateSalesOrder(soId, { status: 'Terkirim' });

  return {
    clientName: client.companyName,
    poNumber: salesOrder.poNumber,
    invoiceId,
  };
};

const ensureCapitalReady = async (variantSeed: number) => {
  await createAccountingEntry(
    `Setoran Modal Simulasi Batch ${variantSeed + 1}`,
    'Transfer',
    `capital-batch-${variantSeed + 1}`,
    [{ accountCode: '1-1200', amount: 50_000_000 }],
    [{ accountCode: '3-1000', amount: 50_000_000 }],
    new Date(Date.now() + variantSeed * 1_000).toISOString()
  );

  await useAppStore.getState().addCashTransaction({
    id: uuidv4(),
    date: new Date(Date.now() + variantSeed * 1_000).toISOString(),
    amount: 50_000_000,
    type: 'In',
    category: 'Modal',
    description: `Setoran modal simulasi batch ${variantSeed + 1}`,
    bankAccountId: 'bank-1',
    referenceType: 'Manual',
    referenceId: `capital-batch-${variantSeed + 1}`,
  });
};

const finalizeHistory = (previousHistory: AppStoreState['devHistoryStack'], rollbackSnapshot: ReturnType<typeof buildDevSnapshot>) => {
  const latestState = useAppStore.getState();
  useAppStore.setState({
    devHistoryStack: [...previousHistory, rollbackSnapshot].slice(-10),
    currentUser: latestState.currentUser,
  });
};

export const runResetSimulationScenario = async () => {
  const state = useAppStore.getState();
  const previousHistory = [...state.devHistoryStack];
  const rollbackSnapshot = buildDevSnapshot(state);
  const toastId = 'simulation-reset-run';

  try {
    toast.loading('Reset data operasional lalu membangun batch simulasi baru...', { id: toastId });
    await resetSimulationState(state, previousHistory);
    await ensureCapitalReady(0);

    const freshState = useAppStore.getState();
    const client = pickClientForScenario(freshState, false);
    if (!client) throw new Error('Client master belum tersedia untuk simulasi.');

    const result = await createSingleScenario(client, 0, 'Reset Simulation');
    finalizeHistory(previousHistory, rollbackSnapshot);
    toast.success(`Simulasi baru selesai untuk ${result.clientName} • ${result.poNumber}`, { id: toastId });
  } catch (error) {
    console.error('Reset simulation failed:', error);
    toast.error(`Simulasi reset gagal: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
  }
};

export const runAppendOutstandingSimulation = async () => {
  const state = useAppStore.getState();
  const previousHistory = [...state.devHistoryStack];
  const rollbackSnapshot = buildDevSnapshot(state);
  const toastId = 'simulation-append-run';

  try {
    toast.loading('Menambahkan PO simulasi ke client yang masih outstanding...', { id: toastId });

    const currentState = useAppStore.getState();
    if (currentState.salesOrders.length === 0) {
      await ensureCapitalReady(0);
    }

    const appendState = useAppStore.getState();
    const client = pickClientForScenario(appendState, true);
    if (!client) throw new Error('Client master belum tersedia untuk simulasi.');

    const result = await createSingleScenario(client, appendState.salesOrders.length, 'Append Simulation');
    finalizeHistory(previousHistory, rollbackSnapshot);
    toast.success(`PO tambahan dibuat untuk ${result.clientName} • ${result.poNumber}`, { id: toastId });
  } catch (error) {
    console.error('Append simulation failed:', error);
    toast.error(`Tambah simulasi gagal: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: toastId });
  }
};
