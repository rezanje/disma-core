import assert from 'node:assert/strict'
import { loadBankReconciliation, importBankStatement, matchBankStatement } from './bank-reconciliation'
async function main(){
 const snapshot={statement:{id:'s',bankAccountId:'b'},rows:[{id:'r',statementId:'s',date:'2026-10-01',amount:100,type:'CR' as const,description:'Client',rowIndex:1}],matches:[]}
 const stored={statements:[snapshot.statement],rows:snapshot.rows,matches:[] as unknown[]}
 globalThis.fetch=async(_url,init)=>{
  if(!init?.method)return Response.json(stored)
  const body=JSON.parse(String(init.body))
  if(body.action==='match') stored.matches=[{id:body.eventId,rowId:body.rowId,statementId:'s',journalLineId:body.journalLineId}]
  return Response.json({...snapshot,matches:stored.matches})
 }
 assert.equal((await importBankStatement('b','statement.csv',snapshot.rows)).statement.id,'s')
 const one=await matchBankStatement('s','r','line')
 const two=await matchBankStatement('s','r','line')
 assert.equal(one.matches[0].id,two.matches[0].id,'Match ID deterministic across sessions')
 assert.equal((await loadBankReconciliation()).matches[0].journalLineId,'line','Reload reads persisted matching')
 globalThis.fetch=async()=>Response.json({})
 await assert.rejects(loadBankReconciliation)
 await assert.rejects(()=>matchBankStatement('s','r','line'))
 console.log('durable reconciliation client reload and checked response passed')
}
main().catch(error=>{console.error(error);process.exitCode=1})
