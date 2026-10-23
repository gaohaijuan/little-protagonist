'use strict';
// Deterministic source-pixel acceptance plus one local real-model smoke test.
// No photographs or model inputs are sent to a network service.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'preview');
const origin = 'https://portrait-resolution.local';
const source = fs.readFileSync(path.join(preview, 'face-processor.js'), 'utf8');
const types = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm' };

(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    const forbidden = [];
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET' || request.postData()) { forbidden.push(request.url()); return route.abort(); }
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Portrait pixel acceptance</title>' });
      const local = path.resolve(preview, '.' + decodeURIComponent(url.pathname));
      if (!local.startsWith(preview + path.sep) || !fs.existsSync(local)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: types[path.extname(local)] || 'application/octet-stream', body: fs.readFileSync(local) });
    });
    await page.goto(origin);
    await page.addScriptTag({ content: source.replace('else root.LittleFaceProcessor = api.createProcessor();', 'else root.PortraitTestApi = api;') });
    const simulated = await page.evaluate(async () => {
      const api = window.PortraitTestApi, core = api._internals;
      const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
      core.OVAL.forEach((n, i) => { const angle = i / core.OVAL.length * Math.PI * 2 - Math.PI / 2; points[n] = { x: 0.5 + Math.cos(angle) * 0.13, y: 0.5 + Math.sin(angle) * 0.17 }; });
      points[33] = { x: 0.42, y: 0.475 }; points[133] = { x: 0.46, y: 0.475 };
      points[362] = { x: 0.54, y: 0.475 }; points[263] = { x: 0.58, y: 0.475 };
      async function run(size) {
        const input = document.createElement('canvas'); input.width = input.height = size;
        const ctx = input.getContext('2d');
        // Four-pixel bars are destroyed by detection/output downsampling. The blue
        // coordinate ramp additionally checks that colour came from this input.
        const data = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const n = (y * size + x) * 4;
          data.data[n] = data.data[n + 1] = x % 8 < 4 ? 255 : 0;
          data.data[n + 2] = Math.round(y / size * 255); data.data[n + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        const geometry = core.faceGeometry(points, size, size);
        let detectCalls = 0, segmentCalls = 0, maskCloses = 0;
        const detectorEdges = [], segmentEdges = [], canvases = [];
        const processor = api.createProcessor({ yieldFrame: async () => {},
          createCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; canvases.push(c); return c; },
          loadModels: async () => ({ face: { detect(image) { detectCalls++; detectorEdges.push(Math.max(image.width, image.height)); return { faceLandmarks: [points] }; } },
            segmenter: { segment(image, callback) {
              segmentCalls++; segmentEdges.push(Math.max(image.width, image.height));
              const width = 128, height = 128, categories = new Uint8Array(width * height), hair = new Float32Array(width * height), face = new Float32Array(width * height);
              const g = geometry;
              for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const px = g.roi.x + (x + 0.5) / width * g.roi.width;
                const py = g.roi.y + (y + 0.5) / height * g.roi.height;
                const i = y * width + x, cy = (g.box.top + g.box.bottom) / 2;
                if (Math.abs(px) < g.width * 0.54 && py > g.box.top - g.height * 0.32 && py < cy) { categories[i] = 1; hair[i] = 0.99; }
                if ((px / (g.width * 0.51)) ** 2 + ((py - cy) / (g.height * 0.51)) ** 2 < 1) { categories[i] = 3; hair[i] = 0; face[i] = 0.99; }
              }
              const float = values => ({ width, height, getAsFloat32Array: () => values });
              callback({ categoryMask: { width, height, getAsUint8Array: () => categories }, confidenceMasks: [null, float(hair), null, float(face)], close() { maskCloses++; } });
            } } }) });
        const analysis = await processor.analyze(input);
        input.width = input.height = 1; // Exactly the photo-input dispose contract.
        const output = await processor.cutout(analysis);
        const second = await processor.cutout(analysis, 0, { scale: 0.9 });
        const box = output.metrics.faceBounds, pixels = output.canvas.getContext('2d').getImageData(0, 0, output.width, output.height).data;
        let contrast = 0, samples = 0, opaque = 0, blueError = 0;
        for (let y = Math.ceil(box.top + (box.bottom - box.top) * 0.3); y < box.top + (box.bottom - box.top) * 0.6; y++) {
          for (let x = Math.ceil(box.left + (box.right - box.left) * 0.3); x < box.left + (box.right - box.left) * 0.6; x++) {
            const n = (y * output.width + x) * 4; contrast += Math.abs(pixels[n] - pixels[n + 4]); samples++; if (pixels[n + 3] === 255) opaque++;
            const originalY = geometry.box.top + (y + 0.5 - box.top) / (box.bottom - box.top) * geometry.height;
            blueError = Math.max(blueError, Math.abs(pixels[n + 2] - Math.round((geometry.center.y + originalY) / size * 255)));
          }
        }
        const stats = { size, width: output.width, height: output.height, resolution: output.metrics.resolution,
          detectorEdges, segmentEdges, detectCalls, segmentCalls, maskCloses, contrast: contrast / samples, opaqueFraction: opaque / samples, blueError,
          bounds: output.metrics.bounds, faceBounds: box, secondWidth: second.width };
        processor.release(analysis);
        try { await processor.cutout(analysis); } catch (error) { stats.releasedCode = error.code; }
        stats.remainingLargeCanvases = canvases.filter(c => c.width > 1 && c !== output.canvas && c !== second.canvas).map(c => [c.width, c.height]);
        return stats;
      }
      return { large: await run(4096), small: await run(256) };
    });
    const large = simulated.large, small = simulated.small;
    assert.equal(large.detectorEdges[0], 1600); assert.ok(large.segmentEdges.every(edge => edge <= 512));
    assert.ok(large.width > 1000 && large.resolution.nativeFacePixels.height > 473);
    assert.ok(large.contrast > 45, `native 4px bars retained: ${large.contrast}`);
    assert.ok(large.opaqueFraction > 0.99); assert.ok(large.blueError <= 2, `original coordinate colour is intact: ${large.blueError}`);
    for (const item of [large, small]) {
      assert.equal(item.detectCalls, 1); assert.equal(item.segmentCalls, 1); assert.equal(item.maskCloses, 1);
      assert.equal(item.releasedCode, 'EXPIRED_PHOTO'); assert.deepEqual(item.remainingLargeCanvases, []);
      assert.ok(item.bounds.left >= 0 && item.bounds.top >= 0 && item.bounds.right <= item.width && item.bounds.bottom <= item.height);
      assert.ok(item.resolution.nativeFacePixels.height <= item.resolution.originalFacePixels.height);
    }
    assert.equal(small.width, 540);
    assert.ok(small.resolution.nativeFacePixels.height < 90, 'preview interpolation cannot create native print pixels');
    assert.ok(small.resolution.outputFacePixels.height > small.resolution.nativeFacePixels.height * 4);
    const fixture = process.env.FACE_TEST_PORTRAIT || path.join(root, '.local/face-fixtures/portrait.jpg');
    assert.ok(fs.existsSync(fixture), 'a local adult portrait fixture is required for the one real-model regression');
    const real = await page.evaluate(async dataUrl => {
      const image = new Image(); image.src = dataUrl; await image.decode();
      const processor = window.PortraitTestApi.createProcessor();
      const started = performance.now(), analysis = await processor.analyze(image);
      image.src = '';
      const output = await processor.cutout(analysis);
      const pixels = output.canvas.getContext('2d').getImageData(0, 0, output.width, output.height).data;
      let opaque = 0, transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 220) opaque++; if (pixels[i] < 10) transparent++; }
      processor.release(analysis);
      return { faces: analysis.faces.length, width: output.width, height: output.height, opaque, transparent,
        resolution: output.metrics.resolution, elapsedMs: performance.now() - started };
    }, 'data:image/jpeg;base64,' + fs.readFileSync(fixture).toString('base64'));
    assert.equal(real.faces, 1); assert.ok(real.opaque > real.width * real.height * 0.15); assert.ok(real.transparent > real.width * real.height * 0.15);
    assert.deepEqual(forbidden, []);
    console.log(JSON.stringify({ simulatedBrowser: simulated, realLocalModel: real, externalRequests: forbidden.length }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
