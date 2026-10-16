import assert from 'node:assert/strict';
import { GET as dbGet, POST as dbPost, DELETE as dbDelete } from '../app/api/db/route';
import { GET as history } from '../app/api/history/route';
import { POST as cash } from '../app/api/accounting/cash/route';
import { POST as journal } from '../app/api/accounting/journal/route';
import { POST as draft } from '../app/api/shopping-draft/route';
(async()=>{
 process.env.AUTH_APP_ORIGIN='https://erp.test';
 for(const [method,handler] of [['GET',dbGet],['POST',dbPost],['DELETE',dbDelete],['GET',history],['POST',cash],['POST',journal],['POST',draft]] as const){
  const response=await handler(new Request('https://erp.test/api/test',{method,headers:{origin:'https://erp.test'},...(method==='GET'?{}:{body:'{}'})}));
  assert.equal(response.status,401,`${method} ${handler.name} must reject missing cookie before DB access`);
 }
 const cross=await dbPost(new Request('https://erp.test/api/db',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}));
 assert.equal(cross.status,403);
 console.log('api-auth boundary checks passed');
})();
