'use strict';
const { defaultMembers, normalizeMembers, participants, ROLE_OPTIONS, createSibling } = require('../miniprogram/lib/family');
const { personalizeReviewedBooks, auditReviewedBooks } = require('../miniprogram/lib/reviewed-personalization');
const view = require('./manuscript-review-view');
const data = JSON.parse(document.getElementById('manuscript-data').textContent);
const storageKey='little-story-manuscript-profile-v1';
let extraMembers=[];
const form=document.getElementById('personalization-form');
const status=document.getElementById('personalization-status');
function renderExtras(members) {
  extraMembers=members.filter(m=>m.id.startsWith('member-'));
  document.getElementById('extra-members').innerHTML=extraMembers.map(m=>`<label><input type="checkbox" name="member" data-role="${m.role}" value="${m.id}" ${m.included?'checked':''}>${view.esc(ROLE_OPTIONS.find(r=>r.id===m.role).label)}（新增）</label>`).join('');
}
function setFields(profile,members) {
  form.elements.name.value=profile.name;form.elements.age.value=profile.age;form.elements.className.value=profile.className;
  for(const input of form.querySelectorAll('[data-base-role]'))input.checked=members.some(m=>m.id===input.value&&m.included);
  renderExtras(members);
}
function readFields() {
  const members=defaultMembers().map(m=>({...m,included:m.id==='child'||!!form.querySelector(`[data-base-role][value="${m.id}"]`)?.checked}));
  for(const extra of extraMembers)members.push({...extra,included:!!form.querySelector(`input[value="${extra.id}"]`)?.checked});
  return {profile:{name:form.elements.name.value,age:Number(form.elements.age.value),className:form.elements.className.value},members:normalizeMembers(members)};
}
function apply(settings,persist) {
  const books=personalizeReviewedBooks(data.books,settings.profile,settings.members);
  const stats=auditReviewedBooks(personalizeReviewedBooks(data.books,settings.profile,settings.members,{forStatistics:true}));
  document.getElementById('story-cards').innerHTML=view.renderCards(books,stats,data.wordTargets);
  document.getElementById('contents').innerHTML=view.renderToc(books,stats);
  document.getElementById('burden-ledger').innerHTML=view.renderLedger(books,stats);
  document.getElementById('series-review').innerHTML=view.renderSeries(books,data.wordTargets,data.currentRevision);
  const count=participants(settings.members).length;
  document.getElementById('current-profile').textContent=`当前：${settings.profile.name} · ${settings.profile.age}岁 · ${settings.profile.className} · 家庭${count}口人（含孩子），正文${books.reduce((n,b)=>n+b.pages.length,0)}页。`;
  status.textContent='文稿和识字统计已按当前设置更新。';
  if(persist){try{localStorage.setItem(storageKey,JSON.stringify(settings));status.textContent+=' 设置保存在当前浏览器。';}catch{status.textContent+=' 当前浏览器无法保存设置，本次预览仍有效。';}}
}
form.addEventListener('submit',event=>{event.preventDefault();try{apply(readFields(),true);}catch(error){status.textContent=error.message;}});
document.getElementById('family-presets').addEventListener('click',event=>{
  const button=event.target.closest('[data-family-preset]');if(!button)return;
  const roles={3:['child','dad','mom'],4:['child','dad','mom','youngerSister'],6:['child','dad','mom','grandpa','grandma','olderBrother']}[button.dataset.familyPreset];
  const members=defaultMembers().map(m=>({...m,included:roles.includes(m.role)}));
  setFields(readFields().profile,members);
  try{apply(readFields(),true);}catch(error){status.textContent=error.message;}
});
document.getElementById('add-sibling').addEventListener('click',()=>{try{
  const settings=readFields(),members=createSibling(settings.members,form.elements.extraRole.value);renderExtras(members);
}catch(error){status.textContent=error.message;}});
try{
  const stored=localStorage.getItem(storageKey);
  if(stored){const settings=JSON.parse(stored);settings.members=normalizeMembers(settings.members);apply(settings,false);setFields(settings.profile,settings.members);}
}catch{status.textContent='已显示默认示例；旧设置无效，可在这里重新选择。';}
