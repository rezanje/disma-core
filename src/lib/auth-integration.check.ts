import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase-admin';
import { supabaseAdmin as genericDb } from './supabase';
import { createSessionService, SESSION_COOKIE, type SessionRow, type Identity } from './server-session';
import { requireApiUser, apiAuthResponse } from './api-auth';
import { GET as getSession, POST as login, DELETE as logout } from '../app/api/auth/session/route';
import { POST as genericWrite, GET as genericRead } from '../app/api/db/route';
import { POST as tfCommand } from '../app/api/tukar-faktur/route';
import { POST as retiredCash } from '../app/api/accounting/cash/route';
import { POST as retiredJournal } from '../app/api/accounting/journal/route';
import { proxy } from '../proxy';

(async()=>{
 process.env.AUTH_SESSION_SECRET='offline-fixture-secret-that-is-long-enough-for-hmac';
 process.env.AUTH_APP_ORIGIN='https://erp.test';
 const users:Identity[]=[{id:'po',name:'PO',role:'admin_po',pin:'1234'}, {id:'fin',name:'Finance',role:'finance',pin:'2345'}, {id:'sa',name:'SA',role:'super_admin',pin:'3456'}];
 const sessions=new Map<string,SessionRow>();
 const repo={usersByPin:async(pin:string)=>users.filter(u=>u.pin===pin),userById:async(id:string)=>users.find(u=>u.id===id)||null,putSession:async(row:SessionRow)=>{sessions.set(row.id,row)},getSession:async(id:string)=>sessions.get(id)||null,revokeSession:async(id:string)=>{sessions.get(id)!.revoked_at='revoked'},takeLoginAttempt:async()=>true};
 const service=createSessionService(repo,process.env.AUTH_SESSION_SECRET);
 let rpcArgs:any;
 const tables:Record<string,any[]>={users,auth_sessions:[],tukar_faktur:[{id:'tf',status:'Draft'}],clients:[],products:[],app_settings:[]};
 function from(table:string) {
  let patch:any=null;
  let rows=table==='auth_sessions' ? [...sessions.values()] : tables[table] || [];
  const query:any={
   select:()=>query,order:()=>query,range:()=>query,
   eq:(key:string,value:unknown)=>{rows=rows.filter(r=>r[key]===value);return query},
   in:(key:string,values:unknown[])=>{rows=rows.filter(r=>values.includes(r[key]));return query},
   maybeSingle:async()=>({data:rows[0] || null,error:null}),
   insert:async(row:SessionRow)=>{if(table==='auth_sessions') sessions.set(row.id,row);return {data:null,error:null}},
   update:(value:any)=>{patch=value;return query},
   then:(resolve:any)=>{if(patch) for(const row of rows) Object.assign(row,patch);return Promise.resolve({data:rows,error:null}).then(resolve)},
  };return query;
 }
 // This fixture replaces only the database transport; auth, signatures and route handlers run unchanged.
 (supabaseAdmin as any).from=from;
 (genericDb as any).from=from;
 (supabaseAdmin as any).rpc=async(name:string,args:any)=>{rpcArgs=args;return {data:name==='take_auth_login_attempt'?true:{ok:true},error:null}};
 const tokenByRole:Record<string,string>={};
 for(const user of users) tokenByRole[user.role]=(await service.login(user.pin!,'fixture')).token;
 const req=(method:string,role?:string,body?:unknown,path='/api/db')=>new Request('https://erp.test'+path,{method,headers:{origin:'https://erp.test',...(role?{cookie:`${SESSION_COOKIE}=${tokenByRole[role]}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 for(const role of ['admin_po','finance','super_admin']) {
  assert.equal((await requireApiUser(req('GET',role))).role,role);
  const response=await getSession(req('GET',role));
  assert.equal(response.status,200);assert.equal('pin' in (await response.json()).user,false);
 }
 for(const role of ['admin_po','finance']) {
  const response=await proxy(new NextRequest(req('POST',role,{},'/api/db/reset')));
  assert.equal(response.status,403);
 }
 assert.equal((await proxy(new NextRequest(req('GET','super_admin',undefined,'/api/db/backup')))).headers.get('x-middleware-next'),'1');
 assert.equal((await genericWrite(req('POST','admin_po',{table:'users',data:{id:'sa',role:'admin_po'}}))).status,403);
 assert.equal((await genericWrite(req('POST','finance',{table:'auth_sessions',data:{id:'fake'}}))).status,403);
 const userResponse=await genericRead(req('GET','admin_po',undefined,'/api/db?group=1'));
 const body=await userResponse.json();assert.equal(userResponse.status,200);assert.ok(body.users.every((u:any)=>!('pin' in u)));
 assert.equal((await retiredCash(req('POST','finance',{}))).status,410);
 assert.equal((await retiredJournal(req('POST','admin_po',{}))).status,410);
 const userEdit=await genericWrite(req('POST','super_admin',{table:'users',data:{id:'sa',name:'Updated SA'}}));
 assert.equal(userEdit.status,200);assert.equal(users.find(user=>user.id==='sa')!.pin,'3456','display-only edit preserves server credential');
 const issued=await tfCommand(req('POST','admin_po',{action:'issue',params:{p_tf_id:'tf',p_invoice_ids:['i'],p_issue_date:'2026-10-16',p_user_id:'sa'}}));
 assert.equal(issued.status,200);assert.equal(rpcArgs.p_user_id,'po');
 const loginResponse=await login(req('POST',undefined,{pin:'1234'}));
 assert.equal(loginResponse.status,200);
 const setCookie=loginResponse.headers.get('set-cookie')!;
 assert.ok(setCookie.includes('HttpOnly'));assert.ok(setCookie.includes('SameSite=Strict'));
 assert.equal('pin' in (await loginResponse.json()).user,false);
 const active=tokenByRole.admin_po;
 await logout(req('DELETE','admin_po'));
 await assert.rejects(()=>requireApiUser(req('GET','admin_po')),(e:any)=>e.status===401);
 tokenByRole.admin_po=(await service.login('1234','fixture')).token;
 users[0].role='super_admin';
 await assert.rejects(()=>requireApiUser(req('GET','admin_po')),(e:any)=>e.status===401);
 users[0].role='admin_po';
 users[0].is_active=false;
 await assert.rejects(()=>requireApiUser(req('GET','admin_po')),(e:any)=>e.status===401);
 assert.equal(apiAuthResponse(new Error('unexpected')),null);
 assert.ok(active);
 console.log('auth integration checks passed');
})();
