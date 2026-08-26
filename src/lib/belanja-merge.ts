// Menggabungkan baris belanja dari beberapa dokumen jadi satu daftar.
//
// Tiap dokumen belanja lahir dari sekumpulan PO, dan tiga dokumen untuk hari kirim yang
// sama gampang memuat barang yang sama. Dicetak apa adanya, orang pasar bolak-balik ke
// lapak yang sama untuk barang yang sama — dan tiap perjalanan itu waktu di pasar subuh
// yang tidak bisa diganti.
//
// Yang boleh disatukan cuma baris yang benar-benar satu perjalanan: barang sama, vendor
// sama, jalur beli sama, cara bayar sama. Beda cara bayar tidak boleh dijumlah — yang
// tunai perlu uang dibawa, yang tempo tidak, dan menyatukannya bikin uang yang disiapkan
// salah.
//
// Murni. Lihat belanja-merge.check.ts.

export type BarisBelanja = {
  /** Dokumen asal — dipertahankan supaya bisa ditelusuri balik. */
  purchaseId: string;
  productId: string;
  productName: string;
  skuCode: string;
  uom?: string;
  totalQty: number;
  estimatedPrice: number;
  purchaseMethod?: string;
  paymentMethod?: string;
  vendorId?: string | null;
  vendorName?: string;
};

export type BarisGabungan = BarisBelanja & {
  /** Dokumen-dokumen yang menyumbang baris ini. */
  dariDokumen: string[];
};

function kunci(r: BarisBelanja): string {
  return [
    r.productId,
    r.vendorId || '',
    r.purchaseMethod || 'Pasar',
    r.paymentMethod || 'Cash',
  ].join('|');
}

/**
 * Satukan baris yang satu perjalanan. Urut per vendor lalu nama barang.
 *
 * Harga patokan diambil yang TERTINGGI di antara yang digabung. Kalau dua dokumen
 * menaksir beda, memakai yang lebih rendah bikin uang yang dibawa kurang dan orangnya
 * berdiri di pasar dengan uang tidak cukup — kelebihan uang bisa dikembalikan, kekurangan
 * tidak bisa dikejar.
 */
export function gabungBaris(rows: BarisBelanja[]): BarisGabungan[] {
  const map = new Map<string, BarisGabungan>();
  for (const r of rows || []) {
    const k = kunci(r);
    const ada = map.get(k);
    if (!ada) {
      map.set(k, { ...r, totalQty: Number(r.totalQty || 0), dariDokumen: [r.purchaseId] });
      continue;
    }
    ada.totalQty += Number(r.totalQty || 0);
    ada.estimatedPrice = Math.max(Number(ada.estimatedPrice || 0), Number(r.estimatedPrice || 0));
    if (!ada.dariDokumen.includes(r.purchaseId)) ada.dariDokumen.push(r.purchaseId);
  }
  return [...map.values()].sort((a, b) => {
    const va = a.vendorName || '';
    const vb = b.vendorName || '';
    // Tanpa vendor ditaruh terakhir: itu belanja pasar umum, dikerjakan setelah
    // lapak-lapak yang sudah punya nama didatangi.
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    if (va !== vb) return va.localeCompare(vb);
    return (a.productName || '').localeCompare(b.productName || '');
  });
}

/**
 * Uang tunai yang benar-benar perlu dibawa. Tempo ditagih belakangan, Transfer dibayar
 * kantor, dan barang online tidak dibeli di pasar sama sekali.
 */
export function tunaiDibutuhkan(rows: Array<Pick<BarisBelanja, 'totalQty' | 'estimatedPrice' | 'purchaseMethod' | 'paymentMethod'>>): number {
  return (rows || []).reduce((sum, r) => {
    if ((r.paymentMethod || 'Cash') !== 'Cash') return sum;
    if (r.purchaseMethod === 'Online' || r.purchaseMethod === 'Dropship') return sum;
    return sum + Number(r.totalQty || 0) * Number(r.estimatedPrice || 0);
  }, 0);
}
