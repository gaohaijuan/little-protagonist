'use strict';

const MAX_MEMBERS = 12;
const ROLE_OPTIONS = Object.freeze([
  { id: 'child', label: '小主角', adult: false },
  { id: 'dad', label: '爸爸', adult: true },
  { id: 'mom', label: '妈妈', adult: true },
  { id: 'grandpa', label: '爷爷', adult: true },
  { id: 'grandma', label: '奶奶', adult: true },
  { id: 'olderBrother', label: '哥哥', adult: false },
  { id: 'youngerBrother', label: '弟弟', adult: false },
  { id: 'olderSister', label: '姐姐', adult: false },
  { id: 'youngerSister', label: '妹妹', adult: false }
].map((role) => Object.freeze(role)));
const SIBLING_ROLES = ['olderBrother', 'youngerBrother', 'olderSister', 'youngerSister'];
const PHOTO_ROLES = ['child'].concat(SIBLING_ROLES);
const BASE_IDS = ROLE_OPTIONS.map((role) => role.id);
const EXTRA_ID = /^member-[a-z0-9][a-z0-9_-]{0,63}$/;
let nextMemberSequence = 0;

function canUsePhoto(role) {
  return PHOTO_ROLES.includes(role);
}

function defaultMembers() {
  return ROLE_OPTIONS.map((role) => ({
    id: role.id, role: role.id,
    included: role.id === 'child' || role.id === 'dad' || role.id === 'mom'
  }));
}

// Every base ID remains available for editing its saved photo, even when that
// person is not in this book. Extra sibling IDs are never renumbered on removal.
function normalizeMembers(input) {
  if (!Array.isArray(input)) return defaultMembers();
  const byId = Object.create(null);
  const extras = [];
  input.forEach((member) => {
    if (!member || typeof member !== 'object' || typeof member.id !== 'string' || byId[member.id]) return;
    if (BASE_IDS.indexOf(member.id) >= 0) {
      byId[member.id] = { id: member.id, role: member.id, included: member.included === true };
    } else if (EXTRA_ID.test(member.id) && SIBLING_ROLES.indexOf(member.role) >= 0) {
      const extra = { id: member.id, role: member.role, included: member.included === true };
      byId[member.id] = extra;
      extras.push(extra);
    }
  });
  const normalized = ROLE_OPTIONS.map((role) => byId[role.id] || { id: role.id, role: role.id, included: false }).concat(extras);
  normalized[0].included = true;
  let included = 0;
  normalized.forEach((member) => {
    if (!member.included) return;
    included += 1;
    if (included > MAX_MEMBERS) member.included = false;
  });
  return normalized;
}

function migrateMembers(record) {
  if (!record || typeof record !== 'object') return defaultMembers();
  if (Array.isArray(record.members)) return normalizeMembers(record.members);
  if (![1, 2, 3].includes(record.version)) return defaultMembers();
  const avatars = record.avatars && typeof record.avatars === 'object' ? record.avatars : {};
  return normalizeMembers(ROLE_OPTIONS.map((role) => ({
    id: role.id,
    role: role.id,
    included: ['child', 'dad', 'mom', 'grandpa', 'grandma'].includes(role.id) ||
      (SIBLING_ROLES.includes(role.id) && !!avatars[role.id]?.data)
  })));
}

function participants(members) {
  return normalizeMembers(members).filter((member) => member.included);
}

function roleLabel(role) {
  const option = ROLE_OPTIONS.find((entry) => entry.id === role);
  return option ? option.label : '家人';
}

function memberLabel(member, members) {
  if (!member || typeof member !== 'object') return '家人';
  const label = roleLabel(member.role);
  const sameRole = normalizeMembers(members).filter((entry) => entry.role === member.role);
  const index = sameRole.findIndex((entry) => entry.id === member.id);
  return sameRole.length > 1 && index >= 0 ? label + ' ' + (index + 1) : label;
}

function createSibling(members, role) {
  if (!SIBLING_ROLES.includes(role)) {
    const error = new Error('请选择哥哥、姐姐、弟弟或妹妹。');
    error.code = 'INVALID_SIBLING_ROLE';
    throw error;
  }
  const normalized = normalizeMembers(members);
  if (participants(normalized).length >= MAX_MEMBERS) {
    const error = new Error('一本书最多有 ' + MAX_MEMBERS + ' 位家人出场。');
    error.code = 'MAX_FAMILY_MEMBERS';
    throw error;
  }
  let id;
  do {
    nextMemberSequence += 1;
    id = 'member-' + Date.now().toString(36) + '-' + nextMemberSequence.toString(36);
  } while (normalized.some((member) => member.id === id));
  return normalized.concat({ id, role, included: true });
}

function numberWord(number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (!Number.isInteger(number) || number < 0 || number > MAX_MEMBERS) {
    throw new RangeError('家庭人数必须是 0 至 ' + MAX_MEMBERS + ' 的整数。');
  }
  if (number < 10) return digits[number];
  return '十' + (number === 10 ? '' : digits[number - 10]);
}

function familyBook(profile, members) {
  const selected = participants(members);
  const ids = selected.map((member) => member.id);
  const others = selected.filter((member) => member.id !== 'child');
  const pages = [];
  const scenes = [];
  function add(lines, scene) { pages.push(lines); scenes.push(scene); }
  add(['我家有几口人？', '我来数一数。'], { kind: 'group', memberIds: ids.slice() });
  if (others.length === 0) {
    add(['这里有我。'], { kind: 'member', memberIds: ['child'], focusId: 'child' });
    add(['一！', '我也算一口人。'], { kind: 'count', memberIds: ['child'], count: 1 });
    add(['数家人，', '别忘了自己呀！'], { kind: 'remember', memberIds: ['child'], focusId: 'child' });
    return { pages, scenes };
  }
  others.forEach((member) => {
    add(['这是' + roleLabel(member.role) + '。'], {
      kind: 'member', memberIds: [member.id, 'child'], focusId: member.id
    });
  });
  const counted = others.length === 2 ? '两' : numberWord(others.length);
  add(['我数好了！', '一共有' + counted + '口人。'], {
    kind: 'count', memberIds: others.map((member) => member.id), count: others.length
  });
  add(['咦？', '我把谁忘了？'], { kind: 'remember', memberIds: ids.slice(), focusId: 'child' });
  add(['是我呀！', '还要加上我。'], { kind: 'remember', memberIds: ids.slice(), focusId: 'child' });
  const total = selected.length === 2 ? '两' : numberWord(selected.length);
  add(['我家有' + total + '口人。', '我们都在家！'], { kind: 'group', memberIds: ids.slice(), count: selected.length });
  return { pages, scenes };
}

module.exports = {
  MAX_MEMBERS, ROLE_OPTIONS, defaultMembers, normalizeMembers, migrateMembers,
  participants, memberLabel, roleLabel, createSibling, numberWord, familyBook, canUsePhoto
};
