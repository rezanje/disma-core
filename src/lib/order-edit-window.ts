// Sampai kapan sebuah pesanan masih boleh diubah.
//
// Dulu jendelanya tertutup begitu Admin PO merangkum pesanan jadi daftar belanja —
// padahal saat itu belum ada apa pun yang bergantung pada angkanya: Finance belum
// menentukan vendor, belum ada uang keluar, belum ada yang berangkat ke pasar.
// Klien menelepon "tambah 5 kg" lima menit kemudian, dan jawabannya jadi "tidak bisa".
//
// Jendelanya tutup di tempat yang benar: begitu Finance melepas rencananya. Lewat
// titik itu angkanya sudah dipakai memutuskan vendor dan menyiapkan uang, jadi
// mengubahnya diam-diam membuat dua catatan berbeda untuk satu pesanan.
//
// Murni. Lihat order-edit-window.check.ts.

export type EditableOrder = {
  status: string;
  shoppingListDocumentId?: string | null;
};

export type ShoppingDocStatus = { id: string; status: string };

/** Pesanan yang belum pernah dirangkum selalu boleh diubah. */
export function orderEditable(so: EditableOrder | null | undefined, docs: ShoppingDocStatus[]): boolean {
  if (!so) return false;
  if (so.status === 'Draft' || so.status === 'Pending Approval') return true;
  if (!so.shoppingListDocumentId) return false;
  const doc = (docs || []).find(d => d.id === so.shoppingListDocumentId);
  // Dokumen yang hilang tidak boleh diam-diam membuka kunci.
  if (!doc) return false;
  return doc.status === 'Menunggu Rencana';
}

/** Kenapa terkunci — buat ditampilkan, bukan dibuang ke konsol. */
export function editLockReason(so: EditableOrder | null | undefined, docs: ShoppingDocStatus[]): string | null {
  if (orderEditable(so, docs)) return null;
  if (!so) return 'Pesanannya tidak ketemu.';
  if (!so.shoppingListDocumentId) return 'Pesanan ini sudah jalan — ubah lewat retur atau credit note.';
  const doc = (docs || []).find(d => d.id === so.shoppingListDocumentId);
  if (!doc) return 'Dokumen belanjanya tidak ketemu.';
  return 'Rencana belanjanya sudah dilepas Finance — vendor dan uangnya sudah disiapkan dari angka ini.';
}

export type LinkedLine = {
  id: string;
  purchaseId: string;
  salesOrderId?: string | null;
  productId: string;
};

/**
 * Baris belanja yang ikut berubah kalau qty pesanan diubah.
 *
 * Tanpa ini, pesanan bilang 15 kg sementara daftar belanjanya masih 10 — dan yang
 * dibawa ke pasar adalah yang 10.
 */
export function linkedPurchaseLines(
  soId: string,
  productId: string,
  lines: LinkedLine[],
  docs: ShoppingDocStatus[],
): string[] {
  const bolehIkut = new Set(
    (docs || []).filter(d => d.status === 'Menunggu Rencana').map(d => d.id),
  );
  return (lines || [])
    .filter(l => l.salesOrderId === soId && l.productId === productId && bolehIkut.has(l.purchaseId))
    .map(l => l.id);
}
