// Laporan hasil belanja: satu-satunya tempat kertas dari pasar dibukukan.
//
// Isinya diangkat dari layar sourcing supaya layar penyalinan yang baru memakai alur
// yang sama persis. Kalau disalin, dua layar yang membukukan uang akan pelan-pelan
// berbeda — dan aplikasi ini sudah dua kali membayar mahal untuk pola itu.
//
// Bukan fungsi murni: menulis kantong, jurnal, harga pasar, dan status pesanan.
// Pemeriksaannya dipisah ke reportProblems() supaya bisa diuji tanpa database.

import { purchasingQuantity } from './purchase-plan';
import { executePurchaseCommand } from './purchase-command';
import { linesNeedingReason } from './price-ceiling';
import type { OperationalExpense } from '../types';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

/** Convert the amount paid for the whole row to the stored per-unit price. */
export function purchaseUnitPrice(total: number, quantity: number): number {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(quantity) || quantity <= 0) return 0;
  const price = total / quantity;
  return Number.isFinite(price) ? price : 0;
}

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
  /** Stable ID retained while retrying this paper transaction. */
  eventId?: string;
  transferBankAccountId?: string | null;
  occurredAt?: string;
  lines: ReportLine[];
  expenses?: OperationalExpense[];
  /** Sumber kas yang dipotong. Wajib ada kalau ada belanja tunai. */
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
  if (input.lines.some(l => !Number.isFinite(l.qtyPurchased) || l.qtyPurchased < 0 || (l.isChecked && l.qtyPurchased <= 0))) masalah.push('Jumlah qty beli harus valid dan lebih dari nol untuk barang dibeli.');
  if (dibeli.some(l => !Number.isFinite(l.actualUnitPrice))) masalah.push('Harga beli harus angka yang valid.');

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

  // Belanja tunai harus punya sumber kas yang jelas. Tanpa sumber kas,
  // uangnya tidak pernah keluar dari kas mana pun — laporannya "berhasil" padahal
  // saldo bank tidak berkurang sepeser pun.
  const tunai = dibeli.reduce((sum, l) =>
    (l.paymentMethod !== 'Tempo' && l.paymentMethod !== 'Transfer' && l.purchaseMethod !== 'Online')
      ? sum + l.qtyPurchased * l.actualUnitPrice : sum, 0);
  if (tunai > 0 && !input.pocketBankAccountId) {
    masalah.push('Sumber kas belanja belum dipilih. Pilih kas atau rekening yang dipakai.');
  }

  // Foto kertasnya tidak diwajibkan. Sempat dipaksa waktu penyalinan masih dianggap
  // rawan, tapi di praktiknya kertas itu tetap disimpan fisik dan pemaksaan di sini
  // cuma menahan laporan yang angkanya sudah benar. Kolomnya tetap ada kalau mau
  // dilampirkan.
  return masalah;
}

export type ReportResult =
  | { ok: false; problems: string[] }
  | { ok: true; warnings: string[] };

/** Validate and book one selected paper transaction; remaining demand stays open. */
export async function submitShoppingReport(
  getState: () => Store,
  input: ReportInput,
): Promise<ReportResult> {
  const state = getState();
  const problems = reportProblems(input, id=>state.products.find(p=>p.id===id)?.name || id,state.currentUser?.id);
  if (!input.eventId) problems.push('ID transaksi kertas belum tersedia.');
  if (problems.length) return {ok:false,problems};
  await executePurchaseCommand(getState, {eventId:input.eventId!,stage:'report',sourceId:input.eventId!,payload:{...input,ceilings:undefined}});
  return {ok:true,warnings:[]};
}

/** One paper transaction, allocated once in printed document/PO order. */
export function allocateMergedActuals(rows: Array<{ id: string; qtyTarget: number }>, quantity: number, total: number): Array<{ id: string; qtyPurchased: number; actualUnitPrice: number }> {
  const capacity = purchasingQuantity(rows.reduce((s, r) => s + r.qtyTarget, 0));
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > capacity || !Number.isFinite(total) || total < 0 || (quantity === 0 && total !== 0)) throw new Error('Qty/total gabungan tidak valid atau melebihi kebutuhan.');
  let remainder = quantity;
  return rows.map(r => {
    const qtyPurchased = Math.min(remainder, r.qtyTarget);
    remainder = purchasingQuantity(remainder - qtyPurchased);
    return { id: r.id, qtyPurchased, actualUnitPrice: purchaseUnitPrice(total, quantity) };
  });
}
