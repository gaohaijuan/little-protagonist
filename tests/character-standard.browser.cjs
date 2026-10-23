'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../preview'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker='  const poseLibrary=';assert.equal(source.split(marker).length,2);
const html=source.replace(marker,`window.__rigAudit={prepare:0,compose:0,place:[]};
const originalComposer=shared.characterRig.createComposer;shared.characterRig.createComposer=function(...args){const c=originalComposer(...args);let first=null;return {prepare(...a){window.__rigAudit.prepare++;return c.prepare(...a);},compose(...a){window.__rigAudit.compose++;return c.compose(...a);},release(...a){return c.release(...a);},place(ctx,actor,placement){if(!first)first=actor.image;window.__rigAudit.place.push({same:first===actor.image,scale:placement.scale,width:actor.image.width,height:actor.image.height});return c.place(ctx,actor,placement);}};};
`+marker);
const fixture='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../art-samples/my-flower-production/search-head.png')).toString('base64');
const metrics=JSON.parse(fs.readFileSync(path.join(root,'art/flower/manifest.json'),'utf8')).scenes.search.headMetrics;
(async()=>{const browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
  for(const width of [590,1200]){
    const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),requests=[];
    await context.route('http://rig.local/**',r=>{assert.equal(r.request().method(),'GET','only local asset reads; no portrait uploads');const url=new URL(r.request().url()),f=path.join(root,url.pathname==='/'?'index.html':'.'+url.pathname);requests.push(url.pathname);return r.fulfill({status:fs.existsSync(f)?200:404,contentType:f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'image/webp',body:url.pathname==='/'?html:fs.existsSync(f)?fs.readFileSync(f):''});});
    await page.goto('http://rig.local/?view=character-standard');await page.locator('[data-character-ready="true"]').waitFor();assert.match(await page.locator('#cs-source').innerText(),/默认绘本头像/);
    const saved={version:4,profile:{name:'小石头',age:5,className:'大班'},avatars:{child:{data:fixture,kind:'cutout',metrics,layout:{scale:1.6,x:35,y:-35}}}};
    await page.evaluate(record=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('child','readwrite');tx.objectStore('child').put(record,'main');tx.oncomplete=()=>{db.close();resolve();};};}),saved);
    await page.reload();await page.locator('[data-character-ready="true"]').waitFor();assert.match(await page.locator('#cs-source').innerText(),/真人头像/);
    const audit=await page.evaluate(()=>window.__rigAudit);assert.equal(audit.prepare,1);assert.equal(audit.compose,1);assert.equal(audit.place.length,3);assert.ok(audit.place.every(a=>a.same));assert.ok(Math.abs(audit.place[1].scale/audit.place[0].scale-1.2)<1e-9);assert.ok(Math.abs(audit.place[2].scale/audit.place[0].scale-.7)<1e-9);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(requests.some(u=>u.includes('models/')),false,'reading a saved portrait never starts recognition again');
    const output=path.join(root,'qa/character-standard');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'same-actor-'+width+'.png'),fullPage:true});
    await page.getByRole('link',{name:'‹ 返回书架'}).click();await page.getByRole('heading',{name:'你好，小石头',exact:true}).waitFor();
    await context.close();
  }
  console.log('PASS: default/real saved portraits, one composition reused at three scales, mobile/desktop fit, no uploads or re-recognition, unchanged shelf.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
