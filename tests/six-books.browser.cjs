'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { getBook, listBooks } = require('../miniprogram/lib/stories');
const { summarizeBooks } = require('../miniprogram/lib/literacy');
const { defaultMembers } = require('../miniprogram/lib/family');
const root = path.resolve(__dirname, '..'), preview = path.join(root, 'preview');
const output = path.join(preview, 'qa/six-books'); fs.mkdirSync(output, { recursive: true });
const ids = ['intro','flower','family','hands','rain','stone'], added = ids.slice(3);
const manifests = Object.fromEntries(added.map(id => [id, JSON.parse(fs.readFileSync(path.join(preview, 'art/sequence', id, 'manifest.json'), 'utf8'))]));
const profile = {name:'小小石头开心宝贝',age:3,className:'小班',avatarPath:''};
const expectedSummaries = summarizeBooks(listBooks({...profile,name:'CHILD'},defaultMembers(),{includeApproved:true}));
// This fictional, previously generated head exercises saved photos without reading user photographs.
const photo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'art-samples/my-flower-production/search-head.png')).toString('base64');
const metrics = JSON.parse(fs.readFileSync(path.join(preview, 'art/flower/manifest.json'), 'utf8')).scenes.search.headMetrics;
const policy = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8').match(/'Content-Security-Policy':\s*"([^"]+)"/)[1];
const marker = '  const { draw } = shared.art;';
const source = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
assert.equal(source.split(marker).length, 2);
// Observe the real renderers; no images or rendering results are substituted.
const html = source.replace(marker, `
  window.__sequenceAudit={legacy:[],paint:[],states:[]};
  const observedOld=shared.art.draw;
  shared.art.draw=function(canvas,o){window.__sequenceAudit.legacy.push(o.book);return observedOld.apply(this,arguments);};
  const observedNew=shared.sequenceArt.draw;
  shared.sequenceArt.draw=function(canvas,o){const staged=!canvas.isConnected&&o.width===1400&&o.artPanel;if(staged){canvas.dataset.art=o.book;canvas.dataset.page=o.page;canvas.dataset.cover='0';canvas.__auditReader=true;}const event={book:o.book,page:o.page,cover:!!o.cover,staged,connected:canvas.isConnected,reader:!!canvas.closest('.ls-reader'),status:window.LittleSequenceArtLoader.forBook(o.book).status(o.page,o)};window.__sequenceAudit.paint.push(event);event.result=observedNew.apply(this,arguments);return event.result;};
  new MutationObserver(changes=>changes.forEach(m=>{if(m.target.matches('canvas[data-art]'))window.__sequenceAudit.states.push({book:m.target.dataset.art,page:Number(m.target.dataset.page),reader:!!m.target.closest('.ls-reader'),value:m.target.getAttribute('data-art-state')});})).observe(document.getElementById('little-story-preview'),{subtree:true,attributes:true,attributeFilter:['data-art-state']});
` + marker);
const action = (page,name) => page.locator('[data-action="'+name+'"]');
const reader = '.ls-reader-art canvas';
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page, selector=reader) { await page.locator(selector+'[data-art-state="ready"]').waitFor(); await frames(page); }
async function fixture(browser, options={}) {
  const context=await browser.newContext({viewport:options.size||{width:568,height:320},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const errors=[],requests=[],holds=new Map(),failures=new Set(options.failures||[]);
  for(const file of options.holds||[]){let release,markRequested;const promise=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{markRequested=resolve;});holds.set(file,{release,promise,requested,markRequested,hits:0});}
  await context.route('http://six.local/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;requests.push(pathname);
    assert.equal(route.request().method(),'GET','art loading sends no saved photographs');
    if(pathname==='/')return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':policy},body:html});
    if(failures.has(pathname))return route.fulfill({status:503,body:''});
    const gate=holds.get(pathname);if(gate){gate.hits++;gate.markRequested();await gate.promise;}
    const file=path.resolve(preview,'.'+pathname);
    if(!file.startsWith(preview+path.sep)||!/^\/art\/(intro|flower|family|sequence)\//.test(pathname)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({status:200,contentType:file.endsWith('.json')?'application/json':'image/webp',body:fs.readFileSync(file)});
  });
  await context.addInitScript(({photo,bounds})=>{
    window.__savedHeads=[];
    const original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      if((window.LittlePhotoTone?.originalOf(image)||image).src===photo&&['hands','rain','stone'].includes(this.canvas.dataset.art)){
        const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
        const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===8?args:[0,0,iw,ih,args[0],args[1],args.length===4?args[2]:iw,args.length===4?args[3]:ih];
        const transform=this.getTransform(),c=this.canvas;
        const corners=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>new DOMPoint(dx+(x-sx)*dw/sw,dy+(y-sy)*dh/sh).matrixTransform(transform));
        window.__savedHeads.push({book:c.dataset.art,page:Number(c.dataset.page),cover:c.dataset.cover==='1',reader:!!c.closest('.ls-reader')||!!c.__auditReader,left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y)),width:c.width,height:c.height,artPanel:!!c.__auditReader,aspect:Math.abs(dw/sw-dh/sh)});
      }
      return original.call(this,image,...args);
    };
  },{photo,bounds:metrics.bounds});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://six.local/');await page.getByRole('heading',{name:'你好，小石头',exact:true}).waitFor();
  return {page,context,errors,requests,holds,failures,release(file){holds.get(file)?.release();holds.delete(file);},async close(){for(const gate of holds.values())gate.release();await context.close();}};
}
async function saveProfile(page){
  await page.evaluate(({profile,photo,metrics,members})=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('little-story-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('child','readwrite');tx.objectStore('child').put({version:4,profile,members,avatars:{child:{data:photo,kind:'cutout',layout:{scale:1,x:0,y:0},metrics}}},'main');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  }),{profile,photo,metrics,members:defaultMembers()});
  await page.reload();await page.getByRole('heading',{name:'你好，'+profile.name,exact:true}).waitFor();
}
async function open(page,id){await page.locator('[data-action="book"][data-id="'+id+'"]').click();await action(page,'start').click();if(await action(page,'landscape').count())await action(page,'landscape').click();await page.locator('.ls-reader').waitFor();}
async function body(page,id){await open(page,id);if(await page.locator('.ls-reader-cover-stage').count())await action(page,'next').click();}
async function checkSummary(page,id){
  const expected=expectedSummaries.find(item=>item.id===id),panel=page.locator('[data-literacy-book="'+id+'"]');
  for(const [key,value] of [['body',expected.count],['new',expected.newCount],['cumulative',expected.cumulativeCount]])assert.equal((await panel.locator('[data-literacy="'+key+'"]').innerText()).replace(/\s/g,''),value+'字',id+' '+key+' exact body-based summary');
  const expandable=await panel.locator('summary').count();if(expandable)await panel.locator('summary').click();
  assert.deepEqual(await panel.locator('.ls-character-list').first().locator('span').allTextContents(),expected.characters);
  assert.match(await panel.innerText(),/读过不代表掌握/);
  assert.ok(await panel.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'expanded character lists do not overflow');
  if(expandable)await panel.locator('summary').click();
}
async function audit(page){
  const result=await page.evaluate(()=>({legacy:window.__sequenceAudit.legacy.filter(id=>['hands','rain','stone'].includes(id)),bad:window.__sequenceAudit.paint.filter(item=>(!item.connected&&!item.staged)||item.status!=='ready'||item.result!==true)}));
  assert.deepEqual(result,{legacy:[],bad:[]},'new books never draw an unrelated legacy scene or an incomplete raster');
}
async function reading(browser){
  const f=await fixture(browser,{size:{width:390,height:844}}),{page}=f;
  try{
    await saveProfile(page);
    assert.deepEqual(await page.locator('.ls-book').evaluateAll(nodes=>nodes.map(node=>node.dataset.id)),ids);
    assert.match(await page.locator('.ls-footnote').first().innerText(),/6 本故事/);
    for(const id of ids)await ready(page,'.ls-book[data-id="'+id+'"] canvas');
    assert.deepEqual(await page.locator('.ls-book .ls-cover-number').allTextContents(),['01','02','03','04','05','06']);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'six-book mobile shelf has no horizontal overflow');
    await page.screenshot({path:path.join(output,'shelf-390.png'),fullPage:true});
    for(const size of [{width:390,height:844},{width:568,height:320}]){
      await page.setViewportSize(size);
      for(const id of ids){
        const expected=getBook(id,profile,defaultMembers(),{includeApproved:true}).pages;
        await page.locator('[data-action="book"][data-id="'+id+'"]').click();await checkSummary(page,id);await action(page,'home').click();
        await open(page,id);await ready(page,'.ls-reader-cover-stage canvas');
        const geometry=await page.locator('.ls-book-cover[data-cover-variant="reader"]').evaluate(cover=>{const title=cover.querySelector('.ls-cover-title').getBoundingClientRect(),art=cover.querySelector('canvas').getBoundingClientRect();return {above:title.bottom<=art.top,center:Math.abs((title.left+title.right)-(art.left+art.right))<3,fit:cover.scrollHeight<=cover.clientHeight+1};});
        assert.ok(geometry.above&&geometry.center&&geometry.fit,id+' cover title stays centered above its art');
        assert.equal(await page.locator('.ls-cover-progress').innerText(),'封面');await action(page,'next').click();
        for(let index=0;index<expected.length;index++){
          await ready(page);
          assert.equal((await page.locator('.ls-page-text').innerText()).replace(/\s/g,''),expected[index].join('').replace(/\s/g,''),id+' exact approved page '+(index+1));
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),String(index+1));
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuemax'),String(expected.length));
          const fit=await page.locator('.ls-page-text').evaluate(text=>({width:text.scrollWidth<=text.clientWidth+1,height:text.scrollHeight<=text.clientHeight+1,font:parseFloat(getComputedStyle(text).fontSize),viewport:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1,horizontal:document.documentElement.scrollWidth<=innerWidth,next:document.querySelector('[data-action="next"]').getBoundingClientRect().bottom<=innerHeight}));
          assert.ok(fit.width&&fit.height&&fit.font>=11&&fit.horizontal,JSON.stringify({id,index,size,fit}));
          if(added.includes(id)){
            const scene=manifests[id].scenes[manifests[id].pages[index].scene],heads=await page.evaluate(({id,index})=>window.__savedHeads.filter(h=>h.book===id&&h.page===index&&!h.cover&&h.reader),{id,index});
            assert.equal(heads.length>0,scene.head!==false,id+' photo only appears on character scenes '+(index+1));
            for(const head of heads)assert.ok(head.left>=-1&&head.top>=-1&&head.right<=head.width+1&&head.bottom<=head.height+1&&head.aspect<1e-6,'whole undistorted head stays within illustration area');
            if(size.width===568)await page.screenshot({path:path.join(output,id+'-page-'+(index+1)+'-568.png')});
          }
          await action(page,'next').click();
        }
        await page.locator('.ls-reader-end-stage').waitFor();await checkSummary(page,id);
        await ready(page,'.ls-end-picture canvas');
        assert.equal(await page.locator('.ls-end-characters>span').count(),expectedSummaries.find(s=>s.id===id).count,'book word list is visible without opening details');
        const leaf=await page.locator('.ls-book-end').evaluate(el=>{const area=el.parentElement.getBoundingClientRect(),r=el.getBoundingClientRect();return {fixed:el.offsetWidth===740&&el.offsetHeight===1050,contained:r.left>=area.left-1&&r.right<=area.right+1&&r.top>=area.top-1&&r.bottom<=area.bottom+1,noScroll:el.parentElement.scrollHeight<=el.parentElement.clientHeight+1,content:[...el.querySelectorAll('p,h2,h3,dl,.ls-end-characters')].every(n=>n.getBoundingClientRect().bottom<=r.bottom+1)};});
        assert.deepEqual(leaf,{fixed:true,contained:true,noScroll:true,content:true},id+' summary is one fully visible fixed-size leaf at '+size.width);
        if(size.width===568)await page.locator('.ls-reader-end-stage').screenshot({path:path.join(output,id+'-book-end-568.png')});
        await action(page,'previous').click();await ready(page);assert.equal(await page.locator(reader).getAttribute('data-page'),String(expected.length-1));
        await action(page,'next').click();await page.locator('.ls-reader-end-stage').waitFor();
        await action(page,'next').click();await page.getByRole('heading',{name:'我读完啦！'}).waitFor();await checkSummary(page,id);
        if(added.includes(id)&&size.width===568)await page.screenshot({path:path.join(output,id+'-summary-568.png')});
        await action(page,'home').click();
        assert.equal(await page.locator('.ls-book[data-id="'+id+'"] .ls-check').count(),1);
      }
    }
    for(const id of added){
      await open(page,id);await action(page,'next').click();await ready(page);await action(page,'next').click();await ready(page);await action(page,'home').click();
      await page.locator('[data-action="book"][data-id="'+id+'"]').click();assert.match(await action(page,'start').innerText(),/继续阅读/);await action(page,'start').click();if(await action(page,'landscape').count())await action(page,'landscape').click();await ready(page);assert.equal(await page.locator(reader).getAttribute('data-page'),'1');
      const before=await page.evaluate(()=>window.__sequenceAudit.states.length);await action(page,'next').click();await ready(page);
      assert.deepEqual(await page.evaluate(({before,id})=>window.__sequenceAudit.states.slice(before).filter(x=>x.book===id&&x.reader&&x.value==='loading'),{before,id}),[],'cached new page never flashes its placeholder');
      await action(page,'home').click();
    }
    await audit(page);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
}
async function failureAndRetry(browser,id){
  const pathname='/art/sequence/'+id+'/manifest.json',f=await fixture(browser,{failures:[pathname]}),{page}=f;
  try{
    await body(page,id);await page.locator(reader+'[data-art-state="error"]').waitFor();
    const notice=page.locator('.ls-reader [data-art-book="'+id+'"]');await notice.waitFor({state:'visible'});
    assert.match(await notice.innerText(),/可以先读文字/);assert.ok((await page.locator('.ls-page-text').innerText()).length>0);
    f.failures.delete(pathname);await notice.locator('[data-action="retry-art"]').click();await ready(page);assert.equal(await notice.isVisible(),false);
    await audit(page);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
}
async function prefetchedPage(browser,id,leave){
  const m=manifests[id],seen=new Set([m.files[m.cover.scene]]);let target=-1;
  for(let i=0;i<m.pages.length;i++){const file=m.files[m.pages[i].scene];if(i>0&&!seen.has(file)){target=i;break;}seen.add(file);}
  assert.ok(target>0,id+' has a fresh later scene for deterministic prefetch gating');
  const pathname='/art/sequence/'+id+'/'+m.files[m.pages[target].scene],f=await fixture(browser,{holds:[pathname]}),{page}=f;
  try{
    await body(page,id);await ready(page);
    for(let i=0;i<target-1;i++){await action(page,'next').click();await ready(page);}
    await page.waitForFunction(({id,target})=>window.LittleSequenceArtLoader.forBook(id).status(target)==='loading',{id,target});
    await f.holds.get(pathname).requested;
    assert.ok(f.holds.get(pathname).hits,'the next scene is actually fetching before navigation');
    await action(page,'next').click();await page.locator(reader+'[data-art-state="loading"]').waitFor();
    assert.equal(await page.locator(reader).getAttribute('data-page'),String(target));
    if(leave){await action(page,'home').click();await body(page,'flower');await ready(page);}
    f.release(pathname);
    await page.waitForFunction(({id,target})=>window.LittleSequenceArtLoader.forBook(id).status(target)==='ready',{id,target});await ready(page);
    assert.equal(await page.locator(reader).getAttribute('data-art'),leave?'flower':id);
    assert.equal(await page.locator(reader).getAttribute('data-page'),leave?'0':String(target));
    await audit(page);assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
}
(async()=>{const browser=await playwright.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{await reading(browser);for(const id of added){await failureAndRetry(browser,id);await prefetchedPage(browser,id,false);}await prefetchedPage(browser,'stone',true);console.log('PASS: six books, exact approved text, both phone layouts, saved photos, progress, error/retry, cached flips, pending prefetch and stale completion.');}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
