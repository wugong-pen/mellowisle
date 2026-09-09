import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './worker.js';
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_number TEXT UNIQUE,customer_name TEXT,phone TEXT,email TEXT,address TEXT,shipping TEXT,payment TEXT,note TEXT,items TEXT,total REAL,status TEXT,created_at TEXT);');
 sql.exec(readFileSync(new URL('./schema-members.sql',import.meta.url),'utf8'));
 const prepare=(query)=>{let params=[];return{bind(...values){params=values;return this;},async first(){return sql.prepare(query).get(...params)||null;},async all(){return {results:sql.prepare(query).all(...params)};},async run(){const result=sql.prepare(query).run(...params);return{meta:{changes:result.changes}};}};};
 return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
test('member lifecycle, owner-only orders, validation and session revocation',async()=>{
 const DB=database(),env={DB,APP_ENV:'staging',ASSETS:{fetch:async()=>new Response('asset')}};
 const call=async(path,method='GET',data,token='',extra={})=>{
  const response=await worker.fetch(new Request('https://shop.test'+path,{method,headers:{Origin:'https://shop.test','Content-Type':'application/json',Cookie:token,...extra},body:data===undefined?undefined:JSON.stringify(data)}),env);
  return{status:response.status,headers:response.headers,data:response.headers.get('Content-Type')?.includes('json')?await response.json():await response.text()};
 };
 const registration={email:'member-a@example.test',password:'a long safe test password',name:'測試甲',birthday:'1990-03-01',country:'TW'};
 assert.equal((await call('/api/order','POST',{})).status,401);
 assert.equal((await call('/checkout.html')).status,303);
 assert.equal((await call('/api/member/register','POST',{...registration,birthday:'2025-02-30'})).status,400);
 assert.equal((await call('/api/member/register','POST',{...registration,country:'ZZ'})).status,400);
 const a=await call('/api/member/register','POST',registration);assert.equal(a.status,200,JSON.stringify(a.data));
 const tokenA=a.headers.get('set-cookie').split(';')[0];
 assert.match(a.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
 assert.ok(!JSON.stringify(a.data).includes('password_hash'));
 assert.notEqual(DB.sql.prepare('SELECT password_hash FROM members').get().password_hash,registration.password);
 assert.equal((await call('/api/member/register','POST',{...registration,email:registration.email.toUpperCase()})).status,409);
 assert.equal((await call('/api/member/login','POST',{email:registration.email,password:'incorrect'})).status,401);
 assert.equal((await call('/api/member','PATCH',{...registration,name:'新的姓名'},tokenA,{Origin:'https://evil.test'})).status,403);
 assert.equal((await call('/api/member','PATCH',{...registration,name:'新的姓名',phone:'0900000000',address:'測試地址'},tokenA)).status,200);
 assert.equal((await call('/api/member','GET',undefined,tokenA)).data.member.name,'新的姓名');
 const b=await call('/api/member/register','POST',{...registration,email:'member-b@example.test',name:'測試乙'});const tokenB=b.headers.get('set-cookie').split(';')[0];
 const order={customer:{name:'測試收件人',phone:'0000000000',address:'測試地址',country:'JP',email:'spoof@example.test'},items:[{id:'pen',product:'測試鋼筆',price:100,quantity:2}],shipping:'宅配',payment:'bank',total:1,memberId:b.data.member.id};
 const submitted=await call('/api/order','POST',order,tokenA,{'Idempotency-Key':'test-order-00000001'});assert.equal(submitted.status,200,JSON.stringify(submitted.data));
 const duplicate=await call('/api/order','POST',order,tokenA,{'Idempotency-Key':'test-order-00000001'});assert.equal(duplicate.data.orderNumber,submitted.data.orderNumber);
 assert.equal(DB.sql.prepare('SELECT count(*) n FROM orders').get().n,1);
 const mine=await call('/api/member/orders','GET',undefined,tokenA);assert.equal(mine.data.orders.length,1);assert.equal(mine.data.orders[0].email,registration.email);assert.equal(mine.data.orders[0].total,200);
 assert.equal((await call('/api/member/orders','GET',undefined,tokenB)).data.orders.length,0);
 assert.equal((await call('/api/member/orders/'+submitted.data.orderNumber,'GET',undefined,tokenB)).status,404);
 assert.equal((await call('/api/orders','GET',undefined,tokenA)).status,403);
 assert.equal((await call('/api/order/status','POST',{status:'paid'},tokenA)).status,403);
 await call('/api/member/logout','POST',{},tokenB);assert.equal((await call('/api/member/orders','GET',undefined,tokenB)).status,401);
 const login=await call('/api/member/login','POST',{email:registration.email,password:registration.password});const second=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await call('/api/member/password','POST',{currentPassword:registration.password,password:'a new long safe password'},tokenA)).status,200);
 assert.equal((await call('/api/member/orders','GET',undefined,tokenA)).status,401);
 assert.equal((await call('/api/member/orders','GET',undefined,second)).status,401);
 const changed=await call('/api/member/login','POST',{email:registration.email,password:'a new long safe password'});assert.equal(changed.status,200);
 const expired=changed.headers.get('set-cookie').split(';')[0];DB.sql.exec('UPDATE member_sessions SET expires_at=0');assert.equal((await call('/api/member/orders','GET',undefined,expired)).status,401);
 for(let i=0;i<10;i++)await call('/api/member/login','POST',{email:'nobody@example.test',password:'wrong'});
 assert.equal((await call('/api/member/login','POST',{email:'nobody@example.test',password:'wrong'})).status,429);
 assert.equal((await call('/api/member/register','POST',registration,'',{Origin:'https://evil.test'})).status,403);
 DB.sql.exec(readFileSync(new URL('./schema-members.sql',import.meta.url),'utf8'));
 assert.equal(DB.sql.prepare('SELECT count(*) n FROM orders').get().n,1);
});

