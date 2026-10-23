const fs = require('node:fs');
const assert = require('node:assert/strict');
const { uniqueHan, summarizeBooks } = require('../../miniprogram/lib/literacy');
const { indexCharacters } = require('../../scripts/manuscript-series-audit.cjs');
const file = 'content/level1-reviewed-manuscript-source.json';
const before = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(before.edition, 'reviewed-all-30-v4-series-and-recurrence');
fs.writeFileSync('output/text/manuscript-before-recurrence-v5.json', JSON.stringify(before, null, 2));
const d = structuredClone(before);
const set = (n, p, lines) => { d.books[n - 1].pages[p - 1] = lines; };
set(15, 6, ['我一推，', '红球滚过去了。']);
set(17, 3, ['我回头一看，', '咦，菜叶走了！']);
set(19, 2, ['我也给小花喝水，', '把水浇在花盆的土上。']);
set(22, 4, ['我走到左边，', '它也走到左边。']);
set(22, 5, ['你能到右边来吗？']);
set(22, 6, ['我走到右边，', '它也走到右边。']);
set(22, 7, ['我坐下不动了，', '它也坐着不动。']);
set(23, 4, ['我再加一只小鱼，', '一只，又一只！']);
set(23, 5, ['小鱼太多，水太少！', '家里住不下了！']);
set(24, 2, ['她放好小椅子。', '一共三把：前面一把，后面两把。']);
set(24, 6, ['我和她说着话，', '小火车还没有开。']);
set(24, 7, ['前面没有人！', '我能来开车吗？']);
set(25, 1, ['我和朋友吃水果。', '两片瓜，一片大，一片小。']);
set(25, 2, ['我拿这片小的，', '她拿那片大的。']);
set(25, 3, ['她吃一口，', '还是她的比我的大！']);
set(25, 4, ['她又吃一口，', '瓜又少了一点。']);
set(25, 7, ['她看着我的瓜笑：', '这回，又是我的大！']);
set(26, 2, ['有豆子和白菜，', '还有一个蛋。']);
set(26, 3, ['我和朋友洗好手，', '一起喝水、吃饭。']);
set(27, 8, ['小鸟在风里飞，', '我的小车还在走！']);
set(28, 4, ['我抱起小花，', '哭声没有了。']);
set(28, 6, ['我看看娃娃的眼睛，', '又看看爸爸的嘴。']);
set(28, 7, ['他笑了。', '小花也笑了！']);
set(29, 2, ['我穿好睡衣，刷好牙，', '还想玩。']);
set(29, 7, ['你们都住下了，', '我在哪睡呢？']);
set(30, 2, ['妈妈拿来水果蛋糕，', '爸爸拿来一本新书。']);
set(30, 3, ['书上写着我的名字。', '这是我的书？']);
set(30, 4, ['我先把书打开。', '我画的小鱼也在书里！']);
set(30, 5, ['爸爸说：你画的，我们做的。', '我真的很喜欢我的书！']);
set(30, 7, ['妈妈笑出声：我的生日还没到呢。', '我说：我想让你也快乐！']);

const notes = {
  15: ['推一下后球滚动，才让狗真正追球；滚承接第14篇球从怀里滑落后滚走，受力原因不同。', '把原来的推过去写具体为我一推、球滚过去，没有增添一次抛球或另一轮游戏。'],
  17: ['咦沿用第3篇的惊讶语气，这里对应发现菜叶在移动。', '只补惊叹词，菜叶被兔子叼走的过程与页数不变。'],
  19: ['土来自第12篇，这次是花盆里承接浇水的土。浇在土上与随后水从盆底流出的过程相连。', '把浇水位置说清楚；不另加种花或玩泥土的事件。'],
  22: ['左、右来自第20篇追纸。影子游戏中改为向画面左侧、右侧移动，再坐下停住；所用字此前都出现过。', '用左右移动替换原本重复的站好，让孩子继续试影子如何跟随；末页我学兔、影子学我的回应保留。'],
  23: ['加来自第3篇，把小鱼一只只添进画中；少来自第17篇吃叶，这次与多对照，指画出的水域容不下那么多鱼。', '加和少都用于原来的添鱼、扩大水域，不增加新的物品或任务。'],
  24: ['一共来自第3篇，用于原有三把椅子的总数与前后分布；话来自第21篇，用于两个乘客聊天；能来自第22篇，用于商量谁来开。', '准备、都坐后排、发现前座空着、主动提出开车的结构保留；没有新加乘客和车票。'],
  25: ['瓜、少来自第17篇；比来自第13篇；那来自第20篇。水果这一词由以前的水和本篇原有的新字果组成，不增加首次字。', '把原来未具体指明的果子明确为两片瓜；仍由实际吃掉的量改变大小关系，不增加分瓜、切瓜或竞赛环节。'],
  26: ['洗从第19篇洗脚接到饭前洗手；菜从第17篇喂兔接到普通白菜配菜。喝水和吃饭仍保留。', '沿用原有就餐场景和笑饭粒的事件，只写清饭前动作与配菜。'],
  27: ['风来自第20篇；末页鸟离开动物自己飞，孩子仍坐在爸爸背上，风只描述飞行环境，不解释为风把鸟推走。', '结尾保留鸟已经离开小车、我的小车仍在走的对照；没有另加风把物品吹走的事件。'],
  28: ['抱来自第14篇；眼睛来自第21篇，嘴和他来自第26篇。孩子抱娃娃、检查娃娃眼睛和爸爸嘴部的反应，与辨认配音的人有关。', '把拿起明确为抱起、把看娃娃和爸爸明确到眼睛与嘴；没有增加换装、检查身体等支线。'],
  29: ['穿来自第18篇，睡衣由已接触的睡和衣组成；住来自第23篇，这里是孩子把上床的玩具和小狗当作住客的说法。', '在原来刷牙的一页完成穿睡衣，仍是睡前准备；发现床被占满的结尾不增加事件。'],
  30: ['水果承接第25篇，写来自第24篇写车票，先来自第29篇，真来自第22篇，声来自第28篇。它们分别落在原有蛋糕、书名、翻书、喜欢礼物和妈妈笑的细节中。', '生日书的来历、看到自己的画和亲子回应保留；没有再加入吃饭、收新玩具等复习段落。']
};
for (const [number, [reading, decision]] of Object.entries(notes)) {
  const b = d.books[number - 1];
  b.readingNote += ' 本轮复现：' + reading;
  b.editorialReview.decision = decision;
}
d.books[21].storyNote += '左右以固定画面的地面区域为参照；保持同一光源，孩子与自己的影子同时移向该区域。不能把影子画成自己听到命令才独立走动。坐下与停住合在同一页呈现。';
d.books[21].editorialReview.pageTurn = '跳之后再试左右移动，最后坐下停住；影子总随自己的动作同步变化。';
d.books[24].focus = '果瓜比少那';
d.books[24].storyNote = '同一女孩与孩子各拿一片瓜，最初大小差距不大。每次吃掉的瓜肉必须可见，比较的是剩余可吃部分的量，不能让瓜皮凭空缩短、让瓜长大或每页换一片。女孩吃两口后少于孩子未吃的一片；孩子再吃一口后，又少于女孩剩下的。';
d.books[24].editorialReview.pageTurn = '女孩吃两口后，原本小的那片剩得更多；孩子吃一口又改变剩余量。';
d.books[26].storyNote += '末页鸟已经离开动物背上，在风里自己飞；孩子仍由爸爸背着走。风不承担把鸟或人凭空推走的原因。';
d.books[27].editorialReview.pageTurn = '抱起和放下时哭声出现、消失；孩子再看娃娃的眼睛和爸爸的嘴，发现爸爸正在配音。';
d.books[27].storyNote += '第6页观察娃娃的固定眼睛与爸爸的嘴，只作为寻找声源的线索；不声称没有眼泪就不是真哭，也不让玩具眼睛产生未经设定的动作。他明确指上一句的爸爸。';
d.books[28].storyNote += '睡衣与原来放好的外出衣服区分；住下了是孩子对上床的玩具和小狗的拟人说法。';
d.books[29].storyNote += '生日蛋糕具体为水果蛋糕，不另加一盘水果或新的用餐事件。封面上的名字由父母写好，与第24篇游戏纸票上的名字形成不同情境的复现。';

d.title = '第一级30篇故事·常用字自然复现稿';
d.edition = 'reviewed-all-30-v5-natural-recurrence';
d.introduction = '保留30篇原有情节与逐篇页数，在已有动作、对话和物件中补充常用字复现；本轮不增加任何此前未出现的正文汉字。';
d.reviewedInThisEdition = d.books.map(b => b.number);
d.rewrittenInThisEdition = d.books.filter((b,i) => JSON.stringify(b.pages) !== JSON.stringify(before.books[i].pages)).map(b => b.number);
d.seriesReview.wordTargets = [...new Set([...d.seriesReview.wordTargets.filter(w => w !== '新书'), '共', '咦', '加', '土', '比', '抱', '滚', '菜', '少', '瓜', '穿', '洗', '左', '右', '那', '眼睛', '话', '能', '真', '住', '写', '果', '他', '嘴', '风', '先', '声', '新'])];
d.seriesReview.decisions.push({books:d.rewrittenInThisEdition, issue:'上版仍有部分常用字只在一篇正文出现。', action:'本轮只替换或补足已有情境中的说法：推后球滚、抱娃娃、浇盆土、饭前洗手、比较瓜的剩余量、在书上写名字。每篇页数及首次字负担保持原样，完整正文字符集合不变。未找到合适位置的字继续列为回读项。'});
d.seriesReview.limits = '只计实际正文，标题、目录、提示和字表不算复现；同篇反复不算跨篇。仍只出现一篇的字如冷、短、耳朵、米饭等，不为清空名单另外编情节。第30篇才引入的生、糕、打、乐、爱、年在本套中没有后续篇，留作原篇复读及以后内容的衔接。';

const oldIndex = indexCharacters(before.books);
const newIndex = indexCharacters(d.books);
assert.deepEqual(newIndex.map(c=>c.character).sort(), oldIndex.map(c=>c.character).sort(), 'No added or removed body characters');
assert.deepEqual(d.books.map(b=>b.pages.length), before.books.map(b=>b.pages.length), 'Every story keeps its page count');
const oldStats = summarizeBooks(before.books), newStats = summarizeBooks(d.books);
assert.deepEqual(newStats.map(b=>[...b.newCharacters].sort()), oldStats.map(b=>[...b.newCharacters].sort()), 'No new character is shifted earlier or added to a story');
for(const c of newIndex) assert.equal(c.firstStory, oldIndex.find(o=>o.character===c.character).firstStory);
const bridged = newIndex.filter(c=>c.distinctStories>1 && oldIndex.find(o=>o.character===c.character).distinctStories===1);
d.recurrenceRevision = {
  baselineEdition:before.edition,
  baselinePageCounts:before.books.map(b=>b.pages.length),
  baselineFirstExposureCharacters:oldStats.map(b=>b.newCharacters.join('')),
  baselineBodyCharacters:uniqueHan(before.books.flatMap(b=>b.pages.flat()).join('')).join(''),
  formerlySingleCharacters:oldIndex.filter(c=>c.distinctStories===1).map(c=>c.character).join(''),
  newlyRepeatedCharacters:bridged.map(c=>c.character).join(''),
  changes:notes
};
// Baseline is the edition the user just reviewed, not a much older draft.
fs.writeFileSync('content/level1-series-recurrence-baseline.json', JSON.stringify({edition:before.edition,characters:oldIndex},null,2)+'\n');
fs.writeFileSync(file, JSON.stringify(d,null,2)+'\n');
console.log(JSON.stringify({changedStories:d.rewrittenInThisEdition,bridged:bridged.map(c=>({character:c.character,books:c.books})),remainingSingle:newIndex.filter(c=>c.distinctStories===1).map(c=>c.character).join(''),bodyPages:d.books.reduce((s,b)=>s+b.pages.length,0),newCharactersAdded:0},null,2));
