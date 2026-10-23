'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {listBooks}=require('../miniprogram/lib/stories');
const {defaultMembers,ROLE_OPTIONS}=require('../miniprogram/lib/family');
const {personalizeReviewedBooks,auditReviewedBooks}=require('../miniprogram/lib/reviewed-personalization');
const {indexCharacters}=require('./manuscript-series-audit.cjs');
const view=require('../content/manuscript-review-view');
const root=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const draft=read('content/level1-stories-reviewed-30.json');
const profile={name:'小主角',age:5,className:'大班'},members=defaultMembers();
const books=personalizeReviewedBooks(draft.books,profile,members);
const countingBooks=personalizeReviewedBooks(draft.books,profile,members,{forStatistics:true});
const stats=auditReviewedBooks(countingBooks);
const plan=new Set(read('content/level1-character-plan.json').characters);
const chars=indexCharacters(countingBooks).map(c=>c.character);
const aux=new Set(draft.auxiliaryCharacters);
assert.equal(books.length,30);
assert.deepEqual(books.map(b=>b.number),Array.from({length:30},(_,i)=>i+1));
assert.deepEqual(countingBooks.slice(0,3).map(b=>b.pages),listBooks({name:'CHILD',age:5,className:'大班'},members).map(b=>b.pages));
assert.deepEqual(books.map(b=>b.pages.length),draft.currentRevision.baselinePageCounts);
const added=chars.filter(c=>!draft.currentRevision.baselineBodyCharacters.includes(c));
assert.deepEqual(added.sort(),[...draft.currentRevision.allowedAddedCharacters].sort());
assert.deepEqual(chars.filter(c=>!plan.has(c)).sort(),[...aux].sort());
const allChars=indexCharacters(personalizeReviewedBooks(draft.books,profile,defaultMembers().map(m=>({...m,included:true})),{forStatistics:true})).map(c=>c.character);
assert.deepEqual([...plan].filter(c=>!allChars.includes(c)),[]);
const titleSeen=new Set();
for(const [i,b]of books.entries()){
  const a=stats[i];
  assert.ok(b.pages.every(p=>p.length>=1&&p.length<=2&&p.every(line=>typeof line==='string'&&line.trim())));
  for(const focus of draft.books[i].focus)assert.ok(a.characters.includes(focus),`${b.number}: absent focus ${focus}`);
  for(const c of countingBooks[i].title.match(/\p{Script=Han}/gu)||[])assert.ok(a.characters.includes(c)||titleSeen.has(c),`${b.number}: title-only new ${c}`);
  a.characters.forEach(c=>titleSeen.add(c));
  if(b.number>=4){assert.ok(a.newCount<=(draft.gradingPolicy.allowedExceptionBooks.includes(b.number)?8:7),`${b.number}: ${a.newCount} new characters`);assert.ok(a.peak<=3,`${b.number}: page peak ${a.peak}`);}
}
const bodyPages=books.reduce((n,b)=>n+b.pages.length,0);
const css=fs.readFileSync(path.join(root,'content/manuscript-review.css'),'utf8');
const roles=ROLE_OPTIONS.filter(r=>r.id!=='child').map(r=>`<label><input type="checkbox" name="member" data-base-role value="${r.id}" ${['dad','mom'].includes(r.id)?'checked':''}>${r.label}</label>`).join('');
const data={books:draft.books,wordTargets:draft.seriesReview.wordTargets,currentRevision:draft.currentRevision};
const moduleFiles=[['family','miniprogram/lib/family.js'],['profile','miniprogram/lib/profile.js'],['literacy','miniprogram/lib/literacy.js'],['personalization','miniprogram/lib/reviewed-personalization.js'],['series','scripts/manuscript-series-audit.cjs'],['view','content/manuscript-review-view.js'],['client','content/manuscript-review-client.js']];
const aliases={'./family':'family','./profile':'profile','./literacy':'literacy','../miniprogram/lib/literacy':'literacy','../miniprogram/lib/family':'family','../miniprogram/lib/reviewed-personalization':'personalization','../scripts/manuscript-series-audit.cjs':'series','./manuscript-review-view':'view'};
const bundle=`(()=>{const modules={};const aliases=${JSON.stringify(aliases)};function require(id){const key=aliases[id];if(!modules[key])throw Error('Unknown module '+id);return modules[key];}function define(id,factory){const module={exports:{}};factory(require,module,module.exports);modules[id]=module.exports;}\n${moduleFiles.map(([id,file])=>`define('${id}',function(require,module,exports){\n${fs.readFileSync(path.join(root,file),'utf8')}\n});`).join('\n')}\n})();`;
assert.ok(!bundle.includes('</script>'));
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${view.esc(draft.title)} · 小小主角</title><style>${css}
.new-on-page{display:block;color:#75806b;font-size:11px;line-height:1.8;margin-top:8px;overflow-wrap:anywhere}.editorial,.settings{background:#f4f3ea;border-radius:8px;padding:12px 16px;margin-top:12px;font-size:13px;color:#58654f}.editorial p{overflow-wrap:anywhere}.attention{color:#805c35}.toc small{font-size:11px}.toc a{min-width:0}.toc a>strong{font-weight:400;overflow-wrap:anywhere;flex:1}.table-wrap{max-width:100%}a.quick{display:inline-block;margin:4px 14px 4px 0;line-height:2.2}.settings{border:1px solid #cdd8bf}.settings h2{font-size:22px}.field-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.field-row label{display:flex;flex-direction:column;gap:6px}.settings input[type=text],.settings select{font:inherit;min-height:42px;max-width:100%;width:100%;border:1px solid #b4c4a8;border-radius:6px;background:#fffef8;padding:7px}.settings fieldset{border:1px solid #cdd8bf;border-radius:6px;margin:14px 0;padding:10px}.member-options{display:flex;flex-wrap:wrap;gap:8px 18px}.member-options label{display:flex;align-items:center;min-height:38px;gap:5px}.settings button{font:inherit;min-height:42px;border:1px solid #a8b99a;background:#fffef8;color:#36533e;padding:8px 12px;border-radius:6px;cursor:pointer;margin:4px 5px 4px 0}.settings button[type=submit]{background:#365b42;color:white}.settings #personalization-status{min-height:24px}.settings .add-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.settings .add-row select{width:auto}#current-profile{font-weight:bold;overflow-wrap:anywhere}@media(max-width:540px){.field-row{grid-template-columns:1fr 1fr}.field-row label:first-child{grid-column:1/-1}.settings{padding:12px}.toc small{font-size:10px}}@media print{.settings,.intro,.notes,nav{display:none}}
</style></head><body><main><header class="intro"><span class="badge">2026.10.18 · 个性化与语句修订稿 · 文案待审</span><h1>30篇故事<br>按孩子和家人来读</h1><p>${view.esc(draft.introduction)}</p>
<a class="quick" href="#settings">修改孩子和家人 ↓</a><a class="quick" href="illustration-samples/rain-v1/">插画样图 ↓</a><a class="quick" href="#contents">查看全部30篇 ↓</a><a class="quick" href="#naturalness-review">这次修改说明 ↓</a>
<p>手机稿的设置保存在当前浏览器，用于核对定制后的文字；未自动写入账号后台。成品应用已有孩子年龄、班级与家庭成员设置，本稿30篇使用同样的数据格式生成文字。本次不增加插画或打印页。</p></header>
<section id="settings" class="settings"><h2>孩子和家人设置</h2><p id="current-profile">当前：小主角 · 5岁 · 大班 · 家庭3口人（含孩子），正文${bodyPages}页。</p>
<form id="personalization-form"><div class="field-row"><label>孩子名字<input name="name" type="text" value="小主角" autocomplete="off" required></label><label>年龄<select name="age" aria-label="年龄">${[3,4,5,6].map(n=>`<option value="${n}" ${n===5?'selected':''}>${n}岁</option>`).join('')}</select></label><label>班级<select name="className" aria-label="班级">${['小班','中班','大班'].map(c=>`<option ${c==='大班'?'selected':''}>${c}</option>`).join('')}</select></label></div>
<p>年龄和班级分别按真实情况选择，第1篇和第21篇一起更新。</p><fieldset><legend>实际出场的家人（含孩子）</legend><div class="member-options"><label><input type="checkbox" checked disabled>孩子</label>${roles}</div><div id="extra-members" class="member-options"></div><div class="add-row"><select name="extraRole" aria-label="再加一位兄弟姐妹">${['olderBrother','youngerBrother','olderSister','youngerSister'].map(role=>`<option value="${role}">${ROLE_OPTIONS.find(r=>r.id===role).label}</option>`).join('')}</select><button type="button" id="add-sibling">再加一位</button></div></fieldset>
<p>至少选一位实际参与亲子故事的大人。没有选爸爸或妈妈时，相关角色改用已选大人，不虚构家庭成员。</p><button type="submit">更新文稿</button><div id="family-presets"><button type="button" data-family-preset="3">看三口示例</button><button type="button" data-family-preset="4">看四口示例</button><button type="button" data-family-preset="6">看六口示例</button></div><p id="personalization-status" role="status" aria-live="polite">选择实际成员后点更新文稿；示例按钮也会保存当前浏览器的设置。</p></form></section>
<details class="editorial"><summary>页数与字量怎样随设置变化</summary><p>第3篇固定7页，实际家人分组放在原有两页介绍中，随后按漏数自己、再加回自己的数量生成结尾。所有篇章仍为${bodyPages}页，不增加重复封面或空白。</p><p>称谓、年龄、班级都计入实际用字，姓名不计。更大家庭可能一次接触更多称谓，实际负担在各篇下方照列，建议分段共读。默认示例第4篇起常态每篇1–7个新字，第6、7、18、24篇为8字，单页首次最多3字。</p><p>本轮新增辅助字“条”，用于一条小鱼；其余变化使用原有正文用字。纸质成本仍按A4双面0.5元、4个A5阅读页的单价口径，封面、目录、章后小结按最终分册方案另算。</p></details>
<nav id="contents" aria-label="故事目录">${view.renderToc(books,stats)}</nav><section id="series-review" class="notes">${view.renderSeries(books,data.wordTargets,draft.currentRevision)}</section><div id="story-cards">${view.renderCards(books,stats,data.wordTargets)}</div><section id="burden-ledger" class="notes">${view.renderLedger(books,stats)}</section><p class="notes">这是可核对的文字稿，改写的故事尚需配图。文字与排版检查不等于儿童试读验证。<a href="books-01-40.html">40篇旧稿对照</a></p></main>
<script id="manuscript-data" type="application/json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script><script>${bundle}</script></body></html>`;
const output=path.join(root,'output/text/level-1-reviewed-30.html');
const result={edition:draft.edition,reviewDate:draft.reviewDate,stories:30,bodyPages,bodyCharacters:chars.length,addedBodyCharacters:added.join(''),reviewedStories:draft.reviewedInThisEdition,bodyRevisedStories:draft.rewrittenInThisEdition,exceptionBooks:draft.gradingPolicy.allowedExceptionBooks,peakFirstExposuresAfterFirstThree:Math.max(...stats.slice(3).map(a=>a.peak)),books:stats.map((a,i)=>({...a,title:books[i].title,characters:a.characters.join(''),newCharacters:a.newCharacters.join(''),pageNew:a.pageNew.map(chars=>chars.join(''))}))};
fs.writeFileSync(output,html);fs.writeFileSync(path.join(root,'output/text/level-1-reviewed-30-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,books:undefined},null,2));
