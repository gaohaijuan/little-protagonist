'use strict';

// A fictional adult portrait generated only for local QA. This input is never
// published and never sent to a server; the browser runs the bundled models.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const fixture = path.join(root, '.local/face-fixtures/fictional-long-hair.png');
const output = path.join(preview, 'qa/face');
const origin = 'https://reading.local';
const policy = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8').match(/'Content-Security-Policy':\s*"([^"]+)"/);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  assert.ok(fs.existsSync(fixture), 'local fictional long-hair QA fixture is required');
  assert.ok(policy, 'use the actual preview server CSP');
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const requests = [], denied = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ path: url.pathname, method: request.method() });
      if (url.origin !== origin || request.method() !== 'GET' || request.postData()) { denied.push(request.url()); return route.abort(); }
      const file = path.resolve(preview, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(preview + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { denied.push(request.url()); return route.fulfill({ status: 404, body: '' }); }
      return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream',
        headers: { 'Content-Security-Policy': policy[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|Content-Security-Policy|Refused to (?:load|compile|execute|connect)/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(origin + '/');
    await page.getByRole('button', { name: '修改主角头像和名字' }).click();
    // Warmup is separated from photo timing; no inference result is stubbed.
    await page.evaluate(() => window.LittleFaceProcessor.prepare());
    await page.evaluate(() => {
      const cutout = window.LittleFaceProcessor.cutout.bind(window.LittleFaceProcessor);
      const analyze = window.LittleFaceProcessor.analyze.bind(window.LittleFaceProcessor);
      window.__longHairProgress = [];
      window.LittleFaceProcessor.analyze = async (image, progress) => {
        window.__photoStarted = performance.now();
        return analyze(image, message => { window.__longHairProgress.push(message); if (progress) progress(message); });
      };
      window.LittleFaceProcessor.cutout = async (...args) => {
        const result = await cutout(...args);
        window.__longHairResult = result;
        window.__photoElapsed = performance.now() - window.__photoStarted;
        return result;
      };
    });
    await page.locator('#ls-name').fill('长发测试');
    await page.locator('#ls-photo-input').setInputFiles(fixture);
    await page.waitForFunction(() => window.__longHairResult || document.querySelector('#ls-photo-error')?.textContent.trim(), null, { timeout: 60000 });
    assert.equal(await page.locator('#ls-photo-error').textContent(), '', 'real long hair must extract successfully');
    await page.waitForFunction(() => document.querySelector('#ls-photo-status')?.textContent.includes('已提取头部') && !document.querySelector('[data-action="save-profile"]').disabled);
    const measured = await page.evaluate(() => {
      const result = window.__longHairResult, canvas = result.canvas, { metrics } = result;
      const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const edges = { top: 0, right: 0, bottom: 0, left: 0 };
      const faceHeight = metrics.faceBounds.bottom - metrics.faceBounds.top;
      const faceWidth = metrics.faceBounds.right - metrics.faceBounds.left;
      let opaque = 0, transparent = 0, belowChin = 0, blueGarment = 0, interiorBlueGarment = 0, maxHairY = 0, centerSamples = 0, centerClear = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
        if (a === 0) transparent++;
        if (a > 0) {
          if (y === 0) edges.top++;
          if (y === canvas.height - 1) edges.bottom++;
          if (x === 0) edges.left++;
          if (x === canvas.width - 1) edges.right++;
        }
        if (a > 180) {
          opaque++;
          if (y > metrics.chin.y + faceHeight * 0.15) { belowChin++; maxHairY = Math.max(maxHairY, y); }
          if (b > r + 30 && b > g + 12) {
            blueGarment++;
            let edge = false;
            for (let dy = -4; dy <= 4 && !edge; dy++) for (let dx = -4; dx <= 4 && !edge; dx++) {
              const sampleX = x + dx, sampleY = y + dy;
              if (sampleX < 0 || sampleY < 0 || sampleX >= canvas.width || sampleY >= canvas.height || rgba[(sampleY * canvas.width + sampleX) * 4 + 3] < 80) edge = true;
            }
            if (!edge) interiorBlueGarment++;
          }
        }
        if (Math.abs(x - metrics.chin.x) < faceWidth * 0.11 && y > metrics.chin.y + faceHeight * 0.22 && y < metrics.bounds.bottom - faceHeight * 0.25) {
          centerSamples++; if (a < 10) centerClear++;
        }
      }
      return { width: canvas.width, height: canvas.height, metrics, edges, opaque, transparent, belowChin, blueGarment, interiorBlueGarment, maxHairY,
        centerClearRatio: centerClear / centerSamples, elapsedMs: window.__photoElapsed, progress: window.__longHairProgress, png: canvas.toDataURL('image/png') };
    });
    fs.writeFileSync(path.join(output, 'long-hair-cutout.png'), Buffer.from(measured.png.split(',')[1], 'base64'));
    const { png, ...details } = measured;
    fs.writeFileSync(path.join(output, 'long-hair-results.json'), JSON.stringify(details, null, 2));
    console.log(JSON.stringify(details));
    assert.deepEqual(measured.edges, { top: 0, right: 0, bottom: 0, left: 0 });
    assert.ok(measured.belowChin > measured.opaque * 0.12, 'attached long hair survives below the jaw');
    assert.ok(measured.maxHairY - measured.metrics.chin.y > (measured.metrics.faceBounds.bottom - measured.metrics.faceBounds.top) * 0.7, 'chest-length tips are retained');
    // Semantic segmentation retains some source colour between fine hair
    // strands; it is not full alpha matting. Bound that residual explicitly,
    // alongside the independent clear-neck check, rather than claiming zero.
    assert.ok(measured.blueGarment < measured.opaque * 0.02, 'blue garment residual is limited to less than 2% of opaque pixels');
    assert.ok(measured.interiorBlueGarment < measured.opaque * 0.006, 'substantial solid blue clothing cannot remain inside the cutout');
    assert.ok(measured.centerClearRatio > 0.9, 'neck and central shirt remain transparent between the long locks');
    assert.ok(measured.metrics.faceBounds.top > measured.metrics.bounds.top && measured.metrics.faceBounds.bottom < measured.metrics.bounds.bottom);
    for (const value of Object.values(measured.metrics.faceBounds)) assert.ok(Number.isFinite(value));
    await page.screenshot({ path: path.join(output, 'long-hair-profile.png'), fullPage: true });
    const readSaved = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('little-story-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('child', 'readonly'), item = tx.objectStore('child').get('main');
        tx.oncomplete = () => { resolve(item.result); db.close(); };
        tx.onerror = () => { reject(tx.error); db.close(); };
      };
    }));
    await page.locator('[data-action="save-profile"]').click();
    await page.getByRole('heading', { name: '你好，长发测试', exact: true }).waitFor();
    const saved = await readSaved();
    assert.deepEqual(saved.avatars.child.metrics, measured.metrics, 'all face/hair geometry is saved without dropping faceBounds');
    assert.equal(saved.avatars.child.data, measured.png, 'complete canonical hair pixels are persisted');
    await page.reload();
    await page.getByRole('heading', { name: '你好，长发测试', exact: true }).waitFor();
    assert.deepEqual(await readSaved(), saved, 'the faceBounds and cutout survive save/reload');
    await page.evaluate(source => {
      window.__storyPhotoDraws = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (args[0]?.src === source && this.canvas.closest('.ls-reader-art') && !this.canvas.closest('.ls-reader-cover-stage')) {
          window.__storyPhotoDraws.push({ page: this.canvas.dataset.page, width: args[7], height: args[8] });
        }
        return drawImage.apply(this, args);
      };
    }, saved.avatars.child.data);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-action="book"][data-id="flower"]').click();
    await page.locator('[data-action="start"]').click();
    await page.locator('.ls-reader').waitFor();
    const cover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
    if (await cover.count()) {
      await page.locator('[data-action="next"]').click();
      await cover.waitFor({ state: 'detached' });
    }
    const art = page.locator('.ls-reader-art canvas[data-art-state="ready"]');
    await art.waitFor();
    const customDraw = await page.evaluate(() => window.__storyPhotoDraws.find(draw => draw.page === '0'));
    assert.ok(customDraw, 'the saved photo, rather than the example portrait, is drawn in the new scene');
    const manifest = JSON.parse(fs.readFileSync(path.join(preview, 'art/flower/manifest.json'), 'utf8'));
    const face = saved.avatars.child.metrics.faceBounds;
    const targetFace = (manifest.scenes.care.photoPose || manifest.scenes.care).face;
    const expectedScale = Math.min(targetFace.width / (face.right - face.left), targetFace.height / (face.bottom - face.top));
    assert.ok(Math.abs(customDraw.height / measured.height - expectedScale) < 1e-8, 'reloaded faceBounds controls facial size independently of long hair');
    await page.screenshot({ path: path.join(output, 'flower-long-hair.png') });
    for (let index = 1; index < 6; index++) {
      await page.locator('[data-action="next"]').click(); await art.waitFor();
      if (index === 2) await page.screenshot({ path: path.join(output, 'flower-long-hair-wind.png') });
    }
    await page.screenshot({ path: path.join(output, 'flower-long-hair-search.png') });
    assert.match(await page.locator('.ls-page-text').textContent(), /飞入草丛/);
    assert.equal(denied.length, 0, 'no photograph uploads or third-party requests: ' + denied.join(', '));
    assert.ok(requests.some(request => /\.wasm$/.test(request.path)), 'real WebAssembly runtime was used');
    assert.equal(requests.filter(request => /\.(?:tflite|task)$/.test(request.path)).length, 2, 'real models loaded once');
    assert.deepEqual(errors, []);
    console.log('PASS: real long-hair extraction with preserved tips, transparent edges, clear neck and bounded garment fringe, valid faceBounds, canonical save/reload, new flower scenes and local-only processing.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
