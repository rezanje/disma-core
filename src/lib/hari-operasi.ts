// Satu putaran kerja itu satu HARI KIRIM, bukan satu tanggal kalender.
//
// Jam kerjanya tidak pernah ketemu: sourcing 23:00-09:00, kurir dari 06:00, admin dan
// finance 10:00-19:00. Satu putaran — belanja malam ini, QC subuh, kirim siang — nyebrang
// dua tanggal kalender, dan semuanya baru diketik ke aplikasi siang harinya oleh orang
// yang tidak ada di tempat saat kejadian.
//
// Akibatnya laporan harian berdasarkan tanggal kalender selalu salah dua kali: belanja
// jam 01:00 masuk hari yang berbeda dari kiriman yang dibelanjakannya, dan jam yang
// tercatat adalah jam mengetik, bukan jam kejadian.
//
// Yang dipakai di sini: tiap transaksi ditarik ke tanggal kirim PO yang dilayaninya.
// Belanja 24 malam + QC 25 pagi + kirim 25 siang = "hari kirim 25". Satu putaran, satu
// angka, tidak peduli jam berapa diketik. Yang tidak melayani PO mana pun — biaya kantor,
// pembayaran hutang — tetap memakai tanggal transaksinya sendiri, karena memang tidak
// punya hari kirim.
//
// Murni. Lihat hari-operasi.check.ts.

/** YYYY-MM-DD di zona setempat — bukan toISOString(), yang menggeser tengah malam WIB ke hari sebelumnya. */
export function localDay(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type SumberHariKirim = {
  salesOrders: Array<{ id: string; targetDeliveryDate?: string | null }>;
  purchaseItems: Array<{ purchaseId: string; salesOrderId?: string | null }>;
  deliveries: Array<{ id: string; salesOrderId: string }>;
  invoices: Array<{ id: string; salesOrderId?: string | null }>;
};

/**
 * Peta: id apa pun yang dipakai sebagai rujukan jurnal -> tanggal kirimnya.
 *
 * Satu dokumen belanja bisa melayani beberapa tanggal kirim sekaligus. Yang diambil
 * tanggal PALING AWAL: uangnya keluar untuk kiriman terdekat, dan menaruhnya di tanggal
 * terjauh berarti hari yang sudah lewat ditutup tanpa memuat belanjanya sendiri.
 */
export function petaHariKirim(sumber: SumberHariKirim): Map<string, string> {
  const peta = new Map<string, string>();

  const kirimSO = new Map<string, string>();
  for (const so of sumber.salesOrders || []) {
    const hari = so.targetDeliveryDate ? localDay(so.targetDeliveryDate) : '';
    if (!hari) continue;
    kirimSO.set(so.id, hari);
    peta.set(so.id, hari);
  }

  const paling_awal = (id: string, hari: string) => {
    const ada = peta.get(id);
    if (!ada || hari < ada) peta.set(id, hari);
  };

  for (const pi of sumber.purchaseItems || []) {
    if (!pi.salesOrderId) continue;
    const hari = kirimSO.get(pi.salesOrderId);
    if (hari) paling_awal(pi.purchaseId, hari);
  }

  for (const d of sumber.deliveries || []) {
    const hari = kirimSO.get(d.salesOrderId);
    if (hari) paling_awal(d.id, hari);
  }

  for (const inv of sumber.invoices || []) {
    if (!inv.salesOrderId) continue;
    const hari = kirimSO.get(inv.salesOrderId);
    if (hari) paling_awal(inv.id, hari);
  }

  return peta;
}

export type RujukanJurnal = {
  referenceId?: string | null;
  transactionDate: string;
};

/**
 * Hari operasi sebuah transaksi: tanggal kirim yang dilayaninya, atau tanggal
 * transaksinya sendiri kalau memang tidak melayani PO mana pun.
 */
export function hariOperasi(entry: RujukanJurnal, peta: Map<string, string>): string {
  const kirim = entry.referenceId ? peta.get(entry.referenceId) : undefined;
  return kirim || localDay(entry.transactionDate);
}
