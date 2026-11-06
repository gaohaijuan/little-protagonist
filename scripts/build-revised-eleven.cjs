'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=JSON.parse(fs.readFileSync(path.join(root,'../output/level1-approved-15-20261026/第一级15篇-用户指定文稿.json'),'utf8'));
const previous=require('../miniprogram/lib/priority-three-manuscripts'),local=[3,4,5,6,11,12,13,15];
const revised=source.books.filter(b=>local.includes(b.number)).map(b=>({...b,sourceId:b.id,id:b.id==='family'?'family':b.id+'-revision',pages:b.paragraphs.map(t=>[t]),tag:'图文局部修订',group:'第一级新版',description:'按已定文案调整图文与动作，不增写故事。'}));
for(const b of revised)assert.deepEqual(b.pages.flat(),b.paragraphs);
const books=[...previous.books,...revised].sort((a,b)=>a.number-b.number);
const course=source.books.map(b=>({...b,pages:b.paragraphs.map(t=>[t])}));
const stats=require('../miniprogram/lib/literacy').summarizeBooks(course);
const result={edition:'level1-15-revised-eleven-20261027',scope:'本次局部修订8篇，与已完成3篇合为11篇校样；尚不包含第1、7、9、14篇。',localNumbers:local,books,course,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按用户指定15篇完整文稿顺序；正文去重、姓名另计，不代表掌握。'};
fs.writeFileSync(path.join(root,'content/level1-revised-eleven.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(root,'miniprogram/lib/revised-eleven-manuscripts.js'),"'use strict';\nmodule.exports="+JSON.stringify(result,null,2)+';\n');
console.log('11 revised stories: '+books.reduce((n,b)=>n+b.pages.length,0)+' exact-wording body pages.');

