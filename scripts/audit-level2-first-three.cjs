'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/level2-first-three-20261027'),qa=JSON.parse(fs.readFileSync(path.join(out,'browser-render-qa.json'),'utf8')),art=require('../miniprogram/lib/layered-art');
const records=[];
for(const b of qa.edition.books)for(const r of qa.records.filter(r=>r.id===b.id&&r.page>=0&&r.page<b.pages.length)){
 const p=art.planFor(b.id,r.page);records.push({number:b.number,page:r.page+1,background:p.background,source:path.resolve(root,'preview',art.imageUrl(p.background)),world:p.world||{width:1672,height:941},camera:JSON.parse(r.canvas.camera)});
}
assert.equal(records.length,23);fs.writeFileSync(path.join(out,'native-quality-input.json'),JSON.stringify(records,null,2));
const previous=path.join(root,'../output/level1-complete-15-20261027'),report=JSON.parse(fs.readFileSync(path.join(previous,'完成与检查记录.json'),'utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(report.pdf.path)).digest('hex'),report.pdf.sha256,'Level1 PDF must remain unchanged');
console.log('Collected23 native scene/camera records; level1 PDF unchanged.');
