import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler')]}));
test('Cloudflare runtime supports password hashing and D1 membership',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:fileURLToPath(new URL('./worker.js',import.meta.url)),contents:readFileSync(new URL('./worker.js',import.meta.url),'utf8')},{type:'ESModule',path:fileURLToPath(new URL('./countries.js',import.meta.url)),contents:readFileSync(new URL('./countries.js',import.meta.url),'utf8')}],compatibilityDate:'2026-09-07',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APP_ENV:'staging'}}));
 try{
  const db=await mf.getD1Database('DB');
  const schema=readFileSync(new URL('./schema-members.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
  for(const statement of schema.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  const response=await mf.dispatchFetch('https://shop.test/api/member/register',{method:'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json'},body:JSON.stringify({email:'runtime@example.test',password:'runtime test password is long',name:'測試會員',birthday:'1990-01-01',country:'TW'})});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.member.name,'測試會員');
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const me=await mf.dispatchFetch('https://shop.test/api/member',{headers:{Cookie:cookie}});assert.equal((await me.json()).member.email,'runtime@example.test');
 }finally{await mf.dispose();}
});



