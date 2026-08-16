// Retur klien yang bisa dikejar: bernomor, ada pemiliknya, ada tenggatnya.
//
// Sebelumnya barisnya hanya menyimpan barang, qty, dan alasan. Tidak ada nomor untuk
// dirujuk, tidak ada nama yang bertanggung jawab, dan tidak ada tanggal yang bisa
// lewat — jadi tidak ada yang mengejarnya. Persis kelemahan yang sama dengan klaim
// retur ke vendor sebelum akun piutangnya dibuat.
//
// Murni: tidak mengimpor store atau React. Lihat delivery-issue.check.ts.

export type IssueRow = {
  id: string;
  status?: string | null;
  dueDate?: string | null;   // YYYY-MM-DD
  ownerUserId?: string | null;
};

/** DI-YYMMDD-NNN, urut per hari. */
export function buildIssueNumber(day: Date, existingNumbers: string[]): string {
  const prefix = `DI-${String(day.getFullYear()).slice(2)}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  const used = (existingNumbers || [])
    .filter(n => typeof n === 'string' && n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length + 1), 10))
    .filter(n => Number.isFinite(n));
  return `${prefix}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

/**
 * Tenggat standar: barang segar yang ditolak tidak bisa digantung berhari-hari — kalau
 * belum diputuskan dalam dua hari, barangnya sudah tidak layak apa pun.
 */
export function defaultDueDate(from: Date, days = 2): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const OPEN = (r: IssueRow) => r.status !== 'Processed' && r.status !== 'Selesai';

// Generik supaya baris aslinya kembali utuh — pemanggil masih butuh nomor, barang dan
// qty-nya untuk ditampilkan, dan menyempitkannya ke IssueRow membuang semua itu.
/** Retur yang masih terbuka dan tenggatnya sudah lewat. */
export function overdueIssues<T extends IssueRow>(rows: T[], today: string): T[] {
  return (rows || []).filter(r => OPEN(r) && !!r.dueDate && (r.dueDate as string) < today);
}

/** Retur terbuka yang belum punya pemilik — tidak ada yang merasa bertanggung jawab. */
export function unownedIssues<T extends IssueRow>(rows: T[]): T[] {
  return (rows || []).filter(r => OPEN(r) && !r.ownerUserId);
}
