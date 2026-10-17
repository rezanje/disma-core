import assert from 'node:assert/strict';
import { isReturnSplitValid, isSwapSplitValid } from './vendor-return';

// isReturnSplitValid: three buckets, non-negative, summing to the return total
assert.equal(isReturnSplitValid({ pass: 10, buang: 0, vendor: 0 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 5 }, 10), true);
assert.equal(isReturnSplitValid({ pass: 3, buang: 2, vendor: 4 }, 10), false); // sums to 9
assert.equal(isReturnSplitValid({ pass: -1, buang: 6, vendor: 5 }, 10), false); // negative
assert.equal(isReturnSplitValid({ pass: 0.1, buang: 0.2, vendor: 0.7 }, 1), true); // float tolerant
assert.equal(isReturnSplitValid({ pass: NaN, buang: 0, vendor: 0 }, 10), false); // NaN

// isSwapSplitValid: replacement QC split, non-negative, summing to the vendor-return qty
assert.equal(isSwapSplitValid({ pass: 5, reject: 0 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 2 }, 5), true);
assert.equal(isSwapSplitValid({ pass: 3, reject: 1 }, 5), false); // sums to 4
assert.equal(isSwapSplitValid({ pass: 2, reject: -1 }, 1), false); // negative

console.log('vendor-return.check: all assertions passed');

const {balanceReturnSplit}=require('./vendor-return');
assert.equal(typeof balanceReturnSplit,'function');
assert.deepEqual(balanceReturnSplit({pass:3,buang:0,vendor:0},3,'vendor',3),{pass:0,buang:0,vendor:3});
assert.deepEqual(balanceReturnSplit({pass:0,buang:0,vendor:3},3,'buang',2),{pass:0,buang:2,vendor:1});
assert.deepEqual(balanceReturnSplit({pass:0,buang:2,vendor:1},3,'pass',2),{pass:2,buang:0,vendor:1});
for(const key of ['pass','buang','vendor'])for(const value of [-1,0,0.1,2,3,8,NaN]){
 const result=balanceReturnSplit({pass:1,buang:1,vendor:1},3,key,value);
 assert.ok(isReturnSplitValid(result,3));assert.ok(Object.values(result).every((n:any)=>n>=0));
}
const {returnEvidenceError}=require('./vendor-return');
assert.equal(typeof returnEvidenceError,'function');
const evidence={performedBy:'qc',occurredAt:'2026-10-17T23:16',paperNumber:'QC-ASLI'};
assert.equal(returnEvidenceError(evidence),'','photo is optional for return QC');
assert.match(returnEvidenceError({...evidence,performedBy:''}),/pelaksana/i);
assert.match(returnEvidenceError({...evidence,occurredAt:''}),/waktu/i);
assert.match(returnEvidenceError({...evidence,occurredAt:'invalid'}),/waktu/i);
assert.match(returnEvidenceError({...evidence,paperNumber:' '}),/nomor berkas/i);
const {vendorReturnSubmitMessage}=require('./vendor-return');
assert.equal(typeof vendorReturnSubmitMessage,'function');
assert.match(vendorReturnSubmitMessage('Lengkapi laporan belanja sebelum penyelesaian biaya retur vendor'),/bukan.*foto/i);
assert.match(vendorReturnSubmitMessage('Lengkapi laporan belanja sebelum penyelesaian biaya retur vendor'),/harga beli/i);
assert.equal(vendorReturnSubmitMessage('Retur vendor sudah selesai'),'Retur vendor sudah selesai');
