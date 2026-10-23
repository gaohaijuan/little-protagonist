'use strict';

// Local-only QA: compare both alpha algorithms against the same real model
// masks. The fictional reference head is never uploaded or published by this
// test. The old processor is a local pre-change snapshot, not a mock model.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const output = path.join(preview, 'qa/face');
const origin = 'https://reading.local';
const policy = fs.readFileSync(path.join(root, 'scripts/serve-preview.cjs'), 'utf8').match(/'Content-Security-Policy':\s*"([^"]+)"/);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const exportLine = 'else root.LittleFaceProcessor = api.createProcessor();';
const captureLine = 'head = makeHeadAlpha(masks, geometry, others);';

async function main() {
  const beforeFile = path.join(root, '.local/face-processor-before-hairline.js');
  assert.ok(fs.existsSync(beforeFile), 'local pre-change processor snapshot is required for this comparative QA');
  assert.ok(policy, 'use the actual preview CSP');
  const beforeSource = fs.readFileSync(beforeFile, 'utf8').replace(exportLine, 'else root.__hairlineBefore = api;');
  const currentSource = fs.readFileSync(path.join(preview, 'face-processor.js'), 'utf8');
  assert.ok(currentSource.includes(captureLine) && currentSource.includes(exportLine), 'instrument exact known API boundaries');
  const afterSource = currentSource.replace(exportLine, 'else { root.__hairlineAfter = api; root.LittleFaceProcessor = api.createProcessor(); }')
    .replace(captureLine, captureLine + '\n globalThis.__hairlineCaptures.push({ masks: masks, geometry: geometry, others: others, texture: roiImage(record.source, geometry, 960), head: head });');
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1080, height: 680 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const requests = [], denied = [], errors = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ path: url.pathname, method: request.method() });
      if (url.origin !== origin || request.method() !== 'GET' || request.postData()) { denied.push(request.url()); return route.abort(); }
      let body, extension;
      if (url.pathname === '/') {
        body = '<!doctype html><meta charset="utf-8"><title>Hairline local QA</title><style>body{margin:24px;background:#f3f0e7;font:18px sans-serif;color:#30443c}h1{font-size:22px}main{display:flex;gap:24px}section{width:480px}canvas{width:460px;height:486px;background:#faf5e8;border-radius:24px}p{font-size:15px}</style><h1>同一真实分割结果：仅修正发际线透明度</h1><main><section><h2>修复前</h2><canvas id="before"></canvas></section><section><h2>修复后</h2><canvas id="after"></canvas></section></main><p>虚构示例头像；两侧使用完全相同的源照片、模型置信度和头部位置。</p><script>window.__hairlineCaptures=[];</script><script src="/before.js"></script><script src="/after.js"></script>';
        extension = '.html';
      } else if (url.pathname === '/before.js' || url.pathname === '/after.js') {
        body = url.pathname === '/before.js' ? beforeSource : afterSource; extension = '.js';
      } else if (/^\/fixture-(care|wind|search)\.png$/.test(url.pathname)) {
        body = fs.readFileSync(path.join(root, 'art-samples/my-flower-production', url.pathname.match(/^\/fixture-(\w+)\.png$/)[1] + '-head.png')); extension = '.png';
      } else {
        const file = path.resolve(preview, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(preview + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { denied.push(request.url()); return route.fulfill({ status: 404, body: '' }); }
        body = fs.readFileSync(file); extension = path.extname(file);
      }
      return route.fulfill({ status: 200, contentType: types[extension] || 'application/octet-stream',
        headers: { 'Content-Security-Policy': policy[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }, body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/');
    await page.evaluate(() => window.LittleFaceProcessor.prepare());
    const results = [];
    for (const fixture of ['care', 'wind', 'search']) {
      const measured = await page.evaluate(async name => {
        window.__hairlineCaptures.length = 0;
        const image = new Image(); image.src = '/fixture-' + name + '.png'; await image.decode();
        const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d'); sourceContext.fillStyle = '#888888'; sourceContext.fillRect(0, 0, source.width, source.height); sourceContext.drawImage(image, 0, 0);
        const started = performance.now();
        const analysis = await window.LittleFaceProcessor.analyze(source);
        const result = await window.LittleFaceProcessor.cutout(analysis, 0);
        const elapsedMs = performance.now() - started;
        const inferenceCount = window.__hairlineCaptures.length;
        await window.LittleFaceProcessor.cutout(analysis, 0, { scale: 1.1 });
        const cachedInferenceCount = window.__hairlineCaptures.length;
        const capture = window.__hairlineCaptures.at(-1), { masks, geometry, others, texture } = capture;
        const oldHead = window.__hairlineBefore._internals.makeHeadAlpha(masks, geometry, others);
        const newHead = window.__hairlineAfter._internals.makeHeadAlpha(masks, geometry, others);
        const oldContact = window.__hairlineBefore._internals.headEdgeContact(oldHead, geometry);
        const newContact = window.__hairlineAfter._internals.headEdgeContact(newHead, geometry);
        let changed = 0, unrelatedChanged = 0, decreased = 0, interiorRestored = 0, oldInteriorHoles = 0, newInteriorHoles = 0, maxIncrease = 0;
        let fringeSamples = 0, fringeBefore = 0, fringeAfter = 0;
        for (let i = 0; i < oldHead.alpha.length; i++) {
          const y = Math.floor(i / masks.width), py = geometry.roi.y + (y + 0.5) / masks.height * geometry.roi.height;
          const delta = newHead.alpha[i] - oldHead.alpha[i];
          if (delta) {
            changed++; maxIncrease = Math.max(maxIncrease, delta);
            if (masks.categories[i] !== 1 || py > geometry.chin.y + geometry.height * 0.018) unrelatedChanged++;
            if (delta < 0) decreased++;
          }
          // The boundary between two retained classes must not act like a
          // foreground/background edge. Bound evidence to high head confidence.
          if (masks.categories[i] === 1 && masks.hair[i] > 0.35 && masks.hair[i] < 0.80 && masks.face[i] > 0.15 && masks.hair[i] + masks.face[i] > 0.90 && py < geometry.box.top + geometry.height * 0.36) {
            fringeSamples++; fringeBefore += oldHead.alpha[i]; fringeAfter += newHead.alpha[i];
            if (oldHead.alpha[i] < 235) oldInteriorHoles++;
            if (newHead.alpha[i] < 235) newInteriorHoles++;
            if (oldHead.alpha[i] < 235 && newHead.alpha[i] >= 250) interiorRestored++;
          }
        }
        function masked(head) {
          const mask = document.createElement('canvas'); mask.width = head.width; mask.height = head.height;
          const maskContext = mask.getContext('2d'), pixels = maskContext.createImageData(mask.width, mask.height);
          for (let i = 0; i < head.alpha.length; i++) { pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = head.alpha[i]; }
          maskContext.putImageData(pixels, 0, 0);
          const cut = document.createElement('canvas'); cut.width = texture.width; cut.height = texture.height;
          const ctx = cut.getContext('2d'); ctx.drawImage(texture, 0, 0); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0, cut.width, cut.height);
          return cut;
        }
        const before = masked(oldHead), after = masked(newHead);
        const sourceRgba = texture.getContext('2d').getImageData(0, 0, texture.width, texture.height).data;
        const newRgba = after.getContext('2d').getImageData(0, 0, texture.width, texture.height).data;
        let opaqueCompared = 0, opaqueColorChanges = 0;
        for (let i = 0; i < newRgba.length; i += 4) if (newRgba[i + 3] === 255) {
          opaqueCompared++;
          if (newRgba[i] !== sourceRgba[i] || newRgba[i + 1] !== sourceRgba[i + 1] || newRgba[i + 2] !== sourceRgba[i + 2]) opaqueColorChanges++;
        }
        const sx = texture.width / masks.width, sy = texture.height / masks.height;
        const bounds = { left: newHead.bounds.left * sx, right: (newHead.bounds.right + 1) * sx - 1, top: newHead.bounds.top * sy, bottom: (newHead.bounds.bottom + 1) * sy - 1 };
        const chin = { x: (geometry.chin.x - geometry.roi.x) / geometry.roi.width * texture.width, y: (geometry.chin.y - geometry.roi.y) / geometry.roi.height * texture.height };
        const fit = window.__hairlineAfter._internals.fitHead(bounds, chin, texture.width, texture.height);
        for (const [id, input] of [['before', before], ['after', after]]) {
          const canvas = document.querySelector('#' + id); canvas.width = 540; canvas.height = 570;
          const ctx = canvas.getContext('2d'); ctx.drawImage(input, fit.x, fit.y, input.width * fit.scale, input.height * fit.scale);
        }
        return { fixture: name, faces: analysis.faces.length, elapsedMs, inferenceCount, cachedInferenceCount,
          changed, unrelatedChanged, decreased, maxIncrease, fringeSamples, averageBeforeAlpha: fringeBefore / fringeSamples, averageAfterAlpha: fringeAfter / fringeSamples,
          oldInteriorHoles, newInteriorHoles, interiorRestored, opaqueCompared, opaqueColorChanges,
          oldContact, newContact, oldBounds: oldHead.bounds, newBounds: newHead.bounds,
          beforePng: document.querySelector('#before').toDataURL('image/png'), afterPng: document.querySelector('#after').toDataURL('image/png') };
      }, fixture);
      fs.writeFileSync(path.join(output, 'hairline-' + fixture + '-before.png'), Buffer.from(measured.beforePng.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(output, 'hairline-' + fixture + '-after.png'), Buffer.from(measured.afterPng.split(',')[1], 'base64'));
      await page.screenshot({ path: path.join(output, 'hairline-' + fixture + '-comparison.png') });
      const { beforePng, afterPng, ...details } = measured; results.push(details);
      assert.equal(measured.faces, 1);
      assert.equal(measured.inferenceCount, 1, 'the complete fictional head needs exactly one segmentation');
      assert.equal(measured.inferenceCount, measured.cachedInferenceCount, 'slider changes must reuse segmentation');
      assert.deepEqual(measured.oldContact, measured.newContact, 'same real mask retains identical ROI expansion decision');
      assert.deepEqual(measured.oldBounds, measured.newBounds, 'the complete external head silhouette bounds stay unchanged');
      assert.equal(measured.unrelatedChanged, 0, 'no non-hair or below-jaw pixels may change');
      assert.equal(measured.decreased, 0, 'the repair must not erase source hair');
      assert.ok(measured.fringeSamples > 10, 'real model provides ambiguous hair/face boundary evidence');
      assert.ok(measured.oldInteriorHoles > 10, 'the pre-change alpha contains measurable holes in that boundary');
      assert.equal(measured.newInteriorHoles, 0, 'the repaired alpha keeps the internal boundary opaque');
      assert.equal(measured.opaqueColorChanges, 0, 'fully retained original RGB values are unchanged');
    }
    fs.writeFileSync(path.join(output, 'hairline-results.json'), JSON.stringify(results, null, 2));
    assert.equal(denied.length, 0, 'all image processing is local: ' + denied.join(', '));
    assert.ok(requests.some(request => /\.wasm$/.test(request.path)), 'real WebAssembly runtime was used');
    assert.equal(requests.filter(request => /\.(?:tflite|task)$/.test(request.path)).length, 2, 'real models loaded once');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(results));
    console.log('PASS: real-model hairline masks keep internal hair/face transitions opaque, source RGB and unrelated pixels unchanged, cached inference and local-only processing.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
