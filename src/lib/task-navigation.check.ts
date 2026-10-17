import assert from 'node:assert/strict';
import {getNavItemsForUser} from './navigation';
import fs from 'node:fs';
import {canAccessRoute} from './access-policy';
const all:any[]=[];
const po=getNavItemsForUser(all,'admin_po');
const finance=getNavItemsForUser(all,'finance');
const admin=getNavItemsForUser(all,'super_admin');
assert.equal(po.length,5,'five PO task workspaces');
assert.equal(finance.length,7,'seven Finance task workspaces');
assert.equal(admin.length,5,'five oversight workspaces');
assert.ok(po.some(x=>x.href==='/admin/operasi'));
assert.ok(finance.flatMap(x=>x.children||[]).some(x=>x.href==='/finance/salin?workspace=kurir'));
assert.ok(admin.flatMap(x=>x.children||[]).some(x=>x.href==='/finance/piutang'));
for (const page of [...po,...finance,...admin]) assert.ok(fs.existsSync(`src/app${page.href}/page.tsx`),`Missing task workspace ${page.href}`);
for(const role of ['admin_po','finance','super_admin'] as const){
 for(const group of getNavItemsForUser([],role)){
  for(const link of [group,...(group.children||[])]){
   assert.ok(canAccessRoute(role,link.href),`${role} cannot open its menu ${link.href}`);
   const route=link.href.split('?')[0];
   assert.ok(fs.existsSync(`src/app${route}/page.tsx`),`Missing child route ${link.href}`);
  }
 }
}
console.log('task-navigation: PASS');
