'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { indexCharacters } = require('../../scripts/manuscript-series-audit.cjs');
const file = 'content/level1-reviewed-manuscript-source.json';
const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(draft.edition, 'reviewed-all-30-v5-natural-recurrence');
const before = structuredClone(draft);
const v4 = JSON.parse(fs.readFileSync('output/text/manuscript-before-recurrence-v5.json', 'utf8'));
fs.writeFileSync('output/text/manuscript-before-naturalness-v6.json', JSON.stringify(before, null, 2) + '\n');
fs.writeFileSync('content/level1-series-recurrence-baseline.json', JSON.stringify({edition:before.edition, characters:indexCharacters(before.books)},null,2)+'\n');
const get = n => draft.books[n - 1];
const page = (n,p,...lines) => {get(n).pages[p - 1]=lines;};
const restore = (n,p) => {get(n).pages[p - 1]=v4.books[n - 1].pages[p - 1];};
page(19,2,'我也给小花喝水，','把水浇在花盆里的土上。');
for (const p of [4,5,6,7]) restore(22,p);
for (const p of [4,5]) restore(23,p);
for (const p of [2,6,7]) restore(24,p);
page(24,8,'我坐到前面开车，','她在后面拿好票！');
page(25,3,'她吃一口，','她的还是比我的大！');
page(25,4,'她又吃一口。');
get(25).focus='果瓜比那';
restore(26,3);
restore(27,8);
page(28,6,'我看看娃娃，','又看看爸爸的嘴。');
for (const p of [2,7]) restore(29,p);
for (const p of [4,5,7]) restore(30,p);
page(30,7,'妈妈笑着说：我的生日还没到呢。','我说：我想让你也快乐！');

// Remove explanations of revisions that have now been withdrawn.
for (const n of [22,24,27,29]) {
  get(n).storyNote=v4.books[n-1].storyNote;
  get(n).readingNote=v4.books[n-1].readingNote;
}
for (const n of [15,17,19,23,25,26,28,30]) get(n).readingNote=get(n).readingNote.split(' 本轮复现：')[0];
get(15).readingNote+=' 推后球滚，承接第14篇的滚动动作，不另加游戏回合。';
get(17).readingNote+=' 咦随发现移动的菜叶自然出现，沿用第3篇的惊讶语气。';
get(19).readingNote+=' 土来自第12篇，这里指花盆里的土；保留浇水位置，不增加种花动作。';
get(25).readingNote='本篇只新增果，水果、两片瓜交代同一种食物。瓜来自第17篇，比来自第13篇，那来自第20篇，均在比较两人手中的瓜时出现。吃掉的瓜肉改变剩余量，用下一页的“我的大了”呈现结果，不再逐口报告少了多少。';
get(26).readingNote+=' 白菜是同一餐的配菜，菜随实物自然出现；删去额外的洗手步骤，保留原来喝水、吃饭的简短开场。';
get(28).storyNote='小花是本篇娃娃的名字，第2页明确交代。爸爸一直在场配音，娃娃本身无发声装置；抱起就静、放下又哭之后，孩子看向爸爸的嘴，随后发现声音来自爸爸。末尾小花也笑是爸爸模仿的笑声，不让玩具或真人头像凭空生成新表情。他指上一句的爸爸。';
get(28).readingNote+=' 抱对应照看娃娃的动作；嘴对应寻找发声的人。他指爸爸。不为复现眼睛给娃娃另加一项检查。';
get(30).readingNote+=' 水果蛋糕与书上写名字都属于现成的礼物细节；删去打开书之前的先、喜欢前的真的、妈妈笑之后的出声，让发现和对话直接往下走。';

const decisions={
  15:'连读后保留。“我一推，红球滚过去了”交代真实动作，也让小狗这次追到了球，复现没有拖慢情节。',
  17:'连读后保留。咦落在菜叶移动的发现处，不增加解释或岔开兔子带菜回家的线索。',
  19:'保留有用的浇水位置，把“花盆的土”顺为“花盆里的土”；脚湿、找水路和洗脚的童真结尾保持连贯。',
  22:'撤回为左右复现加入的来回走动，恢复跳、站、问能否坐、坐下、停住的模仿游戏。问话与下一页动作直接对应。',
  23:'撤回“再加一只”和“水太少”，恢复孩子还想画、一只又一只的兴头，再用住不下引出把水画大。',
  24:'撤回一共的计数说明、两人聊天和请求开车的问句；恢复“小火车，开吧！”之后无人开车的停顿，再问谁来开。',
  25:'调整比较句的语序；删去“瓜又少了一点”的解释，吃一口之后直接翻到“我的大了”，让读者看出变化。保留两片瓜和比、那的自然表达。',
  26:'删去为了复现洗加入的洗手步骤，回到简短就餐开场，让朋友发笑和嘴边饭粒更快出现。白菜仍是现成配菜。',
  27:'撤回“在风里飞”，恢复小鸟飞到树上。小鸟离开动物的背，我仍在爸爸背上，结尾的对照更明确。',
  28:'保留抱起娃娃；去掉专门看眼睛的安排，只从娃娃看向爸爸的嘴，让观察服务于找出配音的人。',
  29:'撤回穿睡衣的额外动作和“你们都住下了”，恢复“还想玩”到“我也想睡了”的变化，再发现自己没位置。',
  30:'删去先、真的、出声等附加措辞，保留水果蛋糕、书上写名字和认出自己的小鱼。礼物的惊喜与亲子对话是本篇重点。'
};
for(const [n,decision] of Object.entries(decisions))get(Number(n)).editorialReview.decision=decision;
get(22).editorialReview.pageTurn='跳、站之后，先问能不能学坐，再坐下、停住；每次变化都由孩子自己的动作引起。';
get(27).editorialReview.ending='小鸟飞到树上，孩子的小车还在走，爸爸的背接住了前面的比喻。';
get(28).editorialReview.pageTurn='抱起时哭声停止，放下又响；孩子从娃娃看向爸爸的嘴，再听到小花跟着爸爸笑。';
draft.title='第一级30篇故事·自然表达复审稿';
draft.edition='reviewed-all-30-v6-story-first';
draft.introduction='按顺序重读上一轮改过的12篇；撤回拖慢节奏或削弱转折的复现措辞，保留顺着情节成立的旧字。逐篇页数与首次用字安排不变。';
draft.reviewedInThisEdition=Object.keys(decisions).map(Number);
draft.rewrittenInThisEdition=draft.books.filter((b,i)=>JSON.stringify(b.pages)!==JSON.stringify(before.books[i].pages)).map(b=>b.number);
draft.seriesReview.decisions[draft.seriesReview.decisions.length-1]={books:draft.reviewedInThisEdition,issue:'上一轮为复现旧字补充的措辞，是否影响口语、悬念和笑点？',action:'本轮连读12篇，修改其中10篇，保留第15、17篇正文。撤回影子左右走、火车聊天、逐口解释瓜变少、穿睡衣和住下等安排；保留滚球、浇土、抱娃娃、配音时看嘴和书上写名字。允许复现数回落，以故事自然、好读为先。'};
delete draft.recurrenceRevision;
const firstPages = books => {const seen=new Set();return books.map(b=>b.pages.map(p=>{const chars=[...p.join('')].filter(c=>/\p{Script=Han}/u.test(c));const fresh=[...new Set(chars.filter(c=>!seen.has(c)))];chars.forEach(c=>seen.add(c));return fresh;}));};
draft.naturalnessReview={baselineEdition:before.edition,reviewedStories:draft.reviewedInThisEdition,baselinePageCounts:before.books.map(b=>b.pages.length),baselineBodyCharacters:indexCharacters(before.books).map(c=>c.character).join(''),baselineFirstExposureByPage:firstPages(before.books),decisions};
assert.deepEqual(firstPages(draft.books),draft.naturalnessReview.baselineFirstExposureByPage);
fs.writeFileSync(file,JSON.stringify(draft,null,2)+'\n');
console.log(JSON.stringify({reviewed:draft.reviewedInThisEdition,changed:draft.rewrittenInThisEdition}));
