import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getNavItemsForUser} from './navigation';
import {getActiveNavigation} from './navigation-tabs';

const finance=getNavItemsForUser([],'finance');
const plan=finance.find(group=>group.href==='/finance/rencana')!;
assert.equal(plan.children!.find(child=>child.key==='finance_online_purchase')!.href,'/finance/rencana?workspace=pesanan','vendor submenu must open the matching workspace tab');
assert.equal(plan.children!.find(child=>child.key==='admin_vendors')!.href,'/finance/rencana?workspace=vendor');
const active=(path:string,search='')=>getActiveNavigation(finance,path,search);
assert.equal(active('/finance/rencana')?.childKey,'finance_purchase_plan','the default tab must highlight its submenu');
assert.equal(active('/finance/rencana','workspace=pesanan')?.childKey,'finance_online_purchase');
assert.equal(active('/finance/rencana','detailId=vendor-one&workspace=vendor&filter=active')?.childKey,'admin_vendors','detail and filter parameters must not remove the selection');
assert.equal(active('/finance/rencana','workspace=unknown')?.childKey,'finance_purchase_plan','unknown tabs fall back just as TabHost does');
assert.equal(active('/finance/tagihan','tab=penagihan&workspace=tagihan')?.childKey,'finance_collections','the more specific nested tab wins');
assert.equal(active('/finance/tagihan','workspace=tagihan&tab=umur')?.childKey,'finance_invoices','other nested invoice tabs keep their parent selected');
assert.equal(active('/admin/dropship')?.groupKey,plan.key,'external child pages keep their group selected');
assert.equal(active('/finance')?.groupKey,'admin_hari_ini');
assert.equal(active('/missing'),null);

for(const role of ['admin_po','finance','super_admin'] as const){
 const groups=getNavItemsForUser([],role);
 for(const group of groups){
  for(const child of group.children||[]){
   const [path,search='']=child.href.split('?');
   const workspace=new URLSearchParams(search).get('workspace');
   if(!workspace)continue;
   const source=fs.readFileSync(`src/app${path}/page.tsx`,'utf8');
   assert.match(source,new RegExp(`key:\\s*['\"]${workspace}['\"]`),`unknown tab in ${child.href}`);
   const selected=getActiveNavigation(groups,path,search);
   assert.equal(selected?.groupKey,group.key,child.href);
   assert.equal(selected?.childKey,child.key,child.href);
  }
 }
}
console.log('workspace links, default tabs, nested selection and query-independent menu checks passed');

// Render the actual TabHost against the same URLs used by the sidebar.
const Module=require('node:module');
const originalLoad=Module._load;
let search='';
Module._load=function(request:string,...args:unknown[]){
 if(request==='next/navigation')return {
  usePathname:()=>'/finance/rencana',useSearchParams:()=>new URLSearchParams(search),useRouter:()=>({replace(){}}),
 };
 return originalLoad.call(this,request,...args);
};
const {TabHost}=require('../components/layout/tab-host');
Module._load=originalLoad;
const {createElement}=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const tabs=['rencana','pesanan','vendor'].map(key=>({key,title:key,render:()=>createElement('main',null,`CURRENT:${key}`)}));
for(const [query,expected] of [['','rencana'],['workspace=pesanan','pesanan'],['workspace=vendor&detailId=one','vendor'],['workspace=unknown','rencana']]){
 search=query;
 const html=renderToStaticMarkup(createElement(TabHost,{title:'Rencana',tabs,queryKey:'workspace'}));
 assert.ok(html.includes(`CURRENT:${expected}`),`workspace body differs from menu URL ${query}`);
 const selected=getActiveNavigation(finance,'/finance/rencana',query);
 assert.equal(new URL(selected!.href,'https://navigation.invalid').searchParams.get('workspace'),expected);
}
console.log('real TabHost content stays aligned with the selected sidebar URL');
