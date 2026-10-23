'use strict';

// Independent manuscript preview. Does not rebuild the app or publish the site.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { listBooks } = require('../miniprogram/lib/stories');
const { defaultMembers } = require('../miniprogram/lib/family');
const { uniqueHan, summarizeBooks } = require('../miniprogram/lib/literacy');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const plan = read('content/level1-character-plan.json');
const earlier = read('content/level1-stories-04-10.json');
const previous = read('content/level1-stories-11-20.json');
const complete = process.argv.includes('--complete-level');
const last = complete ? read('content/level1-stories-21-40.json') : null;
const baseline = listBooks({ name: 'CHILD', age: 5, className: '大班' }, defaultMembers());
const initialFocus = ['我你是好', '一两三花', '家口爸妈'];
const displayBaseline = baseline.map((book, index) => ({ ...book, number: index + 1, focus: initialFocus[index], revisit: '', storyNote: book.description, readingNote: index === 0 ? '小主角代称个性化姓名；姓名插入位不计入识字统计。年龄、班级按实际资料替换。' : index === 1 ? '保留原有六页正文，花瓣的片数与文字对应；此处不改写已配图故事。' : '此页展示孩子与爸爸妈妈三人的默认版本。实际家人、页数和用字随所选家庭变化，不要求所有孩子都采用这个家庭配置。' }));
const books = baseline.concat(earlier.books, previous.books, last ? last.books : []);
const manuscript = complete ? { ...last, title: '第一级 全40本文字审阅稿', books: displayBaseline.concat(earlier.books, previous.books, last.books) } : previous;
const stats = summarizeBooks(books);
const allowed = new Set(plan.characters);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
assert.equal(allowed.size, 200);
assert.equal(plan.characters.length, 200);
assert.equal(manuscript.status, 'text-draft-awaiting-user-review');
assert.deepEqual(earlier.books.map(book => book.number), [4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(previous.books.map(book => book.number), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
if (complete) assert.deepEqual(last.books.map(book => book.number), Array.from({ length: 20 }, (_, i) => i + 21));
assert.equal(new Set(books.map(book => book.id)).size, books.length, 'Book IDs must be unique.');
const audit = manuscript.books.map(book => {
  assert.ok(book.pages.length >= 6 && book.pages.length <= 8, `${book.number}: expected 6–8 body pages`);
  assert.ok(book.pages.every(lines => Array.isArray(lines) && lines.length >= 1 && lines.length <= 2 && lines.every(line => typeof line === 'string' && line.trim())), `${book.number}: one or two nonempty reading lines per page`);
  for (const field of ['title', 'focus', 'storyNote', 'readingNote']) assert.ok(typeof book[field] === 'string' && book[field].trim(), `${book.number}: missing ${field}`);
  const outside = uniqueHan(book.title + book.pages.flat().join('')).filter(c => !allowed.has(c));
  if (book.number !== 3) assert.deepEqual(outside, [], `${book.number}: title/body exceed the 200-character working list`);
  const s = stats.find(item => item.id === book.id);
  for (const c of book.focus) assert.ok(s.characters.includes(c), `${book.number}: focus ${c} must occur in the body`);
  const seenBefore = new Set(book.number === 1 ? [] : stats[book.number - 2].cumulativeCharacters);
  const revisited = uniqueHan(book.revisit).filter(c => seenBefore.has(c) && s.characters.includes(c));
  return { number: book.number, title: book.title, pages: book.pages.length, ...s, revisited, outside };
});
const bodyPages = manuscript.books.reduce((sum, book) => sum + book.pages.length, 0);
const finalStats = stats.at(-1);
const workingCovered = [...allowed].filter(c => finalStats.cumulativeCharacters.includes(c));
const auxiliary = finalStats.cumulativeCharacters.filter(c => !allowed.has(c));
if (complete) {
  assert.equal(workingCovered.length, 200, 'The complete manuscripts must cover all 200 working-list characters in body text.');
  assert.deepEqual(auxiliary.slice().sort(), uniqueHan(baseline[2].pages.flat().join('')).filter(c => !allowed.has(c)).sort(), 'Only the existing family book may contribute outside-list auxiliary characters.');
  for (const [profile, members] of [[{ age: 3, className: '小班' }, []], [{ age: 6, className: '中班' }, defaultMembers().map(member => ({ ...member, included: true }))]]) {
    const variant = summarizeBooks(listBooks({ ...profile, name: 'CHILD' }, members).concat(earlier.books, previous.books, last.books)).at(-1);
    assert.deepEqual([...allowed].filter(c => !variant.cumulativeCharacters.includes(c)), [], 'Coverage must not depend on a particular real family or personalized age/class.');
  }
}
const joined = values => values.map(escape).join(' · ') || '无';
const articles = manuscript.books.map((book, index) => {
  const s = audit[index];
  return `<article id="book-${book.number}"><header><span class="label">第 ${book.number} 本 · ${s.pages} 页正文${book.number <= 6 ? ' · 已配图原稿' : ' · 待审文字稿'}</span><h2>${escape(book.title.replace('CHILD', '小主角'))}</h2><p>重点读：${joined(Array.from(book.focus))}</p></header>
<ol class="pages">${book.pages.map((lines, i) => `<li><span class="page">${String(i + 1).padStart(2, '0')}</span><div>${lines.map(line => `<p>${escape(line.replaceAll('CHILD', '小主角'))}</p>`).join('')}</div></li>`).join('')}</ol>
<section class="literacy"><h3>识字小结</h3><dl><div><dt>本书用字</dt><dd>${s.count}</dd></div><div><dt>新出现</dt><dd>${s.newCount}</dd></div><div><dt>累计接触</dt><dd>${s.cumulativeCount}</dd></div></dl><p><b>新出现的字：</b>${joined(s.newCharacters)}</p><details><summary>查看完整字表</summary><p><b>本书正文：</b>${joined(s.characters)}</p><p><b>前文复现：</b>${joined(s.revisited)}</p><p><b>累计接触：</b>${joined(s.cumulativeCharacters)}</p></details></section>
<aside><p><b>情节与画面说明</b>${escape(book.storyNote)}</p><p><b>陪读提示</b>${escape(book.readingNote)}</p></aside><a class="back" href="#contents">返回目录 ↑</a></article>`;
}).join('\n');
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(manuscript.title)} · 小小主角</title>
<style>
:root{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#2d4337;background:#f2f0e7;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:900px;padding:36px 24px 70px;margin:auto}h1,h2,.pages p{font-family:"KaiTi","STKaiti","Microsoft YaHei",serif}h1{font-size:38px;line-height:1.4;margin:15px 0}h2{font-size:30px;margin:10px 0 14px}h3{font-size:16px;margin:0 0 12px}p{line-height:1.9}a{color:#476e50;text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid #a37836;outline-offset:4px}.label{color:#6a755f;font-size:13px}.intro>p{color:#5f6b57;font-size:15px}.status{display:inline-block;border:1px solid #b9c5ae;padding:7px 13px;border-radius:18px;font-size:12px;background:#e7edde}.scope{border-left:3px solid #97aa7e;background:#e6ebde;padding:14px 18px}nav{margin:28px 0}.toc{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.toc a{display:flex;gap:10px;align-items:center;min-height:54px;padding:12px 15px;border:1px solid #d9dece;background:#fffdf6;border-radius:8px;text-decoration:none}.toc span{font-family:Georgia,serif;color:#96794e;font-size:22px}.toc small{margin-left:auto;color:#6d785f;white-space:nowrap}article{scroll-margin-top:20px;background:#fffef8;padding:32px 38px 20px;border:1px solid #dfe1d4;border-radius:14px;margin:24px 0}article header{text-align:center;border-bottom:1px solid #e4e7d9}article header p{font-size:13px;color:#68795e}.pages{list-style:none;padding:0;margin:10px 0 25px}.pages li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:16px;border-bottom:1px solid #eceee3;padding:18px 0}.pages li:last-child{border:0}.page{font:13px/2.8 Georgia,serif;color:#9a8d73}.pages p{margin:0;font-size:25px;line-height:1.8;letter-spacing:.03em;overflow-wrap:anywhere}.literacy{padding:17px;background:#edf2e5;border:1px solid #dce4d2;border-radius:8px;font-size:13px}.literacy dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));text-align:center;gap:5px;margin:0}.literacy dt{font-size:12px;color:#68795e}.literacy dd{margin:6px 0;font-size:26px}.literacy p{overflow-wrap:anywhere}summary{cursor:pointer;min-height:32px;line-height:32px}aside{background:#f5f4eb;border-radius:8px;padding:12px 16px;margin-top:15px;color:#65705c;font-size:13px}aside p{margin:0 0 10px}aside p:last-child{margin:0}aside b{display:block;color:#4e6246}.back{display:inline-block;line-height:40px;margin-top:10px;font-size:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}td,th{padding:9px 7px;border-bottom:1px solid #d9dfcc;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}.notes{font-size:14px;color:#5e6b55}.notes h2{font-size:24px}.notes p{line-height:2}
@media(max-width:540px){main{padding:22px 14px 40px}h1{font-size:31px}.toc{grid-template-columns:1fr}article{padding:25px 19px 15px}.pages li{grid-template-columns:22px minmax(0,1fr);gap:10px}.pages p{font-size:23px}.literacy{padding:13px}td,th{padding:9px 5px}}
@media print{@page{size:A4;margin:16mm}body{background:white}main{max-width:none;padding:0}nav,.back{display:none}.intro{break-after:page}article{break-before:page;border:0;border-radius:0;padding:0;box-shadow:none}.pages li{padding:10px 0;break-inside:avoid}.pages p{font-size:20px}aside{font-size:11px}.literacy{break-inside:avoid}.notes{break-before:page}}
</style></head><body><main><header class="intro"><span class="status">${complete ? '全40本文字 · 第7至40本待审' : '文字审阅稿 · 尚未配图'}</span><h1>${complete ? '第一级 · 全40本<br>完整故事文字稿' : '第一级 · 第11至20本<br>十个接着读的小故事'}</h1><p>${escape(manuscript.introduction)}</p><p class="scope">${complete ? `本次续写第21–40本，共20本、${last.books.reduce((n, b) => n + b.pages.length, 0)}页正文。此页汇总全40本、${bodyPages}页正文。<a href="#book-21">直接看新写的第21本 ↓</a>` : `本批10本 · ${bodyPages}页正文。原有文字写到第10本，本批从第11本续写。`} 前6本已配图，其余为待审文字稿。正文页数不含封面与小结，此页供文字审阅。</p><p>统计按正文汉字去重，含全部辅助字；不计书名、标点或个性化姓名。本页以五岁、大班、孩子与爸爸妈妈三人家庭为基准。家庭和年龄设置变化时，统计可能变化。累计接触不等于已经掌握。</p>${complete ? `<p class="scope">200个计划字均已在正文出现。默认版本实际累计${finalStats.cumulativeCount}字，其中既有家庭书的6个表外辅助字单列：${joined(auxiliary)}。新写的第21–40本没有新增表外字。</p><p><a href="#book-1">第1–10本</a> · <a href="#book-11">第11–20本</a> · <a href="#book-21">第21–30本</a> · <a href="#book-31">第31–40本</a></p>` : ''}</header>
<nav id="contents" aria-label="故事目录"><h2>故事目录</h2><ol class="toc">${manuscript.books.map(book => `<li><a href="#book-${book.number}"><span>${book.number}</span>${escape(book.title.replace('CHILD', '小主角'))}<small>${book.pages.length} 页</small></a></li>`).join('')}</ol></nav>
${articles}<section class="notes"><h2>${complete ? '全40本' : '前20本'}用字总览</h2><div class="table-wrap"><table><thead><tr><th>册</th><th>故事</th><th>本书用字</th><th>新出现</th><th>累计</th></tr></thead><tbody>${stats.map((s, i) => `<tr><td>${s.number}</td><td>${escape(books[i].title.replace('CHILD', '小主角'))}</td><td>${s.count}</td><td>${s.newCount}</td><td>${s.cumulativeCount}</td></tr>`).join('')}</tbody></table></div><h2>编写与衔接</h2>${['curriculumNote', 'personalizationNote', 'continuityNote'].map(key => `<p>${escape(manuscript[key])}</p>`).join('')}<p>全页采用现有识字统计模块。前三本使用当前故事正文，第4至${complete ? 40 : 20}本使用文字稿；统计不把未读正文的标题字提前算作旧字。</p></section></main></body></html>`;
const output = path.join(root, complete ? 'output/text/level-1-books-01-40.html' : 'output/text/level-1-books-11-20.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(JSON.stringify({ output, books: audit.map(({ number, title, pages, count, newCount, cumulativeCount, newCharacters, outside }) => ({ number, title, pages, count, newCount, cumulativeCount, newCharacters: newCharacters.join(''), outside })), bodyPages, previousCumulativeCount: stats[9].cumulativeCount, cumulativeCount: finalStats.cumulativeCount, workingCovered: workingCovered.length, outsideListAuxiliary: auxiliary.join(''), remainingWorkingCharacters: plan.characters.split('').filter(c => !finalStats.cumulativeCharacters.includes(c)).join('') }, null, 2));
