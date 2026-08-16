// Credit note: koreksi resmi atas invoice yang sudah diposting.
//
// Playbook §2.2 #13 melarang menghapus transaksi final — koreksi dilakukan lewat
// adjustment atau credit note. Sebelum ini tidak ada satu pun jalannya: invoice yang
// sudah terbit hanya bisa dibetulkan dengan mengubah angkanya, tanpa jejak alasan.
//
// Nilai invoice ikut turun, dan credit note-nya yang menyimpan riwayat: nilai asal,
// berapa yang dikoreksi, alasannya, siapa, kapan. Menyimpan pengurangnya di kolom
// terpisah akan lebih murni, tapi piutang dihitung dengan rumus
// `totalAmount − amountPaid` di 34 tempat — satu saja terlewat dan angka piutang di
// layar itu salah diam-diam. Riwayatnya tetap utuh lewat credit note + Activity Log.
//
// Murni: tidak mengimpor store atau React. Lihat credit-note.check.ts.

export type CreditableInvoice = {
  id: string;
  totalAmount: number;
  amountPaid?: number | null;
  status?: string | null;
};

/** Sisa tagihan yang masih bisa dikoreksi. Yang sudah dibayar tidak bisa dihapus begitu saja. */
export function creditLimit(inv: CreditableInvoice): number {
  return Math.max(0, Number(inv.totalAmount || 0) - Number(inv.amountPaid || 0));
}

/**
 * Alasan penolakan, atau null kalau boleh jalan.
 *
 * Alasan wajib dan tidak boleh sekadar tanda hubung: credit note tanpa sebab adalah
 * persis "mengubah angka tanpa jejak" yang mau dihindari.
 */
export function validateCreditNote(
  inv: CreditableInvoice | null | undefined,
  amount: number,
  reason: string,
): string | null {
  if (!inv) return 'Invoice tidak ditemukan.';
  if (!(amount > 0)) return 'Nilai koreksi harus lebih dari nol.';
  const limit = creditLimit(inv);
  if (limit <= 0) return 'Invoice ini sudah lunas — tidak ada sisa tagihan yang bisa dikoreksi.';
  if (amount > limit) return `Nilai koreksi melebihi sisa tagihan (${limit}).`;
  if ((reason || '').trim().length < 5) return 'Tulis alasan koreksinya (minimal 5 huruf).';
  return null;
}

export type CreditedInvoiceStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Cancelled';

/** Nilai invoice setelah dikoreksi, beserta statusnya. */
export function applyCreditNote(
  inv: CreditableInvoice,
  amount: number,
): { totalAmount: number; status: CreditedInvoiceStatus } {
  const newTotal = Number(inv.totalAmount || 0) - amount;
  const paid = Number(inv.amountPaid || 0);
  // Koreksi bisa membuat yang sudah dibayar menutup seluruh sisa tagihan.
  const status: CreditedInvoiceStatus =
    paid >= newTotal ? (newTotal <= 0 ? 'Cancelled' : 'Paid') : paid > 0 ? 'Partial' : 'Unpaid';
  return { totalAmount: newTotal, status };
}

/** CN-YYYYMM-NNN, urut per bulan. */
export function buildCreditNoteNumber(day: Date, existingNumbers: string[]): string {
  const prefix = `CN-${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}`;
  const used = (existingNumbers || [])
    .filter(n => typeof n === 'string' && n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length + 1), 10))
    .filter(n => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}
