'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/level1-complete-15-20261027/qa'),marker='  const { draw } = shared.art;';
const harness=`
 window.__storyCoverProof=async()=>{
  const books=listBooks(state.profile,state.members,browserCatalog),plan=shared.printPlan.createEditionPlan(books),painter=createEditionPainter(plan,{profile:state.profile,members:state.members,avatars:state.avatars,dpi:100});
  const result=[];try{for(const leaf of plan.pages.filter(p=>p.kind==='story-cover'&&[1,8,15].includes(p.chapter))){const r=await painter.render(leaf,{bleed:false,vector:true});result.push({leaf,runs:r.textRuns,png:r.canvas.toDataURL('image/png').split(',')[1]});r.canvas.width=r.canvas.height=1;}}finally{painter.dispose();}
  return {pageCount:plan.pageCount,storyCoverCount:plan.storyCoverCount,chapters:plan.chapters,result};
 };
`;
const html=fs.readFileSync(path.join(root,'preview/index.html'),'utf8').replace(marker,marker+harness);
assert.ok(html.includes('__storyCoverProof'));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:4173/?printTools=1',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:4173/?printTools=1');await page.getByRole('button',{name:'修改主角头像和名字',exact:true}).waitFor();
 const value=await page.evaluate(()=>window.__storyCoverProof());assert.equal(value.pageCount,132);assert.equal(value.storyCoverCount,15);assert.equal(value.result.length,3);
 for(const r of value.result){const title=value.chapters.find(c=>c.bookId===r.leaf.bookId).title;assert.ok(JSON.stringify(r.runs).includes(title),'Cover vector title missing');fs.writeFileSync(path.join(out,'runtime-story-cover-'+r.leaf.chapter+'.png'),Buffer.from(r.png,'base64'));delete r.png;}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'runtime-story-covers-qa.json'),JSON.stringify(value,null,2));console.log('PASS:132-page runtime plan;15 covers; first/middle/last cover painter and vector titles.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
