'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { getBook } = require('../miniprogram/lib/stories');
const { defaultMembers } = require('../miniprogram/lib/family');
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const html = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
const output = path.join(preview, 'qa', 'intro-ui');
fs.mkdirSync(output, { recursive: true });
// Fictional, previously generated transparent head; no user photos are read.
const photo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'art-samples/my-flower-production/search-head.png')).toString('base64');
const metrics = JSON.parse(fs.readFileSync(path.join(preview, 'art/flower/manifest.json'), 'utf8')).scenes.search.headMetrics;
function routeAsset(route) {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  const file = path.resolve(preview, '.' + pathname);
  if (!file.startsWith(preview + path.sep) || !/^\/art\/(intro|family|flower|sequence)\//.test(pathname) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : 'image/webp', body: fs.readFileSync(file) });
}
async function enterStoryBody(page) {
  await page.locator('.ls-reader').waitFor();
  const cover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
  if (await cover.count()) {
    await page.locator('[data-action="next"]').click();
    await cover.waitFor({ state: 'detached' });
  }
}
async function main() {
  const browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const requests = [];
    await context.route('http://intro.local/**', route => { requests.push(new URL(route.request().url()).pathname); return routeAsset(route); });
    await context.addInitScript(({ photo, bounds }) => {
      window.__headDraws = [];
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image.src === photo && this.canvas.dataset.art === 'intro') {
          const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
          const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8 ? args : [0, 0, iw, ih, args[0], args[1], args.length === 4 ? args[2] : iw, args.length === 4 ? args[3] : ih];
          const t = this.getTransform(), rect = this.canvas.getBoundingClientRect();
          const corners = [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y]) => {
            const p = new DOMPoint(dx + (x-sx)*dw/sw, dy + (y-sy)*dh/sh).matrixTransform(t);
            return { x: rect.left + p.x * rect.width / this.canvas.width, y: rect.top + p.y * rect.height / this.canvas.height };
          });
          window.__headDraws.push({ hero: !!this.canvas.closest('.ls-feature'), reader: !!this.canvas.closest('.ls-reader') && !this.canvas.closest('.ls-reader-cover-stage'), page: Number(this.canvas.dataset.page),
            left: Math.min(...corners.map(p=>p.x)), right: Math.max(...corners.map(p=>p.x)), top: Math.min(...corners.map(p=>p.y)), bottom: Math.max(...corners.map(p=>p.y)) });
        }
        return original.call(this, image, ...args);
      };
    }, { photo, bounds: metrics.bounds });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const action = name => page.locator('[data-action="' + name + '"]');
    const home = name => page.getByRole('heading', { name: '你好，' + name, exact: true }).waitFor();
    const ready = () => page.waitForFunction(() => document.querySelector('.ls-reader-art canvas')?.dataset.artState === 'ready');
    const writeProfile = profile => page.evaluate(({ profile, photo, metrics, members }) => new Promise((resolve, reject) => {
      const req = indexedDB.open('little-story-local', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const db=req.result, tx=db.transaction('child','readwrite'); tx.objectStore('child').put({ version:4,profile,members,avatars:{child:{data:photo,kind:'cutout',layout:{scale:1,x:0,y:0},metrics}} },'main'); tx.oncomplete=()=>{db.close();resolve();}; tx.onabort=()=>reject(tx.error); };
    }), { profile, photo, metrics, members: defaultMembers() });
    await page.goto('http://intro.local/'); await home('小石头');
    const profiles = [{ name: '小小石头开心宝贝', age: 3, className: '小班', avatarPath: '' }, { name: '乐', age: 6, className: '大班', avatarPath: '' }];
    for (const profile of profiles) {
      await writeProfile(profile); await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await home(profile.name);
      await page.waitForFunction(() => document.querySelector('.ls-feature canvas')?.dataset.artState === 'ready');
      const hero = await page.evaluate(() => {
        const title=document.querySelector('.ls-feature-caption').getBoundingClientRect(), art=document.querySelector('.ls-feature canvas').getBoundingClientRect();
        const head=window.__headDraws.filter(item=>item.hero).at(-1);
        return { title:{left:title.left,right:title.right,top:title.top,bottom:title.bottom}, art:{left:art.left,right:art.right,top:art.top,bottom:art.bottom},head,overflow:document.documentElement.scrollWidth>innerWidth };
      });
      assert.ok(hero.head, 'the actual saved photo is drawn in the new hero');
      assert.ok(hero.head.left >= hero.title.right + 2, 'hero title never covers the real hairstyle');
      assert.ok(hero.head.right <= hero.art.right + 1 && hero.head.top >= hero.art.top - 1 && hero.head.bottom <= hero.art.bottom + 1, 'hero preserves the whole photo');
      assert.ok(hero.title.bottom <= hero.art.bottom && !hero.overflow, 'eight-character home name fits');
      await page.screenshot({ path: path.join(output, profile.age + '-year-home.png'), fullPage: true });
      const expected = getBook('intro', profile, defaultMembers()).pages;
      for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
        await page.setViewportSize(size); await action('start-intro').click();
        if (await action('landscape').count()) await action('landscape').click();
        await enterStoryBody(page);
        for (let i=0;i<6;i++) {
          await ready();
          assert.equal((await page.locator('.ls-page-text').innerText()).replace(/\s/g,''),expected[i].join('').replace(/\s/g,''));
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),String(i+1));
          const fit=await page.locator('.ls-page-text').evaluate(text=>{const next=document.querySelector('[data-action="next"]').getBoundingClientRect();return {font:parseFloat(getComputedStyle(text).fontSize),width:text.scrollWidth<=text.clientWidth+1,height:text.scrollHeight<=text.clientHeight+1,next:next.bottom<=innerHeight,viewport:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1};});
          assert.ok(fit.font>=22&&fit.width&&fit.height&&fit.next&&fit.viewport, `${size.width}px page ${i+1}: text and controls fit`);
          assert.ok(await page.evaluate(index=>window.__headDraws.some(draw=>draw.reader&&draw.page===index),i),'saved original photo remains in page '+(i+1));
          if(size.width===568)await page.screenshot({path:path.join(output,profile.age+'-year-page-'+(i+1)+'.png')});
          await action('next').click();
        }
        await page.getByRole('heading',{name:'我读完啦！'}).waitFor();await action('home').click();
      }
    }
    for(const filename of ['greeting.webp','play.webp','school.webp'])assert.ok(requests.filter(value=>value.endsWith('/intro/'+filename)).length<=3, 'scene images cached across flips within each visit');
    assert.deepEqual(errors,[]);await context.close();

    // One scene failing retains the old complete illustration and exposes retry.
    const failedContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    let failGreeting=true,failedRequests=0;
    await failedContext.route('http://intro.local/**',route=>{
      if(new URL(route.request().url()).pathname==='/art/intro/greeting.webp'&&failGreeting){failedRequests++;return route.fulfill({status:503,body:''});}
      return routeAsset(route);
    });
    const failed=await failedContext.newPage(),failedErrors=[];failed.on('pageerror',error=>failedErrors.push(error.message));
    await failed.goto('http://intro.local/');
    const notice=failed.locator('[data-art-book="intro"]');
    await notice.waitFor({state:'visible'});
    assert.ok(failedRequests>=1);assert.equal(await failed.locator('.ls-feature canvas').getAttribute('data-art-state'),'error');
    await failed.locator('[data-action="start-intro"]').click();
    await enterStoryBody(failed);
    await failed.locator('.ls-reader [data-art-book="intro"]').waitFor({state:'visible'});
    assert.match(await failed.locator('.ls-page-text').innerText(),/小石头/);
    await failed.screenshot({path:path.join(output,'intro-asset-fallback.png')});
    failGreeting=false;await failed.locator('[data-action="retry-art"][data-book="intro"]').click();
    await failed.waitForFunction(()=>document.querySelector('.ls-reader-art canvas')?.dataset.artState==='ready');
    assert.equal(await failed.locator('.ls-reader [data-art-book="intro"]').isVisible(),false);
    assert.deepEqual(failedErrors,[]);await failedContext.close();

    // A late school scene must repaint only current DOM after changing books.
    const staleContext=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
    let releaseSchool,schoolRequestedResolve;
    const schoolRequested=new Promise(resolve=>{schoolRequestedResolve=resolve;});
    await staleContext.route('http://intro.local/**',async route=>{
      if(new URL(route.request().url()).pathname==='/art/intro/school.webp'){schoolRequestedResolve();await new Promise(resolve=>{releaseSchool=resolve;});}
      return routeAsset(route);
    });
    const stale=await staleContext.newPage(),staleErrors=[];stale.on('pageerror',error=>staleErrors.push(error.message));
    await stale.goto('http://intro.local/');await stale.getByRole('heading',{name:'你好，小石头',exact:true}).waitFor();
    await stale.locator('[data-action="start-intro"]').click();
    await enterStoryBody(stale);
    for(let i=0;i<4;i++)await stale.locator('[data-action="next"]').click();
    await schoolRequested;await stale.locator('[data-action="home"]').click();
    await stale.locator('[data-action="book"][data-id="flower"]').click();await stale.locator('[data-action="start"]').click();
    await enterStoryBody(stale);
    await stale.waitForFunction(()=>document.querySelector('.ls-reader-art canvas')?.dataset.artState==='ready');
    releaseSchool();await stale.waitForFunction(()=>window.LittleIntroArtLoader.status(4)==='ready');
    assert.equal(await stale.locator('.ls-reader-art canvas').getAttribute('data-art'),'flower');
    assert.match(await stale.locator('.ls-page-text').innerText(),/我的小花/);
    assert.deepEqual(staleErrors,[]);await staleContext.close();
    console.log('PASS: intro real photo and 1/8-character names, ages 3/6 and classes, clear hero text/photo separation, six illustrated pages at 568/844px, original photo reuse, scene caching, independent asset fallback/retry and stale navigation.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
