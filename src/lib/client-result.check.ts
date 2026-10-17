import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(fs.existsSync('src/lib/client-result.ts'),'Missing receipt preflight: invalid paper currently locks editing before rejection');
const {prepareClientResult}=require('./client-result');
const delivery={lineSnapshots:[{salesOrderItemId:'li',qty:5}]};
const ev={occurredAt:'2026-10-18T09:00',performedBy:'c',paperNumber:'SJ1',recipientName:'PIC',signedPaperChecked:true};
assert.throws(()=>prepareClientResult(delivery,{}, {...ev,recipientName:''}),/penerima/);
assert.throws(()=>prepareClientResult(delivery,{}, {...ev,paperNumber:''}),/berkas/);
assert.throws(()=>prepareClientResult(delivery,{}, {...ev,signedPaperChecked:false}),/tanda tangan/);
assert.throws(()=>prepareClientResult(delivery,{li:6},ev),/jumlah/i);
assert.throws(()=>prepareClientResult(delivery,{li:3},ev),/alasan/i);
assert.throws(()=>prepareClientResult(delivery,{li:NaN},ev),/jumlah/i);
const result=prepareClientResult(delivery,{li:3},{...ev,rejectionReason:'Dua rusak'});assert.equal(result.received[0].qtyReceived,3);assert.equal(result.evidence.occurredAt,'2026-10-18T02:00:00.000Z');
console.log('client paper validation before pending lock: OK');
async function rejection(){
 const {executeGoodsCommand,GoodsCommandRejected}=require('./goods-command');
 assert.equal(typeof GoodsCommandRejected,'function','definitive rejection must unlock editing without treating transport failure as rollback');
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({error:'Invalid paper'},{status:409});await assert.rejects(()=>executeGoodsCommand(()=>({init:async()=>{}}),{eventId:'receipt',stage:'receipt',sourceId:'d',payload:{}}),GoodsCommandRejected)}finally{globalThis.fetch=original}
}
rejection().catch(e=>{console.error(e);process.exitCode=1});
