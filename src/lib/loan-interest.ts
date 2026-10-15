import { formatRupiah } from './utils';

export type LoanInterestTerms = {
  mode: 'percent' | 'amount';
  period: 'monthly' | 'total';
  value: number;
  months: number;
};

/** Flat interest on the original principal; the receipt only records agreed terms. */
export function calculateLoanInterest(principal: number, terms: LoanInterestTerms) {
  if (!Number.isFinite(principal) || principal <= 0) throw new Error('Isi pokok pinjaman lebih dari nol.');
  if (!['percent', 'amount'].includes(terms.mode) || !['monthly', 'total'].includes(terms.period)) {
    throw new Error('Pilih cara dan periode bunga.');
  }
  if (!Number.isFinite(terms.value) || terms.value < 0) throw new Error('Isi bunga nol atau lebih.');
  if (terms.period === 'monthly' && (!Number.isSafeInteger(terms.months) || terms.months <= 0)) {
    throw new Error('Isi lama pinjaman dalam bulan penuh.');
  }
  const periodInterest = Math.round(terms.mode === 'percent' ? principal * terms.value / 100 : terms.value);
  const totalInterest = periodInterest * (terms.period === 'monthly' ? terms.months : 1);
  const totalRepayment = principal + totalInterest;
  if (!Number.isSafeInteger(totalRepayment)) throw new Error('Nominal pinjaman atau bunga terlalu besar.');
  return { periodInterest, totalInterest, totalRepayment };
}

/** Persist readable terms in the existing transaction description, including its input basis. */
export function describeLoanInterest(principal: number, terms: LoanInterestTerms) {
  const result = calculateLoanInterest(principal, terms);
  const value = terms.mode === 'percent' ? `${terms.value.toLocaleString('id-ID')}% dari pokok awal` : formatRupiah(terms.value);
  const period = terms.period === 'monthly' ? `per bulan × ${terms.months} bulan` : 'total selama pinjaman';
  return `Ketentuan pinjaman: pokok ${formatRupiah(principal)}; bunga ${value} ${period}; total bunga ${formatRupiah(result.totalInterest)}; total pengembalian ${formatRupiah(result.totalRepayment)}.`;
}

export function loanPaymentDebits(total: number, principal: number) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(principal) || principal < 0 || principal > total) {
    throw new Error('Bagian pokok harus antara nol dan total pembayaran.');
  }
  return [
    ...(principal > 0 ? [{ accountCode: '2-4000', amount: principal }] : []),
    ...(total > principal ? [{ accountCode: '6-3000', amount: total - principal }] : []),
  ];
}
