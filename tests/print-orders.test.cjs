'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events'),{createApplication}=require('../server/app.cjs');
const {openStore}=require('../server/store.cjs');
const PDF=Buffer.from('%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF');
async function setup(t,{beforeOpen,...options}={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'little-story-orders-'));let clock=Date.parse('2026-10-16T09:00:00Z');const errors=[];
  if(beforeOpen)beforeOpen(directory,clock);
  const app=createApplication({adminPassword:'order-test-password',dataDir:directory,now:()=>clock,onError:e=>errors.push(e.message),...options});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  const request=(route,options)=>fetch(base+route,options);
  const post=(route,input,headers={})=>request(route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
  const account=app.store.userSession(),other=app.store.userSession();
  const auth={Authorization:'Bearer '+account.token},otherAuth={Authorization:'Bearer '+other.token};
  const login=await post('/api/admin/login',{password:'order-test-password'}),csrf=(await login.json()).csrf,admin={Cookie:login.headers.get('set-cookie').split(';')[0],'X-Admin-CSRF':csrf};
  async function receipt(title='测试绘本',owner=account,book='intro'){const response=await request('/api/prints?book='+book+'&title='+encodeURIComponent(title),{method:'POST',headers:{Authorization:'Bearer '+owner.token,'Content-Type':'application/pdf','X-Print-Consent':'operator-file-v1','Idempotency-Key':crypto.randomUUID()},body:PDF});assert.equal(response.status,201);return (await response.json()).id;}
  function input(ids,extra={}){return {requestKey:crypto.randomUUID(),items:ids.map(receiptId=>({receiptId,copies:2})),recipient:{method:'shipping',name:'测试家长',phone:'13800000000',address:'上海市测试区测试路1号'},note:'请先联系确认',consentVersion:'print-order-v1',...extra};}
  async function create(value){const response=await post('/api/print-orders',value,auth);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return response.json();}
  const patch=(order,value,headers=admin)=>request('/api/admin/print-orders/'+order.id,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({version:order.version,...value})});
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));assert.deepEqual(errors,[]);const absolute=path.resolve(directory);if(!absolute.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(absolute).startsWith('little-story-orders-'))throw Error('Unsafe cleanup');fs.rmSync(absolute,{recursive:true,force:true});});
  return {...app,request,post,account,auth,otherAuth,admin,receipt,input,create,patch,advance:days=>{clock+=days*86400000;}};
}
test('existing PDF receipts survive the additive order schema without fabricated orders',async t=>{
  const id=crypto.randomUUID(),f=await setup(t,{beforeOpen:(directory,clock)=>{const old=openStore(directory,30,()=>clock),user=old.userSession();fs.writeFileSync(path.join(directory,'files',id+'.pdf'),PDF);old.run('INSERT INTO prints(id,user_id,request_key,book,title,name,digest,bytes,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?)',id,user.userId,crypto.randomUUID(),'intro','旧绘本','intro.pdf','legacy-digest',PDF.length,clock,clock+30*86400000);old.close();}});
  assert.equal(f.store.list('prints',{days:'all'}).total,1);assert.equal(f.store.list('prints',{days:'all'}).rows[0].available,true);assert.equal(f.orders.list({days:'all'}).total,0);
});
test('single/multiple receipts form one idempotent order without changing existing PDF receipts',async t=>{
  const f=await setup(t),ids=[await f.receipt('第一本'),await f.receipt('第二本')],input=f.input(ids),order=await f.create(input);
  assert.match(order.number,/^PO20261016[A-F0-9]{10}$/);assert.equal(order.items.length,2);assert.equal(order.items.reduce((n,i)=>n+i.copies,0),4);assert.equal(order.state,'pending_confirmation');
  assert.equal(f.store.list('prints',{days:'all'}).total,2);
  const retry=await f.post('/api/print-orders',input,f.auth);assert.equal(retry.status,200);assert.equal((await retry.json()).id,order.id);assert.equal(f.orders.list({days:'all'}).total,1);
  assert.equal((await f.post('/api/print-orders',{...input,note:'different'},f.auth)).status,409);
});
test('level collection is one printable book and quantities price the entire volume',async t=>{
  const f=await setup(t),title='第1级阅读故事集（现有6个故事样册）',id=await f.receipt(title,f.account,'level-1'),order=await f.create(f.input([id]));
  const listed=f.orders.list({days:'all'}).rows[0];assert.equal(listed.bookCount,1);assert.equal(listed.totalCopies,2);assert.equal(order.items[0].book,'level-1');assert.equal(order.items[0].title,title);
  const p=f.billing.productList().rows.find(p=>p.book_id==='level-1');assert.equal(p.unit_fen,null);assert.equal(p.status,'draft');f.billing.updateProduct(p.id,{version:p.version,name:p.name,unitFen:2500,status:'active'});
  const quote=f.billing.quote(order.id,{version:order.version,shippingFen:600,discountFen:0,note:'整册合集报价'}).quote;assert.equal(quote.items.length,1);assert.equal(quote.items[0].copies,2);assert.equal(quote.total,5600);
  const response=await f.request('/api/admin/prints/'+id+'/file',{headers:f.admin});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),PDF);
});

test('print service saves a canonical story and volume snapshot with the exact received file',async t=>{
  const f=await setup(t),id=await f.receipt('第1级样册',f.account,'level-1'),input=f.input([id],{printPlan:{level:1,storyCount:6,volumeCount:1}}),order=await f.create(input);
  assert.deepEqual(order.printPlan,{level:1,storyCount:6,volumeCount:1,sample:true,volumes:[{number:1,firstStory:1,lastStory:6,storyCount:6,bookId:'level-1'}]});
  assert.equal(order.print_plan,undefined);assert.equal(order.items[0].copies,2);
  const retry=await f.post('/api/print-orders',input,f.auth);assert.equal(retry.status,200);assert.equal((await retry.json()).id,order.id);
  assert.equal((await f.post('/api/print-orders',{...input,printPlan:undefined},f.auth)).status,409);
  const own=await (await f.request('/api/print-orders/'+order.id,{headers:f.auth})).json(),admin=await (await f.request('/api/admin/print-orders/'+order.id,{headers:f.admin})).json();
  assert.deepEqual(own.printPlan,order.printPlan);assert.deepEqual(admin.printPlan,order.printPlan);
  const changed=await (await f.patch(order,{items:[{receiptId:id,copies:3}]})).json();assert.deepEqual(changed.printPlan,order.printPlan);
  const downloaded=await f.request('/api/admin/prints/'+id+'/file',{headers:f.admin});assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),PDF);
});

test('15-story edition receives one versioned volume, retries safely and cannot inherit old product prices',async t=>{
  const current=require('../miniprogram/lib/current-edition'),f=await setup(t),plan=current.orderPlan();
  const id=await f.receipt('第1级15篇合集',f.account,current.PRINT_ID),input=f.input([id],{printPlan:{edition:current.EDITION,level:1,storyCount:15,volumeCount:1}}),order=await f.create(input);
  assert.deepEqual(order.printPlan,plan);assert.equal(order.items[0].copies,2);
  const retry=await f.post('/api/print-orders',input,f.auth);assert.equal(retry.status,200);assert.equal((await retry.json()).id,order.id);
  for(const changed of [{storyCount:20},{volumeCount:2},{edition:'unknown-edition'},{level:2}])assert.equal((await f.post('/api/print-orders',f.input([id],{printPlan:{...input.printPlan,...changed}}),f.auth)).status,400);
  const old=await f.receipt('旧六篇样册',f.account,'level-1');
  assert.equal((await f.post('/api/print-orders',f.input([old],{printPlan:input.printPlan}),f.auth)).status,400);
  const product=f.billing.productList().rows.find(p=>p.book_id===current.PRINT_ID);assert.ok(product);assert.equal(product.unit_fen,null);assert.equal(product.status,'draft');
  const downloaded=await f.request('/api/admin/prints/'+id+'/file',{headers:f.admin});assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),PDF);
  assert.equal(f.orders.list({days:'all'}).total,1);
});

test('print service rejects unavailable levels, inflated story counts and mismatched volumes',async t=>{
  const f=await setup(t),id=await f.receipt('第1级样册',f.account,'level-1'),other=await f.receipt('单故事');
  for(const printPlan of [null,{level:2,storyCount:6,volumeCount:1},{level:1,storyCount:30,volumeCount:3},{level:1,storyCount:6,volumeCount:2}])assert.equal((await f.post('/api/print-orders',f.input([id],{printPlan}),f.auth)).status,400);
  const printPlan={level:1,storyCount:6,volumeCount:1};
  assert.equal((await f.post('/api/print-orders',f.input([other],{printPlan}),f.auth)).status,400);
  assert.equal((await f.post('/api/print-orders',f.input([id,other],{printPlan}),f.auth)).status,400);
  assert.equal(f.orders.list({days:'all'}).total,0);
});

test('print service schema migration preserves legacy orders without inventing story counts',async t=>{
  const f=await setup(t),order=await f.create(f.input([await f.receipt()]));
  f.store.db.exec('ALTER TABLE print_orders DROP COLUMN print_plan');
  const reopened=require('../server/print-orders.cjs').createPrintOrders(f.store);
  assert.equal(reopened.detail(order.id).printPlan,null);assert.equal(reopened.detail(order.id).items.length,1);assert.equal(reopened.list({days:'all'}).total,1);
});
test('order validation rejects bad contact, quantities, missing consent, expired or foreign receipts',async t=>{
  const f=await setup(t),id=await f.receipt();const good=f.input([id]);
  for(const change of [{consentVersion:''},{items:[{receiptId:id,copies:0}]},{items:[{receiptId:id,copies:1.2}]},{items:[{receiptId:id,copies:101}]},{items:[{receiptId:id,copies:1},{receiptId:id,copies:1}]},{recipient:{...good.recipient,phone:'bad'}},{recipient:{...good.recipient,address:'x'}}])assert.equal((await f.post('/api/print-orders',{...good,...change},f.auth)).status,400);
  assert.equal((await f.post('/api/print-orders',good,f.otherAuth)).status,400);
  f.advance(31);assert.equal((await f.post('/api/print-orders',good,f.auth)).status,410);assert.equal(f.orders.list({days:'all'}).total,0);
});
test('user data, internal notes and order mutations remain isolated by identity and CSRF',async t=>{
  const f=await setup(t),order=await f.create(f.input([await f.receipt()]));
  assert.equal((await f.request('/api/admin/print-orders')).status,401);assert.equal((await f.request('/api/print-orders/'+order.id,{headers:f.otherAuth})).status,404);
  assert.equal((await f.patch(order,{state:'confirmed'},{Cookie:f.admin.Cookie})).status,403);
  const edited=await (await f.patch(order,{operatorNote:'内部客服备注',note:'不展示给用户的内部处理说明'})).json();assert.equal(edited.operator_note,'内部客服备注');
  const own=await (await f.request('/api/print-orders/'+order.id,{headers:f.auth})).json();assert.ok(!own.operator_note);assert.ok(!own.events.some(e=>e.note.includes('不展示')));
  assert.equal((await f.post('/api/print-orders/'+order.id+'/cancel',{version:edited.version,note:'用户取消',operatorNote:'forged'},f.auth)).status,409);
  const cancelled=await f.post('/api/print-orders/'+order.id+'/cancel',{version:edited.version,note:'不需要了'},f.auth);assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).state,'cancelled');
});
test('fulfillment requires valid transitions, shipping fields and current version',async t=>{
  const f=await setup(t);let order=await f.create(f.input([await f.receipt()]));
  assert.equal((await f.patch(order,{state:'shipped'})).status,409);
  const old=order;order=await (await f.patch(order,{state:'confirmed'})).json();assert.equal((await f.patch(old,{state:'confirmed'})).status,409);
  order=await (await f.patch(order,{state:'producing'})).json();
  assert.equal((await f.patch(order,{recipient:{...order.recipient,name:'change'}})).status,409);
  assert.equal((await f.patch(order,{state:'shipped'})).status,400);assert.equal((await f.patch(order,{state:'completed'})).status,409);
  order=await (await f.patch(order,{state:'shipped',shipment:{carrier:'测试快递',trackingNumber:'SF1234567890'},note:'交付快递'})).json();assert.equal(order.carrier,'测试快递');
  order=await (await f.patch(order,{state:'completed',note:'已交付'})).json();assert.equal(order.state,'completed');assert.equal(order.events.length,5);assert.equal(f.store.dashboard('all').paidOrders,0,'operator status never fabricates payment');
});
test('pickup completion, exceptions and operator edits preserve a readable history',async t=>{
  const f=await setup(t),id=await f.receipt();let order=await f.create(f.input([id],{recipient:{method:'pickup',name:'取货家长',phone:'13800000000'}}));
  order=await (await f.patch(order,{recipient:{...order.recipient,name:'新联系人'},items:[{receiptId:id,copies:3}]})).json();assert.equal(order.items[0].copies,3);
  order=await (await f.patch(order,{state:'confirmed'})).json();assert.equal((await f.patch(order,{state:'exception'})).status,400);
  order=await (await f.patch(order,{state:'exception',note:'需要确认制作要求'})).json();assert.ok(order.nextStates.some(s=>s.value==='confirmed'));
  order=await (await f.patch(order,{state:'confirmed',note:'已确认'})).json();order=await (await f.patch(order,{state:'producing'})).json();assert.ok(!order.nextStates.some(s=>s.value==='shipped'));
  order=await (await f.patch(order,{state:'completed',note:'到店领取'})).json();assert.equal(order.state,'completed');
});
test('search and CSV cover the same orders and protect spreadsheet formula fields',async t=>{
  const f=await setup(t),id=await f.receipt('字母绘本'),order=await f.create(f.input([id],{recipient:{method:'shipping',name:'=HYPERLINK("example")',phone:'+8613800000000',address:'测试地址，第二行\n第三行'},note:'@SUM(1,2)'}));
  const list=await (await f.request('/api/admin/print-orders?days=all&q=13800000000',{headers:f.admin})).json();assert.equal(list.total,1);
  const response=await f.request('/api/admin/print-orders/export?days=all&q=字母绘本',{headers:f.admin}),csv=await response.text();assert.equal(response.status,200);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/'\+86138/);assert.match(csv,/'@SUM/);assert.ok(csv.includes(order.number));
  assert.equal((await f.request('/api/admin/print-orders/export?days=all')).status,401);assert.equal((await f.request('/api/admin/print-orders?state=invalid',{headers:f.admin})).status,400);
});
test('personal data expiry scrubs contacts and history without pretending unfinished orders are delivered',async t=>{
  const f=await setup(t),order=await f.create(f.input([await f.receipt()]));
  await f.patch(order,{operatorNote:'13800000000 私有信息',note:'地址与联系人信息'});f.advance(91);f.orders.cleanup();
  const expired=f.orders.detail(order.id);assert.equal(expired.state,'exception');assert.equal(expired.recipient_name,'');assert.equal(expired.phone,'');assert.equal(expired.address,'');assert.equal(expired.operator_note,'');assert.ok(expired.events.every(e=>!e.note.includes('联系人信息')));
  const login=await f.post('/api/admin/login',{password:'order-test-password'});f.admin.Cookie=login.headers.get('set-cookie').split(';')[0];f.admin['X-Admin-CSRF']=(await login.json()).csrf;
  assert.deepEqual(expired.nextStates.map(s=>s.value),['cancelled']);assert.equal((await f.patch(expired,{state:'confirmed'})).status,409);
  const cancelled=await f.patch(expired,{state:'cancelled',note:'联系信息已失效'});assert.equal(cancelled.status,200);
});
