'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const draft=require('../content/level1-stories-reviewed-30.json');
const {defaultMembers,createSibling,participants}=require('../miniprogram/lib/family');
const {familyStory,personalizeReviewedBooks,auditReviewedBooks}=require('../miniprogram/lib/reviewed-personalization');
const membersFor=roles=>defaultMembers().map(m=>({...m,included:roles.includes(m.role)}));
const profile={name:'宁宁',age:5,className:'大班'};

test('four and six people: actual introductions, missed count, total and no added pages',()=>{
  for(const [roles,missed,total]of [
    [['child','dad','mom','youngerSister'],'三','四'],
    [['child','dad','mom','grandpa','grandma','olderBrother'],'五','六']
  ]){
    const members=membersFor(roles),story=familyStory(members);
    assert.equal(story.pages.length,7);
    assert.equal(story.pages[3][1],`一共有${missed}口人。`);
    assert.equal(story.pages[6][0],`我家有${total}口人。`);
    const introduced=story.scenes.slice(1,3).flatMap(s=>s.lineMemberIds.flat());
    assert.deepEqual(introduced,participants(members).filter(m=>m.id!=='child').map(m=>m.id));
    assert.equal(story.scenes[6].count,roles.length);
  }
});
test('3–6 years and independently selected classes stay consistent in stories 1 and 21',()=>{
  const ageWords={3:'三',4:'四',5:'五',6:'六'};
  for(const age of [3,4,5,6])for(const className of ['小班','中班','大班']){
    const books=personalizeReviewedBooks(draft.books,{...profile,age,className},defaultMembers());
    assert.equal(books[0].pages[3][0],`我${ageWords[age]}岁了。`);
    assert.deepEqual(books[20].pages[6],[`我${ageWords[age]}岁了！`,`我上${className}了！`]);
    assert.notEqual(books[20].pages[5][1],`${ageWords[age]}岁了吧？`);
    assert.equal(books.reduce((n,b)=>n+b.pages.length,0),221);
  }
});
test('one parent and grandparents: never insert a deselected parent; single caregiver does not speak as two people',()=>{
  for(const roles of [['child','mom'],['child','dad'],['child','grandpa','grandma']]){
    const books=personalizeReviewedBooks(draft.books,profile,membersFor(roles));
    const body=books.map(b=>b.pages.flat().join('')).join('');
    if(!roles.includes('dad'))assert.ok(!body.includes('爸爸'));
    if(!roles.includes('mom'))assert.ok(!body.includes('妈妈'));
    assert.ok(!body.includes('妈妈妈妈')&&!body.includes('爸爸爸爸'));
    if(roles.length===2)assert.ok(books[29].pages[4][0].includes('你画的，我做的'));
  }
});
test('up to twelve people, including duplicate sibling roles: all people are counted and introduced without adding pages',()=>{
  let members=defaultMembers().map(m=>({...m,included:true}));
  while(participants(members).length<12)members=createSibling(members,'olderSister');
  const story=familyStory(members);
  assert.equal(story.pages.length,7);
  assert.ok(story.pages.every(p=>p.length>0&&p.length<=2));
  assert.equal(story.pages[3][1],'一共有十一口人。');
  assert.equal(story.pages[6][0],'我家有十二口人。');
  assert.equal(new Set(story.scenes.slice(1,3).flatMap(s=>s.lineMemberIds.flat())).size,11);
});
test('statistics count actual family/age/class text and exclude personalized names',()=>{
  const four=membersFor(['child','dad','mom','youngerSister']);
  const a=auditReviewedBooks(personalizeReviewedBooks(draft.books,{name:'宁宁',age:4,className:'中班'},four,{forStatistics:true}));
  const b=auditReviewedBooks(personalizeReviewedBooks(draft.books,{name:'超级长名字八个字',age:4,className:'中班'},four,{forStatistics:true}));
  assert.deepEqual(a,b);
  assert.ok(a[2].characters.includes('妹'));
  assert.ok(!a[0].characters.includes('宁'));
  assert.ok(a[0].characters.includes('四')&&a[0].characters.includes('中'));
  assert.ok(a[22].newCharacters.includes('条'));
});
test('configuration validation does not silently invent an adult or coerce an invalid age',()=>{
  assert.throws(()=>personalizeReviewedBooks(draft.books,profile,membersFor(['child','olderSister'])),/实际参与的大人/);
  assert.throws(()=>personalizeReviewedBooks(draft.books,{...profile,age:2},defaultMembers()),/3 至 6 岁/);
});
