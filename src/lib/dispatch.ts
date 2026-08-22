// Melepas barang ke pengiriman, dan menutup pengiriman jadi tagihan.
//
// Dua langkah yang dulu tinggal di dua halaman berbeda (Goods Outbound dan daftar
// Kurir). Layar harian gabungan melakukan hal yang sama, jadi logikanya pindah ke
// sini — dua salinan alur uang yang berjalan berdampingan adalah cara aplikasi ini
// pernah kehilangan potongan stok dan tagihan.

import { v4 as uuidv4 } from 'uuid';
import { roundQtyToBook } from './backorder';
import { buildIssueNumber, defaultDueDate } from './delivery-issue';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

/**
 * Barang keluar gudang untuk satu pesanan: misi pengiriman dibuat, stok dipotong,
 * pesanan naik ke "Siap Kirim".
 *
 * Misinya dibuat DULU supaya baris stok memakai id-nya — itu yang dipakai audit
 * Finance untuk tahu barangnya sudah dipotong di sini dan tidak memotong dua kali.
 */
export async function releaseForDelivery(getState: () => Store, soId: string): Promise<string> {
  // Impor di dalam fungsi, bukan di kepala berkas: accounting menarik klien Supabase
  // saat dimuat, dan itu membuat dispatch.check.ts tidak bisa jalan tanpa kunci
  // lingkungan. Dua fungsi lain di berkas ini murni memakai store, jadi bisa diuji.
  const { recordStockMovement } = await import('./accounting');
  const state = getState();
  const items = state.salesOrderItems.filter(i => i.salesOrderId === soId);

  // Pengiriman yang sudah selesai (Terkirim) di ronde sebelumnya tidak boleh
  // menghalangi ronde baru — hanya pengiriman yang masih jalan yang menghalangi.
  const openDelivery = state.deliveries.find(d => d.salesOrderId === soId && d.status !== 'Terkirim');
  let deliveryId = openDelivery?.id;
  if (!deliveryId) {
    const so = state.salesOrders.find(s => s.id === soId);
    deliveryId = uuidv4();
    await state.addDelivery({
      id: deliveryId,
      salesOrderId: soId,
      courierId: so?.assignedCourierId || 'pending',
      status: 'Menunggu',
    });
  }

  for (const item of items) {
    // Hanya qty ronde ini. Untuk barang yang sudah lunas terkirim di ronde
    // sebelumnya angkanya 0, jadi tidak ada potongan stok hantu.
    const qtyToDeduct = roundQtyToBook(item);
    if (qtyToDeduct <= 0) continue;
    await recordStockMovement({
      productId: item.productId,
      quantity: qtyToDeduct,
      stockDelta: -qtyToDeduct,
      direction: 'Out',
      kind: 'DELIVERY_OUTBOUND',
      source: 'Inventory',
      destination: 'Client Delivery',
      referenceType: 'Delivery',
      referenceId: deliveryId,
      salesOrderId: soId,
      note: `Barang keluar untuk pengiriman SO ${soId}`,
      createdByUserId: state.currentUser?.id || 'system',
    });
  }

  await state.updateSalesOrder(soId, {
    status: 'Siap Kirim',
    handoverDate: new Date().toISOString(),
    handoverBy: state.currentUser?.id || 'system',
  });

  return deliveryId;
}

/**
 * Berapa yang benar-benar diterima klien per baris. Yang kurang dari yang berangkat
 * berarti ditolak di lokasi: barangnya ikut kurir pulang, jadi harus punya dokumen
 * retur bernomor, bukan cuma selisih angka.
 */
export type ReceivedLine = { salesOrderItemId: string; qtyReceived: number };

export async function applyClientReceipt(
  getState: () => Store,
  soId: string,
  received: ReceivedLine[],
): Promise<void> {
  for (const line of received) {
    const state = getState();
    const item = state.salesOrderItems.find(i => i.id === line.salesOrderItemId);
    if (!item) continue;

    // Dibandingkan dengan yang BENAR-BENAR berangkat ronde ini, bukan qty pesanan.
    // Kekurangan dari QC bukan penolakan klien.
    const shipped = roundQtyToBook(item);
    if (shipped === line.qtyReceived) continue;

    await state.updateSalesOrderItem(item.id, {
      qtyFinal: line.qtyReceived,
      subtotalFinal: line.qtyReceived * item.unitPrice,
      qtyAdjustmentReason: (item.qtyAdjustmentReason ? item.qtyAdjustmentReason + ' + ' : '') + 'Reject di Lokasi',
    });

    const rejectedQty = shipped - line.qtyReceived;
    if (rejectedQty > 0) {
      const now = new Date();
      const fresh = getState();
      await fresh.addPendingReturn({
        id: uuidv4(),
        productId: item.productId,
        originalSoId: soId,
        qty: rejectedQty,
        reason: 'Ditolak klien saat serah terima',
        date: now.toISOString(),
        status: 'Pending QC',
        diNumber: buildIssueNumber(now, fresh.pendingReturns.map(r => r.diNumber || '')),
        // Pemiliknya Admin PO — playbook §3.2 menaruh Delivery Issue di sana.
        ownerUserId: fresh.users.find(u => u.role === 'admin_po')?.id,
        dueDate: defaultDueDate(now),
      });
    }
  }
}

/**
 * Pengiriman ditutup: menunggu audit Finance, dan tagihannya terbit sebesar yang
 * benar-benar diterima klien ronde ini.
 */
export async function finalizeDeliveryAndInvoice(
  getState: () => Store,
  deliveryId: string,
  soId: string,
): Promise<{ ok: false; error: string } | { ok: true; invoiceId: string; total: number }> {
  const state = getState();
  const so = state.salesOrders.find(s => s.id === soId);
  const client = state.clients.find(c => c.id === so?.clientId);
  if (!so || !client) return { ok: false, error: 'Pesanan atau kliennya tidak ketemu.' };

  const soItems = state.salesOrderItems.filter(i => i.salesOrderId === soId);
  const totalRevenue = soItems.reduce((sum, item) => sum + (roundQtyToBook(item) * item.unitPrice), 0);

  await state.updateDelivery(deliveryId, {
    status: 'Awaiting Audit',
    deliveryDate: new Date().toISOString(),
  });
  await state.updateSalesOrder(soId, { status: 'Awaiting Audit' });

  const invoiceId = uuidv4();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (client.paymentTermDays || 30));

  await state.addInvoice({
    id: invoiceId,
    salesOrderId: soId,
    clientId: client.id,
    issueDate: new Date().toISOString(),
    dueDate: dueDate.toISOString(),
    totalAmount: totalRevenue,
    amountPaid: 0,
    status: 'Unpaid',
  });
  await state.updateDelivery(deliveryId, { invoiceId });

  return { ok: true, invoiceId, total: totalRevenue };
}
