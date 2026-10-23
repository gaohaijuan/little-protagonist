'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { uniqueHan, summarizeBooks } = require('../miniprogram/lib/literacy');
const { listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers } = require('../miniprogram/lib/family');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'));
const draft = read('level1-stories-condensed-20.json');
const plan = read('level1-character-plan.json');
const allowed = new Set(plan.characters);
const summaries = summarizeBooks(draft.books);
const baseline = listBooks({ name: 'CHILD', age: 5, className: '大班' }, defaultMembers());
const old = baseline.concat(...['level1-stories-04-10.json', 'level1-stories-11-20.json', 'level1-stories-21-40.json'].map(file => read(file).books));
const show = value => String(value).replaceAll('CHILD', '小主角').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const joined = values => [...values].map(show).join(' · ') || '无';
assert.equal(draft.status, 'text-draft-awaiting-user-review');
assert.equal(allowed.size, 200);
assert.deepEqual(draft.books.map(book => book.number), Array.from({ length: 20 }, (_, i) => i + 1));
assert.equal(new Set(draft.books.map(book => book.id)).size, 20);
for (const [index, book] of draft.books.entries()) {
  assert.equal(book.pages.length, 6, `${book.number}: exactly six complete body scenes`);
  assert.ok(book.pages.every(page => page.length >= 1 && page.length <= 2 && page.every(line => typeof line === 'string' && line.trim())));
  assert.deepEqual(uniqueHan(book.title + book.pages.flat().join('')).filter(c => !allowed.has(c)), [], `${book.number}: title and body stay within the list`);
  for (const field of ['focus', 'storyNote', 'readingNote']) assert.ok(typeof book[field] === 'string' && book[field].trim());
  for (const c of book.focus) assert.ok(summaries[index].characters.includes(c), `${book.number}: focus ${c} must occur in the body`);
}
assert.deepEqual(draft.books.slice(0, 2).map(b => b.pages), baseline.slice(0, 2).map(b => b.pages), 'The first two approved six-page manuscripts must be preserved.');
assert.deepEqual([...allowed].filter(c => !summaries.at(-1).cumulativeCharacters.includes(c)), [], 'Cover every planned character in body text.');
assert.equal(summaries.at(-1).cumulativeCount, 200, 'No outside-list auxiliary characters enter the condensed edition.');
const price = draft.cost.pricePerA4PrintedFace;
assert.equal(price, 0.5);
const bodyFaces = draft.books.reduce((n, book) => n + book.pages.length, 0);
const coverFaces = draft.books.length * draft.cost.outerCoverFacesPerBook;
assert.equal(draft.cost.outerCoverFacesPerBook, 1, 'Cover and summary share one A4 face.');
const oldBodyFaces = old.reduce((n, book) => n + book.pages.length, 0);
const oldCoverFaces = old.length;
assert.equal(oldBodyFaces, draft.cost.oldBodyFaces);
assert.equal(old.length, draft.cost.oldBookCount);
const totalFaces = bodyFaces + coverFaces;
const oldFaces = oldBodyFaces + oldCoverFaces;
const cost = totalFaces * price;
const saved = (oldFaces - totalFaces) * price;
const peakNewPerPage = draft.books.map((b, i) => {
  const newSet = new Set(summaries[i].newCharacters);
  return Math.max(...b.pages.map(lines => uniqueHan(lines.join('')).filter(c => newSet.has(c)).length));
});
const cards = draft.books.map((book, index) => {
  const stats = summaries[index];
  return `<article id="book-${book.number}"><header><span class="label">第 ${book.number} 本 · 6幅正文 · 7个打印面 · 3.50元</span><h2>${show(book.title)}</h2><p>重点读：${joined(book.focus)}</p></header><ol class="pages">${book.pages.map((lines, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><div>${lines.map(line => `<p>${show(line)}</p>`).join('')}</div></li>`).join('')}</ol><section class="literacy"><h3>识字小结</h3><dl><div><dt>本书用字</dt><dd>${stats.count}</dd></div><div><dt>新出现</dt><dd>${stats.newCount}</dd></div><div><dt>累计接触</dt><dd>${stats.cumulativeCount}</dd></div></dl><p><b>本册新字：</b>${joined(stats.newCharacters)}</p><details><summary>展开完整字表与陪读提示</summary><p><b>正文用字：</b>${joined(stats.characters)}</p><p><b>单面最多首次出现字：</b>${peakNewPerPage[index]}字。此数只反映字的首次出现，不等于阅读难度评分。</p><p>${show(book.readingNote)}</p></details></section><aside><b>故事与画面</b><p>${show(book.storyNote)}</p><p>参考旧稿：第${book.sourceNumbers.join('、')}本。${book.number <= 2 ? '正文保留。' : '按新六面故事重新确认画面。'}</p></aside><a class="back" href="#contents">返回目录 ↑</a></article>`;
}).join('\n');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${show(draft.title)} · 小小主角</title><style>
:root{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#2d4337;background:#f2f0e7;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:900px;margin:auto;padding:30px 24px 60px}h1,h2,.pages p{font-family:"KaiTi","STKaiti","Microsoft YaHei",serif}h1{font-size:37px;line-height:1.4}h2{font-size:29px;margin:10px 0}h3{font-size:16px}p{line-height:1.9}a{color:#456c50;text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid #a37a39;outline-offset:4px}.badge{display:inline-block;padding:7px 12px;background:#e5ecda;border:1px solid #bccbae;border-radius:18px;font-size:12px}.intro>p,.notes{color:#5e6b56;font-size:14px}.cost{background:#e6edde;border-left:3px solid #91a579;padding:15px 18px;margin:20px 0}.cost strong{font-size:24px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}th,td{text-align:right;padding:9px 6px;border-bottom:1px solid #d4dccb}th:first-child,td:first-child{text-align:left}.toc{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:9px}.toc a{display:flex;align-items:center;gap:10px;background:#fffdf6;border:1px solid #dce1d2;padding:13px;min-height:55px;border-radius:8px;text-decoration:none}.toc span{color:#947749;font:22px Georgia,serif}.toc small{margin-left:auto;color:#74806a;white-space:nowrap}article{scroll-margin-top:20px;background:#fffef8;border:1px solid #dfe3d5;border-radius:13px;padding:28px 36px 18px;margin:24px 0}article header{text-align:center;border-bottom:1px solid #e4e8db}.label,article header p{font-size:12px;color:#6b795e}.pages{list-style:none;padding:0;margin:10px 0 24px}.pages li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:14px;padding:18px 0;border-bottom:1px solid #eceee3}.pages li:last-child{border:0}.pages li>span{font:13px/2.8 Georgia,serif;color:#99896d}.pages p{margin:0;font-size:24px;line-height:1.85;overflow-wrap:anywhere;letter-spacing:.02em}.literacy{background:#edf2e5;border:1px solid #dbe3d0;border-radius:8px;padding:16px;font-size:13px}.literacy h3{margin:0 0 12px}.literacy dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));text-align:center;gap:5px;margin:0}.literacy dt{font-size:12px;color:#6d7a61}.literacy dd{font-size:25px;margin:5px 0}.literacy p{overflow-wrap:anywhere}summary{cursor:pointer;line-height:1.8;min-height:36px;padding:6px 0}aside{font-size:13px;color:#66715b;background:#f4f3ea;border-radius:8px;padding:14px 16px;margin-top:14px}aside p{margin:5px 0}.back{display:inline-block;min-height:40px;line-height:40px;font-size:12px}.notes{line-height:1.9;margin-top:30px}.notes h2{font-size:25px}
@media(max-width:540px){main{padding:21px 14px 40px}h1{font-size:30px}.toc{grid-template-columns:1fr}article{padding:23px 18px 14px}.pages li{grid-template-columns:21px minmax(0,1fr);gap:9px}.pages p{font-size:23px;letter-spacing:0}.literacy{padding:12px}.cost{padding:13px}.cost strong{font-size:22px}}
@media print{@page{size:A4;margin:16mm}body{background:white}main{max-width:none;padding:0}nav,.back{display:none}article{break-before:page;border:0;padding:0}.pages li{break-inside:avoid;padding:10px 0}.pages p{font-size:19px}.literacy{break-inside:avoid}.notes{break-before:page}}
</style></head><body><main><header class="intro"><span class="badge">20本重编稿 · 文字待审</span><h1>第一级 · 压缩为20本<br>简单字前置，减少打印面数</h1><div class="cost"><strong>20本 · 140个A4打印面 · 70元</strong><p>每本6面正文＋1面外封。外封左侧识字小结、右侧封面，共用同一个打印面。按每面0.5元，只计打印，不含装订、运费等费用；不是最终用纸张数。</p></div><div class="table-wrap"><table aria-label="打印成本对照"><thead><tr><th>方案</th><th>正文面</th><th>外封面</th><th>打印面合计</th><th>打印费用</th></tr></thead><tbody><tr><td>旧40本</td><td>${oldBodyFaces}</td><td>${oldCoverFaces}</td><td>${oldFaces}</td><td>${(oldFaces * price).toFixed(2)}元</td></tr><tr><td>新20本</td><td>${bodyFaces}</td><td>${coverFaces}</td><td>${totalFaces}</td><td>${cost.toFixed(2)}元</td></tr></tbody></table></div><p><b>减少${oldFaces - totalFaces}个打印面，节省${saved.toFixed(2)}元，约${(saved / (oldFaces * price) * 100).toFixed(1)}%。</b></p><p>${show(draft.curriculumNote)}</p><p>原第21–23本的日月早晨内容前置到新第4本；原第27本前置到新第7本；原第31本的熟悉称谓进入新第5本，原第32–33本进入新第6本。旧第1、2本正文保留。</p><p>全部200个计划字均在正文出现，无新增表外辅助字。姓名不计入，累计接触不等于掌握。压缩后部分单册的新字更多，下面逐册列出全部新字；后段保留低新增的复习故事。</p><p>此为文案重编，不代表现有小程序书架或打印文件已切换。<a href="books-01-40.html">查看旧40本对照稿</a></p></header><nav id="contents" aria-label="故事目录"><h2>20本目录</h2><ol class="toc">${draft.books.map(book => `<li><a href="#book-${book.number}"><span>${book.number}</span>${show(book.title)}<small>6面 · 3.50元</small></a></li>`).join('')}</ol></nav>${cards}<section class="notes"><h2>整级用字与成本总览</h2><div class="table-wrap"><table><thead><tr><th>册</th><th>故事</th><th>用字</th><th>新增</th><th>累计</th><th>打印费用</th></tr></thead><tbody>${draft.books.map((book, i) => `<tr><td>${book.number}</td><td>${show(book.title)}</td><td>${summaries[i].count}</td><td>${summaries[i].newCount}</td><td>${summaries[i].cumulativeCount}</td><td>3.50元</td></tr>`).join('')}</tbody></table></div><p>${show(draft.personalizationNote)}</p><p>${show(draft.readingNote)}</p><p>每个正文编号仍对应一个完整297×210mm的A4跨页。此页的浏览器打印样式只供文案审阅，生产PDF须另按跨页、外封、中缝安全带及字体嵌入要求制作并由印厂打样。</p></section></main></body></html>`;
const output = path.join(root, 'output/text/level-1-condensed-20.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(JSON.stringify({ output, books: draft.books.map((b, i) => ({ number: b.number, title: b.title, new: summaries[i].newCharacters.join(''), newCount: summaries[i].newCount, cumulative: summaries[i].cumulativeCount, peakNewPerPage: peakNewPerPage[i] })), bodyFaces, coverFaces, totalFaces, cost, saved, coveredCharacters: summaries.at(-1).cumulativeCount }, null, 2));
