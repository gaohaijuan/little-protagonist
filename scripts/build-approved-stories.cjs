'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const approved = [
  { number: 4, id: 'hands', tag: '小手游戏', description: '把小手变成花，玩一个来来去去的游戏。', tone: 'green' },
  { number: 5, id: 'rain', tag: '雨中小事', description: '小花不来，我去。和小花一起躲雨。', tone: 'blue' },
  { number: 6, id: 'stone', tag: '一起回家', description: '带小石头散步，再送它回家。', tone: 'yellow' },
  { number: 7, id: 'mountain', tag: '云来云走', description: '云挡住了山，风又把云带走了。', tone: 'green' },
  { number: 8, id: 'car', tag: '进进出出', description: '小车的家有两个门，玩够了再回家。', tone: 'peach' },
  { number: 9, id: 'ball', tag: '一起找球', description: '找过小山和小车，原来小球还在家里。', tone: 'yellow' },
  { number: 10, id: 'water', tag: '发现倒影', description: '小手碰到水，水中的我去了哪里？', tone: 'blue' },
  { number: 11, id: 'tree', tag: '一起长高', description: '站在石头上比高，再回到地上。', tone: 'green' },
  { number: 12, id: 'calling', tag: '寻找声音', description: '看看树上和树下，谁来和我玩？', tone: 'yellow' },
  { number: 13, id: 'catball', tag: '滚球游戏', description: '小猫不动，球滚起来后它来了。', tone: 'peach' },
  { number: 14, id: 'shoes', tag: '合脚的小鞋', description: '大鞋留在原地，穿自己的小鞋一起走。', tone: 'peach' },
  { number: 15, id: 'watering', tag: '浇花洗脚', description: '小花喝水，小脚要洗一洗。', tone: 'green' },
  { number: 16, id: 'wagon', tag: '前后与里面', description: '球放在车前、车后，还是车里？', tone: 'yellow' },
  { number: 17, id: 'paper', tag: '左右追纸片', description: '纸片随风左右飞，小石头来帮忙。', tone: 'peach' },
  { number: 18, id: 'fruit', tag: '分享果子', description: '大果子让来让去，小果子也好吃。', tone: 'yellow' },
  { number: 19, id: 'catbed', tag: '让小猫休息', description: '把玩具拿出来，让小猫睡在自己的床上。', tone: 'green' },
  { number: 20, id: 'sleepy', tag: '晚安小伙伴', description: '小伙伴们都休息了，我也准备睡觉。', tone: 'blue' }
];
function buildApprovedStories() {
  const draft = JSON.parse(fs.readFileSync(path.join(root, 'content/level1-stories-04-10.json'), 'utf8'));
  draft.books.push(...JSON.parse(fs.readFileSync(path.join(root, 'content/level1-stories-11-20.json'), 'utf8')).books);
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
  const source = "'use strict';\n// Generated from the approved manuscript files by build-approved-stories.cjs.\n// Books 4–20 have layered artwork for the browser shelf.\nmodule.exports = " + JSON.stringify(books, null, 2) + ';\n';
  const filename = path.join(root, 'miniprogram/lib/level1-approved.js');
  if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== source) fs.writeFileSync(filename, source);
  return books;
}
module.exports = { buildApprovedStories };
if (require.main === module) console.log('Approved illustrated books generated: ' + buildApprovedStories().map(book => book.id).join(', '));
