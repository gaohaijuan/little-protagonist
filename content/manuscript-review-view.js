'use strict';
const { indexWords, indexCharacters } = require('../scripts/manuscript-series-audit.cjs');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const letters = chars => Array.from(chars).map(esc).join(' · ') || '无';

function renderCards(books, stats, wordTargets) {
  const words = indexWords(books, wordTargets);
  return books.map((book,i) => {
    const a = stats[i];
    const revisits = words.map(w => ({ ...w, here:w.occurrences.filter(o=>o.story===book.number), earlier:[...new Set(w.occurrences.filter(o=>o.story<book.number).map(o=>o.story))] })).filter(w=>w.here.length&&w.earlier.length);
    return `<article id="book-${book.number}"><header><span class="label">故事 ${book.number} · ${book.pages.length}页正文</span><h2>${esc(book.title)}</h2></header>
      <ol class="pages">${book.pages.map((lines,p)=>`<li><span>${String(p+1).padStart(2,'0')}</span><div>${lines.map(line=>`<p>${esc(line)}</p>`).join('')}<small class="new-on-page">本页首次：${letters(a.pageNew[p])}</small></div></li>`).join('')}</ol>
      <section class="literacy"><h3>本故事识字小结</h3><dl><div><dt>正文用字</dt><dd data-count="characters">${a.count}</dd></div><div><dt>本篇新增</dt><dd data-count="new">${a.newCount}</dd></div><div><dt>累计接触</dt><dd data-count="cumulative">${a.cumulativeCount}</dd></div></dl>
      <p><b>全部新字：</b>${letters(a.newCharacters)}</p><p>本篇再见的旧字：${a.count-a.newCount}字。接触过不等于已掌握。</p>
      ${book.number<=3?'<p class="attention">起步篇由家长陪读，实际新增量照列。</p>':a.newCount>7||a.peak>3?`<p class="attention">当前设置下本篇新增${a.newCount}字，单页首次最多${a.peak}字，建议分段共读。没有套用默认三口家庭的统计。</p>`:''}
      ${revisits.length?`<details><summary>这篇接回了哪些旧词</summary>${revisits.map(w=>`<p><b>${esc(w.word)}</b> · 前见第${w.earlier.join('、')}篇，本篇第${w.here[0].page}页：${esc(w.here[0].quote)}</p>`).join('')}</details>`:''}
      <details><summary>当前正文完整字表</summary><p>${letters(a.characters)}</p><p>姓名不计字；称谓、年龄、班级按当前正文计数。同字不同义只计字形接触。</p></details></section>
      <details class="editorial"><summary>默认示例的编写说明</summary><p>${esc(book.storyNote)}</p><p>${esc(book.readingNote)}</p><p>${esc(book.editorialReview.decision)}</p><p>以上为文案编写依据；当前设置的实际字量以上方小结为准。插画尚需按修订后的文字制作。</p></details><a class="back" href="#contents">返回目录 ↑</a></article>`;
  }).join('\n');
}

function renderToc(books,stats) {
  return `<h2>30个故事</h2><ol class="toc">${books.map((b,i)=>`<li><a href="#book-${b.number}"><span>${b.number}</span><strong>${esc(b.title)}</strong><small>${b.pages.length}页 · 新${stats[i].newCount}字</small></a></li>`).join('')}</ol>`;
}
function renderLedger(books,stats) {
  return `<h2>当前设置的逐篇负担</h2><div class="table-wrap"><table><thead><tr><th>篇</th><th>故事</th><th>正文页</th><th>正文用字</th><th>新增</th><th>单页最多首次</th><th>累计接触</th></tr></thead><tbody>${stats.map((a,i)=>`<tr><td>${a.number}</td><td>${esc(books[i].title)}</td><td>${a.pages}</td><td>${a.count}</td><td>${a.newCount}</td><td>${a.peak}</td><td>${a.cumulativeCount}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderSeries(books,targets,revision) {
  const words=indexWords(books,targets),chars=indexCharacters(books);
  return `<h2>全册连读与旧词回访</h2><details id="naturalness-review" class="editorial"><summary>这次截图问题的修改</summary>${Object.entries(revision.decisions).map(([n,decision])=>`<p><a href="#book-${n}">第${n}篇</a> · ${esc(decision)}</p>`).join('')}</details>
    <details class="editorial"><summary>当前正文的旧词出现位置</summary>${words.map(w=>`<p><b>${esc(w.word)}</b> · ${w.distinctStories}篇${w.occurrences.map(o=>`<br><a href="#book-${o.story}">第${o.story}篇·${o.page}页</a> ${esc(o.quote)}`).join('')}</p>`).join('')}</details>
    <details class="editorial"><summary>仍只出现一篇的字</summary><p>${chars.filter(c=>c.distinctStories===1).map(c=>`${esc(c.character)}（${c.firstStory}）`).join(' · ')}</p><p>括号为篇号。保留在原故事里复读，不为清空名单硬编后续情节。</p></details>`;
}
module.exports={esc,renderCards,renderToc,renderLedger,renderSeries};
