const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../../content/level1-reviewed-manuscript-source.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
d.books[16].readingNote = '本篇六个正文新字分八页接触：菜、叶、兔、吃、少、瓜。叼在第15篇叼球时已经接触，这里复现同样的嘴衔物动作；叶为辅助字，全部计数。少随叶片一点点被吃掉理解，瓜留到孩子模仿回家吃的结尾。';
d.books[25].readingNote = '本篇七个新字包括妈妈做米饭的做。问在玩球篇已接触，此处复现为真实对话；嘴是笔画较多的辅助字，只随嘴边的图像和对话指认，不要求写字。牙移到真实的睡前刷牙动作，不再要求从兔子嘴边看清它的牙。';
d.books[20].editorialReview.decision = '撤换耳眼牙听逐项展示，改为用手挡眼的亲子找人游戏。';
d.books[21].editorialReview.ending = '庆祝这一次确实跳过纸片，再邀请自己练一回，不宣称已经能过所有障碍。';
fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
