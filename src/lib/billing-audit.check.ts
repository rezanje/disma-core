import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

for (const name of ['billing-documents', 'billing-surfaces', 'billing-pdf', 'finance/bank-reconciliation-api']) {
  const result = spawnSync(process.execPath, ['-r', path.join(process.cwd(), 'test/offline-register.cjs'), path.join(process.cwd(), `tests/${name}.cjs`)], { encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`)
  console.log(result.stdout.trim())
}
