'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_MEMBERS, ROLE_OPTIONS, defaultMembers, normalizeMembers, migrateMembers,
  participants, memberLabel, roleLabel, createSibling, numberWord, familyBook, canUsePhoto
} = require('../miniprogram/lib/family');

const includedIds = (members) => participants(members).map((member) => member.id);
const selected = (...ids) => normalizeMembers(ids.map((id) => ({ id, role: id, included: true })));

test('photographs are allowed only for the child and the four sibling roles', () => {
  for (const role of ['child', 'olderBrother', 'youngerBrother', 'olderSister', 'youngerSister']) {
    assert.equal(canUsePhoto(role), true, role + ' supports a photograph');
  }
  for (const role of ['dad', 'mom', 'grandpa', 'grandma', 'unknown', '', 'member-sister-2', '__proto__', null, undefined, {}, 1]) {
    assert.equal(canUsePhoto(role), false, String(role) + ' cannot use a photograph');
  }
  const sibling = createSibling(defaultMembers(), 'youngerSister').at(-1);
  assert.equal(canUsePhoto(sibling.role), true, 'extra siblings are identified by role, not their stable ID');
});

test('new profiles have three participants and retain all nine independent photo slots', () => {
  const first = defaultMembers();
  assert.deepEqual(includedIds(first), ['child', 'dad', 'mom']);
  assert.equal(first.length, 9);
  assert.deepEqual(first.map((member) => member.id), ROLE_OPTIONS.map((role) => role.id));
  first[0].included = false;
  first[1].role = 'mom';
  assert.deepEqual(includedIds(defaultMembers()), ['child', 'dad', 'mom']);
  assert.equal(defaultMembers()[1].role, 'dad');
});

test('an explicit empty family keeps only the child, without inventing parents', () => {
  assert.deepEqual(includedIds([]), ['child']);
  assert.deepEqual(includedIds(undefined), ['child', 'dad', 'mom']);
  assert.deepEqual(includedIds([{ id: 'child', included: false }]), ['child']);
});

test('normalization rejects unsafe IDs and role substitution while retaining stable sibling IDs', () => {
  const source = [
    { id: 'dad', role: 'mom', included: true },
    { id: 'dad', role: 'dad', included: false },
    { id: 'member-sister-a', role: 'youngerSister', included: true },
    { id: 'member-sister-a', role: 'olderBrother', included: true },
    { id: 'member-<script>', role: 'youngerSister', included: true },
    { id: '__proto__', role: 'dad', included: true },
    { id: 'member-adult', role: 'dad', included: true },
    { id: 'member-empty', role: 'unknown', included: true },
    null
  ];
  const original = JSON.stringify(source);
  const actual = normalizeMembers(source);
  assert.equal(JSON.stringify(source), original, 'normalization must not mutate saved data');
  assert.equal(actual.find((member) => member.id === 'dad').role, 'dad');
  assert.deepEqual(actual.filter((member) => member.id.startsWith('member-')), [
    { id: 'member-sister-a', role: 'youngerSister', included: true }
  ]);
  assert.deepEqual(normalizeMembers(actual), actual);
});

test('legacy migrations preserve the existing five-person book and photographed siblings', () => {
  for (const version of [1, 2, 3]) {
    const source = {
      version,
      avatars: {
        olderBrother: { data: 'data:image/png;base64,portrait-a' },
        youngerSister: { data: 'data:image/png;base64,portrait-b' },
        olderSister: { data: '' }
      }
    };
    const original = JSON.stringify(source);
    assert.deepEqual(includedIds(migrateMembers(source)), [
      'child', 'dad', 'mom', 'grandpa', 'grandma', 'olderBrother', 'youngerSister'
    ]);
    assert.equal(JSON.stringify(source), original, 'migration cannot remove existing photos');
  }
  assert.deepEqual(migrateMembers(null), defaultMembers());
});

test('current migrations keep opt-outs and extra sibling photo keys exactly', () => {
  const members = selected('grandma', 'youngerBrother').concat({
    id: 'member-brother-b', role: 'youngerBrother', included: true
  });
  const actual = migrateMembers({ version: 4, members });
  assert.deepEqual(actual, members);
  assert.deepEqual(includedIds(actual), ['child', 'grandma', 'youngerBrother', 'member-brother-b']);
});

test('normalization limits participants without deleting out-of-book photo slots', () => {
  const source = ROLE_OPTIONS.map((role) => ({ id: role.id, role: role.id, included: true }));
  for (let index = 0; index < 6; index += 1) source.push({ id: 'member-' + index, role: 'youngerBrother', included: true });
  const actual = normalizeMembers(source);
  assert.equal(actual.length, 15);
  assert.equal(participants(actual).length, MAX_MEMBERS);
  assert.deepEqual(actual.slice(-3).map((member) => member.included), [false, false, false]);
  assert.equal(actual[0].included, true);
});

test('adding and removing siblings preserves the other photo IDs and uses unambiguous editor labels', () => {
  const original = selected('mom', 'youngerBrother');
  const withOne = createSibling(original, 'youngerBrother');
  const withTwo = createSibling(withOne, 'youngerBrother');
  const extras = withTwo.filter((member) => member.id.startsWith('member-'));
  assert.notEqual(extras[0].id, extras[1].id);
  assert.match(extras[0].id, /^member-[a-z0-9_-]+$/);
  assert.equal(original.length, 9);
  assert.equal(memberLabel(withTwo.find((member) => member.id === 'youngerBrother'), withTwo), '弟弟 1');
  assert.equal(memberLabel(extras[0], withTwo), '弟弟 2');
  assert.equal(memberLabel(extras[1], withTwo), '弟弟 3');
  const remaining = normalizeMembers(withTwo.filter((member) => member.id !== extras[0].id));
  assert.equal(remaining.at(-1).id, extras[1].id);
  assert.equal(remaining.some((member) => member.id === extras[0].id), false);
  assert.equal(roleLabel(extras[1].role), '弟弟', 'story labels never carry editor numbering');
});

test('adding beyond twelve or using an adult extra role is rejected without mutation', () => {
  let members = defaultMembers();
  while (participants(members).length < MAX_MEMBERS) members = createSibling(members, 'olderSister');
  const before = JSON.stringify(members);
  assert.throws(() => createSibling(members, 'youngerBrother'), { code: 'MAX_FAMILY_MEMBERS' });
  assert.throws(() => createSibling(members, 'dad'), { code: 'INVALID_SIBLING_ROLE' });
  assert.equal(JSON.stringify(members), before);
});

test('story numbers support every allowed family size', () => {
  assert.deepEqual(Array.from({ length: 13 }, (_, index) => numberWord(index)), [
    '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'
  ]);
  for (const invalid of [-1, 13, 2.1, NaN, '3']) assert.throws(() => numberWord(invalid), RangeError);
});

test('a single-parent sibling story introduces only selected relatives and remembers the child', () => {
  const members = createSibling(selected('mom', 'youngerBrother'), 'youngerBrother');
  const { pages, scenes } = familyBook({ name: '小花' }, members);
  assert.equal(pages.length, scenes.length);
  const text = pages.flat().join('');
  assert.match(text, /妈妈/);
  assert.equal((text.match(/这是弟弟。/g) || []).length, 2);
  assert.doesNotMatch(text, /爸爸|爷爷|奶奶|弟弟 2|“你呢？”/);
  assert.deepEqual(pages.at(-1), ['我家有四口人。', '我们都在家！']);
  const count = scenes.find((scene) => scene.kind === 'count');
  assert.equal(count.count, 3);
  assert.equal(count.memberIds.includes('child'), false);
  assert.equal(scenes.at(-1).memberIds.includes('child'), true);
  assert.equal(scenes.at(-1).count, 4);
});

test('only-child selection has a short natural story without a nonexistent speaker or zero people', () => {
  const { pages, scenes } = familyBook({}, []);
  assert.equal(pages.length, 4);
  assert.doesNotMatch(pages.flat().join(''), /零|0|爸爸|妈妈|爷爷|奶奶/);
  assert.ok(scenes.every((scene) => scene.memberIds.length === 1 && scene.memberIds[0] === 'child'));
  assert.equal(scenes.find((scene) => scene.kind === 'count').count, 1);
});

test('every dynamic page has valid participants and preserves correct counts for one to twelve people', () => {
  let members = normalizeMembers([]);
  for (let total = 1; total <= MAX_MEMBERS; total += 1) {
    const { pages, scenes } = familyBook({}, members);
    const ids = new Set(includedIds(members));
    assert.equal(pages.length, scenes.length);
    assert.ok(pages.every((lines) => lines.length > 0 && lines.every((line) => typeof line === 'string' && line.length > 0)));
    for (const scene of scenes) {
      assert.ok(['group', 'member', 'count', 'remember'].includes(scene.kind));
      assert.ok(scene.memberIds.every((id) => ids.has(id)));
      assert.equal(new Set(scene.memberIds).size, scene.memberIds.length);
      if (scene.focusId) assert.ok(scene.memberIds.includes(scene.focusId));
    }
    if (total > 1) assert.equal(scenes.at(-1).count, total);
    if (total < MAX_MEMBERS) members = createSibling(members, 'olderSister');
  }
});
