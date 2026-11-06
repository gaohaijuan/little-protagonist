'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getBook, listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers, normalizeMembers } = require('../miniprogram/lib/family');

test('the flower book keeps the approved six-page wording with the simpler second page', () => {
  assert.deepEqual(getBook('flower', {}).pages, [
    ['我的小花。'],
    ['我的花', '有好多片。'],
    ['一片两片三四片，'],
    ['五片六片七八片，'],
    ['九片十片十一片，'],
    ['飞入草丛都不见。']
  ]);
});

test('native callers without members keep the established five-person eight-page story', () => {
  const book = getBook('family', { name: '小石头' });
  assert.equal(book.pages.length, 8);
  assert.deepEqual(book.pages.at(-2), ['我家有五口人。']);
  assert.deepEqual(book.pages.at(-1), ['我们都在家！']);
  assert.doesNotMatch(book.pages.flat().join(''), /数|咦|忘/);
  assert.equal(book.scenes, undefined);
});

test('browser callers explicitly select the three-person default and receive matching scene metadata', () => {
  const book = getBook('family', {}, defaultMembers());
  assert.deepEqual(book.pages.at(-2), ['我家有三口人。']);
  assert.deepEqual(book.pages.at(-1), ['我们都在家！']);
  assert.equal(book.scenes.length, book.pages.length);
  assert.deepEqual(book.scenes[0].memberIds, ['child', 'dad', 'mom']);
  assert.doesNotMatch(book.pages.flat().join(''), /爷爷|奶奶/);
});

test('list and lookup use the supplied family while leaving the other books intact', () => {
  const profile = { name: '小豆包', age: 4, className: '中班' };
  const members = normalizeMembers([{ id: 'grandma', included: true }]);
  const dynamic = listBooks(profile, members);
  const native = listBooks(profile);
  assert.deepEqual(dynamic.slice(0, 2), native.slice(0, 2));
  assert.equal(dynamic[0].title, '你好，我是小豆包');
  assert.deepEqual(dynamic[2], getBook('family', profile, members));
  assert.deepEqual(dynamic[2].pages.at(-2), ['我家有两口人。']);
  assert.deepEqual(dynamic[2].pages.at(-1), ['我们都在家！']);
  assert.doesNotMatch(dynamic[2].pages.flat().join(''), /爸爸|妈妈|爷爷/);
  assert.equal(getBook('missing', profile, members), null);
});

test('book results are independent and changing families cannot retain an old page or scene', () => {
  const first = getBook('family', {}, defaultMembers());
  first.pages[0][0] = 'changed';
  first.scenes[0].memberIds.push('unexpected');
  const next = getBook('family', {}, []);
  assert.equal(next.pages.length, 4);
  assert.equal(next.pages[0][0], '我家有几口人？');
  assert.deepEqual(next.scenes[0].memberIds, ['child']);
  assert.deepEqual(getBook('family', {}, defaultMembers()).scenes[0].memberIds, ['child', 'dad', 'mom']);
});

test('native shelves retain three supported books; the browser explicitly opts into layered books 4–20', () => {
  const profile = { name: '小豆包', age: 4, className: '中班' };
  const options = { includeApproved: true };
  const native = listBooks(profile);
  const browser = listBooks(profile, defaultMembers(), options);
  assert.deepEqual(native.map(book => book.id), ['intro', 'flower', 'family']);
  assert.deepEqual(browser.map(book => book.id), ['intro', 'flower', 'family', 'hands', 'mountain', 'rain', 'stone', 'car', 'ball', 'water', 'tree', 'calling', 'catball', 'shoes', 'watering', 'wagon', 'paper', 'fruit', 'catbed', 'sleepy']);
  assert.equal(getBook('hands', profile), null, 'native cannot route an unsupported new story to its old illustration');
  assert.equal(getBook('hands', profile, defaultMembers(), options).pages.length, 6);
  assert.deepEqual(browser.slice(0, 3), listBooks(profile, defaultMembers()), 'both shelves use the same introductory content and simplified dynamic family');
});

test('approved generated pages match the single manuscript source through illustrated book 20', () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/level1-stories-04-10.json'), 'utf8'));
  source.books.push(...JSON.parse(fs.readFileSync(path.join(__dirname, '../content/level1-stories-11-20.json'), 'utf8')).books);
  const approved = listBooks({}, defaultMembers(), { includeApproved: true }).slice(3);
  assert.deepEqual(approved.map(book => book.number), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(approved.map(book => book.pages.length), [6, 6, 8, 8, 8, 8, 8, 6, 8, 8, 6, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(approved.slice(1,4).map(book=>({id:book.id,number:book.number,sourceNumber:book.sourceNumber})), [
    {id:'mountain',number:5,sourceNumber:7},{id:'rain',number:6,sourceNumber:5},{id:'stone',number:7,sourceNumber:6}
  ]);
  for (const book of approved) {
    const manuscript = source.books.find(item => item.number === book.sourceNumber);
    assert.equal(book.title, manuscript.title);
    assert.equal(book.focus, manuscript.focus);
    assert.deepEqual(book.pages, manuscript.pages, 'the approved body is not rewritten for publication');
    assert.deepEqual(getBook(book.id, { name: '小石头', age: 5, className: '大班' }, [], { includeApproved: true }).pages, manuscript.pages, 'ordinary stones never become a personalized child name');
  }
});

test('approved page arrays are independent across reads and keep their source identity after reordering', () => {
  const first = getBook('stone', {}, [], { includeApproved: true });
  first.pages[0][0] = 'changed'; first.pages.push(['changed']);
  const next = getBook('stone', {}, [], { includeApproved: true });
  assert.equal(next.number, 7);
  assert.equal(next.sourceNumber, 6);
  assert.equal(next.pages.length, 8);
  assert.equal(next.pages[0][0], '大石头下，');
});
