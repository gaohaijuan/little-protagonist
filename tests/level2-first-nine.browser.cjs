'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/level2-first-nine-20261028'),art=require('../miniprogram/lib/layered-art');
fs.mkdirSync(path.join(out,'art'),{recursive:true});fs.mkdirSync(path.join(out,'qa'),{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage({viewport:{width:1000,height:1200}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:4173/?view=level2-first-nine');await page.waitForFunction(()=>document.querySelector('#little-story-preview').dataset.priorityReady==='true',{},{timeout:60000});
 const edition=await page.evaluate(()=>window.__priorityProof.edition);assert.deepEqual(edition.books.map(b=>b.number),[16,17,18,19,20,21,22,23,24]);const records=[];
 const source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8'));
 for(const [index,b] of edition.books.entries()){
  assert.equal(b.pages.flat().join(' '),source.books.find(s=>s.number===b.number).text);assert.equal(art.BOOKS[b.id].pages.length,b.pages.length);
  for(let i=-1;i<=b.pages.length;i++){
   await page.evaluate(async({index,i})=>window.__priorityProof.open(index,i),{index,i});
   const ui=await page.evaluate(()=>{const r=document.querySelector('#little-story-preview'),t=r.querySelector('.pr-text'),s=r.querySelector('.pr-paper'),c=r.querySelector('canvas');return{ready:r.dataset.priorityReady,text:t.hidden?'':t.innerText,overflow:!t.hidden&&(t.scrollHeight>t.clientHeight+1||t.scrollWidth>t.clientWidth+1),paperRatio:s.clientWidth/s.clientHeight,canvas:{...c.dataset},error:r.querySelector('#pr-error').textContent};});
   assert.equal(ui.ready,'true',ui.error);assert.equal(ui.overflow,false,b.id+' overflow '+i);assert.ok(Math.abs(ui.paperRatio-148/210)<.003);
   if(i>=0&&i<b.pages.length)assert.equal(ui.text.replace(/\n/g,''),b.pages[i].join(''));
   await page.locator('.pr-paper').screenshot({path:path.join(out,'qa',b.id+'-'+String(i+1).padStart(2,'0')+'.png')});
   const data=await page.evaluate(async({id,i})=>(await window.__priorityProof.draw(id,i,1512,1547)).toDataURL('image/png').split(',')[1],{id:b.id,i:i===b.pages.length?-1:i});
   const file=b.id+'-'+(i<0?'cover':i===b.pages.length?'summary':String(i+1).padStart(2,'0'))+'.png';fs.writeFileSync(path.join(out,'art',file),Buffer.from(data,'base64'));records.push({id:b.id,number:b.number,page:i,file,...ui});
  }
  console.log('Rendered '+b.title+': '+b.pages.length+' body pages.');
 }
 const body=records.filter(r=>r.page>=0&&r.page<edition.books.find(b=>b.id===r.id).pages.length);assert.equal(body.length,67);
 const heads=body.filter(r=>r.canvas.portraitScale).map(r=>r.canvas.portraitScale);assert.equal(new Set(heads).size,1);
 const proofs=body.filter(r=>r.canvas.level2Proof).map(r=>({number:r.number,page:r.page,...JSON.parse(r.canvas.level2Proof)}));
 assert.ok(proofs.filter(r=>r.number===17&&[5,6].includes(r.page)).every(p=>p.carStored&&p.garageClosed));
 assert.deepEqual(proofs.filter(r=>r.number===18&&r.sleepingDad).map(r=>r.page),[3,4]);assert.deepEqual(proofs.filter(r=>r.number===18&&r.fatherStanding).map(r=>r.page),[5,7]);
 await page.setViewportSize({width:390,height:844});const mobile=[];
 for(const[index,b]of edition.books.entries())for(let i=0;i<b.pages.length;i++){
  await page.evaluate(({index,i})=>window.__priorityProof.open(index,i),{index,i});const ui=await page.evaluate(()=>{const t=document.querySelector('.pr-text');return{body:document.body.scrollWidth,viewport:innerWidth,text:t.scrollHeight,height:t.clientHeight};});assert.ok(ui.body<=ui.viewport);assert.ok(ui.text<=ui.height+1,b.id+' mobile '+i);mobile.push({number:b.number,page:i,...ui});
 }
 await page.screenshot({path:path.join(out,'qa','mobile.png'),fullPage:true});const snapshot=await page.evaluate(()=>window.__priorityProof.snapshot());assert.ok(snapshot.buckets.every(b=>b.window.length<=3));assert.ok(snapshot.adultComposites<=1);assert.deepEqual(errors,[]);
 const nextProofs=body.filter(r=>r.canvas.level2NextProof).map(r=>({number:r.number,page:r.page,...JSON.parse(r.canvas.level2NextProof)}));assert.equal(nextProofs.length,22);assert.ok(nextProofs.find(r=>r.number===19&&r.page===4).touchCupSide);assert.ok(nextProofs.find(r=>r.number===20&&r.page===3).bug.hidden);assert.equal(nextProofs.find(r=>r.number===20&&r.page===6).bug.hidden,undefined);assert.equal(nextProofs.find(r=>r.number===21&&r.page===3).ball.x,nextProofs.find(r=>r.number===21&&r.page===2).ball.x);
 const thirdProofs=body.filter(r=>r.canvas.level2ThirdProof).map(r=>({number:r.number,page:r.page,...JSON.parse(r.canvas.level2ThirdProof)}));assert.equal(thirdProofs.length,22);assert.deepEqual(thirdProofs.filter(r=>r.number===23&&r.dadBack).map(r=>r.page),[0,1,2,3,4]);assert.deepEqual(thirdProofs.filter(r=>r.number===23&&r.dadFront).map(r=>r.page),[5,6]);assert.ok(thirdProofs.filter(r=>r.number===22&&r.page>=5).every(r=>r.stone));assert.equal(thirdProofs.find(r=>r.number===24&&r.page===0).friend,null);
 fs.writeFileSync(path.join(out,'browser-render-qa.json'),JSON.stringify({edition,records,mobile,snapshot,proofs,nextProofs,thirdProofs,errors},null,2));
 console.log('PASS:67 exact-text body pages, normalized child heads, cached father, 67 mobile checks, three-book window.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
