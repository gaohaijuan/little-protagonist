'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..'), preview = path.join(root, 'preview');
const output = path.join(preview, 'qa/art-transitions');
fs.mkdirSync(output, { recursive: true });
const policy = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8').match(/'Content-Security-Policy':\s*"([^"]+)"/);
assert.ok(policy, 'use the actual local preview CSP');
const originalHtml = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
const marker = '  const { draw } = shared.art;';
assert.equal(originalHtml.split(marker).length, 2, 'observe the bundled original draw functions before app destructuring');
// Observation only: every original renderer, canvas operation and real asset
// remains in use. No production file or image is modified by this test.
const audit = `
  window.__artAudit = { paints: [], states: [], active: null, nextId: 0 };
  const auditIds = new WeakMap();
  const auditId = canvas => { if (!auditIds.has(canvas)) auditIds.set(canvas, ++window.__artAudit.nextId); return auditIds.get(canvas); };
  const auditLoader = book => ({intro:window.LittleIntroArtLoader,flower:window.LittleArtLoader,family:window.LittleFamilyArtLoader}[book]);
  for (const [name, kind] of [['art','legacy'],['introArt','illustrated'],['flowerArt','illustrated'],['familyArt','illustrated']]) {
    const original = shared[name].draw;
    shared[name].draw = function(canvas, options) {
      const event = { id:auditId(canvas), kind, book:options.book, page:options.page, cover:!!options.cover, framing:options.framing || '', reader:!!canvas.closest('.ls-reader'), connected:canvas.isConnected, status:auditLoader(options.book)?.status(options.page,options), sources:[] };
      window.__artAudit.paints.push(event); const previous = window.__artAudit.active; window.__artAudit.active=event;
      try { event.result=original.apply(this,arguments); return event.result; } finally { window.__artAudit.active=previous; }
    };
  }
  const originalImageDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(image) {
    if (window.__artAudit.active) window.__artAudit.active.sources.push({url:image.currentSrc || image.src || '', width:image.naturalWidth || image.width, height:image.naturalHeight || image.height});
    return originalImageDraw.apply(this,arguments);
  };
  new MutationObserver(mutations => {
    for(const m of mutations) if(m.target.matches('canvas[data-art]')) window.__artAudit.states.push({id:auditId(m.target),book:m.target.dataset.art,page:Number(m.target.dataset.page),reader:!!m.target.closest('.ls-reader'),attribute:m.attributeName,old:m.oldValue,value:m.target.getAttribute(m.attributeName)});
  }).observe(document.getElementById('little-story-preview'),{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-art-state','aria-busy']});
`;
const html = originalHtml.replace(marker, audit + '\n' + marker);
const loaders = { intro: 'LittleIntroArtLoader', flower: 'LittleArtLoader', family: 'LittleFamilyArtLoader' };
const readerCanvas = '.ls-reader-art canvas';
const action = (page, name) => page.locator('[data-action="' + name + '"]');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function until(condition, label) {
  for (let attempt = 0; attempt < 300; attempt++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw Error('Timed out: ' + label);
}
async function fixture(browser, initialHolds = [], initialFailures = []) {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const requests = [], errors = [], holds = new Map(), failures = new Set(initialFailures), delivered = new Set();
  const hold = pathname => { let release; const promise = new Promise(resolve => { release = resolve; }); holds.set(pathname, { promise, release, hits: 0 }); };
  initialHolds.forEach(hold);
  await context.route('http://transitions.local/**', async route => {
    const pathname = new URL(route.request().url()).pathname; requests.push(pathname);
    assert.equal(route.request().method(), 'GET', 'illustration loading never sends photographs');
    if (pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': policy[1] }, body: html });
    if (failures.has(pathname)) return route.fulfill({ status: 503, body: '' });
    const gate = holds.get(pathname);
    if (gate) { gate.hits++; await gate.promise; }
    const file = path.resolve(preview, '.' + pathname);
    if (!file.startsWith(preview + path.sep) || !/^\/art\/(intro|flower|family|sequence)\//.test(pathname) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    await route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : 'image/webp', body: fs.readFileSync(file) });
    delivered.add(pathname);
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://transitions.local/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '你好，小石头', exact: true }).waitFor();
  return { page, requests, errors, holds, failures, delivered, hold,
    release(pathname) { holds.get(pathname)?.release(); holds.delete(pathname); },
    async close() { for (const gate of holds.values()) gate.release(); holds.clear(); await context.close(); }
  };
}
async function ready(page, selector = readerCanvas) { await page.locator(selector + '[data-art-state="ready"]').waitFor(); await frames(page); }
async function openBody(page, book) {
  await page.locator('[data-action="book"][data-id="' + book + '"]').click(); await action(page, 'start').click();
  if (await action(page, 'landscape').count()) await action(page, 'landscape').click();
  if (await page.locator('.ls-reader-cover-stage').count()) await action(page, 'next').click();
  await page.locator(readerCanvas).waitFor();
}
async function noPrematureArtwork(page) {
  const failures = await page.evaluate(() => window.__artAudit.paints.filter(paint => paint.framing !== 'avatar' && ((paint.kind === 'legacy' && paint.status !== 'error') || (paint.kind === 'illustrated' && paint.status !== 'ready'))));
  assert.deepEqual(failures, [], 'only actual loading errors may show the complete old illustration; in-flight scenes never do');
}
async function mark(page) { return page.evaluate(() => ({ paints: window.__artAudit.paints.length, states: window.__artAudit.states.length })); }
async function assertCachedFlip(page, direction, index, book) {
  const before = await mark(page); await action(page, direction).click(); await ready(page);
  assert.equal(await page.locator(readerCanvas).getAttribute('data-page'), String(index));
  const changes = await page.evaluate(({ before, book }) => window.__artAudit.states.slice(before.states).filter(s => s.reader && s.book === book && (['loading','idle'].includes(s.value) || ['loading','idle'].includes(s.old) || s.attribute === 'aria-busy' && s.value === 'true')), { before, book });
  assert.deepEqual(changes, [], 'a cached page never flashes the loading placeholder');
}
async function coldLayersAndCache(browser) {
  const paths = ['/art/family/child-head.webp', '/art/family/heads.webp', '/art/flower/care-head.webp'];
  const f = await fixture(browser, paths); const { page } = f;
  try {
    await until(() => paths.every(file => f.holds.get(file)?.hits), 'all three head layers are pending');
    await until(() => ['/art/intro/greeting.webp','/art/flower/care.webp','/art/family/courtyard.webp','/art/family/bodies.webp'].every(file => f.delivered.has(file)), 'real backgrounds and bodies have arrived');
    await page.waitForFunction(() => [...document.querySelectorAll('.ls-book canvas:is([data-art="intro"],[data-art="flower"],[data-art="family"]),.ls-feature canvas')].every(c => c.dataset.artState === 'loading' && c.getAttribute('aria-busy') === 'true'));
    await noPrematureArtwork(page);
    assert.equal(await page.evaluate(() => window.__artAudit.paints.filter(p => p.framing !== 'avatar').length), 0, 'neither vectors nor partial raster layers are painted before the heads arrive');
    await page.evaluate(() => { window.__waitingPixels = [...document.querySelectorAll('.ls-book canvas:is([data-art="intro"],[data-art="flower"],[data-art="family"]),.ls-feature canvas')].map(c => c.toDataURL()); });
    await frames(page); await frames(page);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ls-book canvas:is([data-art="intro"],[data-art="flower"],[data-art="family"]),.ls-feature canvas')].every((c, i) => c.toDataURL() === window.__waitingPixels[i])), true, 'waiting illustration is visually stable');
    await page.screenshot({ path: path.join(output, 'cold-loading.png'), fullPage: true });
    f.release('/art/flower/care-head.webp'); await ready(page, '.ls-book canvas[data-art="flower"]');
    assert.equal(await page.locator('.ls-book canvas[data-art="intro"]').getAttribute('data-art-state'), 'loading');
    f.release('/art/family/child-head.webp'); await ready(page, '.ls-feature canvas');
    assert.equal(await page.locator('.ls-book canvas[data-art="family"]').getAttribute('data-art-state'), 'loading');
    f.release('/art/family/heads.webp'); await ready(page, '.ls-book canvas[data-art="family"]');
    const firstPaints = await page.evaluate(() => ['intro','flower','family'].map(book => window.__artAudit.paints.find(p => p.kind === 'illustrated' && p.book === book)));
    for (const paint of firstPaints) {
      assert.ok(paint && paint.result === true && paint.sources.length >= 2, 'first illustrated paint includes complete real layers');
      assert.ok(paint.sources.every(source => source.width > 0 && source.height > 0));
      assert.ok(paint.sources.some(source => /(?:head|heads)\.webp(?:$|\?)/.test(source.url)), 'first paint includes the original head asset');
    }
    await noPrematureArtwork(page);
    for (const book of ['intro','flower','family']) {
      await openBody(page, book); await ready(page);
      const total = Number(await page.getByRole('progressbar').getAttribute('aria-valuemax'));
      for (let index = 1; index < total; index++) { await action(page, 'next').click(); await ready(page); }
      for (let index = total - 2; index >= 0; index--) await assertCachedFlip(page, 'previous', index, book);
      for (let index = 1; index < total; index++) await assertCachedFlip(page, 'next', index, book);
      await action(page, 'home').click();
    }
    await noPrematureArtwork(page); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
}
async function staleSameBook(browser, book, heldFile, waitingIndex, targetIndex) {
  const f = await fixture(browser, [heldFile]), { page } = f;
  try {
    await openBody(page, book); await ready(page);
    for (let index = 0; index < waitingIndex; index++) await action(page, 'next').click();
    await until(() => f.holds.get(heldFile)?.hits, book + ' delayed layer requested');
    await page.locator(readerCanvas + '[data-art-state="loading"]').waitFor();
    await noPrematureArtwork(page);
    for (let index = waitingIndex; index < targetIndex; index++) await action(page, 'next').click();
    await ready(page);
    await page.evaluate(() => { window.__currentArt = document.querySelector('.ls-reader-art canvas'); window.__currentPixels = window.__currentArt.toDataURL(); });
    const before = await mark(page); f.release(heldFile);
    await page.waitForFunction(({ name, waitingIndex }) => window[name].status(waitingIndex) === 'ready', { name: loaders[book], waitingIndex }); await frames(page);
    assert.equal(await page.evaluate(() => document.querySelector('.ls-reader-art canvas') === window.__currentArt && window.__currentArt.toDataURL() === window.__currentPixels), true, 'late page completion never replaces or repaints a different scene into the current canvas');
    assert.equal(await page.locator(readerCanvas).getAttribute('data-page'), String(targetIndex));
    const late = await page.evaluate(before => window.__artAudit.paints.slice(before.paints), before);
    assert.ok(late.every(p => p.connected && (!p.reader || p.book === book && p.page === targetIndex)), 'late loads never draw detached canvases or an obsolete story page');
    await noPrematureArtwork(page); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
}
async function pendingPrefetchBecomesVisible(browser, book, heldFile, waitingIndex) {
  const f = await fixture(browser, [heldFile]), { page } = f;
  try {
    await openBody(page, book); await ready(page);
    for (let index = 1; index < waitingIndex; index++) { await action(page, 'next').click(); await ready(page); }
    await until(() => f.holds.get(heldFile)?.hits, 'next scene is being prefetched before its page opens');
    await page.waitForFunction(({ name, waitingIndex }) => window[name].status(waitingIndex) === 'loading', { name: loaders[book], waitingIndex });
    await action(page, 'next').click();
    await page.locator(readerCanvas + '[data-art-state="loading"]').waitFor();
    assert.equal(await page.locator(readerCanvas).getAttribute('data-page'), String(waitingIndex));
    await noPrematureArtwork(page);
    f.release(heldFile); await ready(page);
    assert.equal(await page.locator(readerCanvas).getAttribute('data-page'), String(waitingIndex), 'the newly visible canvas subscribes to an already pending prefetch and replaces its placeholder');
    assert.equal(await page.locator(readerCanvas).getAttribute('aria-busy'), 'false');
    await noPrematureArtwork(page); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
}
async function staleBookSwitch(browser) {
  const held = '/art/family/heads.webp', f = await fixture(browser, [held]), { page } = f;
  try {
    await openBody(page, 'family'); await page.locator(readerCanvas + '[data-art-state="loading"]').waitFor();
    await until(() => f.holds.get(held)?.hits, 'family head atlas delayed');
    await action(page, 'home').click(); await openBody(page, 'flower'); await ready(page);
    await page.evaluate(() => { window.__currentArt = document.querySelector('.ls-reader-art canvas'); window.__currentPixels = window.__currentArt.toDataURL(); });
    const before = await mark(page); f.release(held);
    await page.waitForFunction(() => window.LittleFamilyArtLoader.status() === 'ready'); await frames(page);
    assert.equal(await page.locator(readerCanvas).getAttribute('data-art'), 'flower');
    assert.equal(await page.evaluate(() => document.querySelector('.ls-reader-art canvas') === window.__currentArt && window.__currentArt.toDataURL() === window.__currentPixels), true, 'a delayed family request cannot replace the newer flower illustration');
    const late = await page.evaluate(before => window.__artAudit.paints.slice(before.paints), before);
    assert.ok(late.every(p => p.connected && (!p.reader || p.book === 'flower')), 'switched-away canvases never receive async artwork');
    await noPrematureArtwork(page); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
}
async function failedRetry(browser, book, failedFile) {
  const f = await fixture(browser, [], [failedFile]), { page } = f;
  try {
    await openBody(page, book);
    await page.locator(readerCanvas + '[data-art-state="error"]').waitFor();
    await page.locator('.ls-reader [data-art-book="' + book + '"]:not([hidden])').waitFor();
    assert.equal(await page.evaluate(book => window.__artAudit.paints.some(p => p.kind === 'legacy' && p.reader && p.book === book && p.status === 'error'), book), true, 'an actual error retains the working complete fallback');
    await noPrematureArtwork(page);
    f.hold(failedFile); f.failures.delete(failedFile); const before = await mark(page);
    await action(page, 'retry-art').click();
    await until(() => f.holds.get(failedFile)?.hits, 'retry waits for its missing real layer');
    await page.locator(readerCanvas + '[data-art-state="loading"][aria-busy="true"]').waitFor();
    assert.deepEqual(await page.evaluate(before => window.__artAudit.paints.slice(before.paints).filter(p => p.framing !== 'avatar'), before), [], 'retry waiting uses the same stable placeholder, never flashes another drawing');
    await page.screenshot({ path: path.join(output, book + '-retry-loading.png') });
    f.release(failedFile); await ready(page);
    assert.equal(await page.locator('.ls-reader [data-art-book="' + book + '"]:not([hidden])').count(), 0);
    assert.equal(await page.locator(readerCanvas).getAttribute('aria-busy'), 'false');
    await noPrematureArtwork(page); assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
}
async function main() {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    await coldLayersAndCache(browser);
    await pendingPrefetchBecomesVisible(browser, 'intro', '/art/intro/play.webp', 1);
    await pendingPrefetchBecomesVisible(browser, 'flower', '/art/flower/wind-head.webp', 2);
    await staleSameBook(browser, 'intro', '/art/intro/play.webp', 1, 2);
    await staleSameBook(browser, 'flower', '/art/flower/wind-head.webp', 2, 5);
    await staleBookSwitch(browser);
    for (const [book, file] of [['intro','/art/intro/greeting.webp'],['flower','/art/flower/care-head.webp'],['family','/art/family/heads.webp']]) await failedRetry(browser, book, file);
    console.log('PASS: real delayed head layers never paint old or headless illustrations; stable busy placeholders, atomic complete first paint, pending-prefetch completion on newly opened pages, cached flips without loading flashes, stale page/book isolation, and visible error fallback with successful retries for all three books.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
