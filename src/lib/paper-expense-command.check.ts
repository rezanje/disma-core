import assert from 'node:assert/strict'
import Module from 'node:module'
const original=(Module as any)._load
let state:any={expenses:[],reimbursements:[],_lastLocalMutationAt:0}
const store={getState:()=>state,setState:(fn:any)=>{state={...state,...fn(state)}}}
;(Module as any)._load=function(id:string,...args:unknown[]){if(id==='./store')return{useAppStore:store};return original.call(this,id,...args)}
const {recordPaperExpense,validatePaperExpense}=require('./paper-expense-command')
const input={eventId:'paper-event',id:'paper-event',recordType:'expense',date:'2026-10-15T07:00:00Z',performedBy:'courier',bankAccountId:'wallet',amount:100,category:'Tol',description:'Biaya tol perjalanan',receiptUrl:'/uploads/paper.jpg',channel:'kurir'}
async function main(){
 assert.equal(validatePaperExpense(input),null)
 for(const patch of [{performedBy:''},{receiptUrl:''},{amount:NaN},{date:'bad'},{bankAccountId:''}]) assert.ok(validatePaperExpense({...input,...patch}))
 assert.ok(validatePaperExpense({...input,recordType:'reimbursement',payeeId:''}))
 const row={id:input.id,date:input.date,reporterId:'courier',performedBy:'courier',sourceBankAccountId:'wallet',amount:100,category:input.category,description:input.description,channel:input.channel,receiptUrl:input.receiptUrl,recordedBy:'finance',recordedAt:'2026-10-16T09:00:00Z',status:'Pending Audit'}
 const calls:any[]=[]
 globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(String(init?.body)));return Response.json({eventId:'paper-event',noFinancialChange:true,expenses:[row],reimbursements:[],journalEntries:[],journalLines:[],cashTransactions:[]})}
 await recordPaperExpense(input)
 await recordPaperExpense(input)
 assert.equal(calls[0].kind,'paper-expense');assert.equal(calls[0].payload.performedBy,'courier');assert.equal(calls[0].eventId,calls[1].eventId)
 assert.equal(state.expenses.length,1);assert.equal(state.expenses[0].date,input.date)
 const before=state.expenses
 globalThis.fetch=async()=>Response.json({})
 await assert.rejects(()=>recordPaperExpense(input));assert.equal(state.expenses,before)
 globalThis.fetch=async()=>Response.json({eventId:'paper-event',noFinancialChange:true,expenses:[{...row,channel:'sourcing'}],reimbursements:[],journalEntries:[],journalLines:[],cashTransactions:[]})
 await assert.rejects(()=>recordPaperExpense(input));assert.equal(state.expenses,before)
 globalThis.fetch=async()=>Response.json({eventId:'paper-event',noFinancialChange:true,expenses:[{...row,recordedBy:undefined}],reimbursements:[],journalEntries:[],journalLines:[],cashTransactions:[]})
 await assert.rejects(()=>recordPaperExpense(input));assert.equal(state.expenses,before)
 const reimb={...input,eventId:'reimb',id:'reimb',recordType:'reimbursement',payeeId:'actual-payer',bankAccountId:undefined}
 globalThis.fetch=async()=>Response.json({eventId:'reimb',noFinancialChange:true,expenses:[],reimbursements:[{...row,id:'reimb',category:undefined,title:`${input.category}: ${input.description}`,userId:'actual-payer',status:'Pending'}],journalEntries:[],journalLines:[],cashTransactions:[]})
 await recordPaperExpense(reimb);assert.equal(state.reimbursements[0].userId,'actual-payer')
 console.log('paper expense: explicit event/person/payee/source/proof, retry and no fake success passed')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{(Module as any)._load=original})
