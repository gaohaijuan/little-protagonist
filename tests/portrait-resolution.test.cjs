'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProcessor, _internals: core } = require('../preview/face-processor.js');

function points(cx) {
  const result = Array.from({ length: 478 }, () => ({ x: cx, y: 0.45 }));
  core.OVAL.forEach((n, i) => {
    const angle = i / core.OVAL.length * Math.PI * 2 - Math.PI / 2;
    result[n] = { x: cx + Math.cos(angle) * 0.07, y: 0.45 + Math.sin(angle) * 0.12 };
  });
  result[33] = { x: cx - 0.045, y: 0.43 }; result[133] = { x: cx - 0.025, y: 0.43 };
  result[362] = { x: cx + 0.025, y: 0.43 }; result[263] = { x: cx + 0.045, y: 0.43 };
  return result;
}
function canvasFactory(list) {
  return (width, height) => {
    const calls = [], context = { setTransform() {}, drawImage(...args) { calls.push(args); } };
    const canvas = { width, height, calls, initialWidth: width, initialHeight: height,
      getContext: () => context, toDataURL: () => 'data:image/png;base64,test' };
    list.push(canvas); return canvas;
  };
}

test('native ROI is copied before image disposal and multiple faces share a bounded pixel budget', async () => {
  const canvases = [], image = { width: 12000, height: 8000 };
  let detectionSize;
  const processor = createProcessor({ createCanvas: canvasFactory(canvases), yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect(input) { detectionSize = [input.width, input.height]; return { faceLandmarks: [points(0.3), points(0.7)] }; } } }) });
  const analysis = await processor.analyze(image);
  assert.deepEqual(detectionSize, [1600, 1067]);
  assert.deepEqual([analysis.width, analysis.height], [12000, 8000]);
  const retained = canvases.filter(canvas => canvas.calls.some(args => args[0] === image && args.length === 9));
  assert.equal(retained.length, 2, 'one original-photo ROI per selectable face');
  assert.ok(retained.every(canvas => canvas.width <= 4096 && canvas.height <= 4096));
  assert.ok(retained.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0) <= 16 * 1024 * 1024);
  assert.ok(canvases.every(canvas => canvas.initialWidth < image.width && canvas.initialHeight < image.height), 'no full-size original photograph copy');
  image.width = image.height = 0;
  processor.release(analysis); processor.release(analysis);
  assert.ok(retained.every(canvas => canvas.width === 1 && canvas.height === 1));
  await assert.rejects(processor.cutout(analysis, 0), { code: 'EXPIRED_PHOTO' });
});

test('releasing analysis while head preparation is pending prevents stale inference', async () => {
  const canvases = [];
  let segments = 0;
  const processor = createProcessor({ createCanvas: canvasFactory(canvases), yieldFrame: async () => {},
    loadModels: async () => ({ face: { detect: () => ({ faceLandmarks: [points(0.5)] }) },
      segmenter: { segment() { segments++; throw new Error('cancelled photograph must never reach inference'); } } }) });
  const analysis = await processor.analyze({ width: 4000, height: 3000 });
  const pending = processor.cutout(analysis);
  processor.release(analysis);
  await assert.rejects(pending, { code: 'EXPIRED_PHOTO' });
  assert.equal(segments, 0);
  assert.ok(canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});
