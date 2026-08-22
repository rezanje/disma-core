import assert from 'node:assert/strict';
import { applyClientReceipt, finalizeDeliveryAndInvoice } from './dispatch';

// Store tiruan: cukup yang disentuh kedua fungsi ini. releaseForDelivery sengaja tidak
// diuji di sini — dia memanggil pencatatan stok yang bicara langsung ke database.
function fakeStore() {
  const state: any = {
    currentUser: { id: 'u-sifa', name: 'Sifa' },
    users: [{ id: 'u-bagus', role: 'admin_po', name: 'Bagus' }],
    clients: [{ id: 'C1', companyName: 'Resto A', paymentTermDays: 14 }],
    salesOrders: [{ id: 'SO1', clientId: 'C1', poNumber: 'PO-1', status: 'Siap Kirim' }],
    salesOrderItems: [
      { id: 'L1', salesOrderId: 'SO1', productId: 'APEL', qty: 10, qtyFinal: 10, unitPrice: 12000 },
      { id: 'L2', salesOrderId: 'SO1', productId: 'JERUK', qty: 5, qtyFinal: 5, unitPrice: 20000 },
    ],
    deliveries: [{ id: 'D1', salesOrderId: 'SO1', status: 'Dikirim' }],
    pendingReturns: [],
    invoices: [],
  };
  state.updateSalesOrderItem = async (id: string, patch: any) => {
    const i = state.salesOrderItems.find((x: any) => x.id === id);
    Object.assign(i, patch);
  };
  state.updateSalesOrder = async (id: string, patch: any) => {
    Object.assign(state.salesOrders.find((x: any) => x.id === id), patch);
  };
  state.updateDelivery = async (id: string, patch: any) => {
    Object.assign(state.deliveries.find((x: any) => x.id === id), patch);
  };
  state.addPendingReturn = async (r: any) => { state.pendingReturns.push(r); };
  state.addInvoice = async (inv: any) => { state.invoices.push(inv); };
  return { state, get: () => state as any };
}

async function main() {
  // --- klien menerima utuh: tidak ada retur, tagihan penuh ---
  {
    const { state, get } = fakeStore();
    await applyClientReceipt(get, 'SO1', [
      { salesOrderItemId: 'L1', qtyReceived: 10 },
      { salesOrderItemId: 'L2', qtyReceived: 5 },
    ]);
    assert.equal(state.pendingReturns.length, 0);
    assert.equal(state.salesOrderItems[0].qtyAdjustmentReason, undefined);

    const res: any = await finalizeDeliveryAndInvoice(get, 'D1', 'SO1');
    assert.equal(res.ok, true);
    assert.equal(res.total, 10 * 12000 + 5 * 20000);
    assert.equal(state.invoices.length, 1);
    assert.equal(state.invoices[0].totalAmount, 220000);
    assert.equal(state.invoices[0].amountPaid, 0);
    assert.equal(state.invoices[0].status, 'Unpaid');
    assert.equal(state.deliveries[0].status, 'Awaiting Audit');
    assert.equal(state.deliveries[0].invoiceId, state.invoices[0].id);
    assert.equal(state.salesOrders[0].status, 'Awaiting Audit');
  }

  // --- klien menolak sebagian: retur bernomor terbit, tagihan ikut turun ---
  {
    const { state, get } = fakeStore();
    await applyClientReceipt(get, 'SO1', [
      { salesOrderItemId: 'L1', qtyReceived: 7 },   // 3 ditolak di lokasi
      { salesOrderItemId: 'L2', qtyReceived: 5 },
    ]);

    assert.equal(state.salesOrderItems[0].qtyFinal, 7);
    assert.equal(state.salesOrderItems[0].subtotalFinal, 84000);
    assert.match(state.salesOrderItems[0].qtyAdjustmentReason, /Reject di Lokasi/);

    assert.equal(state.pendingReturns.length, 1);
    const retur = state.pendingReturns[0];
    assert.equal(retur.qty, 3);
    assert.equal(retur.productId, 'APEL');
    assert.equal(retur.status, 'Pending QC');
    assert.ok(retur.diNumber, 'retur wajib bernomor supaya bisa dikejar');
    assert.equal(retur.ownerUserId, 'u-bagus', 'pemiliknya Admin PO, bukan yang mengetik');
    assert.ok(retur.dueDate, 'retur wajib punya tenggat');

    const res: any = await finalizeDeliveryAndInvoice(get, 'D1', 'SO1');
    // Tagihan mengikuti yang benar-benar diterima, bukan yang dipesan.
    assert.equal(res.total, 7 * 12000 + 5 * 20000);
    assert.equal(state.invoices[0].totalAmount, 184000);
  }

  // --- klien menolak semuanya untuk satu baris ---
  {
    const { state, get } = fakeStore();
    await applyClientReceipt(get, 'SO1', [{ salesOrderItemId: 'L1', qtyReceived: 0 }]);
    assert.equal(state.pendingReturns[0].qty, 10);
    const res: any = await finalizeDeliveryAndInvoice(get, 'D1', 'SO1');
    assert.equal(res.total, 5 * 20000); // cuma jeruk yang ditagih
  }

  // --- pesanan yang tidak dikenal tidak boleh diam-diam menerbitkan tagihan kosong ---
  {
    const { get, state } = fakeStore();
    const res: any = await finalizeDeliveryAndInvoice(get, 'D1', 'SO-hantu');
    assert.equal(res.ok, false);
    assert.equal(state.invoices.length, 0);
  }

}

main().then(() => console.log('dispatch: OK'));
