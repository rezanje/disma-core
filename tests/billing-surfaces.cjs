const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const files = {
 cash:fs.readFileSync('src/app/finance/cash-bank/page.tsx','utf8'),
 ap:fs.readFileSync('src/app/finance/ap-aging/page.tsx','utf8'),
 ledger:fs.readFileSync('src/app/finance/ledger/page.tsx','utf8'),
 invoices:fs.readFileSync('src/app/finance/invoices/page.tsx','utf8'),
 recon:fs.readFileSync('src/app/finance/reconciliation/page.tsx','utf8'),
};
function handler(source,name) {
 const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let found;
 function visit(node) { if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name) found=node.initializer; ts.forEachChild(node,visit); }
 visit(ast); assert.ok(found, name);
 return ts.transpileModule('module.exports = '+found.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
}
async function run(source,name,context) {
 const vm=require('node:vm'); const c={module:{exports:{}},...context}; vm.runInNewContext(handler(source,name),c); return c.module.exports();
}
(async()=>{
 let writes=0, errors=[];
 const mutation=async()=>{writes++};
 const toast={error:message=>errors.push(message),loading:()=>1,success:()=>{}};
 await run(files.cash,'handleSaveEditTx',{editingTx:{id:'cash'},toast,setIsSubmitting:()=>{},updateCashTransaction:mutation,setEditingTx:()=>{}});
 assert.equal(writes,0,'Posted cash edits must fail closed until exact source-linked reversal exists');
 await run(files.cash,'handleConfirmDelete',{txToDelete:'cash',toast,setIsSubmitting:()=>{},deleteCashTransaction:mutation,setTxToDelete:()=>{}});
 await run(files.cash,'handleBulkDelete',{selectedTxIds:['cash'],toast,setIsSubmitting:()=>{},bulkDeleteCashTransactions:mutation,setSelectedTxIds:()=>{},setIsBulkDeleteConfirmOpen:()=>{}});
 await run(files.ap,'handleDelete',{toast,confirm:()=>true,createAccountingEntry:mutation,deleteVendorBill:mutation});
 await run(files.ledger,'handleSaveEdit',{toast,editLines:[],editingEntry:{id:'posted'},editDesc:'x',updateJournalEntry:mutation,setEditingEntry:()=>{}});
 assert.equal(writes,0,'Cash/GL/AP mutations must not post guessed reversals or remove history');
 assert.ok(errors.length>=4);
 assert.ok(!files.recon.includes("{ reconciliationStatus: 'Terverifikasi' }"),'Recon may not approve sourcing without posting');
 assert.ok(!files.recon.includes("{ status: 'Approved' }"),'Recon may not approve expenses without posting');
 // An uncertain retry keeps the same event identity and never increments paid locally.
 const noop=()=>{}, receiptCalls=[], apCalls=[];
 const receiptContext={activeInvoice:{id:'i',totalAmount:100,amountPaid:0}, paymentAmount:40,paymentBankAccountId:'bank',paymentDate:'2026-10-16',allocations:{},childInvoices:[],totalAllocated:0,
 paymentAttempt:{current:null},paymentInFlight:{current:false},uuidv4:()=>String(Math.random()),toast,console,
 setIsRecordingPayment:noop,setActiveInvoice:noop,setPaymentAmount:noop,setPaymentDate:noop,setPaymentBankAccountId:noop,setAllocations:noop,
 recordPaymentReceived:async(...args)=>{receiptCalls.push(args);return receiptCalls.length>1},updateInvoice:mutation,formatRupiah:String};
 await run(files.invoices,'handleRecordPayment',receiptContext);
 await run(files.invoices,'handleRecordPayment',receiptContext);
 assert.equal(receiptCalls[0][4],receiptCalls[1][4]);
 assert.equal(writes,0,'Atomic receipt hydration is authoritative; UI cannot add amountPaid twice');
 const apContext={payingBill:{id:'b',outstanding:100},isPaying:false,pBankId:'bank',pAmount:40,pDate:'2026-10-16',pNote:'',bankAccounts:[{id:'bank',balance:100}],
 vendorPaymentAttempt:{current:null},vendorPaymentInFlight:{current:false},uuidv4:()=>String(Math.random()),toast,formatRupiah:String,
 setIsPaying:noop,setPayingBill:noop,resetPayForm:noop,payVendorBill:async(id,payment)=>{apCalls.push(payment);if(apCalls.length===1)throw Error('Lost response')}};
 await run(files.ap,'handlePay',apContext); await run(files.ap,'handlePay',apContext);
 assert.equal(apCalls[0].id,apCalls[1].id,'Vendor payment identity survives an uncertain response');
 const manualCalls=[]; let manualClosed=0;
 const manualContext={manualBusy:{current:false},manualAttempt:{current:null},manualClientId:'client',manualAmount:100,manualInvoiceRef:'AR1',manualIssueDate:'2026-10-01',manualDueDate:'2026-10-30',uuidv4:()=>String(Math.random()),toast,
 setIsCreatingManualReceivable:noop,resetManualReceivableForm:()=>{manualClosed++},setIsManualReceivableOpen:noop,
 recordManualReceivableCommand:async(input)=>{manualCalls.push(input);return manualCalls.length>1}};
 await run(files.invoices,'handleCreateManualReceivable',manualContext);
 assert.equal(manualClosed,0,'Unconfirmed atomic AR creation keeps form and stable event');
 await run(files.invoices,'handleCreateManualReceivable',manualContext);
 assert.equal(manualCalls[0].eventId,manualCalls[1].eventId);assert.equal(manualClosed,1);
 const vm=require('node:vm'), stableContext={module:{exports:{}},uuidv4:()=>String(Math.random())};
 vm.runInNewContext(handler(files.cash,'stableId'),stableContext);
 const transferCalls=[];
 const cashContext={cashBusy:{current:false},isSubmitting:false,bankId:'source',targetBankId:'target',amount:50,description:'Move',txDate:'2026-10-16',txType:'Transfer',category:'',counterpart:'',receiptUrl:'',cicilanPokok:0,pendingCash:{current:null},bankRequiresCfoApproval:()=>false,stableId:stableContext.module.exports,toast,
 recordCashTransfer:async(input)=>{transferCalls.push(input);return transferCalls.length>1},setIsSubmitting:noop,setIsAddTxOpen:noop,setAmount:noop,setDescription:noop,setCounterpart:noop,setCategory:noop,setTargetBankId:noop,setReceiptUrl:noop,setCicilanPokok:noop,setLoanValue:noop,setLoanMonths:noop};
 await run(files.cash,'handleSaveTx',cashContext);await run(files.cash,'handleSaveTx',cashContext);
 assert.equal(transferCalls[0].eventId,transferCalls[1].eventId,'Atomic transfer retry retains both-leg event identity');
 assert.equal(writes,0);
 const refundCalls=[];
 const refundContext={refundInFlight:{current:false},refundAttempt:{current:null},refundCredit:{id:'cn',refundableAmount:100,refundedAmount:0},creditNotes:[],refundBank:'bank',refundAmount:40,refundDate:'2026-10-16',uuidv4:()=>String(Math.random()),toast,setRefundBusy:noop,setRefundCredit:noop,
 recordCreditRefundCommand:async(input)=>{refundCalls.push(input);return refundCalls.length>1}};
 await run(files.invoices,'handleCreditRefund',refundContext);await run(files.invoices,'handleCreditRefund',refundContext);
 assert.equal(refundCalls[0].eventId,refundCalls[1].eventId,'Refund lost response retry keeps event identity');
 assert.equal(refundCalls[0].creditNoteId,'cn');assert.equal(writes,0);
 console.log('billing financial entry surfaces fail-closed checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
