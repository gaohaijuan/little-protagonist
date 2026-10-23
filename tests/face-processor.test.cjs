'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProcessor, _internals: core } = require('../preview/face-processor.js');

function landmarks(cx = 0.5, cy = 0.48, angle = 0, size = 1) {
  const rotate = (x, y) => ({ x: cx + Math.cos(angle) * x - Math.sin(angle) * y,
    y: cy + Math.sin(angle) * x + Math.cos(angle) * y });
  const result = Array.from({ length: 478 }, () => rotate(0, 0));
  core.OVAL.forEach((index, i) => {
    const theta = i / core.OVAL.length * Math.PI * 2 - Math.PI / 2;
    result[index] = rotate(Math.cos(theta) * 0.13 * size, Math.sin(theta) * 0.17 * size);
  });
  result[33] = rotate(-0.08 * size, -0.025 * size); result[133] = rotate(-0.04 * size, -0.025 * size);
  result[362] = rotate(0.04 * size, -0.025 * size); result[263] = rotate(0.08 * size, -0.025 * size);
  return result;
}
function masksFor(geometry, width = 96, height = 96) {
  const categories = new Uint8Array(width * height), hair = new Float32Array(width * height), face = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = geometry.roi.x + (x + 0.5) / width * geometry.roi.width;
    const py = geometry.roi.y + (y + 0.5) / height * geometry.roi.height;
    const cx = (geometry.box.left + geometry.box.right) / 2;
    const cy = (geometry.box.top + geometry.box.bottom) / 2;
    const i = y * width + x;
    if (Math.abs(px - cx) < geometry.width * 0.54 && py > geometry.box.top - geometry.height * 0.32 && py < cy) {
      categories[i] = 1; hair[i] = 0.98;
    }
    if (Math.pow((px - cx) / (geometry.width * 0.51), 2) + Math.pow((py - cy) / (geometry.height * 0.51), 2) < 1) {
      categories[i] = 3; hair[i] = 0; face[i] = 0.98;
    }
  }
  return { width, height, categories, hair, face };
}
function tallHairMasks(geometry) {
  const masks = masksFor(geometry, 160, 160);
  for (let y = 0; y < masks.height; y++) for (let x = 0; x < masks.width; x++) {
    const px = geometry.roi.x + (x + 0.5) / masks.width * geometry.roi.width;
    const py = geometry.roi.y + (y + 0.5) / masks.height * geometry.roi.height;
    // A curved crown whose real top lies above the first crop, but is present
    // in the original photo. Regenerate this same shape for each expanded ROI.
    const centre = geometry.box.top - geometry.height * 0.45;
    if (Math.pow(px / (geometry.width * 0.65), 2) + Math.pow((py - centre) / (geometry.height * 0.85), 2) < 1) {
      const i = y * masks.width + x;
      masks.categories[i] = 1; masks.hair[i] = 0.99; masks.face[i] = 0;
    }
  }
  return masks;
}
function longHairMasks(geometry, tipDepth = 0.9) {
  const masks = masksFor(geometry, 180, 180);
  for (let y = 0; y < masks.height; y++) for (let x = 0; x < masks.width; x++) {
    const px = geometry.roi.x + (x + 0.5) / masks.width * geometry.roi.width;
    const py = geometry.roi.y + (y + 0.5) / masks.height * geometry.roi.height;
    const i = y * masks.width + x;
    // Two continuous locks join the crown, tapering into rounded ends below the
    // jaw. The neck and shirt have strong class evidence but must not survive.
    if (py > geometry.chin.y && Math.abs(px) < geometry.width * 0.32) {
      masks.categories[i] = py < geometry.chin.y + geometry.height * 0.16 ? 2 : 4;
      masks.face[i] = 0; masks.hair[i] = 0;
    }
    const dx = (Math.abs(px) - geometry.width * 0.43) / (geometry.width * 0.16);
    const end = geometry.chin.y + geometry.height * tipDepth;
    const dy = Math.max(0, py - (end - geometry.height * 0.18)) / (geometry.height * 0.18);
    if (dx * dx + dy * dy < 1 && py > geometry.box.top - geometry.height * 0.2) {
      masks.categories[i] = 1; masks.hair[i] = 0.99; masks.face[i] = 0;
    }
  }
  return masks;
}
function indexAt(masks, geometry, x, y) {
  return Math.floor((y - geometry.roi.y) / geometry.roi.height * masks.height) * masks.width +
    Math.floor((x - geometry.roi.x) / geometry.roi.width * masks.width);
}
function resultFor(masks, closed) {
  const float = values => ({ width: masks.width, height: masks.height, getAsFloat32Array: () => values });
  return { categoryMask: { width: masks.width, height: masks.height, getAsUint8Array: () => masks.categories },
    confidenceMasks: [float(new Float32Array(masks.width * masks.height)), float(masks.hair), null, float(masks.face)],
    close() { closed.count++; } };
}
function fakeCanvas(width, height) {
  const ctx = { drawImage() {}, setTransform() {}, putImageData() {},
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) };
  return { width, height, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,fixture' };
}

test('eye angle correction maps tilted photo back to upright face geometry', () => {
  const original = core.faceGeometry(landmarks(), 1000, 1000);
  const tilted = core.faceGeometry(landmarks(0.5, 0.48, 0.28), 1000, 1000);
  assert.ok(Math.abs(tilted.angle - 0.28) < 1e-9);
  assert.ok(Math.abs(original.width - tilted.width) < 1e-8);
  assert.ok(Math.abs(original.height - tilted.height) < 1e-8);
  const point = { x: -53, y: 110 };
  const source = core.faceToSource(tilted, point.x, point.y);
  const roundTrip = core.sourceToFace(tilted, source);
  assert.ok(Math.abs(roundTrip.x - point.x) < 1e-8);
  assert.ok(Math.abs(roundTrip.y - point.y) < 1e-8);
});

test('head mask keeps face and attached hair while rejecting clothes, body and background', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  const shirt = indexAt(masks, g, 0, g.chin.y + g.height * 0.05);
  const hand = indexAt(masks, g, g.width * 0.75, g.chin.y - g.height * 0.1);
  masks.categories[shirt] = 4; masks.categories[hand] = 2;
  masks.face[shirt] = 0.1; masks.face[hand] = 0.1;
  const result = core.makeHeadAlpha(masks, g, []);
  assert.equal(result.alpha[shirt], 0); assert.equal(result.alpha[hand], 0);
  assert.equal(result.alpha[0], 0);
  assert.ok(result.alpha[indexAt(masks, g, 0, 0)] > 200);
  assert.ok(result.alpha[indexAt(masks, g, 0, g.box.top - g.height * 0.18)] > 200);
});

test('detached hair islands and neighbouring faces cannot become part of selected head', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) {
    const i = y * masks.width + x; masks.categories[i] = 1; masks.hair[i] = 0.99;
  }
  const ordinary = core.makeHeadAlpha(masks, g, []);
  assert.equal(ordinary.alpha[3 * masks.width + 3], 0);
  const neighbour = core.faceGeometry(landmarks(0.72, 0.48), 1000, 1000);
  const withNeighbour = core.makeHeadAlpha(masks, g, [neighbour]);
  let removed = 0;
  for (let i = 0; i < ordinary.alpha.length; i++) if (ordinary.alpha[i] > 0 && withNeighbour.alpha[i] === 0) removed++;
  assert.ok(removed > 0, 'overlapping neighbouring hair/face is excluded by ownership');
});

test('the internal hair/forehead boundary stays opaque when confidence is shared between retained classes', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  // Above the face mesh but inside connected bangs: face landmarks alone cannot
  // fill this seam. Changing the winning retained class must not change alpha.
  const seam = indexAt(masks, g, 0, g.box.top - g.height * 0.1);
  masks.categories[seam] = 1; masks.hair[seam] = 0.52; masks.face[seam] = 0.46;
  assert.equal(core.makeHeadAlpha(masks, g, []).alpha[seam], 255, 'no pale background can leak through the hair/skin transition');
  masks.categories[seam] = 3; masks.hair[seam] = 0.46; masks.face[seam] = 0.52;
  assert.equal(core.makeHeadAlpha(masks, g, []).alpha[seam], 255, 'the face side of the same transition agrees');
});

test('external hair edges remain soft and background or clothing cannot borrow head confidence', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  const edge = indexAt(masks, g, 0, g.box.top - g.height * 0.3);
  masks.categories[edge] = 1; masks.hair[edge] = 0.52; masks.face[edge] = 0;
  const soft = core.makeHeadAlpha(masks, g, []).alpha[edge];
  assert.ok(soft > 20 && soft < 200, 'real transparency against background is not filled solid');
  for (const excluded of [0, 2, 4, 5]) {
    masks.categories[edge] = excluded; masks.hair[edge] = 0.49; masks.face[edge] = 0.49;
    assert.equal(core.makeHeadAlpha(masks, g, []).alpha[edge], 0, 'only retained head classes contribute outside the face mesh');
  }
});

test('edge contact expands a truncated curved crown and retains pixels outside the first ROI', () => {
  const g = core.faceGeometry(landmarks(0.5, 0.65, 0, 0.55), 1000, 1000);
  const original = core.makeHeadAlpha(tallHairMasks(g), g, []);
  const contact = core.headEdgeContact(original, g);
  assert.equal(contact.top, true); assert.equal(contact.source, false);
  assert.equal(original.bounds.top, 0, 'first crop visibly chops the tall crown');
  const expanded = core.expandHeadGeometry(g, contact);
  assert.equal(g.roi.y + g.roi.height, expanded.roi.y + expanded.roi.height, 'expansion does not add clothing below the jaw');
  const masks = tallHairMasks(expanded), complete = core.makeHeadAlpha(masks, expanded, []);
  assert.deepEqual(core.headEdgeContact(complete, expanded), { top: false, left: false, right: false, bottom: false, source: false });
  const recoveredY = g.box.top - g.height * 1.15;
  assert.ok(recoveredY < g.roi.y, 'regression point was outside the previous crop');
  assert.ok(complete.alpha[indexAt(masks, expanded, 0, recoveredY)] > 200, 'original crown pixels are retained after expansion');
  const crownTop = expanded.roi.y + complete.bounds.top / masks.height * expanded.roi.height;
  assert.ok(Math.abs(crownTop - (g.box.top - g.height * 1.3)) < g.height * 0.04);
  assert.equal(complete.alpha[indexAt(masks, expanded, 0, g.chin.y + g.height * 0.1)], 0);
});

test('detached boundary islands do not trigger unnecessary retries', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const i = y * masks.width + x; masks.categories[i] = 1; masks.hair[i] = 0.99;
  }
  const head = core.makeHeadAlpha(masks, g, []);
  assert.deepEqual(core.headEdgeContact(head, g), { top: false, left: false, right: false, bottom: false, source: false });
});

test('attached long hair requests bottom expansion and preserves tips without neck or clothes', () => {
  const g = core.faceGeometry(landmarks(0.5, 0.35, 0, 0.65), 1000, 1000);
  const initial = core.makeHeadAlpha(longHairMasks(g), g, []);
  const contact = core.headEdgeContact(initial, g);
  assert.deepEqual(contact, { top: false, left: false, right: false, bottom: true, source: false });
  const expanded = core.expandHeadGeometry(g, contact);
  assert.equal(expanded.roi.y, g.roi.y);
  assert.equal(expanded.roi.height, g.roi.height + g.height);
  const masks = longHairMasks(expanded), head = core.makeHeadAlpha(masks, expanded, []);
  assert.deepEqual(core.headEdgeContact(head, expanded), { top: false, left: false, right: false, bottom: false, source: false });
  const tip = indexAt(masks, expanded, g.width * 0.43, g.chin.y + g.height * 0.86);
  assert.ok(head.alpha[tip] > 200, 'real attached hair below the previous jaw cutoff remains');
  assert.equal(head.alpha[indexAt(masks, expanded, 0, g.chin.y + g.height * 0.1)], 0, 'neck stays transparent');
  assert.equal(head.alpha[indexAt(masks, expanded, 0, g.chin.y + g.height * 0.6)], 0, 'shirt stays transparent');
});

test('long hair is kept only with hair confidence, connectivity and selected-face ownership', () => {
  const original = core.faceGeometry(landmarks(0.45, 0.35, 0, 0.65), 1000, 1000);
  const g = core.expandHeadGeometry(original, { bottom: true }), masks = longHairMasks(g);
  const neck = indexAt(masks, g, 0, g.chin.y + g.height * 0.1);
  const shirt = indexAt(masks, g, 0, g.chin.y + g.height * 0.5);
  // Neither an erroneously face-labelled neck nor a hair label without hair
  // confidence may borrow face confidence to bypass the jaw boundary.
  masks.categories[neck] = 3; masks.face[neck] = 0.99;
  masks.categories[shirt] = 1; masks.face[shirt] = 0.99; masks.hair[shirt] = 0;
  for (let y = masks.height - 5; y < masks.height; y++) for (let x = 2; x < 7; x++) {
    const i = y * masks.width + x; masks.categories[i] = 1; masks.hair[i] = 0.99;
  }
  const ordinary = core.makeHeadAlpha(masks, g, []);
  assert.equal(ordinary.alpha[neck], 0); assert.equal(ordinary.alpha[shirt], 0);
  assert.equal(ordinary.alpha[(masks.height - 2) * masks.width + 3], 0, 'detached hair is excluded');
  assert.equal(core.headEdgeContact(ordinary, g).bottom, false, 'detached bottom island cannot trigger another inference');
  const neighbour = core.faceGeometry(landmarks(0.63, 0.56, 0, 0.65), 1000, 1000);
  const selected = core.makeHeadAlpha(masks, g, [neighbour]);
  const rightTip = indexAt(masks, g, g.width * 0.43, g.chin.y + g.height * 0.75);
  const leftTip = indexAt(masks, g, -g.width * 0.43, g.chin.y + g.height * 0.75);
  assert.ok(ordinary.alpha[rightTip] > 200);
  assert.equal(selected.alpha[rightTip], 0, 'hair nearer the neighbouring face is excluded even when connected');
  assert.ok(selected.alpha[leftTip] > 200, 'uncontested selected hair remains');
});

test('long-hair extraction retries only when needed and returns face bounds independent of hair fit', async () => {
  const points = landmarks(0.5, 0.35, 0.22, 0.65), original = core.faceGeometry(points, 1000, 1000);
  let g = original, calls = 0; const closed = { count: 0 };
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) {
        calls++; callback(resultFor(longHairMasks(g), closed));
        g = core.expandHeadGeometry(g, { bottom: true });
      } } }) });
  const analysis = await processor.analyze({ width: 1000, height: 1000 });
  const result = await processor.cutout(analysis);
  const adjusted = await processor.cutout(analysis, 0, { scale: 0.75, x: 20, y: -20 });
  assert.equal(calls, 2); assert.equal(closed.count, 2, 'changing placement reuses the complete mask');
  for (const output of [result, adjusted]) {
    const { bounds, faceBounds, chin } = output.metrics;
    for (const value of Object.values(faceBounds)) assert.ok(Number.isFinite(value));
    assert.ok(faceBounds.left > bounds.left && faceBounds.right < bounds.right);
    assert.ok(faceBounds.top > bounds.top && faceBounds.bottom < bounds.bottom);
    assert.ok(Math.abs(faceBounds.bottom - chin.y) < 1e-8, 'mesh chin maps through the same crop and placement');
    assert.ok(Math.abs((faceBounds.left + faceBounds.right) / 2 - chin.x) < 1e-8);
    assert.ok(bounds.bottom - faceBounds.bottom > (faceBounds.bottom - faceBounds.top) * 0.8, 'long hair is measured separately from face size');
    // The texture canvas is rounded to integer dimensions, so allow its subpixel
    // aspect difference while verifying the mesh rather than the hair rectangle.
    assert.ok(Math.abs((faceBounds.right - faceBounds.left) / (faceBounds.bottom - faceBounds.top) - original.width / original.height) < 0.003);
    assert.ok(bounds.top >= 6 - 1e-8 && bounds.bottom <= 564 + 1e-8);
  }
});

test('short hair requires one segmentation and does not expand down toward clothing', async () => {
  const points = landmarks(), g = core.faceGeometry(points, 1000, 1000), closed = { count: 0 };
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) { callback(resultFor(masksFor(g), closed)); } } }) });
  const messages = [], analysis = await processor.analyze({ width: 1000, height: 1000 }, message => messages.push(message));
  const output = await processor.cutout(analysis);
  assert.equal(closed.count, 1);
  assert.equal(messages.some(message => message.includes('扩大')), false);
  assert.ok(output.metrics.faceBounds.bottom > output.metrics.faceBounds.top);
});

test('long-hair tips cut off by the source photo are rejected with an actionable tip-specific message', async () => {
  const points = landmarks(0.5, 0.68, 0, 0.65), closed = { count: 0 };
  let g = core.faceGeometry(points, 1000, 1000);
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) {
        callback(resultFor(longHairMasks(g, 1.35), closed));
        g = core.expandHeadGeometry(g, { bottom: true });
      } } }) });
  const analysis = await processor.analyze({ width: 1000, height: 1000 });
  await assert.rejects(processor.cutout(analysis), error => error.code === 'SOURCE_HEAD_CLIPPED' && error.message.includes('发梢'));
  assert.equal(closed.count, 2, 'stops as soon as source clipping is visible');
});

test('hair that still reaches the lower crop stops after two bounded expansions', async () => {
  const points = landmarks(0.5, 0.3, 0, 0.3), closed = { count: 0 };
  let g = core.faceGeometry(points, 1000, 1000);
  const initialHeight = g.roi.height, faceHeight = g.height, heights = [];
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) {
        heights.push(g.roi.height);
        callback(resultFor(longHairMasks(g, 3.5), closed));
        g = core.expandHeadGeometry(g, { bottom: true });
      } } }) });
  const analysis = await processor.analyze({ width: 1000, height: 1000 });
  await assert.rejects(processor.cutout(analysis), { code: 'INCOMPLETE_HEAD' });
  assert.equal(closed.count, 3, 'unresolved hair cannot create an unbounded inference loop');
  assert.deepEqual(heights, [initialHeight, initialHeight + faceHeight, initialHeight + faceHeight * 2]);
});

test('head extraction retries a boundary crown once, uses bounded masks and caches the result', async () => {
  const points = landmarks(0.5, 0.65, 0, 0.55), first = core.faceGeometry(points, 1000, 1000);
  const expanded = core.expandHeadGeometry(first, { top: true });
  const masks = [tallHairMasks(first), tallHairMasks(expanded)], closed = { count: 0 }, inputs = [];
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) { inputs.push(image); callback(resultFor(masks[inputs.length - 1], closed)); } } }) });
  const messages = [], analysis = await processor.analyze({ width: 1000, height: 1000 }, message => messages.push(message));
  await processor.cutout(analysis);
  await processor.cutout(analysis, 0, { scale: 1.1 });
  assert.equal(inputs.length, 2); assert.equal(closed.count, 2);
  assert.ok(inputs.every(image => image.width <= 512 && image.height <= 512));
  assert.ok(messages.some(message => message.includes('扩大')));
});

test('unresolved boundary segmentation has a fixed retry limit instead of exporting a flat head', async () => {
  const points = landmarks(0.5, 0.7, 0, 0.35), closed = { count: 0 };
  let geometry = core.faceGeometry(points, 1000, 1000), segments = 0;
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) {
        segments++;
        const masks = masksFor(geometry);
        for (let y = 0; y < masks.height; y++) for (let x = 0; x < masks.width; x++) {
          const px = geometry.roi.x + (x + 0.5) / masks.width * geometry.roi.width;
          const py = geometry.roi.y + (y + 0.5) / masks.height * geometry.roi.height;
          if (Math.abs(px) < geometry.width * 0.45 && py < geometry.box.top + geometry.height * 0.4) {
            const i = y * masks.width + x; masks.categories[i] = 1; masks.hair[i] = 0.99; masks.face[i] = 0;
          }
        }
        callback(resultFor(masks, closed));
        geometry = core.expandHeadGeometry(geometry, { top: true });
      } } }) });
  const analysis = await processor.analyze({ width: 1000, height: 1000 });
  await assert.rejects(processor.cutout(analysis), { code: 'INCOMPLETE_HEAD' });
  assert.equal(segments, 3); assert.equal(closed.count, 3);
});

test('a crown already clipped by the original photo is rejected rather than invented', async () => {
  const points = landmarks(0.5, 0.12, 0, 0.55), g = core.faceGeometry(points, 1000, 1000);
  const masks = masksFor(g, 160, 160), closed = { count: 0 };
  const head = core.makeHeadAlpha(masks, g, []);
  assert.equal(core.headEdgeContact(head, g).source, true);
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points] }) },
      segmenter: { segment(image, callback) { callback(resultFor(masks, closed)); } } }) });
  const analysis = await processor.analyze({ width: 1000, height: 1000 });
  await assert.rejects(processor.cutout(analysis), { code: 'SOURCE_HEAD_CLIPPED' });
  assert.equal(closed.count, 1);
});

test('failed segmentation is rejected instead of using the whole source photo', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g);
  masks.hair.fill(0); masks.face.fill(0); masks.categories.fill(0);
  assert.throws(() => core.makeHeadAlpha(masks, g, []), { code: 'UNCLEAR_HEAD' });
});

test('segmentation masks are copied before closing and closed on invalid result', () => {
  const g = core.faceGeometry(landmarks(), 1000, 1000), masks = masksFor(g), closed = { count: 0 };
  const copy = core.copySegmentation(resultFor(masks, closed));
  assert.equal(closed.count, 1);
  const before = copy.face[3000]; masks.face.fill(0);
  assert.equal(copy.face[3000], before); assert.notEqual(copy.face, masks.face);
  assert.throws(() => core.copySegmentation({ close() { closed.count++; } }), { code: 'BAD_MASK' });
  assert.equal(closed.count, 2);
});

test('proportional fit keeps chin on body anchor and validates adjustment bounds', () => {
  const box = { left: 18, right: 488, top: 7, bottom: 483 }, chin = { x: 280, y: 480 };
  const placement = core.fitHead(box, chin, 500, 550);
  assert.equal(chin.x * placement.scale + placement.x, 270);
  assert.equal(chin.y * placement.scale + placement.y, 560);
  assert.ok(placement.x + box.left * placement.scale >= 18 - 0.001);
  assert.ok(placement.y + box.top * placement.scale >= 17);
  const adjusted = core.fitHead(box, chin, 500, 550, { scale: 1.15, x: -30, y: 5 });
  assert.ok(adjusted.x + box.left * adjusted.scale >= 6 - 1e-8);
  assert.ok(adjusted.y + (box.bottom + 1) * adjusted.scale <= 564 + 1e-8);
  assert.equal(chin.x * adjusted.scale + adjusted.x, 270 + adjusted.adjustments.x);
  assert.equal(chin.y * adjusted.scale + adjusted.y, 560 + adjusted.adjustments.y);
  assert.deepEqual(core.normalizedAdjustments({ scale: NaN, x: Infinity, y: -999 }), { scale: 1, x: 0, y: -60 });
});

test('zoom and movement never cut any side of a complete head silhouette', () => {
  const cases = [
    {box:{left:100,right:460,top:18,bottom:600},chin:{x:280,y:586}},
    {box:{left:0,right:700,top:0,bottom:370},chin:{x:310,y:358}},
    {box:{left:40,right:420,top:0,bottom:780},chin:{x:235,y:750}}
  ];
  for (const {box,chin} of cases) for (const scale of [.75,1,1.03,1.05,1.15,1.25]) {
    for (const x of [-60,0,60]) for (const y of [-60,0,60]) {
      const fit=core.fitHead(box,chin,800,900,{scale,x,y});
      assert.ok(fit.x + box.left * fit.scale >= 6 - 1e-8, 'left edge stays inside');
      assert.ok(fit.y + box.top * fit.scale >= 6 - 1e-8, 'crown stays inside');
      assert.ok(fit.x + (box.right+1) * fit.scale <= 534 + 1e-8, 'right edge stays inside');
      assert.ok(fit.y + (box.bottom+1) * fit.scale <= 564 + 1e-8, 'chin and hair tips stay inside');
      assert.ok(Number.isFinite(fit.scale) && fit.scale > 0);
    }
  }
});

test('multiple faces require explicit selection and repeated adjustments share one segmentation', async () => {
  const first = landmarks(0.3), second = landmarks(0.75), g = core.faceGeometry(first, 1000, 1000);
  const masks = masksFor(g), closed = { count: 0 }; let loads = 0, segments = 0;
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => { loads++; return {
      face: { detect: () => ({ faceLandmarks: [second, first] }) },
      segmenter: { segment(image, callback) { segments++; callback(resultFor(masks, closed)); } }
    }; }
  });
  const status = [], analysis = await processor.analyze({ width: 1000, height: 1000 }, text => status.push(text));
  assert.equal(analysis.faces.length, 2); assert.equal(analysis.requiresSelection, true);
  await assert.rejects(processor.cutout(analysis), { code: 'SELECT_FACE' });
  await assert.rejects(processor.cutout(analysis, 2), { code: 'SELECT_FACE' });
  const [a, b] = await Promise.all([processor.cutout(analysis, 0), processor.cutout(analysis, 0, { scale: 1.1, x: 20 })]);
  assert.equal(loads, 1); assert.equal(segments, 1); assert.equal(closed.count, 1);
  assert.equal(a.canvas.width, 540); assert.equal(a.canvas.height, 570); assert.notEqual(a.canvas, b.canvas);
  assert.equal(a.chin.x, 270); assert.equal(b.chin.x, 290); assert.ok(status.some(text => text.includes('衣服')));
  assert.deepEqual(a.metrics.chin, a.chin);
  assert.deepEqual(b.metrics.chin, b.chin);
  assert.ok(a.metrics.bounds.left >= 6 && a.metrics.bounds.right <= 534);
  assert.ok(a.metrics.bounds.top >= 6 && a.metrics.bounds.bottom <= 564);
  assert.ok(a.metrics.bounds.left < a.chin.x && a.metrics.bounds.right > a.chin.x);
  assert.ok(a.metrics.bounds.top < a.chin.y && a.metrics.bounds.bottom >= a.chin.y);
});

test('no face, unreadable source and expired analysis fail with actionable errors', async () => {
  let calls = 0;
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {},
    loadModels: async () => { calls++; return { face: { detect: () => ({ faceLandmarks: [] }) } }; } });
  await assert.rejects(processor.analyze({ width: 0, height: 0 }), { code: 'BAD_IMAGE' });
  assert.equal(calls, 0);
  await assert.rejects(processor.analyze({ width: 600, height: 800 }), { code: 'NO_FACE' });
  await assert.rejects(processor.cutout({ faces: [] }, 0), { code: 'EXPIRED_PHOTO' });
});

test('failed model initialization retries and does not poison subsequent requests', async () => {
  let calls = 0;
  const processor = createProcessor({ createCanvas: fakeCanvas, yieldFrame: async () => {}, loadModels: async () => {
    calls++; if (calls === 1) throw new Error('simulated asset failure');
    return { face: { detect: () => ({ faceLandmarks: [landmarks()] }) } };
  } });
  await assert.rejects(processor.analyze({ width: 1000, height: 1000 }), { code: 'MODEL_LOAD' });
  const result = await processor.analyze({ width: 1000, height: 1000 });
  assert.equal(calls, 2); assert.equal(result.faces.length, 1);
});
