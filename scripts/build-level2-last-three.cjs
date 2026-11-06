'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { summarizeBooks } = require('../miniprogram/lib/literacy');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, '../output/levels12-final-word-20261027/终稿内容.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const ids = { 28: 'level2-jump', 29: 'level2-train', 30: 'level2-fish' };
const books = source.books.filter(book => ids[book.number]).map(book => {
  const paragraphs = book.text.split(' ');
  const pages = paragraphs.map(text => [text]);
  return {
    ...book, id: ids[book.number], level: 2, levelNumber: book.number - 15,
    paragraphs, pages, tag: '第二级校样', group: '第二级',
    description: '用户终稿原文，分层插画。'
  };
});

assert.deepEqual(books.map(book => book.number), [28, 29, 30]);
assert.deepEqual(books.map(book => book.pages.length), [8, 7, 7]);
for (const book of books) {
  assert.equal(book.pages.flat().join(' '), book.text);
  assert.ok(book.pages.every(page => page.every(Boolean)));
}

const course = source.books.slice(0, 30).map(book => ({
  ...book, pages: [[book.text.replaceAll('【孩子名字】', 'CHILD')]]
}));
const allStats = summarizeBooks(course);
const stats = books.map(book => ({ ...allStats.find(stat => stat.number === book.number), id: book.id }));
assert.deepEqual(stats.map(stat => stat.newCharacters), [['跳'], ['火', '画', '条', '路', '绿'], ['鱼', '新']]);
assert.deepEqual(stats.map(stat => stat.cumulativeCount), [185, 190, 192]);

const result = {
  edition: 'level2-last-three-20261028', level: 2,
  scope: '第二级第13—15本，对应总篇号28—30；三篇合订审核校样。每篇独立封面、正文及识字小结。',
  source: '../output/levels12-final-word-20261027/终稿内容.json',
  books, course, wordLists: source.wordLists, stats,
  statisticsBasis: '按终稿总篇号1—30正文首次出现顺序统计接触字，姓名另计；不等同必认字表或已掌握字数。'
};

const serialized = JSON.stringify(result, null, 2);
fs.writeFileSync(path.join(root, 'content/level2-last-three.json'), serialized + '\n');
fs.writeFileSync(path.join(root, 'miniprogram/lib/level2-last-three-manuscripts.js'), "'use strict';\nmodule.exports=" + serialized + ';\n');
console.log(books.map(book => book.title + ':' + book.pages.length).join(', ') + '; 22 exact-text body pages.');
