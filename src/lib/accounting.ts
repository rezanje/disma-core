import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from './store';
import { JournalEntry, JournalLine, PurchaseItem, TaskStatus, TaskPriority, AppTask } from '@/types';
import { format } from 'date-fns';

/**
 * Double-Entry Bookkeeping Helper functions
 */

export const createAccountingEntry = (
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

  store.addJournalEntry(entry);

  // 3. Create Journal Lines (Debits)
  debits.forEach(d => {
    const coa = store.coas.find(c => c.accountCode === d.accountCode);
    if (!coa) {
      console.error(`COA not found for code: ${d.accountCode}`);
      return;
    }
    
    store.addJournalLine({
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

    store.addJournalLine({
      id: uuidv4(),
      journalEntryId: entryId,
      accountId: coa.id,
      debitAmount: 0,
      creditAmount: c.amount
    });
  });

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

// --- Specific Triggers ---

export const recordOnlinePurchase = (itemId: string, _totalAmount: number, productName: string, _adminFee: number = 0, _shippingFee: number = 0) => {
  const store = useAppStore.getState();
  const totalAmount = Number(_totalAmount || 0);
  const adminFee = Number(_adminFee || 0);
  const shippingFee = Number(_shippingFee || 0);
  
  const baseProductAmount = totalAmount - adminFee - shippingFee;

  // 1. Double Entry (Split)
  const debits = [
    { accountCode: '1-3000', amount: baseProductAmount }
  ];
  
  if (adminFee > 0) debits.push({ accountCode: '6-1600', amount: adminFee });
  if (shippingFee > 0) debits.push({ accountCode: '6-1700', amount: shippingFee });

  const success = createAccountingEntry(
    `Pembelian Online: ${productName} - Ref: ${itemId}`,
    'Purchase',
    itemId,
    debits,
    [{ accountCode: '1-1000', amount: totalAmount }]
  );

  // 2. Cash History
  if (success && totalAmount > 0) {
    store.addCashTransaction({
      id: uuidv4(),
      date: new Date().toISOString(),
      amount: totalAmount,
      type: 'Out',
      category: 'Sourcing (HPP)',
      description: `Belanja Online: ${productName} (Incl. Admin & Ongkir)`,
      bankAccountId: 'bank-1'
    });
  }

  // 3. Update Price History
  const product = store.products.find(p => p.name === productName || p.skuCode === productName);
  if (product) {
    updateProductPriceHistory(product.id, baseProductAmount, 'Online Purchase');
  }

  return success;
};

export const recordOperationalExpense = (
  expenseId: string, 
  amount: number, 
  description: string, 
  date?: string, 
  category?: string, 
  creditAccountCode: string = '1-1000',
  bankAccountId: string = 'bank-4'
) => {
  const store = useAppStore.getState();
  
  let expenseAccountCode = '6-9000';
  if (category === 'Bensin' || category === 'Tol' || category === 'Parkir') {
    expenseAccountCode = '6-1400';
  }
  
  const targetCoa = store.coas.find(c => c.accountCode === expenseAccountCode);
  if (!targetCoa) {
    const backupCoa = store.coas.find(c => c.accountCode.startsWith('6-'));
    if (backupCoa) expenseAccountCode = backupCoa.accountCode;
  }

  const success = createAccountingEntry(
    `Beban Ops: ${description}`,
    'Expense',
    expenseId,
    [{ accountCode: expenseAccountCode, amount: amount }],
    [{ accountCode: creditAccountCode, amount: amount }],
    date
  );

  if (success && amount > 0 && creditAccountCode !== '1-1500') {
    store.addCashTransaction({
      id: uuidv4(),
      date: date || new Date().toISOString(),
      amount: amount,
      type: 'Out',
      category: 'Operational',
      description: description,
      bankAccountId: bankAccountId
    });
  }
  return success;
};

export const recordDeliveryAndInvoice = (deliveryId: string, invoiceId: string, invoiceTotal: number, cogsTotal: number) => {
  const revSuccess = createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: invoiceTotal }],
    [{ accountCode: '4-1000', amount: invoiceTotal }]
  );

  const cogsSuccess = createAccountingEntry(
    `HPP Pengiriman - Ref: ${deliveryId}`,
    'Delivery',
    deliveryId,
    [{ accountCode: '5-1000', amount: cogsTotal }],
    [{ accountCode: '1-3000', amount: cogsTotal }]
  );

  return revSuccess && cogsSuccess;
};

export const recordReimbursementPayment = (reimbId: string, amount: number, description: string, bankAccountId: string, userName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankCode = bank?.accountCode || '1-1000';

  const success = createAccountingEntry(
    `Pembayaran Reimburse: ${description} (${userName})`,
    'Reimbursement',
    reimbId,
    [{ accountCode: '6-9000', amount: amount }],
    [{ accountCode: bankCode, amount: amount }]
  );

  if (success && amount > 0) {
    store.addCashTransaction({
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

export const recordBudgetTransfer = (purchaseId: string, amount: number, bankAccountId: string, recipientName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const sourceBankCode = bank?.accountCode || '1-1200';

  const success = createAccountingEntry(
    `Pencairan Budget Sourcing: ${recipientName} - Ref: ${purchaseId.slice(0,8)}`,
    'Transfer',
    purchaseId,
    [{ accountCode: '1-1500', amount: amount }],
    [{ accountCode: sourceBankCode, amount: amount }]
  );

  if (success && amount > 0) {
    const now = new Date().toISOString();
    store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'Out',
      category: 'Transfer Uang Muka Sourcing',
      description: `Pencairan Dana (Advance) ke ${recipientName} - Ref: ${purchaseId.slice(0,8)}`,
      bankAccountId: bankAccountId,
      counterpartName: recipientName
    });

    store.addCashTransaction({
      id: uuidv4(),
      date: now,
      amount: amount,
      type: 'In',
      category: 'Transfer Uang Muka Sourcing',
      description: `Penerimaan Dana (Advance) dari Kantor - Ref: ${purchaseId.slice(0,8)}`,
      bankAccountId: 'bank-advance-sourcing',
      counterpartName: bank?.name || 'Kas Pusat'
    });
  }
  return success;
};

export const recordReconciliationSettlement = (
  purchaseId: string, 
  actualShopCost: number, 
  actualOpsCost: number, 
  advanceAmount: number,
  bankAccountId: string
) => {
  const store = useAppStore.getState();
  const totalSpent = actualShopCost + actualOpsCost;
  const changeAmount = advanceAmount > totalSpent ? advanceAmount - totalSpent : 0;
  const overspendAmount = totalSpent > advanceAmount ? totalSpent - advanceAmount : 0;
  const now = new Date().toISOString();

  // 1. Settle Advance for Shop Cost (HPP)
  if (actualShopCost > 0) {
    const settledAmount = Math.min(actualShopCost, advanceAmount);
    createAccountingEntry(
      `Penyelesaian Belanja Sourcing - Ref: ${purchaseId.slice(0,8)}`,
      'Purchase',
      purchaseId,
      [{ accountCode: '1-3000', amount: actualShopCost }],
      [{ accountCode: '1-1500', amount: settledAmount }]
    );
    if (settledAmount > 0) {
      store.addCashTransaction({
        id: uuidv4(),
        date: now,
        amount: settledAmount,
        type: 'Out',
        category: 'Sourcing (HPP)',
        description: `Penyelesaian Belanja Sourcing (HPP) - Ref: ${purchaseId.slice(0,8)}`,
        bankAccountId: 'bank-advance-sourcing',
        referenceId: purchaseId
      });
    }
  }

  // 2. Settle Advance for Ops Cost (Journal Only - Cash already recorded during Audit)
  if (actualOpsCost > 0) {
    const settleFromAdvance = Math.min(actualOpsCost, Math.max(0, advanceAmount - actualShopCost));
    if (settleFromAdvance > 0) {
      createAccountingEntry(
        `Penyelesaian Ops Sourcing - Ref: ${purchaseId.slice(0,8)}`,
        'Expense',
        purchaseId,
        [{ accountCode: '6-1400', amount: settleFromAdvance }],
        [{ accountCode: '1-1500', amount: settleFromAdvance }]
      );
      // NOTE: We don't record a second CashTransaction here because Operational Expenses 
      // are already recorded as "Out" from 'bank-advance-sourcing' during the individual Audit approval stage.
    }
  }


  // 3. Handle Kembalian
  if (changeAmount > 0) {
    const success = createAccountingEntry(
      `Pengembalian Sisa Budget - Ref: ${purchaseId.slice(0,8)}`,
      'Transfer',
      purchaseId,
      [{ accountCode: '1-1200', amount: changeAmount }],
      [{ accountCode: '1-1500', amount: changeAmount }]
    );

    if (success) {
      store.addCashTransaction({
        id: uuidv4(),
        date: now,
        amount: changeAmount,
        type: 'In',
        category: 'Kembalian Dana Belanja',
        description: `Setoran Sisa Budget - Ref: ${purchaseId.slice(0,8)}`,
        bankAccountId: bankAccountId
      });

      store.addCashTransaction({
        id: uuidv4(),
        date: now,
        amount: changeAmount,
        type: 'Out',
        category: 'Kembalian Dana Belanja',
        description: `Pengembalian Sisa Budget ke Kantor - Ref: ${purchaseId.slice(0,8)}`,
        bankAccountId: 'bank-advance-sourcing'
      });
    }
  }

  // 4. Handle Nombok — handled by the caller (handleVerifyReconciliation) to avoid double-entry.

  // 5. Update Product Price History
  const shoppingItems = store.purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked);
  shoppingItems.forEach(item => {
    const prod = store.products.find(p => p.id === item.productId);
    if (prod && item.actualUnitPrice > 0) {
      updateProductPriceHistory(prod.id, item.actualUnitPrice, 'Pasar/Vendor');
    }
  });

  return true;
};

export const recordPaymentReceived = (invoiceId: string, amount: number, date: string) => {
  const store = useAppStore.getState();
  const success = createAccountingEntry(
    `Pembayaran Invoice - Ref: ${invoiceId}`,
    'Payment',
    invoiceId,
    [{ accountCode: '1-1000', amount: amount }],
    [{ accountCode: '1-2000', amount: amount }],
    date
  );

  if (success) {
    store.addCashTransaction({
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

export const recordShrinkage = (referenceId: string, amount: number, description: string) => {
  return createAccountingEntry(
    `Barang Reject: ${description}`,
    'Adjustment',
    referenceId,
    [{ accountCode: '5-2000', amount: amount }],
    [{ accountCode: '1-3000', amount: amount }]
  );
};

export const recordDepreciation = (assetId: string, amount: number, assetName: string) => {
  return createAccountingEntry(
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
