// Uang satu kali belanja, dari rencana sampai kantong.
//
// Satu dokumen, satu angka. Sebelum ini rencananya hidup di dokumen belanja,
// pengajuannya di purchase_requests, pencairannya di disbursement_requests, dan
// tidak ada yang membandingkan ketiganya — pengajuan Rp0 lolos berminggu-minggu.
//
// Murni. Lihat shopping-money.check.ts.

export type MoneyStage = 'menunggu-rencana' | 'siap-cair' | 'sudah-cair';

export type ShoppingDoc = {
  status: string;
  budgetAmount?: number | null;
  disbursedAmount?: number | null;
  disbursedAt?: string | null;
};

/** Di mana uang dokumen ini berada sekarang. */
export function moneyStage(doc: ShoppingDoc): MoneyStage {
  if (doc.status === 'Menunggu Rencana') return 'menunggu-rencana';
  if (doc.disbursedAt) return 'sudah-cair';
  return 'siap-cair';
}

/**
 * Kenapa pencairan ini belum boleh jalan. null berarti boleh.
 *
 * Beda dari rencana tidak pernah dilarang — harga pasar bergerak dan kadang uangnya
 * memang perlu dilebihkan. Yang dipaksa cuma alasannya ditulis, supaya selisihnya
 * bisa ditanyakan nanti dan bukan cuma jadi angka yang berubah sendiri.
 */
export function disbursementProblem(
  amount: number,
  planned: number,
  note: string | undefined | null,
  pocketBankAccountId?: string | null,
  sourceBankAccountId?: string | null,
): string | null {
  if (!(amount > 0)) return 'Nominalnya belum diisi.';
  if (!pocketBankAccountId) return 'Pilih dulu kantong siapa yang diisi.';
  if (!sourceBankAccountId) return 'Pilih dulu uangnya diambil dari rekening mana.';
  if (pocketBankAccountId === sourceBankAccountId) return 'Rekening asal dan kantong tujuan tidak boleh sama.';
  if (amount !== planned && !String(note || '').trim()) {
    const arah = amount > planned ? 'lebih' : 'kurang';
    return `Nominalnya ${arah} dari rencana. Tulis dulu alasannya.`;
  }
  return null;
}

/** Selisih pencairan terhadap rencana. Positif berarti dilebihkan. */
export function disbursementGap(doc: ShoppingDoc): number {
  if (!doc.disbursedAt) return 0;
  return Number(doc.disbursedAmount || 0) - Number(doc.budgetAmount || 0);
}
