import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from './store';
import { JournalEntry, JournalLine, StockMovement } from '@/types';
import { format } from 'date-fns';

/**
 * Double-Entry Bookkeeping Helper functions
 */

export const HPP_ACCOUNT_CODE = '5-1000';
export const ADVANCE_WALLETS = {
  sourcing: {
    role: 'sourcing',
    bankAccountId: 'bank-advance-sourcing',
    accountCode: '1-1500',
    label: 'Kas Sourcing',
  },
  kurir: {
    role: 'kurir',
    bankAccountId: 'bank-advance-courier',
    accountCode: '1-1510',
    label: 'Kas Kurir',
  },
} as const;

export const USER_WALLETS: Record<string, { bankAccountId: string, accountCode: string, label: string }> = {
  '22222222-2222-2222-2222-222222222222': { bankAccountId: 'bank-advance-sourcing', accountCode: '1-1500', label: 'Kas Sourcing (Hilman)' },
  '33333333-3333-3333-3333-333333333333': { bankAccountId: 'bank-advance-sourcing-sandi', accountCode: '1-1500', label: 'Kas Sourcing (Sandi)' },
  '44444444-4444-4444-4444-444444444444': { bankAccountId: 'bank-advance-sourcing-rifai', accountCode: '1-1500', label: 'Kas Sourcing (Rifai)' },
};

const resolveExpenseAccountCode = (category?: string) => {
  if (category === 'Bensin' || category === 'Tol' || category === 'Parkir') {
    return '6-1400';
  }
  if (category === 'Belanja Online' || category === 'Sourcing (HPP)') {
    return HPP_ACCOUNT_CODE;
  }
  return '6-9000';
};

export const getAdvanceWalletByRole = (role?: string | null) => {
  if (!role) return null;
  if (role === 'sourcing') return ADVANCE_WALLETS.sourcing;
  if (role === 'kurir') return ADVANCE_WALLETS.kurir;
  return null;
};

export const getAdvanceWalletByUserId = (userId?: string | null) => {
  if (!userId) return null;
  
  // 1. Check user-specific overrides first (e.g. Sourcing PIC rotation)
  const userWallet = USER_WALLETS[userId];
  if (userWallet) return userWallet;

  // 2. Fall back to role-based wallet if no user override exists
  const store = useAppStore.getState();
  const user = store.users.find((candidate) => candidate.id === userId);
  return getAdvanceWalletByRole(user?.role);
};

export const createAccountingEntry = async (
  description: string,
  referenceType: JournalEntry['referenceType'],
  referenceId: string,
  debits: { accountCode: string; amount: number }[],
  credits: { accountCode: string; amount: number }[],
  date?: string
) => {
  const store = useAppStore.getState();
  
  // 1. Validate total debit = total credit
  const totalDebit = debits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalCredit = credits.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error(`Accounting Error: Debit (${totalDebit}) and Credit (${totalCredit}) do not balance!`);
    return false;
  }

  // 2. Create Journal Entry
  const entryId = uuidv4();
  const entry: JournalEntry = {
    id: entryId,
    transactionDate: date || new Date().toISOString(),
    description,
    referenceType,
    referenceId,
  };

  // MUST AWAIT entry before lines to avoid FK violation
  await store.addJournalEntry(entry);

  const lines: JournalLine[] = [];

  // 3. Create Journal Lines (Debits)
  debits.forEach(d => {
    const coa = store.coas.find(c => c.accountCode === d.accountCode);
    if (!coa) {
      console.error(`COA not found for code: ${d.accountCode}`);
      return;
    }
    
    lines.push({
      id: uuidv4(),
      journalEntryId: entryId,
      accountId: coa.id,
      debitAmount: d.amount,
      creditAmount: 0
    });
  });

  // 4. Create Journal Lines (Credits)
  credits.forEach(c => {
    const coa = store.coas.find(coa => coa.accountCode === c.accountCode);
    if (!coa) {
      console.error(`COA not found for code: ${c.accountCode}`);
      return;
    }

    lines.push({
      id: uuidv4(),
      journalEntryId: entryId,
      accountId: coa.id,
      debitAmount: 0,
      creditAmount: c.amount
    });
  });

  if (lines.length > 0) {
    await store.addJournalLines(lines);
  }

  return true;
};

/**
 * Update Product Price History and Weekly Range (Mon-Sun)
 */
export const updateProductPriceHistory = (productId: string, price: number, source: string) => {
  const store = useAppStore.getState();
  const product = store.products.find(p => p.id === productId);
  if (!product) return;

  const now = new Date();
  const dateStr = now.toISOString();
  
  // Weekly Window: Thursday to Wednesday
  // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const currentDay = now.getDay();
  // Find the most recent Thursday (Start of the period)
  const diffToLastThu = (currentDay >= 4) ? currentDay - 4 : currentDay + 3;
  
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - diffToLastThu);
  startOfWeek.setHours(0, 0, 0, 0);
  
  // End of period is Next Wednesday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const newHistory = [...(product.priceHistory || []), { date: dateStr, price, source }];
  
  // Filtering history for current week to calc min/max
  const currentWeekHistory = newHistory.filter(h => {
    const d = new Date(h.date);
    return d >= startOfWeek && d <= endOfWeek;
  });

  if (currentWeekHistory.length > 0) {
    const prices = currentWeekHistory.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    
    store.updateProduct(productId, {
      priceHistory: newHistory,
      weeklyPriceRange: { min, max, lastUpdated: dateStr }
    });
  } else {
    store.updateProduct(productId, {
      priceHistory: newHistory,
      weeklyPriceRange: { min: price, max: price, lastUpdated: dateStr }
    });
  }
};

export const recordStockMovement = async (
  movement: Omit<StockMovement, 'id' | 'date' | 'resultingStock'> & { date?: string }
) => {
  const store = useAppStore.getState();
  const product = store.products.find(p => p.id === movement.productId);
  if (!product) return false;

  const delta = Number(movement.stockDelta || 0);
  const currentStock = Number(product.currentStock || 0);
  const resultingStock = Math.max(0, currentStock + delta);

  await store.addStockMovement({
    id: uuidv4(),
    date: movement.date || new Date().toISOString(),
    productId: product.id,
    productName: product.name,
    skuCode: product.skuCode,
    quantity: Number(movement.quantity || Math.abs(delta)),
    stockDelta: delta,
    resultingStock,
    direction: movement.direction,
    kind: movement.kind,
    source: movement.source,
    destination: movement.destination,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    purchaseItemId: movement.purchaseItemId,
    salesOrderId: movement.salesOrderId,
    note: movement.note,
    createdByUserId: movement.createdByUserId,
  });

  if (delta !== 0) {
    await store.updateProduct(product.id, { currentStock: resultingStock });
  }

  return true;
};

// --- Specific Triggers ---

export const recordOnlinePurchase = async (
  itemId: string, 
  _totalAmount: number, 
  productName: string, 
  _adminFee: number = 0, 
  _shippingFee: number = 0,
  bankAccountId: string = 'bank-1'
) => {
  const store = useAppStore.getState();
  const totalAmount = Number(_totalAmount || 0);
  const adminFee = Number(_adminFee || 0);
  const shippingFee = Number(_shippingFee || 0);
  
  const baseProductAmount = totalAmount - adminFee - shippingFee;

  // 1. Double Entry (Split)
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankAccountCode = bank?.accountCode || '1-1000';

  const debits = [
    { accountCode: HPP_ACCOUNT_CODE, amount: baseProductAmount }
  ];
  
  if (adminFee > 0) debits.push({ accountCode: '6-1600', amount: adminFee });
  if (shippingFee > 0) debits.push({ accountCode: '6-1700', amount: shippingFee });

  const success = await createAccountingEntry(
    `Pembelian Online: ${productName} - Ref: ${itemId.slice(0,8)}`,
    'Purchase',
    itemId,
    debits,
    [{ accountCode: bankAccountCode, amount: totalAmount }]
  );

  // 2. Cash History
  if (success && totalAmount > 0) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: new Date().toISOString(),
      amount: totalAmount,
      type: 'Out',
      category: 'Sourcing (HPP)',
      description: `Belanja Online: ${productName} (Incl. Admin & Ongkir)`,
      bankAccountId: bankAccountId
    });
  }

  // 3. Update Inventory & Price History
  const product = store.products.find(p => p.name === productName || p.skuCode === productName || p.id === itemId);
  if (product) {
    const pItem = store.purchaseItems.find(pi => pi.id === itemId);
    const qtyReceived = pItem?.qtyTarget || pItem?.qtyPurchased || 1;

    await recordStockMovement({
      productId: product.id,
      quantity: qtyReceived,
      stockDelta: qtyReceived,
      direction: 'In',
      kind: 'ONLINE_PURCHASE',
      source: 'Online Purchase',
      destination: 'Inventory',
      referenceType: 'Purchase',
      referenceId: itemId,
      purchaseItemId: itemId,
      note: `Belanja online ${productName} masuk stok`,
    });

    updateProductPriceHistory(product.id, baseProductAmount / qtyReceived, 'Online Purchase');
  }

  return success;
};

export const recordOperationalExpense = async (
  expenseId: string, 
  amount: number, 
  description: string, 
  date?: string, 
  category?: string, 
  creditAccountCode: string = '1-1000',
  bankAccountId: string = 'bank-4'
) => {
  const store = useAppStore.getState();
  let expenseAccountCode = resolveExpenseAccountCode(category);
  
  const targetCoa = store.coas.find(c => c.accountCode === expenseAccountCode);
  if (!targetCoa) {
    const backupCoa = store.coas.find(c => c.accountCode.startsWith('6-'));
    if (backupCoa) expenseAccountCode = backupCoa.accountCode;
  }

  const success = await createAccountingEntry(
    `Beban Ops: ${description}`,
    'Expense',
    expenseId,
    [{ accountCode: expenseAccountCode, amount: amount }],
    [{ accountCode: creditAccountCode, amount: amount }],
    date
  );

  // Record Cash Transaction for both standard bank accounts AND the Sourcing Advance account
  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: date || new Date().toISOString(),
      amount: amount,
      type: 'Out',
      category: category || 'Operational',
      description: description,
      bankAccountId: bankAccountId
    });
  }
  return success;
};

export const recordAdvanceExpense = async (
  expenseId: string,
  reporterId: string,
  amount: number,
  description: string,
  date?: string,
  category?: string
) => {
  const store = useAppStore.getState();
  const wallet = getAdvanceWalletByUserId(reporterId);
  if (!wallet) {
    console.error(`Advance wallet not found for reporter ${reporterId}`);
    return false;
  }

  let expenseAccountCode = resolveExpenseAccountCode(category);
  const targetCoa = store.coas.find(c => c.accountCode === expenseAccountCode);
  if (!targetCoa) {
    const backupCoa = store.coas.find(c => c.accountCode.startsWith('6-'));
    if (backupCoa) expenseAccountCode = backupCoa.accountCode;
  }

  const success = await createAccountingEntry(
    `Beban ${wallet.label}: ${description}`,
    'Expense',
    expenseId,
    [{ accountCode: expenseAccountCode, amount }],
    [{ accountCode: wallet.accountCode, amount }],
    date
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: `exp-${expenseId}`,
      date: date || new Date().toISOString(),
      amount,
      type: 'Out',
      category: category || 'Operasional',
      description,
      bankAccountId: wallet.bankAccountId,
      referenceId: expenseId,
      referenceType: 'Expense',
    });
  }

  return success;
};

export const recordOperationalAdvanceTransfer = async (
  amount: number,
  sourceBankAccountId: string,
  targetBankAccountId: string,
  description: string,
  referenceId: string,
  sourceActorName: string,
  targetActorName: string,
  date?: string
) => {
  const store = useAppStore.getState();
  const sourceBank = store.bankAccounts.find(bank => bank.id === sourceBankAccountId);
  const targetBank = store.bankAccounts.find(bank => bank.id === targetBankAccountId);

  if (!sourceBank || !targetBank) {
    console.error('Operational advance transfer failed: source/target bank account not found.');
    return false;
  }

  const success = await createAccountingEntry(
    description,
    'Transfer',
    referenceId,
    [{ accountCode: targetBank.accountCode || '1-1000', amount }],
    [{ accountCode: sourceBank.accountCode || '1-1000', amount }],
    date
  );

  if (success && amount > 0) {
    const transactionDate = date || new Date().toISOString();
    await store.addCashTransaction({
      id: `ops-out-${referenceId}`,
      date: transactionDate,
      amount,
      type: 'Out',
      category: 'Distribusi Kas Operasional',
      description,
      bankAccountId: sourceBankAccountId,
      counterpartName: targetActorName,
      referenceType: 'Transfer',
      referenceId,
    });
    await store.addCashTransaction({
      id: `ops-in-${referenceId}`,
      date: transactionDate,
      amount,
      type: 'In',
      category: 'Distribusi Kas Operasional',
      description,
      bankAccountId: targetBankAccountId,
      counterpartName: sourceActorName,
      referenceType: 'Transfer',
      referenceId,
    });
  }

  return success;
};

export const recordDeliveryAndInvoice = async (deliveryId: string, invoiceId: string, invoiceTotal: number, cogsTotal: number, items: { productId: string, qty: number }[] = []) => {
  const store = useAppStore.getState();

  const revSuccess = await createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: invoiceTotal }],
    [{ accountCode: '4-1000', amount: invoiceTotal }]
  );

  const cogsSuccess = await createAccountingEntry(
    `HPP Pengiriman - Ref: ${deliveryId}`,
    'Delivery',
    deliveryId,
    [{ accountCode: '5-1000', amount: cogsTotal }],
    [{ accountCode: '1-3000', amount: cogsTotal }]
  );

  // Physical Inventory Sync (Deduction)
  if (cogsSuccess) {
    for (const item of items) {
      const product = store.products.find(p => p.id === item.productId);
      if (product) {
        await recordStockMovement({
          productId: product.id,
          quantity: item.qty,
          stockDelta: -item.qty,
          direction: 'Out',
          kind: 'DELIVERY_OUTBOUND',
          source: 'Inventory',
          destination: 'Client Delivery',
          referenceType: 'Delivery',
          referenceId: deliveryId,
          note: `Barang keluar untuk pengiriman ${deliveryId}`,
        });
      }
    }
  }

  return revSuccess && cogsSuccess;
};

export const recordReimbursementPayment = async (reimbId: string, amount: number, description: string, bankAccountId: string, userName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankCode = bank?.accountCode || '1-1000';

  const success = await createAccountingEntry(
    `Pembayaran Reimburse: ${description} (${userName})`,
    'Reimbursement',
    reimbId,
    [{ accountCode: '6-9000', amount: amount }],
    [{ accountCode: bankCode, amount: amount }]
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: new Date().toISOString(),
      amount: amount,
      type: 'Out',
      category: 'Reimbursement',
      description: `Reimburse: ${description} (${userName})`,
      bankAccountId: bankAccountId,
      referenceType: 'Reimbursement',
      referenceId: reimbId,
      counterpartName: userName
    });
  }
  return success;
};

export const recordBudgetTransfer = async (purchaseId: string, amount: number, bankAccountId: string, recipientName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const sourceBankCode = bank?.accountCode || '1-1200';

  const success = await createAccountingEntry(
    `Pencairan Budget Sourcing: ${recipientName} - Ref: ${purchaseId.slice(0,8)}`,
    'Transfer',
    purchaseId,
    [{ accountCode: '1-1500', amount: amount }],
    [{ accountCode: sourceBankCode, amount: amount }]
  );

  if (success && amount > 0) {
    const now = new Date().toISOString();
    // Resolve the dynamically correct wallet for this specific purchaser
    const purchaser = store.users.find(u => u.name === recipientName || u.id === recipientName);
    const wallet = getAdvanceWalletByUserId(purchaser?.id);
    const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';

    // Out dari bank perusahaan (BCA dll)
    await store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'Out',
      category: 'Transfer Uang Muka Sourcing',
      description: `Pencairan Dana (Advance) ke ${recipientName} - Ref: ${purchaseId.slice(0,8)}`,
      bankAccountId: bankAccountId,
      counterpartName: recipientName
    });
    // In ke Kas Sourcing pemegang dana
    await store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'In',
      category: 'Transfer Uang Muka Sourcing',
      description: `Penerimaan Dana (Advance) dari Kantor - Ref: ${purchaseId.slice(0,8)}`,
      bankAccountId: targetBankId,
      counterpartName: bank?.name || 'Kas Pusat'
    });
  }
  return success;
};

export const recordReconciliationSettlement = async (
  purchaseId: string, 
  actualShopCost: number, 
  actualOpsCost: number, 
  advanceAmount: number,
  _bankAccountId: string
) => {
  void _bankAccountId;
  const store = useAppStore.getState();
  const now = new Date().toISOString();
  const purchaseRef = purchaseId.slice(0,8);

  const hasExistingShopSettlement = store.cashTransactions.some(tx =>
    tx.referenceId === purchaseId &&
    tx.type === 'Out' &&
    tx.category === 'Sourcing (HPP)' &&
    tx.bankAccountId === 'bank-advance-sourcing'
  ) || store.journalEntries.some(entry =>
    entry.referenceId === purchaseId &&
    entry.referenceType === 'Purchase' &&
    (entry.description || '').includes(`Penyelesaian Belanja Sourcing - Ref: ${purchaseRef}`)
  );

  const hasExistingOpsSettlement = store.cashTransactions.some(tx =>
    tx.referenceId === purchaseId &&
    tx.type === 'Out' &&
    tx.category === 'Operasional' &&
    tx.bankAccountId === 'bank-advance-sourcing'
  ) || store.journalEntries.some(entry =>
    entry.referenceId === purchaseId &&
    entry.referenceType === 'Expense' &&
    (entry.description || '').includes(`Penyelesaian Ops Sourcing - Ref: ${purchaseRef}`)
  );

  // 1. Settle Advance for Shop Cost (HPP) — journal + CashTransaction Out dari Kas Sourcing
  if (actualShopCost > 0 && !hasExistingShopSettlement) {
    const settledAmount = Math.min(actualShopCost, advanceAmount);
    const purchase = store.purchases.find(p => p.id === purchaseId);
    const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
    const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';

    await createAccountingEntry(
      `Penyelesaian Belanja Sourcing - Ref: ${purchaseRef}`,
      'Purchase',
      purchaseId,
      // Belanja sourcing yang disetujui harus masuk ke HPP agar muncul di laba rugi.
      [{ accountCode: HPP_ACCOUNT_CODE, amount: actualShopCost }],
      [{ accountCode: '1-1500', amount: settledAmount }]
    );
    // Out dari Kas Sourcing — uang dipakai belanja (dicatat saat finance approve rekon)
    await store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: settledAmount,
      type: 'Out',
      category: 'Sourcing (HPP)',
      description: `Belanja Pasar disetujui - Ref: ${purchaseRef}`,
      bankAccountId: targetBankId,
      referenceId: purchaseId
    });
  }

  // 2. Settle Advance for Ops Cost (journal + CashTransaction Out)
  if (actualOpsCost > 0 && !hasExistingOpsSettlement) {
    const settleFromAdvance = Math.min(actualOpsCost, Math.max(0, advanceAmount - actualShopCost));
    if (settleFromAdvance > 0) {
      const purchase = store.purchases.find(p => p.id === purchaseId);
      const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
      const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';

      await createAccountingEntry(
        `Penyelesaian Ops Sourcing - Ref: ${purchaseRef}`,
        'Expense',
        purchaseId,
        [{ accountCode: '6-1400', amount: settleFromAdvance }],
        [{ accountCode: '1-1500', amount: settleFromAdvance }]
      );
      await store.addCashTransaction({
        id: uuidv4(),
        date: now,
        amount: settleFromAdvance,
        type: 'Out',
        category: 'Operasional',
        description: `Biaya Ops disetujui - Ref: ${purchaseRef}`,
        bankAccountId: targetBankId,
        referenceId: purchaseId
      });
    }
  }

  return true;
};

export const recordPaymentReceived = async (invoiceId: string, amount: number, date: string) => {
  const store = useAppStore.getState();
  const success = await createAccountingEntry(
    `Pembayaran Invoice - Ref: ${invoiceId}`,
    'Payment',
    invoiceId,
    [{ accountCode: '1-1000', amount: amount }],
    [{ accountCode: '1-2000', amount: amount }],
    date
  );

  if (success) {
    await store.addCashTransaction({
      id: uuidv4(),
      date: date,
      amount: amount,
      type: 'In',
      category: 'Sales',
      description: `Payment Invoice - Ref: ${invoiceId}`,
      bankAccountId: 'bank-1'
    });
  }
  return success;
};

export const recordShrinkage = async (referenceId: string, amount: number, description: string) => {
  return await createAccountingEntry(
    `Barang Reject: ${description}`,
    'Adjustment',
    referenceId,
    [{ accountCode: '5-2000', amount: amount }],
    [{ accountCode: '1-3000', amount: amount }]
  );
};

export const recordDepreciation = async (assetId: string, amount: number, assetName: string) => {
  return await createAccountingEntry(
    `Penyusutan Aset: ${assetName}`,
    'Depreciation',
    assetId,
    [{ accountCode: '6-2000', amount: amount }],
    [{ accountCode: '1-4999', amount: amount }]
  );
};

export const generateDocumentNumber = (prefix: string) => {
  const dateStr = format(new Date(), 'yyyyMMdd');
  const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${dateStr}-${randomStr}`;
};

export const recordAdvanceReturn = async (
  amount: number,
  reporterId: string,
  bankAccountId: string = 'bank-1', // Default to BCA
  _proofUrl?: string
) => {
  void _proofUrl;
  const store = useAppStore.getState();
  const now = new Date().toISOString();
  const sourceWallet = getAdvanceWalletByUserId(reporterId);
  const targetBank = store.bankAccounts.find(bank => bank.id === bankAccountId);

  if (!sourceWallet || !targetBank) {
    console.error(`Advance return failed. sourceWallet=${sourceWallet?.bankAccountId} targetBank=${bankAccountId}`);
    return false;
  }

  // 1. Journal Entry
  // Debit: Target Bank / wallet
  // Credit: Reporter advance wallet
  const success = await createAccountingEntry(
    `Pengembalian ${sourceWallet.label} - Reporter ID: ${reporterId.slice(0,8)}`,
    'Transfer',
    reporterId, // Use reporter as ref
    [{ accountCode: targetBank.accountCode || '1-1200', amount: amount }],
    [{ accountCode: sourceWallet.accountCode, amount: amount }]
  );

  if (success) {
    // 2. Out dari kas reporter — uang keluar dari pemegang advance
    await store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'Out',
      category: 'Pengembalian Kas',
      description: `Setor sisa kas dari ${sourceWallet.label}`,
      bankAccountId: sourceWallet.bankAccountId,
      counterpartName: targetBank.name
    });
    // 3. In ke bank / wallet tujuan
    await store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'In',
      category: 'Pengembalian Kas',
      description: `Setoran diterima dari ${sourceWallet.label}`,
      bankAccountId: bankAccountId,
      counterpartName: sourceWallet.label
    });
  }

  return success;
};
