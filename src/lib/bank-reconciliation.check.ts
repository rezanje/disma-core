import assert from 'node:assert/strict'
import { parseBankStatementCsv, suggestBankStatementMatch } from './bank-reconciliation'
const rows=parseBankStatementCsv('Date,Description,Amount,Type\n2026-10-01,"Client, first transfer",100,CR\n2026-10-02,"Vendor ""ABC""",40,DB')
assert.equal(rows[0].description,'Client, first transfer')
assert.equal(rows[1].description,'Vendor "ABC"')
assert.throws(()=>parseBankStatementCsv('Date,Description,Amount,Type\nbad,x,100,CR'))
assert.throws(()=>parseBankStatementCsv('Date,Description,Amount,Type\n2026-10-01,x,NaN,CR'))
const accounts=[{id:'bank1',accountCode:'1-1001'},{id:'bank2',accountCode:'1-1002'}]
const entries=[{id:'je1',transactionDate:'2026-10-01'}]
const lines=[{id:'wrong-bank',journalEntryId:'je1',accountId:'bank2',debitAmount:100,creditAmount:0},{id:'right',journalEntryId:'je1',accountId:'bank1',debitAmount:100,creditAmount:0}]
assert.equal(suggestBankStatementMatch(rows[0],'1-1001',lines,entries,accounts,new Set())?.id,'right')
assert.equal(suggestBankStatementMatch(rows[0],'1-1001',lines,entries,accounts,new Set(['right'])),undefined)
assert.equal(suggestBankStatementMatch(rows[0],'',lines,entries,accounts,new Set()),undefined)
console.log('bank reconciliation preview validated')
