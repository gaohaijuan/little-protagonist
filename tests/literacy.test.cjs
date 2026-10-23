'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { uniqueHan, summarizeBooks } = require('../miniprogram/lib/literacy');
const { listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers, normalizeMembers } = require('../miniprogram/lib/family');

test('body character counts deduplicate within a book and cumulative counts deduplicate across books', () => {
  const result = summarizeBooks([
    {id:'a',title:'忽略书名',pages:[['我来！','我来。'],['3岁，A。']]},
    {id:'b',pages:[['你来，我去。']]},
    {id:'c',pages:[['我来。']]}
  ]);
  assert.deepEqual(result.map(book => [book.count,book.newCount,book.cumulativeCount]), [[3,3,3],[4,2,5],[2,0,5]]);
  assert.deepEqual(result[1].newCharacters, ['你','去']);
  assert.deepEqual(uniqueHan('ABC123，。！？'), []);
});

test('personalized name slots are excluded without stripping ordinary story characters', () => {
  const catalog = name => listBooks({name,age:5,className:'大班'},defaultMembers(),{includeApproved:true});
  const stats = summarizeBooks(catalog('CHILD'));
  const first = stats[0];
  assert.ok(!first.characters.includes('石'));
  assert.ok(stats[5].newCharacters.includes('石'), 'stone in the story remains a new character');
  assert.ok(stats[5].characters.includes('头'));
  assert.notDeepEqual(summarizeBooks(catalog('龙')).map(b=>b.count), stats.map(b=>b.count), 'using literal name text would change the figures');
  assert.ok(first.characters.includes('我'), 'ordinary fixed text is not globally stripped when a name contains 我');
});

test('the current age, class and selected family control the actual reading-body totals', () => {
  const stats = (profile,members) => summarizeBooks(listBooks({...profile,name:'CHILD'},members,{includeApproved:true}));
  const standard = stats({age:5,className:'大班'}, defaultMembers());
  const younger = stats({age:3,className:'小班'}, defaultMembers());
  assert.ok(standard[0].characters.includes('五'));
  assert.ok(younger[0].characters.includes('三'));
  assert.ok(!younger[0].characters.includes('五'));
  const extended = stats({age:5,className:'大班'},normalizeMembers(defaultMembers().map(member => ({...member,included:member.included||member.id==='grandma'}))));
  assert.ok(!standard[2].characters.includes('奶'));
  assert.ok(extended[2].characters.includes('奶'));
  assert.ok(extended[2].newCharacters.includes('奶'));
  assert.deepEqual(standard[1].characters.includes('四'),true);
  assert.deepEqual(stats({age:5,className:'大班'},defaultMembers()),standard,'rereading does not accumulate another copy');
});
