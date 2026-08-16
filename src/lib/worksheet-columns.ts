// Column layout for the printed field worksheets.
//
// Kept as data rather than inlined in the PDF builder so the order can be asserted:
// the whole point is that the paper's column order matches the transcription screen's.
// When they drift, copying stops being copying and becomes interpreting, and typos
// become routine.
//
// `width` is millimetres on the printed sheet. The handwriting columns are the wide
// ones — they are filled with a pen at a market stall, not typed.

export type WorksheetKind = 'belanja' | 'qc' | 'serah-terima';

export type WorksheetColumn = { header: string; handwritten: boolean; width: number };

const COLUMNS: Record<WorksheetKind, WorksheetColumn[]> = {
  belanja: [
    { header: 'SKU', handwritten: false, width: 20 },
    { header: 'Nama Barang', handwritten: false, width: 58 },
    { header: 'Qty Beli', handwritten: false, width: 22 },
    { header: 'Harga Patokan', handwritten: false, width: 28 },
    { header: 'Harga Beli Asli', handwritten: true, width: 32 },
    { header: 'Qty Asli', handwritten: true, width: 22 },
    { header: 'Vendor', handwritten: true, width: 38 },
    { header: 'Catatan', handwritten: true, width: 45 },
  ],
  qc: [
    { header: 'SKU', handwritten: false, width: 22 },
    { header: 'Nama Barang', handwritten: false, width: 70 },
    { header: 'Qty Datang', handwritten: false, width: 26 },
    { header: 'Qty Lolos', handwritten: true, width: 26 },
    { header: 'Qty Reject', handwritten: true, width: 26 },
    { header: 'Alasan', handwritten: true, width: 50 },
    { header: 'Tujuan Reject', handwritten: true, width: 44 },
  ],
  'serah-terima': [
    { header: 'PO', handwritten: false, width: 30 },
    { header: 'Nama Barang', handwritten: false, width: 70 },
    { header: 'Qty Kirim', handwritten: false, width: 26 },
    { header: 'Qty Diterima', handwritten: true, width: 32 },
    { header: 'Qty Ditolak', handwritten: true, width: 30 },
    { header: 'Alasan', handwritten: true, width: 60 },
  ],
};

export function worksheetColumns(kind: WorksheetKind): WorksheetColumn[] {
  return COLUMNS[kind];
}

/** Left edge of each column, in millimetres, starting from `startX`. */
export function columnOffsets(cols: WorksheetColumn[], startX: number): number[] {
  const out: number[] = [];
  let x = startX;
  for (const c of cols) { out.push(x); x += c.width; }
  return out;
}
