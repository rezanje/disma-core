import assert from 'node:assert/strict';
import {recordCreditNoteCommand,recordManualBillCommand,recordManualReceivableCommand,recordManualCashCommand,recordBankOpeningCommand,recordDepreciationCommand,recordCreditRefundCommand} from './finance-commands';
import {useAppStore} from './store';
async function main(){
 const calls:any[]=[];
 globalThis.fetch=async(url,init)=>{
  const body=JSON.parse(String(init?.body));calls.push({url,body});
  return new Response(JSON.stringify({eventId:body.eventId,invoices:[{id:body.payload.invoice?.id||'i',totalAmount:90,amountPaid:0,status:'Unpaid'}],creditNotes:[{id:body.payload.creditNoteId||body.eventId,amount:10}],vendorBills:[{id:body.payload.bill?.id||'ap'}],bankAccounts:[{id:body.payload.bank?.id||body.payload.transaction?.bankAccountId||body.payload.bankAccountId||'b',balance:200}],journalEntries:[{id:`cmd-${body.eventId}`}] ,journalLines:[{id:'l1'},{id:'l2'}],cashTransactions:[{id:`cmd-cash-${body.eventId}`}],pendingReturns:[],tukarFakturs:[],fixedAssets:body.payload.assetId?[{id:body.payload.assetId}]:[]}));
 };
 assert.equal(await recordCreditNoteCommand({eventId:'cn',invoiceId:'i',amount:10,reason:'Wrong price',cnNumber:'CN1',date:'2026-10-16'}),true);
 assert.equal(useAppStore.getState().invoices.find(i=>i.id==='i')?.totalAmount,90);
 assert.equal(await recordManualBillCommand({eventId:'ap',bill:{id:'ap'} as any,debitAccountCode:'6-9000'}),true);
 assert.equal(await recordManualReceivableCommand({eventId:'ar',invoice:{id:'ar'} as any}),true);
 assert.equal(await recordManualCashCommand({eventId:'cash',transaction:{id:'cash',bankAccountId:'b'} as any,counterAccountCode:'6-9000'}),true);
 assert.equal(await recordBankOpeningCommand({eventId:'bank',bank:{id:'bank'} as any,amount:100,date:'2026-10-16'}),true);
 assert.equal(await recordDepreciationCommand({eventId:'dep',assetId:'asset',date:'2026-10-16'}),true);
 assert.equal(await recordCreditRefundCommand({eventId:'refund',creditNoteId:'cn',bankAccountId:'b',amount:10,date:'2026-10-16'}),true);
 assert.deepEqual(calls.map(c=>c.body.kind),['credit-note','manual-bill','manual-receivable','manual-cash','bank-opening','depreciation','credit-refund']);
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'transaction rolled back'}),{status:409});
 const before=useAppStore.getState().invoices;
 assert.equal(await recordCreditNoteCommand({eventId:'retry',invoiceId:'i',amount:10,reason:'Wrong price',cnNumber:'CN2',date:'2026-10-16'}),false);
 assert.equal(useAppStore.getState().invoices,before);

 for(const malformed of [{},{eventId:'retry',skipped:true},{eventId:'wrong',invoices:[]},{eventId:'retry',invoices:[{id:'i'}],creditNotes:[],vendorBills:[],bankAccounts:[],journalEntries:[],journalLines:[],cashTransactions:[]}]){
  globalThis.fetch=async()=>new Response(JSON.stringify(malformed));
  assert.equal(await recordCreditNoteCommand({eventId:'retry',invoiceId:'i',amount:10,reason:'Wrong price',cnNumber:'CN2',date:'2026-10-16'}),false,'malformed2xx must never confirm commit');
  assert.equal(useAppStore.getState().invoices,before,'malformed result must not hydrate');
 }
 const noop={eventId:'dep-noop',noFinancialChange:true,fixedAssets:[{id:'asset'}],invoices:[],creditNotes:[],vendorBills:[],bankAccounts:[],journalEntries:[],journalLines:[],cashTransactions:[],pendingReturns:[],tukarFakturs:[]};
 globalThis.fetch=async()=>new Response(JSON.stringify(noop));
 assert.equal(await recordDepreciationCommand({eventId:'dep-noop',assetId:'asset',date:'2026-10-16'}),true,'explicit no-op still confirms durable command');
 globalThis.fetch=async()=>new Response(JSON.stringify({...noop,noFinancialChange:undefined}));
 assert.equal(await recordDepreciationCommand({eventId:'dep-noop',assetId:'asset',date:'2026-10-16'}),false,'missing journal without explicit no-op cannot confirm');
 let resolveResponse!:(response:Response)=>void;
 globalThis.fetch=()=>new Promise<Response>(resolve=>{resolveResponse=resolve});
 const pending=recordManualCashCommand({eventId:'slow',transaction:{id:'cash',bankAccountId:'b'} as any,counterAccountCode:'6-9000'});
 useAppStore.setState(state=>({_lastLocalMutationAt:(state._lastLocalMutationAt||0)+1,bankAccounts:[{id:'b',balance:777}] as any}));
 resolveResponse(new Response(JSON.stringify({eventId:'slow',invoices:[],creditNotes:[],vendorBills:[],bankAccounts:[{id:'b',balance:10}],journalEntries:[{id:'cmd-slow'}],journalLines:[{id:'l1'},{id:'l2'}],cashTransactions:[{id:'cmd-cash-slow'}],pendingReturns:[],tukarFakturs:[],fixedAssets:[]})));
 assert.equal(await pending,false,'older response must not overwrite newer local confirmed state');
 assert.equal(useAppStore.getState().bankAccounts[0].balance,777);
 console.log('finance-commands: PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
