'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../preview'),output=path.join(root,'qa/account');fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await playwright.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[],external=[];
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.hostname!=='reading.local'){external.push(url.hostname);return route.abort();}
      const file=url.pathname==='/'?path.join(root,'index.html'):path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const click=action=>page.locator('[data-action="'+action+'"]').click();
    const readRecords=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('little-story.preview-reading.v1')).records);
    await page.goto('http://reading.local/');await click('account');
    assert.match(await page.locator('.ls-account-reading').innerText(),/还没有阅读记录/);
    await page.locator('.ls-account-identity [data-action="account-login"]').click();await page.locator('#ls-account-consent').check();await click('account-demo-login');
    await page.locator('.ls-account-identity [data-action="home"]').click();
    await page.locator('.ls-book[data-id="intro"]').click();await click('start');
    await click('next');await click('next');
    assert.equal((await readRecords())[0].page,1);
    await page.reload();await page.locator('[data-action="account"]').click();
    assert.match(await page.locator('.ls-account-reading').innerText(),/读到第 2 \/ 6 页/);
    await page.screenshot({path:path.join(output,'reading-records-390.png'),fullPage:true});
    await click('account-continue-book');assert.equal(await page.locator('.ls-page-text').getAttribute('aria-label'),'第2页正文');
    await page.keyboard.press('ArrowRight');assert.equal((await readRecords())[0].page,2);
    await page.evaluate(()=>{window.__originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='little-story.preview-reading.v1')throw Error('quota');return window.__originalStorageSet.call(this,key,value);};});
    await click('next');assert.equal(await page.locator('.ls-page-text').getAttribute('aria-label'),'第4页正文');
    assert.match(await page.locator('#ls-reading-storage-note').innerText(),/暂未保存/);
    await page.evaluate(()=>{Storage.prototype.setItem=window.__originalStorageSet;});await click('next');assert.equal(await page.locator('#ls-reading-storage-note').count(),0);
    await click('next');await click('next');await page.locator('.ls-reader-end-stage').waitFor();await click('next');
    await page.getByRole('heading',{name:'我读完啦！'}).waitFor();assert.equal((await readRecords())[0].completed,true);
    await click('home');await click('account');assert.match(await page.locator('.ls-account-reading').innerText(),/已读完 1 本/);
    await click('account-continue-book');assert.equal(await page.locator('.ls-cover-progress').innerText(),'封面');await click('next');await click('next');
    await page.reload();await click('account');await click('account-continue-book');assert.equal(await page.locator('.ls-page-text').getAttribute('aria-label'),'第2页正文');
    await page.locator('.ls-reader-top [data-action="home"]').click();await click('account');await click('account-demo-logout');
    assert.match(await page.locator('.ls-account-reading').innerText(),/已读完 1 本/);
    for(const width of [320,768]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'reading-records-'+width+'.png'),fullPage:true});}
    await click('account-delete-child');await page.locator('#ls-account-danger-input').fill('删除');await click('account-confirm-danger');
    await page.getByRole('status').filter({hasText:'本浏览器的小主角和家人资料已清除'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('little-story.preview-reading.v1')),null);
    assert.match(await page.locator('.ls-account-reading').innerText(),/还没有阅读记录/);
    await page.reload();await click('account');await page.locator('.ls-account-reading').waitFor();assert.match(await page.locator('.ls-account-reading').innerText(),/读过 0 本/);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    // Ignore old/invalid book IDs and broken local records without blocking the account page.
    await page.evaluate(()=>localStorage.setItem('little-story.preview-reading.v1','{broken'));
    await page.reload();await click('account');await page.locator('.ls-account-reading').waitFor();assert.match(await page.locator('.ls-account-reading').innerText(),/暂时无法读取/);
    console.log('PASS: mobile reading history, refresh/resume, keyboard turns, completion/rereading, storage error recovery, logout preservation, deletion, corrupt records, 320/390/768px layouts, local-only requests.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
