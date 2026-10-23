'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const preview = path.resolve(__dirname, '../preview');
const output = path.join(preview, 'qa/flower');
fs.mkdirSync(output, { recursive: true });
const expected = ['我的小花。', '我的花有好多片。', '一片两片三四片，', '五片六片七八片，', '九片十片十一片，', '飞入草丛都不见。'];
async function main() {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const requests = [], errors = [];
    let failWind = false, holdWind = false, releaseWind;
    await context.route('http://flower.local/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname);
      assert.equal(route.request().method(), 'GET', 'book rendering never uploads photographs');
      if (url.pathname === '/art/flower/wind.webp' && failWind) return route.fulfill({ status: 503, body: '' });
      if (url.pathname === '/art/flower/wind.webp' && holdWind) await new Promise(resolve => { releaseWind = resolve; });
      const file = path.resolve(preview, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(preview + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const contentType = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const action = name => page.locator('[data-action="' + name + '"]');
    const waitArt = () => page.locator('.ls-reader-art canvas[data-art-state="ready"]').waitFor();
    const openBook = async () => {
      await page.locator('[data-action="book"][data-id="flower"]').click();
      await action('start').click();
      await page.locator('.ls-reader').waitFor();
      const cover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
      if (await cover.count()) {
        await action('next').click();
        await cover.waitFor({ state: 'detached' });
      }
    };
    const verifyTextAndControls = async (index, size) => {
      assert.equal((await page.locator('.ls-page-text').innerText()).replace(/\s/g, ''), expected[index], 'the approved story text is preserved');
      const fit = await page.evaluate(() => {
        const text = document.querySelector('.ls-page-text'), box = text.getBoundingClientRect();
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT), glyphs = [];
        while (walker.nextNode()) for (let index = 0; index < walker.currentNode.length; index++) {
          const range = document.createRange(); range.setStart(walker.currentNode, index); range.setEnd(walker.currentNode, index + 1);
          const rect = range.getBoundingClientRect(); glyphs.push(rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
        }
        const next = document.querySelector('[data-action="next"]').getBoundingClientRect();
        const previous = document.querySelector('[data-action="previous"]').getBoundingClientRect();
        return { glyphsFit: glyphs.every(Boolean), fontSize: parseFloat(getComputedStyle(text).fontSize), scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight, nextBottom: next.bottom, previousBottom: previous.bottom, nextTop: next.top };
      });
      assert.equal(fit.glyphsFit, true, `all glyphs fit ${size.width}x${size.height}, page ${index + 1}`);
      assert.ok(fit.fontSize >= 22, 'small landscape phones retain at least 22px text');
      assert.ok(fit.scrollWidth <= size.width + 1 && fit.scrollHeight <= size.height + 1, 'no outer scrolling');
      assert.ok(fit.nextTop >= 0 && fit.nextBottom <= size.height && fit.previousBottom <= size.height, 'turning controls stay on screen');
    };
    await page.goto('http://flower.local/');
    await page.locator('.ls-book canvas[data-art="flower"][data-art-state="ready"]').waitFor();
    assert.equal(requests.some(name => /\/(wind|search)(?:-head)?\.webp$/.test(name)), false, 'opening the shelf loads only the cover scene');
    assert.equal(requests.includes('/art/flower/petal.webp'), false, 'cover does not download the wind-only petal layer');
    for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(size); await openBook();
      for (let index = 0; index < 6; index++) {
        await waitArt(); await verifyTextAndControls(index, size);
        await page.screenshot({ path: path.join(output, `${size.width}-page-${index + 1}.png`) });
        await action('next').click();
      }
      await page.getByRole('heading', { name: '我读完啦！' }).waitFor(); await action('home').click();
    }
    for (const name of ['care.webp', 'care-head.webp', 'wind.webp', 'wind-head.webp', 'search.webp', 'search-head.webp', 'petal.webp', 'manifest.json']) {
      assert.equal(requests.filter(request => request === '/art/flower/' + name).length, 1, name + ' is reused across pages and books');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { window.LittleFaceProcessor.prepare = async () => {}; });
    await page.getByRole('button', { name: '修改主角头像和名字' }).click();
    await page.locator('.ls-flower-comparison summary').click();
    await page.locator('.ls-flower-preview canvas[data-art-state="ready"]').waitFor();
    assert.equal(await page.locator('input[name="gender"],select[name="gender"]').count(), 0, 'unisex clothes need no new profile field');
    await action('cancel-profile').click();

    // Failed images retain the functioning original illustration and expose an
    // explicit retry; another navigation never receives a stale async canvas.
    failWind = true; await page.reload(); await page.setViewportSize({ width: 568, height: 320 }); await openBook();
    await action('next').click(); await action('next').click();
    await page.locator('.ls-art-notice:not([hidden])').waitFor();
    assert.equal(await page.locator('.ls-reader-art canvas').getAttribute('data-art-state'), 'error');
    assert.ok(await page.locator('.ls-reader-art canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)), 'fallback illustration is not blank');
    failWind = false; await action('retry-art').click(); await waitArt();
    assert.equal(await page.locator('.ls-art-notice:not([hidden])').count(), 0, 'successful retry removes the error');
    await action('home').click();
    holdWind = true; await page.reload(); await openBook();
    await action('next').click(); await action('next').click();
    for (let attempt = 0; !releaseWind && attempt < 100; attempt++) await page.waitForTimeout(20);
    assert.ok(releaseWind, 'wind image is held while a newer page is requested');
    await action('next').click(); await action('next').click(); await action('next').click(); await waitArt();
    releaseWind(); holdWind = false;
    await page.waitForFunction(() => window.LittleArtLoader.status(2) === 'ready');
    await waitArt();
    assert.equal(await page.locator('.ls-reader-art canvas').getAttribute('data-page'), '5', 'late scene completion cannot replace the current page');
    assert.equal((await page.locator('.ls-page-text').innerText()).replace(/\s/g, ''), expected[5]);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: real layered assets, demand loading and cache reuse, six unchanged pages, legible 844x390/568x320 layouts, profile preview, visible failure/retry, and stale-load navigation.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
