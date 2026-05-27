import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from './store';
import { JournalEntry, JournalLine, StockMovement } from '@/types';
import { format } from 'date-fns';

/**
 * Double-Entry Bookkeeping Helper functions
 */

type PostingLineInput = { accountCode: string; amount: number };
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
  const postingDebits = preparedDebits.map((d) => ({
    id: uuidv4(),
    accountCode: d.accountCode,
    amount: d.amount,
  }));
  const postingCredits = preparedCredits.map((c) => ({
    id: uuidv4(),
    accountCode: c.accountCode,
    amount: c.amount,
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
  
  // Prevent duplicate recording
  const existingItem = store.purchaseItems.find(pi => pi.id === itemId);
  if (existingItem?.isOnlineAudited) {
    console.warn(`Attempted to record already audited online purchase: ${itemId}`);
    return true; // Already done
  }

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

  if (success) {
    // 2. Cash History
    if (totalAmount > 0) {
      await store.addCashTransaction({
        id: uuidv4(),
        date: new Date().toISOString(),
        amount: totalAmount,
        type: 'Out',
        category: 'Belanja Online', // Use exact category for better filtering
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

    // 4. Update Inventory & Price History
    const product = store.products.find(p => p.name === productName || p.skuCode === productName || p.id === itemId || p.id === existingItem?.productId);
    if (product) {
      const qtyReceived = existingItem?.qtyTarget || 1;

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
        note: `Belanja online ${productName} masuk stok (Approved by Finance)`,
      });

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

  // 2. Record Revenue (Invoice Terbit)
  const revSuccess = await createAccountingEntry(
    `Invoice Terbit - Ref: ${invoiceId}`,
    'Invoice',
    invoiceId,
    [{ accountCode: '1-2000', amount: invoiceTotal }],
    [{ accountCode: '4-1000', amount: invoiceTotal }]
  );

  // 3. Record HPP/COGS for Fast Track (since procurement/sourcing was bypassed)
  if (revSuccess && isFastTrack && cogsTotal > 0) {
    await createAccountingEntry(
      `Pengakuan HPP Fast-Track - Ref: ${invoiceId}`,
      'Invoice',
      invoiceId,
      [{ accountCode: '5-1000', amount: cogsTotal }], // Debit HPP
      [{ accountCode: '1-3000', amount: cogsTotal }]  // Credit Persediaan Barang Dagang
    );
  }
  
  // 4. Physical Inventory Sync (Deduction)
  if (revSuccess) {
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

  return revSuccess;
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
  // - Sourcing-Defisit: HPP/Ops sudah dijurnal saat settlement; payment-nya potong Utang Usaha (2-1000).
  // - Auto-Talangan: bagian ops yg gak ketutup wallet saat input; samain ke Beban Ops Pasar (6-1400).
  // - Manual / undefined (legacy): masuk Beban Operasional Lainnya (6-9000).
  const reimb = store.reimbursements.find(r => r.id === reimbId);
  const kindLower = (description || '').toLowerCase();
  const isLegacyDefisitSourcing = !reimb?.kind && (kindLower.includes('talangan sourcing') || kindLower.includes('defisit sourcing'));
  const isLegacyAutoTalangan = !reimb?.kind && kindLower.includes('auto-talangan');

  let debitAccountCode: string;
  if (reimb?.kind === 'Sourcing-Defisit' || isLegacyDefisitSourcing) {
    debitAccountCode = '2-1000';
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

export const recordBudgetTransfer = async (purchaseId: string, amount: number, bankAccountId: string, recipientName: string) => {
  const store = useAppStore.getState();
  const bank = store.bankAccounts.find(b => b.id === bankAccountId);
  const sourceBankCode = bank?.accountCode || '1-1200';
  const purchaser = store.users.find(u => u.name === recipientName || u.id === recipientName);
  const wallet = getAdvanceWalletByUserId(purchaser?.id);
  const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
  const targetAccountCode = wallet?.accountCode || '1-1500';

  if (bankAccountId === targetBankId) {
    throw new Error(`Source bank tidak boleh sama dengan wallet penerima (${bankAccountId}). Pilih bank kantor (BCA/BRI/Mandiri/Kas Tunai).`);
  }

  const success = await createAccountingEntry(
    `Pencairan Budget Sourcing: ${recipientName} - Ref: ${purchaseId.slice(0,8)}`,
    'Transfer',
    purchaseId,
    [{ accountCode: targetAccountCode, amount: amount }],
    [{ accountCode: sourceBankCode, amount: amount }]
  );

  if (success && amount > 0) {
    const now = new Date().toISOString();

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
  const purchase = store.purchases.find(p => p.id === purchaseId);
  const wallet = getAdvanceWalletByUserId(purchase?.purchaserId);
  const targetBankId = wallet?.bankAccountId || 'bank-advance-sourcing';
  const advanceAccountCode = wallet?.accountCode || '1-1500';

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

  // 1. Settle Advance for Shop Cost (HPP) — journal + CashTransaction Out dari Kas Sourcing
  if (actualShopCost > 0 && !hasExistingShopSettlement) {
    const settledAmount = Math.min(actualShopCost, Math.max(0, advanceAmount));
    const defisitShop = actualShopCost - settledAmount;

    const credits: PostingLineInput[] = [];
    if (settledAmount > 0) {
      credits.push({ accountCode: advanceAccountCode, amount: settledAmount });
    }

    // Jika HPP > Advance, sisanya jadi Utang Usaha (karena ditomboki sourcer)
    if (defisitShop > 0) {
      credits.push({ accountCode: '2-1000', amount: defisitShop });
    }

    const shopDescription = `Penyelesaian Belanja Sourcing - Ref: ${purchaseRef}`;
    const shopJournalSuccess = await createAccountingEntry(
      shopDescription,
      'Purchase',
      purchaseId,
      // Belanja sourcing yang disetujui harus masuk ke HPP agar muncul di laba rugi.
      [{ accountCode: HPP_ACCOUNT_CODE, amount: actualShopCost }],
      credits
    );

    if (!shopJournalSuccess) {
      return false;
    }

    const postedShopEntry = findPostedEntry('Purchase', purchaseId, shopDescription);
    const createdCashIds: string[] = [];

    // Jika sourcer talangin, catat In dulu (Talangan Sourcer) supaya kas keluar HPP = actualShopCost utuh
    try {
      if (defisitShop > 0) {
        const txId = uuidv4();
        await store.addCashTransaction({
          id: txId,
          date: now,
          amount: defisitShop,
          type: 'In',
          category: 'Talangan Sourcer',
          description: `Talangan Sourcer (Defisit HPP) - Ref: ${purchaseRef}`,
          bankAccountId: targetBankId,
          referenceId: purchaseId
        });
        createdCashIds.push(txId);
      }
      // Out dari Kas Sourcing — uang dipakai belanja (full actualShopCost agar match summary settlement)
      const txId = uuidv4();
      await store.addCashTransaction({
        id: txId,
        date: now,
        amount: actualShopCost,
        type: 'Out',
        category: 'Sourcing (HPP)',
        description: `Belanja Pasar disetujui - Ref: ${purchaseRef}`,
        bankAccountId: targetBankId,
        referenceId: purchaseId
      });
      createdCashIds.push(txId);
    } catch (err) {
      console.error('[Accounting] Failed to persist shop settlement cash transaction, rolling back journal:', err);
      await cleanupCashTransactions(createdCashIds);
      if (postedShopEntry) await cleanupJournalEntry(postedShopEntry.id);
      return false;
    }
  }

  // 2. Settle Advance for Ops Cost (journal + CashTransaction Out)
  if (actualOpsCost > 0 && !hasExistingOpsSettlement) {
    const settleFromAdvance = Math.min(actualOpsCost, Math.max(0, advanceAmount - actualShopCost));
    const defisitOps = actualOpsCost - settleFromAdvance;
    const opsCredits: PostingLineInput[] = [];

    if (settleFromAdvance > 0) {
      opsCredits.push({ accountCode: advanceAccountCode, amount: settleFromAdvance });
    }
    if (defisitOps > 0) {
      opsCredits.push({ accountCode: '2-1000', amount: defisitOps });
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

    if (settleFromAdvance > 0) {
      const postedOpsEntry = findPostedEntry('Expense', purchaseId, opsDescription);
      const txId = uuidv4();
      try {
        await store.addCashTransaction({
          id: txId,
          date: now,
          amount: settleFromAdvance,
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
  // Journal utang ke 2-1000 sudah dibuat di step 1/2. Reimburse row ini cuma trigger pencairan kas ke sourcer.
  const defisitShop = actualShopCost > 0 ? Math.max(0, actualShopCost - Math.max(0, advanceAmount)) : 0;
  const defisitOps = actualOpsCost > 0 ? Math.max(0, actualOpsCost - Math.max(0, advanceAmount - actualShopCost)) : 0;
  const totalDefisit = defisitShop + defisitOps;

  if (totalDefisit > 0 && purchase?.purchaserId) {
    // Idempotency: skip if any defisit reimburse already exists for this purchase.
    // Cover BOTH new rows (kind='Sourcing-Defisit') and legacy rows from the old
    // finance/approvals path (title includes "Defisit Sourcing"/"Talangan").
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

export const recordShrinkage = async (referenceId: string, amount: number, description: string) => {
  return await createAccountingEntry(
    `Barang Reject: ${description}`,
    'Adjustment',
    referenceId,
    [{ accountCode: '5-2000', amount: amount }], // Debit Beban Kerusakan
    [{ accountCode: '5-1000', amount: amount }]  // Credit HPP (reclassify from HPP, since all purchases were put into HPP)
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
