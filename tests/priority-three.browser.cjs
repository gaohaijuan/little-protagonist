'use strict';
// Software renderer QA: no user browser profile is opened or changed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/priority-three-20261026');
const edition=require('../miniprogram/lib/priority-three-manuscripts'),art=require('../miniprogram/lib/priority-three-art'),library=require('../content/child-pose-library.json');
fs.mkdirSync(path.join(out,'art'),{recursive:true});fs.mkdirSync(path.join(out,'qa'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1000,height:1200}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto('http://127.0.0.1:4173/?view=priority-three');
  await page.waitForFunction(()=>document.querySelector('#little-story-preview').dataset.priorityReady==='true');
  const records=[];
  for(const [index,b]of edition.books.entries()){
   assert.equal(art.BOOKS[b.id].pages.length,b.pages.length);
   for(const pose of new Set(art.BOOKS[b.id].pages.map(p=>p.pose).filter(Boolean)))assert.ok(library.poses[pose]);
   for(let i=-1;i<=b.pages.length;i++){
    await page.evaluate(async({index,i})=>window.__priorityProof.open(index,i),{index,i});
    const ui=await page.evaluate(()=>{const root=document.querySelector('#little-story-preview'),t=root.querySelector('.pr-text'),paper=root.querySelector('.pr-paper'),c=root.querySelector('canvas');return {ready:root.dataset.priorityReady,text:t.hidden?'':t.innerText,overflow:!t.hidden&&(t.scrollHeight>t.clientHeight+1||t.scrollWidth>t.clientWidth+1),paperRatio:paper.clientWidth/paper.clientHeight,canvas:{...c.dataset},error:root.querySelector('#pr-error').textContent};});
    assert.equal(ui.ready,'true',ui.error);assert.equal(ui.overflow,false,b.id+' text overflow '+i);assert.ok(Math.abs(ui.paperRatio-148/210)<.003);
    if(i>=0&&i<b.pages.length)assert.equal(ui.text,b.pages[i].join('\n'));
    await page.locator('.pr-paper').screenshot({path:path.join(out,'qa',b.id+'-'+String(i+1).padStart(2,'0')+'.png')});
    const data=await page.evaluate(async({id,i})=>(await window.__priorityProof.draw(id,i,1512,1547)).toDataURL('image/png').split(',')[1],{id:b.id,i:i===b.pages.length?-1:i});
    const file=b.id+'-'+(i<0?'cover':i===b.pages.length?'summary':String(i+1).padStart(2,'0'))+'.png';fs.writeFileSync(path.join(out,'art',file),Buffer.from(data,'base64'));
    records.push({id:b.id,page:i,file,...ui});
   }
  }
  assert.equal(records.filter(r=>r.page>=0&&r.page<edition.books.find(b=>b.id===r.id).pages.length).length,17);
  const heads=records.filter(r=>r.canvas.portraitScale).map(r=>r.canvas.portraitScale);assert.equal(new Set(heads).size,1,'same portrait scale across poses');
  assert.equal(errors.length,0,errors.join('\n'));
  assert.deepEqual(art.BOOKS['snow-revision'].pages.slice(1,4).map(p=>p.snow),[4,8,11]);
  assert.ok(art.BOOKS['insect-revision'].pages.slice(0,4).every(p=>!p.bugOnFoot));
  assert.ok(art.BOOKS['ball-revision'].pages.slice(0,4).every(p=>!p.ball&&!p.ballInHands));
  assert.deepEqual(art.BOOKS['ball-revision'].pages.slice(1,5).map(p=>p.search),['inside','front','behind','door']);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.__priorityProof.open(2,0));
  const mobile=await page.evaluate(()=>({body:document.body.scrollWidth,viewport:innerWidth,text:document.querySelector('.pr-text').scrollHeight,height:document.querySelector('.pr-text').clientHeight}));assert.ok(mobile.body<=mobile.viewport);assert.ok(mobile.text<=mobile.height+1);
  await page.screenshot({path:path.join(out,'qa','mobile.png'),fullPage:true});
  const snapshot=await page.evaluate(()=>window.__priorityProof.snapshot());
  fs.writeFileSync(path.join(out,'browser-render-qa.json'),JSON.stringify({edition:edition.edition,records,mobile,snapshot,errors},null,2));
  console.log('PASS: 17 exact-text body pages; covers/summaries; same portrait scale; reveal order; mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
