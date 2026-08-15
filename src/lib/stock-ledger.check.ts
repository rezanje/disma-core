/**
 * Satu barang = satu kali masuk stok, satu kali keluar.
 * Jalankan:  npx tsx src/lib/stock-ledger.check.ts
 *
 * Ditulis setelah simulasi 15 Agustus menemukan tiap kiriman terpotong DUA kali —
 * sekali saat Gudang merilis barang, sekali lagi saat Finance mengaudit pengiriman —
 * sementara barang untuk PO klien tidak pernah ditambahkan ke stok sama sekali.
 * Stok 280 unit yang dikirim tercatat minus 540, dan layar menyembunyikannya dengan
 * memaksa angka minus jadi 0.
 *
 * Yang dijaga di sini adalah aritmatikanya, bukan halamannya: rangkaian pergerakan
 * stok untuk satu putaran kirim harus berjumlah nol, dan penjaga anti-dobel harus
 * mengenali kiriman yang sudah dirilis Gudang.
 */
import assert from 'node:assert/strict';

type Movement = { kind: string; stockDelta: number; referenceId?: string };

const netStock = (ms: Movement[]) => ms.reduce((s, m) => s + m.stockDelta, 0);

/** Penjaga di recordDeliveryAndInvoice: sudah dirilis Gudang → jangan potong lagi. */
const alreadyReleased = (ms: Movement[], deliveryId: string) =>
  ms.some(m => m.kind === 'DELIVERY_OUTBOUND' && m.referenceId === deliveryId);

// --- Putaran normal: QC meloloskan 50, Gudang merilis 50, Finance mengaudit ---
const round: Movement[] = [
  { kind: 'QC_RECEIPT', stockDelta: 0, referenceId: 'pi-1' },        // info saja
  { kind: 'QC_CLIENT_ALLOCATION', stockDelta: 50, referenceId: 'pi-1' }, // barang masuk gudang
  { kind: 'DELIVERY_OUTBOUND', stockDelta: -50, referenceId: 'dlv-1' },  // dirilis Gudang
];
assert.equal(netStock(round), 0, 'stok harus kembali nol setelah barang dikirim');
assert.equal(alreadyReleased(round, 'dlv-1'), true, 'audit harus tahu barangnya sudah dipotong Gudang');
assert.equal(netStock(round), 0, 'audit tidak boleh menambah potongan kedua');

// --- Bug lama: alokasi 0 + dua kali potong ---
const buggy: Movement[] = [
  { kind: 'QC_CLIENT_ALLOCATION', stockDelta: 0, referenceId: 'pi-1' },
  { kind: 'DELIVERY_OUTBOUND', stockDelta: -50, referenceId: 'so-1' },   // rilis Gudang (pakai id PO)
  { kind: 'DELIVERY_OUTBOUND', stockDelta: -50, referenceId: 'dlv-1' },  // audit Finance
];
assert.equal(netStock(buggy), -100, 'pola lama memang menghasilkan minus dua kali lipat');
assert.equal(alreadyReleased(buggy, 'dlv-1'), true);

// --- Jalur tanpa gudang (tombol "Dikirim → Terkirim" manual): audit HARUS memotong ---
const manual: Movement[] = [{ kind: 'QC_CLIENT_ALLOCATION', stockDelta: 20, referenceId: 'pi-9' }];
assert.equal(alreadyReleased(manual, 'dlv-9'), false, 'tanpa rilis gudang, audit tetap yang memotong');
manual.push({ kind: 'DELIVERY_OUTBOUND', stockDelta: -20, referenceId: 'dlv-9' });
assert.equal(netStock(manual), 0);

// --- Ronde susulan: dua putaran pada PO yang sama tetap berjumlah nol ---
const backorder: Movement[] = [
  { kind: 'QC_CLIENT_ALLOCATION', stockDelta: 65, referenceId: 'pi-1' },
  { kind: 'DELIVERY_OUTBOUND', stockDelta: -65, referenceId: 'dlv-1' },
  { kind: 'QC_CLIENT_ALLOCATION', stockDelta: 15, referenceId: 'pi-2' },
  { kind: 'DELIVERY_OUTBOUND', stockDelta: -15, referenceId: 'dlv-2' },
];
assert.equal(netStock(backorder), 0);
assert.equal(alreadyReleased(backorder, 'dlv-2'), true);
assert.equal(alreadyReleased(backorder, 'dlv-3'), false, 'putaran yang belum dirilis tidak boleh dianggap sudah');

console.log('stock-ledger.check.ts OK');
