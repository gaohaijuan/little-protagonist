'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),art=require('../miniprogram/lib/level2-last-three-art'),edition=require('../miniprogram/lib/level2-last-three-manuscripts');
const assets=require('../miniprogram/lib/level2-last-three-assets');
const library=JSON.parse(fs.readFileSync(path.join(root,'content/child-pose-library.json'),'utf8'));
const extension=JSON.parse(fs.readFileSync(path.join(root,'content/level2-last-three-pose-registration.json'),'utf8'));
const poses={...library.poses,...extension.poses},source=JSON.parse(fs.readFileSync(path.join(root,'../output/levels12-final-word-20261027/终稿内容.json'),'utf8'));
const forbidden=['headScale','headSize','headOffset','headFrame','scaleX','scaleY'];
const records=[];
for(const b of edition.books){
 assert.equal(b.pages.flat().join(' '),source.books.find(s=>s.number===b.number).text);
 assert.equal(art.BOOKS[b.id].pages.length,b.pages.length);
 for(const [page,p]of art.BOOKS[b.id].pages.entries()){
  if(p.pose)assert.ok(poses[p.pose]);
  for(const key of forbidden){assert.ok(!Object.hasOwn(p,key));assert.ok(!Object.hasOwn(p.placement||{},key));}
  for(const key of art.assetKeys(p)){assert.ok(assets[key],'Missing metadata '+key);assert.ok(fs.existsSync(path.join(root,'preview',assets[key].url.replace(/^\.\//,''))),'Missing image '+key);}
  records.push({id:b.id,page,proof:art.proof(p)});
 }
}
assert.equal(records.length,22);
assert.deepEqual(edition.stats.map(s=>s.cumulativeCount),[185,190,192]);
const jump=art.BOOKS['level2-jump'].pages;
assert.ok(jump[1].rabbitClears);assert.ok(jump[2].failedAttempt);assert.ok(jump[6].clearedPaper&&jump[7].clearedPaper);
assert.ok(jump[2].placement.x<jump[2].stone.x);assert.ok(jump[6].placement.x>jump[6].paper.x+jump[6].paper.width);
const out=path.join(root,'../output/level2-last-three-20261028');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'content-scene-audit.json'),JSON.stringify({passed:true,bodyPages:22,books:3,approvedTextExact:true,perPageHeadOverrides:false,records},null,2));
console.log('PASS: 22 exact-text scenes, all assets and registered actions present, jump progression and cumulative literacy verified.');
