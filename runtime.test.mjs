import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {checkMac} from './ecpay.js';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler')]}));
test('Cloudflare runtime supports password hashing and D1 membership',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:fileURLToPath(new URL('./worker.js',import.meta.url)),contents:readFileSync(new URL('./worker.js',import.meta.url),'utf8')},{type:'ESModule',path:fileURLToPath(new URL('./countries.js',import.meta.url)),contents:readFileSync(new URL('./countries.js',import.meta.url),'utf8')},{type:'ESModule',path:fileURLToPath(new URL('./ecpay.js',import.meta.url)),contents:readFileSync(new URL('./ecpay.js',import.meta.url),'utf8')}],compatibilityDate:'2026-09-07',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APP_ENV:'staging'}}));
 try{
  const db=await mf.getD1Database('DB');
  const schema=readFileSync(new URL('./schema-members.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
  for(const statement of schema.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  const response=await mf.dispatchFetch('https://shop.test/api/member/register',{method:'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json'},body:JSON.stringify({email:'runtime@example.test',password:'runtime test password is long',name:'測試會員',birthday:'1990-01-01',country:'TW'})});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.member.name,'測試會員');
  const cookie=response.headers.get('set-cookie').split(';')[0];
  const me=await mf.dispatchFetch('https://shop.test/api/member',{headers:{Cookie:cookie}});assert.equal((await me.json()).member.email,'runtime@example.test');
  await db.prepare('CREATE TABLE orders(order_number TEXT PRIMARY KEY,customer_name TEXT,phone TEXT,email TEXT,address TEXT,shipping TEXT,payment TEXT,note TEXT,items TEXT,total INTEGER,status TEXT,created_at TEXT)').run();
  const payload={customer:{name:'測試',phone:'0000000000',address:'測試地址',country:'TW'},items:[{id:'pojun-單尖',nib:'單尖',price:1,quantity:1}],expectedTotal:25000,payment:'ecpay',shipping:'宅配'};
  const orderResponse=await mf.dispatchFetch('https://shop.test/api/order',{method:'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json',Cookie:cookie,'Idempotency-Key':'runtime-payment-0001'},body:JSON.stringify(payload)});
  const order=await orderResponse.json();assert.equal(orderResponse.status,200,JSON.stringify(order));
  const params={MerchantID:'3002607',MerchantTradeNo:order.orderNumber,TradeAmt:'25000',RtnCode:'1',SimulatePaid:'0',TradeNo:'runtime123',PaymentType:'Credit_CreditCard'};
  const notice=await mf.dispatchFetch('https://shop.test/api/payments/ecpay/notify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,CheckMacValue:checkMac(params)}).toString()});
  assert.equal(await notice.text(),'1|OK');assert.equal((await db.prepare('SELECT status FROM orders WHERE order_number=?').bind(order.orderNumber).first()).status,'test_paid');
 }finally{await mf.dispose();}
});



