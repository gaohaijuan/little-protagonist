'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProcessor, _internals: { loadModelAsset, MODEL_CACHE } } = require('../preview/face-processor.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeCanvas(width, height) {
  return { width, height, getContext: () => ({ drawImage() {} }) };
}

test('preparation reads no photograph and overlapping preparation and analysis load one runtime', async () => {
  const loading = deferred();
  let loads = 0, canvases = 0, detections = 0;
  const processor = createProcessor({
    loadModels: () => { loads++; return loading.promise; },
    createCanvas: (width, height) => { canvases++; return fakeCanvas(width, height); },
    yieldFrame: async () => {}
  });
  const first = processor.prepare(), second = processor.prepare();
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(canvases, 0, 'warmup never decodes, draws or reads a photo');
  const analyzed = assert.rejects(processor.analyze({ width: 600, height: 800 }), { code: 'NO_FACE' });
  assert.equal(detections, 0, 'analysis waits for the in-flight preparation');
  loading.resolve({ face: { detect() { detections++; return { faceLandmarks: [] }; } } });
  await Promise.all([first, second, analyzed]);
  await processor.prepare();
  assert.equal(loads, 1, 'successful warmup is reused for later visits');
  assert.equal(detections, 1);
});

test('a shared background preparation failure retries once on the next photo request', async () => {
  const loading = deferred();
  let loads = 0;
  const processor = createProcessor({
    loadModels: () => ++loads === 1 ? loading.promise : Promise.resolve({ face: { detect: () => ({ faceLandmarks: [] }) } }),
    createCanvas: fakeCanvas,
    yieldFrame: async () => {}
  });
  const first = assert.rejects(processor.prepare(), { code: 'MODEL_LOAD' });
  const second = assert.rejects(processor.prepare(), { code: 'MODEL_LOAD' });
  loading.reject(new Error('network unavailable during background warmup'));
  await Promise.all([first, second]);
  assert.equal(loads, 1);
  const retry = processor.prepare();
  const photo = assert.rejects(processor.analyze({ width: 600, height: 800 }), { code: 'NO_FACE' });
  await Promise.all([retry, photo]);
  assert.equal(loads, 2, 'retry and photo share the replacement runtime');
});

test('finishing an unused preparation performs no inference and exposes no internal runtime', async () => {
  const loading = deferred();
  let inference = 0;
  const processor = createProcessor({
    loadModels: () => loading.promise,
    createCanvas() { throw new Error('warmup must not create a photo canvas'); }
  });
  const prepared = processor.prepare();
  loading.resolve({ face: { detect() { inference++; } }, segmenter: { segment() { inference++; } } });
  assert.equal(await prepared, undefined);
  assert.equal(inference, 0, 'leaving the profile while warming up cannot begin processing a photo');
});

function assetCache() {
  const entries = new Map();
  return { entries, async open(name) {
    assert.equal(name, MODEL_CACHE);
    return { async match(url) { const stored = entries.get(url); return stored && stored.clone(); },
      async put(url, response) { entries.set(url, response.clone()); } };
  } };
}
const smallAsset = { url: '/models/face_landmarker.task', bytes: 4 };

test('a pinned model is fetched once and a fresh loader reuses its browser cache', async () => {
  const cacheStorage = assetCache();
  let requests = 0;
  const fetch = async (url, options) => {
    requests++;
    assert.equal(url, smallAsset.url); assert.equal(options.cache, 'force-cache');
    return new Response(new Uint8Array([1, 2, 3, 4]));
  };
  assert.deepEqual(await loadModelAsset(smallAsset, { fetch, cacheStorage }), new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(await loadModelAsset(smallAsset, { fetch, cacheStorage }), new Uint8Array([1, 2, 3, 4]));
  assert.equal(requests, 1, 'another page session uses the saved public model bytes');
  assert.deepEqual([...cacheStorage.entries.keys()], [smallAsset.url], 'cache only stores the requested model');
});

test('unavailable, unreadable and full model cache never prevent processing', async () => {
  const failures = [null,
    { open() { throw new Error('private browsing'); } },
    { open: async () => ({ match() { throw new Error('cache corrupt'); }, put() {} }) },
    { open: async () => ({ match: async () => null, put() { throw new Error('quota exceeded'); } }) }
  ];
  for (const cacheStorage of failures) {
    let requests = 0;
    const value = await loadModelAsset(smallAsset, { cacheStorage,
      fetch: async () => { requests++; return new Response(new Uint8Array([1, 2, 3, 4])); } });
    assert.equal(value.length, 4); assert.equal(requests, 1);
  }
});

test('truncated cached data is replaced, while failed or incomplete downloads are not cached', async () => {
  const cacheStorage = assetCache();
  cacheStorage.entries.set(smallAsset.url, new Response(new Uint8Array([1, 2])));
  let requests = 0;
  const goodFetch = async () => { requests++; return new Response(new Uint8Array([1, 2, 3, 4])); };
  await loadModelAsset(smallAsset, { cacheStorage, fetch: goodFetch });
  await loadModelAsset(smallAsset, { cacheStorage, fetch: goodFetch });
  assert.equal(requests, 1);
  for (const badResponse of [new Response('failure', { status: 503 }), new Response(new Uint8Array([1, 2]))]) {
    const empty = assetCache();
    await assert.rejects(loadModelAsset(smallAsset, { cacheStorage: empty, fetch: async () => badResponse }));
    assert.equal(empty.entries.size, 0);
  }
});
