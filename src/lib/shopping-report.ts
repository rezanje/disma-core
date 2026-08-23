// Laporan hasil belanja: satu-satunya tempat kertas dari pasar dibukukan.
//
// Isinya diangkat dari layar sourcing supaya layar penyalinan yang baru memakai alur
// yang sama persis. Kalau disalin, dua layar yang membukukan uang akan pelan-pelan
// berbeda — dan aplikasi ini sudah dua kali membayar mahal untuk pola itu.
//
// Bukan fungsi murni: menulis kantong, jurnal, harga pasar, dan status pesanan.
// Pemeriksaannya dipisah ke reportProblems() supaya bisa diuji tanpa database.

import { v4 as uuidv4 } from 'uuid';
import { buildMarketPriceRows } from './market-price';
import { linesNeedingReason } from './price-ceiling';
import { resolveActor } from './actor';
import { proofBlocker } from './transcription-proof';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

export type ReportLine = {
  id: string;
  productId: string;
  purchaseId: string;
  /** Jadi dibeli atau tidak. Yang tidak dicentang berarti kosong di pasar. */
  isChecked: boolean;
  actualUnitPrice: number;
  qtyPurchased: number;
  vendorId?: string | null;
  paymentMethod?: 'Cash' | 'Tempo' | 'Transfer';
  purchaseMethod?: string | null;
  notes?: string;
  overCeilingReason?: string;
};

export type ReportInput = {
  purchaseIds: string[];
  lines: ReportLine[];
  /** Kantong yang dipotong. Wajib ada kalau ada belanja tunai. */
  pocketBankAccountId?: string | null;
  /** Siapa yang benar-benar belanja, kalau bukan yang mengetik. */
  onBehalfOfUserId?: string | null;
  proofImage?: string | null;
  reconciliationNote?: string;
  /** productId -> batas harga beli. Kosong berarti tidak ada batas. */
  ceilings?: Map<string, number>;
};

/**
 * Semua alasan laporan ini belum boleh dikirim. Kosong berarti boleh.
 *
 * Dipisah dari penulisannya supaya bisa diuji tanpa database — dan supaya layar bisa
 * menampilkan seluruh masalahnya sekaligus, bukan satu per satu tiap kali diklik.
 */
export function reportProblems(
  input: ReportInput,
  namaProduk: (productId: string) => string,
  currentUserId?: string | null,
): string[] {
  const masalah: string[] = [];
  const dibeli = input.lines.filter(l => l.isChecked);

  const tanpaVendor = dibeli.filter(l => !l.vendorId);
  if (tanpaVendor.length > 0) {
    masalah.push(`Vendor belum diisi: ${tanpaVendor.map(l => namaProduk(l.productId)).join(', ')}`);
  }

  const tanpaHarga = dibeli.filter(l => !(l.actualUnitPrice > 0));
  if (tanpaHarga.length > 0) {
    masalah.push(`Harga beli belum diisi: ${tanpaHarga.map(l => namaProduk(l.productId)).join(', ')}`);
  }

  if (input.ceilings) {
    const perluAlasan = linesNeedingReason(
      input.lines.map(l => ({ ...l, isChecked: l.isChecked })),
      input.ceilings,
    );
    if (perluAlasan.length > 0) {
      const nama = perluAlasan.map(id => namaProduk(input.lines.find(l => l.id === id)?.productId || ''));
      masalah.push(`Harga di atas batas dan belum ada alasannya: ${nama.join(', ')}`);
    }
  }

  // Belanja tunai hanya bisa dibukukan lewat kantong si pembelanja. Tanpa kantong,
  // uangnya tidak pernah keluar dari kas mana pun — laporannya "berhasil" padahal
  // saldo bank tidak berkurang sepeser pun.
  const tunai = dibeli.reduce((sum, l) =>
    (l.paymentMethod !== 'Tempo' && l.paymentMethod !== 'Transfer' && l.purchaseMethod !== 'Online')
      ? sum + l.qtyPurchased * l.actualUnitPrice : sum, 0);
  if (tunai > 0 && !input.pocketBankAccountId) {
    masalah.push('Belum jelas kantong siapa yang dipotong. Pilih dulu belanja ini atas nama siapa.');
  }

  const fotoKurang = proofBlocker(input.onBehalfOfUserId || undefined, currentUserId || undefined, input.proofImage || null);
  if (fotoKurang) masalah.push(fotoKurang);

  return masalah;
}

export type ReportResult =
  | { ok: false; problems: string[] }
  | { ok: true; warnings: string[] };

/** Bukukan laporannya. Panggil reportProblems() dulu — ini tidak memeriksa ulang. */
export async function submitShoppingReport(
  getState: () => Store,
  input: ReportInput,
): Promise<ReportResult> {
  const { recordPocketPurchase, recordVendorTransferPurchase } = await import('./accounting');
  const warnings: string[] = [];
  const state = getState();

  const pm = (l: ReportLine) => l.paymentMethod || 'Cash';
  const total = (l: ReportLine) => l.qtyPurchased * l.actualUnitPrice;

  // 1. Simpan tiap baris apa adanya.
  for (const l of input.lines) {
    await getState().updatePurchaseItem(l.id, {
      isChecked: l.isChecked,
      actualUnitPrice: l.actualUnitPrice,
      qtyPurchased: l.qtyPurchased,
      vendorId: l.vendorId || undefined,
      paymentMethod: pm(l),
      notes: l.notes,
      overCeilingReason: l.overCeilingReason || '',
    });
  }

  // 2. Tutup tiap dokumen belanjanya.
  for (const purchaseId of input.purchaseIds) {
    const baris = input.lines.filter(l => l.purchaseId === purchaseId && l.isChecked);
    const doc = getState().purchases.find(p => p.id === purchaseId);
    const totalCost = baris.reduce((s, l) => s + total(l), 0);
    const cashCost = baris.reduce((s, l) => pm(l) === 'Cash' && l.purchaseMethod !== 'Online' ? s + total(l) : s, 0);
    const budget = (doc?.budgetAmount || 0) + (doc?.operationalSpareAmount || 0);

    await getState().updatePurchase(purchaseId, {
      status: 'Selesai',
      // Yang belanja di lapangan, bukan yang mengetik laporannya.
      purchaserId: resolveActor(input.onBehalfOfUserId || undefined, state.currentUser?.id),
      actualSpent: totalCost,
      changeReturned: budget > cashCost ? budget - cashCost : 0,
      reconciliationNote: input.reconciliationNote || 'Salinan kertas belanja',
      reconciliationStatus: 'Laporan Masuk',
      reconciliationProofUrl: input.proofImage || undefined,
    });

    if (input.pocketBankAccountId && cashCost > 0) {
      await recordPocketPurchase(purchaseId, input.pocketBankAccountId, cashCost, state.currentUser?.name || 'Sourcing');
    }

    // Transfer dibayar langsung finance dari BCA — tidak lewat kantong, tidak antre.
    const transferCost = baris.reduce((s, l) => pm(l) === 'Transfer' && l.purchaseMethod !== 'Online' ? s + total(l) : s, 0);
    if (transferCost > 0) {
      const bca = getState().bankAccounts.find(b => b.accountCode === '1-1200');
      if (bca) await recordVendorTransferPurchase(purchaseId, bca.id, transferCost, state.currentUser?.name || 'Sourcing');
      else warnings.push('Rekening BCA tidak ketemu — belanja transfer belum terbukukan.');
    }
  }

  // 3. Harga pasar hari ini ikut tercatat dari angka yang barusan diketik. Gagal di
  // sini tidak boleh menggagalkan laporannya: ini data pendukung, bukan uang.
  try {
    const hari = new Date().toISOString().slice(0, 10);
    for (const row of buildMarketPriceRows(input.lines, hari, 'salin-belanja')) {
      await getState().addVendorPrice({
        id: uuidv4(),
        vendorId: row.vendorId,
        productId: row.productId,
        price: row.price,
        uom: getState().products.find(p => p.id === row.productId)?.uom || 'Kg',
        validFrom: row.validFrom,
        validTo: row.validTo,
        status: row.status,
        source: row.source,
        lastUpdated: new Date().toISOString(),
      } as never);
    }
  } catch (e) {
    console.warn('[market-price] gagal mencatat harga pasar harian:', e);
    warnings.push('Harga pasar harian gagal dicatat — belanjanya tetap tersimpan.');
  }

  // 4. Pesanan yang barangnya sudah dibeli naik ke QC.
  const soIds = new Set(
    input.lines.filter(l => l.isChecked).map(l =>
      getState().purchaseItems.find(pi => pi.id === l.id)?.salesOrderId).filter(Boolean) as string[],
  );
  for (const soId of soIds) {
    await getState().updateSalesOrder(soId, { status: 'QC' });
  }

  return { ok: true, warnings };
}
