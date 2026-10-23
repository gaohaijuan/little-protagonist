'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=path.resolve('output/qa/mountain-proof');fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:4180/?view=mountain-art';
async function ready(p){await p.waitForSelector('[data-mountain-ready=true]');}
async function readSaved(p){return p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result);};};}));}
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1100,height:1240}}),p=await context.newPage(),errors=[],requests=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push({url:r.url(),method:r.method()}));
    await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return original.call(this,type,this.id==='mountain-scene'&&type==='2d'?{...options,willReadFrequently:true}:options);};});
    await p.goto(base);await ready(p);
    const geometry=await p.evaluate(()=>window.__mountainProof);assert.equal(geometry.actorCount,1);assert.equal(geometry.sceneCount,6);
    const {placement:t,bounds:b}=geometry;
    assert.ok(t.x+b.left*t.scale>=24&&t.x+b.right*t.scale<=976);
    assert.ok(t.y+b.top*t.scale>=24&&t.y+b.bottom*t.scale<=976,'complete hair and feet stay inside illustration');
    // Frequent-read mode fixes the test raster backend for pixel comparison;
    // otherwise Chrome can change backend after getImageData calls.
    const samples=[];
    for(let i=1;i<=6;i++){
      assert.equal(await p.locator('#mountain-scene').getAttribute('data-page'),String(i));
      assert.deepEqual(await p.evaluate(()=>window.__mountainProof.placement),t);
      samples.push(await p.evaluate(()=>{const c=document.getElementById('mountain-scene').getContext('2d'),pixels=c.getImageData(0,700,1000,300).data;let delta=0;if(window.__firstForeground){for(let n=0;n<pixels.length;n++)delta=Math.max(delta,Math.abs(pixels[n]-window.__firstForeground[n]));}else window.__firstForeground=pixels;return {foregroundMaxDelta:delta,peak:Array.from(c.getImageData(620,280,20,20).data)};}));
      await p.screenshot({path:path.join(output,'page-'+i+'.png'),fullPage:true});
      if(i<6)await p.getByRole('button',{name:'下一页',exact:true}).click();
    }
    console.log('Foreground deltas:',samples.map(s=>s.foregroundMaxDelta));
    for(const sample of samples)assert.ok(sample.foregroundMaxDelta<=2,'same foreground and complete actor reused; only alpha-rounding tolerance');
    assert.notDeepEqual(samples[1].peak,samples[0].peak,'cloud crosses mountain');
    assert.deepEqual(samples[4].peak,samples[0].peak,'same mountain returns unchanged');
    assert.equal(await p.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
    await p.locator('#mountain-edition').selectOption('old');assert.match(await p.locator('#mountain-caption').innerText(),/山没有走/);
    // Synthetic saved-cutout fixture exercises storage/composition only; no real user photo is accessed.
    const family=JSON.parse(fs.readFileSync('preview/art/family/manifest.json','utf8'));
    const saved={version:4,profile:{name:'测试主角'},members:[{id:'dad',name:'爸爸'}],reading:{intro:2},avatars:{child:{kind:'cutout',data:'data:image/png;base64,'+fs.readFileSync('art-samples/my-family-production/child-head.png').toString('base64'),metrics:family.heads.child.metrics}}};
    await p.evaluate(value=>new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('child','readwrite');t.objectStore('child').put(value,'main');t.oncomplete=()=>{db.close();resolve();};};}),saved);
    await p.setViewportSize({width:390,height:844});await p.reload();await ready(p);
    assert.equal(await p.evaluate(()=>window.__mountainProof.real),true);
    await p.getByRole('button',{name:'下一页',exact:true}).click();await p.getByRole('button',{name:'下一页',exact:true}).click();
    await p.screenshot({path:path.join(output,'mobile-saved-cutout-fixture.png'),fullPage:true});
    assert.deepEqual(await readSaved(p),saved,'avatar, family and reading data untouched');
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
    assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith('http://127.0.0.1:4180/')),'no external upload or mutation');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,scenes:6,defaultGeometry:geometry,desktopChrome:true,mobileViewportSimulation:true,realUserPhotoTested:false,storageUnchanged:true,requests:requests.length},null,2));
    console.log('PASS: 6 pages; fixed camera/mountain; complete actor reuse and bounds; mobile saved-cutout fixture; storage unchanged; no uploads.');
    await context.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
