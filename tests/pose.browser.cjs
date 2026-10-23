'use strict';

// Local-only acceptance: POSE_TEST_PORTRAIT can point at the reported screenshot.
// Neither the input nor generated QA images are copied into the published site.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const output = path.join(preview, 'qa/pose');
const fixture = process.env.POSE_TEST_PORTRAIT || path.join(root, '.local/face-fixtures/portrait.jpg');
const baseline = process.env.POSE_TEST_BEFORE_RENDERER || path.join(root, '.local/flower-art-before-pose.js');
const origin = 'https://pose.local';
const manifest = JSON.parse(fs.readFileSync(path.join(preview, 'art/flower/manifest.json'), 'utf8'));
const policy = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8').match(/'Content-Security-Policy':\s*"([^"]+)"/);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const pngFile = (name, data) => fs.writeFileSync(path.join(output, name), Buffer.from(data.split(',')[1], 'base64'));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} versus ${expected}`);

async function main() {
  assert.ok(fs.existsSync(fixture), 'a local QA portrait is required');
  assert.ok(policy, 'acceptance uses the application CSP');
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
      return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', headers: { 'Content-Security-Policy': policy[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }, body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => {
      window.__poseSource = sessionStorage.getItem('__poseSource') || '';
      window.__poseDraws = [];
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (window.__poseSource && args[0]?.src === window.__poseSource) {
          const m = this.getTransform();
          window.__poseDraws.push({ page: this.canvas.dataset.page, book: this.canvas.dataset.art, cover: this.canvas.dataset.cover,
            qa: this.canvas.dataset.qa, reader: !!this.canvas.closest('.ls-reader-art') && !this.canvas.closest('.ls-reader-cover-stage'), shelf: !!this.canvas.closest('.ls-book'),
            matrix: [m.a, m.b, m.c, m.d, m.e, m.f], args: args.slice(1), width: this.canvas.width, height: this.canvas.height,
            sourceWidth: args[0].naturalWidth, sourceHeight: args[0].naturalHeight, filter: this.filter });
        }
        return drawImage.apply(this, args);
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|Content-Security-Policy|Refused to (?:load|compile|execute|connect)/i.test(message.text())) errors.push(message.text()); });
    const action = name => page.locator('[data-action="' + name + '"]');
    const readSaved = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('little-story-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('child', 'readonly'), item = tx.objectStore('child').get('main');
        tx.oncomplete = () => { resolve(item.result); db.close(); }; tx.onerror = () => { reject(tx.error); db.close(); }; };
    }));
    await page.goto(origin + '/');
    await page.getByRole('button', { name: '修改主角头像和名字' }).click();
    await page.evaluate(() => window.LittleFaceProcessor.prepare());
    await page.evaluate(() => {
      const cutout = window.LittleFaceProcessor.cutout.bind(window.LittleFaceProcessor);
      const analyze = window.LittleFaceProcessor.analyze.bind(window.LittleFaceProcessor);
      window.__poseInference = { analyze: 0, cutout: 0 };
      window.LittleFaceProcessor.analyze = async (...args) => { window.__poseInference.analyze++; return analyze(...args); };
      window.LittleFaceProcessor.cutout = async (...args) => { window.__poseInference.cutout++; const result = await cutout(...args); window.__poseResult = result; return result; };
    });
    await page.locator('#ls-name').fill('姿势测试');
    await page.locator('#ls-photo-input').setInputFiles(fixture);
    await page.waitForFunction(() => window.__poseResult || document.querySelector('#ls-photo-error')?.textContent.trim(), null, { timeout: 60000 });
    assert.equal(await page.locator('#ls-photo-error').textContent(), '', 'the actual local model must extract the supplied photograph');
    await page.waitForFunction(() => !document.querySelector('[data-action="save-profile"]').disabled && document.querySelector('#ls-photo-status').textContent.includes('已提取头部'));
    const extracted = await page.evaluate(() => {
      const result = window.__poseResult, png = result.canvas.toDataURL('image/png');
      window.__poseSource = png; sessionStorage.setItem('__poseSource', png);
      return { width: result.canvas.width, height: result.canvas.height, metrics: result.metrics, png, inference: window.__poseInference };
    });
    pngFile('extracted-head.png', extracted.png);
    assert.deepEqual(extracted.inference, { analyze: 1, cutout: 1 });
    const layout = { scale: 1.12, x: 7, y: -6 };
    for (const [id, value] of [['ls-photo-zoom', layout.scale], ['ls-photo-x', layout.x], ['ls-photo-y', layout.y]]) {
      await page.locator('#' + id).evaluate((input, number) => { input.value = String(number); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    }
    await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，姿势测试', exact: true }).waitFor();
    const saved = await readSaved();
    assert.equal(saved.avatars.child.data, extracted.png, 'manual layout never bakes a transformed portrait');
    assert.deepEqual(saved.avatars.child.metrics, extracted.metrics, 'facial metrics are retained');
    assert.deepEqual(saved.avatars.child.layout, layout, 'manual offsets remain separate from scene posture');
    await page.reload();
    await page.getByRole('heading', { name: '你好，姿势测试', exact: true }).waitFor();
    assert.deepEqual(await readSaved(), saved, 'profile, portrait pixels and manual offsets survive reload');
    await page.locator('.ls-book canvas[data-art="flower"][data-art-state="ready"]').waitFor();
    const cover = await page.evaluate(() => window.__poseDraws.filter(draw => draw.shelf && draw.book === 'flower').at(-1));
    assert.ok(cover, 'the saved custom portrait is used on the shelf cover');
    checkCompleteHead(cover, extracted.metrics, false);
    await page.locator('.ls-book[data-id="flower"]').screenshot({ path: path.join(output, 'cover-saved-layout.png') });

    // Return to automatic placement for the per-page neck alignment checks.
    await page.getByRole('button', { name: '修改主角头像和名字' }).click();
    assert.equal(await page.locator('#ls-photo-zoom').inputValue(), '1.12');
    assert.equal(await page.locator('#ls-photo-x').inputValue(), '7');
    assert.equal(await page.locator('#ls-photo-y').inputValue(), '-6');
    await action('reset-head').click(); await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，姿势测试', exact: true }).waitFor();
    assert.equal((await readSaved()).avatars.child.data, extracted.png, 'resetting automatic position preserves the original cutout');
    await page.setViewportSize({ width: 568, height: 320 });
    await page.locator('[data-action="book"][data-id="flower"]').click(); await action('start').click();
    await page.locator('.ls-reader').waitFor();
    const readerCover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
    if (await readerCover.count()) {
      await action('next').click();
      await readerCover.waitFor({ state: 'detached' });
    }
    const results = [];
    for (let index = 0; index < 6; index++) {
      await page.locator('.ls-reader-art canvas[data-art-state="ready"][data-page="' + index + '"]').waitFor();
      if ([0, 2, 5].includes(index)) {
        const scene = index === 0 ? 'care' : index === 2 ? 'wind' : 'search';
        const draw = await page.evaluate(number => window.__poseDraws.filter(item => item.reader && item.page === String(number)).at(-1), index);
        assert.ok(draw, 'custom photograph is rendered in ' + scene);
        near(Math.atan2(draw.matrix[1], draw.matrix[0]), manifest.scenes[scene].photoPose.rotation, scene + ' applies its own body angle');
        assert.equal(draw.filter, 'none', 'pose uses original face colours');
        assert.deepEqual(draw.args.slice(0, 4), [0, 0, extracted.width, extracted.height], 'complete source image is passed to drawImage');
        const corners = checkCompleteHead(draw, extracted.metrics, true);
        const text = await page.locator('.ls-page-text').evaluate(element => {
          const box = element.getBoundingClientRect(), canvas = element.parentElement.querySelector('canvas').getBoundingClientRect();
          return { left: box.left - canvas.left, canvasWidth: canvas.width, fontSize: parseFloat(getComputedStyle(element).fontSize), textFits: element.scrollHeight <= element.clientHeight + 1 };
        });
        assert.ok(Math.max(...corners.map(point => point.x)) / draw.width * text.canvasWidth < text.left, scene + ' leaves the text area clear');
        assert.ok(text.fontSize >= 22 && text.textFits, 'small-phone text remains readable');
        await page.screenshot({ path: path.join(output, '568-' + scene + '.png') });
        results.push({ scene, draw, corners });
      }
      if (index < 5) await action('next').click();
    }
    assert.equal(new Set(results.map(result => result.draw.matrix.slice(0, 2).map(number => number.toFixed(5)).join(','))).size, 3, 'the three actions have different photo transforms');

    // Use precisely the same canonical PNG to render diagnostic before/after
    // frames. The old renderer is optional for repeatable future regression.
    if (fs.existsSync(baseline)) await page.addScriptTag({ content: '(()=>{const module={exports:{}};\n' + fs.readFileSync(baseline, 'utf8') + '\nwindow.__poseBefore=module.exports;})();' });
    const diagnostics = await page.evaluate(async extracted => {
      const load = async source => { const image = new Image(); image.src = source; await image.decode(); return image; };
      const image = await load(extracted.png), assets = {};
      for (const key of ['care', 'wind', 'search', 'careHead', 'windHead', 'searchHead', 'petal']) assets[key] = await load('/art/flower/' + key.replace('Head', '-head') + '.webp');
      const manifest = await (await fetch('/art/flower/manifest.json')).json(), pictures = {}, regressions = [];
      for (const [scene, number] of [['care', 0], ['wind', 2], ['search', 5]]) {
        for (const [variant, renderer] of [['before', window.__poseBefore], ['after', shared.flowerArt]]) {
          if (!renderer) continue;
          const canvas = document.createElement('canvas'); canvas.dataset.qa = scene + '-' + variant;
          const ok = renderer.draw(canvas, { book: 'flower', page: number, width: 1004, height: 565, assets, manifest,
            avatars: { child: { image, kind: 'cutout', metrics: extracted.metrics, layout: { scale: 1, x: 0, y: 0 } } } });
          if (!ok) throw new Error('Diagnostic scene failed: ' + scene + ' ' + variant);
          pictures[scene + '-' + variant] = canvas.toDataURL('image/png');
        }
        for (const [variant, metrics, layout] of [
          ['legacy', { bounds: extracted.metrics.bounds, chin: extracted.metrics.chin }, { scale: 1, x: 0, y: 0 }],
          ['extreme', extracted.metrics, { scale: 1.6, x: 35, y: -35 }]
        ]) {
          const canvas = document.createElement('canvas'); canvas.dataset.qa = scene + '-' + variant;
          const ok = shared.flowerArt.draw(canvas, { book: 'flower', page: number, width: 568, height: 216, assets, manifest,
            avatars: { child: { image, kind: 'cutout', metrics, layout } } });
          regressions.push({ scene, variant, ok, draw: window.__poseDraws.filter(draw => draw.qa === canvas.dataset.qa).at(-1) });
        }
      }
      const original = document.createElement('canvas'); original.width = extracted.width; original.height = extracted.height; original.getContext('2d').drawImage(image, 0, 0);
      return { pictures, regressions, unchangedSource: image.src === extracted.png, pixels: original.toDataURL('image/png') };
    }, extracted);
    for (const [name, picture] of Object.entries(diagnostics.pictures)) pngFile(name + '.png', picture);
    for (const regression of diagnostics.regressions) {
      assert.equal(regression.ok, true, regression.scene + ' ' + regression.variant + ' still renders');
      checkCompleteHead(regression.draw, extracted.metrics, true);
    }
    assert.equal(diagnostics.unchangedSource, true);
    assert.equal((await readSaved()).avatars.child.data, extracted.png, 'scene changes do not modify or regenerate the saved head');
    assert.deepEqual(denied, [], 'only local bundled model/art requests; no photo upload');
    assert.ok(requests.some(request => /\.wasm$/.test(request.path)), 'real WebAssembly model inference was used');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ metrics: extracted.metrics, width: extracted.width, height: extracted.height,
      canonicalSha256: crypto.createHash('sha256').update(extracted.png).digest('hex'), savedLayout: layout,
      cases: results, compatibility: diagnostics.regressions, photographUploaded: false }, null, 2));
    console.log('PASS: real local photo extraction, distinct automatic neck/angle alignment, unchanged canonical pixels, manual-layout save/reload, unclipped cover and 568x320 reader, clear text, legacy metrics and maximum adjustment range.');
  } finally { await browser.close(); }
}

function checkCompleteHead(draw, metrics, reader) {
  assert.ok(draw, 'a custom-photo draw call is captured');
  const [a, b, c, d, e, f] = draw.matrix, [sx, sy, sw, sh, dx, dy, dw, dh] = draw.args;
  const bounds = metrics.bounds;
  const corners = [[bounds.left, bounds.top], [bounds.right, bounds.top], [bounds.left, bounds.bottom], [bounds.right, bounds.bottom]].map(([x, y]) => {
    const px = dx + (x - sx) / sw * dw, py = dy + (y - sy) / sh * dh;
    return { x: a * px + c * py + e, y: b * px + d * py + f };
  });
  for (const point of corners) assert.ok(point.x >= -0.5 && point.x <= draw.width + 0.5 && point.y >= -0.5 && point.y <= draw.height + 0.5, 'the entire rotated hair/face silhouette stays inside its canvas');
  if (reader) assert.ok(Math.max(...corners.map(point => point.x)) <= draw.width * 0.67, 'head remains outside the story text area');
  return corners;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
