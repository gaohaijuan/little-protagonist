'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const approved = [
  { number: 4, id: 'hands', tag: '小手游戏', description: '把小手变成花，玩一个来来去去的游戏。', tone: 'green' },
  { number: 5, id: 'rain', tag: '雨中小事', description: '小花不来，我去。和小花一起躲雨。', tone: 'blue' },
  { number: 6, id: 'stone', tag: '一起回家', description: '带小石头散步，再送它回家。', tone: 'yellow' }
];
function buildApprovedStories() {
  const draft = JSON.parse(fs.readFileSync(path.join(root, 'content/level1-stories-04-10.json'), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'content/level1-character-plan.json'), 'utf8'));
  const allowed = new Set(plan.characters);
  const books = approved.map(metadata => {
    const matches = draft.books.filter(book => book.number === metadata.number);
    assert.equal(matches.length, 1, 'Each approved book has exactly one manuscript source.');
    const book = matches[0];
    assert.ok(book.pages.length >= 6 && book.pages.length <= 8, book.title + ': expected 6–8 body pages');
    assert.ok(book.pages.every(lines => Array.isArray(lines) && lines.length >= 1 && lines.length <= 2 && lines.every(line => typeof line === 'string' && line.trim())), book.title + ': every page has one or two nonempty reading lines');
    const outside = [...new Set((book.title + book.pages.flat().join('')).match(/\p{Script=Han}/gu) || [])].filter(character => !allowed.has(character));
    assert.deepEqual(outside, [], book.title + ': approved wording stays in the working character list');
    return { ...metadata, title: book.title, group: '第 1 级', focus: book.focus, pages: book.pages };
  });
  const source = "'use strict';\n// Generated from content/level1-stories-04-10.json by build-approved-stories.cjs.\n// Only books 4–6 are approved for the illustrated browser shelf.\nmodule.exports = " + JSON.stringify(books, null, 2) + ';\n';
  const filename = path.join(root, 'miniprogram/lib/level1-approved.js');
  if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== source) fs.writeFileSync(filename, source);
  return books;
}
module.exports = { buildApprovedStories };
if (require.main === module) console.log('Approved illustrated books generated: ' + buildApprovedStories().map(book => book.id).join(', '));
