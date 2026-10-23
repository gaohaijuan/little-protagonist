(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LittleFaceProcessor = api.createProcessor();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // MediaPipe SelfieMulticlass: 0 background, 1 hair, 2 body skin,
  // 3 face skin, 4 clothes, 5 accessories. Images never leave this browser.
  var OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  var OUTPUT_WIDTH = 540;
  var OUTPUT_HEIGHT = 570;
  var MAX_IMAGE_EDGE = 1600;
  var MAX_TEXTURE_EDGE = 4096;
  var MAX_RETAINED_PIXELS = 16 * 1024 * 1024;
  // Only pinned, public recognition tools are cached here; never photographs.
  // CacheStorage is explicit because private hosting may disable HTTP caching.
  var MODEL_CACHE = 'little-story-models-64184e22-c6748b12';
  var MODEL_ASSETS = [
    { url: '/models/face_landmarker.task', bytes: 3758596 },
    { url: '/models/selfie_multiclass_256x256.tflite', bytes: 16371837 }
  ];

  function failure(code, message, cause) {
    var error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function normalizedAdjustments(value) {
    value = value || {};
    return { scale: clamp(finite(Number(value.scale), 1), 0.75, 1.25),
      x: clamp(finite(Number(value.x), 0), -60, 60),
      y: clamp(finite(Number(value.y), 0), -60, 60) };
  }
  function polygonContains(points, x, y) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var a = points[i], b = points[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function bounds(points) {
    return points.reduce(function (box, point) {
      box.left = Math.min(box.left, point.x); box.right = Math.max(box.right, point.x);
      box.top = Math.min(box.top, point.y); box.bottom = Math.max(box.bottom, point.y);
      return box;
    }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  }
  function faceGeometry(landmarks, width, height) {
    if (!landmarks || landmarks.length < 455) throw failure('BAD_FACE', '这张照片中的脸部不够清楚，请换一张清晰的正面照。');
    var points = landmarks.map(function (p) { return { x: p.x * width, y: p.y * height }; });
    if (points.some(function (p) { return !Number.isFinite(p.x) || !Number.isFinite(p.y); })) throw failure('BAD_FACE', '没有识别清楚脸部，请换一张清晰的正面照。');
    var eyes = [[33,133], [362,263]].map(function (pair) {
      return { x: (points[pair[0]].x + points[pair[1]].x) / 2, y: (points[pair[0]].y + points[pair[1]].y) / 2 };
    }).sort(function (a, b) { return a.x - b.x; });
    var center = { x: (eyes[0].x + eyes[1].x) / 2, y: (eyes[0].y + eyes[1].y) / 2 };
    var angle = Math.atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x);
    var cosine = Math.cos(angle), sine = Math.sin(angle);
    function local(point) { return { x: cosine * (point.x - center.x) + sine * (point.y - center.y), y: -sine * (point.x - center.x) + cosine * (point.y - center.y) }; }
    var polygon = OVAL.map(function (index) { return local(points[index]); });
    var box = bounds(polygon), faceWidth = box.right - box.left, faceHeight = box.bottom - box.top;
    if (faceWidth < 28 || faceHeight < 32 || Math.hypot(eyes[1].x - eyes[0].x, eyes[1].y - eyes[0].y) < 10) {
      throw failure('SMALL_FACE', '照片中的脸太小了，请换一张脸部更清楚的近照。');
    }
    if (Math.abs(angle) > Math.PI / 3) throw failure('SIDEWAYS_FACE', '请先将照片转正，再选择清晰的正面照。');
    return { center: center, angle: angle, cosine: cosine, sine: sine, polygon: polygon,
      box: box, width: faceWidth, height: faceHeight, chin: local(points[152]),
      sourceWidth: width, sourceHeight: height,
      // Children's crowns can extend well beyond the forehead landmarks. Leave
      // extra room initially; connected hair at the ROI boundary triggers a retry.
      roi: { x: box.left - faceWidth * 0.42, y: box.top - faceHeight * 0.95,
        width: faceWidth * 1.84, height: faceHeight * 2.09 } };
  }
  function sourceToFace(geometry, point) {
    return { x: geometry.cosine * (point.x - geometry.center.x) + geometry.sine * (point.y - geometry.center.y),
      y: -geometry.sine * (point.x - geometry.center.x) + geometry.cosine * (point.y - geometry.center.y) };
  }
  function faceToSource(geometry, x, y) {
    return { x: geometry.center.x + geometry.cosine * x - geometry.sine * y,
      y: geometry.center.y + geometry.sine * x + geometry.cosine * y };
  }
  function ownershipScore(geometry, point) {
    var local = sourceToFace(geometry, point);
    var cx = (geometry.box.left + geometry.box.right) / 2;
    var cy = (geometry.box.top + geometry.box.bottom) / 2 - geometry.height * 0.14;
    return Math.pow((local.x - cx) / (geometry.width * 0.6), 2) + Math.pow((local.y - cy) / (geometry.height * 0.8), 2);
  }
  function isOwnedPixel(geometry, otherFaces, x, y) {
    if (!otherFaces.length) return true;
    var point = faceToSource(geometry, x, y), own = ownershipScore(geometry, point);
    for (var i = 0; i < otherFaces.length; i++) {
      // The selected face must be the closest plausible head, including hair above the forehead.
      if (ownershipScore(otherFaces[i], point) < own * 0.9) return false;
    }
    return true;
  }

  // Keep only components anchored inside the selected face. This removes detached
  // hair/skin islands belonging to neighbours without assuming an oval head shape.
  function connectedToFace(alpha, seeds, width, height) {
    var seen = new Uint8Array(alpha.length), queue = new Int32Array(alpha.length), end = 0, start = 0;
    for (var i = 0; i < alpha.length; i++) if (seeds[i] && alpha[i] > 20) { seen[i] = 1; queue[end++] = i; }
    while (start < end) {
      var current = queue[start++], x = current % width, y = Math.floor(current / width);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        var next = current + dy * width + dx;
        if (!seen[next] && alpha[next] > 20) { seen[next] = 1; queue[end++] = next; }
      }
    }
    for (var index = 0; index < alpha.length; index++) if (!seen[index]) alpha[index] = 0;
    return alpha;
  }
  function makeHeadAlpha(masks, geometry, otherFaces) {
    var width = masks.width, height = masks.height, length = width * height;
    var alpha = new Uint8ClampedArray(length), seeds = new Uint8Array(length);
    var roi = geometry.roi, confidentFace = 0, facePixels = 0, faceEvidence = 0;
    if (!masks.hair || !masks.face || !masks.categories || masks.hair.length !== length || masks.face.length !== length || masks.categories.length !== length) {
      throw failure('BAD_MASK', '头像处理没有完成，请重新选择照片。');
    }
    for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
      var index = y * width + x, px = roi.x + (x + 0.5) / width * roi.width, py = roi.y + (y + 0.5) / height * roi.height;
      var sourcePoint = faceToSource(geometry, px, py);
      if (sourcePoint.x < 0 || sourcePoint.y < 0 || sourcePoint.x >= geometry.sourceWidth || sourcePoint.y >= geometry.sourceHeight) continue;
      var inside = polygonContains(geometry.polygon, px, py);
      var probability = clamp(masks.hair[index] + masks.face[index], 0, 1);
      if (inside) { facePixels++; faceEvidence += probability; if (probability > 0.55) confidentFace++; }
      if (!isOwnedPixel(geometry, otherFaces, px, py)) continue;
      var category = masks.categories[index];
      var amount = 0;
      var aboveJaw = py <= geometry.chin.y + geometry.height * 0.018;
      // The jaw only limits face skin, not hair. Long hair can cross the neck and
      // clothing in the original photograph, but those other categories must
      // remain transparent. Require actual hair evidence below the jaw too.
      // At an internal hair/skin boundary the model splits confidence between
      // two retained classes. Use their union so the forehead does not show
      // through as a translucent seam; exterior hair still has low face evidence.
      if (category === 1) amount = clamp(((aboveJaw ? probability : masks.hair[index]) - 0.25) / 0.6, 0, 1);
      if (category === 3 && aboveJaw) {
        amount = clamp((probability - 0.25) / 0.6, 0, 1);
      }
      // Preserve eyes, mouth and glasses inside the identified face mesh. This is
      // intentionally limited to its interior, never to the entire input rectangle.
      if (inside) { amount = Math.max(amount, 1); seeds[index] = 1; }
      if (!inside && category !== 1 && category !== 3) amount = 0;
      alpha[index] = Math.round(255 * amount);
    }
    // Reject a failed segmentation instead of disguising it as a crop of the photo.
    if (facePixels < 20 || confidentFace < facePixels * 0.35 || faceEvidence / facePixels < 0.42) {
      throw failure('UNCLEAR_HEAD', '没有分清头发和脸部，请换一张光线明亮、脸部无遮挡的正面照。');
    }
    connectedToFace(alpha, seeds, width, height);
    var box = { left: width, right: -1, top: height, bottom: -1 }, count = 0;
    for (var n = 0; n < length; n++) if (alpha[n] > 0) {
      count++; var ax = n % width, ay = Math.floor(n / width);
      box.left = Math.min(box.left, ax); box.right = Math.max(box.right, ax);
      box.top = Math.min(box.top, ay); box.bottom = Math.max(box.bottom, ay);
    }
    if (count < length * 0.025 || box.right <= box.left || box.bottom <= box.top) {
      throw failure('EMPTY_HEAD', '没有提取到完整头像，请换一张脸部清楚的照片。');
    }
    // Include the interpolation fringe when the low-resolution mask is enlarged.
    box.left = Math.max(0, box.left - 1); box.top = Math.max(0, box.top - 1);
    box.right = Math.min(width - 1, box.right + 1); box.bottom = Math.min(height - 1, box.bottom + 1);
    return { alpha: alpha, width: width, height: height, bounds: box };
  }

  function headEdgeContact(head, geometry) {
    var contact = { top: false, left: false, right: false, bottom: false, source: false };
    // Resizing the 256px model mask can soften several pixels at the crop edge.
    // Check a narrow guard band rather than requiring contact with pixel zero.
    var bandX = Math.max(2, Math.ceil(head.width * 0.02)), bandY = Math.max(2, Math.ceil(head.height * 0.02));
    var sourceHits = 0, roi = geometry.roi;
    // The first in-photo sample can lie up to one mask pixel from the original
    // border after outside-photo samples are removed, including rotated crops.
    var stepX = roi.width / head.width, stepY = roi.height / head.height;
    var sourceMarginX = Math.abs(geometry.cosine) * stepX + Math.abs(geometry.sine) * stepY;
    var sourceMarginY = Math.abs(geometry.sine) * stepX + Math.abs(geometry.cosine) * stepY;
    for (var i = 0; i < head.alpha.length; i++) if (head.alpha[i] > 32) {
      var x = i % head.width, y = Math.floor(i / head.width);
      if (y < bandY) contact.top = true;
      if (x < bandX) contact.left = true;
      if (x >= head.width - bandX) contact.right = true;
      if (y >= head.height - bandY) contact.bottom = true;
      if (head.alpha[i] > 96) {
        var point = faceToSource(geometry, roi.x + (x + 0.5) / head.width * roi.width,
          roi.y + (y + 0.5) / head.height * roi.height);
        if (point.x <= sourceMarginX || point.y <= sourceMarginY ||
          point.x >= geometry.sourceWidth - sourceMarginX || point.y >= geometry.sourceHeight - sourceMarginY) sourceHits++;
      }
    }
    // Ignore a single faint edge pixel, but never present source-clipped hair
    // (including long hair tips) as complete. There are no pixels to recover.
    contact.source = sourceHits >= 3;
    return contact;
  }
  function expandHeadGeometry(geometry, contact) {
    var roi = geometry.roi, left = contact.left ? geometry.width * 0.4 : 0;
    var right = contact.right ? geometry.width * 0.4 : 0, top = contact.top ? geometry.height * 0.55 : 0;
    // Only connected hair reaching the bottom can request more room. Short hair
    // uses the original crop and a single inference; at most two retries below.
    var bottom = contact.bottom ? geometry.height : 0;
    return Object.assign({}, geometry, { roi: { x: roi.x - left, y: roi.y - top,
      width: roi.width + left + right, height: roi.height + top + bottom } });
  }

  function copySegmentation(result) {
    try {
      var categories = result && result.categoryMask, masks = result && result.confidenceMasks;
      if (!categories || !masks || !masks[1] || !masks[3]) throw failure('BAD_MASK', '头像处理没有完成，请重新选择照片。');
      if (masks[1].width !== categories.width || masks[1].height !== categories.height || masks[3].width !== categories.width || masks[3].height !== categories.height) {
        throw failure('BAD_MASK', '头像处理没有完成，请重新选择照片。');
      }
      // Typed array copies must happen before the synchronous callback returns.
      return { width: categories.width, height: categories.height,
        categories: new Uint8Array(categories.getAsUint8Array()),
        hair: new Float32Array(masks[1].getAsFloat32Array()),
        face: new Float32Array(masks[3].getAsFloat32Array()) };
    } finally {
      if (result && typeof result.close === 'function') result.close();
      else if (result) {
        var resources = (result.confidenceMasks || []).concat(result.categoryMask || []);
        resources.forEach(function (mask) { if (mask && typeof mask.close === 'function') mask.close(); });
      }
    }
  }
  function fitHead(box, chin, width, height, adjustments) {
    var minX = box.left, maxX = box.right + 1, top = box.top;
    var headRadius = Math.max(chin.x - minX, maxX - chin.x, 1), chinHeight = Math.max(1, chin.y - top);
    var baseScale = Math.min((OUTPUT_WIDTH / 2 - 18) / headRadius, (OUTPUT_HEIGHT - 28) / chinHeight);
    var a = normalizedAdjustments(adjustments);
    var padding = 6, bottom = box.bottom + 1;
    // Constrain the complete silhouette, not just the face mesh or chin. A 5%
    // zoom previously moved the crown above y=0 and permanently cut the PNG flat.
    var scale = Math.min(baseScale * a.scale,
      (OUTPUT_WIDTH - padding * 2) / Math.max(1, maxX - minX),
      (OUTPUT_HEIGHT - padding * 2) / Math.max(1, bottom - top));
    var x = clamp(OUTPUT_WIDTH / 2 + a.x - chin.x * scale,
      padding - minX * scale, OUTPUT_WIDTH - padding - maxX * scale);
    var y = clamp(OUTPUT_HEIGHT - 10 + a.y - chin.y * scale,
      padding - top * scale, OUTPUT_HEIGHT - padding - bottom * scale);
    return { scale: scale, x: x, y: y, sourceWidth: width, sourceHeight: height,
      adjustments: { scale: scale / baseScale,
        x: x + chin.x * scale - OUTPUT_WIDTH / 2,
        y: y + chin.y * scale - (OUTPUT_HEIGHT - 10) } };
  }
  function defaultCanvas(width, height) {
    var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
  }
  function yieldFrame() { return new Promise(function (resolve) { setTimeout(resolve, 0); }); }
  async function loadModelAsset(asset, dependencies) {
    dependencies = dependencies || {};
    var fetchAsset = dependencies.fetch || fetch, cache = null;
    var storage = dependencies.cacheStorage;
    if (storage === undefined) {
      // Safari private browsing or storage restrictions must not prevent use.
      try { storage = typeof caches === 'undefined' ? null : caches; } catch (_) { storage = null; }
    }
    try { if (storage) cache = await storage.open(MODEL_CACHE); } catch (_) { cache = null; }
    if (cache) {
      try {
        var stored = await cache.match(asset.url);
        if (stored && stored.ok) {
          var saved = await stored.arrayBuffer();
          if (saved.byteLength === asset.bytes) return new Uint8Array(saved);
        }
      } catch (_) { /* A failed cache read falls back to the network. */ }
    }
    var response = await fetchAsset(asset.url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Model download failed: ' + response.status);
    var copy = cache ? response.clone() : null, buffer = await response.arrayBuffer();
    if (buffer.byteLength !== asset.bytes) throw new Error('Model download was incomplete');
    if (cache) {
      // Saving a 16 MB model must not hold up the photograph being processed.
      try { Promise.resolve(cache.put(asset.url, copy)).catch(function () {}); } catch (_) { /* Storage full: continue. */ }
    }
    return new Uint8Array(buffer);
  }
  async function defaultLoadModels() {
    var face = null, segmenter = null;
    // Start both model downloads together, before loading the runtime. Retain
    // failures as values until consumed so an early failure cannot be unhandled.
    var assets = MODEL_ASSETS.map(function (asset) {
      return loadModelAsset(asset).then(function (data) { return { data: data }; }, function (error) { return { error: error }; });
    });
    async function asset(index) {
      var result = await assets[index];
      if (result.error) throw result.error;
      return result.data;
    }
    try {
      var vision = await import('/vendor/mediapipe/vision_bundle.mjs');
      var files = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
      face = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: await asset(0), delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 8, minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5, outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
      segmenter = await vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetBuffer: await asset(1), delegate: 'CPU' },
        runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: true
      });
      return { face: face, segmenter: segmenter };
    } catch (error) {
      if (face) face.close(); if (segmenter) segmenter.close();
      throw failure('MODEL_LOAD', '头像识别工具加载失败，请检查网络后重试。照片不会上传。', error);
    }
  }

  function createProcessor(options) {
    options = options || {};
    var createCanvas = options.createCanvas || defaultCanvas, pause = options.yieldFrame || yieldFrame;
    var loadModels = options.loadModels || defaultLoadModels;
    var modelPromise = null, queue = Promise.resolve(), records = new WeakMap();
    function report(callback, message) { if (typeof callback === 'function') callback(message); }
    function serial(work) {
      var job = queue.then(work); queue = job.catch(function () {}); return job;
    }
    function models() {
      if (!modelPromise) modelPromise = Promise.resolve().then(loadModels).catch(function (error) {
        modelPromise = null;
        if (error.code) throw error;
        throw failure('MODEL_LOAD', '头像识别工具加载失败，请检查网络后重试。照片不会上传。', error);
      });
      return modelPromise;
    }
    function context(canvas) {
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw failure('NO_CANVAS', '当前浏览器暂时无法处理照片，请用 Safari 或 Chrome 打开。');
      return ctx;
    }
    function normalizedImage(image) {
      var width = image && (image.naturalWidth || image.videoWidth || image.width);
      var height = image && (image.naturalHeight || image.videoHeight || image.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) throw failure('BAD_IMAGE', '照片没有打开成功，请重新选择。');
      var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
      var canvas = createCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      context(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    function imageSize(image) {
      return { width: image.naturalWidth || image.videoWidth || image.width,
        height: image.naturalHeight || image.videoHeight || image.height };
    }
    function retainTexture(image, geometry, pixelBudget) {
      // Keep only the part of the original photograph that any of the two
      // bounded hair retries can need. The caller may dispose the decoded image
      // as soon as analyze resolves; never retain a full-size photograph copy.
      var envelope = expandHeadGeometry(expandHeadGeometry(geometry,
        { top: true, left: true, right: true, bottom: true }),
      { top: true, left: true, right: true, bottom: true }).roi;
      var corners = [[0,0], [1,0], [0,1], [1,1]].map(function (p) {
        return faceToSource(geometry, envelope.x + p[0] * envelope.width, envelope.y + p[1] * envelope.height);
      });
      var box = bounds(corners), size = imageSize(image);
      var x = clamp(Math.floor(box.left), 0, size.width - 1), y = clamp(Math.floor(box.top), 0, size.height - 1);
      var width = Math.max(1, Math.min(size.width, Math.ceil(box.right)) - x);
      var height = Math.max(1, Math.min(size.height, Math.ceil(box.bottom)) - y);
      var scale = Math.min(1, MAX_TEXTURE_EDGE / Math.max(width, height), Math.sqrt(pixelBudget / (width * height)));
      var canvas = createCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
      var ctx = context(canvas); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
      return { canvas: canvas, x: x, y: y, width: width, height: height,
        scale: Math.min(canvas.width / width, canvas.height / height) };
    }
    function roiImage(source, geometry, edge) {
      var roi = geometry.roi, scale = Math.min(1.5, edge / Math.max(roi.width, roi.height));
      var canvas = createCanvas(Math.max(1, Math.round(roi.width * scale)), Math.max(1, Math.round(roi.height * scale)));
      var sx = canvas.width / roi.width, sy = canvas.height / roi.height;
      var ctx = context(canvas), c = geometry.cosine, s = geometry.sine, cx = geometry.center.x, cy = geometry.center.y;
      // Out-of-photo padding is transparent. The segmentation uses a neutral RGB
      // backdrop; padding is explicitly removed from the final alpha below.
      ctx.setTransform(sx * c, -sy * s, sx * s, sy * c,
        sx * (-c * cx - s * cy - roi.x), sy * (s * cx - c * cy - roi.y));
      if (source.canvas) ctx.drawImage(source.canvas, source.x, source.y, source.width, source.height);
      else ctx.drawImage(source, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return canvas;
    }
    async function analyze(image, onProgress) {
      var source;
      try { source = normalizedImage(image); } catch (error) { if (error.code) throw error; throw failure('BAD_IMAGE', '照片没有打开成功，请重新选择。', error); }
      report(onProgress, '正在准备识别工具，首次使用需要稍等…');
      var runtime = await models();
      report(onProgress, '正在照片中寻找脸部…'); await pause();
      var detected;
      try { detected = await serial(function () { return runtime.face.detect(source); }); }
      catch (error) { throw failure('DETECTION_FAILED', '脸部识别没有完成，请换一张清晰的正面照重试。', error); }
      if (!detected || !detected.faceLandmarks || !detected.faceLandmarks.length) throw failure('NO_FACE', '没有找到清晰的脸部，请选择露脸的正面照片。');
      var geometries = [], firstError;
      var originalSize = imageSize(image);
      detected.faceLandmarks.forEach(function (landmarks) {
        try {
          // Keep the existing minimum-size validation on the detection image.
          faceGeometry(landmarks, source.width, source.height);
          geometries.push(faceGeometry(landmarks, originalSize.width, originalSize.height));
        } catch (error) { if (!firstError) firstError = error; }
      });
      if (!geometries.length) throw firstError || failure('NO_FACE', '没有找到清晰的脸部，请选择露脸的正面照片。');
      geometries.sort(function (a, b) { return a.center.x - b.center.x; });
      var textures = geometries.map(function (geometry) { return retainTexture(image, geometry, MAX_RETAINED_PIXELS / geometries.length); });
      var result = { faces: geometries.map(function (geometry, index) {
        var thumbnail = roiImage(textures[index], geometry, 180), dataUrl = thumbnail.toDataURL('image/png');
        thumbnail.width = thumbnail.height = 1;
        return { index: index, thumbnail: dataUrl,
          label: '第 ' + (index + 1) + ' 张脸' };
      }), width: originalSize.width, height: originalSize.height, requiresSelection: geometries.length > 1 };
      source.width = source.height = 1;
      records.set(result, { textures: textures, geometries: geometries, cached: new Map(), onProgress: onProgress, active: true });
      report(onProgress, geometries.length > 1 ? '照片里有多张脸，请选择要使用的脸。' : '已找到脸部，正在准备头像…');
      return result;
    }
    async function prepareHead(record, faceIndex) {
      var geometry = record.geometries[faceIndex], others = record.geometries.filter(function (_, i) { return i !== faceIndex; });
      var texture = record.textures[faceIndex];
      var runtime = await models(), head, cropped;
      report(record.onProgress, '正在保留头发和脸部，去掉背景与衣服…'); await pause();
      for (var attempt = 0; attempt < 3; attempt++) {
        if (!record.active) throw failure('EXPIRED_PHOTO', '请重新选择照片后再生成头像。');
        // Keep ownership/polygon work on a bounded 512px mask, independently
        // of the final photograph texture resolution.
        var segmentInput = roiImage(texture, geometry, 512), masks;
        try {
          masks = await serial(function () {
            if (!record.active) throw failure('EXPIRED_PHOTO', '请重新选择照片后再生成头像。');
            var copied;
            runtime.segmenter.segment(segmentInput, function (result) { copied = copySegmentation(result); });
            if (!copied) throw failure('BAD_MASK', '头像处理没有完成，请重新选择照片。');
            return copied;
          });
        } catch (error) { if (error.code) throw error; throw failure('SEGMENT_FAILED', '头像处理没有完成，请换一张光线明亮的正面照。', error); }
        segmentInput.width = segmentInput.height = 1;
        if (!record.active) throw failure('EXPIRED_PHOTO', '请重新选择照片后再生成头像。');
        head = makeHeadAlpha(masks, geometry, others);
        var contact = headEdgeContact(head, geometry);
        if (contact.source) throw failure('SOURCE_HEAD_CLIPPED', '原照片里的头发已经碰到照片边缘，请换一张头顶、两侧和发梢都拍全并留有空白的照片。');
        if (!contact.top && !contact.left && !contact.right && !contact.bottom) break;
        if (attempt === 2) throw failure('INCOMPLETE_HEAD', '还没有提取到完整头发，请换一张头顶、两侧和发梢都拍全并留有空白的正面照。');
        report(record.onProgress, '正在扩大识别范围，保留完整头发…');
        geometry = expandHeadGeometry(geometry, contact); await pause();
      }
      // Segmentation only supplies alpha. All facial colour and texture come
      // from the retained original ROI, never the 1600px detection image or mask.
      cropped = roiImage(texture, geometry, Math.min(MAX_TEXTURE_EDGE,
        Math.max(1, Math.floor(Math.max(geometry.roi.width, geometry.roi.height) * texture.scale))));
      var maskCanvas = createCanvas(head.width, head.height), maskContext = context(maskCanvas);
      var pixels = maskContext.createImageData(head.width, head.height);
      for (var i = 0; i < head.alpha.length; i++) {
        pixels.data[i * 4] = 255; pixels.data[i * 4 + 1] = 255; pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = head.alpha[i];
      }
      maskContext.putImageData(pixels, 0, 0);
      var cut = cropped, cutContext = context(cut);
      cutContext.globalCompositeOperation = 'destination-in';
      cutContext.imageSmoothingEnabled = true;
      cutContext.drawImage(maskCanvas, 0, 0, cut.width, cut.height);
      cutContext.globalCompositeOperation = 'source-over';
      maskCanvas.width = maskCanvas.height = 1;
      var sx = cut.width / head.width, sy = cut.height / head.height;
      var chin = { x: (geometry.chin.x - geometry.roi.x) / geometry.roi.width * cut.width,
        y: (geometry.chin.y - geometry.roi.y) / geometry.roi.height * cut.height };
      var box = { left: head.bounds.left * sx, right: (head.bounds.right + 1) * sx - 1,
        top: head.bounds.top * sy, bottom: (head.bounds.bottom + 1) * sy - 1 };
      // Face landmarks are separate from the complete hair silhouette. Rendering
      // can keep the same face size even when longer hair needs a larger PNG fit.
      var faceBox = { left: (geometry.box.left - geometry.roi.x) / geometry.roi.width * cut.width,
        right: (geometry.box.right - geometry.roi.x) / geometry.roi.width * cut.width,
        top: (geometry.box.top - geometry.roi.y) / geometry.roi.height * cut.height,
        bottom: (geometry.box.bottom - geometry.roi.y) / geometry.roi.height * cut.height };
      // Successful extraction is cached. Release its larger retry envelope;
      // subsequent adjustments use only the complete transparent head texture.
      texture.canvas.width = texture.canvas.height = 1;
      report(record.onProgress, '已保留真实五官和完整发型，正在自动适配人物…');
      return { canvas: cut, bounds: box, chin: chin, faceBounds: faceBox,
        resolution: { version: 1, provenance: 'original-photo-roi',
          sourceWidth: geometry.sourceWidth, sourceHeight: geometry.sourceHeight,
          originalFacePixels: { width: geometry.width, height: geometry.height },
          retainedFacePixels: { width: faceBox.right - faceBox.left, height: faceBox.bottom - faceBox.top },
          originalHeadPixels: { width: (head.bounds.right + 1 - head.bounds.left) / head.width * geometry.roi.width,
            height: (head.bounds.bottom + 1 - head.bounds.top) / head.height * geometry.roi.height },
          retainedHeadPixels: { width: box.right + 1 - box.left, height: box.bottom + 1 - box.top },
          textureSamplingScale: texture.scale, detectionMaxEdge: MAX_IMAGE_EDGE,
          maskWidth: head.width, maskHeight: head.height } };
    }
    async function cutout(analysis, faceIndex, adjustments) {
      var record = analysis && records.get(analysis);
      if (!record) throw failure('EXPIRED_PHOTO', '请重新选择照片后再生成头像。');
      if (faceIndex === undefined && record.geometries.length === 1) faceIndex = 0;
      if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= record.geometries.length) {
        throw failure('SELECT_FACE', '请先选择照片中要使用的脸。');
      }
      if (!record.cached.has(faceIndex)) record.cached.set(faceIndex, prepareHead(record, faceIndex).catch(function (error) {
        record.cached.delete(faceIndex); throw error;
      }));
      var head = await record.cached.get(faceIndex);
      if (!record.active) throw failure('EXPIRED_PHOTO', '请重新选择照片后再生成头像。');
      var transform = fitHead(head.bounds, head.chin, head.canvas.width, head.canvas.height, adjustments);
      // Preserve the familiar preview layout, but retain up to four times its
      // pixels when the original photo actually supplies that detail. Smaller
      // photos keep the legacy canvas; resolution metadata never counts its
      // interpolated pixels as additional photographic detail.
      var density = Math.max(head.resolution.sourceWidth, head.resolution.sourceHeight) > MAX_IMAGE_EDGE
        ? Math.max(1, Math.min(4, 1 / transform.scale)) : 1;
      var outputWidth = Math.max(OUTPUT_WIDTH, Math.floor(OUTPUT_WIDTH * density));
      density = outputWidth / OUTPUT_WIDTH;
      var output = createCanvas(outputWidth, Math.ceil(OUTPUT_HEIGHT * density)), ctx = context(output);
      transform.scale *= density; transform.x *= density; transform.y *= density;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(head.canvas, transform.x, transform.y, head.canvas.width * transform.scale, head.canvas.height * transform.scale);
      var resolution = Object.assign({}, head.resolution, {
        outputFacePixels: { width: (head.faceBounds.right - head.faceBounds.left) * transform.scale,
          height: (head.faceBounds.bottom - head.faceBounds.top) * transform.scale },
        outputHeadPixels: { width: (head.bounds.right + 1 - head.bounds.left) * transform.scale,
          height: (head.bounds.bottom + 1 - head.bounds.top) * transform.scale },
        outputScale: transform.scale });
      resolution.nativeFacePixels = { width: Math.min(resolution.originalFacePixels.width, resolution.retainedFacePixels.width, resolution.outputFacePixels.width),
        height: Math.min(resolution.originalFacePixels.height, resolution.retainedFacePixels.height, resolution.outputFacePixels.height) };
      resolution.nativeHeadPixels = { width: Math.min(resolution.originalHeadPixels.width, resolution.retainedHeadPixels.width, resolution.outputHeadPixels.width),
        height: Math.min(resolution.originalHeadPixels.height, resolution.retainedHeadPixels.height, resolution.outputHeadPixels.height) };
      return { canvas: output, width: output.width, height: output.height,
        faceIndex: faceIndex, adjustments: transform.adjustments,
        metrics: { resolution: resolution, bounds: { left: head.bounds.left * transform.scale + transform.x,
          top: head.bounds.top * transform.scale + transform.y,
          right: (head.bounds.right + 1) * transform.scale + transform.x,
          bottom: (head.bounds.bottom + 1) * transform.scale + transform.y },
          faceBounds: { left: head.faceBounds.left * transform.scale + transform.x,
            top: head.faceBounds.top * transform.scale + transform.y,
            right: head.faceBounds.right * transform.scale + transform.x,
            bottom: head.faceBounds.bottom * transform.scale + transform.y },
          chin: { x: head.chin.x * transform.scale + transform.x, y: head.chin.y * transform.scale + transform.y } },
        chin: { x: head.chin.x * transform.scale + transform.x, y: head.chin.y * transform.scale + transform.y },
        avatarKind: 'cutout' };
    }
    // Opening the profile can prepare tools while the parent selects a photo.
    // No photograph is needed, read or uploaded during this step.
    function release(analysis) {
      var record = analysis && records.get(analysis);
      if (!record) return;
      record.active = false; records.delete(analysis);
      record.textures.forEach(function (texture) { texture.canvas.width = texture.canvas.height = 1; });
      record.cached.forEach(function (job) { job.then(function (head) { head.canvas.width = head.canvas.height = 1; }, function () {}); });
      record.cached.clear();
    }
    return { analyze: analyze, cutout: cutout, release: release, prepare: function () { return models().then(function () {}); } };
  }
  return { createProcessor: createProcessor, _internals: { faceGeometry: faceGeometry, sourceToFace: sourceToFace,
    faceToSource: faceToSource, makeHeadAlpha: makeHeadAlpha, connectedToFace: connectedToFace,
    headEdgeContact: headEdgeContact, expandHeadGeometry: expandHeadGeometry,
    copySegmentation: copySegmentation, normalizedAdjustments: normalizedAdjustments, fitHead: fitHead,
    loadModelAsset: loadModelAsset, MODEL_CACHE: MODEL_CACHE, MODEL_ASSETS: MODEL_ASSETS, OVAL: OVAL } };
}));
