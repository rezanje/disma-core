// Audit pengiriman: barang sampai klien, lalu jadi tagihan dan omzet.
//
// Isinya diangkat keluar dari layar Finance supaya layar Admin PO memakai alur yang
// SAMA PERSIS, bukan salinannya. Yang dikerjakan di sini menulis invoice, jurnal omzet,
// jurnal HPP, dan potongan stok sekaligus — kalau ada dua salinan, cukup satu perbaikan
// yang lupa disalin untuk membuat dua layar membukukan angka yang berbeda dari kejadian
// yang sama. Aplikasi ini sudah dua kali membayar mahal untuk pola itu.

import { v4 as uuidv4 } from 'uuid';
import { roundQtyToBook } from './backorder';
import { recordDeliveryAndInvoice } from './accounting';
import { costBasisFor } from './cogs-source';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

export type HasilAudit =
  | { ok: false; error: string }
  | { ok: true };

/**
 * Bukukan satu pengiriman yang sudah sampai klien.
 *
 * Dipanggil setelah orangnya memastikan surat jalan / berita acara bertanda tangan
 * memang ada. Fungsi ini tidak memeriksa dokumennya — itu penilaian manusia.
 */
export async function auditPengiriman(
  getState: () => Store,
  deliveryId: string,
): Promise<HasilAudit> {
  const state = getState();
  const delivery = state.deliveries.find(d => d.id === deliveryId);
  const soId = delivery?.salesOrderId;
  if (!delivery || !soId) return { ok: false, error: 'Pengiriman tidak ditemukan.' };

  const soItems = state.salesOrderItems.filter(i => i.salesOrderId === soId);
  const roundQtyById = new Map(soItems.map(i => [i.id, roundQtyToBook(i)]));
  const totalRevenue = soItems.reduce(
    (sum, item) => sum + ((roundQtyById.get(item.id) ?? 0) * item.unitPrice),
    0,
  );

  // Invoice lama dipakai ulang HANYA kalau belum pernah dibukukan; kalau sudah, ini
  // ronde susulan dan butuh invoice baru supaya jurnalnya tidak menimpa yang lama.
  const bookedInvoiceIds = new Set(
    getState().journalEntries
      .filter(e => e.referenceType === 'Invoice')
      .map(e => e.referenceId),
  );
  let invoiceId = delivery.invoiceId;
  if (!invoiceId || bookedInvoiceIds.has(invoiceId)) {
    const so = state.salesOrders.find(s => s.id === soId);
    invoiceId = uuidv4();
    // Tanggal terbit = tanggal barang diterima klien, jadi jatuh temponya juga dihitung
    // dari sana. Kalau dipatok "hari ini", audit yang telat tiga hari memberi klien tiga
    // hari ekstra tanpa ada yang menyadarinya.
    const issuedAt = delivery.deliveryDate ? new Date(delivery.deliveryDate) : new Date();
    const termDays = state.clients.find(c => c.id === so?.clientId)?.paymentTermDays ?? 14;
    await getState().addInvoice({
      id: invoiceId,
      salesOrderId: soId,
      clientId: so?.clientId || '',
      issueDate: issuedAt.toISOString(),
      dueDate: new Date(issuedAt.getTime() + termDays * 24 * 60 * 60 * 1000).toISOString(),
      totalAmount: totalRevenue,
      amountPaid: 0,
      status: 'Unpaid' as const,
    });
    await getState().updateDelivery(deliveryId, { invoiceId });
  }

  let totalCogs = 0;
  const stockDeductionItems: { productId: string; qty: number }[] = [];
  for (const item of soItems) {
    const roundQty = roundQtyById.get(item.id) ?? 0;
    if (roundQty <= 0) continue;
    // Baris belanja TERBARU untuk pesanan ini, bukan yang pertama ketemu: ronde
    // susulan punya baris belanjanya sendiri dengan harga hari itu, dan mengambil
    // baris ronde pertama membukukan harga minggu lalu untuk barang hari ini.
    const pItem = costBasisFor(soId, item.productId, state.purchaseItems, state.purchases);
    const unitCogs = pItem
      ? pItem.actualUnitPrice
      : (state.products.find(p => p.id === item.productId)?.basePrice || 0);
    totalCogs += unitCogs * roundQty;
    stockDeductionItems.push({ productId: item.productId, qty: roundQty });
  }

  const isFastTrack = delivery.notes?.toLowerCase().includes('fast-track') || false;
  // Omzet & HPP dibukukan pada tanggal barang diterima klien, bukan tanggal auditnya
  // dikerjakan — kalau tidak, laba harian pindah hari setiap kali auditnya telat.
  const postingDate = delivery.deliveryDate || undefined;

  const success = await recordDeliveryAndInvoice(
    deliveryId, invoiceId, totalRevenue, totalCogs, stockDeductionItems, isFastTrack, postingDate,
  );
  if (!success) return { ok: false, error: 'Gagal mencatat transaksi ke jurnal.' };

  await getState().updateDelivery(deliveryId, { status: 'Terkirim' });
  await getState().updateSalesOrder(soId, { status: 'Terkirim' });
  return { ok: true };
}
