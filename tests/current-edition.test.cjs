'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const current=require('../miniprogram/lib/current-edition'),source=require('../miniprogram/lib/complete-fifteen-manuscripts');
const {listBooks}=require('../miniprogram/lib/stories'),{createServicePlan}=require('../miniprogram/lib/print-service');
const {createEditionPlan,editionManifest}=require('../miniprogram/lib/print-plan');
const family=require('../miniprogram/lib/family'),{summarizeBooks}=require('../miniprogram/lib/literacy');
test('browser edition follows all 15 approved texts and uses stable versioned identities',()=>{
 const books=listBooks({name:'CHILD',age:5,className:'大班'},family.defaultMembers(),{currentEdition:true});
 assert.deepEqual(books.map(b=>b.id),source.books.map(b=>b.id));
 assert.deepEqual(books.map(b=>b.pages),source.books.map(b=>b.pages));
 assert.equal(books.reduce((n,b)=>n+b.pages.length,0),99);
 assert.equal(listBooks().length,3,'native catalogue is not silently migrated');
 assert.equal(listBooks(null,null,{includeApproved:true}).length,20,'historical catalogue stays available');
 const plan=createServicePlan(books);assert.equal(plan.volumeCount,1);assert.equal(plan.storyCount,15);assert.equal(plan.sample,false);
 assert.equal(plan.volumes[0].bookId,current.PRINT_ID);
 const pdf=createEditionPlan(books);assert.equal(pdf.pageCount,132);assert.equal(pdf.contentsCount,1);assert.equal(pdf.summaryCount,15);assert.equal(pdf.blankCount,0);
 assert.equal(pdf.id,current.PRINT_ID);assert.equal(editionManifest(pdf).edition,current.EDITION);
 for(const c of pdf.chapters){assert.equal(pdf.pages[c.startPage-1].bookId,c.bookId);assert.equal(pdf.pages[c.startPage-1].kind,'story-cover');assert.equal(pdf.pages[c.bodyStartPage-1].page,0);assert.equal(pdf.pages[c.startPage-1].folio,c.startFolio);}
});
test('personalization changes only intro and dynamic family; literacy excludes name slots',()=>{
 let members=family.defaultMembers();for(let i=0;i<5;i++)members=family.createSibling(members,'olderSister');
 const books=current.listBooks({name:'欧阳小星星',age:3,className:'小班'},members),base=current.listBooks({name:'CHILD',age:3,className:'小班'},members);
 assert.ok(books[0].pages.flat().join('').includes('欧阳小星星'));assert.ok(books[0].pages.flat().join('').includes('我三岁了'));
 assert.equal(books[2].scenes.at(-1).memberIds.length,family.participants(members).length);
 for(let i=1;i<15;i++)if(i!==2)assert.deepEqual(books[i].pages,source.books[i].pages);
 assert.ok(!summarizeBooks(base)[0].characters.includes('欧'));
 assert.equal(createEditionPlan(books).pageCount,132+books[2].pages.length-6);
 assert.deepEqual(source.books[0].pages[0],['你好！我是CHILD。'],'source manuscript is immutable');
});
