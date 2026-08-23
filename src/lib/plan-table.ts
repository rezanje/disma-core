// Urutan dan pengelompokan baris di layar Rencana Pembelian.
//
// Satu dokumen belanja bisa berisi puluhan barang dari beberapa PO. Menyetel
// vendor satu per satu untuk barang yang jelas-jelas dibeli di tempat yang sama
// adalah pekerjaan menyalin, bukan memutuskan — jadi barisnya perlu bisa
// diurutkan, dikelompokkan, dan dipilih beramai-ramai.
//
// Murni. Lihat plan-table.check.ts.

export type PlanRow = {
  id: string;
  productId: string;
  salesOrderId?: string | null;
  qtyTarget?: number | null;
  estimatedUnitPrice?: number | null;
  purchaseMethod?: string | null;
  paymentMethod?: string | null;
  plannedVendorId?: string | null;
};

export type SortKey = 'nama' | 'qty' | 'harga' | 'nilai';
export type GroupKey = 'none' | 'vendor' | 'po' | 'bayar' | 'jalur';

/** Nilai baris = qty × harga perkiraan. Itu yang menentukan besar kecilnya taruhan. */
export function rowValue(row: PlanRow): number {
  return Number(row.qtyTarget || 0) * Number(row.estimatedUnitPrice || 0);
}

/**
 * Urutkan baris. `nameOf` dipisah supaya fungsi ini tidak perlu tahu apa-apa soal
 * produk — pemanggilnya yang punya daftarnya.
 */
export function sortRows<T extends PlanRow>(
  rows: T[],
  key: SortKey,
  nameOf: (row: T) => string,
): T[] {
  const out = [...(rows || [])];
  switch (key) {
    case 'qty':
      return out.sort((a, b) => Number(b.qtyTarget || 0) - Number(a.qtyTarget || 0));
    case 'harga':
      return out.sort((a, b) => Number(b.estimatedUnitPrice || 0) - Number(a.estimatedUnitPrice || 0));
    case 'nilai':
      return out.sort((a, b) => rowValue(b) - rowValue(a));
    case 'nama':
    default:
      return out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }
}

export type Group<T> = { key: string; label: string; rows: T[] };

/**
 * Kelompokkan baris. Yang belum diputuskan selalu jatuh ke satu kelompok bernama
 * jelas — bukan ke kelompok kosong tanpa nama, karena justru baris itulah yang
 * masih menunggu keputusan.
 */
export function groupRows<T extends PlanRow>(
  rows: T[],
  key: GroupKey,
  labels: {
    vendorName: (id?: string | null) => string;
    poName: (id?: string | null) => string;
  },
): Group<T>[] {
  if (key === 'none') return [{ key: 'all', label: '', rows: [...(rows || [])] }];

  const buckets = new Map<string, Group<T>>();
  for (const row of rows || []) {
    let k: string;
    let label: string;
    if (key === 'vendor') {
      k = row.plannedVendorId || '_';
      label = row.plannedVendorId ? labels.vendorName(row.plannedVendorId) : 'Vendor belum dipilih';
    } else if (key === 'po') {
      k = row.salesOrderId || '_';
      label = row.salesOrderId ? labels.poName(row.salesOrderId) : 'Tanpa PO';
    } else if (key === 'bayar') {
      k = row.paymentMethod || '_';
      label = row.paymentMethod || 'Cara bayar belum dipilih';
    } else {
      k = row.purchaseMethod || '_';
      label = row.purchaseMethod || 'Jalur beli belum dipilih';
    }
    const found = buckets.get(k);
    if (found) found.rows.push(row);
    else buckets.set(k, { key: k, label, rows: [row] });
  }

  // Kelompok "belum dipilih" ditaruh paling atas: itu sisa pekerjaannya.
  return [...buckets.values()].sort((a, b) => {
    if (a.key === '_') return -1;
    if (b.key === '_') return 1;
    return a.label.localeCompare(b.label);
  });
}

/** Centang semua / kosongkan, dihitung dari apa yang sedang terlihat. */
export function toggleAll(visibleIds: string[], selected: Set<string>): Set<string> {
  const semua = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const next = new Set(selected);
  if (semua) visibleIds.forEach(id => next.delete(id));
  else visibleIds.forEach(id => next.add(id));
  return next;
}
