'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {indexCharacters}=require('../../scripts/manuscript-series-audit.cjs');
const file='content/level1-reviewed-manuscript-source.json';
const d=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(d.edition,'reviewed-all-30-v7-remaining-stories');
const before=structuredClone(d);
fs.writeFileSync('output/text/manuscript-before-personalization-v8.json',JSON.stringify(before,null,2)+'\n');
fs.writeFileSync('content/level1-series-recurrence-baseline.json',JSON.stringify({edition:before.edition,characters:indexCharacters(before.books)},null,2)+'\n');
const b=n=>d.books[n-1],p=(n,i,...lines)=>b(n).pages[i-1]=lines;
p(5,2,'云来了，','山在云里不见了。');
p(5,3,'山，山，','你出来吧！');
p(6,2,'我不看，','妈妈把小石头放在手里。');
p(6,7,'妈妈问：还要玩吗？','还要！这回，我来放！');
b(6).focus='石头放看问玩';
p(7,1,'天上的白云走了。');
p(7,2,'黑云来了，','下雨了。');
p(10,2,'谁在树上叫？');
p(10,5,'谁又在树下叫？');
p(16,5,'小猫又坐上来了。','你在做什么？');
b(22).title='影子学我';
p(22,5,'影子，你真会学我！','你能学我坐下吗？');
p(22,8,'我学小兔，','影子学我。');
p(23,2,'我要给小鱼画一个家，','画水和绿草。');
p(23,3,'我画一条小鱼，','还画黄黄的月亮。');
p(23,4,'我还要画，','一条又一条！');
d.auxiliaryCharacters+='条';
d.gradingPolicy.allowedExceptionBooks=[6,7,18,24];
d.gradingPolicy.laterBooks='第4篇起常态每篇1–7个正文新字；第6、7、18、24篇为8字，分散到不同页。单页至多3个首次字。人数、年龄和班级改变时按实际正文重算，不把默认示例的负担套给所有孩子。';
const notes={
3:['按实际成员介绍并计数，保留漏数自己再加回的小转折。家庭介绍固定使用第2、3页，人数增加时在同页分组介绍，不增加正文页。每行及对应场景保留实际成员ID，不能只修改结尾数字。','此处默认孩子、爸爸、妈妈三人；四口、六口版本由设置生成，称谓、漏数后的数量、加回自己的总数及用字统计同时更新。'],
5:['云遮住山后孩子喊山出来；云走，山重新可见，末页说明山本身没走。','吧用于喊山出来的自然口吻；不把日常问句改成缺少主语的片段来迁就字数。'],
6:['妈妈藏、孩子猜。孩子不看妈妈放石头；第4页指第一只手，第5页打开为空，第6页打开另一只手见石头。末页由妈妈询问是否继续，孩子答应并提出由自己放石头，让妈妈猜。','完整保留提问者和回答者。问与玩在末页首次，手里使用已接触的里；中延后到第7篇雨中。不再让孩子问正在藏石头的妈妈还玩不玩。'],
7:['白云走、黑云来、开始下雨，交代连续天气变化；孩子撑伞后发现花在雨中，自己走过去陪花。花不能走，孩子愿意留下是童真愿望。','天、白在第1页，黑、雨在第2页，伞、中、和、外分后续页首次；默认示例本篇8个新字，单页最多2个。'],
10:['听见叫声，用谁在树上叫、谁又在树下叫寻找发声者，再发现小鸟换到自己的车上。','用完整的谁在何处叫，明确人在寻找发声者；不把问发声者和问声音位置拼成省略残句。'],
16:['孩子移走被占住的书，猫又坐上来，孩子问它在做什么；下一页睡着给出答案，末页自己改看猫。','做首次用于你在做什么这个完整问句；与画画的画区分，不把画一个家写成做一个家。'],
21:['按同一份孩子资料生成真实年龄和班级。陪玩的大人说一岁，与3–6岁的真实年龄均不同，孩子纠正时说自己的真实年龄和班级。大人由实际选中的家庭成员确定。','年龄、班级不能只改第1篇；第21篇的回应也必须同改。家庭只选妈妈或祖辈时，不虚构爸爸出场。'],
22:['孩子学兔跳，又发现影子跟着自己。先独立对影子说你真会学我，再试坐下；末页用我学小兔、影子学我的平行结构收束。','会、能、真在有明确主语的完整话里读；末页两句保持同样结构。默认本篇7个新字，单页最多3个。'],
23:['明确是在画本上画鱼的家、水草、小鱼和月亮，鱼画得多便把水域画大。最后画自己进去玩，保留生日书能认出的作品。','画一个家与画水草一致；小鱼用量词条，不为了沿用只而写错量词。条是本轮唯一新增的辅助字，按实际首次计入；做在第16篇完整问句中接触。']
};
const decisions={3:'接入家庭成员配置，四口、六口都介绍实际家人，并同步漏数结果、最终人数与统计；正文仍7页。',5:'顺写孩子喊山出来的口吻，同时让吧在完整场景中接触。',6:'末页改为妈妈问是否继续，孩子答应并提出这回自己放，行动角色清楚。',7:'补上白云走、黑云来、下雨的衔接。',10:'改成谁在树上叫、谁又在树下叫，使用完整自然的问句。',16:'孩子问占着书的猫你在做什么，下一页睡着回应；做有自然语境。',21:'真实年龄、班级与第1篇同源，陪玩的家人与所选成员一致。',22:'末页改成我学小兔、影子学我；真会学我的评价放在前面独立成句。',23:'画鱼的家使用画；同时将一只小鱼改为一条小鱼。'};
for(const [n,note]of Object.entries(notes)){b(+n).storyNote=note[0];b(+n).readingNote=note[1];b(+n).editorialReview.decision=decisions[n];}
b(6).editorialReview.ending='妈妈问还要不要玩，孩子继续，并提出这回自己放石头。';
b(22).editorialReview.ending='我学小兔，影子学我，两层模仿用同样的句式回应。';
d.title='第一级30篇故事·个性化与语句修订稿';d.edition='reviewed-all-30-v8-personalized';d.reviewDate='2026-10-18';
d.introduction='修正截图中的说话角色、天气衔接、完整问句、影子句式和画鱼用词；加入姓名、年龄、班级及实际家庭成员设置，正文和识字统计随设置变化。默认仍为221页，每篇页数不变。';
d.personalizationNote='姓名占位不计入识字量。年龄、班级由孩子设置分别确定，第1、21篇同步；家庭成员决定第3篇介绍、漏数与总人数，以及其他故事实际参与的大人。手机稿设置仅在当前浏览器保存，未自动写入账号后台。';
d.reviewedInThisEdition=Object.keys(decisions).map(Number);
d.rewrittenInThisEdition=d.books.filter((book,i)=>JSON.stringify(book.pages)!==JSON.stringify(before.books[i].pages)).map(book=>book.number);
delete d.naturalnessReview;delete d.previousNaturalnessReview;
d.currentRevision={baselineEdition:before.edition,baselinePageCounts:before.books.map(book=>book.pages.length),baselineBodyCharacters:indexCharacters(before.books).map(c=>c.character).join(''),allowedAddedCharacters:'条',decisions};
d.seriesReview.decisions=d.seriesReview.decisions.filter(entry=>!entry.books.includes(6)||entry.books.length<10);
d.seriesReview.decisions.push({books:d.reviewedInThisEdition,issue:'截图暴露的角色、衔接、语法与个性化缺口。',action:'按实际成员和孩子资料生成正文；逐项修正妈妈询问、黑云来下雨、完整声源问句、影子平行句和画鱼量词。人物、年龄改变后重算实际正文用字。'});
fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({changed:d.rewrittenInThisEdition}));
