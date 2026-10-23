'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./build-preview.cjs');
require('./build-story-drafts.cjs');
const source = path.join(root, 'preview');
const target = path.join(root, 'sites/mobile-preview/dist');
fs.mkdirSync(target, {recursive:true});
fs.writeFileSync(path.join(target, 'index.html'), fs.readFileSync(path.join(source, 'index.html'), 'utf8').replaceAll('小小主角 · 本地开发版', '小小主角 · 手机试用版'));
function copyAssets(from, to) {
  fs.mkdirSync(to, {recursive:true});
  for (const entry of fs.readdirSync(from, {withFileTypes:true})) {
    if (entry.isDirectory()) copyAssets(path.join(from, entry.name), path.join(to, entry.name));
    else if (entry.isFile()) fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    else throw new Error('Only regular app assets can be published.');
  }
}
for (const directory of ['vendor', 'models']) copyAssets(path.join(source, directory), path.join(target, directory));
copyAssets(path.join(source, 'art/flower'), path.join(target, 'art/flower'));
copyAssets(path.join(source, 'art/family'), path.join(target, 'art/family'));
copyAssets(path.join(source, 'art/intro'), path.join(target, 'art/intro'));
copyAssets(path.join(source, 'art/sequence'), path.join(target, 'art/sequence'));
// Only the requested manuscript is published; QA files and source data stay local.
fs.mkdirSync(path.join(target, 'drafts'), { recursive: true });
fs.copyFileSync(path.join(source, 'drafts/level-1-books-04-10.html'), path.join(target, 'drafts/level-1-books-04-10.html'));
console.log('Mobile site prepared with local face-processing and picture-book assets.');
