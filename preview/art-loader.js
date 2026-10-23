(function (scope) {
  'use strict';
  const base = './art/flower/';
  const filenames = { care: 'care.webp', wind: 'wind.webp', search: 'search.webp', careHead: 'care-head.webp', windHead: 'wind-head.webp', searchHead: 'search-head.webp', petal: 'petal.webp' };
  const assets = {}, requests = new Map(), scenes = new Map();
  let manifest = null, manifestRequest = null;
  const sceneFor = (page, cover) => cover || Number(page) < 2 ? 'care' : Number(page) < 5 ? 'wind' : 'search';
  function image(name) {
    if (assets[name]) return Promise.resolve(assets[name]);
    if (requests.has(name)) return requests.get(name);
    const request = new Promise((resolve, reject) => {
      const result = new Image();
      const timer = setTimeout(() => finish(new Error('插画加载超时。')), 20000);
      function finish(error) {
        clearTimeout(timer); result.onload = null; result.onerror = null;
        if (error) { result.src = ''; reject(error); }
        else { assets[name] = result; resolve(result); }
      }
      result.onload = () => finish(result.naturalWidth && result.naturalHeight ? null : new Error('插画尺寸无效。'));
      result.onerror = () => finish(new Error('插画暂时无法打开。'));
      result.src = base + filenames[name];
    });
    requests.set(name, request);
    request.catch(() => requests.delete(name));
    return request;
  }
  function metadata() {
    if (manifest) return Promise.resolve(manifest);
    if (manifestRequest) return manifestRequest;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    // Revalidate the small placement manifest on a new visit so cached images
    // can be reused without keeping obsolete collar coordinates after a fix.
    manifestRequest = fetch(base + 'manifest.json', { signal: controller.signal, cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error('插画资料暂时无法打开。');
      return response.json();
    }).then(result => {
      if (!result || typeof result !== 'object' || !result.scenes) throw new Error('插画资料不完整。');
      manifest = result; return manifest;
    }).catch(error => { manifestRequest = null; throw error; }).finally(() => clearTimeout(timer));
    return manifestRequest;
  }
  function ensure(page, options = {}) {
    const scene = sceneFor(page, options.cover), current = scenes.get(scene);
    if (current) return current.promise;
    const entry = { status: 'loading', promise: null };
    // Only the visible scene is requested. Default heads are small reusable
    // assets; waiting for all layers prevents a headless first paint.
    const layers = [metadata(), image(scene), image(scene + 'Head')];
    if (scene === 'wind') layers.push(image('petal'));
    entry.promise = Promise.all(layers).then(() => {
      entry.status = 'ready'; return { assets, manifest };
    }).catch(error => { entry.status = 'error'; throw error; });
    scenes.set(scene, entry);
    return entry.promise;
  }
  scope.LittleArtLoader = {
    ensure,
    status: (page, options = {}) => scenes.get(sceneFor(page, options.cover))?.status || 'idle',
    peek: (page, options = {}) => scenes.get(sceneFor(page, options.cover))?.status === 'ready' ? { assets, manifest } : null,
    retry() { for (const [key, entry] of scenes) if (entry.status === 'error') scenes.delete(key); }
  };
})(window);
