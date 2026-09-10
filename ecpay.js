// Sandbox only. Public credentials from https://developers.ecpay.com.tw/2856/
import { createHash, timingSafeEqual } from 'node:crypto';
export const ENDPOINT='https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';
const merchant='3002607', key='pwFHCqoQZGmho4w6', iv='EkRm7iFT261dpevs';
export function checkMac(params) {
  const keys=Object.keys(params).filter(k=>k!=='CheckMacValue').sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0);
  const raw=`HashKey=${key}&${keys.map(k=>`${k}=${params[k]}`).join('&')}&HashIV=${iv}`;
  const encoded=encodeURIComponent(raw).replace(/%20/g,'+').replace(/%2D/gi,'-').replace(/%5F/gi,'_').replace(/%2E/gi,'.').replace(/%21/gi,'!').replace(/%2A/gi,'*').replace(/%28/gi,'(').replace(/%29/gi,')').replace(/'/g,'%27').toLowerCase();
  return createHash('sha256').update(encoded).digest('hex').toUpperCase();
}
const abort=(status,message)=>{throw Object.assign(new Error(message),{status});};
export function sandbox(env){if(env.APP_ENV!=='staging')abort(503,'正式付款尚未開放');}
const catalog=new Map();
for(const [id,product,price] of [['egypt','神秘之境・永晝之塔',150000],['fuji','靈峰之心・富士山',120000],['huangshan','煙雲畫境・黃山',120000],['lushan','匡盧聖境・廬山',120000]])catalog.set(`product-${id}`,{product,variants:{'WUGONG 筆尖':price}});
for(const [prefix,product,variants] of [['pojun-','四面楚歌・破軍',{'單尖':25000,'偃月刀尖':25000,'雙層特殊尖':29500,'逆雙層特殊尖':29500}],['sihuang-brass-','四皇・繫世（黃銅款）',{'單尖':13500,'雙層特殊尖':18000,'逆雙層特殊尖':18000}]])for(const nib of Object.keys(variants))catalog.set(prefix+nib,{product,variants:{[nib]:variants[nib]}});
export function quote(items){
  if(!Array.isArray(items)||!items.length||items.length>50)abort(400,'請確認購物車商品');
  const quantities=new Map();
  const result=items.map(item=>{
    if(!item||typeof item!=='object')abort(400,'請確認購物車商品');
    const entry=catalog.get(item.id),price=entry&&Object.hasOwn(entry.variants,item.nib)?entry.variants[item.nib]:undefined;
    if(!price)abort(400,'商品或筆尖規格已變更，請重新加入購物車');
    if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)abort(400,'請確認商品數量');
    const count=(quantities.get(item.id)||0)+item.quantity;quantities.set(item.id,count);if(count>99)abort(400,'單項商品數量不能超過 99');
    return{id:item.id,product:entry.product,nib:item.nib,price,quantity:item.quantity};
  });
  return {items:result,total:result.reduce((sum,i)=>sum+i.price*i.quantity,0),shippingFee:0,currency:'TWD'};
}
export function paymentForm(order,env){
  sandbox(env);
  if(!/^WG[a-f0-9]{18}$/.test(order.order_number)||order.payment!=='ecpay'||order.status!=='pending')abort(409,'此訂單無法再次付款，請查看購買紀錄');
  const origin=env.PAYMENT_ORIGIN;
  if(origin!=='https://wugong-test.wugong-pen.workers.dev')abort(503,'測試付款網址尚未設定');
  const date=new Date(new Date(order.created_at).getTime()+8*3600000).toISOString().slice(0,19).replace(/-/g,'/').replace('T',' ');
  const fields={MerchantID:merchant,MerchantTradeNo:order.order_number,MerchantTradeDate:date,PaymentType:'aio',TotalAmount:String(order.total),TradeDesc:'WUGONG test order',ItemName:'WUGONG 測試商品',ReturnURL:origin+'/api/payments/ecpay/notify',ChoosePayment:'Credit',EncryptType:'1',ClientBackURL:origin+'/member.html'};
  fields.CheckMacValue=checkMac(fields);return{action:ENDPOINT,fields};
}
export async function notify(request,env){
  sandbox(env);
  const reject=()=>new Response('0|Invalid notification',{status:400});
  if(request.method!=='POST'||!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded'))return reject();
  const raw=await request.text();if(raw.length>16384)return reject();
  const entries=[...new URLSearchParams(raw)];if(new Set(entries.map(e=>e[0].toLowerCase())).size!==entries.length)return reject();
  const p=Object.fromEntries(entries),expected=checkMac(p);
  if(!/^[A-F0-9]{64}$/.test(p.CheckMacValue||'')||!timingSafeEqual(Buffer.from(expected),Buffer.from(p.CheckMacValue)))return reject();
  if(p.MerchantID!==merchant||!/^WG[a-f0-9]{18}$/.test(p.MerchantTradeNo||'')||!/^\d+$/.test(p.TradeAmt||'')||!['0','1'].includes(p.SimulatePaid)||!/^\d+$/.test(p.RtnCode||''))return reject();
  const order=await env.DB.prepare("SELECT total,status FROM orders WHERE order_number=? AND payment='ecpay'").bind(p.MerchantTradeNo).first();
  if(!order||Number(p.TradeAmt)!==order.total)return reject();
  // Console simulation is only an acknowledgement test, never evidence of payment.
  if(p.SimulatePaid==='1')return new Response('1|OK');
  if(p.RtnCode==='1'){
    if(!p.TradeNo||!p.PaymentType?.startsWith('Credit'))return reject();
    await env.DB.prepare("UPDATE orders SET status='test_paid' WHERE order_number=? AND payment='ecpay' AND status IN ('pending','payment_failed')").bind(p.MerchantTradeNo).run();
  }else await env.DB.prepare("UPDATE orders SET status='payment_failed' WHERE order_number=? AND payment='ecpay' AND status='pending'").bind(p.MerchantTradeNo).run();
  return new Response('1|OK');
}
