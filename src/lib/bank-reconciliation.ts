export interface BankStatementRow { id: string; date: string; description: string; amount: number; type: 'CR'|'DB'; reconciled: boolean; matchedJournalId?: string }

/** Four-column statement CSV; quoted commas, quotes and line breaks are preserved. */
export function parseBankStatementCsv(text: string): BankStatementRow[] {
  const records: string[][]=[]; let row:string[]=[]; let value=''; let quoted=false
  for(let i=0;i<text.length;i++) {
    const char=text[i]
    if(char==='"') {
      if(quoted && text[i+1]==='"') {value+='"';i++} else quoted=!quoted
    } else if(char===',' && !quoted) {row.push(value);value=''}
    else if((char==='\n' || char==='\r') && !quoted) {
      if(char==='\r' && text[i+1]==='\n') i++
      row.push(value);if(row.some(cell=>cell.trim())) records.push(row);row=[];value=''
    } else value+=char
  }
  if(quoted) throw new Error('CSV memiliki kutipan yang belum ditutup.')
  row.push(value);if(row.some(cell=>cell.trim())) records.push(row)
  if(!records.length || records[0].length!==4) throw new Error('Format CSV: Date,Description,Amount,Type.')
  return records.slice(1).map((cells,index)=> {
    if(cells.length!==4) throw new Error(`Baris ${index+2}: diperlukan empat kolom.`)
    const [date,description,rawAmount,rawType]=cells.map(cell=>cell.trim())
    const amount=Number(rawAmount), type=rawType.toUpperCase()
    if(!date || Number.isNaN(new Date(date).getTime()) || !Number.isFinite(amount) || amount<=0 || !['CR','DB'].includes(type)) throw new Error(`Baris ${index+2}: tanggal, jumlah positif atau CR/DB tidak valid.`)
    return {id:`statement-${index}`,date,description,amount,type:type as 'CR'|'DB',reconciled:false}
  })
}

export function suggestBankStatementMatch<T extends {id:string;journalEntryId:string;accountId:string;debitAmount:number;creditAmount:number}>(
  row: BankStatementRow, accountCode:string,
  lines:T[], entries:{id:string;transactionDate:string}[], accounts:{id:string;accountCode:string}[], usedLineIds:Set<string>,
): T|undefined {
  if(!accountCode || row.reconciled) return undefined
  return lines.find(line=> {
    if(usedLineIds.has(line.id) || accounts.find(account=>account.id===line.accountId)?.accountCode!==accountCode) return false
    const entry=entries.find(entry=>entry.id===line.journalEntryId)
    if(!entry || Math.abs(new Date(entry.transactionDate).getTime()-new Date(row.date).getTime())>7*86400000) return false
    return row.type==='CR' ? line.debitAmount===row.amount && !line.creditAmount : line.creditAmount===row.amount && !line.debitAmount
  })
}

export interface BankReconciliationStatement { id:string;bankAccountId:string;fileName:string;importedAt:string;importedBy:string }
export interface BankReconciliationRow extends Omit<BankStatementRow, 'reconciled'> {statementId:string;rowIndex:number}
export interface BankReconciliationMatch {id:string;statementId:string;rowId:string;journalLineId:string;matchedAt:string;matchedBy:string}
export interface BankReconciliationData {statements:BankReconciliationStatement[];rows:BankReconciliationRow[];matches:BankReconciliationMatch[]}
export interface BankReconciliationSnapshot {statement:BankReconciliationStatement;rows:BankReconciliationRow[];matches:BankReconciliationMatch[]}
const reconciliationUrl='/api/accounting/bank-reconciliation'
export async function loadBankReconciliation():Promise<BankReconciliationData> {
  const response=await fetch(reconciliationUrl,{cache:'no-store'})
  const result=await response.json()
  if(!response.ok || !Array.isArray(result.statements) || !Array.isArray(result.rows) || !Array.isArray(result.matches)) throw new Error(result.error||'Data rekonsiliasi belum terkonfirmasi.')
  return result
}
async function postBankReconciliation(input:unknown):Promise<BankReconciliationSnapshot> {
  const response=await fetch(reconciliationUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
  const result=await response.json()
  if(!response.ok || !result.statement?.id || !Array.isArray(result.rows) || !Array.isArray(result.matches)) throw new Error(result.error||'Penyimpanan rekonsiliasi belum terkonfirmasi. Ulangi data yang sama.')
  return result
}
export function importBankStatement(bankAccountId:string,fileName:string,rows:Pick<BankStatementRow,'date'|'description'|'amount'|'type'>[]) {
  return postBankReconciliation({action:'import',bankAccountId,fileName,rows:rows.map(({date,description,amount,type})=>({date,description,amount,type}))})
}
export function matchBankStatement(statementId:string,rowId:string,journalLineId:string) {
  // Identity follows the exact selected source pair, including after reload/lost response.
  return postBankReconciliation({action:'match',eventId:`match:${rowId}`,statementId,rowId,journalLineId})
}
