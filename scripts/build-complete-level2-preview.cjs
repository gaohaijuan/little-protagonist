'use strict';
// Reuse the established isolated builder without rewriting its source or the main shelf.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
require('./build-complete-level2.cjs');
let source=fs.readFileSync(path.join(__dirname,'build-level2-last-three-preview.cjs'),'utf8');
const replacements=[
 ["level2LastManuscripts:'level2-last-three-manuscripts'","level2LastManuscripts:'level2-complete-manuscripts'"],
 ['第二级 · 最后三本绘本校样','第二级 · 完整15本绘本校样'],
 ['《我跳过去了》《小火车》《小鱼的新家》，第二级第13—15本，总篇号28—30。22页正文原文保留，每篇独立封面和识字小结，竖版A5图文同页。','第二级第1—15本，总篇号16—30。111页正文原文保留，每篇独立封面和识字小结，竖版A5图文同页。'],
 ['level2-last-three.html','level2-complete.html'],['第二级最后三本 · 小小主角','第二级完整15本 · 小小主角']
];
for(const [a,b] of replacements){assert.ok(source.includes(a),'Missing builder anchor:'+a);source=source.replaceAll(a,b);}
source=require('./level2-review-fixes-build.cjs').builder(source);
new vm.Script('(function(require,__dirname){'+source+'\n})',{filename:__filename}).runInThisContext()(require,__dirname);
