// Berapa banyak barang sebuah PO yang sudah lolos QC, dan berapa yang masih ditunggu.
//
// Layar Persiapan Pengiriman dulu hanya memuat PO yang SELURUH barangnya sudah lolos.
// Akibatnya PO yang tinggal menunggu satu barang online tidak terlihat di mana pun:
// gudang tidak bisa mulai menyiapkan yang sudah ada, dan tidak ada yang tahu tinggal
// berapa barang lagi sebelum PO itu bisa berangkat. Yang menunggu jadi tidak kelihatan,
// dan yang tidak kelihatan tidak ditagih ke siapa pun.
//
// Murni. Lihat kesiapan-po.check.ts.

export type BarisPesanan = {
  id: string;
  qty: number;
  /** Jumlah yang lolos QC dan dialokasikan ke pesanan ini. null = belum diperiksa. */
  qtyFinal?: number | null;
  /** Sudah dikirim di ronde sebelumnya. */
  qtyDelivered?: number | null;
};

/** Sisa yang masih terutang ke klien untuk baris ini. */
export function sisaTerutang(item: BarisPesanan): number {
  return Math.max(0, Number(item.qty || 0) - Number(item.qtyDelivered || 0));
}

/**
 * Baris ini sudah siap disiapkan?
 *
 * Siap = QC sudah menyentuhnya (qtyFinal terisi), atau memang tidak ada sisa yang
 * terutang. qtyFinal 0 tetap dihitung siap: itu keputusan "kosong di pasar", bukan
 * "belum diperiksa" — dan menunggunya selamanya menahan PO yang sebenarnya sudah final.
 */
export function barisSiap(item: BarisPesanan): boolean {
  if (sisaTerutang(item) <= 0) return true;
  return item.qtyFinal !== null && item.qtyFinal !== undefined;
}

export type Kesiapan = {
  total: number;
  siap: number;
  belum: number;
  /** Semua barisnya sudah diputuskan QC. */
  lengkap: boolean;
};

export function kesiapan(items: BarisPesanan[]): Kesiapan {
  const daftar = items || [];
  const siap = daftar.filter(barisSiap).length;
  return {
    total: daftar.length,
    siap,
    belum: daftar.length - siap,
    lengkap: daftar.length > 0 && siap === daftar.length,
  };
}

/** Kalimat pendek untuk ditempel di baris PO. */
export function labelKesiapan(k: Kesiapan): string {
  if (k.total === 0) return 'Tidak ada barang';
  if (k.lengkap) return `${k.siap} barang siap`;
  return `${k.siap} dari ${k.total} barang siap — ${k.belum} masih ditunggu`;
}
