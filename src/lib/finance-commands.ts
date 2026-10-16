import {useAppStore} from './store';
import type {BankAccount,CashTransaction,Invoice,VendorBill} from '@/types';
import {toast} from 'sonner';

type Line={accountCode:string;amount:number};
type CashInput={eventId:string;transaction:CashTransaction;counterAccountCode:string;debits?:Line[];credits?:Line[]};
async function command(kind:string,eventId:string,payload:unknown):Promise<boolean>{
 try{
  const startedAt=useAppStore.getState()._lastLocalMutationAt;
  const response=await fetch('/api/accounting/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,eventId,payload})});
  const result=await response.json();
  if(!response.ok||result?.error) throw new Error(result?.error||'Pencatatan gagal');
  const keys=['invoices','creditNotes','vendorBills','bankAccounts','journalEntries','journalLines','cashTransactions','pendingReturns','fixedAssets','tukarFakturs'] as const;
  if(!result || result.eventId!==eventId || keys.some(key=>!Array.isArray(result[key]) || result[key].some((row:unknown)=>!row || typeof row!=='object' || typeof (row as {id?:unknown}).id!=='string' || !(row as {id:string}).id))) throw new Error('Server belum mengonfirmasi transaksi. Coba lagi dengan identitas yang sama.');
  const input=payload as Record<string,any>;
  const required:Record<string,[string,string]>= {
   'credit-note':['creditNotes',eventId], 'manual-bill':['vendorBills',input.bill?.id],
   'manual-receivable':['invoices',input.invoice?.id], 'manual-cash':['cashTransactions',`cmd-cash-${eventId}`],
   'bank-opening':['bankAccounts',input.bank?.id], 'depreciation':['fixedAssets',input.assetId],
   'credit-refund':['creditNotes',input.creditNoteId],
  };
  const [sourceKey,sourceId]=required[kind]||[];
  const includes=(key:string,id:unknown)=>typeof id==='string' && result[key].some((row:{id:string})=>row.id===id);
  const bankId=kind==='bank-opening'?input.bank?.id:kind==='manual-cash'?input.transaction?.bankAccountId:input.bankAccountId;
  const hasCash=['manual-cash','credit-refund'].includes(kind)||(kind==='bank-opening'&&input.amount>0);
  const needsJournal=!(kind==='bank-opening'&&input.amount===0)&&!(kind==='depreciation'&&result.noFinancialChange===true);
  const complete=sourceKey&&includes(sourceKey,sourceId)
   && (!bankId||includes('bankAccounts',bankId))
   && (kind!=='credit-note'||includes('invoices',input.invoiceId))
   && (!hasCash||includes('cashTransactions',`cmd-cash-${eventId}`))
   && (!needsJournal||(includes('journalEntries',`cmd-${eventId}`)&&result.journalLines.length>=2));
  if(!complete) throw new Error('Hasil transaksi tidak lengkap. Muat ulang atau coba lagi dengan identitas yang sama.');
  if(useAppStore.getState()._lastLocalMutationAt!==startedAt) throw new Error('Data berubah saat transaksi diproses. Ulangi identitas transaksi yang sama untuk mengambil hasil terbaru.');
  useAppStore.setState(state=>{
   const changes:Record<string,unknown>={_lastLocalMutationAt:Math.max(Date.now(),(state._lastLocalMutationAt||0)+1)};
   for(const key of keys){
    const rows=result[key];if(!Array.isArray(rows)||rows.length===0)continue;
    const ids=new Set(rows.map((row:{id:string})=>row.id));
    changes[key]=[...rows,...state[key].filter((row:{id:string})=>!ids.has(row.id))];
   }
   return changes;
  });
  return true;
 }catch(error){toast.error(error instanceof Error?error.message:'Pencatatan gagal. Gunakan ID yang sama untuk mencoba lagi.');return false;}
}
export const recordCreditNoteCommand=(input:{eventId:string;invoiceId:string;amount:number;reason:string;cnNumber:string;date:string;createdBy?:string;sourceReturnId?:string})=>command('credit-note',input.eventId,input);
export const recordManualBillCommand=(input:{eventId:string;bill:VendorBill;debitAccountCode:string})=>command('manual-bill',input.eventId,input);
export const recordManualReceivableCommand=(input:{eventId:string;invoice:Invoice})=>command('manual-receivable',input.eventId,input);
export const recordManualCashCommand=(input:CashInput)=>command('manual-cash',input.eventId,input);
export const recordBankOpeningCommand=(input:{eventId:string;bank:BankAccount;amount:number;date:string})=>command('bank-opening',input.eventId,input);

export const recordDepreciationCommand=(input:{eventId:string;assetId:string;date:string})=>command('depreciation',input.eventId,input);
export const recordCreditRefundCommand=(input:{eventId:string;creditNoteId:string;bankAccountId:string;amount:number;date:string})=>command('credit-refund',input.eventId,input);
