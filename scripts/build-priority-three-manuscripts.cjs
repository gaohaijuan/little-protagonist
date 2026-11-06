'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'../output/level1-approved-15-20261026/第一级15篇-用户指定文稿.json'),'utf8'));
const selected=[2,8,10].map(number=>{
 const b=source.books.find(b=>b.number===number);
 const pages=number===10?[[b.paragraphs[0],b.paragraphs[1]],...b.paragraphs.slice(2).map(t=>[t])]:b.paragraphs.map(t=>[t]);
 assert.deepEqual(pages.flat(),b.paragraphs);
 return {...b,sourceId:b.id,id:{2:'snow-revision',8:'insect-revision',10:'ball-revision'}[number],pages,tag:{2:'窗边看雪',8:'发现小虫',10:'一起找球'}[number],group:'第1级新版',description:{2:'雪花一片片落下，飞进草丛里。',8:'石头上的小虫，怎么到了我的脚上？',10:'车里、车前、车后都没有，门后呢？'}[number]};
});
const stats=require('../miniprogram/lib/literacy').summarizeBooks(source.books.map(b=>({...b,pages:b.paragraphs.map(t=>[t])})));
const payload={edition:'level1-15-priority-three-20261026',scope:'仅第2、8、10篇新版，其他篇目不修改',books:selected,stats:selected.map(b=>({...stats.find(s=>s.number===b.number),id:b.id})),statisticsBasis:'按用户指定15篇完整文稿顺序；正文去重，姓名另计，不代表掌握。'};
fs.writeFileSync(path.join(root,'content/level1-priority-three.json'),JSON.stringify(payload,null,2)+'\n');
fs.writeFileSync(path.join(root,'miniprogram/lib/priority-three-manuscripts.js'),"'use strict';\n// User-approved wording; line grouping only, no rewriting.\nmodule.exports="+JSON.stringify(payload,null,2)+';\n');
console.log('Priority manuscripts: exact user text, '+selected.length+' stories, '+selected.reduce((n,b)=>n+b.pages.length,0)+' body pages.');

