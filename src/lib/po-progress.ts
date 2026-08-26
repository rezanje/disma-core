// Sebuah PO sedang di tahap mana, dan apa yang menahannya.
//
// Statusnya sendiri sudah tersimpan di PO, tapi satu kata seperti "Belanja" tidak
// memberi tahu apa pun soal sisa jalannya: berapa tahap lagi, siapa yang memegangnya
// sekarang, dan apa yang ditunggu. Yang bertanya biasanya bukan orang yang mengerjakan —
// bos atau admin yang ditelepon klien — dan jawaban "statusnya Belanja" tidak menjawab
// "jadi kapan sampainya".
//
// Murni. Lihat po-progress.check.ts.

export type TahapKey =
  | 'Draft' | 'Belanja' | 'Sourcing' | 'QC' | 'Packing'
  | 'Siap Kirim' | 'Dikirim' | 'Terkirim' | 'Selesai';

export type Tahap = {
  key: TahapKey;
  label: string;
  /** Siapa yang memegang bola di tahap ini. */
  pemegang: string;
  /** Nama layar tempat tahap ini dikerjakan. */
  layar: string;
  /** Alamat layarnya. */
  href: string;
  /**
   * Kunci izin layar itu.
   *
   * Tahapnya bisa diklik HANYA kalau yang membuka memang boleh masuk ke sana. Sebagian
   * tahap dikerjakan Finance, dan tombol menuju layar yang tidak boleh dia buka cuma
   * memantulkannya balik ke dashboard — lebih membingungkan daripada tidak ada tombol.
   * Yang tidak berizin tetap membaca nama layarnya, cukup untuk tahu harus bertanya
   * ke mana, ke siapa.
   */
  izin: string;
};

/** Urutan perjalanan sebuah PO, dari disetujui sampai lunas dibukukan. */
export const TAHAPAN: Tahap[] = [
  { key: 'Draft',       label: 'Disetujui',            pemegang: 'Admin PO', layar: 'Pesanan klien',        href: '/admin/sales-orders',       izin: 'admin_sales_orders' },
  { key: 'Belanja',     label: 'Masuk daftar belanja', pemegang: 'Admin PO', layar: 'Konsolidasi pesanan',  href: '/admin/shopping-list',      izin: 'admin_shopping_list' },
  { key: 'Sourcing',    label: 'Dibelanjakan',         pemegang: 'Sourcing', layar: 'Kertas belanja',       href: '/finance/salin-belanja',    izin: 'finance_purchase_plan' },
  { key: 'QC',          label: 'Diperiksa gudang',     pemegang: 'Gudang',   layar: 'QC & Inspeksi',        href: '/warehouse/qc',             izin: 'warehouse_qc' },
  { key: 'Packing',     label: 'Disiapkan',            pemegang: 'Gudang',   layar: 'Outbound',             href: '/warehouse/outbound',       izin: 'warehouse_outbound' },
  { key: 'Siap Kirim',  label: 'Siap serah terima',    pemegang: 'Gudang',   layar: 'Serah terima',         href: '/courier/handover',         izin: 'courier_handover' },
  // Pemegangnya ditulis "siapa yang mengerjakan di aplikasi", bukan "siapa yang
  // memegang barangnya". Kurir tidak memakai aplikasi — yang mencatat barang sampai dan
  // menukar fakturnya tetap Admin PO. Menulis "Kurir" bikin orang menunggu tindakan dari
  // pihak yang tidak pernah membuka layarnya.
  { key: 'Dikirim',     label: 'Dibawa kurir',         pemegang: 'Admin PO', layar: 'Hari ini',             href: '/admin/hari-ini',           izin: 'admin_hari_ini' },
  { key: 'Terkirim',    label: 'Sampai klien',         pemegang: 'Admin PO', layar: 'Tukar faktur',         href: '/admin/tukar-faktur',       izin: 'admin_tukar_faktur' },
  { key: 'Selesai',     label: 'Selesai & ditagih',    pemegang: 'Finance',  layar: 'Invoices (AR/AP)',     href: '/finance/invoices',         izin: 'finance_invoices' },
];

export type KeadaanTahap = 'lewat' | 'sekarang' | 'belum';

export type BarisTahap = Tahap & { keadaan: KeadaanTahap };

/**
 * Status yang bukan nama tahap, beserta tahap tempatnya berdiri.
 *
 * `sandaran: null` berarti PO-nya memang belum masuk jalur (atau keluar dari jalur).
 * Sisanya tetap punya posisi: "Awaiting Audit" terjadi SETELAH barang dibawa kurir, jadi
 * menampilkannya sebagai 0% membuat PO yang barangnya sudah di jalan terbaca seperti
 * belum diapa-apakan — dan itu persis pertanyaan yang orang buka layar ini untuk jawab.
 */
export type Luar = {
  pesan: string;
  sandaran: TahapKey | null;
  /** Layar tujuan khusus status ini, kalau berbeda dari layar tahap sandarannya. */
  tujuan?: { layar: string; href: string; izin: string };
};

export const DI_LUAR_JALUR: Record<string, Luar> = {
  'Pending Approval': { pesan: 'Menunggu disetujui Admin PO', sandaran: null },
  'Batal': { pesan: 'Dibatalkan', sandaran: null },
  // Sudah dinyatakan sampai; yang tersisa memeriksa dokumennya lalu menutup pengiriman.
  'Awaiting Audit': {
    pesan: 'Sudah sampai klien — menunggu dokumennya diaudit',
    sandaran: 'Dikirim',
    tujuan: { layar: 'Audit pengiriman', href: '/admin/audit-pengiriman', izin: 'admin_sales_orders' },
  },
  'Kurang Kirim': {
    pesan: 'Terkirim sebagian — sisanya masuk antrean belanja susulan',
    sandaran: 'Terkirim',
    tujuan: { layar: 'Konsolidasi pesanan', href: '/admin/shopping-list', izin: 'admin_shopping_list' },
  },
};

/** Tahap tempat sebuah status berdiri, -1 kalau memang belum/tidak di jalur. */
function posisiTahap(status: string): number {
  const langsung = TAHAPAN.findIndex(t => t.key === status);
  if (langsung >= 0) return langsung;
  const luar = DI_LUAR_JALUR[status];
  if (luar?.sandaran) return TAHAPAN.findIndex(t => t.key === luar.sandaran);
  return -1;
}

/**
 * Perjalanan PO ini, tiap tahap ditandai sudah lewat / sedang berjalan / belum.
 *
 * Tahap yang SEDANG berjalan memakai tujuan khusus statusnya kalau ada — "Awaiting Audit"
 * berdiri di tahap "Dibawa kurir", tapi yang harus dibuka bukan layar konfirmasi sampai,
 * melainkan layar auditnya.
 */
export function perjalanan(status: string): BarisTahap[] {
  const posisi = posisiTahap(status);
  const tujuan = DI_LUAR_JALUR[status]?.tujuan;
  return TAHAPAN.map((t, i) => {
    const keadaan: KeadaanTahap =
      posisi < 0 ? 'belum' : i < posisi ? 'lewat' : i === posisi ? 'sekarang' : 'belum';
    return keadaan === 'sekarang' && tujuan ? { ...t, ...tujuan, keadaan } : { ...t, keadaan };
  });
}

/** Kalimat satu baris: sekarang di mana dan siapa yang memegangnya. */
export function ringkasan(status: string): string {
  const luar = DI_LUAR_JALUR[status];
  if (luar) return luar.pesan;
  const t = TAHAPAN.find(x => x.key === status);
  if (!t) return `Status tidak dikenal: ${status}`;
  return `${t.label} — sekarang di tangan ${t.pemegang}`;
}

/** Layar tempat PO ini sedang menunggu dikerjakan. Kosong kalau memang tidak di jalur. */
export function layarSekarang(status: string): string {
  const tujuan = DI_LUAR_JALUR[status]?.tujuan;
  if (tujuan) return tujuan.layar;
  const posisi = posisiTahap(status);
  return posisi < 0 ? '' : TAHAPAN[posisi].layar;
}

/** Berapa persen jalan. Dipakai untuk bar tipis di atas daftar tahap. */
export function persen(status: string): number {
  const posisi = posisiTahap(status);
  if (posisi < 0) return 0;
  return Math.round(((posisi + 1) / TAHAPAN.length) * 100);
}
