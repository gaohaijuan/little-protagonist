'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/level2-review-fixes-20261028');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const qa=read(path.resolve(root,'../output/level2-complete-15-20261028/browser-render-qa.json'));
const proof=(n,p)=>JSON.parse(qa.records.find(r=>r.number===n&&r.page===p).canvas.level2ReviewFixProof);
for(let p=0;p<5;p++){assert.ok(proof(23,p).dadNotLaughing);assert.ok(proof(23,p).childNotLaughing);assert.ok(proof(23,p).storyPortrait==='neutral');}
assert.ok(proof(23,3).dadExpressionClose);assert.equal(proof(23,3).childVisible,false);
assert.ok(proof(23,5).dadLaughing&&proof(23,5).childNotLaughing);assert.equal(proof(23,6).childNotLaughing,false);
assert.ok(proof(16,2).anklesInsideShoes);assert.deepEqual(proof(18,5).emptyBed,{key:'morning-empty-bed',x:360,ground:960,width:610});
assert.ok(proof(27,4).childVisible&&proof(27,4).childTeethVisible);
for(let p=4;p<7;p++){assert.ok(proof(24,p).bigBitten);assert.equal(proof(24,p).smallBitten,p>=5);}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage({viewport:{width:1000,height:1200}}),privateOut=path.join(out,'qa-private');fs.mkdirSync(privateOut,{recursive:true});
 const fixture=path.resolve(root,'../output/level2-last-three-20261028/qa-private'),meta=read(path.join(fixture,'real-fixture-qa.json'));
 const data='data:image/png;base64,'+fs.readFileSync(path.join(fixture,'official-adult-fixture-cutout.png')).toString('base64');
 const saved={version:3,profile:{...require('../miniprogram/lib/profile').DEFAULT_PROFILE,name:'头像测试'},members:require('../miniprogram/lib/family').defaultMembers(),avatars:{child:{kind:'cutout',data,metrics:meta.metrics}}};
 await page.goto('http://127.0.0.1:4176/?view=level2-complete');
 await page.evaluate(value=>new Promise((resolve,reject)=>{const q=indexedDB.open('little-story-local',1);q.onupgradeneeded=()=>q.result.createObjectStore('child');q.onsuccess=()=>{const db=q.result,t=db.transaction('child','readwrite');t.objectStore('child').put(value,'main');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};}),saved);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#little-story-preview').dataset.priorityReady==='true',{},{timeout:60000});
 assert.ok(await page.evaluate(()=>window.__priorityProof.profile().realPortrait));const records=[];
 for(let i=0;i<5;i++){
  await page.evaluate(i=>window.__priorityProof.open(7,i),i);const p=await page.locator('canvas').getAttribute('data-level2-review-fix-proof'),value=JSON.parse(p);
  assert.ok(value.firstPerson&&value.realPortraitExpressionPreserved);assert.equal(value.childVisible,false);assert.equal(value.storyPortrait,null);
  await page.locator('.pr-paper').screenshot({path:path.join(privateOut,'photo-no-laugh-'+(i+1)+'.png')});records.push(value);
 }
 await page.evaluate(()=>window.__priorityProof.open(11,4));const value=JSON.parse(await page.locator('canvas').getAttribute('data-level2-review-fix-proof'));
 assert.ok(value.childVisible&&value.realPortraitExpressionPreserved);assert.equal(value.storyPortrait,null);assert.equal(value.childTeethVisible,false);
 const scale=Number(await page.locator('canvas').getAttribute('data-portrait-scale'));assert.ok(Math.abs(scale-300/((meta.metrics.faceBounds.bottom-meta.metrics.faceBounds.top)*1.7))<1e-12);
 await page.locator('.pr-paper').screenshot({path:path.join(privateOut,'photo-rabbit-original-expression.png')});records.push(value);
 fs.writeFileSync(path.join(out,'repair-validation.json'),JSON.stringify({defaultRepairPages:13,allDefaultAssertionsPassed:true,realPhotoFixture:'Existing official MediaPipe adult test cutout, local-only QA',photoRecords:records,photoScale:scale,realPhotosRepainted:false,photoRabbitExpression:'Original photo preserved; visible teeth depend on the submitted expression.'},null,2));
 console.log('PASS:13 default repaired pages; first5 photo pages use child viewpoint; original photo scale/expression preserved.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
