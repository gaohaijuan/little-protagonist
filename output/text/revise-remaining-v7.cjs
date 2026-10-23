'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { indexCharacters } = require('../../scripts/manuscript-series-audit.cjs');
const file='content/level1-reviewed-manuscript-source.json';
const draft=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(draft.edition,'reviewed-all-30-v6-story-first');
const before=structuredClone(draft);
fs.writeFileSync('output/text/manuscript-before-remaining-v7.json',JSON.stringify(before,null,2)+'\n');
fs.writeFileSync('content/level1-series-recurrence-baseline.json',JSON.stringify({edition:before.edition,characters:indexCharacters(before.books)},null,2)+'\n');
const book=n=>draft.books[n-1];
const page=(n,p,...lines)=>{book(n).pages[p-1]=lines;};
page(6,2,'我不看，','妈妈把小石头放在手中。');
page(6,3,'我数一、二、三。','妈妈，好了吗？');
page(6,4,'在这只手里吗？');
page(6,5,'咦，小石头不在！','我再来！');
page(6,6,'小石头在这里！');
page(6,7,'妈妈，还要来吗？','这回，我来吧！');
book(6).focus='石头放中看吧';
book(6).storyNote='孩子明确不看妈妈放石头，数完后才开始猜。第4页指第一只闭着的手，第5页妈妈摊开这只空手；第6页再摊开另一只手，露出石头。第7页孩子拿过石头，轮到妈妈猜。两次揭示的手必须不同，画面不能先让孩子看见石头在哪，再假装猜不到。两只手在同一场景中连续呈现，不用新角色或道具解释。';
book(6).readingNote='本篇仍新增8字：石、头、下、看、放、中、二、吧，单页最多3字。看从第8篇提前到这里，是说清孩子不偷看的必要词；玩不再硬放在结尾，延后到第10篇邀请小鸟一起玩。末页用这回我来让亲子交换角色。';
page(7,8,'伞外还在下雨，','小花，我不走！');
book(7).storyNote='孩子叫花到伞下来，花不能移动，便自己走到花边撑伞。第7页呈现两者同在伞下，第8页写雨还在下、孩子愿意留下陪花，不再把同一位置解释一次。花始终根植原地；这是童真愿望，不把避雨当作植物养护知识。';
book(7).readingNote='和在一起撑伞时出现，外用于最后的伞外雨景。末句我不走承接第5篇的走，表达留下陪花，不再额外说明谁在伞下。7个新字的首次页不变。';
page(10,2,'在树上吗？');
page(10,5,'这回，在树下吗？');
book(10).readingNote='问声源在哪里，再翻页找到小鸟、小猫；树上与树下不是两次孤立点名。玩首次在第3页的邀请中出现，本篇由6字变为7字，单页最多2个首次字；不是增加全套新字。树与鸟仍分在相邻两页。';
page(13,4,'爸爸，爸爸，','我长高了！');
page(13,5,'我一下来，','小树又高了！');
page(13,6,'我看看小石头，','爸爸也看看小石头。');
page(13,7,'小树，明天再比！','我也要长高！');
book(13).storyNote='孩子站上矮石头后比小树高，兴奋地叫爸爸看自己长高了；一走下石头，又比小树矮。孩子与爸爸一起看向那块石头，读者看出刚才只是站高了。末页是孩子真想长高的愿望，明天再比只是约定，不暗示一天就能长到树高。爸爸在原场景旁边听见孩子叫他后关注孩子；不改变人物、石头或树的固有尺寸。';
book(13).readingNote='保留今天、早上、问、比、站、明、长的7字新增量。长高从末页提前到孩子喊爸爸看的第4页，该页只首次出现长；明仍在末页。站上石头和身体长高的区别由走下后的结果呈现，不额外加入解释词。';
page(14,5,'两个小球，','我都喜欢，都要拿回家！');
page(14,6,'我拿来小车，','把两个球都放进去。');
book(14).storyNote='孩子抱第二只球时第一只从臂弯滚落，去拿第一只时另一只又滚开。第5页明确两只球都想带走，第6页由孩子拿来已有的小车装球，第7页一起回家。球的滚动由抱持不稳引起，车也由孩子取来，不画成球自己逃跑或小车被叫来就自己开过来。';
book(14).readingNote='抱、滚仍分两页首次。喜欢附着两只球都想带回家的愿望；拿、放、推服务于一次搬运问题的解决。新增字和首次页均不变。';
page(18,8,'爸爸穿大鞋，','我走在爸爸前面！');
book(18).readingNote='本篇8个新字，冷、穿衣服、鞋长短、脚、书包分不同页接触，每页仍不超过3个首次字。服为辅助字；包与书组成日常词。把不完整的爸爸前顺为爸爸前面，面早在第15篇出现，不增加新字。';
page(21,4,'爸爸走到我后面，','叫我的名字。');
page(21,5,'爸爸问：','谁的耳朵在外面？');
page(21,6,'我家的小娃娃，','一岁了吧？');
book(21).storyNote='孩子用手遮住眼睛、保持不说话，以为这样爸爸就找不到自己。爸爸数完再来，走到孩子后面叫名字，指耳朵逗孩子，孩子仍没出声；爸爸故意把年龄说成一岁，孩子终于忍不住纠正，结束游戏。爸爸早已看见孩子，只是在陪玩。手部用遮挡层，不重新生成闭眼表情。五岁、大班沿用第1篇示例；按真实年龄改写时，故意说错的年龄也须另行核对。';
book(21).readingNote='眼睛、耳朵分开首次。后用于爸爸走到孩子后面，构成寻找动作，不再为后把爸爸突然放在门后。话随不说话出现，娃在爸爸故意说错年龄时出现；正文仍新增7字，各字首次页不变。数字、名字、五岁、大班自然回应第1篇。';
const decisions={
1:'保留互动介绍。姓名、年龄、班级依次把问话交给读者，每一问都有真实应答位置；本篇作为亲子开场，不另编冲突。',
2:'保留已确定的数数诗。节奏递进后以花瓣飞散收尾，适合指图跟读；片须由花瓣画面指明，不把它当作一篇情节故事。',
3:'保留。数完才发现漏掉自己，读者可以提前发现问题；最后三口人回应开头，不增加家人或凑称谓。',
4:'保留手指游戏。合手藏花、问花还来不来、张手让花回来，有孩子可实际参与的期待；开关是游戏口令，不作为日常动作描写的通用模板。',
5:'保留短小的观察谜题。先只看见山消失，最后确认山没有走；云遮住山的因果清楚，不再添加寻找伙伴的支线。',
6:'改清游戏规则：孩子先不看，再数数、猜错一次、看到另一只手的石头；结尾交换角色。删去逐只手开关的机械口令。',
7:'保留花不来、孩子自己走过去的转折；最后不重复两人都在伞下，改为雨还在下、孩子愿意留下陪花。',
8:'保留红云与太阳的两次辨认。第一次猜错，第二次才看到太阳，末尾孩子也要出去；每次天边变红有不同答案。',
9:'保留水中月亮的发现。触水后找不到、抬头确认天上仍在、停止扰水后再见倒影，动作都与寻找结果相连。',
10:'把树上有什么、树下有什么改为寻找声源的位置问句，让问题与下一页发现对应；最后小鸟换到自己的车上，回应它去哪了。',
11:'保留。载石超出门口高度导致进不去，拿下石头后才能通过；第二次推仍失败，给下一页查原因留下停顿。',
12:'保留孩子把手当山、虫上手后发痒、放低手让虫下去的身体小笑话；痒和想让虫离开形成变化，不是单纯描写爬行。',
13:'删去第二轮重复上下石头，改成孩子叫爸爸看自己长高了；下来后又矮于小树，两人看向石头，结尾才是真想长高。',
14:'明确两只球都要带回家，再让孩子拿来小车装球；喜欢不再单独悬空，小车也不靠一句来就自行出现。',
16:'保留。孩子移走书、猫再次占书、最后睡着，打断阅读的程度在加深；结尾我看小猫回应原本想看书。',
18:'保留穿大鞋想当大人、迈步却脱鞋、换回小鞋反而走在前面的反差；只把爸爸前顺为爸爸前面。',
20:'保留。左右追纸服务于想画伞却一直画不了的问题；压上石头后风再来，结果改变，末尾回到画画。',
21:'爸爸走到孩子后面继续陪玩；把一岁就会说话吗改为直接说错年龄，孩子纠正五岁、大班才有清楚的触发原因。'
};
for(const [n,decision] of Object.entries(decisions))book(Number(n)).editorialReview.decision=decision;
Object.assign(book(6).editorialReview,{hook:'看不到妈妈把石头放进哪只手，孩子会先猜哪只？',pageTurn:'第一只手是空的，第二只才见石头；末页孩子接过石头让妈妈来猜。',ending:'轮到孩子出题，游戏可以继续。'});
book(7).editorialReview.ending='孩子自己走到花边，雨还在下也愿意陪花留下。';
Object.assign(book(13).editorialReview,{form:'把站高当成长高的小误会',hook:'孩子站上石头就说长高了，走下来还高吗？',pageTurn:'兴奋地叫爸爸看，走下来结果又变了；两人看向石头，读者能自己看出原因。',ending:'孩子想真正长高，约小树明天再比。'});
book(21).editorialReview.pageTurn='叫名字、提耳朵都没让孩子开口，故意把年龄说成一岁，孩子才急着纠正。';
book(8).readingNote=book(8).readingNote.replace('日出与太阳按词块读','看已在第6篇猜石头前出现；本篇新增6字。日出与太阳按词块读');
// Fix an existing note that omitted 给; body text is untouched.
book(17).readingNote=book(17).readingNote.replace('本篇六个正文新字分八页接触：菜、叶、兔、吃、少、瓜','本篇七个正文新字分八页接触：菜、叶、兔、给、吃、少、瓜');
draft.title='第一级30篇故事·全册自然表达复审稿';
draft.edition='reviewed-all-30-v7-remaining-stories';
draft.introduction='本轮连读剩余18篇，修改7篇、保留11篇；与上一轮12篇合起来，30篇均已按自然表达和情节趣味复审。逐篇页数不变，不增加全套正文汉字。';
draft.reviewedInThisEdition=Object.keys(decisions).map(Number);
draft.rewrittenInThisEdition=draft.books.filter((b,i)=>JSON.stringify(b.pages)!==JSON.stringify(before.books[i].pages)).map(b=>b.number);
draft.completedNaturalnessReviewStories=Array.from({length:30},(_,i)=>i+1);
draft.previousNaturalnessReview={edition:before.edition,reviewedStories:before.reviewedInThisEdition,decisions:before.naturalnessReview.decisions};
const firstPages=books=>{const seen=new Set();return books.map(b=>b.pages.map(p=>{const chars=[...p.join('')].filter(c=>/\p{Script=Han}/u.test(c));const fresh=[...new Set(chars.filter(c=>!seen.has(c)))];chars.forEach(c=>seen.add(c));return fresh;}));};
draft.naturalnessReview={baselineEdition:before.edition,reviewedStories:draft.reviewedInThisEdition,baselinePageCounts:before.books.map(b=>b.pages.length),baselineBodyCharacters:indexCharacters(before.books).map(c=>c.character).join(''),baselineFirstExposureByPage:firstPages(before.books),preserveFirstExposureByPage:false,expectedMovedFirstCharacters:'看玩长',decisions};
draft.seriesReview.decisions.find(d=>JSON.stringify(d.books)==='[13,25]').action='第13篇写孩子把站上石头误当长高，走下来才露出小误会；第25篇比较吃掉瓜肉后的剩余量。不再把第13篇写成两轮上下轮换，两篇的笑点和变化原因不同。';
draft.seriesReview.decisions.find(d=>JSON.stringify(d.books)==='[5,6,9]').action='保留云遮山、猜石头和水中倒影三个不同机制。第6篇明确孩子不看，妈妈准备好才猜，先猜错再揭晓，结尾交换角色；不只是同一物品不见、回来。';
draft.seriesReview.decisions.push({books:draft.reviewedInThisEdition,issue:'剩余18篇有没有只串动作、用字，或把情节依据留给编辑说明？',action:'第6篇补正文里的不看与角色交换；第13篇用夸口长高和走下石头的落差替换重复动作；第21篇让说错年龄直接引出纠正。另顺写第7、10、14、18篇，其余11篇按互动、诗、游戏、观察各自的形式保留。'});
assert.equal(draft.rewrittenInThisEdition.length,7);
fs.writeFileSync(file,JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({reviewed:draft.reviewedInThisEdition,changed:draft.rewrittenInThisEdition}));
