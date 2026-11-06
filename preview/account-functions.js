// Browser test identity stays separate from native WeChat auth and credentials.
const ACCOUNT_DEMO_KEY = 'little-story.preview-demo.v1';
const ACCOUNT_DEMO_PROFILE_KEY = 'little-story.preview-account-profile.v1';
const ACCOUNT_DEMO_DURATION = 12 * 60 * 60 * 1000;
const ACCOUNT_READING_KEY = 'little-story.preview-reading.'+shared.currentEdition.EDITION;
function readDemoAccount() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACCOUNT_DEMO_KEY) || 'null');
    if (saved?.version === 1 && saved.mode === 'demo' && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) return saved;
  } catch (_) {}
  return null;
}
function readDemoProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_DEMO_PROFILE_KEY) || 'null');
    if (saved?.version === 1) return { version: 1, nickname: shared.accountPolicy.validateNickname(saved.nickname), onboardingCompleted: saved.onboardingCompleted === true };
  } catch (_) {}
  return { version: 1, nickname: '测试家长', onboardingCompleted: false };
}
let demoProfile = readDemoProfile();
const accountPreview = { agreed: false, error: '', policy: 'privacy', back: 'account', demo: readDemoAccount(), notice: '', mode: '', draft: '', confirmation: '', busy: false, hasChild: null, savedChild: null, childError: '', childPhotoError: false, childRequest: null, childRevision: 0 };
let accountReading = {}, accountReadingError = '';
let accountBackupPlan = null, accountBackupUrl = '', accountBackupBusyRevision = 0;
function clearAccountBackup() {
  accountBackupBusyRevision++;
  accountBackupPlan = null;
  if(accountBackupUrl)URL.revokeObjectURL(accountBackupUrl);
  accountBackupUrl = '';
}
function accountBackupEditor() {
  if(!['backup-export','backup-choose','backup-restore'].includes(accountPreview.mode))return '';
  const busy=accountPreview.busy?'disabled':'', plan=accountBackupPlan;
  let content='';
  if(accountPreview.mode==='backup-export')content='<p>备份包含当前小主角、家人资料、全部已保存头像和阅读记录，不含测试家长称呼、登录状态或订单。文件未加密，含孩子真实照片，请自行妥善保管；生成过程不上传。</p>'+(accountBackupUrl?'<a class="ls-primary ls-start" style="display:block;text-align:center;text-decoration:none" href="'+escape(accountBackupUrl)+'" download="小小主角-浏览器资料备份.json">下载备份文件</a>':'<button type="button" class="ls-primary ls-start" data-action="account-backup-generate" '+busy+'>确认生成备份文件</button>');
  if(accountPreview.mode==='backup-choose')content='<p>选择本程序浏览器版导出的JSON备份文件，最大32MB。选择后先显示资料预览，确认前不改动本机资料。微信小程序备份需在微信版恢复。</p><label class="ls-input-group"><span>选择备份文件</span><input id="ls-account-backup-file" type="file" accept=".json,application/json" style="width:100%;max-width:100%;font-size:14px" '+busy+'></label>';
  if(accountPreview.mode==='backup-restore'&&plan){
    const profile=plan.backup.child.profile;
    content='<p>备份小主角：<strong>'+escape(profile.name)+'</strong> · '+profile.age+'岁 · '+escape(profile.className)+'<br>家庭故事 '+participants(plan.backup.child.members).length+' 人，'+Object.keys(plan.backup.child.avatars).length+' 张已保存头像，'+plan.backup.reading.length+' 本阅读记录。</p><p>将替换本浏览器'+(plan.targetName?'“'+escape(plan.targetName)+'”的':'现有的')+'孩子、家人、头像和阅读记录。家长测试账号、其他网站、下载文件和订单保持不变。请先备份要保留的旧资料。</p>'+(plan.childRestored?'<p class="ls-error">孩子和家人资料已恢复；阅读记录尚未恢复。关闭面板不会撤销已恢复的资料。</p>':'')+'<label class="ls-input-group"><span>请输入“恢复”确认替换</span><input id="ls-account-backup-word" autocomplete="off" value="'+escape(accountPreview.confirmation)+'" '+busy+'></label><button id="ls-account-backup-restore" type="button" class="ls-primary ls-start" data-action="account-backup-confirm" '+(accountPreview.busy||accountPreview.confirmation!=='恢复'?'disabled':'')+'>'+(plan.childRestored?'重试恢复阅读记录':'确认替换并恢复')+'</button>';
  }
  return '<section class="ls-account-card ls-account-backup" style="text-align:left;margin-top:18px" aria-label="资料备份与恢复"><h2>'+(accountPreview.mode==='backup-export'?'导出本机备份':'从备份恢复')+'</h2>'+content+'<button type="button" class="ls-back ls-browse" data-action="account-cancel-backup" '+busy+'>'+(plan?.childRestored?'关闭':'取消，保留现有资料')+'</button></section>';
}
async function generateAccountBackup() {
  if(accountPreview.mode!=='backup-export'||accountPreview.busy)return;
  const revision=accountBackupBusyRevision;
  accountPreview.busy=true;accountPreview.error='';render();
  try{
    const saved=await readSavedProfile();
    const text=shared.accountBackup.createBrowserBackup(saved,Object.values(accountReading));
    if(revision!==accountBackupBusyRevision||accountPreview.mode!=='backup-export')return;
    accountBackupUrl=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
    accountPreview.notice='备份已在本机生成，请点击“下载备份文件”保存。';
  }catch(error){accountPreview.error=error.message||'无法生成备份，请检查本机资料后重试。';}
  finally{accountPreview.busy=false;render();}
}
async function selectAccountBackup(file) {
  if(!file||accountPreview.busy)return;
  const revision=++accountBackupBusyRevision;
  accountPreview.busy=true;accountPreview.error='';render();
  try{
    if(!Number.isFinite(file.size)||file.size<1||file.size>shared.accountBackup.MAX_BACKUP_BYTES)throw Error('请选择不超过32MB的JSON备份文件。');
    const backup=shared.accountBackup.parseBrowserBackup(await file.text()),actors={};
    let pixels=0;
    for(const [id,actor]of Object.entries(backup.child.avatars)){
      const image=await loadImage(actor.data),width=image.naturalWidth,height=image.naturalHeight;
      pixels+=width*height;
      if(width>8192||height>8192||pixels>64000000)throw Error('备份头像尺寸过大，请使用本程序原始导出的文件。');
      const member=backup.child.members.find(item=>item.id===id);
      actors[id]={...actor,image:canUsePhoto(member.role)?image:null,layout:canUsePhoto(member.role)?normalizeLayout():actor.layout,
        metrics:actor.metrics||(actor.kind==='cutout'&&canUsePhoto(member.role)?measureAvatar(image):null)};
    }
    const current=await readSavedProfile();
    if(revision!==accountBackupBusyRevision||!['account','accountLogin'].includes(state.view))return;
    accountBackupPlan={backup,actors,targetSignature:JSON.stringify(current)||'',targetName:current?normalizeProfile(current.profile).name:'',
      readingSignature:localStorage.getItem(ACCOUNT_READING_KEY),childRestored:false};
    accountPreview.mode='backup-restore';accountPreview.confirmation='';accountPreview.notice='文件已读取，请核对恢复范围后确认。';
  }catch(error){accountPreview.error=error.message||'备份无法读取，原有资料未改变。';}
  finally{accountPreview.busy=false;render();}
}
function applyAccountBackupReading(rows) {
  accountReading={};state.progress={};state.completed=[];
  for(const row of rows){
    const book=books.find(item=>item.id===row.bookId);if(!book)continue;
    accountReading[row.bookId]={...row};
    if(!row.finished)state.progress[row.bookId]=Math.min(row.page,book.pages(state.profile).length);
    if(row.completed)state.completed.push(row.bookId);
  }
  accountReadingError='';
}
async function restoreAccountBackup() {
  const plan=accountBackupPlan;
  if(!plan||accountPreview.mode!=='backup-restore'||accountPreview.confirmation!=='恢复'||accountPreview.busy)return;
  accountPreview.busy=true;accountPreview.error='';accountPreview.notice='';render();
  try{
    if(localStorage.getItem(ACCOUNT_READING_KEY)!==plan.readingSignature)throw Error('阅读记录已在其他页面变化，请重新选择备份并确认。');
    if(!plan.childRestored){
      const db=await openDatabase();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('child','readwrite'),store=tx.objectStore('child'),request=store.get('main');let conflict=false,failure=null;
        request.onsuccess=()=>{
          if((JSON.stringify(request.result)||'')!==plan.targetSignature||accountBackupPlan!==plan){conflict=true;tx.abort();return;}
          try{store.put(plan.backup.child,'main');}catch(error){failure=error;tx.abort();}
        };
        tx.oncomplete=resolve;tx.onerror=()=>{};tx.onabort=()=>reject(conflict?Error('本机孩子资料已变化，请重新选择备份并确认。'):failure||tx.error||Error('孩子资料恢复失败，原资料仍保留。'));
      });
      plan.childRestored=true;plan.targetSignature=JSON.stringify(plan.backup.child);
      discardDraft();state.profile=normalizeProfile(plan.backup.child.profile);state.members=migrateMembers(plan.backup.child);state.avatars=plan.actors;
      state.page=0;state.onCover=true;invalidateAccountChild();
    }else if((JSON.stringify(await readSavedProfile())||'')!==plan.targetSignature)throw Error('孩子资料已变化，请重新选择备份并确认。');
    try{
      const rows=plan.backup.reading.filter(row=>books.some(book=>book.id===row.bookId));
      localStorage.setItem(ACCOUNT_READING_KEY,JSON.stringify({version:1,records:rows}));
      applyAccountBackupReading(rows);accountPreview.mode='';accountPreview.confirmation='';
      accountPreview.notice='小主角、家人头像和阅读记录已恢复。家长测试账号保持不变。';clearAccountBackup();
    }catch(error){accountPreview.notice='孩子和家人资料已恢复，阅读记录暂未恢复。可重试恢复阅读记录；当前阅读记录仍保留。';}
  }catch(error){accountPreview.error=error.message||'恢复未完成，请重试。';invalidateAccountChild();}
  finally{accountPreview.busy=false;render();}
}
root.addEventListener('change',event=>{if(event.target.id==='ls-account-backup-file')void selectAccountBackup(event.target.files?.[0]);});
window.addEventListener('pagehide',clearAccountBackup);
function loadAccountReading() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_READING_KEY) || 'null');
    accountReading = {};
    if (saved && (saved.version !== 1 || !Array.isArray(saved.records))) throw Error('invalid reading data');
    for (const record of (saved?.records || []).slice(0,100)) {
      if (!record || !books.some(book => book.id === record.bookId) || !Number.isInteger(record.page) || record.page < 0 || record.page > 500 || !Number.isFinite(record.updatedAt)) continue;
      accountReading[record.bookId] = { bookId: record.bookId, page: record.page, cover: record.cover === true,
        completed: record.completed === true, finished: record.finished === true, updatedAt: record.updatedAt };
    }
    accountReadingError = '';
  } catch (_) { accountReadingError = '本机阅读记录暂时无法读取，可以继续读故事。'; }
}
loadAccountReading();
// This module observes the existing reader controls without replacing shared handlers.
// Restore once the saved child/family has loaded, before a reader can be opened.
let accountReadingRestored = false;
const accountReadingObserver = new MutationObserver(() => {
  if (!ready || accountReadingRestored) return;
  accountReadingRestored = true;
  accountReadingObserver.disconnect();
  for (const record of Object.values(accountReading)) {
    const book = books.find(item => item.id === record.bookId);
    if (!record.finished) state.progress[record.bookId] = Math.min(record.page, book.pages(state.profile).length);
    if (record.completed && !state.completed.includes(record.bookId)) state.completed.push(record.bookId);
  }
  render();
});
accountReadingObserver.observe(root, {childList: true, subtree: true});
function saveAccountReading() {
  if (!ready || accountPreview.busy || !['reader','done'].includes(state.view)) return;
  const current = books.find(book => book.id === state.book);
  if (!current) return;
  accountReading[state.book] = { bookId: state.book, page: Math.min(state.page, current.pages(state.profile).length),
    cover: state.onCover, completed: state.completed.includes(state.book), finished: state.view === 'done', updatedAt: Date.now() };
  try {
    localStorage.setItem(ACCOUNT_READING_KEY, JSON.stringify({ version: 1, records: Object.values(accountReading) }));
    accountReadingError = ''; root.querySelector('#ls-reading-storage-note')?.remove();
  } catch (_) {
    accountReadingError = '本次阅读进度暂未保存，可以继续阅读；翻页时会重试。';
    let note = root.querySelector('#ls-reading-storage-note');
    if (!note) { note = document.createElement('p'); note.id = 'ls-reading-storage-note'; note.className = 'ls-account-note'; note.setAttribute('role','status'); root.querySelector('.ls-reader,.ls-done')?.append(note); }
    note.textContent = accountReadingError; live.textContent = accountReadingError;
  }
}
// Install after the shared module has registered its handlers. Reading state
// must be observed after the turn, including a turn that opens the final page.
Promise.resolve().then(() => {
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled && ['start','start-intro','next','previous','reread'].includes(button.dataset.action)) saveAccountReading();
  });
  root.addEventListener('pointerup', () => { if (['reader','done'].includes(state.view)) saveAccountReading(); });
  document.addEventListener('keydown', event => {
    if (['reader','done'].includes(state.view) && !event.target.closest('input,select,textarea') && ['ArrowLeft','ArrowRight'].includes(event.key)) saveAccountReading();
  });
});
function accountReadingCard() {
  const records = Object.values(accountReading).sort((a,b) => b.updatedAt-a.updatedAt);
  return '<section class="ls-account-card ls-account-reading" style="text-align:left;margin-top:18px" aria-label="本机阅读记录"><h2>阅读足迹</h2><p style="color:#426751">读过 '+records.length+' 本 · 已读完 '+records.filter(record=>record.completed).length+' 本</p>'+(accountReadingError?'<p class="ls-error" role="alert">'+escape(accountReadingError)+'</p>':'')+(records.length?records.map(record=>{
    const book = books.find(item=>item.id===record.bookId), total = book.pages(state.profile).length;
    const note = record.finished?'已读完 · 再读一遍':record.cover?'从封面继续':record.page>=total?'识字小结 · 继续阅读':'读到第 '+(record.page+1)+' / '+total+' 页 · 继续阅读';
    return '<button type="button" class="ls-account-row" data-action="account-continue-book" data-id="'+escape(book.id)+'" '+(accountPreview.busy?'disabled':'')+'><span>'+escape(book.title(state.profile))+'<small>'+note+'</small></span><span>›</span></button>';
  }).join(''):'<p>还没有阅读记录，打开一本故事就开始记录。</p>')+'<p class="ls-account-note">只记录翻页进度和是否读完，不代表已掌握本书汉字。记录在本浏览器保存，退出测试账号仍保留。</p></section>';
}
function demoAccountActive() {
  if (accountPreview.demo && accountPreview.demo.expiresAt <= Date.now()) {
    accountPreview.demo = null; accountPreview.mode = '';
    try { sessionStorage.removeItem(ACCOUNT_DEMO_KEY); } catch (_) {}
    accountPreview.notice = '测试体验已到期，可以重新进入。';
  }
  return !!accountPreview.demo;
}
function checkAccountChild() {
  if (accountPreview.busy || accountPreview.hasChild !== null || accountPreview.childRequest) return;
  const revision = accountPreview.childRevision;
  accountPreview.childRequest = readSavedProfile().then(saved => {
    if (revision !== accountPreview.childRevision) return;
    if (saved && ![1,2,3,4].includes(saved.version)) throw Error('unsupported profile version');
    accountPreview.hasChild = !!saved; accountPreview.savedChild = saved || null; accountPreview.childError = '';
  }).catch(() => { if (revision === accountPreview.childRevision) { accountPreview.hasChild = false; accountPreview.savedChild = null; accountPreview.childError = '本机孩子资料暂时无法读取，请重试。'; } }).finally(() => {
    if (revision !== accountPreview.childRevision) return;
    accountPreview.childRequest = null;
    if (['account', 'accountLogin'].includes(state.view) && !accountPreview.mode && !accountPreview.busy) render();
  });
}
function accountChildCard() {
  const saved = accountPreview.savedChild;
  let content;
  if (accountPreview.childError) content = '<p class="ls-error" role="alert">'+escape(accountPreview.childError)+'</p><button type="button" class="ls-back ls-browse" data-action="account-retry-child">重新读取孩子资料</button>';
  else if (accountPreview.hasChild === null) content = '<p role="status">正在读取本机孩子资料…</p>';
  else if (!saved) content = '<p>尚未保存孩子资料。填写名字后，故事里的主角就会使用孩子的名字。</p>';
  else {
    const child = normalizeProfile(saved.profile), avatar = saved.version >= 3 ? saved.avatars?.child?.data : saved.avatarData;
    const photo = !accountPreview.childPhotoError && typeof avatar === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(avatar);
    const familyCount = participants(migrateMembers(saved)).length;
    content = '<div style="display:flex;gap:16px;align-items:center;margin-top:18px">'+(photo?'<img data-account-child-photo data-revision="'+accountPreview.childRevision+'" src="'+escape(avatar)+'" alt="已保存的孩子头像" style="width:66px;height:78px;object-fit:contain;flex-shrink:0;border-radius:12px;background:#fffdf7">':'<span aria-hidden="true" style="width:66px;height:78px;line-height:78px;text-align:center;flex-shrink:0;border-radius:12px;background:#fffdf7;color:#426751;font-size:28px">阅</span>')+'<div style="min-width:0;overflow-wrap:anywhere"><strong style="font-size:20px">'+escape(child.name)+'</strong><p style="margin:6px 0">'+child.age+' 岁 · '+escape(child.className)+'</p><small>'+(accountPreview.childPhotoError?'头像暂时无法显示，请在小主角设置中重新选择照片':photo?'已保存头像':'使用默认卡通形象，照片可稍后添加')+'</small></div></div><p>家庭故事中有 '+familyCount+' 位家人出场（含小主角）。</p>';
  }
  return '<section class="ls-account-card ls-account-child" style="text-align:left;margin-top:18px" aria-label="本机孩子资料"><h2>故事里的小主角</h2>'+content+'<p class="ls-account-note">'+(demoAccountActive()?'测试账号沿用的本机小主角':'本机游客资料')+' · 仅在本浏览器保存</p></section>';
}
function invalidateAccountChild() {
  accountPreview.childRevision++; accountPreview.childRequest = null; accountPreview.hasChild = null;
  accountPreview.savedChild = null; accountPreview.childError = ''; accountPreview.childPhotoError = false;
}
root.addEventListener('error', event => {
  if (!event.target.matches?.('[data-account-child-photo]') || !root.contains(event.target) ||
      event.target.dataset.revision !== String(accountPreview.childRevision) || accountPreview.childPhotoError) return;
  accountPreview.childPhotoError = true;
  if (['account','accountLogin'].includes(state.view)) render();
}, true);
function demoProfileSave(next) {
  const saved = { version: 1, nickname: shared.accountPolicy.validateNickname(next.nickname), onboardingCompleted: next.onboardingCompleted === true };
  localStorage.setItem(ACCOUNT_DEMO_PROFILE_KEY, JSON.stringify(saved));
  demoProfile = saved;
}
function accountRow(action, title, note = '') {
  return '<button type="button" class="ls-account-row" data-action="'+action+'" '+(accountPreview.busy?'disabled':'')+'><span>'+escape(title)+(note?'<small>'+escape(note)+'</small>':'')+'</span><span>›</span></button>';
}
function accountOnboarding() {
  if (demoProfile.onboardingCompleted) return '';
  return '<section class="ls-account-card ls-account-guide" style="text-align:left;margin-top:18px" aria-label="首次注册引导"><h2>第一次见面，先认识一下</h2><p>家长称呼和孩子名字分开设置，照片可以稍后添加。</p>'+accountRow('account-edit-name','1. 设置家长称呼',demoProfile.nickname)+accountRow('profile','2. 设置故事里的小主角',accountPreview.hasChild?'本机资料已保存':'填写孩子名字、年龄和班级')+'<button type="button" class="ls-primary ls-start" data-action="account-finish-guide">'+(accountPreview.hasChild?'完成引导，去书架':'去设置小主角')+'</button><button type="button" class="ls-back ls-browse" data-action="home">稍后设置，先读故事</button></section>';
}
function accountEditor() {
  if(accountPreview.mode.startsWith('backup-'))return accountBackupEditor();
  if (accountPreview.mode === 'nickname') return '<section class="ls-account-card" style="text-align:left;margin-top:18px" aria-label="编辑家长称呼"><h2>家长称呼</h2><p>仅修改家长的称呼，不会替换孩子名字。</p><label class="ls-input-group"><span>家长称呼（1至16个字）</span><input id="ls-account-nickname" maxlength="64" autocomplete="off" value="'+escape(accountPreview.draft)+'" placeholder="例如：豆豆妈妈"></label><button type="button" class="ls-primary ls-start" data-action="account-save-name">保存称呼</button><button type="button" class="ls-back ls-browse" data-action="account-cancel-edit">取消修改</button></section>';
  if (!['delete-child', 'close-demo'].includes(accountPreview.mode)) return '';
  const closing = accountPreview.mode === 'close-demo', word = closing?'注销':'删除';
  return '<section class="ls-account-card" style="text-align:left;margin-top:18px;background:#f5e9df" aria-label="'+(closing?'注销测试账号确认':'删除本机资料确认')+'"><h2>'+(closing?'确认注销测试账号':'确认删除本机孩子资料')+'</h2><p>'+(closing?'仅清除当前浏览器的测试家长称呼、引导记录和当前标签页的测试登录状态。不会注销任何真实微信账号，本机小主角资料保留。':'将清除当前浏览器保存的孩子姓名、年龄、班级、家庭成员和全部头像，以及本页阅读进度，无法撤销。测试家长称呼和其他网站的数据保留。')+'</p><p>其他设备资料、已下载文件、已提交给运营方的打印文件及订单不在本次删除范围。</p><label class="ls-input-group"><span>请输入“'+word+'”确认</span><input id="ls-account-danger-input" autocomplete="off" value="'+escape(accountPreview.confirmation)+'" '+(accountPreview.busy?'disabled':'')+'></label><button type="button" id="ls-account-danger-confirm" class="ls-primary ls-start" style="background:#9c4b3b" data-action="account-confirm-danger" '+(accountPreview.busy||accountPreview.confirmation!==word?'disabled':'')+'>'+(accountPreview.busy?'正在处理…':closing?'确认注销测试账号':'确认删除本机资料')+'</button><button type="button" class="ls-back ls-browse" data-action="account-cancel-edit" '+(accountPreview.busy?'disabled':'')+'>取消，保留资料</button></section>';
}
function account() {
  const testing = demoAccountActive(); checkAccountChild();
  const card = testing
    ? '<h2>你好，'+escape(demoProfile.nickname)+'</h2><p><span class="ls-level">测试模式 · 非真实微信账号</span></p><p>测试账号 TEST-001<br>可以继续设置小主角、阅读和下载绘本。</p><button type="button" class="ls-primary ls-start" data-action="home">进入我的书架 →</button>'
    : '<h2>欢迎来到小小主角</h2><p>首次微信登录会自动创建家长账号。</p><button type="button" class="ls-primary ls-start" data-action="account-login">注册 / 登录 / 测试体验</button>';
  return topbar('home', '书架')+'<main class="ls-account"><p class="ls-kicker">小小主角 · 家长中心</p><h1>陪伴，从一个故事开始。</h1><section class="ls-account-card ls-account-identity"><div class="ls-account-mark" aria-hidden="true">阅</div>'+card+'</section>'+(accountPreview.notice?'<p class="ls-account-note" role="status">'+escape(accountPreview.notice)+'</p>':'')+(testing&&!accountPreview.mode?accountOnboarding():'')+(testing?'<p class="ls-account-section">家长资料</p>'+accountRow('account-edit-name','家长称呼',demoProfile.nickname+' · 不会替换孩子的名字'):'')+accountEditor()+'<p class="ls-error" id="ls-account-management-error" role="alert">'+escape(accountPreview.error)+'</p><p class="ls-account-section">孩子与阅读</p>'+accountChildCard()+accountRow('profile','我的小主角','设置姓名和故事里的形象')+accountRow('home','我的书架','打开故事，和孩子一起读')+accountReadingCard()+'<p class="ls-account-note">孩子资料和照片仅在本机保存，暂不跨设备同步。'+(testing?'测试体验沿用本机已有的小主角，退出测试不会清除孩子资料。':'家长账号与孩子形象分开管理。')+'</p><p class="ls-account-section">服务与隐私</p><button type="button" class="ls-account-row" data-action="account-legal" data-type="terms"><span>用户服务说明</span><span>›</span></button><button type="button" class="ls-account-row" data-action="account-legal" data-type="privacy"><span>隐私说明</span><span>›</span></button><p class="ls-account-section">资料与账号管理</p>'+accountRow('account-backup-export','导出本机备份','保存小主角、家人头像与阅读记录')+accountRow('account-backup-import','从备份恢复','选择浏览器版备份，预览后确认替换')+accountRow('account-delete-child','删除本机孩子资料','会清除本浏览器的全部小主角和家人资料，需单独确认')+(testing?accountRow('account-close-demo','注销测试账号','仅清除测试账号资料，保留本机小主角')+'<button type="button" class="ls-secondary ls-start" data-action="account-demo-logout">退出测试账号</button>':'')+'</main>'+nav('account');
}
function accountLogin() {
  if (demoAccountActive()) return account();
  return topbar('account', '返回')+'<main class="ls-login"><div class="ls-account-mark" aria-hidden="true">阅</div><p class="ls-kicker">小小主角 · 家长账号</p><h1>陪孩子，<br>读自己的故事。</h1><p class="ls-account-note">一个家长账号，连接孩子的阅读时光。</p><div class="ls-login-benefits"><p><span>01</span> 首次微信登录，自动创建家长账号</p><p><span>02</span> 孩子资料在本机独立保存</p><p><span>03</span> 不申请手机号或微信头像</p></div><p class="ls-account-note ls-login-availability">当前为浏览器测试版。<br>使用测试账号体验注册引导和账号管理。<br>正式微信注册、登录需在微信小程序中完成。</p><button type="button" class="ls-primary ls-start" data-action="account-demo-login">测试账号进入</button><div class="ls-account-consent"><label><input id="ls-account-consent" type="checkbox" '+(accountPreview.agreed?'checked':'')+'> 我已阅读并同意</label><div><button type="button" data-action="account-legal" data-type="terms">《用户服务说明》</button><button type="button" data-action="account-legal" data-type="privacy">《隐私说明》</button></div></div><p id="ls-account-error" class="ls-error" role="alert">'+escape(accountPreview.error)+'</p><button type="button" class="ls-back ls-browse" data-action="home">先逛逛书架 →</button><p class="ls-account-note ls-parent-note">测试账号不代表真实微信身份。<br>测试状态在当前标签页保留，最长 12 小时。</p></main>';
}
function accountLegal() {
  const policy = shared.accountPolicy.policies[accountPreview.policy];
  return topbar(accountPreview.back==='accountLogin'?'account-login':'account','返回')+'<main class="ls-account-legal"><h2>'+escape(policy.title)+'</h2><p class="ls-account-note">说明版本：'+shared.accountPolicy.POLICY_VERSION+'</p>'+policy.paragraphs.map((text,index)=>'<p>'+(index+1)+'. '+escape(text)+'</p>').join('')+'</main>';
}
function showAccountError(error) {
  accountPreview.error = error.message || '操作未完成，请重试。';
  if (['account','accountLogin'].includes(state.view)) render();
}
async function confirmAccountDanger() {
  const mode = accountPreview.mode, closing = mode === 'close-demo';
  if (!['close-demo','delete-child'].includes(mode) || accountPreview.confirmation !== (closing?'注销':'删除')) return;
  accountPreview.busy = true; accountPreview.error = '';
  if (!closing) invalidateAccountChild();
  render();
  try {
    if (closing) {
      localStorage.removeItem(ACCOUNT_DEMO_PROFILE_KEY); sessionStorage.removeItem(ACCOUNT_DEMO_KEY);
      accountPreview.demo = null; accountPreview.agreed = false; demoProfile = readDemoProfile();
      accountPreview.notice = '测试账号已注销，本机小主角资料仍保留。没有注销任何真实微信账号。';
    } else {
      const db = await openDatabase();
      localStorage.removeItem(ACCOUNT_READING_KEY);
      await new Promise((resolve,reject) => {
        const transaction = db.transaction('child','readwrite');
        transaction.objectStore('child').delete('main');
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error || Error('本机资料删除失败，请重试。'));
        transaction.onerror = () => {};
      });
      discardDraft(); state.profile = { ...DEFAULT_PROFILE }; state.members = defaultMembers(); state.avatars = {};
      state.progress = {}; state.completed = []; state.page = 0; state.onCover = true;
      accountReading = {}; accountReadingError = '';
      accountPreview.hasChild = false;
      accountPreview.savedChild = null; accountPreview.childError = '';
      accountPreview.notice = '本浏览器的小主角和家人资料已清除，可以重新设置。';
    }
    accountPreview.mode = ''; accountPreview.confirmation = '';
  } catch (error) { accountPreview.error = error.message || '操作未完成，请重试。'; }
  finally { accountPreview.busy = false; render(); }
}
root.addEventListener('input', event => {
  if(event.target.id==='ls-account-backup-word'){
    accountPreview.confirmation=event.target.value;
    const confirm=root.querySelector('#ls-account-backup-restore');if(confirm)confirm.disabled=accountPreview.busy||accountPreview.confirmation!=='恢复';
  }
  if (event.target.id === 'ls-account-nickname') accountPreview.draft = event.target.value;
  if (event.target.id === 'ls-account-danger-input') {
    accountPreview.confirmation = event.target.value;
    const button = root.querySelector('#ls-account-danger-confirm');
    if (button) button.disabled = accountPreview.busy || accountPreview.confirmation !== (accountPreview.mode==='close-demo'?'注销':'删除');
  }
});
function handleAccountAction(action, button) {
  if (accountPreview.busy) return true;
  if(action==='account-backup-export'||action==='account-backup-import'){
    clearAccountBackup();accountPreview.mode=action==='account-backup-export'?'backup-export':'backup-choose';accountPreview.confirmation='';accountPreview.error='';accountPreview.notice='';render();root.querySelector('.ls-account-backup')?.scrollIntoView({block:'start',behavior:'smooth'});return true;
  }
  if(action==='account-backup-generate'){void generateAccountBackup();return true;}
  if(action==='account-backup-confirm'){void restoreAccountBackup();return true;}
  if(action==='account-cancel-backup'){clearAccountBackup();accountPreview.mode='';accountPreview.confirmation='';accountPreview.error='';render();return true;}
  if(accountPreview.mode.startsWith('backup-')&&!action.startsWith('account-backup-')){clearAccountBackup();accountPreview.mode='';accountPreview.confirmation='';}
  if (action === 'account') { accountPreview.mode = ''; accountPreview.error = ''; invalidateAccountChild(); navigate('account'); return true; }
  if (action === 'account-retry-child') { invalidateAccountChild(); render(); return true; }
  if (action === 'account-continue-book') {
    const record = accountReading[button.dataset.id];
    if (!record) return true;
    state.book = record.bookId;
    state.page = record.finished ? 0 : Math.min(record.page, pageList().length);
    state.onCover = record.finished || record.cover;
    if (record.finished) state.progress[state.book] = 0;
    navigate('reader'); void trackOperation('read',state.book); saveAccountReading(); return true;
  }
  if (action === 'account-login') { accountPreview.error = ''; accountPreview.mode = ''; navigate(demoAccountActive()?'account':'accountLogin'); return true; }
  if (action === 'account-demo-login' || action === 'account-wechat') {
    accountPreview.agreed = !!root.querySelector('#ls-account-consent')?.checked;
    if (!accountPreview.agreed) { accountPreview.error = '请先阅读并同意用户服务说明与隐私说明。'; root.querySelector('#ls-account-error').textContent = accountPreview.error; return true; }
    accountPreview.demo = { version: 1, mode: 'demo', expiresAt: Date.now()+ACCOUNT_DEMO_DURATION };
    accountPreview.notice = '已进入测试账号，可以体验注册引导和账号管理。';
    try { sessionStorage.setItem(ACCOUNT_DEMO_KEY,JSON.stringify(accountPreview.demo)); }
    catch (_) { accountPreview.notice = '已进入测试账号。浏览器暂不能保存测试状态，刷新后请重新进入。'; }
    accountPreview.error = ''; accountPreview.mode = ''; accountPreview.hasChild = null;
    navigate('account'); live.textContent = '已进入测试账号，当前为测试模式。'; return true;
  }
  if (action === 'account-edit-name' && demoAccountActive()) { accountPreview.mode = 'nickname'; accountPreview.draft = demoProfile.nickname; accountPreview.error = ''; accountPreview.notice = ''; render(); return true; }
  if (action === 'account-save-name' && demoAccountActive()) {
    try { demoProfileSave({ ...demoProfile, nickname: accountPreview.draft }); accountPreview.mode = ''; accountPreview.notice = '家长称呼已保存在本机测试账号中。'; accountPreview.error = ''; }
    catch (error) { accountPreview.error = error.message || '称呼未能保存，请检查本机存储后重试。'; }
    render(); return true;
  }
  if (action === 'account-finish-guide' && demoAccountActive()) {
    if (!accountPreview.hasChild) { root.querySelector('[data-action="profile"]').click(); return true; }
    try { demoProfileSave({ ...demoProfile, onboardingCompleted: true }); accountPreview.mode = ''; navigate('home'); }
    catch (error) { showAccountError(error); }
    return true;
  }
  if (action === 'account-cancel-edit') { accountPreview.mode = ''; accountPreview.confirmation = ''; accountPreview.error = ''; render(); return true; }
  if (action === 'account-delete-child' || action === 'account-close-demo' && demoAccountActive()) {
    accountPreview.mode = action==='account-delete-child'?'delete-child':'close-demo'; accountPreview.confirmation = ''; accountPreview.error = ''; accountPreview.notice = ''; render();
    root.querySelector('#ls-account-danger-input')?.scrollIntoView({block:'center',behavior:'smooth'}); return true;
  }
  if (action === 'account-confirm-danger') { void confirmAccountDanger(); return true; }
  if (action === 'account-demo-logout') {
    accountPreview.demo = null; accountPreview.agreed = false; accountPreview.error = ''; accountPreview.mode = '';
    accountPreview.notice = '已退出测试账号，小主角和阅读资料仍保留在本机。';
    try { sessionStorage.removeItem(ACCOUNT_DEMO_KEY); } catch (_) { accountPreview.notice = '本次页面已退出测试账号；关闭当前标签页可清除未能移除的测试状态。'; }
    navigate('account'); live.textContent = '已退出测试账号。'; return true;
  }
  if (action === 'account-legal') {
    accountPreview.back = state.view;
    const consentInput = root.querySelector('#ls-account-consent'); if (consentInput) accountPreview.agreed = consentInput.checked;
    accountPreview.policy = button.dataset.type==='terms'?'terms':'privacy'; navigate('accountLegal'); return true;
  }
  if (['home','profile','cancel-profile'].includes(action)) { accountPreview.mode = ''; accountPreview.error = ''; invalidateAccountChild(); }
  return false;
}
