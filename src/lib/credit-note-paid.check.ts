import assert from 'node:assert/strict'
import { creditLimit, validateCreditNote } from './credit-note'
const paid={id:'paid',totalAmount:100,amountPaid:100,status:'Paid'}
assert.equal(creditLimit(paid),100,'Paid invoice correction creates customer refund liability, not a negative receivable')
assert.equal(validateCreditNote(paid,40,'Late return accepted'),null)
assert.ok(validateCreditNote(paid,101,'Late return accepted'))
assert.ok(validateCreditNote(paid,Infinity,'Late return accepted'))
assert.ok(validateCreditNote({...paid,status:'Cancelled',totalAmount:0},1,'Late return accepted'))
assert.equal(creditLimit({...paid,status:'Draft'}),0,'Unposted delivery draft cannot reverse revenue');
console.log('paid invoice credit-note limit checks passed')
