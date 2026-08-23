// Catatan perubahan pada dokumen belanja yang sudah sampai ke Finance.
//
// Admin PO boleh membetulkan salah ketik setelah dokumennya dikirim — pesanan klien
// memang berubah, dan melarangnya cuma memindahkan koreksinya ke WhatsApp. Yang tidak
// boleh adalah Finance merencanakan angka lama tanpa tahu angkanya sudah berganti.
//
// Murni. Lihat revision-note.check.ts.

export type Revision = { produk: string; dari: number; jadi: number; satuan?: string };

/** Satu baris perubahan, dibaca orang: "Temukunci 5 → 8 Kg". */
export function revisionLine(r: Revision): string {
  const uom = r.satuan ? ` ${r.satuan}` : '';
  return `${r.produk} ${r.dari} → ${r.jadi}${uom}`;
}

/** Batas jumlah baris yang disimpan. Lebih dari ini tidak dibaca siapa pun. */
export const MAX_REVISI = 12;

/**
 * Tambahkan perubahan baru ke catatan yang sudah ada, terbaru di atas.
 *
 * Catatan lama tidak dihapus: Finance perlu tahu dokumen ini sudah berubah dua kali,
 * bukan cuma yang terakhir. Yang paling tua dipotong kalau sudah kepanjangan, dengan
 * keterangan bahwa ada yang dipotong — hilang diam-diam lebih buruk daripada tidak ada.
 */
export function appendRevisions(existing: string | null | undefined, baru: Revision[]): string {
  const barisBaru = (baru || []).map(revisionLine);
  if (barisBaru.length === 0) return String(existing || '');

  const lama = String(existing || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith('…'));

  const semua = [...barisBaru, ...lama];
  if (semua.length <= MAX_REVISI) return semua.join('\n');
  return [...semua.slice(0, MAX_REVISI), `…${semua.length - MAX_REVISI} perubahan lama tidak ditampilkan`].join('\n');
}

/** Ringkasan satu kalimat buat notifikasi. */
export function revisionSummary(kode: string, baru: Revision[]): string {
  if (baru.length === 1) return `${kode}: ${revisionLine(baru[0])}`;
  return `${kode}: ${baru.length} barang berubah qty-nya`;
}
