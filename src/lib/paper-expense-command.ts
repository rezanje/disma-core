import {useAppStore} from './store'
export const PAPER_EXPENSE_CATEGORIES=['Bensin','Tol','Parkir','Kuli','Makan','Lainnya'] as const
export type PaperExpenseInput={
 eventId:string;id:string;recordType:'expense'|'reimbursement';channel:'sourcing'|'kurir';
 date:string;performedBy:string;payeeId?:string;bankAccountId?:string;amount:number;
 category:string;description:string;receiptUrl:string;purchaseId?:string;
}
export function validatePaperExpense(input:PaperExpenseInput):string|null {
 if(!input.eventId || input.id!==input.eventId) return 'Identitas kejadian belum tersedia.'
 if(!['expense','reimbursement'].includes(input.recordType)) return 'Pilih sumber uang sesuai bukti.'
 if(!['sourcing','kurir'].includes(input.channel)) return 'Pilih asal kertas pengeluaran.'
 if(!input.performedBy) return 'Pilih pelaksana sesuai kertas.'
 if(input.recordType==='reimbursement' && !input.payeeId) return 'Pilih orang yang membayar dengan uang pribadi.'
 if(input.recordType==='expense' && !input.bankAccountId) return 'Pilih kas atau rekening perusahaan yang benar-benar dipakai.'
 if(!input.date || Number.isNaN(new Date(input.date).getTime())) return 'Isi waktu kejadian sebenarnya.'
 if(!Number.isFinite(input.amount) || input.amount<=0 || Math.abs(input.amount*100-Math.round(input.amount*100))>0.00001) return 'Isi nominal positif dengan paling banyak dua desimal.'
 if(!(PAPER_EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) return 'Pilih kategori biaya operasional.'
 if(input.description.trim().length<5) return 'Isi keterangan dan nomor bukti minimal lima karakter.'
 if(!input.receiptUrl) return 'Unggah foto atau scan bukti asli.'
 return null
}
export class PaperExpenseRejected extends Error {
 constructor(message:string,readonly safeToEdit:boolean){super(message)}
}

/** Create one pending source. Accounting follows the separate canonical approval. */
export async function recordPaperExpense(input:PaperExpenseInput):Promise<void> {
 const error=validatePaperExpense(input)
 if(error) throw new Error(error)
 const stamp=useAppStore.getState()._lastLocalMutationAt
 const {eventId,...payload}=input
 const response=await fetch('/api/accounting/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'paper-expense',eventId,payload})})
 const result=await response.json()
 if(!response.ok || result?.error) throw new PaperExpenseRejected(result?.error || 'Salinan belum tersimpan. Ulangi data yang sama.',[400,401,403,409].includes(response.status))
 const key=input.recordType==='expense'?'expenses':'reimbursements'
 const row=Array.isArray(result[key])?result[key].find((row:{id:string})=>row.id===input.id):undefined
 const financialKeys=['journalEntries','journalLines','cashTransactions']
 if(result.eventId!==eventId || result.noFinancialChange!==true || !Array.isArray(result.expenses) || !Array.isArray(result.reimbursements)
  || financialKeys.some(key=>!Array.isArray(result[key]) || result[key].length!==0)
  || !row || row.amount!==input.amount || new Date(row.date).getTime()!==new Date(input.date).getTime()
  || !row.recordedBy || !row.recordedAt || Number.isNaN(new Date(row.recordedAt).getTime()) || row.performedBy!==input.performedBy
  || row.receiptUrl!==input.receiptUrl || (input.purchaseId && row.purchaseId!==input.purchaseId)
  || row.channel!==input.channel || row.description!==input.description
  || (input.recordType==='expense' ? row.reporterId!==input.performedBy || row.sourceBankAccountId!==input.bankAccountId || row.category!==input.category : row.userId!==input.payeeId || row.title!==`${input.category}: ${input.description}`)) throw new Error('Hasil pencatatan belum lengkap. Ulangi dengan identitas dan data yang sama.')
 if(useAppStore.getState()._lastLocalMutationAt!==stamp) throw new Error('Salinan mungkin tersimpan; ada perubahan lain saat memuat hasil. Ulangi identitas yang sama untuk memastikan status terbaru.')
 useAppStore.setState(state=>({[key]:[row,...state[key].filter(source=>source.id!==row.id)],_lastLocalMutationAt:Math.max(Date.now(),state._lastLocalMutationAt+1)}))
}
