'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { uniqueHan, summarizeBooks } = require('../miniprogram/lib/literacy');
const { listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers } = require('../miniprogram/lib/family');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8'));
const draft = read('level1-stories-balanced-30.json');
const plan = read('level1-character-plan.json');
const allowed = new Set(plan.characters);
const stats = summarizeBooks(draft.books);
const baseline = listBooks({ name: 'CHILD', age: 5, className: '大班' }, defaultMembers());
const familyVariant = listBooks({ name: 'CHILD', age: 5, className: '大班' }, defaultMembers().map(member => ({ ...member, included: true })))[2];
const show = value => String(value).replaceAll('CHILD', '小主角').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const joined = value => [...value].map(show).join(' · ') || '无';
assert.equal(draft.status, 'text-draft-awaiting-user-review');
assert.deepEqual(draft.books.map(b => b.number), Array.from({ length: 30 }, (_, i) => i + 1));
assert.equal(new Set(draft.books.map(b => b.id)).size, 30);
assert.equal(allowed.size, 200);
assert.deepEqual(draft.books.slice(0, 3).map(b => b.pages), baseline.map(b => b.pages), 'Preserve the three original body manuscripts.');
const seen = new Set();
const audit = draft.books.map((book, i) => {
  assert.ok(book.pages.length >= 6 && book.pages.length <= 8, `${book.number}: 6–8 complete story pages`);
  assert.ok(book.pages.every(lines => lines.length >= 1 && lines.length <= 2 && lines.every(line => typeof line === 'string' && line.trim())));
  for (const key of ['focus', 'storyNote', 'readingNote']) assert.ok(typeof book[key] === 'string' && book[key].trim());
  const outside = uniqueHan(book.title + book.pages.flat().join('')).filter(c => !allowed.has(c));
  if (book.number !== 3) assert.deepEqual(outside, [], `${book.number}: no new outside-list body/title characters`);
  for (const c of book.focus) assert.ok(stats[i].characters.includes(c), `${book.number}: focus ${c} must occur in body text`);
  // Count a character only on its first page, not again on every later page.
  const pageNew = book.pages.map(lines => {
    const characters = uniqueHan(lines.join(''));
    const fresh = characters.filter(c => !seen.has(c));
    characters.forEach(c => seen.add(c));
    return fresh;
  });
  const peak = Math.max(...pageNew.map(v => v.length));
  if (book.number >= 4) {
    assert.ok(stats[i].newCount <= 7, `${book.number}: whole-body new-character load exceeds seven`);
    assert.ok(peak <= 3, `${book.number}: more than three first exposures on a page`);
  }
  return { number: book.number, title: book.title, pages: book.pages.length, ...stats[i], pageNew, peak, outside };
});
const currentPlanned = [...allowed].filter(c => seen.has(c));
const libraryCharacters = new Set([...seen, ...uniqueHan(familyVariant.pages.flat().join(''))]);
assert.deepEqual([...allowed].filter(c => !libraryCharacters.has(c)), [], 'The story library including selected-family body variants covers the working list.');
assert.deepEqual([...allowed].filter(c => !seen.has(c)).sort(), ['哥', '姐', '弟', '妹'].sort(), 'Only optional sibling terms vary out of the default family example.');
const auxiliary = [...seen].filter(c => !allowed.has(c));
assert.deepEqual(auxiliary.slice().sort(), uniqueHan(baseline[2].pages.flat().join('')).filter(c => !allowed.has(c)).sort());
const bodyPages = draft.books.reduce((n, b) => n + b.pages.length, 0);
const internalSummaryPages = draft.books.length - 1; // Last summary is inside back cover.
const sharedCoverPages = draft.cost.sharedCoverPages; // Includes contents and last summary.
assert.equal(sharedCoverPages, 4);
assert.equal(draft.cost.finishedPagesPerDuplexA4Sheet, 4);
assert.equal(draft.cost.pricePerDuplexA4Sheet, 0.5);
const readingPages = bodyPages + internalSummaryPages + sharedCoverPages;
const price = draft.cost.pricePerDuplexA4Sheet;
const pagesPerSheet = draft.cost.finishedPagesPerDuplexA4Sheet;
const estimate = Math.ceil(readingPages / pagesPerSheet) * price;
const original40 = baseline.concat(...['level1-stories-04-10.json', 'level1-stories-11-20.json', 'level1-stories-21-40.json'].map(name => read(name).books));
const originalBody = original40.reduce((n, b) => n + b.pages.length, 0);
const originalPages = originalBody + original40.length - 1 + sharedCoverPages;
const originalEstimate = Math.ceil(originalPages / pagesPerSheet) * price;
const cards = draft.books.map((book, i) => {
  const a = audit[i];
  return `<article id="book-${book.number}"><header><span class="label">故事 ${book.number} · ${book.pages.length}页正文${book.number <= 3 ? ' · 保留原稿' : ' · 平衡重编稿'}</span><h2>${show(book.title)}</h2><p>重点读：${joined(book.focus)}</p></header><ol class="pages">${book.pages.map((lines, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div>${lines.map(line => `<p>${show(line)}</p>`).join('')}<small class="new-on-page">本页首次出现：${joined(a.pageNew[index])}</small></div></li>`).join('')}</ol><section class="literacy"><h3>本故事识字小结</h3><dl><div><dt>正文用字</dt><dd>${a.count}</dd></div><div><dt>本篇新增</dt><dd>${a.newCount}</dd></div><div><dt>累计接触</dt><dd>${a.cumulativeCount}</dd></div></dl><p><b>全部新字：</b>${joined(a.newCharacters)}</p><p>单页首次出现最多 ${a.peak} 字。${book.number <= 3 ? '<b>这是保留的原稿，其新增量仍为原有水平，不属于第4篇起的控制范围。</b>' : ''}</p><details><summary>完整字表与陪读提示</summary><p><b>正文用字：</b>${joined(a.characters)}</p><p>${show(book.readingNote)}</p></details></section><aside><b>情节与画面</b><p>${show(book.storyNote)}</p><p>${book.replacesTitle ? `替换原《${show(book.replacesTitle)}》，这次按新情节重新写。` : `参考40本旧稿第${book.sourceNumber}篇。`}上述页数是正文阅读页，不是A4印刷面。</p></aside>${book.number === 3 ? `<details class="literacy"><summary>实际选中兄弟姐妹时使用的介绍句</summary>${familyVariant.pages.filter(lines => /哥哥|姐姐|弟弟|妹妹/.test(lines.join(''))).map(lines => `<p>${lines.map(show).join(' / ')}</p>`).join('')}<p>这些句子来自现有家庭生成模块，仅在实际选中相应家人时使用；没有进入当前示例正文的字不计入本页累计。</p></details>` : ''}<a class="back" href="#contents">返回目录 ↑</a></article>`;
}).join('\n');
const css = fs.readFileSync(path.join(root, 'content/manuscript-review.css'), 'utf8');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${show(draft.title)} · 小小主角</title><style>${css}
.new-on-page{display:block;color:#75806b;font-size:11px;line-height:1.8;margin-top:8px;overflow-wrap:anywhere}.correction{background:#f4eee1;border-left:3px solid #b59964;padding:13px 16px;font-size:14px;line-height:1.9}.toc small{font-size:11px}.notes td:nth-child(2),.notes th:nth-child(2){text-align:left}@media print{.new-on-page{font-size:9px}}</style></head><body><main><header class="intro"><span class="badge">30个独立故事 · 文案待审 · 整级合订</span><h1>30篇故事审阅稿<br>第15、16篇已重写</h1><p><a href="#book-15">看第15篇《小车不走了》↓</a></p><p><a href="#book-16">看第16篇《小猫也要看书吗》↓</a> · <a href="#contents">全部目录</a></p><details class="correction"><summary>打印成本口径说明</summary><p>20本强压稿已撤下。原先把“一张A4双面0.5元”误算成“每个A4印刷面0.5元”，原70元和170.5元计算均作废。这里按本次理解：一张A4双面共承载4个完整绘本页面，收费0.5元，重新估算。</p></details><p>每篇讲一个完整小故事，保留起因和转折。30篇各保留6–8页，线上逐故事读，纸质整级合订为一本，只保留一套封面和目录。</p><div class="cost"><strong>30篇 · 按家庭正文统计用字 · 打印约${estimate.toFixed(2)}元</strong><p>${bodyPages}页正文＋${internalSummaryPages}页章后小结＋4页共用封面＝${readingPages}个成品阅读页。4页封面包含封面、内侧目录、末章小结与封底，末章小结不重复计数。按每4页一张双面A4、整张计费取整估算。最终封面材料、必要空白及装订由印厂确认，装订与运费未计入。</p></div><div class="table-wrap"><table aria-label="按更正单价和合集计算的成本"><thead><tr><th>方案</th><th>正文</th><th>章后小结</th><th>共用封面</th><th>成品页</th><th>打印估算</th></tr></thead><tbody><tr><td>40篇合集</td><td>${originalBody}</td><td>${original40.length - 1}</td><td>4</td><td>${originalPages}</td><td>${originalEstimate.toFixed(2)}元</td></tr><tr><td>30篇合集</td><td>${bodyPages}</td><td>${internalSummaryPages}</td><td>4</td><td>${readingPages}</td><td>${estimate.toFixed(2)}元</td></tr></tbody></table></div><p>两行都用更正后的同一计价口径。故事数量无需为了错误的成本估算强压到20篇；30篇预计比40篇减少${originalPages - readingPages}个阅读页，基础打印估算减少${(originalEstimate - estimate).toFixed(2)}元。此计算是文稿规划，不是已完成生产拼版或印厂报价。</p><p><b>第4篇起，单篇新增${Math.min(...audit.slice(3).map(a => a.newCount))}–${Math.max(...audit.slice(3).map(a => a.newCount))}字；单页第一次出现最多3字。</b>页后逐一列出实际新字，反复出现不重复记作首次。前三篇原稿新增分别${audit.slice(0,3).map(a => a.newCount).join('、')}字，仍保留并单列，不把它们说成已经降到7字以内。</p><p>统计基于五岁、大班、孩子与爸爸妈妈三人的原家庭正文。实际家人、年龄、班级改变时，应重新核对用字；次数少与笔画少都不自动等于更容易。累计是接触量，不是掌握量。200字计划由故事正文及实际选中家人的介绍正文共同覆盖。当前三人家庭示例覆盖${currentPlanned.length}个计划字；哥、姐、弟、妹只在选中相应家人时进入第3篇正文，不把未读的词算作已接触。原家庭书另有6个辅助字：${joined(auxiliary)}，当前示例总接触量为${seen.size}字。</p><p>第15、16篇已撤换原来的动物兄弟姐妹故事，分别写玩车被小狗打断、看书被小猫打断的日常小事。亲属称谓回到第3篇实际家庭介绍，他、她在第25、26篇的朋友互动中认读。山石、日月、雨和小虫仍在前段。<a href="books-01-40.html">查看40篇旧稿对照</a></p><p>这次只更新文案审阅页，不代表现有小程序、插画和生产PDF已经换成30篇。</p></header><nav id="contents" aria-label="故事目录"><h2>30个故事</h2><ol class="toc">${draft.books.map((b, i) => `<li><a href="#book-${b.number}"><span>${b.number}</span>${show(b.title)}<small>${b.pages.length}页 · 新${stats[i].newCount}字</small></a></li>`).join('')}</ol></nav>${cards}<section class="notes"><h2>逐篇负担一览</h2><div class="table-wrap"><table><thead><tr><th>篇</th><th>故事</th><th>正文页</th><th>本篇字</th><th>新增</th><th>单页最多首次字</th><th>累计</th></tr></thead><tbody>${audit.map(a => `<tr><td>${a.number}</td><td>${show(a.title)}</td><td>${a.pages}</td><td>${a.count}</td><td>${a.newCount}</td><td>${a.peak}</td><td>${a.cumulativeCount}</td></tr>`).join('')}</tbody></table></div><p>${show(draft.personalizationNote)}</p><p>小结在纸质合集里逐章保留，目录与末章小结分别使用封面内侧。正文是一页一幅插图和短句，不把文字独占半张A4，也不把两幅故事缩进一个阅读页。当前只有前6个旧故事有插画，本页30篇不能被标为已插画完整版。</p></section></main></body></html>`;
const output = path.join(root, 'output/text/level-1-balanced-30.html');
const result = { output, stories: draft.books.length, bodyPages, internalSummaryPages, sharedCoverPages, readingPages, estimatedPrintingCost: estimate, originalEstimate, plannedCharacters: allowed.size, defaultProfilePlannedCharacters: currentPlanned.length, optionalFamilyCharacters: [...allowed].filter(c => !seen.has(c)).join(''), bodyCharacters: seen.size, auxiliary: auxiliary.join(''), newRangeAfterFirstThree: [Math.min(...audit.slice(3).map(a => a.newCount)), Math.max(...audit.slice(3).map(a => a.newCount))], peakFirstExposuresAfterFirstThree: Math.max(...audit.slice(3).map(a => a.peak)), books: audit.map(a => ({ number: a.number, title: a.title, pages: a.pages, newCount: a.newCount, newCharacters: a.newCharacters.join(''), pageNew: a.pageNew.map(chars => chars.join('')), peak: a.peak })) };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
fs.writeFileSync(path.join(root, 'output/text/level-1-balanced-30-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, books: undefined }, null, 2));
