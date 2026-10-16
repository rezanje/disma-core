import type { Delivery, DeliveryLineSnapshot, Invoice, PurchaseItem, SalesOrder, SalesOrderItem, StockMovement } from '@/types';

const n=(value:unknown)=>Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;
const lineValue=(line:DeliveryLineSnapshot)=>line.lineTotal===undefined?n(line.qty)*n(line.unitPrice):n(line.lineTotal);
const lineCost=(line:DeliveryLineSnapshot)=>line.costTotal===undefined?n(line.qty)*n(line.unitCost):n(line.costTotal);
type InvoiceSource=Pick<Invoice,'id'|'status'|'totalAmount'|'amountPaid'> & Partial<Invoice>;
export function operatingInvoices<T extends InvoiceSource>(invoices:T[]):T[] {
  return invoices.filter(invoice=>!invoice.isConsolidated && !invoice.supersededByInvoiceId && ['Unpaid','Partial','Paid'].includes(invoice.status));
}
type ReturnFact={id:string;productId:string;qty:number;unitCost?:number;costAmount?:number;originalSoId?:string;salesOrderItemId?:string;invoiceId?:string;rootCause?:string;returnDecision?:string};
type CreditFact={invoiceId:string;amount:number;sourceReturnId?:string;refundableAmount?:number;refundedAmount?:number};
type CorrectionFacts={creditNotes?:CreditFact[];pendingReturns?:ReturnFact[]};
export function invoiceSkuFacts(invoices:InvoiceSource[],corrections:CorrectionFacts={}) {
  const rows=new Map<string,{productId:string;name:string;uom:string;qty:number;returnedQty:number;grossRevenue:number;revenue:number;cost:number|null}>();
  let missingSnapshotCount=0,snapshotMismatchCount=0,missingCostCount=0,estimatedCreditAllocationCount=0;
  const correctedCancelled=invoices.filter(invoice=>invoice.status==='Cancelled' && !invoice.isConsolidated && !invoice.supersededByInvoiceId && corrections.creditNotes?.some(note=>note.invoiceId===invoice.id));
  for(const invoice of [...operatingInvoices(invoices),...correctedCancelled]) {
    if(!invoice.lineSnapshots?.length) { missingSnapshotCount++;continue; }
    const snapshots=invoice.lineSnapshots;
    const gross=snapshots.reduce((sum,line)=>sum+lineValue(line),0);
    const correction=Math.max(0,gross-n(invoice.totalAmount));
    const knownCredits=new Map<string,number>();
    const linkedReturns=new Map<string,ReturnFact>();
    for(const note of corrections.creditNotes || []) if(note.invoiceId===invoice.id && note.sourceReturnId) {
      const returned=corrections.pendingReturns?.find(returned=>returned.id===note.sourceReturnId);
      if(returned && snapshots.some(line=>line.productId===returned.productId)) {
        knownCredits.set(returned.productId,(knownCredits.get(returned.productId) || 0)+n(note.amount));
        linkedReturns.set(returned.id,returned);
      }
    }
    for(const returned of corrections.pendingReturns || []) if(returned.invoiceId===invoice.id && returned.rootCause==='post-delivery') linkedReturns.set(returned.id,returned);
    const knownTotal=[...knownCredits.values()].reduce((sum,amount)=>sum+amount,0);
    const remainingCorrection=Math.max(0,correction-knownTotal);
    if(remainingCorrection>0.01) estimatedCreditAllocationCount++;
    if(Math.abs(gross-n(invoice.totalAmount)-correction)>0.01 || knownTotal>correction+0.01) snapshotMismatchCount++;
    const remainingGross=Math.max(0,gross-knownTotal);
    const grossByProduct=new Map<string,number>();
    for(const line of snapshots) grossByProduct.set(line.productId,(grossByProduct.get(line.productId) || 0)+lineValue(line));
    const returnedCostByProduct=new Map<string,number>(),returnedQtyByProduct=new Map<string,number>();
    for(const returned of linkedReturns.values()) {
      const line=snapshots.find(line=>line.productId===returned.productId);
      returnedQtyByProduct.set(returned.productId,(returnedQtyByProduct.get(returned.productId) || 0)+n(returned.qty));
      returnedCostByProduct.set(returned.productId,(returnedCostByProduct.get(returned.productId) || 0)+(returned.costAmount===undefined?n(returned.qty)*n(returned.unitCost ?? line?.unitCost):n(returned.costAmount)));
    }
    const firstProducts=new Set<string>();
    for(const line of snapshots) {
      const current=rows.get(line.productId) || {productId:line.productId,name:line.productName,uom:line.uom,qty:0,returnedQty:0,grossRevenue:0,revenue:0,cost:0};
      const value=lineValue(line),productGross=grossByProduct.get(line.productId) || 0;
      const exactCredit=(knownCredits.get(line.productId) || 0)*(productGross>0 ? value/productGross : 0);
      const proportionalCredit=remainingGross>0 ? remainingCorrection*Math.max(0,value-exactCredit)/remainingGross : 0;
      current.qty+=n(line.qty);current.grossRevenue+=value;current.revenue+=value-exactCredit-proportionalCredit;
      if(line.costTotal===undefined && (line.unitCost===undefined || line.unitCost===null || !Number.isFinite(Number(line.unitCost)))) {current.cost=null;missingCostCount++}
      else if(current.cost!==null) current.cost+=lineCost(line);
      if(!firstProducts.has(line.productId)) {
        current.returnedQty+=returnedQtyByProduct.get(line.productId) || 0;
        if(current.cost!==null) current.cost-=returnedCostByProduct.get(line.productId) || 0;
        firstProducts.add(line.productId);
      }
      rows.set(line.productId,current);
    }
  }
  return {rows:[...rows.values()],missingSnapshotCount,snapshotMismatchCount,missingCostCount,estimatedCreditAllocationCount};
}
export type ReconciliationInput={
  salesOrders:Pick<SalesOrder,'id'|'poNumber'|'status'|'targetDeliveryDate'>[];
  salesOrderItems:(Pick<SalesOrderItem,'id'|'salesOrderId'|'productId'|'qty'|'unitPrice'> & Partial<SalesOrderItem>)[];
  purchaseItems:(Pick<PurchaseItem,'id'|'productId'|'qtyPurchased'> & Partial<PurchaseItem>)[];
  deliveries:(Pick<Delivery,'id'|'salesOrderId'|'status'> & Partial<Delivery>)[];
  invoices:InvoiceSource[];
  stockMovements:(Pick<StockMovement,'id'|'productId'|'kind'|'quantity'|'stockDelta'> & Partial<StockMovement>)[];
  pendingReturns?:ReturnFact[];
  creditNotes?:CreditFact[];
  receiptAllocations?:{invoiceId:string;amount:number}[];
  today:string;
};
export type PoRecapLine={productId:string;name:string;uom:string;orderedQty:number;returnedQty:number;cancelledQty:number;boughtQty:number;qcPassedQty:number|null;reservedQty:number|null;dispatchedQty:number|null;acceptedQty:number|null;owedQty:number|null;invoicedQty:number;invoicedAmount:number;paidAllocatedAmount:number};

/** Quantity facts and money are kept separate. Legacy gaps remain explicit. */
export function reconcilePurchaseOrders(input:ReconciliationInput) {
  const invoices=operatingInvoices(input.invoices);
  const itemById=new Map(input.salesOrderItems.map(item=>[item.id,item]));
  const orders=input.salesOrders.filter(order=>!['Batal','Draft','Pending Approval'].includes(order.status)).map(order=>{
    const lines=new Map<string,PoRecapLine>();
    const warnings:string[]=[];
    const get=(productId:string,snapshot?:DeliveryLineSnapshot)=>{
      let row=lines.get(productId);
      if(!row) {row={productId,name:snapshot?.productName || productId,uom:snapshot?.uom || '',orderedQty:0,returnedQty:0,cancelledQty:0,boughtQty:0,qcPassedQty:null,reservedQty:null,dispatchedQty:0,acceptedQty:0,owedQty:0,invoicedQty:0,invoicedAmount:0,paidAllocatedAmount:0};lines.set(productId,row)}
      if(snapshot) {row.name=snapshot.productName;row.uom=snapshot.uom;}
      return row;
    };
    for(const item of input.salesOrderItems.filter(item=>item.salesOrderId===order.id)) {const row=get(item.productId);row.orderedQty+=n(item.qty);row.cancelledQty+=n(item.qtyCancelled);}
    const purchases=input.purchaseItems.filter(item=>item.salesOrderId===order.id);
    for(const item of purchases) {
      const row=get(item.productId); row.boughtQty+=n(item.qtyPurchased);
      if(item.inboundQtyReceived!==undefined) row.qcPassedQty=(row.qcPassedQty || 0)+n(item.inboundQtyReceived);
    }
    const allocations=input.stockMovements.filter(m=>m.salesOrderId===order.id && m.kind==='QC_CLIENT_ALLOCATION');
    for(const row of lines.values()) {
      const facts=allocations.filter(m=>m.productId===row.productId);
      if(facts.length) row.qcPassedQty=facts.reduce((sum,m)=>sum+n(m.quantity),0);
    }
    const deliveries=input.deliveries.filter(delivery=>delivery.salesOrderId===order.id);
    let legacyDispatch=false,legacyAcceptance=false;
    for(const delivery of deliveries) {
      if(delivery.lineSnapshots?.length) for(const snapshot of delivery.lineSnapshots) get(snapshot.productId,snapshot).dispatchedQty!+=n(snapshot.qty);
      else if(['Dikirim','Tunggu Konfirmasi','Awaiting Audit','Terkirim'].includes(delivery.status)) legacyDispatch=true;
      if(delivery.acceptedLineSnapshots) for(const snapshot of delivery.acceptedLineSnapshots) get(snapshot.productId,snapshot).acceptedQty!+=n(snapshot.qty);
      else if(delivery.status==='Terkirim') legacyAcceptance=true;
    }
    if(legacyDispatch) warnings.push('Sebagian kiriman lama belum memiliki rincian qty beku.');
    if(legacyAcceptance) warnings.push('Penerimaan klien lama perlu diverifikasi dari kertas; qty belum dapat direkonsiliasi.');
    for(const returned of input.pendingReturns || []) if(returned.originalSoId===order.id && returned.rootCause==='post-delivery') {
      const row=get(returned.productId);row.returnedQty+=n(returned.qty);
      if(returned.returnDecision==='Cancel' && !input.salesOrderItems.some(item=>item.salesOrderId===order.id && item.productId===returned.productId && item.qtyCancelled!==undefined)) row.cancelledQty+=n(returned.qty);
    }
    let invoicedAmount=0,paidAmount=0,outstandingAmount=0,refundLiabilityAmount=0,unattributedInvoicedAmount=0;
    for(const invoice of invoices) {
      const snapshots=invoice.lineSnapshots || [];
      const belongs=invoice.salesOrderId===order.id || snapshots.some(snapshot=>itemById.get(snapshot.salesOrderItemId)?.salesOrderId===order.id);
      if(!belongs) continue;
      const paid=input.receiptAllocations ? input.receiptAllocations.filter(receipt=>receipt.invoiceId===invoice.id).reduce((sum,receipt)=>sum+n(receipt.amount),0) : n(invoice.amountPaid);
      const frozenTotal=snapshots.reduce((sum,line)=>sum+lineValue(line),0);
      const own=snapshots.filter(snapshot=>itemById.get(snapshot.salesOrderItemId)?.salesOrderId===order.id || (invoice.salesOrderId===order.id && !itemById.has(snapshot.salesOrderItemId)));
      const ownValue=own.reduce((sum,line)=>sum+lineValue(line),0);
      const share=invoice.salesOrderId===order.id ? 1 : frozenTotal>0 ? ownValue/frozenTotal : 0;
      invoicedAmount+=n(invoice.totalAmount)*share;paidAmount+=paid*share;
      outstandingAmount+=Math.max(0,n(invoice.totalAmount)-paid)*share;
      const notes=(input.creditNotes || []).filter(note=>note.invoiceId===invoice.id);
      refundLiabilityAmount+=(notes.length ? notes.reduce((sum,note)=>sum+Math.max(0,n(note.refundableAmount)-n(note.refundedAmount)),0) : Math.max(0,paid-n(invoice.totalAmount)))*share;
      if(!snapshots.length) {unattributedInvoicedAmount+=n(invoice.totalAmount)*share;warnings.push(`Invoice ${invoice.id} belum memiliki rincian beku; nilai header tetap ditampilkan.`);continue}
      if(Math.abs(frozenTotal-n(invoice.totalAmount))>0.01) warnings.push(`Nilai rincian invoice ${invoice.id} berbeda dari header.`);
      for(const snapshot of own) {
        const row=get(snapshot.productId,snapshot),value=lineValue(snapshot);
        row.invoicedQty+=n(snapshot.qty);row.invoicedAmount+=frozenTotal>0 ? n(invoice.totalAmount)*value/frozenTotal : 0;
        row.paidAllocatedAmount+=frozenTotal>0 ? paid*value/frozenTotal : 0;
      }
    }
    // Cancelled invoices contribute no receivable/revenue, while their actual
    // receipts and outstanding refund obligations still need reconciliation.
    for(const invoice of input.invoices.filter(invoice=>invoice.status==='Cancelled' && !invoice.isConsolidated && !invoice.supersededByInvoiceId && invoice.salesOrderId===order.id)) {
      const paid=input.receiptAllocations ? input.receiptAllocations.filter(receipt=>receipt.invoiceId===invoice.id).reduce((sum,receipt)=>sum+n(receipt.amount),0) : n(invoice.amountPaid);
      paidAmount+=paid;
      const notes=(input.creditNotes || []).filter(note=>note.invoiceId===invoice.id);
      refundLiabilityAmount+=notes.length ? notes.reduce((sum,note)=>sum+Math.max(0,n(note.refundableAmount)-n(note.refundedAmount)),0) : Math.max(0,paid-n(invoice.totalAmount));
      const gross=(invoice.lineSnapshots || []).reduce((sum,line)=>sum+lineValue(line),0);
      for(const snapshot of invoice.lineSnapshots || []) get(snapshot.productId,snapshot).paidAllocatedAmount+=gross>0 ? paid*lineValue(snapshot)/gross : 0;
      if(paid>0) warnings.push(`Invoice batal ${invoice.id}: penerimaan asli tetap tercatat; selesaikan kewajiban refund secara terpisah.`);
    }
    for(const row of lines.values()) {
      if(legacyDispatch) row.dispatchedQty=null;
      if(legacyAcceptance) row.acceptedQty=null;
      if(row.acceptedQty!==null) row.acceptedQty=Math.max(0,row.acceptedQty-row.returnedQty);
      row.owedQty=row.acceptedQty===null ? null : Math.max(0,row.orderedQty-row.cancelledQty-row.acceptedQty);
      if(row.acceptedQty!==null && row.acceptedQty>row.orderedQty+0.00000001) warnings.push(`Qty diterima ${row.productId} melebihi pesanan; periksa dokumen sumber.`);
      row.reservedQty=row.qcPassedQty===null || row.dispatchedQty===null ? null : Math.max(0,row.qcPassedQty-row.dispatchedQty);
    }
    const pendingPaperCount=deliveries.filter(d=>['Dikirim','Tunggu Konfirmasi','Awaiting Audit'].includes(d.status)).length;
    const missingInvoiceCount=deliveries.filter(d=>d.status==='Terkirim' && !invoices.some(inv=>inv.id===d.invoiceId || inv.deliveryId===d.id)).length;
    const overdue=order.targetDeliveryDate<input.today && [...lines.values()].some(row=>row.owedQty===null || row.owedQty>0);
    if(pendingPaperCount) warnings.push(`${pendingPaperCount} hasil kiriman masih menunggu salinan/konfirmasi.`);
    if(missingInvoiceCount) warnings.push(`${missingInvoiceCount} kiriman diterima belum memiliki tautan invoice sumber.`);
    if(overdue) warnings.push('Target lewat; penerimaan aktual belum lengkap.');
    return {id:order.id,poNumber:order.poNumber,lines:[...lines.values()],totals:{invoicedAmount,paidAmount,outstandingAmount,refundLiabilityAmount,unattributedInvoicedAmount},warnings:[...new Set(warnings)],pendingPaperCount,missingInvoiceCount,overdue};
  });
  return {orders,exceptions:{pendingPaperCount:orders.reduce((sum,o)=>sum+o.pendingPaperCount,0),missingInvoiceCount:orders.reduce((sum,o)=>sum+o.missingInvoiceCount,0),overdueCount:orders.filter(o=>o.overdue).length}};
}
