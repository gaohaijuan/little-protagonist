'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_PROFILE, normalizeProfile, validateProfile } = require('../miniprogram/lib/profile');
const { STORAGE_KEY, createProfileStore } = require('../miniprogram/services/profile-store');

function fixture(t, initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'little-story-profile-test-'));
  const userDirectory = path.join(root, 'userdata');
  fs.mkdirSync(userDirectory);
  let stored = initial === undefined ? undefined : JSON.parse(JSON.stringify(initial));
  const failures = { copy: false, storage: false, read: false, partialCopy: false };
  const counters = { copies: 0 };
  const copyControl = { beforeCopy: null };
  const api = {
    env: { USER_DATA_PATH: userDirectory },
    getStorageSync(key) {
      assert.equal(key, STORAGE_KEY);
      if (failures.read) throw new Error('storage read failed');
      return stored === undefined ? undefined : JSON.parse(JSON.stringify(stored));
    },
    setStorageSync(key, value) {
      assert.equal(key, STORAGE_KEY);
      if (failures.storage) throw new Error('storage quota exceeded');
      stored = JSON.parse(JSON.stringify(value));
    },
    getFileSystemManager() {
      return {
        accessSync(filePath) { fs.accessSync(filePath); },
        copyFile({ srcPath, destPath, success, fail }) {
          counters.copies += 1;
          if (failures.copy) {
            if (failures.partialCopy) fs.writeFileSync(destPath, 'incomplete');
            queueMicrotask(() => fail(new Error('copy failed')));
            return;
          }
          const performCopy = () => fs.copyFile(srcPath, destPath, (error) => error ? fail(error) : success({}));
          if (copyControl.beforeCopy) Promise.resolve(copyControl.beforeCopy(srcPath)).then(performCopy, fail);
          else performCopy();
        },
        unlink({ filePath, success, fail }) {
          fs.unlink(filePath, (error) => error ? fail(error) : success({}));
        }
      };
    }
  };
  t.after(() => {
    const resolvedRoot = path.resolve(root);
    const temporaryRoot = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolvedRoot), temporaryRoot);
    assert.ok(path.basename(resolvedRoot).startsWith('little-story-profile-test-'));
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  });
  return {
    api, failures, counters, copyControl,
    store: createProfileStore(api),
    snapshot: () => stored === undefined ? undefined : JSON.parse(JSON.stringify(stored)),
    ownedFiles: () => fs.readdirSync(userDirectory).filter((name) => /^hero-avatar-/.test(name)),
    createFile(name, content = 'photo pixels') {
      const filename = path.join(root, name);
      fs.writeFileSync(filename, content);
      return filename;
    },
    userDirectory
  };
}

test('profile names use Unicode code points, trim whitespace, and reject controls', () => {
  const valid = validateProfile({ ...DEFAULT_PROFILE, name: '  小石头  ', age: '4' });
  assert.deepEqual(valid, { ...DEFAULT_PROFILE, name: '小石头', age: 4 });
  const astralName = '𠮷'.repeat(8);
  assert.equal(validateProfile({ ...DEFAULT_PROFILE, name: astralName }).name, astralName);
  for (const name of ['', '    ', '小'.repeat(9), '𠮷'.repeat(9), '小\n石头', '\t小石头', '小\u007f石头']) {
    assert.throws(() => validateProfile({ ...DEFAULT_PROFILE, name }), { code: 'INVALID_PROFILE', field: 'name' });
  }
});

test('only supported ages and classes can be saved', () => {
  for (const age of [2, 7, 3.5, NaN, Infinity, null, true, {}, '03', '3e0']) {
    assert.throws(() => validateProfile({ ...DEFAULT_PROFILE, age }), { field: 'age' });
  }
  for (const className of ['', '一年级', null]) {
    assert.throws(() => validateProfile({ ...DEFAULT_PROFILE, className }), { field: 'className' });
  }
  assert.deepEqual(normalizeProfile({ name: '小豆包', age: 99, className: '中班', avatarPath: 123 }), {
    ...DEFAULT_PROFILE, name: '小豆包', className: '中班'
  });
  assert.deepEqual(normalizeProfile(null), DEFAULT_PROFILE);
});

test('new installations return independent defaults', (t) => {
  const { store } = fixture(t);
  const first = store.loadProfile();
  assert.deepEqual(first, DEFAULT_PROFILE);
  first.name = '不能影响默认值';
  assert.deepEqual(store.loadProfile(), DEFAULT_PROFILE);
});

test('photo is copied to durable storage and survives a new store instance', async (t) => {
  const f = fixture(t);
  const temporary = f.createFile('camera.jpg', 'original photo bytes');
  const saved = await f.store.saveProfile({ name: '  小豆包  ', age: 4, className: '中班' }, { avatarTempPath: temporary });
  assert.equal(saved.name, '小豆包');
  assert.notEqual(saved.avatarPath, temporary);
  assert.equal(fs.readFileSync(saved.avatarPath, 'utf8'), 'original photo bytes');
  fs.unlinkSync(temporary);
  assert.deepEqual(createProfileStore(f.api).loadProfile(), saved);
  const renamed = await f.store.saveProfile({ name: '小月亮', avatarPath: '/untrusted/draft.png' });
  assert.equal(renamed.avatarPath, saved.avatarPath);
  assert.equal(renamed.age, 4);
  assert.equal(f.counters.copies, 1);
});

test('validation failure leaves both stored profile and avatar untouched', async (t) => {
  const f = fixture(t);
  const previous = await f.store.saveProfile({ name: '原来的名字' }, { avatarTempPath: f.createFile('first.png') });
  await assert.rejects(f.store.saveProfile({ name: '\n' }, { avatarTempPath: f.createFile('second.png') }), { field: 'name' });
  assert.deepEqual(f.store.loadProfile(), previous);
  assert.equal(f.counters.copies, 1);
  assert.equal(f.ownedFiles().length, 1);
});

test('copy failure including a partial file rolls back without deleting the old avatar', async (t) => {
  const f = fixture(t);
  const previous = await f.store.saveProfile({ name: '小叶子' }, { avatarTempPath: f.createFile('old.png') });
  f.failures.copy = true;
  f.failures.partialCopy = true;
  await assert.rejects(f.store.saveProfile({ name: '新名字' }, { avatarTempPath: f.createFile('new.png') }), /copy failed/);
  assert.deepEqual(f.snapshot(), previous);
  assert.equal(fs.readFileSync(previous.avatarPath, 'utf8'), 'photo pixels');
  assert.equal(f.ownedFiles().length, 1);
  f.failures.copy = false;
  assert.equal((await f.store.saveProfile({ name: '恢复保存' })).name, '恢复保存');
});

test('storage failure deletes the new copy and preserves the old saved profile', async (t) => {
  const f = fixture(t);
  const previous = await f.store.saveProfile({ name: '小石头' }, { avatarTempPath: f.createFile('old.jpg') });
  f.failures.storage = true;
  await assert.rejects(f.store.saveProfile({ name: '小豆包' }, { avatarTempPath: f.createFile('new.webp') }), /storage quota/);
  assert.deepEqual(f.store.loadProfile(), previous);
  assert.equal(f.ownedFiles().length, 1);
  assert.ok(fs.existsSync(previous.avatarPath));
  await assert.rejects(f.store.saveProfile({}, { removeAvatar: true }), /storage quota/);
  assert.ok(fs.existsSync(previous.avatarPath));
});

test('missing photo recovers the default image while retaining name and other details', async (t) => {
  const f = fixture(t);
  const saved = await f.store.saveProfile({ name: '小星星', age: 3, className: '小班' }, { avatarTempPath: f.createFile('photo.jpg') });
  fs.unlinkSync(saved.avatarPath);
  assert.deepEqual(f.store.loadProfile(), { name: '小星星', age: 3, className: '小班', avatarPath: '' });
});

test('storage read failure does not overwrite a previously saved profile with defaults', async (t) => {
  const f = fixture(t);
  const previous = await f.store.saveProfile({ name: '小月亮', age: 4 });
  f.failures.read = true;
  assert.deepEqual(f.store.loadProfile(), DEFAULT_PROFILE);
  await assert.rejects(f.store.saveProfile({ name: '小石头' }, { avatarTempPath: f.createFile('new.png') }), /storage read failed/);
  assert.deepEqual(f.snapshot(), previous);
  assert.equal(f.counters.copies, 0);
});

test('twenty avatar replacements keep only the active owned file', async (t) => {
  const f = fixture(t);
  const temporary = f.createFile('photo.png');
  let previousPath = '';
  for (let index = 0; index < 20; index += 1) {
    const saved = await f.store.saveProfile({}, { avatarTempPath: temporary });
    assert.equal(f.ownedFiles().length, 1, 'replacement ' + (index + 1));
    assert.ok(fs.existsSync(saved.avatarPath));
    if (previousPath) assert.equal(fs.existsSync(previousPath), false);
    previousPath = saved.avatarPath;
  }
  const result = await f.store.saveProfile({}, { removeAvatar: true });
  assert.equal(result.avatarPath, '');
  assert.equal(f.ownedFiles().length, 0);
  assert.ok(fs.existsSync(temporary));
});

test('removing an external photo never deletes files that this store does not own', async (t) => {
  const f = fixture(t);
  const external = f.createFile('someone-elses-photo.png');
  f.api.setStorageSync(STORAGE_KEY, { ...DEFAULT_PROFILE, avatarPath: external });
  await f.store.saveProfile({}, { removeAvatar: true });
  assert.ok(fs.existsSync(external));
  const unrelated = path.join(f.userDirectory, 'other-feature.png');
  fs.writeFileSync(unrelated, 'unrelated');
  f.api.setStorageSync(STORAGE_KEY, { ...DEFAULT_PROFILE, avatarPath: unrelated });
  await f.store.saveProfile({}, { removeAvatar: true });
  assert.ok(fs.existsSync(unrelated));
});

test('concurrent saves serialize so a following name edit keeps the newly saved photo', async (t) => {
  const f = fixture(t);
  const first = f.store.saveProfile({ name: '小石头' }, { avatarTempPath: f.createFile('first.png') });
  const second = f.store.saveProfile({ name: '小豆包' });
  const [withPhoto, renamed] = await Promise.all([first, second]);
  assert.equal(renamed.name, '小豆包');
  assert.equal(renamed.avatarPath, withPhoto.avatarPath);
  assert.deepEqual(f.store.loadProfile(), renamed);
  assert.equal(f.ownedFiles().length, 1);
});

test('a new page store queues behind an in-flight photo save and removes its old avatar', async (t) => {
  const f = fixture(t);
  const firstPhoto = f.createFile('first.png', 'first photo pixels');
  const secondPhoto = f.createFile('second.png', 'second photo pixels');
  let releaseFirstCopy;
  let signalFirstCopy;
  const firstCopyGate = new Promise((resolve) => { releaseFirstCopy = resolve; });
  const firstCopyStarted = new Promise((resolve) => { signalFirstCopy = resolve; });
  f.copyControl.beforeCopy = (source) => {
    if (source !== firstPhoto) return undefined;
    signalFirstCopy();
    return firstCopyGate;
  };
  const firstSave = f.store.saveProfile({ name: '旧页面' }, { avatarTempPath: firstPhoto });
  await firstCopyStarted;
  // Re-entering creates another store while the previous page's actual file
  // copy is waiting. Its save must wait even though the page instance changed.
  const newPageStore = createProfileStore(f.api);
  const secondSave = newPageStore.saveProfile({ name: '新页面' }, { avatarTempPath: secondPhoto });
  await new Promise((resolve) => setImmediate(resolve));
  const copiesBeforeRelease = f.counters.copies;
  releaseFirstCopy();
  const [first, second] = await Promise.all([firstSave, secondSave]);
  assert.equal(copiesBeforeRelease, 1, 'second page must wait for the first photo copy');
  assert.equal(second.name, '新页面');
  assert.deepEqual(newPageStore.loadProfile(), second);
  assert.equal(fs.readFileSync(second.avatarPath, 'utf8'), 'second photo pixels');
  assert.equal(fs.existsSync(first.avatarPath), false);
  assert.equal(f.ownedFiles().length, 1);
});

test('contradictory photo options fail without changing data', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.store.saveProfile({}, { avatarTempPath: f.createFile('photo.png'), removeAvatar: true }), /不能同时/);
  assert.equal(f.snapshot(), undefined);
  assert.equal(f.ownedFiles().length, 0);
});
