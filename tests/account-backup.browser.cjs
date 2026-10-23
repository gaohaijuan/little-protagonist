'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const codec=require('../miniprogram/lib/account-backup');
const root=path.resolve(__dirname,'../preview'),out=path.join(root,'qa/account');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await playwright.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true}),errors=[],external=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='backup.local'){external.push(url.hostname);return route.abort();}const file=url.pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const click=action=>page.locator('[data-action="'+action+'"]').click();
  const readChild=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result);};t.onabort=()=>reject(t.error);};}));
  const putChild=record=>page.evaluate(record=>new Promise((resolve,reject)=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readwrite');t.objectStore('child').put(record,'main');t.oncomplete=()=>{db.close();resolve();};t.onabort=()=>reject(t.error);};}),record);
  const selectFile=async buffer=>{await click('account-backup-import');await page.locator('#ls-account-backup-file').setInputFiles({name:'资料备份.json',mimeType:'application/json',buffer:Buffer.from(buffer)});};
  await page.goto('http://backup.local/?view=account');await page.locator('.ls-account-child').waitFor();
  await click('account-backup-export');await click('account-backup-generate');await page.getByRole('alert').filter({hasText:'请先保存小主角'}).waitFor();await click('account-cancel-backup');
  await page.evaluate(()=>{window.__backupPhotoProcessor=window.LittleFaceProcessor;window.LittleFaceProcessor={prepare:async()=>{}};});await page.locator('.ls-account > [data-action="profile"]').click();
  await page.locator('#ls-name').fill('备份宝宝');await page.locator('#ls-age').selectOption('4');await page.locator('#ls-class').selectOption('中班');await click('save-profile');await page.getByRole('heading',{name:'你好，备份宝宝'}).waitFor();
  const saved=await readChild(),portrait=process.env.FACE_TEST_PORTRAIT||path.resolve(root,'../.local/face-fixtures/portrait.jpg');
  assert.ok(fs.existsSync(portrait),'a local portrait fixture is required to verify the current face processor/backup contract');
  const actor=await page.evaluate(async data=>{
    const image=new Image();image.src=data;await image.decode();const processor=window.__backupPhotoProcessor;
    const analysis=await processor.analyze(image);if(analysis.faces.length!==1)throw Error('expected one local fixture face');
    try{const output=await processor.cutout(analysis,0);return{data:output.canvas.toDataURL('image/png'),kind:'cutout',layout:{scale:1,x:0,y:0},metrics:output.metrics};}
    finally{processor.release(analysis);image.src='';}
  },'data:image/jpeg;base64,'+fs.readFileSync(portrait).toString('base64'));
  assert.equal(actor.metrics.resolution.provenance,'original-photo-roi');assert.ok(actor.metrics.resolution.nativeFacePixels.height>0);
  const png=actor.data;saved.avatars={child:actor};await putChild(saved);
  const rows=[{bookId:'intro',page:2,cover:false,completed:false,finished:false,updatedAt:1}];
  await page.evaluate(rows=>{localStorage.setItem('little-story.preview-reading.v1',JSON.stringify({version:1,records:rows}));sessionStorage.setItem('little-story.preview-demo.v1',JSON.stringify({version:1,mode:'demo',expiresAt:Date.now()+3600000}));localStorage.setItem('little-story.preview-account-profile.v1',JSON.stringify({version:1,nickname:'备份家长',onboardingCompleted:true}));},rows);
  await page.reload();await page.locator('.ls-account-child img').waitFor();
  await click('account-backup-export');await click('account-backup-generate');const link=page.getByRole('link',{name:'下载备份文件'});await link.waitFor();
  const event=page.waitForEvent('download');await link.click();const download=await event;const failure=await download.failure();assert.equal(failure,null,JSON.stringify({failure,url:download.url(),external,errors,page:page.url()}));const text=fs.readFileSync(await download.path(),'utf8'),backup=codec.parseBrowserBackup(text);
  assert.equal(backup.child.avatars.child.data,png);assert.deepEqual(backup.child.avatars.child.metrics,saved.avatars.child.metrics);assert.deepEqual(backup.reading,rows);assert.equal(text.includes('备份家长'),false);
  await click('account-cancel-backup');
  const changed={...saved,profile:{...saved.profile,name:'更改宝宝'}};await putChild(changed);await page.reload();
  await selectFile(text);await page.locator('#ls-account-backup-word').waitFor();assert.match(await page.locator('.ls-account-backup').innerText(),/备份宝宝/);assert.match(await page.locator('.ls-account-backup').innerText(),/更改宝宝/);
  assert.equal(await page.locator('#ls-account-backup-restore').isDisabled(),true);await click('account-cancel-backup');assert.equal((await readChild()).profile.name,'更改宝宝');
  await selectFile(text);await page.locator('#ls-account-backup-word').fill('恢复');
  await page.locator('.ls-account-backup').screenshot({path:path.join(out,'restore-preview-390.png')});await click('account-backup-confirm');
  await page.getByRole('status').filter({hasText:'小主角、家人头像和阅读记录已恢复'}).waitFor();assert.equal((await readChild()).profile.name,'备份宝宝');assert.equal((await readChild()).avatars.child.data,png);assert.deepEqual((await readChild()).avatars.child.metrics,actor.metrics);
  assert.match(await page.locator('.ls-account-identity').innerText(),/备份家长/);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('little-story.preview-reading.v1')).records),rows);
  await selectFile('{invalid');await page.getByRole('alert').filter({hasText:'无法读取备份'}).waitFor();assert.equal((await readChild()).profile.name,'备份宝宝');await click('account-cancel-backup');
  await selectFile(codec.createNativeBackup({name:'微信宝宝',age:3,className:'小班'},'',[]));await page.getByRole('alert').filter({hasText:'格式不同'}).waitFor();await click('account-cancel-backup');
  await selectFile(text);await page.locator('#ls-account-backup-word').fill('恢复');await putChild({...saved,profile:{...saved.profile,name:'刚保存的新孩子'}});await click('account-backup-confirm');await page.getByRole('alert').filter({hasText:'本机孩子资料已变化'}).waitFor();assert.equal((await readChild()).profile.name,'刚保存的新孩子');await click('account-cancel-backup');
  await selectFile(text);await page.locator('#ls-account-backup-word').fill('恢复');
  await page.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw Error('simulated write failure');};});await click('account-backup-confirm');await page.getByRole('alert').filter({hasText:'simulated write failure'}).waitFor();assert.equal((await readChild()).profile.name,'刚保存的新孩子');await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});await click('account-cancel-backup');
  await selectFile(text);await page.locator('#ls-account-backup-word').fill('恢复');
  await page.evaluate(()=>{window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='little-story.preview-reading.v1')throw Error('quota');return window.__originalSet.call(this,k,v);};});await click('account-backup-confirm');
  await page.getByRole('status').filter({hasText:'孩子和家人资料已恢复，阅读记录暂未恢复'}).waitFor();assert.equal((await readChild()).profile.name,'备份宝宝');assert.match(await page.locator('#ls-account-backup-restore').innerText(),/重试/);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__originalSet;});await click('account-backup-confirm');await page.getByRole('status').filter({hasText:'小主角、家人头像和阅读记录已恢复'}).waitFor();
  for(const width of [320,768]){await page.setViewportSize({width,height:900});await click('account-backup-import');await page.locator('#ls-account-backup-file').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.ls-account-backup').screenshot({path:path.join(out,'backup-choose-'+width+'.png')});await click('account-cancel-backup');}
  await page.reload();await page.locator('.ls-account-child img').waitFor();assert.equal((await readChild()).avatars.child.data,png);assert.match(await page.locator('.ls-account-reading').innerText(),/第 3 \/ 6 页/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: current local face model produces structured source-pixel metadata; actual backup download/restore preserves its exact PNG and metrics, family/progress, login, cancel/typed confirmation, invalid/platform/stale/write failures, partial reading retry, refresh and 320/390/768px local-only layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
