'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {once}=require('node:events');
const {createApplication}=require('../server/app.cjs');
const {PLATFORM_POLICY_VERSION}=require('../server/platform-login.cjs');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const directory=path.resolve(__dirname,'../.local/platform-sdk-browser-'+Date.now()),errors=[];
  const app=createApplication({adminPassword:'sdk-browser-password',dataDir:directory,wxAppId:'wx-test-app',wxSecret:'test',douyinAppId:'tt-test-app',douyinSecret:'test',platformFetch:async url=>Response.json(url.startsWith('https://api.weixin.qq.com')?{openid:'wx-parent',session_key:'private'}:{err_no:0,data:{openid:'tt-parent',session_key:'private'}})});
  app.server.listen(20000+crypto.randomInt(40000),'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    for(const platform of ['wechat','douyin']){const response=await fetch(base+'/api/platform/'+platform+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:platform+'-code',consentVersion:PLATFORM_POLICY_VERSION})});assert.equal(response.status,200);}
    const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/admin');await page.locator('#password').fill('sdk-browser-password');await page.locator('#login-form button').click();await page.locator('#workspace').waitFor({state:'visible'});
    await page.locator('[data-tab="users"]').click();await page.locator('tbody').getByText('抖音登录',{exact:true}).waitFor();assert.match(await page.locator('tbody').innerText(),/微信登录/);
    assert.match(await page.locator('#connection').innerText(),/微信登录已配置.*抖音登录已配置/);
    await page.screenshot({path:path.join(directory,'platform-users.png'),fullPage:true});await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile source columns remain within scrolling table');
    assert.deepEqual(errors,[]);console.log('PASS: admin renders distinct WeChat/Douyin users and platform configuration; mobile layout remains usable.');
  }finally{await browser.close();await new Promise(resolve=>app.server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
