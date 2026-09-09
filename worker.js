import { pbkdf2, timingSafeEqual } from 'node:crypto';
import { COUNTRY_CODES } from './countries.js';
const COOKIE = '__Host-wugong_session', TTL = 604800;
const now = () => Math.floor(Date.now()/1000);
const hex = bytes => Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,'0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail = (status,message) => {throw new HttpError(status,message);};
const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const publicMember = m => ({id:m.id,email:m.email,name:m.name,birthday:m.birthday,country:m.country,phone:m.phone,address:m.address,createdAt:m.created_at});
const cookie = (token,age=TTL) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function text(value,max,label,required=true) {
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())) fail(400,`請確認${label}`);
  return value.trim();
}
function email(value) {
  const result=text(value,254,'電子郵件').toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400,'請輸入有效的電子郵件');
  return result;
}
function password(value) {
  if(typeof value!=='string'||[...value].length<15||value.length>128) fail(400,'密碼請使用 15 至 128 個字元，可使用長句');
  return value;
}
function profile(data) {
  const name=text(data.name,100,'姓名'), birthday=text(data.birthday,10,'生日');
  const date=new Date(`${birthday}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birthday)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthday||birthday<'1900-01-01'||birthday>new Date().toISOString().slice(0,10)) fail(400,'請輸入有效的生日，不能是未來日期');
  if(!COUNTRY_CODES.includes(data.country)) fail(400,'請選擇國家／地區');
  return {name,birthday,country:data.country,phone:text(data.phone??'',40,'電話',false),address:text(data.address??'',500,'地址',false)};
}
async function hashPassword(value,salt=random()) {
  const hash=await new Promise((resolve,reject)=>pbkdf2(value,salt,600000,32,'sha256',(error,key)=>error?reject(error):resolve(key)));
  return `pbkdf2-sha256$600000$${salt}$${hex(hash)}`;
}
async function verifyPassword(value,stored) {
  const expected=stored||`pbkdf2-sha256$600000$${'0'.repeat(64)}$${'0'.repeat(64)}`;
  const actual=await hashPassword(value,expected.split('$')[2]);
  const a=new TextEncoder().encode(actual),b=new TextEncoder().encode(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
async function body(request) {
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json')) fail(415,'請使用 JSON 格式');
  if(Number(request.headers.get('Content-Length'))>32768) fail(413,'資料過長');
  const reader=request.body?.getReader(); if(!reader) fail(400,'缺少資料');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();fail(413,'資料過長');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{fail(400,'資料格式不正確');}
}
async function rate(env,key,limit) {
  const time=now();
  const row=await env.DB.prepare(`INSERT INTO member_rate_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`).bind(await digest(key),time+900,time,time).first();
  if(row.attempts>limit) fail(429,'嘗試次數過多，請於 15 分鐘後再試');
}
async function session(request,env,required=true) {
  const token=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  const member=token&&/^[a-f0-9]{64}$/.test(token)?await env.DB.prepare('SELECT m.*,s.token_hash FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>? AND m.active=1').bind(await digest(token),now()).first():null;
  if(!member&&required) fail(401,'請先登入會員');return member;
}
async function issueSession(env,member,request) {
  const token=random(),previous=await session(request,env,false);
  const statements=[env.DB.prepare('INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES (?,?,?)').bind(await digest(token),member.id,now()+TTL),env.DB.prepare('DELETE FROM member_sessions WHERE expires_at<=?').bind(now()),env.DB.prepare('DELETE FROM member_rate_limits WHERE expires_at<=?').bind(now())];
  if(previous) statements.push(env.DB.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(previous.token_hash));
  await env.DB.batch(statements);
  return json({success:true,member:publicMember(member)},200,{'Set-Cookie':cookie(token)});
}
async function api(request,env,url) {
  const path=url.pathname,method=request.method;
  if(!['GET','HEAD'].includes(method)&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')) fail(403,'請從本站頁面操作');
  // Legacy unauthenticated admin access stays closed until admin provisioning exists.
  if(path==='/api/orders'||path==='/api/order/status') fail(403,'此功能僅限管理員，管理員登入功能尚未開放');
  if(path==='/api/member'&&method==='GET') {const m=await session(request,env,false);return json({success:true,member:m?publicMember(m):null});}
  if(path==='/api/member/register'&&method==='POST') {
    await rate(env,`register:${request.headers.get('CF-Connecting-IP')||'local'}`,8);
    const data=await body(request),p=profile(data),address=email(data.email),secret=password(data.password),stamp=new Date().toISOString();
    const m={id:crypto.randomUUID(),email:address,...p,created_at:stamp};
    const result=await env.DB.prepare('INSERT OR IGNORE INTO members(id,email,password_hash,name,birthday,country,phone,address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(m.id,address,await hashPassword(secret),p.name,p.birthday,p.country,p.phone,p.address,stamp,stamp).run();
    if(!result.meta.changes) fail(409,'無法使用這個電子郵件註冊；若已有帳號，請登入');
    return issueSession(env,m,request);
  }
  if(path==='/api/member/login'&&method==='POST') {
    await rate(env,`login-ip:${request.headers.get('CF-Connecting-IP')||'local'}`,30);
    const data=await body(request),address=email(data.email);
    if(typeof data.password!=='string'||data.password.length>128) fail(400,'請確認密碼');
    await rate(env,`login-email:${address}`,10);
    const m=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(address).first();
    const valid=await verifyPassword(data.password,m?.password_hash);
    if(!valid||!m?.active) fail(401,'電子郵件或密碼不正確');return issueSession(env,m,request);
  }
  if(path==='/api/member/logout'&&method==='POST') {
    const m=await session(request,env,false);if(m)await env.DB.prepare('DELETE FROM member_sessions WHERE token_hash=?').bind(m.token_hash).run();
    return json({success:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/api/member'&&method==='PATCH') {
    const m=await session(request,env),p=profile(await body(request));
    await env.DB.prepare('UPDATE members SET name=?,birthday=?,country=?,phone=?,address=?,updated_at=? WHERE id=?').bind(p.name,p.birthday,p.country,p.phone,p.address,new Date().toISOString(),m.id).run();
    return json({success:true,member:publicMember({...m,...p})});
  }
  if(path==='/api/member/password'&&method==='POST') {
    const m=await session(request,env);await rate(env,`password:${m.id}`,8);
    const data=await body(request),secret=password(data.password);
    if(typeof data.currentPassword!=='string'||data.currentPassword.length>128||!await verifyPassword(data.currentPassword,m.password_hash))fail(400,'目前密碼不正確');
    await env.DB.batch([env.DB.prepare('UPDATE members SET password_hash=?,updated_at=? WHERE id=?').bind(await hashPassword(secret),new Date().toISOString(),m.id),env.DB.prepare('DELETE FROM member_sessions WHERE member_id=?').bind(m.id)]);
    return json({success:true},200,{'Set-Cookie':cookie('',0)});
  }
  if((path==='/api/member/orders'||path.startsWith('/api/member/orders/'))&&method==='GET') {
    const m=await session(request,env);
    const base='SELECT o.order_number,o.customer_name,o.phone,o.email,o.address,o.shipping,o.payment,o.note,o.items,o.total,o.status,o.created_at,mo.shipping_country FROM orders o JOIN member_orders mo ON mo.order_number=o.order_number WHERE mo.member_id=?';
    if(path!=='/api/member/orders') {
      const order=await env.DB.prepare(base+' AND o.order_number=?').bind(m.id,decodeURIComponent(path.slice('/api/member/orders/'.length))).first();
      if(!order)fail(404,'找不到此訂單');return json({success:true,order});
    }
    const page=Math.floor(Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1)));
    const result=await env.DB.prepare(base+' ORDER BY o.id DESC LIMIT 21 OFFSET ?').bind(m.id,(page-1)*20).all();
    return json({success:true,orders:result.results.slice(0,20),hasMore:result.results.length>20});
  }
  if(path==='/api/order'&&method==='POST') {
    const m=await session(request,env);await rate(env,`orders:${m.id}`,30);
    const order=await body(request),c=order.customer||{},key=request.headers.get('Idempotency-Key');
    if(!key||!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail(400,'請重新整理結帳頁後再試');
    const previous=await env.DB.prepare('SELECT order_number FROM member_orders WHERE member_id=? AND request_key=?').bind(m.id,key).first();
    if(previous)return json({success:true,orderNumber:previous.order_number});
    const name=text(c.name,100,'收件人姓名'),phone=text(c.phone,40,'電話'),address=text(c.address,500,'收件地址');
    if(!COUNTRY_CODES.includes(c.country))fail(400,'請選擇收件國家／地區');
    if(!Array.isArray(order.items)||!order.items.length||order.items.length>50)fail(400,'請確認購物車商品');
    const items=order.items.map(item=>{
      if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99||!Number.isSafeInteger(item.price)||item.price<0||item.price>10000000)fail(400,'請確認商品數量與金額');
      return {id:text(item.id,150,'商品編號'),product:text(item.product,150,'商品名稱'),nib:text(item.nib??'',100,'規格',false),price:item.price,quantity:item.quantity};
    });
    // Catalog pricing, stock and payment verification remain a separate release.
    if(env.APP_ENV!=='staging')fail(503,'正式結帳尚未開放');
    const total=items.reduce((sum,item)=>sum+item.price*item.quantity,0),number=`WG${Date.now()}-${random().slice(0,12)}`;
    const shipping=text(order.shipping??'',40,'配送方式',false),payment=text(order.payment,30,'付款方式'),note=text(order.note??'',1000,'備註',false);
    try{await env.DB.batch([
      env.DB.prepare('INSERT INTO orders(order_number,customer_name,phone,email,address,shipping,payment,note,items,total,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(number,name,phone,m.email,address,shipping,payment,note,JSON.stringify(items),total,'pending',new Date().toISOString()),
      env.DB.prepare('INSERT INTO member_orders(order_number,member_id,shipping_country,request_key) VALUES (?,?,?,?)').bind(number,m.id,c.country,key)
    ]);}catch(error){const retry=await env.DB.prepare('SELECT order_number FROM member_orders WHERE member_id=? AND request_key=?').bind(m.id,key).first();if(!retry)throw error;return json({success:true,orderNumber:retry.order_number});}
    return json({success:true,orderNumber:number});
  }
  fail(404,'找不到此功能');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try{
      let response;
      if(url.pathname.startsWith('/api/'))response=await api(request,env,url);
      else if(env.APP_ENV==='staging'&&url.pathname==='/robots.txt')response=new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
      else if(/^\/checkout(?:\.html)?\/?$/.test(url.pathname)&&!await session(request,env,false))response=new Response(null,{status:303,headers:{Location:'/member.html?next=checkout','Cache-Control':'no-store'}});
      else{
        response=await env.ASSETS.fetch(request);
        if(env.APP_ENV==='staging'&&response.headers.get('Content-Type')?.includes('text/html'))response=new HTMLRewriter().on('body',{element(el){el.prepend('<aside role="note" style="background:#fff1c2;color:#342300;padding:12px 16px;text-align:center;font:600 16px/1.5 sans-serif">測試版｜僅供功能確認，請勿填寫真實個資或付款。測試訂單與正式版分開。</aside>',{html:true});}}).transform(response);
      }
      const result=new Response(response.body,response);
      result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('Referrer-Policy','same-origin');result.headers.set('X-Frame-Options','DENY');
      if(env.APP_ENV==='staging')result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
      if(/^\/(member|checkout)(\.html)?\/?$/.test(url.pathname))result.headers.set('Cache-Control','no-store');
      if(/^\/member(\.html)?\/?$/.test(url.pathname))result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      return result;
    }catch(error){return json({success:false,error:error instanceof HttpError?error.message:'服務暫時無法使用，請稍後再試'},error.status||500,env.APP_ENV==='staging'?{'X-Robots-Tag':'noindex, nofollow, noarchive'}:{});}
  }
};
