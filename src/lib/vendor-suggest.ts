// Vendor mana yang biasanya dipakai untuk sebuah barang.
//
// Finance memilih vendor untuk puluhan baris tiap dokumen, dan untuk sebagian besar
// barang jawabannya sama terus — beli ke tempat yang sama minggu lalu. Menyuruh orang
// mengulang jawaban yang sudah pernah dia beri adalah cara paling murah membuat orang
// berhenti membaca layarnya.
//
// Murni. Lihat vendor-suggest.check.ts.

export type PastLine = {
  productId: string;
  vendorId?: string | null;
  /** Kapan belanjanya — dipakai mencari yang paling akhir. */
  date?: string | null;
};

export type ProductVendor = { id: string; defaultVendorId?: string | null };

/**
 * Urutan pertimbangan: vendor terakhir yang BENAR-BENAR dipakai untuk barang itu,
 * lalu vendor bawaan di data produk. Riwayat menang atas data master karena data
 * master jarang diperbarui, sedangkan riwayat menulis dirinya sendiri tiap belanja.
 */
export function suggestVendor(
  productId: string,
  history: PastLine[],
  products: ProductVendor[],
): string | undefined {
  let bestId: string | undefined;
  let bestDate = '';
  for (const line of history || []) {
    if (line.productId !== productId) continue;
    if (!line.vendorId) continue;
    const d = line.date || '';
    // Tanpa tanggal tetap dipakai kalau belum ada kandidat, tapi kalah dari yang bertanggal.
    if (!bestId || d > bestDate) {
      bestId = line.vendorId;
      bestDate = d;
    }
  }
  if (bestId) return bestId;

  const product = (products || []).find(p => p.id === productId);
  return product?.defaultVendorId || undefined;
}

export type FillableLine = {
  id: string;
  productId: string;
  plannedVendorId?: string | null;
  purchaseMethod?: string | null;
  paymentMethod?: string | null;
};

/**
 * Baris mana yang boleh diisikan saran, beserta vendornya.
 *
 * Syaratnya cuma satu: kolom vendornya masih kosong. Mengisi kolom kosong tidak
 * pernah menghapus keputusan siapa pun — dan keputusan lain di baris yang sama
 * (jalur beli, cara bayar, harga) tidak disentuh sama sekali.
 */
export function vendorPrefills(
  lines: FillableLine[],
  history: PastLine[],
  products: ProductVendor[],
): Array<{ id: string; vendorId: string }> {
  const out: Array<{ id: string; vendorId: string }> = [];
  for (const line of lines || []) {
    if (line.plannedVendorId) continue;
    const vendorId = suggestVendor(line.productId, history, products);
    if (vendorId) out.push({ id: line.id, vendorId });
  }
  return out;
}
