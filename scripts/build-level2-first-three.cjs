'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8'));
const ids={16:'level2-shoes',17:'level2-sleepy',18:'level2-morning'};
const books=source.books.filter(b=>[16,17,18].includes(b.number)).map(b=>({...b,id:ids[b.number],level:2,levelNumber:b.number-15,paragraphs:b.text.split(' '),pages:b.text.split(' ').map(t=>[t]),tag:'第二级首批校样',group:'第二级',description:'用户终稿原文，分层插画。'}));
for(const b of books){assert.equal(b.pages.flat().join(' '),b.text);assert.ok(b.pages.every(p=>p[0]));}
const course=source.books.slice(0,18).map(b=>({...b,pages:[[b.text.replaceAll('【孩子名字】','CHILD')]]})),stats=require('../miniprogram/lib/literacy').summarizeBooks(course);
const result={edition:'level2-first-three-20261027',level:2,scope:'第二级先做前三本，对应总篇号16—18；第19—30篇不在本次制作范围。',books,course,wordLists:source.wordLists,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按终稿总篇号1—18正文首次出现顺序统计接触字，姓名另计；不等同必认字表或已掌握字数。'};
fs.writeFileSync(path.join(root,'content/level2-first-three.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'miniprogram/lib/level2-first-three-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log(books.map(b=>b.title+':'+b.pages.length).join(', ')+'; '+books.reduce((n,b)=>n+b.pages.length,0)+' exact-text body pages.');
