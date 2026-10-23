'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../../sites/manuscript-review/dist');
const server=http.createServer((req,res)=>{let file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':'text/html; charset=utf-8'});res.end(fs.readFileSync(file));});
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(4195,'127.0.0.1',resolve));console.log('Local preview http://127.0.0.1:4195/illustration-samples/rain-v1/');
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const checks=[];
  for(const width of [320,390,1200]){
    const page=await browser.newPage({viewport:{width,height:844}});
    await page.goto('http://127.0.0.1:4195/illustration-samples/rain-v1/');
    assert.equal(await page.locator('figure').count(),3);
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(im=>{im.loading='eager';return im.decode();})));
    const sizes=await page.locator('img').evaluateAll(imgs=>imgs.map(im=>({width:im.naturalWidth,height:im.naturalHeight})));
    assert.ok(sizes.every(s=>s.width===1058&&s.height===1487));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(await page.locator('figcaption p').allTextContents(),['黑云来了，','下雨了。','小伞开了。','我在伞下。','我和小花，','都在伞下。']);
    if(width===390){await page.screenshot({path:path.join(__dirname,'mobile-top.png')});await page.locator('figure').nth(2).screenshot({path:path.join(__dirname,'mobile-share.png')});}
    await page.locator('a').first().click();await page.waitForURL('http://127.0.0.1:4195/');assert.equal(await page.locator('#story-cards article').count(),30);assert.equal(await page.locator('a[href="illustration-samples/rain-v1/"]').count(),1);
    checks.push({width,loadedIllustrations:3,noHorizontalOverflow:true,backToManuscript:true});await page.close();
  }
  fs.writeFileSync(path.join(__dirname,'mobile-validation.json'),JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));
}finally{if(browser)await browser.close();if(process.argv.includes('--keep-preview'))process.once('SIGINT',()=>server.close(()=>process.exit(0)));else server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
