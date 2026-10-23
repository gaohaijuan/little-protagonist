'use strict';
const { validateProfile, normalizeProfile } = require('./profile');
const { normalizeMembers, migrateMembers, participants } = require('./family');
const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const FORMAT = 'little-story-local-backup';
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
function byteLength(text) {
  let size=text.length;
  for(const match of text.matchAll(/[^\x00-\x7f]/gu)){const point=match[0].codePointAt(0);size+=point>0xffff?2:point>0x7ff?2:1;}
  return size;
}

function photoData(value, pngOnly = false) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_BACKUP_BYTES) fail('备份中的照片格式无效，请使用原始备份文件。');
  const header = /^data:image\/(png|jpeg|webp);base64,/.exec(value), body = header ? value.slice(header[0].length) : '';
  if (!body || body.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body)) fail('备份中的照片格式无效，请使用原始备份文件。');
  if (pngOnly && !value.startsWith('data:image/png;base64,')) fail('浏览器备份只支持已保存的PNG头像。');
  return value;
}
function resolution(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > 65536) fail('备份中的头像尺寸无效。');
    return value;
  }
  if (!object(value) || value.version !== 1 || value.provenance !== 'original-photo-roi') fail('备份中的头像清晰度资料格式无效。');
  const result = { version: value.version, provenance: value.provenance };
  const positive = number => Number.isFinite(number) && number > 0 && number <= 65536;
  for (const key of ['sourceWidth','sourceHeight','textureSamplingScale','detectionMaxEdge','maskWidth','maskHeight','outputScale']) {
    if (!positive(value[key])) fail('备份中的头像清晰度数值无效。');
    result[key] = value[key];
  }
  for (const key of ['originalFacePixels','retainedFacePixels','outputFacePixels','nativeFacePixels','originalHeadPixels','retainedHeadPixels','outputHeadPixels','nativeHeadPixels']) {
    if (!object(value[key]) || !positive(value[key].width) || !positive(value[key].height)) fail('备份中的头像原始像素资料无效。');
    result[key] = {width:value[key].width,height:value[key].height};
  }
  // Imported metadata cannot describe interpolation as extra original detail.
  // Keep valid source values exactly; never recalculate or increase print PPI.
  for (const part of ['Face','Head']) for (const dimension of ['width','height']) {
    const limit = Math.min(...['original','retained','output'].map(prefix=>result[prefix+part+'Pixels'][dimension]));
    if (result['native'+part+'Pixels'][dimension] > limit + Math.max(1,limit)*1e-9) fail('备份中的头像原始像素与有效像素不一致。');
  }
  return result;
}
function metrics(value) {
  if (value == null) return null;
  if (!object(value)) fail('备份中的头像位置资料无效。');
  const result = {};
  for (const key of ['bounds','faceBounds','chin']) {
    if (value[key] == null && key === 'faceBounds') continue;
    const fields = key === 'chin' ? ['x','y'] : ['left','top','right','bottom'];
    if (!object(value[key]) || fields.some(field => !Number.isFinite(value[key][field]) || Math.abs(value[key][field]) > 65536)) fail('备份中的头像位置资料无效。');
    result[key] = Object.fromEntries(fields.map(field => [field, value[key][field]]));
    if (key !== 'chin' && (result[key].right <= result[key].left || result[key].bottom <= result[key].top)) fail('备份中的头像尺寸无效。');
  }
  if (value.resolution != null) {
    result.resolution = resolution(value.resolution);
  }
  return result;
}
function readingRows(rows, platform) {
  if (!Array.isArray(rows) || rows.length > 100) fail('备份中的阅读记录无效。');
  const seen = new Set();
  return rows.map(row => {
    if (!object(row) || !validId(row.bookId) || seen.has(row.bookId) || !Number.isFinite(row.updatedAt) || row.updatedAt < 0) fail('备份中的阅读记录无效。');
    seen.add(row.bookId);
    const base = { bookId: row.bookId, completed: row.completed === true, finished: row.finished === true, updatedAt: row.updatedAt };
    if (platform === 'browser') {
      if (!Number.isInteger(row.page) || row.page < 0 || row.page > 500) fail('备份中的阅读页码无效。');
      return { ...base, page: row.page, cover: row.cover === true };
    }
    if (!Number.isInteger(row.totalPages) || row.totalPages < 1 || row.totalPages > 500 || !Number.isInteger(row.pageIndex) || row.pageIndex < 0 || row.pageIndex >= row.totalPages) fail('备份中的阅读页码无效。');
    return { ...base, pageIndex: row.pageIndex, totalPages: row.totalPages };
  });
}
function childProfile(value) {
  if (!object(value)) fail('备份中没有有效的孩子资料。');
  const profile = validateProfile({ name: value.name, age: value.age, className: value.className });
  return profile;
}
function browserRecord(value) {
  if (!object(value) || value.version !== 4 || !Array.isArray(value.members) || value.members.length > 64 || !object(value.avatars)) fail('备份中的家庭资料无效。');
  const members = normalizeMembers(value.members);
  const memberIds = new Set(members.map(member => member.id));
  if (new Set(value.members.map(member=>member?.id)).size!==value.members.length || value.members.some(member => !object(member) || !memberIds.has(member.id) ||
    typeof member.included!=='boolean' || members.find(item=>item.id===member.id)?.role!==member.role) || participants(value.members).length !== value.members.filter(member => member.included === true).length) fail('备份中的家庭成员无效。');
  const avatars = {};
  for (const id of Object.keys(value.avatars)) {
    if (!memberIds.has(id) || ['__proto__','constructor','prototype'].includes(id)) fail('备份中的头像归属无效。');
    const actor = value.avatars[id];
    if (!object(actor)) fail('备份中的头像无效。');
    const data = photoData(actor.data, true);
    if (!data) continue;
    const layout = actor.layout || { scale: 1, x: 0, y: 0 };
    if (!object(layout) || ['scale','x','y'].some(key => !Number.isFinite(layout[key]) || Math.abs(layout[key]) > 1000) || layout.scale <= 0) fail('备份中的头像布局无效。');
    avatars[id] = { data, kind: actor.kind === 'cutout' ? 'cutout' : '', layout: {scale:layout.scale,x:layout.x,y:layout.y}, metrics: metrics(actor.metrics) };
  }
  return { version: 4, profile: childProfile(value.profile), members, avatars };
}
function parseBackup(text, platform) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES || byteLength(text)>MAX_BACKUP_BYTES) fail('备份文件不能超过32MB。');
  let saved;
  try { saved = JSON.parse(text.replace(/^\uFEFF/,'')); } catch (_) { fail('无法读取备份，请选择本程序导出的JSON备份文件。'); }
  if (!object(saved) || saved.format !== FORMAT || saved.version !== 1 || !Number.isFinite(saved.createdAt) || saved.createdAt < 0) fail('不是受支持的小小主角备份文件。');
  if (saved.platform !== platform) fail('浏览器与微信小程序的备份格式不同，请在导出备份的同类版本中恢复。');
  const child = platform === 'browser' ? browserRecord(saved.child) : { profile: childProfile(saved.child?.profile), avatarData: photoData(saved.child?.avatarData) };
  return { format: FORMAT, version: 1, platform, createdAt: saved.createdAt, child, reading: readingRows(saved.reading,platform) };
}
function serialize(value) {
  const text = JSON.stringify(value);
  if (text.length > MAX_BACKUP_BYTES || byteLength(text)>MAX_BACKUP_BYTES) fail('资料超过32MB，当前无法生成备份，请先减少不使用的家庭头像。');
  return text;
}
function createBrowserBackup(record, reading = []) {
  if (!record || ![1,2,3,4].includes(record.version)) fail('请先保存小主角，再导出备份。');
  const avatars = record.version >= 3 ? record.avatars || {} : record.avatarData ? {child:{data:record.avatarData,kind:record.avatarKind || ''}} : {};
  const value = { format: FORMAT, version: 1, platform: 'browser', createdAt: Date.now(),
    child: browserRecord({ version:4,profile:normalizeProfile(record.profile),members:migrateMembers(record),avatars }), reading:readingRows(reading,'browser') };
  return serialize(value);
}
function createNativeBackup(profile, avatarData, reading = []) {
  return serialize({ format:FORMAT,version:1,platform:'wechat',createdAt:Date.now(),child:{profile:childProfile(profile),avatarData:photoData(avatarData)},reading:readingRows(reading,'wechat') });
}
module.exports = { MAX_BACKUP_BYTES, createBrowserBackup, parseBrowserBackup:text=>parseBackup(text,'browser'),
  createNativeBackup, parseNativeBackup:text=>parseBackup(text,'wechat') };
