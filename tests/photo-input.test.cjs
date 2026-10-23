'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createReader, _internals: core } = require('../preview/photo-input.js');
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
const png = Buffer.from([137,80,78,71,13,10,26,10]);
const webp = Buffer.from('RIFF0000WEBPVP8 ');
function heif(major = 'heic', compatible = 'mif1') {
  const bytes = Buffer.alloc(20); bytes.writeUInt32BE(20); bytes.write('ftyp', 4); bytes.write(major, 8); bytes.write(compatible, 16); return bytes;
}
function harness(mode = 'load') {
  const revoked = [], blobs = [], images = [], timers = new Map();
  let nextTimer = 0;
  const reader = createReader({
    createObjectURL(blob) { blobs.push(blob); return 'blob:test-' + blobs.length; },
    revokeObjectURL(url) { revoked.push(url); },
    createImage() {
      const image = { naturalWidth: 500, naturalHeight: 600, value: '',
        set src(value) { this.value = value; if (value && mode !== 'pending') queueMicrotask(() => mode === 'load' ? this.onload?.() : this.onerror?.()); },
        get src() { return this.value; } };
      images.push(image); return image;
    },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); }
  });
  return { reader, revoked, blobs, images, timers, expire() { [...timers.values()].forEach(callback => callback()); } };
}
async function decodingStarted(h) {
  for (let attempt = 0; attempt < 30 && !h.images.length; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.images.length, 1);
}

test('recognizes photo signatures independently of MIME and rejects non-photo or AVIF containers', () => {
  for (const [bytes, format] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp'], [heif(), 'image/heic'], [heif('mif1', 'heic'), 'image/heic'], [heif('msf1', 'hevc'), 'image/heic']]) {
    assert.equal(core.formatOf(bytes), format);
  }
  for (const bytes of [Buffer.alloc(0), Buffer.from('a picture.jpg'), Buffer.from('<svg></svg>'), heif('avif', 'mif1'), heif('isom', 'mp42')]) assert.equal(core.formatOf(bytes), null);
});

test('valid bytes with missing or wrong MIME decode locally and disposal releases source exactly once', async () => {
  for (const type of ['', 'application/octet-stream', 'image/heic']) {
    const h = harness(), result = await h.reader.open(new Blob([jpeg], { type }));
    assert.equal(h.blobs[0].type, 'image/jpeg');
    assert.equal(result.image.src, 'blob:test-1');
    assert.equal(h.timers.size, 0); assert.equal(h.revoked.length, 0);
    result.dispose(); result.dispose();
    assert.equal(result.image.src, ''); assert.deepEqual(h.revoked, ['blob:test-1']);
  }
});

test('size and unknown contents are rejected before creating an image URL', async () => {
  for (const [file, code] of [[new Blob(), 'PHOTO_EMPTY'], [{ size: core.MAX_BYTES + 1, slice() { throw Error('must not read'); } }, 'PHOTO_TOO_LARGE'], [new Blob(['not a photo'], { type: 'image/jpeg' }), 'PHOTO_FORMAT']]) {
    const h = harness(); await assert.rejects(h.reader.open(file), { code });
    assert.equal(h.blobs.length, 0); assert.equal(h.timers.size, 0);
  }
  const h = harness();
  const atLimit = new Blob([jpeg, new Uint8Array(core.MAX_BYTES - jpeg.length)]);
  const result = await h.reader.open(atLimit); result.dispose();
  assert.equal(h.blobs[0].size, core.MAX_BYTES);
});

test('HEIC decode failure explains browser compatibility and releases its URL', async () => {
  const h = harness('error');
  await assert.rejects(h.reader.open(new Blob([heif()])), { code: 'PHOTO_DECODE', message: '当前浏览器打不开这张 HEIC 照片，请换用 JPG 或 PNG 照片。' });
  assert.deepEqual(h.revoked, ['blob:test-1']); assert.equal(h.images[0].src, ''); assert.equal(h.timers.size, 0);
});

test('ordinary decode failure and image factory failure release any allocated URL', async () => {
  const h = harness('error'); await assert.rejects(h.reader.open(new Blob([png])), { code: 'PHOTO_DECODE' });
  assert.deepEqual(h.revoked, ['blob:test-1']);
  const revoked = [];
  const reader = createReader({ createObjectURL: () => 'blob:failed', revokeObjectURL: url => revoked.push(url), createImage() { throw Error('cannot allocate'); } });
  await assert.rejects(reader.open(new Blob([jpeg])), { code: 'PHOTO_READ' }); assert.deepEqual(revoked, ['blob:failed']);
});

test('abort before reading or during decoding stops processing and releases resources', async () => {
  const before = new AbortController(); before.abort();
  const h1 = harness(); await assert.rejects(h1.reader.open(new Blob([jpeg]), { signal: before.signal }), { name: 'AbortError', code: 'PHOTO_ABORTED' });
  assert.equal(h1.blobs.length, 0);
  const h2 = harness('pending'), during = new AbortController();
  const reading = h2.reader.open(new Blob([jpeg]), { signal: during.signal });
  const rejected = assert.rejects(reading, { name: 'AbortError', code: 'PHOTO_ABORTED' });
  await decodingStarted(h2); during.abort(); await rejected;
  assert.deepEqual(h2.revoked, ['blob:test-1']); assert.equal(h2.images[0].src, ''); assert.equal(h2.timers.size, 0);
});

test('bounded timeout covers both a stalled file read and a stalled native decode', async () => {
  const h1 = harness(); let release;
  const header = new Promise(resolve => { release = resolve; });
  const stalledFile = { size: 100, slice() { return { arrayBuffer: () => header }; } };
  const reading = h1.reader.open(stalledFile), rejected = assert.rejects(reading, { code: 'PHOTO_TIMEOUT' });
  h1.expire(); await rejected; release(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.length));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h1.blobs.length, 0);
  const h2 = harness('pending');
  const decoding = h2.reader.open(new Blob([jpeg])), rejectedDecode = assert.rejects(decoding, { code: 'PHOTO_TIMEOUT' });
  await decodingStarted(h2); h2.expire(); await rejectedDecode;
  assert.deepEqual(h2.revoked, ['blob:test-1']); assert.equal(h2.images[0].src, '');
});

test('read rejection is actionable and removes timeout without allocating an image', async () => {
  const h = harness();
  await assert.rejects(h.reader.open({ size: 100, slice() { return { arrayBuffer: () => Promise.reject(Error('iCloud unavailable')) }; } }), { code: 'PHOTO_READ' });
  assert.equal(h.timers.size, 0); assert.equal(h.blobs.length, 0);
});
