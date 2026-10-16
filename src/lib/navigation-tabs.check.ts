import assert from 'node:assert/strict'
import {tabHref} from './navigation-tabs'
const outer=tabHref('/finance/penutupan','','workspace','laporan')
assert.equal(outer,'/finance/penutupan?workspace=laporan')
const inner=tabHref('/finance/penutupan',outer.split('?')[1],'tab','buku-besar')
assert.equal(inner,'/finance/penutupan?workspace=laporan&tab=buku-besar','inner report must retain outer workspace')
assert.equal(tabHref('/finance/penutupan',inner.split('?')[1],'workspace','persetujuan'),'/finance/penutupan?workspace=persetujuan','changing workspace clears stale inner tab')
assert.equal(tabHref('/finance/laporan','detailId=one','tab','laba-rugi'),'/finance/laporan?detailId=one&tab=laba-rugi')
console.log('navigation-tabs: PASS')
