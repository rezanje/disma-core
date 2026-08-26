// Menyusun baris lembar kerja lapangan dari data aplikasi.
//
// Dipisah dari pembuat PDF-nya supaya isinya bisa diuji tanpa jsPDF: yang penting bukan
// gambarnya, tapi apakah kolom tercetak jumlah dan urutannya cocok dengan kertas yang
// dipegang orang di gudang jam tiga pagi. Kalau meleset satu kolom, seluruh kertas
// terbaca salah dan tidak ada yang tahu sampai stok berantakan.
//
// Murni. Lihat worksheet-rows.check.ts.

import { worksheetColumns, type WorksheetKind } from './worksheet-columns';

export type BarisLembar = { cells: string[]; group?: string };

/** Berapa kolom tercetak yang harus diisi untuk satu jenis lembar. */
export function jumlahKolomTercetak(kind: WorksheetKind): number {
  return worksheetColumns(kind).filter(c => !c.handwritten).length;
}

/**
 * Semua baris punya jumlah sel yang benar? Kosong berarti aman.
 *
 * Dipakai sebagai jaring saat menambah jenis lembar baru — bukan validasi saat cetak.
 */
export function barisBermasalah(kind: WorksheetKind, rows: BarisLembar[]): number[] {
  const perlu = jumlahKolomTercetak(kind);
  return (rows || [])
    .map((r, i) => (r.cells.length === perlu ? -1 : i))
    .filter(i => i >= 0);
}

/** Angka + satuan, atau garis kalau kosong. Dipakai supaya kertas tidak menampilkan "undefined". */
export function qty(n?: number | null, uom?: string | null): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return uom ? `${n} ${uom}` : String(n);
}
