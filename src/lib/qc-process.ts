// Pemeriksaan barang masuk: satu-satunya tempat QC dibukukan.
//
// Dulu seluruh isi berkas ini tinggal di dalam komponen halaman QC. Begitu layar
// harian gabungan butuh melakukan hal yang sama, satu-satunya pilihan adalah
// menyalinnya — dan aplikasi ini sudah pernah rugi karena dua salinan alur yang
// sama berjalan berdampingan lalu diam-diam berbeda (dua sistem Tukar Faktur,
// dua jalur potong stok). Jadi logikanya dipindah ke sini dan kedua layar
// memanggil fungsi yang sama.
//
// Bukan fungsi murni: dia menulis jurnal, stok, hutang, dan notifikasi. Yang
// dihilangkan cuma React dan toast — pemanggilnya yang memutuskan cara bicara
// ke orangnya.

import { qcRemaining } from './daily-flow';
import { executeGoodsCommand, goodsEventId, type PaperEvidence } from './goods-command';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

export type RejectAction = 'B2C' | 'Return' | 'Disposal';

export type QcInput = PaperEvidence & {
  eventId?: string;
  bankAccountId?: string;
  purchaseItemId: string;
  /** Berapa yang lolos dan masuk stok gudang (bukan untuk PO tertentu). */
  qtyPassToInventory: number;
  /** Alokasi ke pesanan klien: PO mana dapat berapa. */
  allocations: Array<{ soId: string; qty: number }>;
  qtyReject: number;
  rejectAction: RejectAction;
  rejectReason?: string;
  /** Harga yang benar-benar ditagih vendor. Kosong berarti pakai harga belanja. */
  vendorUnitPrice?: number;
  rejectVendorId?: string;
  unbalanceReason?: string;
  batchNumber?: string;
  expiryDate?: string;
  qcPhoto?: string | null;
  /** Siapa yang MEMERIKSA barangnya, kalau bukan yang mengetik. */
  qcPerformedByUserId?: string;
};

export type QcResult =
  | { ok: false; error: string }
  | { ok: true; warnings: string[]; infos: string[] };

/**
 * Jumlah yang diproses harus sama dengan yang datang. Kalau tidak, harus ada
 * alasannya — barang segar memang bisa susut, tapi susut tanpa keterangan tidak
 * bisa dibedakan dari barang hilang.
 */
export function qcBalanceProblem(input: QcInput, qtyIncoming: number): string | null {
  const quantities = [qtyIncoming, input.qtyPassToInventory, input.qtyReject, ...input.allocations.map(a => a.qty)];
  if (quantities.some(q => !Number.isFinite(q) || q < 0)) return 'Jumlah harus angka terbatas dan tidak boleh negatif.';
  if (input.vendorUnitPrice != null && (!Number.isFinite(input.vendorUnitPrice) || input.vendorUnitPrice < 0)) return 'Harga vendor tidak valid.';
  const allocated = input.allocations.reduce((s, a) => s + a.qty, 0);
  const processed = input.qtyPassToInventory + allocated + input.qtyReject;
  if (processed > qtyIncoming + 1e-8) return 'Jumlah QC melebihi sisa barang yang dipesan.';
  if (Math.abs(processed - qtyIncoming) > 1e-8 && !String(input.unbalanceReason || '').trim()) {
    return `Jumlahnya belum pas: ${processed} dari ${qtyIncoming} yang datang. Isi alasannya kalau memang beda.`;
  }
  return null;
}

/** Validate the local draft, then let the locked server command commit all legs. */
export async function processInboundQC(getState: () => Store, input: QcInput): Promise<QcResult> {
  const state = getState();
  const item = state.purchaseItems.find(p => p.id === input.purchaseItemId);
  const product = item ? state.products.find(p => p.id === item.productId) : undefined;
  if (!item || !product) return { ok: false, error: 'Barangnya tidak ketemu.' };

  const remaining = qcRemaining(item);
  const stableId = goodsEventId(input.eventId || `qc:${item.id}`);
  const balance = item.qcEventIds?.includes(stableId) ? null : qcBalanceProblem(input, remaining);
  if (balance) return { ok: false, error: balance };
  const { eventId, purchaseItemId, ...payload } = input;
  try {
    const result=await executeGoodsCommand(getState, {
      eventId: eventId || `qc:${item.id}`,
      stage: 'qc', sourceId: purchaseItemId, payload,
    });
    return { ok: true, warnings: result.paymentPendingAmount>0 ? ['Sisa hutang vendor menunggu pembayaran Finance.'] : [], infos: [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'QC gagal disimpan.' };
  }
}
