import assert from 'node:assert/strict';
import { applyClientReceipt, finalizeDeliveryAndInvoice, releaseForDelivery } from './dispatch';
async function main() {
  let refreshes = 0;
  const requests: any[] = [];
  const updates=Object.fromEntries(['stockMovements','products','salesOrders','salesOrderItems','purchaseItems','deliveries','invoices','pendingReturns','vendorReturns','rejectedItems','vendorBills','bankAccounts','cashTransactions','journalEntries','journalLines'].map(k=>[k,[]]));
  Object.assign(updates,{deliveries:[{id:'D'}],invoices:[{id:'I'}],salesOrders:[{id:'S'}]});
  const state: any = {
    init: async()=>{refreshes++}, updateSalesOrder: async()=>{}, addDelivery: async()=>{},
    salesOrders:[{id:'S',status:'Packing'}], salesOrderItems:[],
    deliveries:[{id:'D',salesOrderId:'S',status:'Dikirim',invoiceId:'I'}],
    invoices:[{id:'I',totalAmount:60}],
  };
  globalThis.fetch = async (_url, options) => {
    const body=JSON.parse(String(options?.body)); requests.push(body);
    return new Response(JSON.stringify({ok:true,eventId:body.eventId,deliveryId:'D',invoiceId:'I',total:60,updates}),{status:200});
  };
  await releaseForDelivery(()=>state,'S');
  assert.equal(requests.length,1,'release must execute authoritative transaction rather than local mutations');
  assert.equal(requests[0].stage,'release');
  assert.equal(requests[0].eventId,'release:S:initial');
  await applyClientReceipt(()=>state,'S',[{salesOrderItemId:'L',qtyReceived:6}],{performedBy:'courier',occurredAt:'2026-10-15T06:00:00Z',recipientName:'Customer'});
  assert.equal(requests[1].sourceId,'D');
  assert.equal(requests[1].payload.received[0].qtyReceived,6);
  assert.equal(requests[1].payload.performedBy,'courier');
  const result=await finalizeDeliveryAndInvoice(()=>state,'D','S');
  assert.deepEqual(result,{ok:true,invoiceId:'I',total:60});
  assert.equal(requests[2].eventId,'acceptance:D');
  assert.equal(refreshes,0,'committed commands merge authoritative facts without a swallowed background init');
  globalThis.fetch = async()=>new Response(JSON.stringify({error:'stale quantity'}),{status:409});
  await assert.rejects(releaseForDelivery(()=>state,'S'),/stale quantity/);
  assert.equal(refreshes,0,'failed command must not refresh/pretend success');
}
main().then(()=>console.log('dispatch durable commands: OK'));
