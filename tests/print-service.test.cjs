'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createServicePlan}=require('../miniprogram/lib/print-service');
const {listBooks}=require('../miniprogram/lib/stories');
test('print service lists only actual illustrated content and keeps 10 levels honest',()=>{
  const books=listBooks({name:'豆包',age:4,className:'中班'},undefined,{includeApproved:true});
  const plan=createServicePlan(books,1);
  assert.equal(plan.storyCount,20);assert.equal(plan.volumeCount,2);assert.equal(plan.sample,true);
  assert.deepEqual(plan.volumes[0].books,books.slice(0,10));assert.equal(plan.volumes[0].firstStory,1);assert.equal(plan.volumes[0].lastStory,10);
  assert.deepEqual(plan.volumes[1].books,books.slice(10));assert.equal(plan.volumes[1].firstStory,11);assert.equal(plan.volumes[1].lastStory,20);
  for(let level=2;level<=10;level++){const pending=createServicePlan(books,level);assert.equal(pending.available,false);assert.deepEqual(pending.volumes,[]);}
});
test('30 stories become three ordered ten-story volumes without duplication or filler',()=>{
  const books=Array.from({length:30},(_,i)=>({id:'story-'+(i+1),title:'故事'+(i+1),pages:[['我来了。']]}));
  const plan=createServicePlan(books);
  assert.equal(plan.volumeCount,3);assert.equal(plan.sample,false);
  assert.deepEqual(plan.volumes.map(v=>[v.firstStory,v.lastStory,v.storyCount]),[[1,10,10],[11,20,10],[21,30,10]]);
  assert.deepEqual(plan.volumes.flatMap(v=>v.books),books);
  assert.deepEqual(createServicePlan(books.slice(0,11)).volumes.map(v=>v.storyCount),[10,1]);
});
test('invalid levels, unfinished and duplicate stories cannot be ordered',()=>{
  for(const level of [0,11,1.5,'1'])assert.throws(()=>createServicePlan([],level));
  assert.throws(()=>createServicePlan([{id:'unfinished',pages:[]}]));
  assert.throws(()=>createServicePlan([{id:'same',pages:[['我']]},{id:'same',pages:[['你']]}]));
});
