import assert from 'node:assert/strict';
import { orderEditable, editLockReason, linkedPurchaseLines } from './order-edit-window';

const DOCS = [
  { id: 'doc-nunggu', status: 'Menunggu Rencana' },
  { id: 'doc-lepas', status: 'Pending' },
  { id: 'doc-jalan', status: 'Belanja' },
];

// belum dirangkum -> selalu boleh
assert.equal(orderEditable({ status: 'Draft' }, DOCS), true);
assert.equal(orderEditable({ status: 'Pending Approval' }, DOCS), true);

// sudah dirangkum, Finance BELUM merencanakan -> masih boleh
assert.equal(orderEditable({ status: 'Belanja', shoppingListDocumentId: 'doc-nunggu' }, DOCS), true);

// rencananya sudah dilepas -> terkunci
assert.equal(orderEditable({ status: 'Belanja', shoppingListDocumentId: 'doc-lepas' }, DOCS), false);
assert.equal(orderEditable({ status: 'Belanja', shoppingListDocumentId: 'doc-jalan' }, DOCS), false);

// pesanan yang sudah jalan tanpa dokumen -> terkunci, bukan terbuka
assert.equal(orderEditable({ status: 'Terkirim' }, DOCS), false);
// dokumen yang tidak ketemu tidak boleh diam-diam membuka kunci
assert.equal(orderEditable({ status: 'Belanja', shoppingListDocumentId: 'doc-hantu' }, DOCS), false);
assert.equal(orderEditable(null, DOCS), false);

// --- alasan terkunci ---
assert.equal(editLockReason({ status: 'Draft' }, DOCS), null);
assert.match(editLockReason({ status: 'Belanja', shoppingListDocumentId: 'doc-lepas' }, DOCS) || '', /sudah dilepas Finance/);
assert.match(editLockReason({ status: 'Terkirim' }, DOCS) || '', /retur atau credit note/);
assert.match(editLockReason({ status: 'Belanja', shoppingListDocumentId: 'doc-hantu' }, DOCS) || '', /tidak ketemu/);

// --- baris belanja yang ikut berubah ---
const LINES = [
  { id: 'L1', purchaseId: 'doc-nunggu', salesOrderId: 'SO1', productId: 'APEL' },
  { id: 'L2', purchaseId: 'doc-nunggu', salesOrderId: 'SO1', productId: 'JERUK' },
  { id: 'L3', purchaseId: 'doc-nunggu', salesOrderId: 'SO2', productId: 'APEL' },
  { id: 'L4', purchaseId: 'doc-lepas', salesOrderId: 'SO1', productId: 'APEL' },  // sudah dilepas -> jangan disentuh
];
assert.deepEqual(linkedPurchaseLines('SO1', 'APEL', LINES, DOCS), ['L1']);
assert.deepEqual(linkedPurchaseLines('SO2', 'APEL', LINES, DOCS), ['L3']);
assert.deepEqual(linkedPurchaseLines('SO1', 'MANGGA', LINES, DOCS), []);
assert.deepEqual(linkedPurchaseLines('SO1', 'APEL', [], DOCS), []);

console.log('order-edit-window: OK');
