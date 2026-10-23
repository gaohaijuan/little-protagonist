'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{once}=require('node:events');
const {createApplication}=require('../server/app.cjs');
const deps='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const {chromium}=require(deps+'playwright'),{PDFDocument,PDFName}=require(deps+'pdf-lib');
const {defaultMembers,createSibling}=require('../miniprogram/lib/family');
const {listBooks}=require('../miniprogram/lib/stories'),{createEditionPlan}=require('../miniprogram/lib/print-plan');
const root=path.resolve(__dirname,'..'),out=path.join(root,'preview/qa/print-service');fs.mkdirSync(out,{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.local/print-service-orders-')),password='isolated-print-service-test';
(async()=>{
 const errors=[],app=createApplication({adminPassword:password,localDevelopment:true,dataDir:directory,onError:e=>errors.push(e.message)});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const user=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  await user.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await user.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.ls-print-entry').waitFor();
  const portrait=fs.readFileSync(path.join(root,'.local/face-fixtures/portrait.jpg')).toString('base64');
  const actor=await page.evaluate(async data=>{
   const p=window.LittleFaceProcessor,image=new Image();image.src=data;await image.decode();const analysis=await p.analyze(image);
   try{const result=await p.cutout(analysis,0);return{data:result.canvas.toDataURL('image/png'),kind:'cutout',layout:{scale:1,x:0,y:0},metrics:result.metrics};}finally{p.release(analysis);}
  },'data:image/jpeg;base64,'+portrait);
  const profile={name:'豆包',age:4,className:'中班'},members=createSibling(defaultMembers(),'olderSister'),saved={version:4,profile,members,avatars:{child:actor}};
  await page.evaluate(record=>new Promise((resolve,reject)=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readwrite');t.objectStore('child').put(record,'main');t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};}),saved);
  await page.reload();await page.locator('[data-action="print-service"]').click();await page.locator('[data-level="1"]').click();
  assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n,0);assert.equal(app.orders.list({days:'all'}).total,0);
  assert.equal(await page.locator('[data-action="download-level"]').count(),0);
  await page.screenshot({path:path.join(out,'connected-checklist-390.png'),fullPage:true});
  await page.locator('[data-action="confirm-level-print"]').click();
  await page.locator('[data-order-dialog-close]').click();assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n,0,'cancel generates and sends nothing');
  let attempts=0,uploaded;
  await page.route('**/api/prints?*',async route=>{
   attempts++;uploaded=route.request().postDataBuffer();
   if(attempts===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"测试网络中断"}'});
   return route.continue();
  });
  await page.locator('[data-action="confirm-level-print"]').click();
  const form=page.locator('#ls-order-form');await form.locator('[name="copies"]').fill('2');await form.locator('[name="method"]').selectOption('pickup');await form.locator('[name="name"]').fill('测试家长');await form.locator('[name="phone"]').fill('13800000000');await form.locator('[name="consent"]').check();await form.locator('button[type="submit"]').click();
  await page.locator('.ls-print-status').filter({hasText:'测试网络中断'}).waitFor({timeout:240000});
  assert.ok(uploaded?.subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(app.orders.list({days:'all'}).total,0);
  const digest=crypto.createHash('sha256').update(uploaded).digest('hex');
  await page.locator('[data-action="retry-print-submission"]').click();
  await page.locator('.ls-print-status').filter({hasText:'订单号'}).waitFor({timeout:120000});
  assert.equal(attempts,2);assert.equal(crypto.createHash('sha256').update(uploaded).digest('hex'),digest,'retry reuses the generated file');
  assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n,1);assert.equal(app.orders.list({days:'all'}).total,1);
  const order=app.orders.list({days:'all'}).rows[0];assert.equal(order.totalCopies,2);assert.equal(order.bookCount,1);
  const detail=app.orders.detail(order.id);assert.equal(detail.items[0].book,'level-1');
  assert.equal(detail.printPlan.storyCount,6);assert.equal(detail.printPlan.volumeCount,1);assert.equal(detail.printPlan.sample,true);
  const doc=await PDFDocument.load(uploaded),plan=createEditionPlan(listBooks(profile,members,{includeApproved:true}));assert.equal(doc.getPageCount(),plan.pageCount);
  for(const p of doc.getPages()){assert.ok(Math.abs(p.getWidth()*25.4/72-154)<.01);assert.ok(Math.abs(p.getHeight()*25.4/72-216)<.01);assert.ok(Math.abs(p.getTrimBox().width*25.4/72-148)<.01);}
  assert.ok([...doc.context.enumerateIndirectObjects()].some(([,v])=>v?.get?.(PDFName.of('FontFile2'))),'Chinese font embedded');
  const restored=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result);};};}));assert.deepEqual(restored,saved,'printing cannot change original photo or family');
  await page.screenshot({path:path.join(out,'submitted-390.png'),fullPage:true});
  const adminContext=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(base+'/admin');await admin.locator('#password').fill(password);await admin.locator('#login-form button').click();await admin.locator('#workspace').waitFor({state:'visible'});
  await admin.locator('[data-tab="orders"]').click();await admin.locator('[data-order-open]').first().click();await admin.locator('#order-contact').waitFor();
  assert.match(await admin.locator('#workspace').innerText(),/打印分册清单/);assert.match(await admin.locator('#workspace').innerText(),/6个故事 · 1册/);
  const event=admin.waitForEvent('download');await admin.getByRole('link',{name:'下载 PDF',exact:true}).click();const downloaded=await event;assert.equal(await downloaded.failure(),null);
  const bytes=fs.readFileSync(await downloaded.path());assert.deepEqual(bytes,uploaded);fs.writeFileSync(path.join(directory,'admin-downloaded.pdf'),bytes);
  await admin.screenshot({path:path.join(out,'admin-order-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: actual service UI → parent consent → real personalized '+plan.pageCount+'-page A5 PDF → failure/retry → one order ×2 → authenticated admin exact-byte download, original avatar/family unchanged. Private PDF: '+path.join(directory,'admin-downloaded.pdf'));
 }finally{await browser.close();await new Promise(resolve=>app.server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
