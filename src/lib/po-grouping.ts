// Mengelompokkan PO menurut tanggal kirimnya.
//
// Yang menentukan satu dokumen belanja bukan "PO mana yang kebetulan dicentang", tapi
// "barang ini harus dibelanjakan untuk kiriman tanggal berapa". Daftar datar dengan
// filter satu tanggal memaksa Admin PO memfilter bolak-balik dan menghafal mana yang
// sudah masuk — dan satu PO terlewat berarti satu klien tidak kebagian barang.
//
// Murni. Lihat po-grouping.check.ts.

export type GroupableOrder = {
  id: string;
  targetDeliveryDate?: string | null;
};

export type DateGroup<T> = { tanggal: string; label: string; orders: T[] };

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** yyyy-mm-dd dari tanggal apa pun; string kosong kalau tidak terbaca. */
export function dayKey(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Senin, 25 Agu 2026" — hari ikut ditulis karena belanja itu urusan hari, bukan angka. */
export function dayLabel(key: string): string {
  if (!key) return 'Tanpa tanggal kirim';
  const [y, m, d] = key.split('-').map(Number);
  const tanggal = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(tanggal.getTime())) return key;
  return `${HARI[tanggal.getDay()]}, ${d} ${BULAN[(m || 1) - 1]} ${y}`;
}

/**
 * Kelompokkan pesanan per tanggal kirim, yang paling dekat di atas.
 *
 * Yang tidak punya tanggal kirim ditaruh paling akhir dengan nama jelas — bukan
 * disembunyikan, karena justru itu yang paling gampang terlewat.
 */
export function groupOrdersByDeliveryDate<T extends GroupableOrder>(orders: T[]): DateGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const so of orders || []) {
    const key = dayKey(so.targetDeliveryDate);
    const found = buckets.get(key);
    if (found) found.push(so);
    else buckets.set(key, [so]);
  }
  return [...buckets.entries()]
    .sort((a, b) => {
      if (!a[0]) return 1;
      if (!b[0]) return -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([tanggal, orders]) => ({ tanggal, label: dayLabel(tanggal), orders }));
}
