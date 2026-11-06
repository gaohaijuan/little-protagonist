'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8'));
const first=require('../miniprogram/lib/level2-first-three-manuscripts');
const ids={19:'level2-hot-water',20:'level2-flower-water',21:'level2-ball-wagon'};
const next=source.books.filter(b=>ids[b.number]).map(b=>{const paragraphs=b.text.split(' ');return {...b,id:ids[b.number],level:2,levelNumber:b.number-15,paragraphs,pages:b.number===19?[[paragraphs[0],paragraphs[1]],...paragraphs.slice(2).map(t=>[t])]:paragraphs.map(t=>[t]),tag:'第二级校样',group:'第二级',description:'用户终稿原文，分层插画。'};});
for(const b of next){assert.equal(b.pages.flat().join(' '),b.text);assert.ok(b.pages.every(p=>p.every(Boolean)));}
const books=[...first.books,...next],course=source.books.slice(0,21).map(b=>({...b,pages:[[b.text.replaceAll('【孩子名字】','CHILD')]]}));
const stats=require('../miniprogram/lib/literacy').summarizeBooks(course);
const result={edition:'level2-first-six-20261028',level:2,scope:'第二级已完成前6本，对应总篇号16—21；本次新增19—21。每篇独立封面、正文及识字小结。22—30尚未按终稿制作。',books,course,wordLists:source.wordLists,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按终稿总篇号1—21正文首次出现顺序统计接触字，姓名另计；不等同必认字表或已掌握字数。'};
fs.writeFileSync(path.join(root,'content/level2-first-six.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'miniprogram/lib/level2-first-six-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log(books.map(b=>b.title+':'+b.pages.length).join(', ')+'; '+books.reduce((n,b)=>n+b.pages.length,0)+' exact-text body pages.');
