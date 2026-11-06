'use strict';
const family=require('./family'),literacy=require('./literacy');
function familyStory(members){
 const selected=family.participants(members),others=selected.filter(m=>m.id!=='child'),all=selected.map(m=>m.id),pages=[],scenes=[];
 const add=(text,ids,kind='member')=>{pages.push([text]);scenes.push({kind,memberIds:ids.slice()});};
 add('我家有几口人？',['child']);
 if(!others.length){add('这是我。',['child']);add('有一口人！',['child'],'group');return {pages,scenes};}
 for(const member of others)add('这是'+family.roleLabel(member.role)+'。',[member.id]);
 const word=n=>n===2?'两':family.numberWord(n);
 add('有'+word(others.length)+'口人。',others.map(m=>m.id),'count');
 add('不对，把我自己忘了！',['child'],'remember');
 add('有'+word(selected.length)+'口人！',all,'group');
 return {pages,scenes};
}
function personalize(source,profile,members){
 const books=source.books.map(b=>({...b,pages:b.pages.map(p=>p.slice())}));
 const demographics=t=>t.replace('我五岁了。','我'+family.numberWord(profile.age)+'岁了。').replace('我上大班了。','我上'+profile.className+'了。');
 const introText=t=>demographics(t).replaceAll('CHILD',profile.name);
 for(const b of books)if(b.number===1){b.title=introText(b.title);b.pages=b.pages.map(p=>p.map(introText));}
 const f=books.find(b=>b.id==='family');if(f)Object.assign(f,familyStory(members));
 const course=source.course.map(b=>({...b,pages:b.number===3?familyStory(members).pages:b.number===1?b.pages.map(p=>p.map(t=>demographics(t))):b.pages}));
 // Name slots remain non-Han in statistics; family count/intros reflect actual settings.
 const stats=literacy.summarizeBooks(course);
 return {...source,books,stats:books.map(b=>({...stats.find(s=>s.number===b.number),id:b.id}))};
}
module.exports={familyStory,personalize};

