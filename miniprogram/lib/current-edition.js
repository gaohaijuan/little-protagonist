'use strict';
const manuscript=require('./complete-fifteen-manuscripts');
const {personalize}=require('./revised-edition');
const {normalizeProfile}=require('./profile');
const {defaultMembers}=require('./family');
const EDITION=manuscript.edition;
const PRINT_ID='level-1-fifteen-v1';
function listBooks(profile,members){
  const child=normalizeProfile(profile||{});
  // CHILD is an intentional non-Han placeholder used for literacy statistics.
  if(profile?.name==='CHILD')child.name='CHILD';
  return personalize(manuscript,child,members||defaultMembers()).books.map(book=>({...book,
    edition:EDITION,tag:'起步阅读',group:'第 '+book.number+' 篇',
    description:'第一级 · 第'+book.number+'篇，和小主角一起读故事。',tone:'green'}));
}
function matches(books){return books.length===manuscript.books.length&&books.every((b,i)=>b.id===manuscript.books[i].id&&b.edition===EDITION);}
function orderPlan(){return {edition:EDITION,level:1,storyCount:15,volumeCount:1,sample:false,
  volumes:[{number:1,firstStory:1,lastStory:15,storyCount:15,bookId:PRINT_ID}]};}
module.exports={EDITION,PRINT_ID,listBooks,matches,orderPlan};
