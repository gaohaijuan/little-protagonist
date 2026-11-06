'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8')),first=require('../miniprogram/lib/level2-first-nine-manuscripts');
const ids={25:'level2-sunrise',26:'level2-moon',27:'level2-rabbit'};
const next=source.books.filter(b=>ids[b.number]).map(b=>{const paragraphs=b.text.split(' '),pages=paragraphs.map(t=>[t]);return {...b,id:ids[b.number],level:2,levelNumber:b.number-15,paragraphs,pages,tag:'第二级校样',group:'第二级',description:'用户终稿原文，分层插画。'};});
for(const b of next){assert.equal(b.pages.flat().join(' '),b.text);assert.ok(b.pages.every(p=>p.every(Boolean)));}
const books=[...first.books,...next],course=source.books.slice(0,27).map(b=>({...b,pages:[[b.text.replaceAll('【孩子名字】','CHILD')]]})),stats=require('../miniprogram/lib/literacy').summarizeBooks(course);
const result={edition:'level2-first-twelve-20261028',level:2,scope:'第二级前12本，对应总篇号16—27；本次新增25—27。每篇独立封面、正文及识字小结。28—30尚未按终稿插画。',books,course,wordLists:source.wordLists,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按终稿总篇号1—27正文首次出现顺序统计接触字，姓名另计；不等同必认字表或已掌握字数。'};
fs.writeFileSync(path.join(root,'content/level2-first-twelve.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(root,'miniprogram/lib/level2-first-twelve-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log(books.map(b=>b.title+':'+b.pages.length).join(', ')+'; '+books.reduce((n,b)=>n+b.pages.length,0)+' exact-text body pages.');
