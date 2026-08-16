// Angka satu hari, dan selisih yang harus diberi nama sebelum harinya ditutup.
//
// Dua sakit kepala yang diminta ditutup sekaligus: tidak tahu untung harian, dan uang
// atau barang bocor. Satu layar menjawab keduanya karena keduanya jawaban dari data
// yang sama — yang membedakan hanya apakah angkanya dijumlahkan atau dibandingkan.
//
// Murni: tidak mengimpor store, React, atau tanggal sekarang. Semua yang dibutuhkan
// masuk lewat argumen supaya bisa diuji apa adanya (daily-close.check.ts).

export type LedgerLine = {
  /** Tanggal transaksi jurnalnya, format YYYY-MM-DD di zona setempat. */
  day: string;
  accountCode: string;
  debit: number;
  credit: number;
};

export type DayExpense = { day: string; amount: number; approved: boolean };

/** Satu baris tutup kantong sourcing untuk hari itu. */
export type PocketClose = { day: string; ditarik: number; belanja: number; disetor: number };

export type FixedCostConfig = {
  /** Total biaya tetap sebulan: gaji, sewa, listrik, internet. */
  monthlyTotal: number;
  /** Hari kerja sebulan, dipakai membagi biaya tetap. */
  workingDays: number;
};

export const REVENUE = '4-1000';
export const COGS = '5-1000';
export const INVENTORY = '1-3000';
export const ACCRUAL = '2-1100';

const sumOn = (lines: LedgerLine[], day: string, code: string, side: 'debit' | 'credit') =>
  (lines || [])
    .filter(l => l.day === day && l.accountCode === code)
    .reduce((s, l) => s + (side === 'debit' ? l.debit : l.credit), 0);

/** Lapis 1: omzet dikurangi harga beli barang yang dikirim hari itu. */
export function grossProfit(lines: LedgerLine[], day: string) {
  const revenue = sumOn(lines, day, REVENUE, 'credit') - sumOn(lines, day, REVENUE, 'debit');
  const cogs = sumOn(lines, day, COGS, 'debit') - sumOn(lines, day, COGS, 'credit');
  return { revenue, cogs, gross: revenue - cogs };
}

/**
 * Lapis 2: setelah biaya jalan hari itu dan jatah harian biaya tetap.
 *
 * Mengembalikan null untuk bagian biaya tetap kalau setelannya belum diisi — bukan nol.
 * Nol akan terbaca sebagai "tidak ada biaya tetap", dan itu kebohongan yang membuat
 * laba bersih terlihat lebih besar dari kenyataan.
 */
export function netProfit(
  lines: LedgerLine[],
  day: string,
  expenses: DayExpense[],
  fixed?: FixedCostConfig | null,
) {
  const { revenue, cogs, gross } = grossProfit(lines, day);
  const ops = (expenses || [])
    .filter(e => e.day === day && e.approved)
    .reduce((s, e) => s + e.amount, 0);

  const fixedDaily = fixed && fixed.workingDays > 0
    ? Math.round(fixed.monthlyTotal / fixed.workingDays)
    : null;

  return {
    revenue, cogs, gross, ops, fixedDaily,
    net: fixedDaily === null ? null : gross - ops - fixedDaily,
  };
}

export type Variance = {
  key: 'kantong' | 'belanja-vs-barang' | 'kirim-vs-tagih';
  label: string;
  amount: number;
  /** Penjelasan angkanya, supaya orang tahu apa yang sedang dibandingkan. */
  detail: string;
};

/**
 * Tiga perbandingan yang menangkap kebocoran, masing-masing dari dua sisi yang
 * seharusnya bertemu. Hanya yang selisihnya bukan nol yang dikembalikan — selisih nol
 * bukan temuan, dan menampilkannya membuat daftar ini diabaikan.
 *
 * Ambang Rp1 dipakai untuk menahan sisa pembulatan; apa pun di atas itu nyata.
 */
export function variances(
  lines: LedgerLine[],
  day: string,
  pockets: PocketClose[],
  deliveriesAudited: number,
  invoicesIssued: number,
): Variance[] {
  const out: Variance[] = [];

  // 1. Uang yang ditarik ke kantong harus habis jadi belanja atau kembali disetor.
  const p = (pockets || []).filter(x => x.day === day);
  const ditarik = p.reduce((s, x) => s + x.ditarik, 0);
  const belanja = p.reduce((s, x) => s + x.belanja, 0);
  const disetor = p.reduce((s, x) => s + x.disetor, 0);
  const kantong = ditarik - belanja - disetor;
  if (Math.abs(kantong) > 1) {
    out.push({
      key: 'kantong',
      label: kantong > 0 ? 'Uang kantong belum kembali' : 'Setoran lebih besar dari yang ditarik',
      amount: Math.abs(kantong),
      detail: `Ditarik ${ditarik} − belanja ${belanja} − disetor ${disetor}`,
    });
  }

  // 2. Uang yang keluar untuk barang harus berujung jadi barang di persediaan.
  //    Selisihnya = barang dibayar tapi tidak sampai, atau sebaliknya.
  const barangMasuk = sumOn(lines, day, INVENTORY, 'debit');
  const uangBarang = sumOn(lines, day, ACCRUAL, 'debit');
  const beda = uangBarang - barangMasuk;
  if (Math.abs(beda) > 1) {
    out.push({
      key: 'belanja-vs-barang',
      label: beda > 0 ? 'Dibayar tapi barang belum masuk' : 'Barang masuk tanpa pembayaran tercatat',
      amount: Math.abs(beda),
      detail: `Uang untuk barang ${uangBarang} vs nilai barang masuk ${barangMasuk}`,
    });
  }

  // 3. Setiap pengiriman yang diaudit harus melahirkan satu tagihan.
  if (deliveriesAudited !== invoicesIssued) {
    out.push({
      key: 'kirim-vs-tagih',
      label: deliveriesAudited > invoicesIssued ? 'Ada kiriman yang belum ditagih' : 'Ada tagihan tanpa kiriman',
      amount: Math.abs(deliveriesAudited - invoicesIssued),
      detail: `${deliveriesAudited} pengiriman diaudit vs ${invoicesIssued} invoice terbit`,
    });
  }

  return out;
}

/**
 * Hari boleh ditutup kalau setiap selisih sudah diberi nama. Nama kosong atau hanya
 * spasi tidak dihitung — "-" atau " " adalah cara tercepat melewati pemeriksaan tanpa
 * menjelaskan apa pun.
 */
export function canClose(vs: Variance[], reasons: Record<string, string>): boolean {
  return (vs || []).every(v => (reasons?.[v.key] || '').trim().length >= 3);
}
