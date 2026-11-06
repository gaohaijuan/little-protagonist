'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/level2-complete-15-20261028');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),edition=require('../miniprogram/lib/level2-complete-manuscripts');
const base=require('../miniprogram/lib/layered-art'),last=require('../miniprogram/lib/level2-last-three-art');
const fixes=require('../miniprogram/lib/level2-review-fixes'),books=fixes.apply({...base.BOOKS,...last.BOOKS});
const source=read(path.resolve(root,'../output/levels12-final-word-20261027/终稿内容.json')),qa=read(path.join(out,'browser-render-qa.json'));
const lib={...read(path.join(root,'content/child-pose-library.json')).poses,...read(path.join(root,'content/level2-last-three-pose-registration.json')).poses,...read(path.join(root,'content/level2-review-fixes-poses.json')).poses};
const inventory=[],geometry=[];
for(const b of edition.books){
 assert.equal(b.pages.flat().join(' '),source.books[b.number-1].text);
 const art=last.BOOKS[b.id]?last:base,plans=books[b.id].pages;
 assert.equal(plans.length,b.pages.length);let assets=0;
 for(const [page,p]of plans.entries()){
  for(const key of p.reviewFix?fixes.assetKeys(p):art.assetKeys(p)){const url=fixes.imageUrl(key)||art.imageUrl(key);assert.ok(url&&fs.existsSync(path.resolve(root,'preview',url)),key);assets++;}
  if(p.pose)assert.ok(lib[p.pose]&&fs.existsSync(path.resolve(root,'preview',lib[p.pose].bodyUrl)));
  geometry.push({id:b.id,number:b.number,page:page+1,background:p.background,url:art.imageUrl(p.background),world:p.world||{width:1000,height:1000},camera:p.camera,closeFloorCrop:!!p.close});
 }
 const records=qa.records.filter(r=>r.id===b.id);assert.equal(records.length,b.pages.length+2);
 inventory.push({levelNumber:b.levelNumber,number:b.number,title:b.title,bodyPages:b.pages.length,cover:true,summary:true,assetsChecked:assets,status:'正文插画及校样齐全'});
}
assert.equal(inventory.length,15);assert.equal(geometry.length,111);assert.equal(qa.mobile.length,141);assert.deepEqual(qa.errors,[]);
const report={level:2,bookCount:15,bodyPages:111,pageCount:144,missingBooks:[],inventory,geometry,mobileChecks:141,approvedWordingChanged:false,preview:'http://127.0.0.1:4176/?view=level2-complete'};
fs.writeFileSync(path.join(out,'book-completion-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS:15 complete books;111 exact-text illustrated pages;15 covers and summaries;141 mobile checks;0 missing books.');
