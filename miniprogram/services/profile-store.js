'use strict';

const { normalizeProfile, validateProfile } = require('../lib/profile');
const { readingStorageKey } = require('./reading-store');

const STORAGE_KEY = 'little-story.profile.v1';
// Pages may be unloaded while a committed save is still copying its photo.
// Every store for the same API and directory must share ordering, including
// stores created when the user immediately opens the editor again.
const queuesByApi = new WeakMap();

function createProfileStore(wxApi, options = {}) {
  if (options.ownerId && !/^usr_[a-f0-9]{40}$/.test(options.ownerId)) throw new Error('账号标识无效。');
  const accountVersion = options.accountVersion || 'legacy';
  if (!/^(legacy|[a-f0-9]{32})$/.test(accountVersion)) throw new Error('账号资料空间无效。');
  const storageKey = (options.ownerId ? STORAGE_KEY + ':' + options.ownerId : STORAGE_KEY) + (options.ownerId && accountVersion !== 'legacy' ? ':' + accountVersion : '');
  const cleanupKey = storageKey + ':pending-delete';
  if (!wxApi || !wxApi.env || !wxApi.env.USER_DATA_PATH) {
    throw new Error('本地文件目录尚未准备好。');
  }
  const fs = wxApi.getFileSystemManager();
  const directory = wxApi.env.USER_DATA_PATH.replace(/\/+$/, '');
  let directoryQueues = queuesByApi.get(wxApi);
  if (!directoryQueues) {
    directoryQueues = new Map();
    queuesByApi.set(wxApi, directoryQueues);
  }
  let queue = directoryQueues.get(directory);
  if (!queue) {
    queue = { pending: Promise.resolve(), sequence: 0, versions: new Map() };
    directoryQueues.set(directory, queue);
  }
  const initialVersion = queue.versions.get(storageKey) || 0;

  function isOwnedAvatar(path) {
    if (typeof path !== 'string' || path.indexOf(directory + '/') !== 0) return false;
    const filename = path.slice(directory.length + 1);
    return /^hero-avatar-[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(filename);
  }

  function exists(path) {
    if (!path) return false;
    try {
      fs.accessSync(path);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readProfile(suppressStorageError) {
    let stored;
    try {
      stored = wxApi.getStorageSync(storageKey);
    } catch (error) {
      if (!suppressStorageError) throw error;
      stored = undefined;
    }
    const profile = normalizeProfile(stored);
    if (profile.avatarPath && !exists(profile.avatarPath)) profile.avatarPath = '';
    return profile;
  }

  function loadProfile(readOptions = {}) {
    return readProfile(readOptions.strict !== true);
  }

  function copyFile(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
      fs.copyFile({ srcPath: sourcePath, destPath: destinationPath, success: resolve, fail: reject });
    });
  }

  function removeOwnedAvatar(path) {
    if (!isOwnedAvatar(path)) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        fs.unlink({ filePath: path, success: resolve, fail: resolve });
      } catch (_) {
        resolve();
      }
    });
  }

  function newAvatarPath(tempPath) {
    const match = /\.(png|jpe?g|webp)$/i.exec(tempPath);
    const extension = match ? match[1].toLowerCase() : 'png';
    queue.sequence += 1;
    const id = Date.now().toString(36) + '-' + queue.sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return directory + '/hero-avatar-' + id + '.' + extension;
  }

  async function save(draft, options) {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw new Error('导入确认已变化，请重新确认资料。');
    if (options.removeAvatar && options.avatarTempPath) {
      throw new Error('不能同时选择新照片和移除照片。');
    }
    if (options.avatarTempPath !== undefined &&
        (typeof options.avatarTempPath !== 'string' || !options.avatarTempPath)) {
      throw new Error('请选择有效的头像照片。');
    }
    // A read failure may hide an existing saved profile. Do not overwrite it
    // with defaults while storage is unavailable.
    const previous = readProfile(false);
    if (options.expectedProfile && (JSON.stringify(previous) !== JSON.stringify(options.expectedProfile) ||
        hasProfile() !== options.expectedHasProfile)) {
      throw new Error('当前小主角已变化，请重新确认导入范围。');
    }
    // Only the store decides the persisted photo path. A draft cannot point
    // storage at another application's file or accidentally drop the old photo.
    const profile = validateProfile(Object.assign({}, previous, draft, { avatarPath: previous.avatarPath }));
    let copiedPath = '';
    try {
      if (options.avatarTempPath) {
        copiedPath = newAvatarPath(options.avatarTempPath);
        await copyFile(options.avatarTempPath, copiedPath);
        profile.avatarPath = copiedPath;
      } else if (options.removeAvatar) {
        profile.avatarPath = '';
      }
      if (!isCurrent()) throw new Error('账号已切换，请重新打开小主角设置后保存。');
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw new Error('导入确认已变化，请重新确认资料。');
      wxApi.setStorageSync(storageKey, profile);
    } catch (error) {
      if (copiedPath) await removeOwnedAvatar(copiedPath);
      throw error;
    }
    if (previous.avatarPath !== profile.avatarPath) {
      await removeOwnedAvatar(previous.avatarPath);
    }
    return Object.assign({}, profile);
  }

  function saveProfile(draft, options) {
    const snapshot = Object.assign({}, draft);
    const saveOptions = Object.assign({}, options);
    if (saveOptions.expectedProfile) saveOptions.expectedProfile = Object.assign({}, saveOptions.expectedProfile);
    const result = queue.pending.then(() => save(snapshot, saveOptions));
    // A failed save must not poison the queue for the user's next attempt.
    queue.pending = result.catch(() => undefined);
    return result;
  }

  function isCurrent() { return (queue.versions.get(storageKey) || 0) === initialVersion && (typeof options.isCurrent !== 'function' || options.isCurrent()); }
  function hasProfile() { return !!wxApi.getStorageSync(storageKey); }
  function prepareDeletion() {
    if (!isCurrent()) throw new Error('账号或资料已变化，请重新确认删除范围。');
    let expectedVersion = initialVersion;
    let recordRemoved = false, confirmedProfile = null, paths = null;
    return function removeConfirmedProfile() {
      const result = queue.pending.then(async () => {
        if (!recordRemoved) {
          if ((queue.versions.get(storageKey) || 0) !== expectedVersion) throw new Error('资料已变化，请重新确认删除范围。');
          const previous = normalizeProfile(wxApi.getStorageSync(storageKey)), signature = JSON.stringify(previous);
          if (confirmedProfile !== null && confirmedProfile !== signature) throw new Error('资料已变化，请重新确认删除范围。');
          if (confirmedProfile === null) {
            const journal = wxApi.getStorageSync(cleanupKey);
            paths = Array.from(new Set([previous.avatarPath, ...(Array.isArray(journal) ? journal : [])].filter(isOwnedAvatar)));
            confirmedProfile = signature;
          }
          if (paths.length) wxApi.setStorageSync(cleanupKey, paths);
          wxApi.removeStorageSync(readingStorageKey(options));
          wxApi.removeStorageSync(storageKey);
          recordRemoved = true;
          expectedVersion++;
          queue.versions.set(storageKey, expectedVersion);
        }
        for (const path of paths) {
          try {
            await new Promise((resolve, reject) => fs.unlink({ filePath: path, success: resolve,
              fail: error => /ENOENT|no such file|not exist/i.test(error && (error.errMsg || error.message) || '') ? resolve() : reject(error) }));
          } catch (_) { throw new Error('资料记录已清除，头像文件清理未完成，请点重试清理。'); }
        }
        const journal = wxApi.getStorageSync(cleanupKey);
        if (!journal || JSON.stringify(journal) === JSON.stringify(paths)) wxApi.removeStorageSync(cleanupKey);
        return { deleted: true };
      });
      queue.pending = result.catch(() => undefined);
      return result;
    };
  }
  function deleteProfile() { return prepareDeletion()(); }
  return { loadProfile, saveProfile, hasProfile, prepareDeletion, deleteProfile, isCurrent };
}

function getPendingProfileCleanups(wxApi) {
  if (typeof wxApi.getStorageInfoSync !== 'function') return [];
  const result = [];
  for (const key of wxApi.getStorageInfoSync().keys) {
    if (!key.endsWith(':pending-delete')) continue;
    const base = key.slice(0, -':pending-delete'.length);
    const suffix = base.startsWith(STORAGE_KEY) ? base.slice(STORAGE_KEY.length) : null;
    const match = suffix !== null && /^(?::(usr_[a-f0-9]{40}))?(?::([a-f0-9]{32}))?$/.exec(suffix);
    if (!match || match[2] && !match[1] || wxApi.getStorageSync(base)) continue;
    result.push({ ownerId: match[1] || '', accountVersion: match[2] || 'legacy' });
  }
  return result;
}
async function cleanupDeletedProfiles(wxApi) {
  for (const scope of getPendingProfileCleanups(wxApi)) await createProfileStore(wxApi, scope).deleteProfile();
}
module.exports = { STORAGE_KEY, createProfileStore, getPendingProfileCleanups, cleanupDeletedProfiles };
