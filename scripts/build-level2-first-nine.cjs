'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8')),first=require('../miniprogram/lib/level2-first-six-manuscripts');
const ids={22:'level2-paper',23:'level2-who-laughs',24:'level2-fruit'};
const next=source.books.filter(b=>ids[b.number]).map(b=>{const paragraphs=b.text.split(' '),pages=b.number===23?[[paragraphs[0],paragraphs[1]],[paragraphs[2]],[paragraphs[3]],[paragraphs[4]],[paragraphs[5],paragraphs[6]],[paragraphs[7]],[paragraphs[8]]]:paragraphs.map(t=>[t]);return {...b,id:ids[b.number],level:2,levelNumber:b.number-15,paragraphs,pages,tag:'第二级校样',group:'第二级',description:'用户终稿原文，分层插画。'};});
for(const b of next){assert.equal(b.pages.flat().join(' '),b.text);assert.ok(b.pages.every(p=>p.every(Boolean)));}
const books=[...first.books,...next],course=source.books.slice(0,24).map(b=>({...b,pages:[[b.text.replaceAll('【孩子名字】','CHILD')]]})),stats=require('../miniprogram/lib/literacy').summarizeBooks(course);
const result={edition:'level2-first-nine-20261028',level:2,scope:'第二级前9本，对应总篇号16—24；本次新增22—24。每篇独立封面、正文及识字小结。25—30尚未按终稿插画。',books,course,wordLists:source.wordLists,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按终稿总篇号1—24正文首次出现顺序统计接触字，姓名另计；不等同必认字表或已掌握字数。'};
fs.writeFileSync(path.join(root,'content/level2-first-nine.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(root,'miniprogram/lib/level2-first-nine-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log(books.map(b=>b.title+':'+b.pages.length).join(', ')+'; '+books.reduce((n,b)=>n+b.pages.length,0)+' exact-text body pages.');
