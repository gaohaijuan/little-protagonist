'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../preview'),out=path.resolve(root,'../../browser-test/print-service');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],external=[];
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());if(url.hostname!=='service.local'||request.method()!=='GET'){external.push(request.url());return route.abort();}
   const file=url.pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.json':'application/json','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const click=name=>page.locator('[data-action="'+name+'"]').first().click();
  await page.goto('http://service.local/');await page.locator('.ls-print-entry').waitFor();
  const technical='[data-action="download-level"],[data-action="download-level-package"],[data-action="print-level"],[data-action="download-book-pdf"],[data-action="download-press-pdf"],[data-action="print-book"]';
  assert.equal(await page.locator(technical).count(),0);assert.equal(await page.locator('.ls-print-entry button').count(),1);
  await click('print-service');assert.equal(await page.locator('.ls-print-level-option').count(),10);
  await page.locator('[data-level="1"]').click();
  const text=await page.locator('#ls-print-checklist').innerText();assert.match(text,/第1册 · 15个故事/);assert.match(text,/当前第1级采用选定的15个故事，合订1册/);
  assert.equal(await page.locator('.ls-print-volume').count(),1);assert.equal(await page.locator('.ls-print-volume li').count(),15);assert.equal(await page.locator('#ls-print-checklist .ls-primary').isDisabled(),true);
  assert.match(text,/尚未连接打印收件后台/);assert.equal(await page.locator(technical).count(),0);
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,'checklist-'+width+'.png'),fullPage:true});
  }
  for(let level=2;level<=10;level++){
   await page.locator('[data-level="'+level+'"]').click();assert.match(await page.locator('#ls-print-checklist').innerText(),/尚未开放打印/);
   assert.equal(await page.locator('#ls-print-checklist button').count(),0);
  }
  await click('home');await page.locator('.ls-book[data-id="intro-complete"]').click();assert.equal(await page.locator(technical).count(),0);
  await click('print-service');await page.locator('[data-level="1"]').click();await click('home');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: one customer print entry, exactly 10 level choices, versioned fifteen-story single-volume edition, 2–10 pending, no technical export options, disconnected confirmation disabled, 320/390/768 layout, no uploads.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
