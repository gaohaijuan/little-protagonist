'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {summarizeBooks}=require('../miniprogram/lib/literacy');
const manuscript=require('../content/level1-stories-reviewed-30.json').books,stats=summarizeBooks(manuscript);
const selections=[['mountain',7],['stone-game',6],['sunrise',22]].map(([key,source])=>({...manuscript.find(b=>b.sourceNumber===source),key}));
const output=path.resolve('output/qa/next-three');fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:4180/?view=illustration-review';
async function ready(p,key){await p.waitForSelector('[data-illustration-ready=true]');if(key)await p.waitForFunction(key=>window.__illustrationReview.book===key,key);}
async function saved(p){return p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result);};};}));}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:1250}}),p=await context.newPage(),errors=[],requests=[],checks=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await p.goto(base);await ready(p,'mountain');let faceScale;
  for(const book of selections){
   await p.locator('[data-book="'+book.key+'"]').click();await ready(p,book.key);
   assert.equal(await p.locator('#ir-title').innerText(),book.title);await p.screenshot({path:path.join(output,book.key+'-cover.png'),fullPage:true});
   await p.locator('#ir-next').click();
   for(let i=0;i<book.pages.length;i++){
    const state=await p.evaluate(()=>window.__illustrationReview);assert.equal(state.page,i);assert.equal(state.actorCount,1,'one complete character reused across all books');
    if(faceScale===undefined)faceScale=state.headScale;assert.equal(state.headScale,faceScale);
    const {placement:t,characterBounds:b}=state;assert.ok(t.x+b.left*t.scale>=24&&t.x+b.right*t.scale<=976,'full hair inside horizontal safe area');assert.ok(t.y+b.top*t.scale>=24&&t.y+b.bottom*t.scale<=976,'head/feet inside page');
    assert.equal((await p.locator('#ir-caption').innerText()).replace(/\n+/g,'|'),book.pages[i].join('|'));
    if(book.key==='stone-game'){
      assert.equal(state.sceneState.handsBehind,i===2);assert.equal(state.sceneState.stoneVisible,[0,1,5].includes(i));
      if(i===4)assert.equal(state.sceneState.mother,'mother-empty.webp');if(i===5)assert.equal(state.sceneState.mother,'mother-reveal.webp');
    }
    if(book.key==='sunrise')assert.equal(state.sceneState.sunVisible,i>=5);
    await p.screenshot({path:path.join(output,book.key+'-'+(i+1)+'.png'),fullPage:true});checks.push({book:book.key,page:i+1,placement:t,headScale:state.headScale,scene:state.sceneState});
    await p.locator('#ir-next').click();
   }
   assert.equal(await p.locator('#ir-title').innerText(),'识字小结');const s=stats.find(s=>s.id===book.id);assert.deepEqual(await p.locator('.ir-counts b').allTextContents(),[s.count+'字',s.newCount+'字',s.cumulativeCount+'字']);await p.screenshot({path:path.join(output,book.key+'-summary.png'),fullPage:true});
  }
  // Synthetic saved-cutout fixture only. No real user photo is read by this test.
  const family=require('../preview/art/family/manifest.json'),fixture={version:4,profile:{name:'测试主角'},members:[{id:'mom',name:'妈妈'}],reading:{intro:2},avatars:{child:{kind:'cutout',data:'data:image/png;base64,'+fs.readFileSync('art-samples/my-family-production/child-head.png').toString('base64'),metrics:family.heads.child.metrics}}};
  await p.evaluate(value=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readwrite');t.objectStore('child').put(value,'main');t.oncomplete=()=>{db.close();resolve();};};}),fixture);
  await p.setViewportSize({width:390,height:844});await p.reload();await ready(p,'mountain');assert.equal(await p.evaluate(()=>window.__illustrationReview.real),true);
  for(const book of selections){await p.locator('[data-book="'+book.key+'"]').click();await ready(p,book.key);await p.locator('#ir-next').click();await p.screenshot({path:path.join(output,'mobile-'+book.key+'.png'),fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.evaluate(()=>window.__illustrationReview.actorCount),1);}
  assert.deepEqual(await saved(p),fixture,'saved avatar, family and reading progress unchanged');
  // Delay the older selection: it must never replace a newer selected book.
  await p.route('**/stone-game/mother-empty.webp',async route=>{await new Promise(r=>setTimeout(r,450));await route.continue();});
  await p.locator('[data-book="stone-game"]').click();await p.locator('[data-book="sunrise"]').click();await ready(p,'sunrise');await p.waitForTimeout(600);assert.equal(await p.evaluate(()=>window.__illustrationReview.book),'sunrise');
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith('http://127.0.0.1:4180/')),'no external upload');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,books:3,bodyPages:checks.length,covers:3,summaries:3,checks,savedCutoutFixture:true,physicalPhoneTested:false,userStorageUnchanged:true,staleBookSelectionProtected:true},null,2));
  console.log('PASS: 3 books, 20 body pages, 3 covers and summaries; one character reused; saved-cutout/mobile viewport; no storage changes/uploads; stale selection guarded.');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
