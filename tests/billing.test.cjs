'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{once}=require('node:events');
const {createApplication}=require('../server/app.cjs'),{hash}=require('../server/store.cjs');
async function setup(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'little-story-billing-'));let clock=Date.now();const errors=[];
  const app=createApplication({adminPassword:'billing-test-password',dataDir:directory,now:()=>clock,paymentSecret:'test-signed-payment-secret',onError:e=>errors.push(e.message)});
  app.server.listen(20000+crypto.randomInt(40000),'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  const session=app.store.userSession(),user=app.store.authenticate(session.token),otherSession=app.store.userSession({invite:session.inviteCode}),other=app.store.authenticate(otherSession.token);
  const post=(route,value,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  const login=await post('/api/admin/login',{password:'billing-test-password'}),admin={Cookie:login.headers.get('set-cookie').split(';')[0],'X-Admin-CSRF':(await login.json()).csrf};
  function create(owner=user){const id=crypto.randomUUID();fs.writeFileSync(path.join(directory,'files',id+'.pdf'),'%PDF-test\n%%EOF');app.store.run('INSERT INTO prints(id,user_id,request_key,book,title,name,digest,bytes,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?)',id,owner.id,crypto.randomUUID(),'intro','测试绘本','intro.pdf','test',20,clock,clock+30*86400000);return app.orders.create(owner,{requestKey:crypto.randomUUID(),consentVersion:'print-order-v1',items:[{receiptId:id,copies:2}],recipient:{method:'shipping',name:'家长',phone:'13800000000',address:'上海测试地址1号'}});}
  const enable=(price=1250)=>{const p=app.billing.productList().rows.find(p=>p.book_id==='intro');return app.billing.updateProduct(p.id,{version:p.version,name:p.name,unitFen:price,status:'active'});};
  const quote=order=>app.billing.quote(order.id,{version:app.orders.detail(order.id).version,shippingFen:600,discountFen:100,note:'印刷与包装',validHours:24});
  const prepare=order=>app.billing.prepareIntent(user,order.id,{quoteId:app.billing.summary(order.id).quote.id,channel:'wechat',requestKey:crypto.randomUUID()});
  const value=(i,extra={})=>({eventId:crypto.randomUUID(),orderId:i.merchant_order_id,transactionId:crypto.randomUUID(),userId:user.id,kind:'paid',amountFen:i.amount,currency:'CNY',channel:'wechat',...extra});
  const pay=v=>app.billing.recordPayment(v,hash(JSON.stringify(v)));
  const signed=v=>{const raw=JSON.stringify(v),stamp=String(clock);return fetch(base+'/internal/payments',{method:'POST',headers:{'Content-Type':'application/json','X-Payment-Timestamp':stamp,'X-Payment-Signature':crypto.createHmac('sha256','test-signed-payment-secret').update(stamp+'.'+raw).digest('hex')},body:raw});};
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));assert.deepEqual(errors,[]);const absolute=path.resolve(directory);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('little-story-billing-'))throw Error('Unsafe cleanup');fs.rmSync(absolute,{recursive:true,force:true});});
  return {...app,base,user,other,session,otherSession,admin,post,create,enable,quote,prepare,value,pay,signed,advance:ms=>clock+=ms};
}
const status=(fn,n)=>assert.throws(fn,e=>e.status===n);
test('products start without invented prices; quote snapshots use integer fen and product versions',async t=>{
  const f=await setup(t),o=f.create();assert.ok(f.billing.productList().rows.every(p=>p.unit_fen===null&&p.status==='draft'));status(()=>f.quote(o),409);
  const p=f.enable();status(()=>f.billing.updateProduct(p.id,{version:p.version,name:p.name,unitFen:1.1,status:'active'}),400);status(()=>f.billing.updateProduct(p.id,{version:1,name:p.name,unitFen:100,status:'active'}),409);
  const b=f.quote(o);assert.equal(b.quote.total,3000);assert.equal(b.quote.items[0].unitFen,1250);f.enable(1500);assert.equal(f.billing.summary(o.id).quote.total,3000);assert.equal(f.billing.summary(o.id).quote.items[0].productVersion,2);
  status(()=>f.orders.update(o.id,{version:f.orders.detail(o.id).version,state:'confirmed'}),409);assert.equal(f.store.dashboard('all').paidFen,0);
});
test('structural edits invalidate quotes but unchanged forms and internal notes preserve them',async t=>{
  const f=await setup(t);f.enable();let o=f.create();f.quote(o);o=f.orders.detail(o.id);
  o=f.orders.update(o.id,{version:o.version,recipient:o.recipient,items:o.items.map(i=>({receiptId:i.receiptId,copies:i.copies})),operatorNote:'仅内部备注'});assert.equal(o.billing.quote.effective,true);
  const intent=f.prepare(o);o=f.orders.update(o.id,{version:o.version,items:[{receiptId:o.items[0].receiptId,copies:3}]});assert.equal(o.state,'pending_confirmation');assert.equal(o.billing.quote.state,'invalidated');assert.equal(f.billing.intentDetail(intent.id).state,'closed');
});
test('payment preparations isolate users, do not charge, lock amount and handle duplicate requests',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const input={quoteId:f.billing.summary(o.id).quote.id,channel:'wechat',requestKey:crypto.randomUUID()},i=f.billing.prepareIntent(f.user,o.id,input);
  assert.equal(i.gatewayReady,false);assert.equal(i.paidFen,0);assert.equal(f.billing.prepareIntent(f.user,o.id,input).id,i.id);status(()=>f.billing.prepareIntent(f.other,o.id,input),404);status(()=>f.billing.intentDetail(i.id,f.other.id),404);
  status(()=>f.billing.prepareIntent(f.user,o.id,{...input,channel:'douyin'}),409);assert.equal(f.store.dashboard('all').paidOrders,0);
  assert.equal((await f.post('/api/print-orders/'+o.id+'/payment-intents',input,{Authorization:'Bearer '+f.session.token})).status,200);
  assert.equal((await fetch(f.base+'/api/payment-intents/'+i.id,{headers:{Authorization:'Bearer '+f.otherSession.token}})).status,404);
});
test('signed verified payments reconcile exact amount, owner, currency, channel and fulfill only once',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const i=f.prepare(o),v=f.value(i);
  for(const extra of [{amountFen:i.amount-1},{userId:f.other.id},{currency:'USD'},{channel:'douyin'}])assert.equal((await f.signed({...v,...extra})).status,409);
  assert.equal((await f.post('/internal/payments',v)).status,401);assert.equal((await f.signed(v)).status,200);assert.equal((await (await f.signed(v)).json()).duplicate,true);
  let order=f.orders.detail(o.id);assert.equal(order.state,'confirmed');assert.equal(order.billing.paidFen,3000);assert.equal(f.store.dashboard('all').paidOrders,1);
  status(()=>f.orders.update(o.id,{version:order.version,recipient:{...order.recipient,name:'改名'}}),409);order=f.orders.update(o.id,{version:order.version,recipient:order.recipient,operatorNote:'已付备注'});assert.equal(order.billing.quote.effective,true);
  order=f.orders.update(o.id,{version:order.version,state:'producing'});assert.equal(order.state,'producing');status(()=>f.pay({...v,eventId:crypto.randomUUID()}),409);
});
test('late money is recorded for reconciliation without reviving cancelled or expired orders',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const i=f.prepare(o);f.orders.update(o.id,{version:f.orders.detail(o.id).version,state:'cancelled',note:'用户取消'});f.pay(f.value(i));
  assert.equal(f.orders.detail(o.id).state,'cancelled');assert.equal(f.billing.summary(o.id).paidFen,3000);assert.equal(f.billing.summary(o.id).canFulfill,false);assert.ok(f.billing.intentDetail(i.id).review);
  const o2=f.create();f.quote(o2);const i2=f.prepare(o2);f.advance(16*60000);f.pay(f.value(i2));assert.equal(f.orders.detail(o2.id).state,'awaiting_payment');assert.equal(f.billing.summary(o2.id).canFulfill,false);
});
test('refund requests reserve money; verified refunds deduplicate event and transaction and prevent overspending',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const prepared=f.prepare(o);f.pay(f.value(prepared));let i=f.billing.intentDetail(prepared.id);
  const input={requestKey:crypto.randomUUID(),version:i.version,amountFen:1000,reason:'部分退款'},r=f.billing.refundRequest(i.id,input);assert.equal(f.billing.refundRequest(i.id,input).id,r.id);assert.equal(f.billing.intentDetail(i.id).refundedFen,0);assert.equal(f.billing.intentDetail(i.id).pendingRefundFen,1000);
  status(()=>f.billing.refundRequest(i.id,{...input,requestKey:crypto.randomUUID()}),409);status(()=>f.orders.update(o.id,{version:f.orders.detail(o.id).version,state:'producing'}),409);
  const v=f.value(i,{kind:'refund',amountFen:1000,refundRequestId:r.id});assert.equal((await f.signed(v)).status,200);assert.equal((await (await f.signed(v)).json()).duplicate,true);status(()=>f.pay({...v,eventId:crypto.randomUUID()}),409);
  i=f.billing.intentDetail(i.id);assert.equal(i.refundedFen,1000);assert.equal(i.refundableFen,2000);assert.equal(i.refundRequests[0].state,'recorded');assert.equal(f.billing.summary(o.id).canFulfill,false);
  status(()=>f.pay(f.value(i,{kind:'refund',amountFen:2001})),409);f.pay(f.value(i,{kind:'refund',amountFen:2000}));assert.equal(f.billing.summary(o.id).label,'已全额退款');const cancelled=f.orders.update(o.id,{version:f.orders.detail(o.id).version,state:'cancelled',note:'已全额退款'});assert.equal(cancelled.state,'cancelled');
});
test('admin price, quote, billing and user details require login/CSRF and omit account secrets',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const i=f.prepare(o);f.pay(f.value(i));f.store.event(f.user,{id:'read-12345678',kind:'read',book:'intro'});
  for(const route of ['/api/admin/products','/api/admin/billing','/api/admin/billing/'+i.id,'/api/admin/users/'+f.user.id])assert.equal((await fetch(f.base+route)).status,401);
  assert.equal((await f.post('/api/admin/print-orders/'+o.id+'/quote',{version:1},{Cookie:f.admin.Cookie})).status,403);
  const response=await fetch(f.base+'/api/admin/users/'+f.user.id,{headers:f.admin}),body=await response.json();assert.equal(response.status,200);assert.equal(body.stats.paidFen,3000);assert.equal(body.stats.reads,1);assert.equal(body.stats.referrals,1);assert.ok(!('identity' in body.user));assert.ok(!JSON.stringify(body).includes(f.session.token));
  const referred=await (await fetch(f.base+'/api/admin/users/'+f.user.id+'?section=referrals',{headers:f.admin})).json();assert.equal(referred.data.rows[0].id,f.other.id);
  assert.equal((await fetch(f.base+'/api/admin/users/'+f.user.id+'?section=invalid',{headers:f.admin})).status,400);
});
test('all preparation retry keys recover the same intent even after expiry',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const first=f.prepare(o),input={quoteId:first.quote_id,channel:'wechat',requestKey:crypto.randomUUID()};
  assert.equal(f.billing.prepareIntent(f.user,o.id,input).id,first.id);f.advance(16*60000);f.orders.cleanup();assert.equal(f.billing.prepareIntent(f.user,o.id,input).id,first.id);assert.equal(f.billing.intentDetail(first.id).state,'closed');
});
test('file and contact expiry block quoting and clear freeform billing notes while retaining money',async t=>{
  const f=await setup(t);f.enable();const o=f.create();f.quote(o);const i=f.prepare(o);f.pay(f.value(i));const detail=f.billing.intentDetail(i.id),r=f.billing.refundRequest(i.id,{version:detail.version,amountFen:1000,reason:'私有退款原因',requestKey:crypto.randomUUID()});f.billing.cancelRefund(r.id,{reason:'私有撤销原因'});
  f.advance(91*86400000);f.store.cleanup();f.orders.cleanup();assert.equal(f.billing.summary(o.id).quote.note,'');const final=f.billing.intentDetail(i.id);assert.equal(final.refundRequests[0].reason,'');assert.equal(final.refundRequests[0].cancel_reason,'');assert.equal(final.paidFen,3000);
  const expired=f.create();f.advance(31*86400000);f.store.cleanup();status(()=>f.quote(expired),410);
});
