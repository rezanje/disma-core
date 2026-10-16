const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const source=fs.readFileSync('src/components/office-paper-expense.tsx','utf8');
const ast=ts.createSourceFile('office.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='submit')handler=node.initializer;ts.forEachChild(node,visit)}visit(ast);assert.ok(handler);
const code=ts.transpileModule('module.exports='+handler.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const noop=()=>{};let success=0,resets=0;const calls=[];
const context={module:{exports:{}},Error,attempt:{current:null},inflight:{current:false},uuidv4:()=>String(Math.random()),recordType:'reimbursement',channel:'kurir',date:'2026-10-15T07:00',performedBy:'actual-courier',payeeId:'actual-payer',bankId:'',amount:'100',category:'Tol',description:'Bukti tol perjalanan',receiptUrl:'/uploads/proof.jpg',purchaseId:'purchase',
 validatePaperExpense:()=>null,recordPaperExpense:async(input)=>{calls.push(input);if(calls.length===1)throw Error('Response lost after commit')},toast:{error:noop,success:()=>{success++}},
 setPendingId:noop,setBusy:noop,setAmount:()=>{resets++},setDescription:noop,setReceiptUrl:noop,setDate:noop,setPurchaseId:noop};
vm.runInNewContext(code,context);const submit=context.module.exports,event={preventDefault:noop};
(async()=>{
 await submit(event);assert.equal(success,0);assert.equal(resets,0);assert.ok(context.attempt.current,'Uncertain response preserves the pending source');
 context.payeeId='wrong-later-edit';context.date='2026-10-16T09:00';await submit(event);
 assert.equal(calls[0].eventId,calls[1].eventId);assert.equal(calls[1].payeeId,'actual-payer');assert.equal(calls[1].performedBy,'actual-courier');assert.equal(calls[1].date,calls[0].date);
 assert.equal(success,1);assert.equal(resets,1);assert.equal(context.attempt.current,null);
 let release;context.recordPaperExpense=async()=>{calls.push('inflight');await new Promise(resolve=>{release=resolve})};
 const first=submit(event);await submit(event);assert.equal(calls.filter(call=>call==='inflight').length,1);release();await first;
 context.recordPaperExpense=async()=>{throw Object.assign(Error('Definite server rejection'),{safeToEdit:true})};await submit(event);assert.equal(context.attempt.current,null,'Known transaction rejection permits correcting the form');
 console.log('office paper form: awaited success, original payee/date, stable retries and in-flight guard passed');
})().catch(error=>{console.error(error);process.exitCode=1});
