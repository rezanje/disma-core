// Pemeriksaan barang masuk: satu-satunya tempat QC dibukukan.
//
// Dulu seluruh isi berkas ini tinggal di dalam komponen halaman QC. Begitu layar
// harian gabungan butuh melakukan hal yang sama, satu-satunya pilihan adalah
// menyalinnya — dan aplikasi ini sudah pernah rugi karena dua salinan alur yang
// sama berjalan berdampingan lalu diam-diam berbeda (dua sistem Tukar Faktur,
// dua jalur potong stok). Jadi logikanya dipindah ke sini dan kedua layar
// memanggil fungsi yang sama.
//
// Bukan fungsi murni: dia menulis jurnal, stok, hutang, dan notifikasi. Yang
// dihilangkan cuma React dan toast — pemanggilnya yang memutuskan cara bicara
// ke orangnya.

import { v4 as uuidv4 } from 'uuid';
import {
  recordInboundQC, recordStockMovement, recordVendorBillFromInbound,
  recordVendorTransferPurchase,
} from './accounting';
import { resolveActor, transcriptionNote } from './actor';
import type { useAppStore as StoreType } from './store';

type Store = ReturnType<typeof StoreType.getState>;

export type RejectAction = 'B2C' | 'Return' | 'Disposal';

export type QcInput = {
  purchaseItemId: string;
  /** Berapa yang lolos dan masuk stok gudang (bukan untuk PO tertentu). */
  qtyPassToInventory: number;
  /** Alokasi ke pesanan klien: PO mana dapat berapa. */
  allocations: Array<{ soId: string; qty: number }>;
  qtyReject: number;
  rejectAction: RejectAction;
  rejectReason?: string;
  /** Harga yang benar-benar ditagih vendor. Kosong berarti pakai harga belanja. */
  vendorUnitPrice?: number;
  unbalanceReason?: string;
  batchNumber?: string;
  expiryDate?: string;
  qcPhoto?: string | null;
  /** Siapa yang MEMERIKSA barangnya, kalau bukan yang mengetik. */
  qcPerformedByUserId?: string;
};

export type QcResult =
  | { ok: false; error: string }
  | { ok: true; warnings: string[]; infos: string[] };

/**
 * Jumlah yang diproses harus sama dengan yang datang. Kalau tidak, harus ada
 * alasannya — barang segar memang bisa susut, tapi susut tanpa keterangan tidak
 * bisa dibedakan dari barang hilang.
 */
export function qcBalanceProblem(input: QcInput, qtyIncoming: number): string | null {
  const allocated = input.allocations.reduce((s, a) => s + a.qty, 0);
  const processed = input.qtyPassToInventory + allocated + input.qtyReject;
  if (processed !== qtyIncoming && !String(input.unbalanceReason || '').trim()) {
    return `Jumlahnya belum pas: ${processed} dari ${qtyIncoming} yang datang. Isi alasannya kalau memang beda.`;
  }
  return null;
}

/**
 * `getState` dan bukan snapshot: fungsi ini menulis lalu membaca lagi hasil
 * tulisannya sendiri (alokasi menambah qtyFinal, lalu status pesanan dihitung dari
 * qtyFinal itu). Snapshot yang diambil sekali di awal akan membaca angka lama.
 */
export async function processInboundQC(getState: () => Store, input: QcInput): Promise<QcResult> {
  const state = getState();
  const item = state.purchaseItems.find(p => p.id === input.purchaseItemId);
  const product = item ? state.products.find(p => p.id === item.productId) : undefined;
  if (!item || !product) return { ok: false, error: 'Barangnya tidak ketemu.' };

  const warnings: string[] = [];
  const infos: string[] = [];

  const qtyIncoming = item.qtyPurchased;
  const totalAllocated = input.allocations.reduce((sum, a) => sum + a.qty, 0);
  const totalProcessed = input.qtyPassToInventory + totalAllocated + input.qtyReject;

  const balance = qcBalanceProblem(input, qtyIncoming);
  if (balance) return { ok: false, error: balance };

  const currentUser = state.currentUser;
  const typedVendorPrice = Number(input.vendorUnitPrice) || 0;
  const unitCost = typedVendorPrice || item.actualUnitPrice || item.estimatedUnitPrice || product.basePrice || 0;

  // Harga vendor yang diketik disimpan supaya settlement, laporan HPP dan riwayat
  // harga memakai angka yang sama dengan jurnal di bawah.
  if (typedVendorPrice > 0 && typedVendorPrice !== item.actualUnitPrice) {
    await state.updatePurchaseItem(item.id, { actualUnitPrice: typedVendorPrice });
  }

  const inboundSuccess = await recordInboundQC(
    item.id,
    product.id,
    input.qtyPassToInventory + totalAllocated,
    input.qtyReject,
    input.qtyReject > 0 ? input.rejectAction : undefined,
    unitCost,
    'main',
    input.batchNumber || undefined,
    input.expiryDate || undefined,
    currentUser?.id || 'system',
  );
  if (!inboundSuccess) return { ok: false, error: 'Jurnal akuntansi untuk QC gagal dibuat.' };

  const actorId = currentUser?.id || 'system';

  await recordStockMovement({
    productId: product.id,
    quantity: qtyIncoming,
    stockDelta: 0,
    direction: 'Info',
    kind: 'QC_RECEIPT',
    source: 'Sourcing',
    destination: 'QC Inspection',
    referenceType: 'QC',
    referenceId: item.id,
    purchaseItemId: item.id,
    note: `Barang masuk QC dari sourcing untuk ${product.name}`,
    createdByUserId: actorId,
    warehouseId: 'main',
    batchNumber: input.batchNumber || undefined,
    expiryDate: input.expiryDate || undefined,
    unitCost,
  });

  if (input.qtyPassToInventory > 0) {
    await recordStockMovement({
      productId: product.id,
      quantity: input.qtyPassToInventory,
      stockDelta: input.qtyPassToInventory,
      direction: 'In',
      kind: 'QC_INVENTORY',
      source: 'QC',
      destination: 'Inventory',
      referenceType: 'QC',
      referenceId: item.id,
      purchaseItemId: item.id,
      note: 'Lolos QC dan masuk inventory',
      createdByUserId: actorId,
      warehouseId: 'main',
      batchNumber: input.batchNumber || undefined,
      expiryDate: input.expiryDate || undefined,
      unitCost,
    });
  }

  for (const alloc of input.allocations) {
    if (alloc.qty <= 0) continue;
    const fresh = getState();
    const matchingSOItem = fresh.salesOrderItems.find(
      i => i.salesOrderId === alloc.soId && i.productId === item.productId,
    );
    if (matchingSOItem) {
      const prevQtyFinal = matchingSOItem.qtyFinal ?? 0;
      const newQtyFinal = prevQtyFinal + alloc.qty;
      await fresh.updateSalesOrderItem(matchingSOItem.id, {
        qtyFinal: newQtyFinal,
        subtotalFinal: newQtyFinal * (matchingSOItem.unitPrice || 0),
      });
    }
    // Barangnya BENAR-BENAR ada di gudang sejak lolos QC sampai dirilis ke kurir,
    // jadi harus masuk hitungan stok. Dulu delta-nya 0 ("cross-dock"), padahal
    // Goods Outbound tetap memotongnya waktu keluar — stok jadi minus sebesar
    // setiap barang yang pernah dikirim.
    await recordStockMovement({
      productId: product.id,
      quantity: alloc.qty,
      stockDelta: alloc.qty,
      direction: 'In',
      kind: 'QC_CLIENT_ALLOCATION',
      source: 'QC',
      destination: 'Transit (Reserved for Delivery)',
      referenceType: 'QC',
      referenceId: item.id,
      purchaseItemId: item.id,
      salesOrderId: alloc.soId,
      note: `Lolos QC → reserved untuk PO ${state.salesOrders.find(s2 => s2.id === alloc.soId)?.poNumber ?? alloc.soId}`,
      createdByUserId: actorId,
      warehouseId: 'main',
      batchNumber: input.batchNumber || undefined,
      expiryDate: input.expiryDate || undefined,
      unitCost,
    });
  }

  if (input.qtyReject > 0) {
    const rejectId = uuidv4();
    if (input.rejectAction === 'B2C') {
      await recordStockMovement({
        productId: product.id,
        quantity: input.qtyReject,
        stockDelta: input.qtyReject,
        direction: 'In',
        kind: 'QC_INVENTORY',
        source: 'QC Reject',
        destination: 'B2C Warehouse',
        referenceType: 'QC',
        referenceId: item.id,
        purchaseItemId: item.id,
        note: 'Barang reject dipindahkan ke B2C Peralihan',
        createdByUserId: actorId,
        warehouseId: 'b2c',
        batchNumber: input.batchNumber || undefined,
        expiryDate: input.expiryDate || undefined,
        unitCost,
      });
    } else {
      await recordStockMovement({
        productId: product.id,
        quantity: input.qtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'ADJUSTMENT',
        source: 'QC',
        destination: input.rejectAction === 'Return' ? 'Return to Supplier' : 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: item.id,
        purchaseItemId: item.id,
        note: `Reject QC (${input.rejectAction}): ${input.rejectReason || 'Tanpa alasan'}`,
        createdByUserId: actorId,
        warehouseId: 'main',
        unitCost,
      });
    }

    await state.addRejectedItem({
      id: rejectId,
      date: new Date().toISOString(),
      productId: product.id,
      qty: input.qtyReject,
      reason: `${input.rejectAction === 'B2C' ? 'Peralihan B2C' : input.rejectAction === 'Return' ? 'Retur Supplier' : 'Disposal'}: ${input.rejectReason || 'Tanpa alasan'}`,
      source: 'QC',
      referenceId: item.id,
      reportedBy: actorId,
      imageUrl: input.qcPhoto || undefined,
    });

    // "Retur ke Supplier" pernah cuma jadi baris catatan: tidak ada dokumen yang bisa
    // dikejar, tidak ada status, tidak ada yang diberi tahu.
    const returnVendorId = input.rejectAction === 'Return'
      ? (item.vendorId || product.defaultVendorId)
      : undefined;

    if (input.rejectAction === 'Return' && returnVendorId) {
      await state.addVendorReturn({
        id: uuidv4(),
        productId: product.id,
        vendorId: returnVendorId,
        qty: input.qtyReject,
        reason: input.rejectReason || 'Gagal QC barang masuk',
        date: new Date().toISOString(),
        originalReturnId: item.id,
        status: 'Menunggu Vendor',
      });
    }

    const vendorName = state.vendors.find(v => v.id === returnVendorId)?.companyName;
    const adminUsers = state.users.filter(u => u.role === 'admin_po');
    for (const adminUser of adminUsers) {
      await state.addNotification({
        id: uuidv4(),
        userId: adminUser.id,
        title: returnVendorId ? `Retur ke Vendor: ${product.name}` : `QC Reject: ${product.name}`,
        message: returnVendorId
          ? `${input.qtyReject} ${product.uom} diretur ke ${vendorName} untuk ditukar. Alasan: ${input.rejectReason || 'Tanpa alasan'}.`
          : `${input.qtyReject} ${product.uom} ditolak QC (${input.rejectAction}). Alasan: ${input.rejectReason || 'Tanpa alasan'}.`,
        type: 'system',
        link: returnVendorId ? '/warehouse/qc' : '/admin/shopping-list',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (input.rejectAction === 'Return') {
      if (returnVendorId) infos.push(`Retur ke ${vendorName} dibuat — tunggu penggantian dari vendor.`);
      // Belanja cash di pasar tidak punya vendor, jadi tidak ada yang bisa ditagih.
      else warnings.push('Ditandai retur, tapi vendornya tidak diketahui — dokumen retur tidak dibuat.');
    }
  }

  // Tempo (lokasi ambil mana pun): bayar belakangan, tagihannya jadi Hutang Vendor.
  // netAccrual harus sama persis dengan yang di-credit ke 2-1100 oleh recordInboundQC.
  const qtyReceived = input.qtyPassToInventory + totalAllocated + input.qtyReject;
  const grossAccrual = qtyReceived * unitCost;
  const netAccrual = grossAccrual - (input.qtyReject > 0 && input.rejectAction === 'Return' ? input.qtyReject * unitCost : 0);

  if (item.paymentMethod === 'Tempo') {
    if (!item.vendorId) {
      warnings.push(`${product.name} (Tempo) tidak ada vendor — hutang tidak otomatis dicatat. Catat manual di AP Aging.`);
    } else if (netAccrual > 0) {
      await recordVendorBillFromInbound(
        item.id,
        item.vendorId,
        netAccrual,
        `Tempo: ${product.name} (QC ${new Date().toLocaleDateString('id-ID')})`,
        item.purchaseId,
      );
    }
  }

  // Vendor + Transfer dibayar finance dari BCA di sini, bukan di laporan sourcing:
  // barang kiriman vendor memang sengaja tidak masuk checklist sourcing.
  if (item.purchaseMethod === 'Vendor' && item.paymentMethod === 'Transfer' && netAccrual > 0) {
    const bca = state.bankAccounts.find(b => b.accountCode === '1-1200');
    if (!bca) {
      warnings.push(`${product.name} (Transfer): rekening BCA tidak ketemu — pembayaran tidak tercatat.`);
    } else {
      await recordVendorTransferPurchase(item.purchaseId, bca.id, netAccrual, currentUser?.name || 'Finance');
    }
  }

  const performerName = state.users.find(u => u.id === input.qcPerformedByUserId)?.name;
  await state.updatePurchaseItem(item.id, {
    isQCed: true,
    inboundStatus: input.qtyReject === qtyIncoming ? 'rejected' : (totalProcessed === qtyIncoming ? 'verified' : 'partial'),
    inboundQtyReceived: input.qtyPassToInventory + totalAllocated,
    inboundVerifiedAt: new Date().toISOString(),
    // Nama orang yang MEMERIKSA barangnya, bukan yang mengetiknya.
    inboundVerifiedBy: resolveActor(performerName, currentUser?.name || currentUser?.id),
    inboundNote: [
      transcriptionNote(performerName, currentUser?.name),
      input.unbalanceReason, input.rejectReason,
    ].filter(Boolean).join(' | '),
    expiryDate: input.expiryDate || undefined,
  });

  // Pesanan yang semua barisnya sudah punya qtyFinal naik ke Packing.
  const affectedSoIds = input.allocations.filter(a => a.qty > 0).map(a => a.soId);
  for (const soId of affectedSoIds) {
    const fresh = getState();
    const soItems = fresh.salesOrderItems.filter(i => i.salesOrderId === soId);
    if (soItems.length > 0 && soItems.every(i => (i.qtyFinal != null) || (i.qty - (i.qtyDelivered ?? 0) <= 0))) {
      await fresh.updateSalesOrder(soId, { status: 'Packing' });
    }
  }

  return { ok: true, warnings, infos };
}
