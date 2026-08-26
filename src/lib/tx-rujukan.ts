// Transaksi kas menunjuk ke dokumen apa, dan bagaimana membukanya.
//
// Daftar mutasi kas menuliskan rujukannya sebagai id mentah — "Payment Invoice - Ref:
// 7a38c8c1-c560-...". Untuk orang yang sedang mencocokkan mutasi bank, angka itu tidak
// berarti apa-apa: dia tahu nomor PO dan nomor faktur, bukan id acak. Dan untuk membuka
// dokumennya dia harus pindah layar lalu mencari sendiri.
//
// Murni. Lihat tx-rujukan.check.ts.

export type Rujukan = {
  referenceType?: string | null;
  referenceId?: string | null;
  description: string;
};

export type Kamus = {
  invoices: Array<{ id: string; salesOrderId?: string | null }>;
  salesOrders: Array<{ id: string; poNumber: string }>;
  purchases: Array<{ id: string; advanceCode?: string | null }>;
};

export type Tujuan = {
  /** Teks yang dibaca orang, menggantikan id mentah. */
  label: string;
  /** Alamat layar yang membuka dokumennya. Kosong = tidak ada yang bisa dibuka. */
  href: string;
};

/** Buang ekor "- Ref: <id>" dari deskripsi; id-nya tidak pernah berguna dibaca. */
export function tanpaRef(description: string): string {
  return String(description || '').replace(/\s*-\s*Ref:\s*\S+\s*$/i, '').trim();
}

/**
 * Ke mana transaksi ini menunjuk.
 *
 * Faktur ditelusuri sampai nomor PO-nya, karena itu yang dipakai orang saat menagih —
 * nomor faktur internal tidak pernah disebut klien di bukti transfernya.
 */
export function tujuanTransaksi(tx: Rujukan, kamus: Kamus): Tujuan | null {
  // Baris lama menyimpan rujukannya di dalam teks deskripsi ("... - Ref: <id>") dan
  // membiarkan kolomnya kosong. Dibaca dari sana juga supaya mutasi yang sudah terlanjur
  // tercatat ikut bisa dibuka, bukan cuma yang dicatat sesudah perbaikan ini.
  const dariTeks = /-\s*Ref:\s*(\S+)\s*$/i.exec(tx.description || '')?.[1];
  const id = tx.referenceId || dariTeks;
  if (!id) return null;

  const tipe = tx.referenceType
    ? String(tx.referenceType)
    : /invoice|faktur/i.test(tx.description || '') ? 'Invoice' : '';

  if (tipe === 'Invoice') {
    const inv = kamus.invoices.find(i => i.id === id);
    if (!inv) return null;
    const po = kamus.salesOrders.find(s => s.id === inv.salesOrderId)?.poNumber;
    return { label: po ? `Faktur PO ${po}` : 'Faktur', href: `/finance/invoices?detailId=${id}` };
  }

  if (tipe === 'Purchase') {
    const p = kamus.purchases.find(x => x.id === id);
    if (!p) return null;
    return { label: `Belanja ${p.advanceCode || id.slice(0, 8)}`, href: '/admin/konsolidasi-belanja' };
  }

  if (tipe === 'Expense') {
    return { label: 'Biaya operasional', href: '/finance/expenses' };
  }

  if (tipe === 'Reimbursement') {
    return { label: 'Talangan karyawan', href: '/finance/reimbursements' };
  }

  return null;
}
