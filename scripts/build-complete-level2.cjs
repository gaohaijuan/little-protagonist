'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),first=require('../miniprogram/lib/level2-first-twelve-manuscripts'),last=require('../miniprogram/lib/level2-last-three-manuscripts');
const source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8'));
const books=[...first.books,...last.books],stats=[...first.stats,...last.stats];
assert.equal(books.length,15);assert.equal(new Set(books.map(b=>b.id)).size,15);
for(const [i,b] of books.entries()){assert.equal(b.number,16+i);assert.equal(b.levelNumber,i+1);assert.equal(b.pages.flat().join(' '),source.books[i+15].text);}
assert.equal(books.reduce((n,b)=>n+b.pages.length,0),111);assert.deepEqual(first.wordLists,last.wordLists);
const result={edition:'level2-complete-fifteen-20261028',level:2,scope:'第二级完整15本，对应总篇号16—30；每篇独立封面、正文及识字小结。',books,course:last.course,stats,wordLists:source.wordLists,statisticsBasis:last.statisticsBasis};
fs.writeFileSync(path.join(root,'content/level2-complete-fifteen.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'miniprogram/lib/level2-complete-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log('Built full Level 2:15 books,111 exact-text body pages.');
