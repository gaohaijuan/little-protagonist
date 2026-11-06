'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'../output/revised-eleven-20261027');
const qa=JSON.parse(fs.readFileSync(path.join(out,'browser-render-qa.json'),'utf8')),art=require('../miniprogram/lib/layered-art');
const books=qa.edition.books.filter(b=>qa.edition.localNumbers.includes(b.number)),records=[];
for(const b of books)for(const r of qa.records.filter(r=>r.id===b.id&&r.page>=0&&r.page<b.pages.length)){
 if(b.id==='family'){records.push({number:b.number,page:r.page+1,source:path.join(root,'preview/art/sequence/books-11-15/play-courtyard.png'),world:{width:1000,height:1000},camera:{x:0,y:0,width:1512/1547*1000,height:1000}});continue;}
 const p=art.planFor(b.id,r.page);records.push({number:b.number,page:r.page+1,background:p.background,source:path.resolve(root,'preview',art.imageUrl(p.background)),world:p.world||{width:1672,height:941},camera:JSON.parse(r.canvas.camera)});
}
assert.equal(records.length,56);fs.writeFileSync(path.join(out,'native-quality-input.json'),JSON.stringify(records,null,2));
console.log('Collected 56 actual scene/camera records.');

