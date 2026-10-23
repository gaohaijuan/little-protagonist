'use strict';

// Real-model acceptance test. The adult portrait is a local QA-only fixture:
// https://storage.googleapis.com/mediapipe-assets/portrait.jpg
// Listed in Google's MediaPipe test assets:
// https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/testdata/vision/BUILD
// The fixture is intentionally excluded from Git and the published site.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }

const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const fixture = process.env.FACE_TEST_PORTRAIT || path.join(root, '.local/face-fixtures/portrait.jpg');
const output = path.join(root, 'preview/qa/face');
const origin = 'https://reading.local';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.task': 'application/octet-stream', '.json': 'application/json' };
const serverSource = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8');
const policy = serverSource.match(/'Content-Security-Policy':\s*"([^"]+)"/);
assert.ok(policy, 'load the actual local server CSP for browser acceptance');

async function main() {
  assert.ok(fs.existsSync(fixture), 'Set FACE_TEST_PORTRAIT to an adult QA portrait, or download the documented official fixture into .local/face-fixtures/portrait.jpg');
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.__measureHead = (canvas, crownBottom) => {
        const { width, height } = canvas;
        const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        const edges = { top: 0, right: 0, bottom: 0, left: 0 };
        let alphaMass = 0, crownMass = 0, minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const alpha = rgba[(y * width + x) * 4 + 3];
          alphaMass += alpha;
          if (y < crownBottom) crownMass += alpha;
          if (alpha > 0) {
            if (y === 0) edges.top++;
            if (x === width - 1) edges.right++;
            if (y === height - 1) edges.bottom++;
            if (x === 0) edges.left++;
          }
          if (alpha > 30) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
        }
        return { width, height, edges, alphaMass, crownMass, bounds: { minX, minY, maxX, maxY } };
      };
    });
    const requests = [], errors = [], denied = [];
    const modelStarts = new Set();
    let releaseModelResponses, reportBothModelStarts, modelResponseCount = 0;
    const modelResponsesAllowed = new Promise(resolve => { releaseModelResponses = resolve; });
    const bothModelStarts = new Promise(resolve => { reportBothModelStarts = resolve; });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ url: request.url(), method: request.method(), body: request.postData() });
      if (url.origin !== origin || request.method() !== 'GET' || request.postData()) {
        denied.push(request.url()); return route.abort();
      }
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const local = path.resolve(preview, '.' + relative);
      if (!local.startsWith(preview + path.sep) || !fs.existsSync(local) || !fs.statSync(local).isFile()) {
        denied.push(request.url()); return route.fulfill({ status: 404, body: 'not found' });
      }
      if (/\.(task|tflite)$/.test(url.pathname)) {
        modelStarts.add(url.pathname);
        if (modelStarts.size === 2) reportBothModelStarts();
        await modelResponsesAllowed;
        modelResponseCount++;
      }
      return route.fulfill({ status: 200, contentType: types[path.extname(local)] || 'application/octet-stream', headers: { 'Content-Security-Policy': policy[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }, body: fs.readFileSync(local) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|Content-Security-Policy|Refused to (?:load|compile|execute|connect)/i.test(message.text())) {
        errors.push(message.text()); console.error('Browser CSP:', message.text());
      }
    });
    await page.goto(origin + '/');
    if (!await page.evaluate(() => !!window.LittleFaceProcessor)) {
      await page.addScriptTag({ url: origin + '/face-processor.js' });
    }
    await page.waitForFunction(() => !!window.LittleFaceProcessor, null, { timeout: 15000 });
    // A slow download is deliberately held open. Both models must begin before
    // either finishes, and opening/cancelling profile must work without a photo.
    if (process.env.FACE_TEST_MODULE_ONLY !== '1') {
      await page.getByRole('button', { name: '修改主角头像和名字' }).click();
    } else {
      await page.evaluate(() => { window.__preparedModels = window.LittleFaceProcessor.prepare(); });
    }
    let loadingTimeout;
    try {
      await Promise.race([bothModelStarts, new Promise((_, reject) => {
        loadingTimeout = setTimeout(() => reject(new Error('both model downloads must start during profile warmup before the first response')), 5000);
      })]);
      assert.equal(modelResponseCount, 0, 'model downloads overlap while no photo has been chosen');
      if (process.env.FACE_TEST_MODULE_ONLY !== '1') {
        await page.locator('[data-action="cancel-profile"]').click();
        await page.getByRole('button', { name: '修改主角头像和名字' }).waitFor();
      }
    } finally {
      clearTimeout(loadingTimeout);
      releaseModelResponses();
    }
    await page.evaluate(() => window.LittleFaceProcessor.prepare());
    const modelDownloadsAfterPreparation = requests.filter(item => /\.(task|tflite)$/.test(new URL(item.url).pathname)).length;
    assert.equal(modelDownloadsAfterPreparation, 2, 'warmup downloads exactly the two required models');
    if (process.env.FACE_TEST_MODULE_ONLY !== '1') {
      assert.equal(await page.getByRole('button', { name: '修改主角头像和名字' }).count(), 1, 'finishing warmup does not reopen a cancelled profile');
    }
    const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(fixture).toString('base64');
    const single = await page.evaluate(async source => {
      const img = new Image(); img.src = source; await img.decode();
      const progress = [];
      window.__faceOriginal = img;
      const analysis = await window.LittleFaceProcessor.analyze(img, message => progress.push(message));
      window.__singleAnalysis = analysis;
      const result = await window.LittleFaceProcessor.cutout(analysis, 0, { scale: 1, x: 0, y: 0 });
      window.__faceCutout = result.canvas;
      const canvas = result.canvas;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, opaque = 0, blueGarment = 0, semitransparent = 0;
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const [r, g, b, a] = pixels.slice(index, index + 4);
        if (a < 10) transparent++;
        else if (a > 220) opaque++;
        else semitransparent++;
        // The reference portrait wears a blue suit/tie. Hair and facial features
        // are neutral or warm; large blue regions would retain the upper body.
        if (a > 180 && b > r + 17 && b > g + 5 && r < 120) blueGarment++;
        if (a > 100) {
          const n = index / 4, x = n % canvas.width, y = Math.floor(n / canvas.width);
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      const alphaAt = (x, y) => pixels[(y * canvas.width + x) * 4 + 3];
      return {
        faces: analysis.faces.length, width: canvas.width, height: canvas.height,
        sourceWidth: img.width, sourceHeight: img.height, transparent, opaque, blueGarment, semitransparent,
        corners: [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]].map(([x,y]) => alphaAt(x,y)),
        bounds: {minX,minY,maxX,maxY}, progress,
        png: canvas.toDataURL('image/png')
      };
    }, dataUrl);
    assert.equal(single.faces, 1, 'a real adult half-body portrait yields one face');
    assert.equal(requests.filter(item => /\.(task|tflite)$/.test(new URL(item.url).pathname)).length, modelDownloadsAfterPreparation, 'the first selected photo reuses prepared models without downloading them again');
    assert.equal(single.width, 540); assert.equal(single.height, 570);
    const pixelCount = single.width * single.height;
    assert.ok(single.transparent > pixelCount * 0.15, 'output has a transparent background');
    assert.ok(single.opaque > pixelCount * 0.15, 'output retains a substantial face');
    assert.ok(single.blueGarment < pixelCount * 0.01, 'source suit and tie are removed');
    assert.ok(single.semitransparent > 50, 'segmentation has a softened contour');
    assert.deepEqual(single.corners, [0,0,0,0], 'the photo background is absent at all output corners');
    fs.writeFileSync(path.join(output, 'portrait-cutout.png'), Buffer.from(single.png.split(',')[1], 'base64'));

    // A smaller, uncropped extraction is the silhouette reference. Checking all
    // four edges alone would also pass if the fix erased a strip of hair; alpha
    // area and crown coverage must survive each scale/position transformation.
    const crownRegression = await page.evaluate(async () => {
      const reference = await window.LittleFaceProcessor.cutout(window.__singleAnalysis, 0, { scale: 0.75, x: 0, y: 0 });
      const referenceMetrics = window.__measureHead(reference.canvas);
      const referenceCrownBottom = referenceMetrics.bounds.minY + (referenceMetrics.bounds.maxY - referenceMetrics.bounds.minY + 1) * 0.25;
      const referenceCrown = window.__measureHead(reference.canvas, referenceCrownBottom).crownMass;
      const cases = [];
      for (const scale of [1.05, 1.15]) for (const x of [-40, 0, 40]) for (const y of [-40, 0, 40]) cases.push({ scale, x, y });
      // Public processor bounds are wider than the UI's slider limits.
      for (const x of [-60, 60]) for (const y of [-60, 60]) cases.push({ scale: 1.25, x, y });
      const results = [];
      for (const requested of cases) {
        const result = await window.LittleFaceProcessor.cutout(window.__singleAnalysis, 0, requested);
        const ratio = result.adjustments.scale / reference.adjustments.scale;
        const crownBottom = result.chin.y + (referenceCrownBottom - reference.chin.y) * ratio;
        const metrics = window.__measureHead(result.canvas, crownBottom);
        results.push({ requested, applied: result.adjustments, ...metrics,
          alphaRatio: metrics.alphaMass / (referenceMetrics.alphaMass * ratio * ratio),
          crownRatio: metrics.crownMass / (referenceCrown * ratio * ratio),
          widthRatio: (metrics.bounds.maxX - metrics.bounds.minX + 1) / ((referenceMetrics.bounds.maxX - referenceMetrics.bounds.minX + 1) * ratio),
          heightRatio: (metrics.bounds.maxY - metrics.bounds.minY + 1) / ((referenceMetrics.bounds.maxY - referenceMetrics.bounds.minY + 1) * ratio) });
      }
      return results;
    });
    for (const result of crownRegression) {
      const label = JSON.stringify(result.requested);
      assert.deepEqual(result.edges, { top: 0, right: 0, bottom: 0, left: 0 }, 'complete head stays clear of every export edge: ' + label);
      assert.ok(Math.abs(result.alphaRatio - 1) < 0.015, 'the complete silhouette area is retained, not trimmed: ' + label);
      assert.ok(Math.abs(result.crownRatio - 1) < 0.035, 'the top quarter of the hair keeps its coverage: ' + label);
      assert.ok(Math.abs(result.widthRatio - 1) < 0.015 && Math.abs(result.heightRatio - 1) < 0.015, 'the complete head dimensions scale proportionally: ' + label);
    }

    const noFace = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 480;
      const c = canvas.getContext('2d'); c.fillStyle = '#9ad9ed'; c.fillRect(0,0,480,480);
      c.fillStyle = '#f5d471'; c.fillRect(80,280,320,90);
      try { await window.LittleFaceProcessor.analyze(canvas); return { rejected: false }; }
      catch (error) { return { rejected: true, message: error.message, code: error.code, png: canvas.toDataURL('image/png') }; }
    });
    assert.ok(noFace.rejected, 'a photo with no face is rejected instead of used as a head');
    assert.equal(noFace.code, 'NO_FACE');

    const multi = await page.evaluate(async () => {
      const img = window.__faceOriginal;
      const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 690;
      const c = canvas.getContext('2d'); c.fillStyle = '#eee'; c.fillRect(0,0,1100,690);
      c.drawImage(img,0,0,550,690); c.drawImage(img,550,0,550,690);
      const analysis = await window.LittleFaceProcessor.analyze(canvas);
      window.__multiAnalysis = analysis;
      let selectionCode;
      try { await window.LittleFaceProcessor.cutout(analysis); }
      catch (error) { selectionCode = error.code; }
      const selected = await window.LittleFaceProcessor.cutout(analysis, 1, { scale: 1, x: 0, y: 0 });
      return { faces: analysis.faces.length, thumbnails: analysis.faces.map(face => face.thumbnail), selectionCode, selectedWidth: selected.canvas.width, input: canvas.toDataURL('image/png') };
    });
    assert.equal(multi.faces, 2, 'a two-person photo exposes two candidates for explicit selection');
    assert.equal(multi.selectionCode, 'SELECT_FACE', 'multi-face extraction requires an explicit choice');
    assert.ok(multi.thumbnails.every(value => typeof value === 'string' && value.startsWith('data:image/')), 'each candidate has its own local selection thumbnail');
    assert.notEqual(multi.thumbnails[0], multi.thumbnails[1], 'candidates are independently cropped');
    assert.equal(multi.selectedWidth, 540, 'the second face can be selected and extracted');

    await page.evaluate(() => {
      const stage = document.createElement('main'); stage.id = 'qa-result';
      stage.style.cssText = 'position:fixed;inset:0;z-index:999999;background:white;display:flex;align-items:center;justify-content:center;gap:24px';
      const original = window.__faceOriginal.cloneNode(); original.style.cssText = 'width:300px;height:auto';
      const panel = document.createElement('div'); panel.style.cssText = 'background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0/24px 24px';
      const face = window.__faceCutout; face.style.cssText = 'width:300px;height:auto';
      panel.append(face); stage.append(original,panel); document.body.append(stage);
    });
    await page.screenshot({ path: path.join(output, 'portrait-before-after.png') });
    await page.locator('#qa-result').evaluate(element => element.remove());

    if (process.env.FACE_TEST_MODULE_ONLY !== '1') {
      const readSaved = () => page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('little-story-local', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('child', 'readonly');
          const item = tx.objectStore('child').get('main');
          tx.oncomplete = () => { resolve(item.result); db.close(); };
          tx.onerror = () => { reject(tx.error); db.close(); };
        };
      }));
      const openProfile = () => page.getByRole('button', { name: '修改主角头像和名字' }).click();
      const save = page.locator('[data-action="save-profile"]');
      const waitReady = () => page.waitForFunction(() => document.querySelector('#ls-photo-status')?.textContent.includes('已自动适配') && !document.querySelector('[data-action="save-profile"]').disabled);
      await openProfile();
      await page.locator('#ls-name').fill('小豆包');
      await page.evaluate(() => {
        const cutout = window.LittleFaceProcessor.cutout.bind(window.LittleFaceProcessor);
        window.__uiCutoutCount = 0;
        window.LittleFaceProcessor.cutout = async (...args) => {
          const result = await cutout(...args);
          window.__lastUICutout = result;
          window.__uiCutoutCount++;
          return result;
        };
      });
      await page.locator('#ls-photo-input').setInputFiles(fixture);
      await waitReady();
      assert.equal(await readSaved(), undefined, 'upload and segmentation never commit before saving');
      await page.screenshot({ path: path.join(output, 'profile-real-cutout.png'), fullPage: true });
      const extracted = await page.evaluate(() => ({ count: window.__uiCutoutCount, png: window.__lastUICutout.canvas.toDataURL('image/png') }));
      assert.equal(extracted.count, 1);
      assert.equal(await page.locator('input[type="range"], [data-action="reset-head"]').count(),0,'real extraction needs no manual positioning');
      assert.match(await page.locator('#ls-photo-status').innerText(),/已自动适配/);
      const finalUIPng = await page.evaluate(() => window.__lastUICutout.canvas.toDataURL('image/png'));
      assert.equal(await page.evaluate(() => window.__uiCutoutCount), 1, 'automatic fitting reuses one extraction');
      assert.equal(finalUIPng, extracted.png, 'placement never crops or rewrites the canonical head pixels');
      assert.deepEqual(await page.evaluate(() => window.__measureHead(window.__lastUICutout.canvas).edges), { top: 0, right: 0, bottom: 0, left: 0 }, 'the complete canonical head keeps a transparent border');
      fs.writeFileSync(path.join(output, 'portrait-auto-fit.png'), Buffer.from(finalUIPng.split(',')[1], 'base64'));
      await page.screenshot({ path: path.join(output, 'profile-auto-fit-crown.png'), fullPage: true });
      await save.click();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      const committed = await readSaved();
      assert.equal(committed.version, 4);
      assert.equal(committed.avatars.child.kind, 'cutout');
      assert.ok(committed.avatars.child.data.startsWith('data:image/png;base64,'));
      assert.equal(committed.avatars.child.data, finalUIPng, 'save commits the full head independently of placement');
      assert.deepEqual(committed.avatars.child.layout, { scale: 1, x: 0, y: 0 });
      await page.reload();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      assert.deepEqual(await readSaved(), committed, 'automatically fitted head is preserved exactly after reload');
      const savedMetrics = await page.evaluate(async source => {
        const image = new Image(); image.src = source; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return window.__measureHead(canvas);
      }, committed.avatars.child.data);
      assert.deepEqual(savedMetrics.edges, { top: 0, right: 0, bottom: 0, left: 0 }, 'saved/reloaded PNG retains a complete crown and transparent edges');

      await openProfile();
      await page.locator('#ls-photo-input').setInputFiles({ name: 'no-face.png', mimeType: 'image/png', buffer: Buffer.from(noFace.png.split(',')[1], 'base64') });
      await page.getByRole('alert').filter({ hasText: '没有找到清晰的脸部' }).waitFor();
      assert.equal(requests.filter(item => /\.(task|tflite)$/.test(new URL(item.url).pathname)).length, modelDownloadsAfterPreparation, 'HTTPS reload reuses persistent model cache without downloading the model payloads again');
      assert.equal(await save.isDisabled(), true, 'unrecognized input cannot save a fake photo head');
      assert.deepEqual(await readSaved(), committed, 'a failed extraction preserves the saved avatar');
      await page.locator('[data-action="discard-photo"]').click();
      assert.equal(await save.isDisabled(), false, 'discarding failed input restores editing');

      await page.locator('#ls-photo-input').setInputFiles({ name: 'two-adults.png', mimeType: 'image/png', buffer: Buffer.from(multi.input.split(',')[1], 'base64') });
      await page.locator('[data-action="choose-face"]').first().waitFor();
      assert.equal(await page.locator('[data-action="choose-face"]').count(), 2);
      assert.equal(await save.isDisabled(), true, 'multi-face photo cannot be saved before selection');
      await page.locator('[data-action="choose-face"][data-index="1"]').click();
      await waitReady();
      assert.equal(await page.locator('[data-action="choose-face"][data-index="1"]').getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: path.join(output, 'profile-face-choice.png'), fullPage: true });
      await save.click();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      let selected = await readSaved();
      assert.equal(selected.avatars.child.kind, 'cutout');
      await page.reload();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      assert.deepEqual(await readSaved(), selected, 'the extracted head persists on reload');
      await page.screenshot({ path: path.join(output, 'home-saved-cutout.png'), fullPage: true });

      // Real model coverage for optional sibling roles, including valid JPEGs
      // returned by a phone library without trustworthy MIME metadata.
      const childBeforeFamily = selected.avatars.child;
      await openProfile();
      for (const [role, mimeType] of [['olderBrother', ''], ['youngerSister', 'application/octet-stream']]) {
        await page.locator('[data-action="role"][data-role="' + role + '"]').click();
        await page.locator('#ls-photo-input').setInputFiles({ name: role + '-portrait.jpg', mimeType, buffer: fs.readFileSync(fixture) });
        await waitReady();
        assert.equal(await page.locator('#ls-photo-error').textContent(), '', role + ' real JPEG extraction succeeds');
        assert.equal(await page.locator('[data-role="' + role + '"] [aria-label="已设置照片"]').count(), 1);
      }
      await save.click();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      selected = await readSaved();
      assert.deepEqual(selected.avatars.child, childBeforeFamily, 'family extraction preserves the child head and placement');
      for (const role of ['olderBrother', 'youngerSister']) {
        assert.equal(selected.avatars[role].kind, 'cutout');
        assert.ok(selected.avatars[role].data.startsWith('data:image/png;base64,'));
      }
      await page.reload();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      assert.deepEqual(await readSaved(), selected, 'real family heads persist after reload');

      // Delay the real model download to exercise cancellation while analysis is
      // pending. The model still runs; no face detections are mocked.
      let releaseModel, requestStarted;
      const modelGate = new Promise(resolve => { releaseModel = resolve; });
      const started = new Promise(resolve => { requestStarted = resolve; });
      await context.route('**/models/face_landmarker.task', async route => {
        requestStarted(); await modelGate; await route.fallback();
      });
      // A deliberately cold cache is required here: ordinary repeat visits now
      // reuse the persistent local model cache instead of downloading again.
      await page.evaluate(async () => {
        for (const key of await caches.keys()) if (key.startsWith('little-story-models-')) await caches.delete(key);
      });
      await openProfile();
      await page.locator('#ls-name').fill('不保存');
      await page.locator('#ls-photo-input').setInputFiles(fixture);
      await started;
      assert.equal(await save.isDisabled(), true, 'saving is disabled while real model preparation is pending');
      await page.locator('[data-action="cancel-profile"]').click();
      await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
      releaseModel();
      await page.waitForLoadState('networkidle');
      assert.deepEqual(await readSaved(), selected, 'an analysis finishing after cancellation cannot overwrite saved state');
      assert.equal(await page.getByRole('heading', { name: '你好，小豆包', exact: true }).count(), 1);
      await page.locator('[data-action="book"][data-id="intro"]').click();
      await page.locator('[data-action="start"]').click();
      await page.locator('[data-action="landscape"]').click();
      await page.locator('.ls-reader').waitFor();
      const readerCover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
      if (await readerCover.count()) {
        await page.locator('[data-action="next"]').click();
        await readerCover.waitFor({ state: 'detached' });
      }
      await page.waitForFunction(() => {
        const device = document.querySelector('#ls-device'), canvas = document.querySelector('.ls-reader-art canvas');
        return device.getBoundingClientRect().width > 710 && canvas && Math.abs(canvas.width - canvas.getBoundingClientRect().width) < 2;
      });
      await page.screenshot({ path: path.join(output, 'reader-real-cutout.png'), fullPage: true });
    }
    assert.equal(denied.length, 0, 'all processing requests remain local and use existing bundled files: ' + denied.join(', '));
    assert.ok(requests.some(item => /\.(tflite|task)(?:\?|$)/.test(item.url)), 'the real ML models were loaded');
    assert.ok(requests.some(item => /\.wasm(?:\?|$)/.test(item.url)), 'the real WebAssembly inference engine ran');
    assert.deepEqual(errors, [], 'no unhandled browser errors');
    const { png, ...metrics } = single;
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ single: metrics, crownRegression, noFace: {rejected:noFace.rejected, code:noFace.code}, multi: { faces: multi.faces }, requests: requests.map(({ url, method }) => ({ url, method })) }, null, 2));
  console.log('PASS: real MediaPipe half-body extraction, complete crown across 22 legacy transform combinations, automatic fitting without manual controls or re-extraction, child/sibling extraction including missing MIME metadata, v4 canonical head save/reload, persistent model cache despite no-store hosting, transparent contour, garment removal, no-face rejection, multi-face selection, local-only processing, and cancellation.');
    console.log(JSON.stringify(metrics));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
