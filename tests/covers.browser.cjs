'use strict';
// Real painted assets, local saved-photo geometry, and the complete cover flow.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const { getBook } = require('../miniprogram/lib/stories');
const { defaultMembers, normalizeMembers, participants } = require('../miniprogram/lib/family');
const root = path.resolve(__dirname, '..'), preview = path.join(root, 'preview');
const output = path.join(preview, 'qa', 'covers');
const html = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
const familyManifest = JSON.parse(fs.readFileSync(path.join(preview, 'art/family/manifest.json'), 'utf8'));
const flowerManifest = JSON.parse(fs.readFileSync(path.join(preview, 'art/flower/manifest.json'), 'utf8'));
// Fictional, previously generated head. No user files or uploads are needed.
const photo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'art-samples/my-flower-production/search-head.png')).toString('base64');
const metrics = flowerManifest.scenes.search.headMetrics;
const profile = { name: '小小石头开心宝贝', age: 5, className: '大班', avatarPath: '' };
const csp = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const compact = text => text.replace(/\s/g, '');
function membersFor(count) {
  const members = defaultMembers().map((member, index) => ({ ...member, included: index < count }));
  while (members.length < count) members.push({ id: 'member-cover-' + members.length, role: members.length % 2 ? 'olderSister' : 'youngerBrother', included: true });
  return normalizeMembers(members);
}
function recordFor(count) {
  const members = membersFor(count);
  const actor = { data: photo, kind: 'cutout', layout: { scale: 1, x: 0, y: 0 }, metrics };
  return { version: 4, profile, members, avatars: { child: actor, ...(count > 5 ? { olderBrother: actor } : {}) } };
}
function intersects(a, b) { return a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5; }
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const results = [], errors = [], requests = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await context.route('http://covers.local/**', route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      assert.equal(request.method(), 'GET', 'saved head remains entirely in this browser');
      requests.push(pathname);
      if (pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: html });
      const file = path.resolve(preview, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(preview + path.sep) || !/^\/art\/(intro|family|flower|sequence)\//.test(pathname) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : 'image/webp', body: fs.readFileSync(file) });
    });
    await context.addInitScript(({ photo, photoMetrics, headSpecs, flowerScenes }) => {
      const clear = CanvasRenderingContext2D.prototype.clearRect, draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) { this.canvas.__coverPaint = []; return clear.apply(this, args); };
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.closest('.ls-book-cover')) {
          const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
          const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 8 ? args : [0, 0, iw, ih, args[0], args[1], args.length === 4 ? args[2] : iw, args.length === 4 ? args[3] : ih];
          const src = (window.LittlePhotoTone?.originalOf(image)||image).src || '', t = this.getTransform();
          let head = src === photo ? photoMetrics : null;
          if (src.endsWith('/family/child-head.webp')) head = headSpecs.child.metrics;
          if (src.endsWith('/family/heads.webp')) head = Object.values(headSpecs).find(spec => spec.sourceRect && spec.sourceRect.x === sx && spec.sourceRect.y === sy)?.metrics;
          for (const [name, scene] of Object.entries(flowerScenes)) if (src.endsWith('/flower/' + name + '-head.webp')) head = scene.headMetrics;
          const map = bounds => {
            // Atlas metadata is local to the source rectangle; photo metadata
            // is local to the complete source image. Both share these axes.
            const corners = [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y]) => new DOMPoint(dx+x*dw/sw,dy+y*dh/sh).matrixTransform(t));
            return { left:Math.min(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),right:Math.max(...corners.map(p=>p.x)),bottom:Math.max(...corners.map(p=>p.y)) };
          };
          (this.canvas.__coverPaint ||= []).push({ src: src === photo ? 'saved-photo' : src, isotropic: Math.abs(sw/sh-dw/dh)<1e-6, head: head && map(head.bounds), face: head && map(head.faceBounds || head.bounds) });
        }
        return draw.call(this, image, ...args);
      };
    }, { photo, photoMetrics: metrics, headSpecs: familyManifest.heads, flowerScenes: flowerManifest.scenes });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const action = name => page.locator('[data-action="' + name + '"]');
    const cover = (id, variant) => page.locator('.ls-book-cover[data-cover-book="' + id + '"][data-cover-variant="' + variant + '"]');
    const homeReady = () => page.getByRole('heading', { name: '你好，' + profile.name, exact: true }).waitFor();
    async function install(count) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(record => new Promise((resolve, reject) => {
        const request = indexedDB.open('little-story-local', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db=request.result,tx=db.transaction('child','readwrite');tx.objectStore('child').put(record,'main');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error); };
      }), recordFor(count));
      await page.reload(); await homeReady();
    }
    async function inspectCover(id, variant, count, screenshot) {
      const target = cover(id, variant); await target.waitFor();
      await page.waitForFunction(({ id, variant }) => document.querySelector('.ls-book-cover[data-cover-book="'+id+'"][data-cover-variant="'+variant+'"] canvas')?.dataset.artState === 'ready', { id, variant });
      const result = await target.evaluate(element => {
        const rect = item => { const r=item.getBoundingClientRect();return { left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
        const title=element.querySelector('.ls-cover-title'),picture=element.querySelector('.ls-cover-picture'),canvas=picture.querySelector('canvas'),copy=element.querySelector('.ls-cover-copy');
        const range=document.createRange();range.selectNodeContents(title);
        const textLines=[];
        const walker=document.createTreeWalker(title,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
          if(!walker.currentNode.textContent.trim())continue;
          const textRange=document.createRange();textRange.selectNodeContents(walker.currentNode);
          for(const r of textRange.getClientRects()){
            let line=textLines.find(line=>Math.abs(line.top-r.top)<2);
            if(!line){line={left:r.left,right:r.right,top:r.top,bottom:r.bottom};textLines.push(line);}
            else{line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.right);line.bottom=Math.max(line.bottom,r.bottom);}
          }
        }
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
        const stride=Math.max(4,Math.floor(pixels.length/4000/4)*4);
        for(let i=0;i<pixels.length;i+=stride)colors.add([pixels[i]>>4,pixels[i+1]>>4,pixels[i+2]>>4].join(','));
        return { titleText:title.textContent,title:rect(title),textLines,copy:rect(copy),picture:rect(picture),canvas:rect(canvas),outer:rect(element),glyphs:Array.from(range.getClientRects(),r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})),titleOverflow:title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1,paint:canvas.__coverPaint||[],width:canvas.width,height:canvas.height,colors:colors.size,cover:canvas.dataset.cover,viewport:{width:innerWidth,height:innerHeight},documentOverflow:document.documentElement.scrollWidth>innerWidth+1 };
      });
      const label = `${count} people ${id} ${variant}`;
      if(screenshot)await page.screenshot({path:path.join(output,screenshot),fullPage:variant!=='reader'});
      assert.equal(compact(result.titleText),compact(getBook(id,profile,membersFor(count)).title),label+' title is complete');
      assert.equal(result.cover,'1',label+' uses cover composition');
      assert.ok(!result.titleOverflow&&!result.documentOverflow,label+' long title does not overflow '+JSON.stringify({titleOverflow:result.titleOverflow,documentOverflow:result.documentOverflow,title:result.title}));
      assert.ok(!intersects(result.title,result.picture),label+' title and picture are distinct regions');
      assert.ok(result.title.bottom<=result.picture.top+1&&result.copy.bottom<=result.picture.top+1,label+' title is above the painting');
      const pictureCenter=(result.picture.left+result.picture.right)/2,centerTolerance=Math.max(2,result.picture.width*.01);
      assert.ok(Math.abs((result.title.left+result.title.right)/2-pictureCenter)<=centerTolerance,label+' title block is centered above the painting');
      assert.ok(result.textLines.length>0,label+' has rendered title text');
      for(const line of result.textLines)assert.ok(Math.abs((line.left+line.right)/2-pictureCenter)<=centerTolerance,label+' each title line is centered, including a wrapped long name');
      assert.ok(result.picture.height>=result.outer.height*.5,label+' illustration retains at least half the cover height');
      for(const glyph of result.glyphs)assert.ok(glyph.left>=result.outer.left-1&&glyph.right<=result.outer.right+1&&glyph.top>=result.outer.top-1&&glyph.bottom<=result.outer.bottom+1,label+' every title glyph stays within cover');
      assert.ok(result.colors>30&&result.paint.some(item=>/\/art\//.test(item.src)),label+' paints actual detailed assets, not only a title or blank canvas');
      const heads=result.paint.filter(item=>item.head);
      assert.equal(heads.length,id==='family'?count:1,label+' draws the expected head count');
      assert.ok(heads.some(item=>item.src==='saved-photo'),label+' saved main head is visible');
      for(const item of result.paint)assert.ok(item.isotropic,label+' images are not stretched');
      for(const item of heads){
        const h=item.head;
        assert.ok(h.left>=-1&&h.top>=-1&&h.right<=result.width+1&&h.bottom<=result.height+1,label+' complete hairstyle fits canvas');
        const r={left:result.canvas.left+h.left*result.canvas.width/result.width,right:result.canvas.left+h.right*result.canvas.width/result.width,top:result.canvas.top+h.top*result.canvas.height/result.height,bottom:result.canvas.top+h.bottom*result.canvas.height/result.height};
        assert.ok(r.left>=result.picture.left-1&&r.right<=result.picture.right+1&&r.top>=result.picture.top-1&&r.bottom<=result.picture.bottom+1,label+' complete hairstyle fits the visible picture');
        assert.ok(!intersects(r,result.title),label+' title never covers a head');
      }
      for(let i=0;i<heads.length;i++)for(let j=i+1;j<heads.length;j++)assert.ok(!intersects(heads[i].face,heads[j].face),label+' faces do not overlap');
      if(variant==='reader'){
        assert.ok(result.outer.left>=-1&&result.outer.right<=result.viewport.width+1&&result.outer.top>=-1&&result.outer.bottom<=result.viewport.height+1,label+' fits landscape viewport');
        assert.equal(await page.locator('.ls-page-text').count(),0,'cover has no first-page body copy');
        assert.equal(await page.getByRole('progressbar').count(),0,'cover is not a numbered story page');
        assert.match(await page.locator('.ls-page-progress').innerText(),/封面/);
        assert.equal(await action('previous').isDisabled(),true);
        assert.match(await action('next').innerText(),/翻开故事/);
        const next=await action('next').boundingBox();assert.ok(next.x>=0&&next.y>=0&&next.x+next.width<=result.viewport.width+1&&next.y+next.height<=result.viewport.height+1,label+' open-story button fits the viewport');
      }
      results.push({id,variant,count,title:result.titleText,titleAboveArt:true,titleCentered:true,artHeightShare:result.picture.height/result.outer.height,heads:heads.length,colors:result.colors,width:result.viewport.width});
    }
    async function expectPage(id, count, index) {
      const expected=getBook(id,profile,membersFor(count)).pages;
      await page.locator('.ls-page-text').waitFor();
      assert.equal(await page.locator('.ls-reader-cover-stage').count(),0);
      assert.equal(compact(await page.locator('.ls-page-text').innerText()),compact(expected[index].join('')));
      assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),String(index+1));
      assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuemax'),String(expected.length));
      if(index===0){assert.equal(await action('previous').isEnabled(),true);assert.match(await action('previous').innerText(),/封面/);}
    }
    async function swipe(direction) {
      const r=await page.locator('#ls-swipe-area').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;
      await page.mouse.move(x-direction*80,y);await page.mouse.down();await page.mouse.move(x+direction*80,y,{steps:8});await page.mouse.up();
    }
    async function start(id) {
      await page.locator('[data-action="book"][data-id="'+id+'"]').click();await action('start').click();
      if(await action('landscape').count())await action('landscape').click();
      await page.locator('.ls-reader').waitFor();
    }
    await page.goto('http://covers.local/');await page.getByRole('heading',{name:'你好，小石头',exact:true}).waitFor();
    for(const count of [3,1,6,12]){
      await install(count);
      const ids=count===3?['intro','flower','family']:['family'];
      for(const id of ids)await inspectCover(id,'shelf',count,null);
      await page.screenshot({path:path.join(output,`${count}-people-shelf.png`),fullPage:true});
      for(const id of ids){
        await page.locator('[data-action="book"][data-id="'+id+'"]').click();
        await inspectCover(id,'detail',count,`${count}-people-${id}-detail.png`);
        assert.match(await page.locator('.ls-tags').innerText(),new RegExp(getBook(id,profile,membersFor(count)).pages.length+' 页'));
        await action('home').click();
        for(const size of [{width:568,height:320},{width:844,height:390}]){
          await page.setViewportSize(size);await start(id);
          await inspectCover(id,'reader',count,`${count}-people-${id}-${size.width}-cover.png`);
          // Clicking, keyboard arrows, and both swipe directions share exactly
          // the same cover <-> first-body-page boundary.
          await action('next').click();await expectPage(id,count,0);
          await action('previous').click();await cover(id,'reader').waitFor();
          await page.keyboard.press('ArrowLeft');await cover(id,'reader').waitFor();
          await page.keyboard.press('ArrowRight');await expectPage(id,count,0);
          await page.keyboard.press('ArrowLeft');await cover(id,'reader').waitFor();
          await swipe(-1);await expectPage(id,count,0);
          await swipe(1);await cover(id,'reader').waitFor();
          await action('next').click();await expectPage(id,count,0);
          await action('next').click();await expectPage(id,count,1);
          await action('home').click();
          await page.locator('[data-action="book"][data-id="'+id+'"]').click();
          assert.match(await action('start').innerText(),/继续阅读/);
          await action('start').click();
          if(await action('landscape').count())await action('landscape').click();
          await expectPage(id,count,1);
          const pages=getBook(id,profile,membersFor(count)).pages;
          if(id!=='family')assert.equal(pages.length,6,'cover never increases the six body pages');
          for(let index=1;index<pages.length;index++){
            await expectPage(id,count,index);await action('next').click();
          }
          await page.locator('.ls-reader-end-stage').waitFor();await action('next').click();
          await page.getByRole('heading',{name:'我读完啦！',exact:true}).waitFor();
          await action('reread').click();await inspectCover(id,'reader',count,null);
          await action('home').click();
        }
        await page.setViewportSize({width:390,height:844});
      }
    }
    assert.deepEqual(errors,[]);
    assert.ok(requests.includes('/art/intro/greeting.webp')&&requests.includes('/art/flower/care.webp')&&requests.includes('/art/family/courtyard.webp'),'all three books use real paintings');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({covers:results,errors,photoUploaded:false,familyCounts:[1,3,6,12],readerSizes:[568,844]},null,2));
    await context.close();
    console.log('PASS: '+results.length+' real painted shelf/detail/reader covers with titles centered above the art, complete eight-character name and hairstyles, 1/3/6/12-person families, 568/844px layouts, clicks/swipes/keyboard, reread covers, restored body progress and unchanged body page counts.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
