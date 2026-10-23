'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers } = require('../miniprogram/lib/family');
const { summarizeBooks } = require('../miniprogram/lib/literacy');
const root = path.resolve(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'content/level1-character-plan.json'), 'utf8'));
const draft = JSON.parse(fs.readFileSync(path.join(root, 'content/level1-stories-04-10.json'), 'utf8'));
const allowed = new Set(plan.characters);
const han = value => Array.from(new Set(value.match(/\p{Script=Han}/gu) || []));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
assert.equal(allowed.size, 200, 'The recovered working list must contain 200 unique characters.');
assert.equal(plan.characters.length, 200);
assert.deepEqual(draft.books.map(book => book.number), [4, 5, 6, 7, 8, 9, 10]);
assert.equal(draft.status, 'text-draft-awaiting-user-review');
for (const field of ['revisionNote', 'continuityNote']) assert.ok(typeof draft[field] === 'string' && draft[field].trim(), field + ' must explain this manuscript revision.');
// A personalized name is not a teaching exposure. Keep all fixed story text,
// but use a non-Han name so “石” in the sample name is not counted as earlier.
const baselineBooks = listBooks({ name: 'CHILD', age: 5, className: '大班' }, defaultMembers()).filter(book => ['intro', 'flower', 'family'].includes(book.id));
const allBooks = baselineBooks.concat(draft.books);
const summaries = summarizeBooks(allBooks);
const seen = new Set(han(baselineBooks.map(book => book.pages.flat().join('')).join('')));
let pageCount = 0;
const audit = [];
const articles = draft.books.map(book => {
  assert.ok(book.pages.length >= 6 && book.pages.length <= 8, book.title + ': 6–8 body pages');
  assert.ok(book.pages.every(lines => lines.length >= 1 && lines.length <= 2 && lines.every(line => typeof line === 'string' && line.trim())), 'Every page has one or two complete reading lines.');
  assert.ok(typeof book.readingNote === 'string' && book.readingNote.trim(), book.title + ': reading guidance must be supplied.');
  const text = book.title + book.pages.flat().join('');
  const characters = han(text), outside = characters.filter(character => !allowed.has(character));
  const stats = summaries.find(summary => summary.id === book.id);
  assert.deepEqual(outside, [], book.title + ': title and story stay inside the working character list');
  for (const character of book.focus) assert.ok(characters.includes(character), book.title + ': focus character must be read in this book');
  // Only call a character a revisit when it occurs in both this manuscript
  // and an earlier story. Merely listing it in the curriculum is insufficient.
  const firstSeen = stats.newCharacters;
  const revisited = Array.from(new Set(book.revisit)).filter(character => seen.has(character) && stats.characters.includes(character));
  stats.characters.forEach(character => seen.add(character));
  pageCount += book.pages.length;
  audit.push({ number: book.number, title: book.title, pages: book.pages.length, characterCount: stats.count, newCount: stats.newCount, cumulativeCount: stats.cumulativeCount, outside, focus: book.focus, firstSeen, revisited: revisited.join('') });
  return `<article class="book" id="book-${book.number}" aria-labelledby="title-${book.number}">
    <header class="book-header"><p class="eyebrow">第 ${book.number} 本 · ${book.pages.length} 页正文</p><h2 id="title-${book.number}">${escape(book.title)}</h2>
    <p class="focus"><span>重点读</span> ${Array.from(book.focus).map(character => `<b>${escape(character)}</b>`).join('')}</p></header>
    <ol class="pages">${book.pages.map((lines, index) => `<li class="story-page"><span class="page-number" aria-label="第${index + 1}页">${String(index + 1).padStart(2, '0')}</span><div>${lines.map(line => `<p>${escape(line)}</p>`).join('')}</div></li>`).join('')}</ol>
    <section class="literacy" aria-label="识字小结"><h3>识字小结</h3><dl><div><dt>本书用字</dt><dd>${stats.count}<small> 字</small></dd></div><div><dt>新出现</dt><dd>${stats.newCount}<small> 字</small></dd></div><div><dt>累计接触</dt><dd>${stats.cumulativeCount}<small> 字</small></dd></div></dl><details><summary>查看字表</summary><p><strong>本书汉字：</strong>${stats.characters.map(escape).join(' · ')}</p><p><strong>新出现的字：</strong>${stats.newCharacters.map(escape).join(' · ') || '无'}</p><p><strong>累计接触的字：</strong>${stats.cumulativeCharacters.map(escape).join(' · ')}</p></details></section>
    <footer class="editorial"><p><strong>这个故事的小趣味</strong>${escape(book.storyNote)}</p><p class="reading-note"><strong>陪读提示</strong>${escape(book.readingNote)}</p><p class="review-characters"><strong>前文出现过</strong>${revisited.map(escape).join(' · ')}</p></footer>
    <a class="back" href="#contents">返回目录 ↑</a>
  </article>`;
}).join('\n');
const statsOverview = '<section class="notes"><h2>前十本识字总览</h2><div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>册</th><th>故事</th><th>本书</th><th>新增</th><th>累计</th></tr></thead><tbody>' + summaries.map((stats,index) => '<tr><td>'+stats.number+'</td><td>'+escape(allBooks[index].title.replace('CHILD','小主角'))+'</td><td>'+stats.count+'</td><td>'+stats.newCount+'</td><td>'+stats.cumulativeCount+'</td></tr>').join('') + '</tbody></table></div></section>';
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(draft.title)} · 小小主角</title>
<style>
:root{color-scheme:light;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#293f35;background:#f2f0e6;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:#3f654f;text-underline-offset:4px}a:focus-visible{outline:3px solid #ba883c;outline-offset:5px;border-radius:3px}.wrap{max-width:860px;margin:0 auto;padding:32px 24px 60px}.topline{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:13px;margin-bottom:32px}.badge{border:1px solid #c4cbb9;border-radius:20px;padding:6px 12px;background:#e8eddf;font-size:12px;white-space:nowrap}.intro{padding:0 8px 24px}.eyebrow{font-size:12px;letter-spacing:.14em;color:#697363;margin:0 0 12px}.intro h1{font-family:"KaiTi","Kaiti SC","STKaiti",serif;font-size:clamp(30px,6vw,44px);line-height:1.35;margin:10px 0 20px;font-weight:650}.intro p:not(.eyebrow){font-size:15px;line-height:1.9;margin:10px 0;color:#536250}.intro .scope{padding:14px 17px;border-left:3px solid #b5c2a6;background:#e8ecdf;border-radius:0 8px 8px 0}.contents{scroll-margin-top:20px;margin:8px 0 36px}.contents h2{font-size:16px;margin:0 0 14px 8px}.toc{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;list-style:none;padding:0;margin:0}.toc a{display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:54px;border:1px solid #dce0d2;background:#fbfaf3;border-radius:9px;text-decoration:none;font-size:15px}.toc a:hover{background:#e9eee1}.toc span{color:#9a7950;font-family:Georgia,serif;font-size:20px}.toc small{margin-left:auto;color:#71816e;white-space:nowrap;font-size:11px}.book{position:relative;scroll-margin-top:16px;border:1px solid #e0e2d6;border-radius:14px;background:#fffef8;box-shadow:0 5px 16px #34482e06;margin-bottom:26px;padding:32px 40px 24px}.book-header{text-align:center;padding-bottom:17px;border-bottom:1px solid #e7e8dc}.book h2{font-family:"KaiTi","Kaiti SC","STKaiti",serif;font-size:30px;line-height:1.4;margin:4px 0 14px;color:#304e3d}.focus{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:7px;margin:0;font-size:12px;color:#74816e}.focus span{margin-right:3px}.focus b{font-weight:500;font-size:14px;min-width:27px;padding:3px 6px;background:#edf1e6;border-radius:4px;color:#486347}.pages{list-style:none;padding:0;margin:6px 0 23px}.story-page{display:grid;grid-template-columns:30px minmax(0,1fr);gap:17px;align-items:start;border-bottom:1px solid #eeeee4;padding:19px 0}.story-page:last-child{border-bottom:0}.page-number{font-family:Georgia,serif;font-size:13px;line-height:2.5;color:#a4967c}.story-page p{font-family:"KaiTi","Kaiti SC","STKaiti","Microsoft YaHei",serif;font-size:25px;line-height:1.7;letter-spacing:.035em;margin:0;overflow-wrap:anywhere;color:#263e31}.editorial{padding:14px 17px;background:#f3f4ec;border-radius:8px;color:#64705e;font-size:13px;line-height:1.85}.editorial p{margin:0 0 8px}.editorial p:last-child{margin-bottom:0}.editorial strong{display:block;font-size:12px;font-weight:600;color:#52684c}.back{display:inline-block;font-size:12px;margin-top:18px;min-height:32px;line-height:32px}.notes{padding:4px 8px;color:#64705e;font-size:13px;line-height:1.9}.notes h2{font-size:17px;color:#3b5743}.notes p{margin:12px 0}.end{text-align:center;font-size:13px;color:#71816e;padding-top:15px}@media(max-width:520px){.wrap{padding:20px 14px 36px}.topline{margin-bottom:24px}.intro{padding:0 4px 14px}.toc{grid-template-columns:1fr}.toc a{padding:12px 15px}.book{padding:24px 20px 18px;border-radius:12px}.book h2{font-size:28px}.story-page{grid-template-columns:23px minmax(0,1fr);gap:11px;padding:16px 0}.story-page p{font-size:23px;letter-spacing:.015em}.editorial{padding:12px 13px}}@media print{@page{size:A4;margin:16mm}body{background:white}.wrap{max-width:none;padding:0}.topline,.back,.end{display:none}.intro h1{font-size:30px}.contents{break-after:page}.book{break-before:page;break-inside:avoid;border:0;box-shadow:none;border-radius:0;margin:0;padding:0}.book-header{padding-bottom:10px}.book h2{font-size:25px}.story-page{padding:11px 0;break-inside:avoid}.story-page p{font-size:19px;line-height:1.55}.editorial{font-size:11px;padding:10px}.notes{break-before:page}}
.literacy{padding:16px;background:#f0f3e8;border:1px solid #dce2d2;border-radius:8px;margin:0 0 16px;font-size:13px}.literacy h3{font-size:15px;margin:0 0 12px}.literacy dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;text-align:center;margin:0 0 10px}.literacy dt{font-size:12px;color:#61705e}.literacy dd{margin:4px 0;font-size:24px;color:#3f654f}.literacy small{font-size:11px}.literacy summary{cursor:pointer;line-height:32px}.literacy details p{font-size:13px;line-height:1.9;overflow-wrap:anywhere}.stats-table{width:100%;border-collapse:collapse;font-size:12px}.stats-table th,.stats-table td{padding:8px 4px;border-bottom:1px solid #dce2d2;text-align:right}.stats-table th:nth-child(2),.stats-table td:nth-child(2){text-align:left}.stats-table-wrap{overflow-x:auto}
</style></head><body><main class="wrap"><div class="topline"><a href="/">← 小小主角试用版</a><span class="badge">第4–6本已配图</span></div>
<header class="intro"><p class="eyebrow">第 1 级 · 第 4 至 10 本</p><h1>七本故事<br>文字与识字小结</h1><p class="revision-note"><strong>本次调整：</strong>${escape(draft.revisionNote)}</p><p>${escape(draft.introduction)}</p><p class="scope">7 本 · ${pageCount} 页正文。第4–6本已加入试用版书架；第7–10本保留文字稿。封面与识字小结另计。</p></header>
<p class="notes">统计按正文不同汉字计数，含辅助字，不计书名、标点和姓名。累计按第1至本册去重，读过不等于掌握。此页以五岁、大班、小主角和爸爸妈妈的家庭正文为基准；试用版按你的实际设置计算。</p>
<nav class="contents" id="contents" aria-label="故事目录"><h2>先选一本看看</h2><ol class="toc">${draft.books.map(book => `<li><a href="#book-${book.number}"><span>${String(book.number).padStart(2, '0')}</span>${escape(book.title)}<small>${book.pages.length} 页</small></a></li>`).join('')}</ol></nav>
${articles}${statsOverview}<section class="notes" aria-labelledby="note-title"><h2 id="note-title">这批文字怎样衔接</h2><p>${escape(draft.curriculumNote)}</p><p>${escape(draft.personalizationNote)}</p><p>${escape(draft.continuityNote)}</p><p>审阅时可以直接告诉我“第几本第几页”哪里不顺口、太难，或希望换一个情节。确认故事以后，再细化动作与画面。</p></section><p class="end">第4–6本已配图，可返回试用版书架阅读。</p></main></body></html>`;
const directory = path.join(root, 'preview/drafts');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'level-1-books-04-10.html'), html);
console.log(JSON.stringify({ books: audit, bodyPages: pageCount, allowedCharacters: allowed.size, illustratedBookNumbers: [4, 5, 6] }, null, 2));
