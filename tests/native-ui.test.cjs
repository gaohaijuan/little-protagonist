'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stories = require('../miniprogram/lib/stories');

const root = path.join(__dirname, '..', 'miniprogram');
const initialProfile = { name: '小石头', age: 5, className: '大班', avatarPath: '' };

function loadPage(name, storage = new Map()) {
  let page;
  let profile = { ...initialProfile };
  const calls = [];
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 750 }),
    navigateTo: (value) => calls.push({ action: 'navigateTo', ...value }),
    reLaunch: (value) => calls.push({ action: 'reLaunch', ...value }),
    setNavigationBarTitle: (value) => calls.push({ action: 'title', ...value }),
    showToast: (value) => calls.push({ action: 'toast', ...value })
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages', name, name + '.js'), 'utf8'), {
    Page: (definition) => { page = definition; },
    wx,
    require: (moduleName) => {
      if (moduleName.endsWith('/profile-store')) {
        return { createProfileStore: () => ({ loadProfile: () => ({ ...profile }) }) };
      }
      if (moduleName.endsWith('/stories')) return stories;
      if (moduleName.endsWith('/reading-store')) return require('../miniprogram/services/reading-store');
      throw new Error('Unexpected dependency: ' + moduleName);
    }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return { page, calls, storage, wx, setProfile: (next) => { profile = { ...next }; } };
}

function loadArtComponent() {
  let definition;
  let timerId = 0;
  const timers = new Map();
  const queries = [];
  const draws = [];
  const images = [];
  const canvas = {
    createImage() {
      const image = {};
      images.push(image);
      return image;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components', 'story-art', 'story-art.js'), 'utf8'), {
    Component: (value) => { definition = value; },
    require: (moduleName) => {
      assert.equal(moduleName, '../../lib/story-art');
      return { draw: (target, options) => draws.push({ target, options }) };
    },
    wx: { getWindowInfo: () => ({ pixelRatio: 3 }) },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id)
  });
  const component = Object.assign({
    data: { book: 'intro', page: 0, cover: false, framing: '', avatarPath: 'first.png' },
    createSelectorQuery: () => ({
      select: () => ({ fields: () => ({ exec: (callback) => queries.push(callback) }) })
    }),
    triggerEvent() {}
  }, definition.methods);
  function flushTimers() {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
  }
  function flushQuery() {
    assert.ok(queries.length > 0, 'A canvas query should be pending');
    queries.shift()([{ node: canvas, width: 300, height: 210 }]);
  }
  function updateAvatar(avatarPath) {
    component.data.avatarPath = avatarPath;
    definition.observers['book,page,cover,framing,avatarPath'].call(component);
  }
  definition.lifetimes.ready.call(component);
  return { component, definition, draws, images, flushTimers, flushQuery, updateAvatar };
}

test('bookshelf reloads the saved child after returning from profile editing', () => {
  const { page, setProfile, calls } = loadPage('home');
  page.onShow();
  assert.equal(page.data.books[0].title, '你好，我是小石头');
  setProfile({ name: '小豆包', age: 4, className: '中班', avatarPath: 'local://new-photo.png' });
  page.onShow();
  assert.equal(page.data.profile.avatarPath, 'local://new-photo.png');
  assert.equal(page.data.books[0].title, '你好，我是小豆包');
  assert.deepEqual(page.data.books[0].pages[3], ['我四岁了。', '你几岁呢？']);
  assert.deepEqual(page.data.books[0].pages[4], ['我上中班了。']);
  page.editProfile();
  assert.equal(calls.at(-1).url, '/pages/profile/profile');
  page.openBook({ currentTarget: { dataset: { book: 'flower' } } });
  assert.equal(calls.at(-1).url, '/pages/reader/reader?book=flower');
});

test('reader updates the saved child and preserves the current page while rotating', () => {
  const { page, setProfile } = loadPage('reader');
  page.onLoad({ book: 'intro' });
  page.onShow();
  assert.equal(page.data.isLandscape, false);
  assert.equal(page.data.lines[1], '我是小石头。');
  page.nextPage();
  setProfile({ name: '小豆包', age: 4, className: '中班', avatarPath: 'local://new-photo.png' });
  page.onShow();
  assert.equal(page.data.pageIndex, 1);
  assert.equal(page.data.lines[1], '叫小豆包。');
  assert.equal(page.data.profile.avatarPath, 'local://new-photo.png');
  page.onResize({ size: { windowWidth: 750, windowHeight: 340 } });
  assert.equal(page.data.isLandscape, true);
  assert.equal(page.data.pageIndex, 1);
  page.onResize({ size: { windowWidth: 390, windowHeight: 750 } });
  assert.equal(page.data.isLandscape, false);
  assert.equal(page.data.pageIndex, 1);
  assert.equal(page.data.lines[1], '叫小豆包。');
});

test('reader respects both page bounds, finishes once, and can restart and swipe', () => {
  const { page, calls } = loadPage('reader');
  page.onLoad({ book: 'intro' });
  page.onShow();
  page.previousPage();
  assert.equal(page.data.pageIndex, 0);
  const lastPage = page.data.book.pages.length - 1;
  for (let index = 0; index < lastPage; index += 1) page.nextPage();
  assert.equal(page.data.pageIndex, lastPage);
  assert.equal(page.data.finished, false);
  page.nextPage();
  assert.equal(page.data.finished, true);
  page.nextPage();
  page.previousPage();
  assert.equal(page.data.pageIndex, lastPage);
  page.readAgain();
  assert.equal(page.data.pageIndex, 0);
  assert.equal(page.data.finished, false);
  assert.equal(page.data.lines[0], '你好！');
  page.touchStart({ changedTouches: [{ clientX: 230, clientY: 100 }] });
  page.touchEnd({ changedTouches: [{ clientX: 90, clientY: 102 }] });
  assert.equal(page.data.pageIndex, 1);
  page.touchStart({ changedTouches: [{ clientX: 230, clientY: 100 }] });
  page.touchEnd({ changedTouches: [{ clientX: 90, clientY: 260 }] });
  assert.equal(page.data.pageIndex, 1, 'A diagonal/vertical gesture must not turn a page');
  page.goHome();
  assert.equal(calls.at(-1).action, 'reLaunch');
  assert.equal(calls.at(-1).url, '/pages/home/home');
});

test('native reader restores a saved position, retains completion during rereading and recovers from storage errors', () => {
  const first = loadPage('reader'); first.page.onLoad({book:'intro'}); first.page.onShow(); first.page.nextPage(); first.page.nextPage();
  const second = loadPage('reader', first.storage); second.page.onLoad({book:'intro'}); second.page.onShow();
  assert.equal(second.page.data.pageIndex, 2);
  while (!second.page.data.finished) second.page.nextPage();
  let saved = first.storage.get('little-story.reading.v1').records[0];
  assert.equal(saved.completed, true); assert.equal(saved.finished, true);
  second.page.readAgain(); second.page.nextPage();
  const third = loadPage('reader', first.storage); third.page.onLoad({book:'intro'}); third.page.onShow();
  assert.equal(third.page.data.pageIndex, 1); assert.equal(first.storage.get('little-story.reading.v1').records[0].completed, true);
  const save = third.wx.setStorageSync; third.wx.setStorageSync = () => {throw Error('quota');};
  third.page.nextPage(); assert.equal(third.page.data.pageIndex, 2); assert.match(third.page.data.readingNotice,/暂未保存/);
  third.wx.setStorageSync = save; third.page.nextPage(); assert.equal(third.page.data.readingNotice, '');
  assert.equal(first.storage.get('little-story.reading.v1').records[0].pageIndex, 3);
});

test('an older photo load cannot overwrite the current avatar', () => {
  const harness = loadArtComponent();
  harness.flushTimers();
  harness.flushQuery();
  harness.updateAvatar('second.png');
  harness.flushTimers();
  harness.flushQuery();
  assert.equal(harness.images.length, 2);
  assert.equal(harness.draws.length, 2);
  harness.images[1].onload();
  const latest = harness.draws.at(-1);
  assert.equal(latest.options.avatar, harness.images[1]);
  assert.equal(latest.options.pixelRatio, 2);
  harness.images[0].onload();
  assert.equal(harness.draws.length, 3);
  assert.equal(harness.draws.at(-1), latest);
});

test('a detached canvas ignores outstanding photo loads and size queries', () => {
  const harness = loadArtComponent();
  harness.flushTimers();
  harness.flushQuery();
  harness.updateAvatar('second.png');
  harness.flushTimers();
  harness.definition.lifetimes.detached.call(harness.component);
  const drawCount = harness.draws.length;
  harness.images[0].onload();
  harness.flushQuery();
  harness.flushTimers();
  assert.equal(harness.draws.length, drawCount);
  assert.equal(harness.images.length, 1);
});
