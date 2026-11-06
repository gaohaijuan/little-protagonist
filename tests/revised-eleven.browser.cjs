'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/revised-eleven-20261027');
const edition=require('../miniprogram/lib/revised-eleven-manuscripts'),art=require('../miniprogram/lib/local-eight-art'),family=require('../miniprogram/lib/family'),revised=require('../miniprogram/lib/revised-edition');
fs.mkdirSync(path.join(out,'art'),{recursive:true});fs.mkdirSync(path.join(out,'qa'),{recursive:true});
const own=edition.localNumbers;
const refresh=(process.argv.find(a=>a.startsWith('--refresh='))||'').split('=')[1]?.split(',').map(Number);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1000,height:1200}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto('http://127.0.0.1:4173/?view=level1-revision');
  await page.waitForFunction(()=>document.querySelector('#little-story-preview').dataset.priorityReady==='true');
  const actual=await page.evaluate(()=>window.__priorityProof.edition);
  assert.deepEqual(actual.books.map(b=>b.number),[2,3,4,5,6,8,10,11,12,13,15]);
  assert.deepEqual(actual.books.find(b=>b.number===3).pages.flat(),edition.books.find(b=>b.number===3).paragraphs);
  const records=refresh?JSON.parse(fs.readFileSync(path.join(out,'browser-render-qa.json'),'utf8')).records.filter(r=>!refresh.includes(r.number)):[];
  for(const[index,b]of actual.books.entries()){
   if(refresh&&!refresh.includes(b.number))continue;
   if(b.id!=='family'&&own.includes(b.number))assert.equal(art.BOOKS[b.id].pages.length,b.pages.length);
   for(let i=-1;i<=b.pages.length;i++){
    await page.evaluate(async({index,i})=>window.__priorityProof.open(index,i),{index,i});
    const ui=await page.evaluate(()=>{const r=document.querySelector('#little-story-preview'),t=r.querySelector('.pr-text'),s=r.querySelector('.pr-paper'),c=r.querySelector('canvas');return {ready:r.dataset.priorityReady,text:t.hidden?'':t.innerText,overflow:!t.hidden&&(t.scrollHeight>t.clientHeight+1||t.scrollWidth>t.clientWidth+1),paperRatio:s.clientWidth/s.clientHeight,canvas:{...c.dataset},error:r.querySelector('#pr-error').textContent};});
    assert.equal(ui.ready,'true',ui.error);assert.equal(ui.overflow,false,b.id+' overflow '+i);assert.ok(Math.abs(ui.paperRatio-148/210)<.003);
    if(i>=0&&i<b.pages.length)assert.equal(ui.text.replace(/\n/g,''),b.pages[i].join(''));
    if(b.number===5&&(i===1||i===2)){
     const samples=await page.evaluate(()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d'),v=JSON.parse(c.dataset.camera);return [[600,285],[700,340],[450,380]].map(([x,y])=>Array.from(ctx.getImageData(Math.round((x-v.x)/v.width*c.width),Math.round((y-v.y)/v.height*c.height),1,1).data));});
     assert.ok(samples.every(([r,g,b])=>r+g+b>600),'Clouds must really cover mountain peak/slopes: '+JSON.stringify(samples));
    }
    if(own.includes(b.number))await page.locator('.pr-paper').screenshot({path:path.join(out,'qa',b.id+'-'+String(i+1).padStart(2,'0')+'.png')});
    const data=await page.evaluate(async({id,i})=>(await window.__priorityProof.draw(id,i,1512,1547)).toDataURL('image/png').split(',')[1],{id:b.id,i:i===b.pages.length?-1:i});
    const file=b.id+'-'+(i<0?'cover':i===b.pages.length?'summary':String(i+1).padStart(2,'0'))+'.png';fs.writeFileSync(path.join(out,'art',file),Buffer.from(data,'base64'));
    records.push({id:b.id,number:b.number,page:i,file,...ui});
   }
   console.log('Rendered story '+b.number+': '+b.pages.length+' body pages.');
  }
  const body=records.filter(r=>r.page>=0&&r.page<actual.books.find(b=>b.id===r.id).pages.length);
  assert.equal(body.length,73);assert.equal(body.filter(r=>own.includes(r.number)).length,56);
  const heads=body.filter(r=>r.canvas.portraitScale).map(r=>r.canvas.portraitScale);assert.equal(new Set(heads).size,1);
  const fam=body.filter(r=>r.id==='family').map(r=>JSON.parse(r.canvas.familyMembers));
  assert.deepEqual(fam,[['child'],['dad'],['mom'],['dad','mom'],['child'],['child','dad','mom']]);
  assert.deepEqual(art.BOOKS['hands-revision'].pages.map(p=>p.handState),['open','closed','open','open','closed','open','open']);
  assert.ok(art.BOOKS['mountain-revision'].pages.every(p=>p.localClouds.length===2));
  assert.equal(art.BOOKS['rain-revision'].pages[1].pose,'sit-read');
  assert.ok(art.BOOKS['water-revision'].pages.every(p=>p.reflection&&!p.ripples));
  assert.equal(art.BOOKS['calling-revision'].pages[6].bird,undefined);assert.ok(art.BOOKS['calling-revision'].pages[6].flight);
  assert.deepEqual(art.BOOKS['catbed-revision'].pages.map(p=>p.bedInventory),[['ball','car'],['ball','car'],['car'],[],[],[],[]]);
  await page.setViewportSize({width:390,height:844});const mobile=[];
  for(const number of own){const index=actual.books.findIndex(b=>b.number===number),b=actual.books[index],longest=b.pages.map(p=>p.join('')).reduce((a,s,i,ar)=>s.length>ar[a].length?i:a,0);await page.evaluate(({index,longest})=>window.__priorityProof.open(index,longest),{index,longest});const m=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,text:document.querySelector('.pr-text').scrollHeight,height:document.querySelector('.pr-text').clientHeight}));assert.ok(m.body<=m.viewport);assert.ok(m.text<=m.height+1);mobile.push({number,...m});}
  await page.screenshot({path:path.join(out,'qa','mobile.png'),fullPage:true});
  const snapshot=await page.evaluate(()=>window.__priorityProof.snapshot());
  assert.ok(snapshot.buckets.every(b=>b.window.length<=3));
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(out,'browser-render-qa.json'),JSON.stringify({edition:actual,records,mobile,snapshot,errors},null,2));
  // Private test context: large configured family and long name never touch the user's saved profile.
  const members=family.defaultMembers().map(m=>({...m,included:true}));
  members.push({id:'member-qa-a',role:'olderSister',included:true},{id:'member-qa-b',role:'youngerBrother',included:true},{id:'member-qa-c',role:'youngerSister',included:true});
  assert.equal(family.participants(members).length,12);
  const expected=revised.familyStory(members);assert.equal(expected.scenes.at(-2).memberIds[0],'child');assert.equal(expected.scenes.at(-1).memberIds.length,12);
  await page.evaluate(async members=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('little-story-local',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});await new Promise((res,rej)=>{const t=db.transaction('child','readwrite');t.objectStore('child').put({version:4,profile:{name:'阿依古丽小星星星',age:5,className:'大班'},members,avatars:{}},'main');t.oncomplete=res;t.onerror=()=>rej(t.error);});db.close();},members);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#little-story-preview').dataset.priorityReady==='true');
  const personalized=await page.evaluate(()=>window.__priorityProof.edition.books.find(b=>b.id==='family'));
  assert.equal((await page.evaluate(()=>window.__priorityProof.profile())).name,'阿依古丽小星星星');
  assert.deepEqual(personalized.pages,expected.pages);
  for(const p of [personalized.pages.length-3,personalized.pages.length-2,personalized.pages.length-1]){
   await page.evaluate(p=>window.__priorityProof.open(1,p),p);const ids=await page.locator('canvas').getAttribute('data-family-members');assert.deepEqual(JSON.parse(ids),expected.scenes[p].memberIds);
  }
  await page.locator('.pr-paper').screenshot({path:path.join(out,'qa','family-12-final.png')});
  await page.evaluate(()=>window.__priorityProof.open(1,window.__priorityProof.edition.books[1].pages.length));await page.locator('.pr-paper').screenshot({path:path.join(out,'qa','long-name-summary.png')});
  fs.writeFileSync(path.join(out,'family-personalization-qa.json'),JSON.stringify({count:12,pages:personalized.pages,scenes:personalized.scenes,longName:true},null,2));
  console.log('PASS:73 exact-wording body pages (56 newly revised); reveals, toy order, 8 mobile samples, normalized heads, 12-person actual family and long name.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

