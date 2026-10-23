(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LittlePhotoInput = api.createReader();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX_BYTES = 20 * 1024 * 1024;
  function failure(code, message) {
    var error = new Error(message); error.code = code; return error;
  }
  function formatOf(bytes) {
    function text(start, length) { return String.fromCharCode.apply(null, bytes.subarray(start, start + length)); }
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every(function (value, i) { return bytes[i] === value; })) return 'image/png';
    if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') return 'image/webp';
    if (bytes.length >= 16 && text(4, 4) === 'ftyp') {
      var boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      if (boxSize < 16) return null;
      var brands = [text(8, 4)];
      for (var i = 16; i + 4 <= Math.min(boxSize, bytes.length); i += 4) brands.push(text(i, 4));
      // AVIF also uses the generic mif1 brand; do not mistake it for HEIC.
      if (brands.some(function (brand) { return brand === 'avif' || brand === 'avis'; })) return null;
      if (brands.some(function (brand) { return /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand); })) return 'image/heic';
    }
    return null;
  }
  function createReader(options) {
    options = options || {};
    var createImage = options.createImage || function () { return new Image(); };
    var createURL = options.createObjectURL || function (blob) { return URL.createObjectURL(blob); };
    var revokeURL = options.revokeObjectURL || function (url) { URL.revokeObjectURL(url); };
    var startTimer = options.setTimeout || setTimeout, stopTimer = options.clearTimeout || clearTimeout;
    var timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs;
    function open(file, request) {
      request = request || {};
      return new Promise(function (resolve, reject) {
        var signal = request.signal, image = null, url = null, timer = null, settled = false, disposed = false;
        function dispose() {
          if (disposed) return; disposed = true;
          if (image) { image.onload = null; image.onerror = null; image.src = ''; }
          if (url) { revokeURL(url); url = null; }
        }
        function cleanup() {
          if (timer !== null) stopTimer(timer);
          if (signal) signal.removeEventListener('abort', abort);
          if (image) { image.onload = null; image.onerror = null; }
        }
        function fail(error) {
          if (settled) return; settled = true; cleanup(); dispose(); reject(error);
        }
        function abort() {
          var error = failure('PHOTO_ABORTED', '已取消读取照片。'); error.name = 'AbortError'; fail(error);
        }
        if (signal && signal.aborted) { abort(); return; }
        if (!file || !Number.isFinite(file.size) || file.size <= 0 || typeof file.slice !== 'function') {
          fail(failure('PHOTO_EMPTY', '这张照片没有内容，请重新选择。')); return;
        }
        if (file.size > MAX_BYTES) {
          fail(failure('PHOTO_TOO_LARGE', '照片有点大，请选一张 20 MB 以内的照片。')); return;
        }
        if (signal) signal.addEventListener('abort', abort, { once: true });
        timer = startTimer(function () { fail(failure('PHOTO_TIMEOUT', '照片读取时间太长，请确认原照片已下载到手机，再重新选择。')); }, timeoutMs);
        Promise.resolve().then(function () { return file.slice(0, 64).arrayBuffer(); }).then(function (header) {
          if (settled) return;
          var format = formatOf(new Uint8Array(header));
          if (!format) { fail(failure('PHOTO_FORMAT', '请选择 JPG、PNG、WebP 或 HEIC 照片。')); return; }
          // Trust the file bytes, not a missing or incorrect picker MIME type.
          // A blob URL avoids another full-size base64 copy of the photograph.
          url = createURL(file.slice(0, file.size, format));
          image = createImage(); image.decoding = 'async';
          image.onload = function () {
            if (settled) return;
            if (!image.naturalWidth || !image.naturalHeight) { image.onerror(); return; }
            settled = true; cleanup(); resolve({ image: image, dispose: dispose });
          };
          image.onerror = function () {
            fail(failure('PHOTO_DECODE', format === 'image/heic'
              ? '当前浏览器打不开这张 HEIC 照片，请换用 JPG 或 PNG 照片。'
              : '这张照片暂时无法打开，请换一张照片。'));
          };
          image.src = url;
        }).catch(function () { fail(failure('PHOTO_READ', '照片没有读取成功，请确认照片已下载到手机，再重新选择。')); });
      });
    }
    return { open: open };
  }
  return { createReader: createReader, _internals: { formatOf: formatOf, MAX_BYTES: MAX_BYTES } };
}));
