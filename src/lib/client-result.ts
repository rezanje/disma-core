import type {Delivery} from '@/types';
import type {PaperEvidence} from './goods-command';
import {paperIso} from './paper-operations';
/** Reject correctable paper mistakes before the UI freezes a retry snapshot. */
export function prepareClientResult(delivery:Pick<Delivery,'lineSnapshots'>,quantities:Record<string,number>,ev:PaperEvidence){
 if(!delivery.lineSnapshots?.length)throw new Error('Rincian pengiriman belum tersedia.');
 if(!ev.performedBy||!ev.paperNumber?.trim())throw new Error('Isi pelaksana dan nomor berkas surat jalan.');
 if(!ev.recipientName?.trim())throw new Error('Isi nama penerima outlet sesuai surat jalan.');
 if(!ev.signedPaperChecked&&!ev.paperProof)throw new Error('Periksa surat jalan dengan tanda tangan penerima atau unggah buktinya.');
 const received=delivery.lineSnapshots.map(line=>{
  const qtyReceived=quantities[line.salesOrderItemId]??line.qty;
  if(!Number.isFinite(qtyReceived)||qtyReceived<0||qtyReceived>line.qty)throw new Error('Jumlah diterima harus antara nol dan jumlah berangkat.');
  if(qtyReceived<line.qty&&!ev.rejectionReason?.trim())throw new Error('Isi alasan penolakan / selisih pada berkas.');
  return {salesOrderItemId:line.salesOrderItemId,qtyReceived};
 });
 return {received,evidence:{...ev,paperNumber:ev.paperNumber.trim(),recipientName:ev.recipientName.trim(),occurredAt:paperIso(ev.occurredAt||'')}};
}
