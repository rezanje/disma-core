import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from './store';
import { JournalEntry, JournalLine, StockMovement, VendorBill } from '@/types';
import { format } from 'date-fns';
import { supabase } from './supabase';
import { dueDateFor } from './vendor-payable';

/**
 * Double-Entry Bookkeeping Helper functions
 */

type PostingLineInput = { accountCode: string; amount: number; vendorId?: string; vendorBillId?: string };
type PreparedPostingLine = PostingLineInput & { amount: number; accountId: string };
type JournalPostResponse = {
  entry?: JournalEntry;
  lines?: JournalLine[];
  error?: string;
};

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
  '22222222-2222-2222-2222-222222222222': { bankAccountId: 'bank-advance-sourcing', accountCode: '1-1500', label: 'KAS SOURCING (HILMAN)' },
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

const normalizePostingLine = (line: PostingLineInput, side: 'debit' | 'credit') => {
  const amount = Number(line.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`${side} amount for account ${line.accountCode} is not a finite number.`);
  }
  if (amount < 0) {
    throw new Error(`${side} amount for account ${line.accountCode} cannot be negative.`);
  }
  return { ...line, amount };
};

const cleanupJournalEntry = async (entryId: string, lineIds: string[] = []) => {
  const idsToDelete = lineIds.length > 0
    ? lineIds
    : useAppStore.getState().journalLines
      .filter((line) => line.journalEntryId === entryId)
      .map((line) => line.id);

  useAppStore.setState((state) => ({
    journalEntries: state.journalEntries.filter((entry) => entry.id !== entryId),
    journalLines: state.journalLines.filter((line) => line.journalEntryId !== entryId && !idsToDelete.includes(line.id)),
  }));

  try {
    if (idsToDelete.length > 0) {
      await fetch('/api/db', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'journal_lines', id: idsToDelete }),
      });
    }
    await fetch('/api/db', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'journal_entries', id: entryId }),
    });
  } catch (cleanupError) {
    console.error('[Accounting] Failed to cleanup partial journal entry:', cleanupError);
  }
};

const cleanupCashTransactions = async (transactionIds: string[]) => {
  for (const txId of transactionIds) {
    try {
      const existing = useAppStore.getState().cashTransactions.find((tx) => tx.id === txId);
      if (existing) {
        await useAppStore.getState().deleteCashTransaction(txId);
      } else {
        await fetch('/api/db', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'cash_transactions', id: txId }),
        });
      }
    } catch (cleanupError) {
      console.error(`[Accounting] Failed to cleanup cash transaction ${txId}:`, cleanupError);
    }
  }
};

const findPostedEntry = (referenceType: JournalEntry['referenceType'], referenceId: string, description: string) => {
  return useAppStore.getState().journalEntries.find((entry) =>
    entry.referenceType === referenceType &&
    entry.referenceId === referenceId &&
    entry.description === description
  );
};

export const createAccountingEntry = async (
  description: string,
  referenceType: JournalEntry['referenceType'],
  referenceId: string,
  debits: PostingLineInput[],
  credits: PostingLineInput[],
  date?: string
) => {
  const store = useAppStore.getState();
  let preparedDebits: PreparedPostingLine[] = [];
  let preparedCredits: PreparedPostingLine[] = [];

  try {
    preparedDebits = debits
      .map((line) => normalizePostingLine(line, 'debit'))
      .filter((line) => line.amount > 0)
      .map((line) => {
        const coa = store.coas.find((c) => c.accountCode === line.accountCode);
        if (!coa) throw new Error(`COA not found for debit account code: ${line.accountCode}`);
        return { ...line, accountId: coa.id };
      });

    preparedCredits = credits
      .map((line) => normalizePostingLine(line, 'credit'))
      .filter((line) => line.amount > 0)
      .map((line) => {
        const coa = store.coas.find((c) => c.accountCode === line.accountCode);
        if (!coa) throw new Error(`COA not found for credit account code: ${line.accountCode}`);
        return { ...line, accountId: coa.id };
      });
  } catch (err) {
    console.error('[Accounting] Invalid journal input, aborting:', err);
    return false;
  }
  
  // 1. Validate total debit = total credit
  const totalDebit = preparedDebits.reduce((sum, d) => sum + d.amount, 0);
  const totalCredit = preparedCredits.reduce((sum, c) => sum + c.amount, 0);
  
  if (preparedDebits.length === 0 || preparedCredits.length === 0 || totalDebit <= 0 || totalCredit <= 0) {
    console.error('[Accounting] Journal must have at least one positive debit and credit line.');
    return false;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error(`Accounting Error: Debit (${totalDebit}) and Credit (${totalCredit}) do not balance!`);
    return false;
  }

  // 2. Post atomically through server/RPC: entry + lines succeed together or fail together.
  const entryId = uuidv4();
  const postingDebits = preparedDebits.map((d: any) => ({
    id: uuidv4(),
    accountCode: d.accountCode,
    amount: d.amount,
    vendorId: d.vendorId,
    vendorBillId: d.vendorBillId,
  }));
  const postingCredits = preparedCredits.map((c: any) => ({
    id: uuidv4(),
    accountCode: c.accountCode,
    amount: c.amount,
    vendorId: c.vendorId,
    vendorBillId: c.vendorBillId,
  }));

  try {
    const response = await fetch('/api/accounting/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryId,
        description,
        referenceType,
        referenceId,
        date,
        debits: postingDebits,
        credits: postingCredits,
      }),
    });

    const payload = await response.json().catch(() => ({})) as JournalPostResponse;
    if (!response.ok) {
      console.error('[Accounting] Failed to post journal entry:', payload.error || response.statusText);
      return false;
    }

    if (!payload.entry || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      console.error('[Accounting] Journal API returned invalid payload:', payload);
      return false;
    }

    const entry = payload.entry;
    const lines = payload.lines.map((line) => ({
      ...line,
      debitAmount: Number(line.debitAmount || 0),
      creditAmount: Number(line.creditAmount || 0),
    }));

    useAppStore.setState((state) => ({
      // Stamp local-mutation time (this path bypasses syncTable) so an in-flight
      // init() discards a stale snapshot instead of flickering values back.
      _lastLocalMutationAt: Date.now(),
      journalEntries: state.journalEntries.some((candidate) => candidate.id === entry.id)
        ? state.journalEntries.map((candidate) => candidate.id === entry.id ? entry : candidate)
        : [...state.journalEntries, entry],
      journalLines: [
        ...state.journalLines.filter((line) => line.journalEntryId !== entry.id),
        ...lines,
      ],
    }));
  } catch (err) {
    console.error('[Accounting] Failed to post journal entry, aborting:', err);
    return false;
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
  const isB2C = (movement.warehouseId || 'main') === 'b2c';
  const currentStock = Number(isB2C ? (product.b2cStock || 0) : (product.currentStock || 0));
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
    warehouseId: movement.warehouseId || 'main',
    batchNumber: movement.batchNumber || null,
    expiryDate: movement.expiryDate || null,
    unitCost: Number(movement.unitCost || 0),
  });

  if (delta !== 0) {
    if (isB2C) {
      await store.updateProduct(product.id, { b2cStock: resultingStock });
    } else {
      await store.updateProduct(product.id, { currentStock: resultingStock });
    }
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
  
  // Prevent duplicate recording
  const existingItem = store.purchaseItems.find(pi => pi.id === itemId);
  if (existingItem?.isOnlineAudited) {
    console.warn(`Attempted to record already audited online purchase: ${itemId}`);
    return true; // Already done
  }

  const baseProductAmount = totalAmount - adminFee - shippingFee;

  // 1. Double Entry (Split) - Debit AP Accrual instead of HPP for inventory portion
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankAccountCode = bank?.accountCode || '1-1000';

  const debits = [
    { accountCode: '2-1100', amount: baseProductAmount }
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

  if (success) {
    // 2. Cash History
    if (totalAmount > 0) {
      await store.addCashTransaction({
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: totalAmount,
        type: 'Out',
        category: 'Belanja Online',
        description: `Belanja Online: ${productName} (Incl. Admin & Ongkir)`,
        bankAccountId: bankAccountId,
        referenceId: itemId,
        referenceType: 'Purchase'
      });
    }

    // 3. Mark as Audited in Purchase Items
    await store.updatePurchaseItem(itemId, { 
      isOnlineAudited: true,
      actualUnitPrice: baseProductAmount / (existingItem?.qtyTarget || 1)
    });

    // 4. Update Price History (Stock movement is now delayed until QC)
    const product = store.products.find(p => p.name === productName || p.skuCode === productName || p.id === itemId || p.id === existingItem?.productId);
    if (product) {
      const qtyReceived = existingItem?.qtyTarget || 1;
      updateProductPriceHistory(product.id, baseProductAmount / qtyReceived, 'Online Purchase');
    }
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

export const recordDeliveryAndInvoice = async (
  deliveryId: string, 
  invoiceId: string, 
  invoiceTotal: number, 
  cogsTotal: number, 
  items: { productId: string, qty: number }[] = [],
  isFastTrack: boolean = false
) => {
  const store = useAppStore.getState();

  // 1. Guard against duplicate execution
  const hasExistingInvoiceEntry = store.journalEntries.some(
    entry => entry.referenceId === invoiceId && entry.referenceType === 'Invoice'
  );
  
  if (hasExistingInvoiceEntry) {
    console.warn(`[Accounting] Invoice ${invoiceId} already recorded. Skipping.`);
    return true;
  }

  // Find if client is B2C to determine warehouse and COA
  const invoice = store.invoices.find(inv => inv.id === invoiceId);
  const client = invoice ? store.clients.find(c => c.id === invoice.clientId) : null;
  const isB2C = client?.companyName?.toLowerCase().includes('b2c') || false;
  const warehouseId = isB2C ? 'b2c' : 'main';
  const inventoryAccount = isB2C ? '1-3100' : '1-3000';

  // 2. Record Revenue (Invoice Terbit)
  const revSuccess = await createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: invoiceTotal }],
    [{ accountCode: '4-1000', amount: invoiceTotal }]
  );

  if (!revSuccess) return false;

  // 3. Record COGS / HPP Journal
  // Debit: HPP 5-1000
  // Credit: Persediaan 1-3000 or 1-3100
  if (cogsTotal > 0) {
    await createAccountingEntry(
      `Pengakuan HPP Delivery - Ref: ${deliveryId}`,
      'Delivery',
      deliveryId,
      [{ accountCode: '5-1000', amount: cogsTotal }],
      [{ accountCode: inventoryAccount, amount: cogsTotal }]
    );
  }

  // 4. Physical Inventory Sync (Deduction)
  for (const item of items) {
    const product = store.products.find(p => p.id === item.productId);
    if (product) {
      // Find unit cost for this item to log in stock_movements
      let pItem = store.purchaseItems.find(pi => pi.salesOrderId === invoice?.salesOrderId && pi.productId === item.productId && pi.actualUnitPrice > 0);
      if (!pItem) {
        pItem = store.purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop();
      }
      const unitCost = pItem ? pItem.actualUnitPrice : (product.basePrice || 0);

      await recordStockMovement({
        productId: product.id,
        quantity: item.qty,
        stockDelta: -item.qty,
        direction: 'Out',
        kind: 'DELIVERY_OUTBOUND',
        source: isB2C ? 'B2C Warehouse' : 'Inventory',
        destination: 'Client Delivery',
        referenceType: 'Delivery',
        referenceId: deliveryId,
        note: `Barang keluar untuk pengiriman ${deliveryId} (${isB2C ? 'B2C' : 'Main'})`,
        warehouseId: warehouseId,
        unitCost: unitCost
      });
    }
  }

  return true;
};

export const recordManualReceivable = async (invoiceId: string, amount: number, date: string) => {
  const store = useAppStore.getState();

  const hasExistingInvoiceEntry = store.journalEntries.some(
    entry => entry.referenceId === invoiceId && entry.referenceType === 'Invoice'
  );

  if (hasExistingInvoiceEntry) {
    console.warn(`[Accounting] Manual receivable ${invoiceId} already recorded. Skipping.`);
    return true;
  }

  return await createAccountingEntry(
    `Input Piutang Manual - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount }],
    [{ accountCode: '4-1000', amount }],
    date
  );
};

export const recordReimbursementPayment = async (reimbId: string, amount: number, description: string, bankAccountId: string, userName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankCode = bank?.accountCode || '1-1000';

  // Pilih akun debit berdasarkan kind reimburse (eksplisit, bukan parse string).
  // - Sourcing-Defisit: HPP/Ops sudah dijurnal saat settlement; payment-nya potong Utang Talangan Karyawan (2-1500).
  // - Auto-Talangan: bagian ops yg gak ketutup wallet saat input; samain ke Beban Ops Pasar (6-1400).
  // - Manual / undefined (legacy): masuk Beban Operasional Lainnya (6-9000).
  const reimb = store.reimbursements.find(r => r.id === reimbId);
  const kindLower = (description || '').toLowerCase();
  const isLegacyDefisitSourcing = !reimb?.kind && (kindLower.includes('talangan sourcing') || kindLower.includes('defisit sourcing'));
  const isLegacyAutoTalangan = !reimb?.kind && kindLower.includes('auto-talangan');

  let debitAccountCode: string;
  if (reimb?.kind === 'Sourcing-Defisit' || isLegacyDefisitSourcing) {
    debitAccountCode = '2-1500';
  } else if (reimb?.kind === 'Auto-Talangan' || isLegacyAutoTalangan) {
    debitAccountCode = '6-1400';
  } else {
    debitAccountCode = '6-9000';
  }

  const success = await createAccountingEntry(
    `Pembayaran Reimburse: ${description} (${userName})`,
    'Reimbursement',
    reimbId,
    [{ accountCode: debitAccountCode, amount: amount }],
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

export const recordBudgetTransfer = async (purchaseId: string, amount: number, bankAccountId: string, recipientName: string, destBankAccountId?: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const sourceBankCode = bank?.accountCode || '1-1200';

  let targetBankId: string;
  let targetAccountCode: string;
  let targetName: string;
  if (destBankAccountId) {
    const destBank = store.bankAccounts.find(b => b.id === destBankAccountId);
    targetBankId = destBankAccountId;
    targetAccountCode = destBank?.accountCode || '1-1500';
    targetName = destBank?.name || recipientName;
  } else {
    const purchaser = store.users.find(u => u.name === recipientName || u.id === recipientName);
    const wallet = getAdvanceWalletByUserId(purchaser?.id);
    targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
    targetAccountCode = wallet?.accountCode || '1-1500';
    targetName = wallet?.label || 'Kas Sourcing';
  }

  if (bankAccountId === targetBankId) {
    throw new Error(`Source bank tidak boleh sama dengan rekening tujuan (${bankAccountId}).`);
  }

  const success = await createAccountingEntry(
    `Pencairan Budget Sourcing: ${recipientName} - Ref: ${purchaseId.slice(0, 8)}`,
    'Transfer',
    purchaseId,
    [{ accountCode: targetAccountCode, amount }],
    [{ accountCode: sourceBankCode, amount }]
  );

  if (success && amount > 0) {
    const now = new Date().toISOString();
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'Out',
      category: 'Transfer Uang Muka Sourcing',
      description: `Pencairan Dana ke ${recipientName} - Ref: ${purchaseId.slice(0, 8)}`,
      bankAccountId, counterpartName: targetName,
    });
    await store.addCashTransaction({
      id: uuidv4(), date: now, amount, type: 'In',
      category: 'Transfer Uang Muka Sourcing',
      description: `Penerimaan Dana - Ref: ${purchaseId.slice(0, 8)}`,
      bankAccountId: targetBankId, counterpartName: bank?.name || 'Kas Pusat',
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
  const purchase = store.purchases.find(p => p.id === purchaseId);
  let targetBankId: string;
  let advanceAccountCode: string;
  if (purchase?.budgetDestBankAccountId) {
    const destBank = store.bankAccounts.find(b => b.id === purchase.budgetDestBankAccountId);
    targetBankId = purchase.budgetDestBankAccountId;
    advanceAccountCode = destBank?.accountCode || '1-1500';
  } else {
    const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
    targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
    advanceAccountCode = wallet?.accountCode || '1-1500';
  }

  const hasExistingShopSettlement = store.cashTransactions.some(tx =>
    tx.referenceId === purchaseId &&
    tx.type === 'Out' &&
    tx.category === 'Sourcing (HPP)' &&
    tx.bankAccountId === targetBankId
  ) || store.journalEntries.some(entry =>
    entry.referenceId === purchaseId &&
    entry.referenceType === 'Purchase' &&
    (entry.description || '').includes(`Penyelesaian Belanja Sourcing - Ref: ${purchaseRef}`)
  );

  const hasExistingOpsSettlement = store.cashTransactions.some(tx =>
    tx.referenceId === purchaseId &&
    tx.type === 'Out' &&
    tx.category === 'Operasional' &&
    tx.bankAccountId === targetBankId
  ) || store.journalEntries.some(entry =>
    entry.referenceId === purchaseId &&
    entry.referenceType === 'Expense' &&
    (entry.description || '').includes(`Penyelesaian Ops Sourcing - Ref: ${purchaseRef}`)
  );

  let totalTempo = 0;
  let totalCash = actualShopCost;
  const tempoTotals = new Map<string, number>();
  const vendorBillsToSave: VendorBill[] = [];
  const journalCredits: (PostingLineInput & { vendorId?: string; vendorBillId?: string })[] = [];

  const pItems = store.purchaseItems.filter(
    pi => pi.purchaseId === purchaseId && pi.isChecked && pi.purchaseMethod === 'Pasar'
  );

  if (actualShopCost > 0 && pItems.length > 0) {
    // Validate all checked items have vendorId (with dynamic healing fallback)
    const fallbackVendorId = store.vendors[0]?.id || 'v1';
    for (const item of pItems) {
      if (!item.vendorId) {
        console.warn(`[Accounting] Item ${item.id} (produk ${item.productId}) is missing vendorId. Healing with fallback vendor ${fallbackVendorId}.`);
        item.vendorId = fallbackVendorId;
        await store.updatePurchaseItem(item.id, { vendorId: fallbackVendorId });
      }
    }

    // Group and calculate tempo/cash totals
    const vendorMap = new Map(store.vendors.map(v => [v.id, v]));
    totalCash = 0;

    for (const item of pItems) {
      const vId = item.vendorId!;
      const vendor = vendorMap.get(vId);
      const isTempo = item.paymentMethod 
        ? (item.paymentMethod === 'Tempo')
        : (vendor ? (vendor.isTempo !== false) : true);
      const cost = (item.actualUnitPrice || 0) * (item.qtyPurchased || 0);

      if (isTempo) {
        totalTempo += cost;
        tempoTotals.set(vId, (tempoTotals.get(vId) || 0) + cost);
      } else {
        totalCash += cost;
      }
    }
  }

  // 1. Settle Advance for Shop Cost (HPP) — journal + CashTransaction Out dari Kas Sourcing
  if (actualShopCost > 0 && !hasExistingShopSettlement) {
    const todayStr = now.slice(0, 10);
    
    // Create Vendor Bills for tempo portions
    for (const [vendorId, totalAmount] of tempoTotals.entries()) {
      if (totalAmount <= 0) continue;
      const vendor = store.vendors.find(v => v.id === vendorId);
      const vendorName = vendor ? vendor.companyName : 'Vendor Unknown';
      const termDays = vendor?.paymentTermDays ?? 14;
      
      let billNumber = '';
      try {
        const { data, error } = await supabase.rpc('generate_vendor_bill_number', {
          p_vendor_id: vendorId,
          p_bill_date: todayStr
        });
        if (error) throw error;
        billNumber = data;
      } catch (rpcErr) {
        console.warn('[Accounting] generate_vendor_bill_number RPC failed, generating fallback:', rpcErr);
        const randomSuffix = Math.floor(10 + Math.random() * 90);
        billNumber = `VB-${todayStr.replace(/-/g, '').slice(0, 6)}-${vendorId.slice(0, 6).toUpperCase()}-${randomSuffix}`;
      }

      const billId = uuidv4();
      const dueDate = dueDateFor(todayStr, termDays);

      const bill: VendorBill = {
        id: billId,
        billNumber,
        vendorId,
        vendorName,
        issueDate: now,
        dueDate,
        description: `Belanja Sourcing - Ref: ${purchaseRef}`,
        category: 'Bahan Baku',
        totalAmount,
        amountPaid: 0,
        status: 'Pending',
        payments: [],
        purchaseId,
        createdAt: now,
        createdBy: purchase?.purchaserId
      };
      vendorBillsToSave.push(bill);

      // Cr 2-1000 Utang Vendor
      journalCredits.push({
        accountCode: '2-1000',
        amount: totalAmount,
        vendorId,
        vendorBillId: billId
      });
    }

    // Settle Advance for Cash portion
    const settledAmount = Math.min(totalCash, Math.max(0, advanceAmount));
    const defisitShop = totalCash > settledAmount ? totalCash - settledAmount : 0;

    if (settledAmount > 0) {
      journalCredits.push({ accountCode: advanceAccountCode, amount: settledAmount });
    }
    if (defisitShop > 0) {
      journalCredits.push({ accountCode: '2-1500', amount: defisitShop });
    }

    // Save vendor bills to store first, so they exist in the database and avoid foreign key constraint violation
    for (const bill of vendorBillsToSave) {
      await store.addVendorBill(bill);
    }

    const shopDescription = `Penyelesaian Belanja Sourcing - Ref: ${purchaseRef}`;
    const shopJournalSuccess = await createAccountingEntry(
      shopDescription,
      'Purchase',
      purchaseId,
      [{ accountCode: '2-1100', amount: actualShopCost }], // Dr 2-1100 AP Accrual
      journalCredits
    );

    if (!shopJournalSuccess) {
      // Rollback saved vendor bills if journal entry failed
      for (const bill of vendorBillsToSave) {
        await store.deleteVendorBill(bill.id);
      }
      return false;
    }

    const postedShopEntry = findPostedEntry('Purchase', purchaseId, shopDescription);
    const createdCashIds: string[] = [];

    try {
      if (totalCash > 0) {
        const txId = uuidv4();
        await store.addCashTransaction({
          id: txId,
          date: now,
          amount: totalCash,
          type: 'Out',
          category: 'Sourcing (HPP)',
          description: `Belanja Pasar disetujui (Cash portion) - Ref: ${purchaseRef}`,
          bankAccountId: targetBankId,
          referenceId: purchaseId
        });
        createdCashIds.push(txId);
      }
    } catch (err) {
      console.error('[Accounting] Failed to persist shop settlement cash transaction, rolling back journal:', err);
      await cleanupCashTransactions(createdCashIds);
      if (postedShopEntry) await cleanupJournalEntry(postedShopEntry.id);
      for (const bill of vendorBillsToSave) {
        await store.deleteVendorBill(bill.id);
      }
      return false;
    }
  }

  // 2. Settle Advance for Ops Cost (journal + CashTransaction Out)
  if (actualOpsCost > 0 && !hasExistingOpsSettlement) {
    const settleFromAdvance = Math.min(actualOpsCost, Math.max(0, advanceAmount - totalCash));
    const defisitOps = actualOpsCost - settleFromAdvance;
    const opsCredits: PostingLineInput[] = [];

    if (settleFromAdvance > 0) {
      opsCredits.push({ accountCode: advanceAccountCode, amount: settleFromAdvance });
    }
    if (defisitOps > 0) {
      opsCredits.push({ accountCode: '2-1500', amount: defisitOps });
    }

    const opsDescription = `Penyelesaian Ops Sourcing - Ref: ${purchaseRef}`;
    const opsJournalSuccess = await createAccountingEntry(
      opsDescription,
      'Expense',
      purchaseId,
      [{ accountCode: '6-1400', amount: actualOpsCost }],
      opsCredits
    );

    if (!opsJournalSuccess) {
      return false;
    }

    if (actualOpsCost > 0) {
      const postedOpsEntry = findPostedEntry('Expense', purchaseId, opsDescription);
      const txId = uuidv4();
      try {
        await store.addCashTransaction({
          id: txId,
          date: now,
          amount: actualOpsCost,
          type: 'Out',
          category: 'Operasional',
          description: `Biaya Ops disetujui - Ref: ${purchaseRef}`,
          bankAccountId: targetBankId,
          referenceId: purchaseId
        });
      } catch (err) {
        console.error('[Accounting] Failed to persist ops settlement cash transaction, rolling back journal:', err);
        if (postedOpsEntry) await cleanupJournalEntry(postedOpsEntry.id);
        return false;
      }
    }
  }

  // 3. Auto-create Reimbursement row utk defisit (HPP + Ops) supaya finance bisa bayar via UI.
  const defisitShop = totalCash > 0 ? Math.max(0, totalCash - Math.max(0, advanceAmount)) : 0;
  const defisitOps = actualOpsCost > 0 ? Math.max(0, actualOpsCost - Math.max(0, advanceAmount - totalCash)) : 0;
  const totalDefisit = defisitShop + defisitOps;

  if (totalDefisit > 0 && purchase?.purchaserId) {
    const alreadyHasDefisitReimb = store.reimbursements.some(r => {
      if (r.purchaseId !== purchaseId) return false;
      if (r.kind === 'Sourcing-Defisit') return true;
      const t = (r.title || '').toLowerCase();
      return t.includes('defisit sourcing') || t.includes('talangan sourcing');
    });
    if (!alreadyHasDefisitReimb) {
      await store.addReimbursement({
        id: uuidv4(),
        date: now,
        userId: purchase.purchaserId,
        purchaseId,
        title: `Talangan Defisit Sourcing - Ref: ${purchaseRef}`,
        amount: totalDefisit,
        description: `Defisit HPP ${defisitShop} + Ops ${defisitOps}. Utang sudah dijurnal (2-1000), tunggu pencairan kas ke sourcer.`,
        status: 'Pending',
        kind: 'Sourcing-Defisit',
      });
    }
  }

  return true;
};

export const recordPaymentReceived = async (invoiceId: string, amount: number, date: string, bankAccountId: string = 'bank-1') => {
  const store = useAppStore.getState();
  const bankAccount = store.bankAccounts.find(b => b.id === bankAccountId);
  const accountCode = bankAccount?.accountCode || '1-1000'; // Default if not found

  const success = await createAccountingEntry(
    `Pembayaran Invoice - Ref: ${invoiceId}`,
    'Payment',
    invoiceId,
    [{ accountCode: accountCode, amount: amount }], // Debit Bank/Kas
    [{ accountCode: '1-2000', amount: amount }], // Credit Piutang Usaha
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
      bankAccountId: bankAccountId
    });
  }
  return success;
};

export const recordShrinkage = async (
  referenceId: string, 
  amount: number, 
  description: string,
  creditAccountCode: string = '1-3000'
) => {
  return await createAccountingEntry(
    `Barang Reject: ${description}`,
    'Adjustment',
    referenceId,
    [{ accountCode: '5-2000', amount: amount }], // Debit Beban Kerusakan
    [{ accountCode: creditAccountCode, amount: amount }] // Credit Persediaan (1-3000 or 1-3100)
  );
};

export const recordInboundQC = async (
  purchaseItemId: string,
  productId: string,
  qtyPassed: number,
  qtyRejected: number,
  rejectAction: 'Return' | 'Disposal' | 'B2C' | undefined,
  unitCost: number,
  warehouseId: string, // 'main' or 'b2c'
  batchNumber?: string,
  expiryDate?: string,
  verifiedBy?: string
) => {
  const store = useAppStore.getState();
  const product = store.products.find(p => p.id === productId);
  if (!product) return false;

  const totalIncoming = qtyPassed + qtyRejected;
  const totalValue = totalIncoming * unitCost;

  const inventoryAccount = warehouseId === 'b2c' ? '1-3100' : '1-3000';

  // 1. Jurnal penerimaan fisik barang ke persediaan sementara (totalIncoming)
  // Debit: Persediaan 1-3000 atau 1-3100
  // Kredit: AP Accrual 2-1100
  const recSuccess = await createAccountingEntry(
    `QC Terima Barang - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
    'QC',
    purchaseItemId,
    [{ accountCode: inventoryAccount, amount: totalValue }],
    [{ accountCode: '2-1100', amount: totalValue }]
  );

  if (!recSuccess) return false;

  // 2. Jurnal penanganan reject jika ada
  if (qtyRejected > 0 && rejectAction) {
    const rejectValue = qtyRejected * unitCost;
    if (rejectAction === 'Return') {
      // Return: reverse receipt by debiting AP Accrual 2-1100 and crediting Persediaan
      await createAccountingEntry(
        `QC Reject Retur Supplier - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
        'QC',
        purchaseItemId,
        [{ accountCode: '2-1100', amount: rejectValue }],
        [{ accountCode: inventoryAccount, amount: rejectValue }]
      );
    } else if (rejectAction === 'Disposal') {
      // Disposal: write-off by debiting Beban Kerusakan 5-2000 and crediting Persediaan
      await createAccountingEntry(
        `QC Reject Disposal - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
        'QC',
        purchaseItemId,
        [{ accountCode: '5-2000', amount: rejectValue }],
        [{ accountCode: inventoryAccount, amount: rejectValue }]
      );
    } else if (rejectAction === 'B2C') {
      // Move to B2C: transfer from Persediaan Utama 1-3000 to Persediaan B2C 1-3100
      if (inventoryAccount !== '1-3100') {
        await createAccountingEntry(
          `QC Reject Peralihan B2C - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
          'QC',
          purchaseItemId,
          [{ accountCode: '1-3100', amount: rejectValue }],
          [{ accountCode: '1-3000', amount: rejectValue }]
        );
      }
    }
  }

  return true;
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

export const recordStockOpnameAdjustment = async (
  productId: string,
  delta: number,
  unitCost: number,
  warehouseId: string, // 'main' or 'b2c'
  reason: string
) => {
  const store = useAppStore.getState();
  const product = store.products.find(p => p.id === productId);
  if (!product) return false;

  const totalValue = Math.abs(delta) * unitCost;
  const inventoryAccount = warehouseId === 'b2c' ? '1-3100' : '1-3000';

  if (delta > 0) {
    // Surplus: Debit Persediaan, Credit Pendapatan Lain-lain (4-2000)
    return await createAccountingEntry(
      `Stock Opname Selisih Lebih - ${product.name} - WH: ${warehouseId}`,
      'Adjustment',
      productId,
      [{ accountCode: inventoryAccount, amount: totalValue }],
      [{ accountCode: '4-2000', amount: totalValue }]
    );
  } else if (delta < 0) {
    // Deficit: Debit Beban Kerusakan (5-2000), Credit Persediaan
    return await createAccountingEntry(
      `Stock Opname Selisih Kurang - ${product.name} - WH: ${warehouseId}`,
      'Adjustment',
      productId,
      [{ accountCode: '5-2000', amount: totalValue }],
      [{ accountCode: inventoryAccount, amount: totalValue }]
    );
  }

  return true;
};

/** Pay a contact/vendor from an approved PR with an explicit expense COA. Final. */
export const recordPRExpensePayment = async (
  prId: string,
  amount: number,
  sourceBankAccountId: string,
  expenseAccountCode: string,
  payeeName: string,
  description: string,
  date?: string
) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === sourceBankAccountId);
  if (!bank) { console.error('[Accounting] PR expense payment: source bank not found.'); return false; }

  const desc = description || `Pengeluaran ke ${payeeName} - PR ${prId.slice(0, 8)}`;
  const success = await createAccountingEntry(
    desc, 'Expense', prId,
    [{ accountCode: expenseAccountCode, amount }],
    [{ accountCode: bank.accountCode || '1-1200', amount }],
    date
  );

  if (success && amount > 0) {
    await store.addCashTransaction({
      id: uuidv4(), date: date || new Date().toISOString(), amount, type: 'Out',
      category: 'Pengeluaran / Pembayaran', description: desc,
      bankAccountId: sourceBankAccountId, counterpartName: payeeName,
      referenceType: 'Expense', referenceId: prId,
    });
  }
  return success;
};

/** Finance pays a vendor by transfer for a market item; sourcing only picks it up.
 *  Mirrors recordOnlinePurchase: books goods to AP-accrual, HPP finalized at QC. */
export const recordVendorTransferPurchase = async (
  itemId: string,
  amount: number,
  productName: string,
  vendorId: string,
  vendorName: string,
  bankAccountId: string,
  transferRef: string = ''
) => {
  const store = useAppStore.getState();
  const total = Number(amount || 0);
  const existing = store.purchaseItems.find(pi => pi.id === itemId);
  if (existing?.isTransferPaid) {
    console.warn(`[Accounting] Transfer purchase already recorded for item ${itemId}`);
    return true;
  }

  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const bankAccountCode = bank?.accountCode || '1-1200';

  const success = await createAccountingEntry(
    `Transfer Vendor: ${productName} (${vendorName}) - Ref: ${itemId.slice(0, 8)}`,
    'Purchase',
    itemId,
    [{ accountCode: '2-1100', amount: total }],
    [{ accountCode: bankAccountCode, amount: total }]
  );

  if (success) {
    if (total > 0) {
      await store.addCashTransaction({
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: total,
        type: 'Out',
        category: 'Transfer Vendor',
        description: `Transfer Vendor: ${productName} (${vendorName})`,
        bankAccountId,
        counterpartName: vendorName,
        referenceId: itemId,
        referenceType: 'Purchase',
      });
    }
    const qty = existing?.qtyTarget || 1;
    await store.updatePurchaseItem(itemId, {
      isTransferPaid: true,
      transferVendorId: vendorId,
      vendorId,
      transferRef,
      actualUnitPrice: total / qty,
    });
    const product = store.products.find(p => p.id === existing?.productId);
    if (product) updateProductPriceHistory(product.id, total / qty, 'Transfer Vendor');
  }
  return success;
};
