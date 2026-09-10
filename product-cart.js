const addButton=document.querySelector('.cart-button');
addButton.addEventListener('click',()=>{
 const feedback=document.getElementById('cartFeedback');
 try{
  const product=document.querySelector('.product-info h1').textContent.trim();
  const price=Number(document.querySelector('.price').textContent.replace(/[^0-9]/g,''));
  const quantity=Number(document.getElementById('qty').textContent);
  const nib=document.querySelector('.product-info select').value;
  const image=document.querySelector('.product-image img').getAttribute('src');
  const id=location.pathname.split('/').pop().replace('.html','');
  if(!Number.isFinite(price)||price<=0||!Number.isInteger(quantity)||quantity<1)throw new Error();
  const cart=JSON.parse(localStorage.getItem('wugongCart')||'[]');
  if(!Array.isArray(cart))throw new Error();
  const existing=cart.find(item=>item.id===id&&item.nib===nib);
  if(existing)existing.quantity+=quantity;else cart.push({id,product,price,quantity,nib,image});
  localStorage.setItem('wugongCart',JSON.stringify(cart));
  feedback.textContent='已加入購物車，可繼續選購或查看購物車。';
 }catch{
  feedback.textContent='暫時無法加入購物車，請確認瀏覽器允許儲存網站資料後再試。';
 }
});
