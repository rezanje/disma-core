import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from './store';
import { JournalEntry, JournalLine, StockMovement, VendorBill } from '@/types';
import { format } from 'date-fns';
import {postedDay} from './daily-close';
import { dueDateFor } from './vendor-payable';
import { costBasisFor } from './cogs-source';

import { recordDepreciationCommand } from './finance-commands';
import { executePurchaseCommand } from './purchase-command';
import { executeGoodsCommand, PaperEvidence } from './goods-command';

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

const financialDate = (date?: string) => postedDay(date || new Date());

const postFinancialEvent = async (input: Record<string, unknown>): Promise<boolean> => {
  const stamp = useAppStore.getState()._lastLocalMutationAt;
  try {
    const response = await fetch('/api/accounting/financial-events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const data = await response.json();
    const required = ['bankAccounts', 'journalEntries', 'journalLines', 'cashTransactions'];
    if (!response.ok || !data.event || required.some(key => !Array.isArray(data[key]) || !data[key].length)) return false;
    if (useAppStore.getState()._lastLocalMutationAt !== stamp) return false;
    useAppStore.setState(state => {
      const next: Record<string, unknown> = { _lastLocalMutationAt: Math.max(Date.now(), state._lastLocalMutationAt + 1) };
      for (const key of [...required, 'vendorBills', 'reimbursements', 'expenses', 'purchaseItems', 'purchaseRequests'] as const) {
        const rows = data[key] as Array<{ id: string }> | undefined;
        if (!Array.isArray(rows)) continue;
        const ids = new Set(rows.map(row => row.id));
        const previous = state[key as keyof typeof state] as Array<{ id: string }>;
        next[key] = [...previous.filter(row => !ids.has(row.id)), ...rows];
      }
      return next;
    });
    return true;
  } catch (error) {
    console.error('[Accounting] Financial event failed:', error);
    return false;
  }
};

export const recordVendorPayment = async (input: {
  paymentId: string; billId: string; date: string; bankAccountId: string; amount: number; note?: string;
}): Promise<boolean> => postFinancialEvent({ ...input, eventId: input.paymentId, kind: 'vendor-payment', date: financialDate(input.date) });

export const recordCashTransfer = async (input: {
  eventId: string; date: string; bankAccountId: string; targetBankAccountId: string;
  amount: number; description: string; referenceId?: string; sourceExpenseId?: string;
}): Promise<boolean> => postFinancialEvent({ ...input, kind: 'transfer', date: financialDate(input.date) });

type VendorEventBase = {eventId: string; date: string; amount: number; note?: string};
const postVendorEvent = async (kind: string, input: Record<string, unknown>, endpoint = '/api/accounting/vendor-events'): Promise<boolean> => {
  const stamp = useAppStore.getState()._lastLocalMutationAt;
  try {
    const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...input, kind})});
    const data = await response.json();
    if (!response.ok || !data.event || !Array.isArray(data.journalEntries) || !data.journalEntries.length || !Array.isArray(data.journalLines) || !data.journalLines.length) return false;
    if (useAppStore.getState()._lastLocalMutationAt !== stamp) return false;
    useAppStore.setState(state => {
      const changes: Record<string, unknown> = {_lastLocalMutationAt: Math.max(Date.now(), state._lastLocalMutationAt + 1)};
      for (const key of ['bankAccounts','vendorBills','vendorReturns','invoices','tukarFakturs','cashTransactions','journalEntries','journalLines'] as const) {
        if (!Array.isArray(data[key])) continue;
        const ids = new Set(data[key].map((row: {id: string}) => row.id));
        changes[key] = [...state[key].filter(row => !ids.has(row.id)), ...data[key]];
      }
      return changes;
    });
    return true;
  } catch (error) { console.error('[Accounting] Vendor source command failed:', error); return false; }
};
export const recordVendorAdvance = (input: VendorEventBase & {bankAccountId: string; purchaseId: string; vendorId: string}) => postVendorEvent('vendor-advance',input);
export const recordVendorClaimRefund = (input: VendorEventBase & {bankAccountId: string; vendorReturnId: string}) => postVendorEvent('vendor-refund',input);
export const recordVendorClaimNetoff = (input: VendorEventBase & {vendorReturnId: string; billId: string}) => postVendorEvent('vendor-netoff',input);

export const recordFinancialReversal = (input: {eventId: string; date: string; sourceType: 'client-receipt' | 'vendor-payment'; sourceId: string; reason: string}) => postVendorEvent('reversal',input,'/api/accounting/reversals');

export const HPP_ACCOUNT_CODE = '5-1000';
/** Tagihan ke vendor atas barang yang diretur — pengganti belum datang, uang belum balik. */
export const VENDOR_RETURN_CLAIM_ACCOUNT = '1-2100';
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

// Single source of truth for the CFO approval gate: transfers OUT of a
// cfoApprovalRequired=true account (BRI, Mandiri) need CFO sign-off.
// Everything else is admin-finance-only. Checked by both the Disbursement
// page and the Purchase Request disburse flow — never duplicate this logic.
export const bankRequiresCfoApproval = (bankAccountId: string): boolean => {
  const bank = useAppStore.getState().bankAccounts.find(b => b.id === bankAccountId);
  return bank?.cfoApprovalRequired === true;
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
  movement: Omit<StockMovement, 'id' | 'date' | 'resultingStock'> & { id?: string; date?: string }
) => {
  const store = useAppStore.getState();
  const product = store.products.find(p => p.id === movement.productId);
  if (!product) return false;

  const delta = Number(movement.stockDelta);
  const quantity = Number(movement.quantity ?? Math.abs(delta));
  const unitCost = Number(movement.unitCost ?? 0);
  if (!Number.isFinite(delta) || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitCost) || unitCost < 0) return false;
  const movementId = movement.id || uuidv4();
  const previous = store.stockMovements.find(m => m.id === movementId);
  if (previous) {
    return previous.productId === movement.productId
      && Number(previous.stockDelta) === delta && Number(previous.quantity) === quantity
      && previous.kind === movement.kind && previous.referenceId === movement.referenceId
      && previous.referenceType === movement.referenceType && previous.direction === movement.direction
      && previous.source === movement.source && previous.destination === movement.destination
      && previous.purchaseItemId === movement.purchaseItemId && previous.salesOrderId === movement.salesOrderId
      && (previous.unitCost || 0) === unitCost && (previous.batchNumber || '') === (movement.batchNumber || '')
      && (previous.expiryDate || '') === (movement.expiryDate || '')
      && (!movement.date || previous.date === movement.date)
      && (previous.warehouseId || 'main') === (movement.warehouseId || 'main');
  }
  const isB2C = (movement.warehouseId || 'main') === 'b2c';
  const currentStock = Number(isB2C ? (product.b2cStock || 0) : (product.currentStock || 0));
  const resultingStock = currentStock + delta;

  await store.addStockMovement({
    id: movementId,
    date: movement.date || new Date().toISOString(),
    productId: product.id,
    productName: product.name,
    skuCode: product.skuCode,
    quantity,
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
    batchNumber: movement.batchNumber || undefined,
    expiryDate: movement.expiryDate || undefined,
    unitCost,
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
  itemId: string, totalAmount: number, _productName: string, adminFee?: number, shippingFee?: number, bankAccountId?: string,
) => {
  const state = useAppStore.getState();
  const item = state.purchaseItems.find(row => row.id === itemId);
  const sourceExpense = state.expenses.find(row => row.referenceId === itemId && row.category === 'Belanja Online');
  adminFee ??= sourceExpense?.adminFee || 0; shippingFee ??= sourceExpense?.shippingFee || 0;
  bankAccountId = sourceExpense?.sourceBankAccountId || bankAccountId || 'bank-1';
  if (!item || !(item.qtyTarget > 0) || totalAmount <= adminFee + shippingFee) return false;
  try {
    await executePurchaseCommand(useAppStore.getState, {eventId: `online:${itemId}`, stage: 'online', sourceId: itemId,
      payload: {unitPrice: (totalAmount-adminFee-shippingFee)/item.qtyTarget, adminFee, shippingFee, bankAccountId, ref: item.onlineRef || ''}});
    return true;
  } catch (error) { console.error('[Accounting] Online source command failed:', error); return false; }
};

export const recordOperationalExpense = async (
  expenseId: string, amount: number, description: string, date?: string, category?: string,
  _creditAccountCode: string = '1-1000', bankAccountId: string = 'bank-4',
) => {
  const saved = useAppStore.getState().expenses.find(expense => expense.id === expenseId);
  return postFinancialEvent({eventId: `expense:${expenseId}`, kind: 'expense', date: financialDate(date), amount,
    bankAccountId: saved?.sourceBankAccountId || bankAccountId, referenceId: expenseId, description, category});
};

export const recordAdvanceExpense = async (
  expenseId: string, reporterId: string, amount: number, description: string, date?: string, category?: string,
) => {
  const saved = useAppStore.getState().expenses.find(expense => expense.id === expenseId);
  const wallet = getAdvanceWalletByUserId(reporterId);
  if (!saved?.sourceBankAccountId && !wallet) return false;
  return recordOperationalExpense(expenseId, amount, description, date, category, undefined, saved?.sourceBankAccountId || wallet!.bankAccountId);
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
  void sourceActorName; void targetActorName;
  return recordCashTransfer({eventId: `ops-transfer:${referenceId}`, date: financialDate(date), bankAccountId: sourceBankAccountId,
    targetBankAccountId, amount, description, referenceId});
};

export const recordDeliveryAndInvoice = async (
  deliveryId: string,
  invoiceId: string,
  invoiceTotal: number,
  cogsTotal: number,
  items: { productId: string, qty: number }[] = [],
  isFastTrack: boolean = false,
  // Tanggal kejadiannya, bukan tanggal tombolnya ditekan. Tanpa ini omzet dan HPP
  // selalu jatuh di hari Finance mengaudit: kiriman Sabtu yang baru diaudit Senin
  // bikin laba Sabtu nol dan laba Senin dobel.
  postingDate?: string
) => {
  const store = useAppStore.getState();

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
    [{ accountCode: '4-1000', amount: invoiceTotal }],
    postingDate
  );

  if (!revSuccess) return false;

  // 3. Record COGS / HPP Journal
  // Debit: HPP 5-1000
  // Credit: Persediaan 1-3000 or 1-3100
  if (cogsTotal > 0) {
    const hppSuccess = await createAccountingEntry(
      `Pengakuan HPP Delivery - Ref: ${deliveryId}`,
      'Delivery',
      deliveryId,
      [{ accountCode: '5-1000', amount: cogsTotal }],
      [{ accountCode: inventoryAccount, amount: cogsTotal }],
      postingDate
    );
    if (!hppSuccess) return false;
  }

  // 4. Physical Inventory Sync (Deduction)
  //
  // Barang yang sudah dirilis Gudang (Goods Outbound) SUDAH dipotong di sana, dengan
  // referenceId = deliveryId ronde ini. Memotong lagi di sini bikin setiap kiriman
  // terpotong dua kali — 50 Kg keluar tercatat 100 Kg — dan karena barang cross-dock
  // tidak pernah ditambahkan ke stok, hasilnya minus yang makin dalam tiap kiriman.
  // Potongan di bawah ini tinggal untuk jalur yang MELEWATI gudang (mis. tombol
  // "Dikirim → Terkirim" manual di halaman PO), yang tidak punya langkah rilis.
  for (const item of items) {
    const alreadyReleased = useAppStore.getState().stockMovements.some(
      m => m.kind === 'DELIVERY_OUTBOUND' && m.referenceId === deliveryId && m.productId === item.productId
    );
    if (alreadyReleased) continue;
    const product = store.products.find(p => p.id === item.productId);
    if (product) {
      // Harga satuan untuk kartu stok — dasar yang sama dengan pengakuan HPP,
      // jadi keduanya tidak boleh memakai aturan pemilihan yang berbeda.
      const pItem = costBasisFor(invoice?.salesOrderId, item.productId, store.purchaseItems, store.purchases);
      const unitCost = pItem ? pItem.actualUnitPrice : (product.basePrice || 0);

      const moved = await recordStockMovement({
        id: `delivery:${deliveryId}:${product.id}:outbound`,
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
      if (!moved) return false;
    }
  }

  return true;
};

/** Legacy status-only shortcut cannot supply frozen delivery-round evidence. */
export const finalizeSalesOrderDelivery = async (_soId: string) => {
  console.error('Selesaikan pengiriman melalui Hari ini → Serah terima → Penerimaan klien → Audit Finance agar bukti ronde tersimpan.');
  return false;
};

export type DropshipConfirmLine = {
  purchaseItemId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  unitPrice: number;
};

/** Direct vendor deliveries use the same locked goods command as office rounds. */
export const recordDropshipDelivery = async (
  salesOrderId: string, vendorId: string, lines: DropshipConfirmLine[], _confirmedBy: string,
  bankAccountId?: string, note?: string, proofUrl?: string, evidence?: PaperEvidence,
): Promise<boolean> => {
  try {
    const sourceItems = [...new Set(lines.map(line => line.purchaseItemId))].sort();
    const result = await executeGoodsCommand(useAppStore.getState, {
      eventId: `dropship:${salesOrderId}:${vendorId}:${sourceItems.join(':')}`,
      stage: 'dropship', sourceId: salesOrderId,
      payload: {vendorId, lines, bankAccountId, note, paperProof: proofUrl, ...evidence},
    });
    return result.ok === true;
  } catch (error) {
    console.error('[Accounting] Dropship command failed:', error);
    return false;
  }
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

export const recordReimbursementPayment = async (reimbId: string, amount: number, description: string, bankAccountId: string, userName: string) => postFinancialEvent({
  eventId: `reimbursement:${reimbId}`, kind: 'reimbursement', date: financialDate(), amount,
  bankAccountId, referenceId: reimbId, description: `Pembayaran Reimburse: ${description} (${userName})`,
});

export const recordBudgetTransfer = async (purchaseId: string, amount: number, bankAccountId: string, recipientName: string, destBankAccountId?: string) => {
  const store = useAppStore.getState();
  const purchaser = store.users.find(u => u.name === recipientName || u.id === recipientName);
  const wallet = getAdvanceWalletByUserId(purchaser?.id);
  const targetBankAccountId = destBankAccountId || wallet?.bankAccountId || 'bank-advance-sourcing';
  return recordCashTransfer({eventId: `budget:${purchaseId}`, date: financialDate(), bankAccountId,
    targetBankAccountId, amount, description: `Pencairan Budget Sourcing: ${recipientName}`, referenceId: purchaseId});
};

// Sourcing self-serve: move cash from the shared pool (Bank Jago) into a
// sourcer's cash-in-hand pocket. Pool → pocket, no PurchaseId. Guarded by the
// caller against pool balance; this fn assumes amount is already validated.
export const recordPocketWithdrawal = async (
  poolBankAccountId: string, pocketBankAccountId: string, amount: number, sourcerName: string, eventId: string = uuidv4(),
) => recordCashTransfer({eventId: `pocket-withdraw:${eventId}`, date: financialDate(), bankAccountId: poolBankAccountId,
  targetBankAccountId: pocketBankAccountId, amount, description: `Tarik Kantong: ${sourcerName}`});

export const recordPocketReturn = async (
  pocketBankAccountId: string, poolBankAccountId: string, amount: number, sourcerName: string, eventId: string = uuidv4(),
) => recordCashTransfer({eventId: `pocket-return:${eventId}`, date: financialDate(), bankAccountId: pocketBankAccountId,
  targetBankAccountId: poolBankAccountId, amount, description: `Setor Sisa Kantong: ${sourcerName}`});

// Book a sourcer's actual Cash/Pasar spend against their pocket: Dr HPP / Cr
// pocket. Only for cash-paid items — Tempo (AP) and Online (BCA) are handled
// elsewhere and must NOT be passed here.
export const recordPocketPurchase = async (
  purchaseId: string,
  pocketBankAccountId: string,
  amount: number,
  sourcerName: string
) => {
  return postFinancialEvent({eventId: `pocket-buy:${purchaseId}`, kind: 'cash-posting', date: financialDate(),
    bankAccountId: pocketBankAccountId, amount, debitAccountCode: '2-1100', referenceType: 'Purchase', referenceId: purchaseId,
    category: 'Belanja Sourcing (HPP)', description: `Belanja Tunai Sourcing (${sourcerName})`});
};

// Metode Bayar 'Transfer': paid immediately (no queue, no approval) by bank
// transfer instead of physical cash — same posting moment as recordPocketPurchase,
// just credits a bank account (default BCA) instead of the sourcing pocket.
export const recordVendorTransferPurchase = async (
  purchaseId: string,
  bankAccountId: string,
  amount: number,
  sourcerName: string
) => {
  return postFinancialEvent({eventId: `transfer-buy:${purchaseId}`, kind: 'cash-posting', date: financialDate(),
    bankAccountId, amount, debitAccountCode: '2-1100', referenceType: 'Purchase', referenceId: purchaseId,
    category: 'Belanja Transfer Sourcing', description: `Belanja Transfer Sourcing (${sourcerName})`});
};

/**
 * Legacy advance reconciliation is a verification of posted source events.
 * Purchases post cash when transcribed, and QC creates each vendor payable.
 * Never create a second payable or pretend the unreimbursed part left a wallet.
 */
export const recordReconciliationSettlement = async (
  purchaseId: string, actualShopCost: number, actualOpsCost: number, _advanceAmount: number, _bankAccountId: string,
): Promise<boolean> => {
  const store = useAppStore.getState();
  if (![actualShopCost, actualOpsCost].every(n => Number.isFinite(n) && n >= 0) || actualOpsCost > 0) return false;
  const rows = store.purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked && pi.purchaseMethod === 'Pasar');
  const total = rows.reduce((sum, pi) => sum + pi.qtyPurchased * pi.actualUnitPrice, 0);
  if (!rows.length || Math.abs(total - actualShopCost) > 0.01 || rows.some(pi => !pi.vendorId || !pi.paymentMethod)) return false;
  const cashDue = rows.filter(pi => pi.paymentMethod !== 'Tempo').reduce((sum, pi) => sum + pi.qtyPurchased * pi.actualUnitPrice, 0);
  const tempoDue = total - cashDue;
  const cashPosted = store.cashTransactions.filter(tx => {
    if (tx.type !== 'Out' || !(tx.referenceId === purchaseId || tx.referenceId?.startsWith(`${purchaseId}:report:`))) return false;
    const sourceEntryId = tx.id.startsWith('financial:') && tx.id.endsWith(':out') ? tx.id.slice(0,-4) + ':journal' : null;
    const candidates = store.journalEntries.filter(entry => entry.referenceType === 'Purchase' && entry.referenceId === tx.referenceId && (!sourceEntryId || entry.id === sourceEntryId));
    if (!sourceEntryId && !tx.id.startsWith('pocket-buy-') && !tx.id.startsWith('transfer-buy-')) return false;
    return candidates.some(entry => store.journalLines.some(line => line.journalEntryId === entry.id && line.debitAmount === tx.amount && store.coas.find(coa => coa.id === line.accountId)?.accountCode === '2-1100'));
  }).reduce((sum, tx) => sum + tx.amount, 0);
  const bills = store.vendorBills.filter(bill => bill.purchaseId === purchaseId && bill.status !== 'Cancelled');
  const tempoPosted = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const backedByJournal = bills.every(bill => store.journalLines.some(line => line.vendorBillId === bill.id && line.creditAmount > 0));
  const matched = Math.abs(cashPosted - cashDue) <= 0.01 && Math.abs(tempoPosted - tempoDue) <= 0.01 && backedByJournal;
  if (!matched) console.error('Uang muka lama belum cocok dengan transaksi sumber. Rekonsiliasi kas dan hutang per dokumen sebelum menyelesaikan berkas.');
  return matched;
};

export type ClientReceiptInput = {
  paymentId: string;
  date: string;
  bankAccountId: string;
  amount: number;
  allocations: Array<{ invoiceId: string; amount: number }>;
};

/** Committed server facts replace local rows; callers must not increment payments. */
export const recordClientReceipt = async (input: ClientReceiptInput): Promise<boolean> => {
  const stamp = useAppStore.getState()._lastLocalMutationAt;
  try {
    const response = await fetch('/api/accounting/client-receipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) return false;
    const keys = ['invoices', 'bankAccounts', 'journalEntries', 'journalLines', 'cashTransactions'] as const;
    if (!data.receipt || keys.some(key => !Array.isArray(data[key]) || data[key].length === 0)) return false;
    if (useAppStore.getState()._lastLocalMutationAt !== stamp) return false;
    useAppStore.setState(state => {
      const updated: Record<string, unknown> = { _lastLocalMutationAt: Math.max(Date.now(), state._lastLocalMutationAt + 1) };
      for (const key of keys) {
        const rows = data[key] as Array<{ id: string }>;
        const ids = new Set(rows.map(row => row.id));
        updated[key] = [...state[key].filter(row => !ids.has(row.id)), ...rows];
      }
      if (Array.isArray(data.tukarFakturs)) {
        const rows = data.tukarFakturs as Array<{id: string}>;
        const ids = new Set(rows.map(row => row.id));
        updated.tukarFakturs = [...state.tukarFakturs.filter(row => !ids.has(row.id)), ...rows];
      }
      return updated;
    });
    return true;
  } catch (error) {
    console.error('[Accounting] Client receipt failed:', error);
    return false;
  }
};

export const recordPaymentReceived = async (
  invoiceId: string, amount: number, date: string, bankAccountId: string = 'bank-1', paymentId: string = uuidv4(),
): Promise<boolean> => recordClientReceipt({
  paymentId, date, bankAccountId, amount, allocations: [{ invoiceId, amount }],
});

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
      // Return: barangnya balik ke vendor, jadi keluar dari Persediaan. Lawannya
      // BUKAN 2-1100: kalau barangnya dibeli tunai, uangnya sudah keluar dan yang
      // tersisa adalah tagihan ke vendor (barang pengganti atau uang kembali).
      // Ditaruh di 2-1100 nilainya tetap benar tapi nyangkut sebagai saldo debit di
      // akun hutang — tidak pernah kelihatan sebagai "vendor masih utang ke kita".
      const rejected = await createAccountingEntry(
        `QC Reject Retur Supplier - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
        'QC',
        purchaseItemId,
        [{ accountCode: VENDOR_RETURN_CLAIM_ACCOUNT, amount: rejectValue }],
        [{ accountCode: inventoryAccount, amount: rejectValue }]
      );
      if (!rejected) return false;
    } else if (rejectAction === 'Disposal') {
      // Disposal: write-off by debiting Beban Kerusakan 5-2000 and crediting Persediaan
      const rejected = await createAccountingEntry(
        `QC Reject Disposal - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
        'QC',
        purchaseItemId,
        [{ accountCode: '5-2000', amount: rejectValue }],
        [{ accountCode: inventoryAccount, amount: rejectValue }]
      );
      if (!rejected) return false;
    } else if (rejectAction === 'B2C') {
      // Move to B2C: transfer from Persediaan Utama 1-3000 to Persediaan B2C 1-3100
      if (inventoryAccount !== '1-3100') {
        const rejected = await createAccountingEntry(
          `QC Reject Peralihan B2C - ${product.name} - Ref: ${purchaseItemId.slice(0,8)}`,
          'QC',
          purchaseItemId,
          [{ accountCode: '1-3100', amount: rejectValue }],
          [{ accountCode: '1-3000', amount: rejectValue }]
        );
        if (!rejected) return false;
      }
    }
  }

  return true;
};

/**
 * Tempo purchase (item.purchaseMethod === 'Vendor' && item.paymentMethod === 'Tempo'):
 * goods received now, paid later per vendor's agreed term. Converts the GR/IR accrual
 * (2-1100) booked by recordInboundQC into a formal vendor payable (2-1000) tracked in
 * AP Aging, instead of Finance prepaying the vendor before goods arrive. Only for
 * Vendor-delivered items. Current warehouse commands create Pasar Tempo bills per QC tranche too.
 */
export const recordVendorBillFromInbound = async (
  purchaseItemId: string,
  vendorId: string,
  amount: number,
  description: string,
  purchaseId?: string
) => {
  const store = useAppStore.getState();
  const vendor = store.vendors.find((v) => v.id === vendorId);
  if (!vendor || amount <= 0) return false;

  const now = new Date();
  const billId = `inbound:${purchaseItemId}:bill`;
  const previousBill = store.vendorBills.find(b => b.id === billId);
  if (previousBill && (previousBill.vendorId !== vendorId || previousBill.totalAmount !== amount)) return false;
  const billNumber = previousBill?.billNumber || `VB-${format(now, 'yyyyMM')}-${purchaseItemId}`;
  const dueDate = dueDateFor(now, vendor.paymentTermDays || 14);

  const bill: VendorBill = {
    id: billId,
    billNumber,
    vendorId,
    vendorName: vendor.companyName,
    issueDate: now.toISOString(),
    dueDate,
    description,
    category: 'Bahan Baku',
    totalAmount: amount,
    amountPaid: 0,
    status: 'Pending',
    payments: [],
    purchaseId,
    createdAt: now.toISOString(),
  };

  // Tagihannya harus ada DULU: journal_lines.vendor_bill_id punya foreign key ke
  // vendor_bills, jadi memposting jurnal lebih dulu selalu ditolak database
  // ("violates foreign key constraint") dan hutang tempo tidak pernah terbentuk.
  if (!previousBill) await store.addVendorBill(bill);

  const success = await createAccountingEntry(
    `Tempo QC: ${description} - Ref: ${purchaseItemId.slice(0, 8)}`,
    'Purchase',
    purchaseItemId,
    [{ accountCode: '2-1100', amount }],
    [{ accountCode: '2-1000', amount, vendorId, vendorBillId: billId }]
  );
  if (!success) {
    // Jurnalnya gagal — jangan tinggalkan tagihan yatim di AP Aging.
    await store.deleteVendorBill(billId, { reason: 'failed-posting' });
    return false;
  }

  return true;
};

export const recordDepreciation = async (assetId: string, _amount: number, _assetName: string) => {
  const date = financialDate().slice(0,7) + '-01';
  return recordDepreciationCommand({eventId: `depreciation:${assetId}:${date.slice(0,7)}`, assetId, date});
};

export const generateDocumentNumber = (prefix: string) => {
  const dateStr = format(new Date(), 'yyyyMMdd');
  const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${dateStr}-${randomStr}`;
};

export const recordAdvanceReturn = async (
  amount: number, reporterId: string, bankAccountId: string = 'bank-1', _proofUrl?: string, eventId: string = uuidv4(), sourceExpenseId?: string, date?: string,
) => {
  const sourceWallet = getAdvanceWalletByUserId(reporterId);
  if (!sourceWallet) return false;
  return recordCashTransfer({eventId: `advance-return:${eventId}`, date: financialDate(date), bankAccountId: sourceWallet.bankAccountId,
    targetBankAccountId: bankAccountId, amount, description: `Pengembalian ${sourceWallet.label}`, referenceId: eventId, sourceExpenseId});
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
  prId: string, amount: number, sourceBankAccountId: string, expenseAccountCode: string,
  payeeName: string, description: string, date?: string,
) => postFinancialEvent({eventId: `pr-expense:${prId}`, kind: 'pr-expense', date: financialDate(date),
  bankAccountId: sourceBankAccountId, amount, debitAccountCode: expenseAccountCode,
  referenceId: prId, referenceType: 'Expense', description: description || `Pengeluaran ke ${payeeName}`, category: 'Pengeluaran / Pembayaran'});

/**
 * Credit note: membalik sebagian pendapatan dan piutang atas invoice yang sudah
 * diposting. Dr Pendapatan / Cr Piutang — kebalikan persis dari jurnal terbit invoice,
 * sebesar nilai yang dikoreksi saja.
 *
 * Tidak menyentuh HPP maupun persediaan. Koreksi harga atau salah tagih tidak
 * mengembalikan barang; kalau barangnya memang kembali, itu jalur retur customer yang
 * punya pergerakan stoknya sendiri. Menggabungkan keduanya di sini akan mengembalikan
 * stok untuk barang yang masih ada di dapur klien.
 */
export const recordCreditNote = async (
  creditNoteId: string,
  amount: number,
  description: string,
  date?: string,
) => {
  if (!(amount > 0)) return false;
  return await createAccountingEntry(
    `Credit Note: ${description}`,
    'Adjustment',
    creditNoteId,
    [{ accountCode: '4-1000', amount }],
    [{ accountCode: '1-2000', amount }],
    date,
  );
};
