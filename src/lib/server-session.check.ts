import assert from 'node:assert/strict';
import { createSessionService, assertSameOrigin, publicUser, assertTableWrite, SessionError } from './server-session';

(async () => {
 const users = [{ id:'po', name:'PO', role:'admin_po', pin:'1234', is_active:true }, {id:'field',name:'Field',role:'gudang',pin:'9876'}];
 const sessions = new Map<string, any>();
 let attempts = 0;
 const repo = {
  usersByPin: async (pin:string) => users.filter(u => u.pin === pin),
  userById: async (id:string) => users.find(u=>u.id===id) || null,
  putSession: async (s:any) => { sessions.set(s.id,s); },
  getSession: async (id:string) => sessions.get(id) || null,
  revokeSession: async (id:string) => { sessions.get(id).revoked_at='now'; },
  takeLoginAttempt: async () => ++attempts < 10,
 };
 let now=1_000_000;
 const service=createSessionService(repo, 'a'.repeat(48), () => now);
 await assert.rejects(()=>service.authenticate(undefined), (e:any)=>e.status===401);
 await assert.rejects(()=>service.login('9876','ip'), (e:any)=>e.status===401);
 const login = await service.login('1234','ip');
 assert.equal(login.user.role,'admin_po');
 assert.equal('pin' in login.user,false);
 assert.equal((await service.authenticate(login.token)).id,'po');
 await assert.rejects(()=>service.authenticate(login.token+'x'), (e:any)=>e.status===401);
 users[0].role='finance';
 await assert.rejects(()=>service.authenticate(login.token), (e:any)=>e.status===401);
 users[0].role='admin_po';
 const expired=await service.login('1234','ip'); now+=9*60*60*1000;
 await assert.rejects(()=>service.authenticate(expired.token), (e:any)=>e.status===401);
 const active=await service.login('1234','ip');
 await service.logout(active.token);
 await assert.rejects(()=>service.authenticate(active.token), (e:any)=>e.status===401);
 users[0].is_active=false;
 await assert.rejects(()=>service.login('1234','ip'), (e:any)=>e.status===401);
 assert.throws(()=>assertSameOrigin(new Request('https://erp.test/api/db',{method:'POST',headers:{origin:'https://evil.test'}}),'https://erp.test'),SessionError);
 assert.throws(()=>assertSameOrigin(new Request('https://erp.test/api/db',{method:'POST'}),'https://erp.test'),SessionError);
 assertSameOrigin(new Request('https://erp.test/api/db',{method:'POST',headers:{origin:'https://erp.test'}}),'https://erp.test');
 assert.throws(()=>assertTableWrite('admin_po','users','POST'),SessionError);
 assert.throws(()=>assertTableWrite('admin_po','bank_accounts','POST'),SessionError);
 assert.throws(()=>assertTableWrite('super_admin','auth_sessions','POST'),SessionError);
 assert.throws(()=>assertTableWrite('super_admin','journal_entries','DELETE'),SessionError);
 assertTableWrite('admin_po','deliveries','POST');
 assertTableWrite('admin_po','invoices','POST');
 assertTableWrite('finance','vendor_bills','POST');
 assertTableWrite('finance','vendors','POST');
 assert.equal(publicUser({id:'inactive',name:'Inactive',role:'finance',pin:'never-return',is_active:false}).isActive,false,'directory must retain inactive state without the PIN');
 assert.equal('pin' in publicUser({id:'x',name:'x',role:'finance',pin:'secret'}),false);
 while(attempts<9) await assert.rejects(()=>service.login('bad','ip'));
 await assert.rejects(()=>service.login('1234','ip'),(e:any)=>e.status===429);
 console.log('server-session checks passed');
})();
