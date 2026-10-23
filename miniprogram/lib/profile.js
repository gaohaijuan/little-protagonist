'use strict';

const DEFAULT_PROFILE = Object.freeze({
  name: '小石头',
  age: 5,
  className: '大班',
  avatarPath: ''
});

const CLASSES = ['小班', '中班', '大班'];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function validationError(field, message) {
  const error = new Error(message);
  error.code = 'INVALID_PROFILE';
  error.field = field;
  return error;
}

function validName(value) {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return false;
  const length = Array.from(value.trim()).length;
  return length >= 1 && length <= 8;
}

function normalizedAge(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !/^[3-6]$/.test(value.trim())) return NaN;
  const age = Number(value);
  return Number.isInteger(age) && age >= 3 && age <= 6 ? age : NaN;
}

function validAvatarPath(value) {
  return typeof value === 'string' && !CONTROL_CHARACTERS.test(value);
}

// Stored data may come from an older version or an interrupted manual edit.
// Recover valid fields independently instead of losing the child's whole profile.
function normalizeProfile(input) {
  const source = input && typeof input === 'object' ? input : {};
  const age = normalizedAge(source.age);
  return {
    name: validName(source.name) ? source.name.trim() : DEFAULT_PROFILE.name,
    age: Number.isNaN(age) ? DEFAULT_PROFILE.age : age,
    className: CLASSES.indexOf(source.className) >= 0 ? source.className : DEFAULT_PROFILE.className,
    avatarPath: validAvatarPath(source.avatarPath) ? source.avatarPath : ''
  };
}

// Validate an editable profile. Unlike normalizeProfile, invalid user input is
// rejected so a save never silently replaces a typed name with the default.
function validateProfile(input) {
  const source = input && typeof input === 'object' ? input : {};
  if (!validName(source.name)) {
    throw validationError('name', '请填写 1 至 8 个字的名字，不要包含换行或控制字符。');
  }
  const age = normalizedAge(source.age);
  if (Number.isNaN(age)) throw validationError('age', '请选择 3 至 6 岁。');
  if (CLASSES.indexOf(source.className) < 0) {
    throw validationError('className', '请选择小班、中班或大班。');
  }
  const avatarPath = source.avatarPath === undefined ? '' : source.avatarPath;
  if (!validAvatarPath(avatarPath)) {
    throw validationError('avatarPath', '头像文件信息无效，请重新选择照片。');
  }
  return { name: source.name.trim(), age, className: source.className, avatarPath };
}

module.exports = { DEFAULT_PROFILE, normalizeProfile, validateProfile };
