'use strict';

const READING_KEY = 'little-story.reading.v1';
const BOOK_ID = /^[a-z][a-z0-9-]{0,63}$/;

function readingStorageKey(options = {}) {
  const owner = options.ownerId || '', version = options.accountVersion || 'legacy';
  if (owner && !/^usr_[a-f0-9]{40}$/.test(owner)) throw Error('账号标识无效。');
  if (!/^(legacy|[a-f0-9]{32})$/.test(version)) throw Error('账号资料空间无效。');
  return READING_KEY + (owner ? ':' + owner + (version === 'legacy' ? '' : ':' + version) : '');
}

function normalizeReadingRecords(saved) {
  const result = Object.create(null);
  if (!saved || saved.version !== 1 || !Array.isArray(saved.records)) return result;
  for (const entry of saved.records.slice(0, 100)) {
    if (!entry || typeof entry.bookId !== 'string' || !BOOK_ID.test(entry.bookId) || !Number.isInteger(entry.totalPages) || entry.totalPages < 1 || entry.totalPages > 500 ||
      !Number.isInteger(entry.pageIndex) || entry.pageIndex < 0 || entry.pageIndex >= entry.totalPages ||
      !Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) continue;
    result[entry.bookId] = { bookId: entry.bookId, pageIndex: entry.pageIndex, totalPages: entry.totalPages,
      completed: entry.completed === true, finished: entry.finished === true, updatedAt: entry.updatedAt };
  }
  return result;
}

function createReadingStore(wxApi, options = {}) {
  const key = readingStorageKey(options);
  function load() { return normalizeReadingRecords(wxApi.getStorageSync(key)); }
  function get(bookId) { return load()[bookId] || null; }
  function list() { return Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt || a.bookId.localeCompare(b.bookId)); }
  function record(bookId, pageIndex, totalPages, completed = false) {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw Error('账号或孩子资料已变化，阅读记录未保存。');
    if (typeof bookId !== 'string' || !BOOK_ID.test(bookId) || !Number.isInteger(totalPages) || totalPages < 1 || totalPages > 500 ||
      !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) throw Error('阅读页码无效。');
    const entries = load();
    const entry = { bookId, pageIndex, totalPages, completed: completed === true || !!entries[bookId]?.completed, finished: completed === true, updatedAt: Date.now() };
    entries[bookId] = entry;
    const records = Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
    wxApi.setStorageSync(key, { version: 1, records });
    return entry;
  }
  function replace(records, expectedRecords) {
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) throw Error('账号或孩子资料已变化，阅读记录未恢复。');
    const normalized = normalizeReadingRecords({version:1,records});
    if (!Array.isArray(records) || records.length > 100 || Object.keys(normalized).length !== records.length) throw Error('备份阅读记录无效。');
    if (expectedRecords && JSON.stringify(list()) !== JSON.stringify(expectedRecords)) throw Error('阅读记录已变化，请重新选择备份并确认。');
    wxApi.setStorageSync(key, {version:1,records:Object.values(normalized)});
  }
  return { get, list, record, replace };
}

module.exports = { READING_KEY, readingStorageKey, normalizeReadingRecords, createReadingStore };
