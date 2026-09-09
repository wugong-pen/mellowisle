import {countryOptions} from './countries.js';
const $=id=>document.getElementById(id);
let member=null,busy=false;
const requestKey=crypto.randomUUID();
const message=$('checkoutMessage');
function show(value){message.textContent=value;}
function cart(){try{return JSON.parse(localStorage.getItem('wugongCart'))||[];}catch{return[];}}
function render(){const items=cart();$('orderItems').replaceChildren();if(!items.length){show('購物車目前沒有商品。');return;}
  let total=0;for(const item of items){const row=document.createElement('div');row.className='order-item';const image=document.createElement('img');image.alt='';if(/^[\w.-]+\.(jpe?g|png|webp)$/i.test(item.image||''))image.src=item.image;const label=document.createElement('div');label.textContent=`${item.product}${item.nib?' · '+item.nib:''} × ${item.quantity}`;const cost=document.createElement('div');const value=Number(item.price)*Number(item.quantity);cost.textContent=`NT$${value.toLocaleString()}`;total+=value;row.append(image,label,cost);$('orderItems').append(row);}$('subtotal').textContent=$('total').textContent=`NT$${total.toLocaleString()}`;
}
countryOptions($('country'));render();
async function initialize(){try{const result=await(await fetch('/api/member',{cache:'no-store'})).json();if(!result.success)throw new Error();if(!result.member){location.replace('/member.html?next=checkout');return;}member=result.member;for(const key of ['name','phone','email','address','country'])$(key).value=member[key]||'';$('email').readOnly=true;$('submitOrder').disabled=false;show(`目前登入：${member.email}`);}catch{show('無法確認登入狀態，請重新整理後再試。');}}
$('submitOrder').addEventListener('click',async()=>{
  if(busy||!member)return;
  for(const key of ['name','phone','email','country','address']){if(!$(key).reportValidity())return;}
  const items=cart();if(!items.length){show('請先將商品加入購物車。');return;}
  busy=true;$('submitOrder').disabled=true;show('正在送出測試訂單…');
  try{const order={customer:{name:$('name').value,phone:$('phone').value,address:$('address').value,country:$('country').value},shipping:$('shipping').value,payment:document.querySelector('input[name=payment]:checked').value,note:$('note').value,items};
    const response=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify(order)});const result=await response.json();
    if(response.status===401){location.assign('/member.html?next=checkout');return;}
    if(!response.ok||!result.success)throw new Error(result.error||'訂單送出失敗');
    localStorage.removeItem('wugongCart');show(`測試訂單已建立：${result.orderNumber}。尚未收款。`);$('orderSuccess').hidden=false;$('submitOrder').hidden=true;
  }catch(error){show(error.message||'連線失敗，請稍後再試。');}finally{busy=false;$('submitOrder').disabled=false;}
});
window.addEventListener('pageshow',event=>{if(event.persisted)initialize();});initialize();
