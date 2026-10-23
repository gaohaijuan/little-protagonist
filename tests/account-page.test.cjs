'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {validateNickname}=require('../miniprogram/lib/account-policy');
const stories=require('../miniprogram/lib/stories');
function fixture(name) {
  const calls=[],listeners=new Set(); let page, finish;
  const state={status:'guest',user:null,configured:true};
  const controls={hasChild:false,child:{name:'小豆包',age:4,className:'中班',avatarPath:''},childFail:false,guestExists:false,guestFail:false,guest:{name:'游客宝宝',age:3,className:'小班'},updateFail:false,closeFail:false,cleanupFail:false,records:[],readingFail:false,holdModal:false,modalConfirm:true,importCommitted:0,backupExports:0,backupCommits:0,backupPartial:false};
  const emit=()=>listeners.forEach(listener=>listener({...state,user:state.user?{...state.user}:null}));
  const store={loadProfile:()=>{if(controls.childFail)throw Error('unavailable');return {...controls.child};},hasProfile:()=>{if(controls.childFail)throw Error('unavailable');return controls.hasChild;},prepareDeletion(){calls.push({action:'prepareDeletion'});return async()=>{calls.push({action:'deleteProfile'});if(controls.cleanupFail)throw Error('头像清理失败');controls.hasChild=false;controls.records=[];};}};
  const guestStore={hasProfile(){if(controls.guestFail)throw Error('unavailable');return controls.guestExists;}};
  const auth={
    getSnapshot:()=>({...state}),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    async login(value){calls.push({action:'login',value});await new Promise(resolve=>{finish=resolve;});state.status='authenticated';state.user={id:'usr_'+'a'.repeat(40)};listeners.forEach(listener=>listener({...state}));},
    async logout(){state.status='guest';state.user=null;emit();return{revoked:!controls.logoutUnconfirmed};},
    async updateAccountProfile(name){name=validateNickname(name);if(controls.updateFail)throw Error('保存失败');state.user={...state.user,nickname:name,displayName:name};emit();},
    async completeOnboarding(){state.user={...state.user,onboardingCompleted:true};emit();calls.push({action:'completeOnboarding'});},
    async closeAccount(){calls.push({action:'closeAccount'});if(controls.closeFail)throw Error('注销未完成');state.status='guest';state.user=null;emit();return{closed:true};}
  };
  const wx={navigateTo:value=>calls.push({action:'navigateTo',...value}),navigateBack:value=>calls.push({action:'navigateBack',...value}),reLaunch:value=>calls.push({action:'reLaunch',...value}),showModal(value){calls.push({action:'showModal',...value});controls.modal=value;if(!controls.holdModal)value.success({confirm:controls.modalConfirm});}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../miniprogram/pages',name,name+'.js'),'utf8'),{
    wx,Page:definition=>{page=definition;},getApp:()=>({getProfileStore:()=>store,getReadingStore:()=>({list(){if(controls.readingFail)throw Error('unavailable');return controls.records;}})}),
    require:module=>module.endsWith('account-backup')?{createBackupService(_wx,_app,isCurrent){return{async exportFile(){if(!isCurrent())throw Error('账号已变化');controls.backupExports++;},async chooseFile(){return{summary:{name:'备份宝宝',age:4,className:'中班',readingCount:1,hasPhoto:false,targetName:controls.hasChild?controls.child.name:''},async commit(){if(!isCurrent())throw Error('账号已变化');controls.backupCommits++;return controls.backupPartial?{complete:false,message:'孩子资料已恢复，阅读记录暂未恢复'}:{complete:true};}};}};}}:module.endsWith('guest-import')?{prepareGuestImport(_api,_target,options){if(!controls.guestExists)throw Error('本机还没有保存游客小主角');return{source:controls.guest,target:controls.hasChild?controls.child:null,async commit(){if(!options.isCurrent())throw Error('账号已变化');if(controls.importFail)throw Error('复制失败');controls.importCommitted++;controls.hasChild=true;controls.child={...controls.guest};}};}}:module.endsWith('stories')?stories:module.endsWith('auth-service')?{getAuthService:()=>auth}:{createProfileStore:()=>guestStore,getPendingProfileCleanups:()=>[],cleanupDeletedProfiles:async()=>{}}
  });
  page.data=JSON.parse(JSON.stringify(page.data));page.setData=patch=>Object.assign(page.data,patch);
  page.onLoad();page.onShow();
  return{page,calls,state,listeners,controls,finish:()=>finish()};
}
test('native login requires consent and navigates only after login has completed',async()=>{
  const f=fixture('login');
  await f.page.login();assert.equal(f.calls.length,0);assert.match(f.page.data.error,/同意/);
  f.page.onConsent({detail:{value:['agree']}});
  const pending=f.page.login();assert.equal(f.page.data.busy,true);
  await f.page.login();assert.equal(f.calls.length,1);
  f.finish();await pending;
  assert.equal(f.calls.at(-1).action,'navigateBack');assert.equal(f.page.data.busy,false);
});
test('leaving native login prevents a late response from navigating another page',async()=>{
  const f=fixture('login');f.page.onConsent({detail:{value:['agree']}});
  const pending=f.page.login();f.page.onUnload();assert.equal(f.listeners.size,0);
  f.finish();await pending;assert.equal(f.calls.length,1);
});
test('a login completed while service instructions are open waits until the login page is visible',async()=>{
  const f=fixture('login');f.page.onConsent({detail:{value:['agree']}});
  const pending=f.page.login();f.page.onHide();f.finish();await pending;
  assert.equal(f.calls.length,1,'must not pop the service/privacy page');
  f.page.onShow();assert.equal(f.calls.at(-1).action,'navigateBack');
});
test('native account exposes profile and login routes and clears identity on logout',async()=>{
  const f=fixture('account');
  f.page.login();assert.equal(f.calls.at(-1).url,'/pages/login/login');
  f.page.editProfile();assert.equal(f.calls.at(-1).url,'/pages/profile/profile');
  f.state.status='authenticated';f.state.user={id:'usr_'+'a'.repeat(40)};f.page.refresh();
  assert.equal(f.page.data.accountNumber,'AAAAAAAA');
  await f.page.logout();assert.equal(f.page.data.auth.user,null);assert.match(f.page.data.notice,/已退出登录/);
  f.page.onUnload();assert.equal(f.listeners.size,0);
});
function signIn(f){f.state.status='authenticated';f.state.user={id:'usr_'+'a'.repeat(40),displayName:'家长',nickname:'',onboardingCompleted:false};f.page.refresh();}
test('native parent nickname edits save/cancel without modifying the child; failed saves keep the draft',async()=>{
  const f=fixture('account');signIn(f);f.page.editNickname();f.page.changeNickname({detail:{value:'豆豆妈妈'}});
  f.page.cancelNickname();assert.equal(f.state.user.nickname,'');
  f.page.editNickname();f.page.changeNickname({detail:{value:'豆豆妈妈'}});f.controls.updateFail=true;
  await f.page.saveNickname();assert.equal(f.page.data.editingNickname,true);assert.match(f.page.data.error,/保存失败/);
  f.controls.updateFail=false;await f.page.saveNickname();assert.equal(f.page.data.auth.user.displayName,'豆豆妈妈');
  assert.equal(f.calls.some(x=>x.action==='deleteProfile'),false);
});
test('native onboarding routes to child setup and completes only after local child data exists',async()=>{
  const f=fixture('account');signIn(f);await f.page.finishOnboarding();assert.equal(f.calls.at(-1).url,'/pages/profile/profile');
  f.controls.hasChild=true;f.page.refresh();await f.page.finishOnboarding();
  assert.equal(f.state.user.onboardingCompleted,true);assert.equal(f.calls.at(-1).url,'/pages/home/home');
});
test('native destructive actions require the typed word and the same confirmed identity',async()=>{
  const f=fixture('account');signIn(f);f.page.requestDanger({currentTarget:{dataset:{action:'delete-child'}}});
  await f.page.confirmDanger();assert.equal(f.calls.some(x=>x.action==='deleteProfile'),false);
  f.page.changeDangerInput({detail:{value:'删除'}});f.state.user={...f.state.user,id:'usr_'+'b'.repeat(40)};f.page.refresh();
  await f.page.confirmDanger();assert.equal(f.calls.some(x=>x.action==='deleteProfile'),false);
  f.page.requestDanger({currentTarget:{dataset:{action:'delete-child'}}});f.page.changeDangerInput({detail:{value:'删除'}});
  await f.page.confirmDanger();assert.equal(f.calls.filter(x=>x.action==='deleteProfile').length,1);
});
test('native close failure never deletes child data; successful close can retry a failed local cleanup',async()=>{
  const f=fixture('account');signIn(f);f.controls.hasChild=true;
  f.page.requestDanger({currentTarget:{dataset:{action:'close-account'}}});f.page.changeDangerInput({detail:{value:'注销'}});
  f.controls.closeFail=true;await f.page.confirmDanger();assert.equal(f.calls.some(x=>x.action==='deleteProfile'),false);assert.equal(f.state.user!==null,true);
  f.controls.closeFail=false;f.controls.cleanupFail=true;await f.page.confirmDanger();
  assert.equal(f.state.user,null);assert.equal(f.page.data.cleanupPending,true);assert.match(f.page.data.error,/阅读账号已注销/);
  f.controls.cleanupFail=false;await f.page.retryCleanup();assert.equal(f.page.data.cleanupPending,false);assert.equal(f.controls.hasChild,false);
});

test('account reading records use current child titles, filter removed books, and open only recorded catalog entries',()=>{
  const f=fixture('account');f.controls.records=[{bookId:'intro',pageIndex:2,totalPages:6,completed:false},{bookId:'flower',pageIndex:5,totalPages:6,completed:true,finished:true},{bookId:'removed',pageIndex:0,totalPages:1}];f.page.refresh();
  assert.equal(f.page.data.readingCount,2);assert.equal(f.page.data.completedCount,1);
  assert.equal(f.page.data.readingRecords[0].title,'你好，我是小豆包');assert.match(f.page.data.readingRecords[0].progress,/第 3/);
  f.page.continueReading({currentTarget:{dataset:{book:'removed'}}});assert.equal(f.calls.length,0);
  f.page.continueReading({currentTarget:{dataset:{book:'intro'}}});assert.equal(f.calls.at(-1).url,'/pages/reader/reader?book=intro');
  f.controls.readingFail=true;f.page.refresh();assert.match(f.page.data.readingError,/暂时无法读取/);assert.equal(f.page.data.readingCount,0);
  f.controls.readingFail=false;f.page.refreshReading();assert.equal(f.page.data.readingCount,2);
});

test('account child card distinguishes saved/empty/unavailable data and does not hide it when guest lookup fails',()=>{
  const f=fixture('account');assert.equal(f.page.data.childProfile,null);assert.equal(f.page.data.childError,'');
  f.controls.hasChild=true;f.page.refresh();assert.equal(f.page.data.childProfile.name,'小豆包');
  signIn(f);f.controls.guestFail=true;f.page.refresh();assert.equal(f.page.data.childProfile.name,'小豆包');assert.match(f.page.data.guestError,/暂时无法读取/);
  f.controls.childFail=true;f.page.refresh();assert.equal(f.page.data.childProfile,null);assert.match(f.page.data.childError,/暂时无法读取/);
  f.controls.childFail=false;f.page.refresh();assert.equal(f.page.data.childProfile.name,'小豆包');assert.equal(f.page.data.childError,'');
});

test('guest import explains source/replacement, cancellation does not commit, successful import refreshes child summary',async()=>{
  const f=fixture('account');signIn(f);await f.page.importGuest();assert.match(f.page.data.error,/没有保存/);assert.equal(f.calls.length,0);
  f.controls.guestExists=true;f.controls.hasChild=true;f.controls.modalConfirm=false;await f.page.importGuest();
  assert.match(f.controls.modal.content,/游客宝宝/);assert.match(f.controls.modal.content,/小豆包/);assert.match(f.controls.modal.content,/阅读记录保留/);assert.equal(f.controls.importCommitted,0);
  f.controls.modalConfirm=true;await f.page.importGuest();assert.equal(f.controls.importCommitted,1);assert.equal(f.page.data.childProfile.name,'游客宝宝');assert.equal(f.page.data.busy,false);
});

test('late import confirmations cannot write after account changes or page unload; duplicate taps do not open another modal',async()=>{
  const f=fixture('account');signIn(f);f.controls.guestExists=true;f.controls.holdModal=true;
  const pending=f.page.importGuest();await f.page.importGuest();assert.equal(f.calls.filter(call=>call.action==='showModal').length,1);
  f.state.user={...f.state.user,accountVersion:'b'.repeat(32)};f.page.refresh();f.controls.modal.success({confirm:true});await pending;
  assert.equal(f.controls.importCommitted,0);assert.match(f.page.data.error,/账号已变化/);
  const second=f.page.importGuest();f.page.onUnload();f.controls.modal.success({confirm:true});await second;assert.equal(f.controls.importCommitted,0);
});

test('failed guest copy reports failure and preserves current child summary',async()=>{
  const f=fixture('account');signIn(f);f.controls.guestExists=true;f.controls.hasChild=true;f.controls.importFail=true;f.page.refresh();
  await f.page.importGuest();assert.match(f.page.data.error,/复制失败/);assert.equal(f.page.data.childProfile.name,'小豆包');assert.equal(f.page.data.notice,'');
});

test('avatar display errors preserve the child data and ignore old image callbacks',()=>{
  const f=fixture('account');f.controls.hasChild=true;f.controls.child.avatarPath='/private/current.png';f.page.refresh();
  f.page.childAvatarFailed({currentTarget:{dataset:{path:'/private/old.png'}}});assert.equal(f.page.data.childAvatarError,false);
  f.page.childAvatarFailed({currentTarget:{dataset:{path:'/private/current.png'}}});assert.equal(f.page.data.childAvatarError,true);assert.equal(f.page.data.childProfile.name,'小豆包');
  f.controls.child.avatarPath='/private/replacement.png';f.page.refresh();assert.equal(f.page.data.childAvatarError,false);
});

test('native backup requires explicit export/restore actions and reports a partial reading restore before retry',async()=>{
  const f=fixture('account');f.page.openBackup({currentTarget:{dataset:{action:'export'}}});assert.equal(f.controls.backupExports,0);
  f.page.cancelBackup();await f.page.exportBackup();assert.equal(f.controls.backupExports,0);
  f.page.openBackup({currentTarget:{dataset:{action:'export'}}});await f.page.exportBackup();assert.equal(f.controls.backupExports,1);assert.match(f.page.data.notice,/备份文件导出/);
  f.page.openBackup({currentTarget:{dataset:{action:'restore'}}});await f.page.chooseBackup();assert.equal(f.page.data.backupSummary.name,'备份宝宝');
  await f.page.restoreBackup();assert.equal(f.controls.backupCommits,0);assert.match(f.page.data.error,/请输入/);
  f.page.changeBackupWord({detail:{value:'恢复'}});f.controls.backupPartial=true;await f.page.restoreBackup();assert.equal(f.page.data.backupPartial,true);assert.equal(f.page.data.backupMode,'restore');
  f.controls.backupPartial=false;await f.page.restoreBackup();assert.equal(f.page.data.backupMode,'');assert.match(f.page.data.notice,/孩子资料和阅读记录已恢复/);
});

test('changing accounts clears a prepared native restore confirmation',async()=>{
  const f=fixture('account');signIn(f);f.page.openBackup({currentTarget:{dataset:{action:'restore'}}});await f.page.chooseBackup();
  f.state.user={...f.state.user,accountVersion:'d'.repeat(32)};f.page.refresh();assert.equal(f.page.data.backupSummary,null);assert.equal(f.page.data.backupMode,'');
  f.page.changeBackupWord({detail:{value:'恢复'}});await f.page.restoreBackup();assert.equal(f.controls.backupCommits,0);
});

test('offline logout clears local identity and describes unconfirmed revocation without inventing a network result',async()=>{
  const f=fixture('account');f.state.status='offline';f.controls.logoutUnconfirmed=true;f.page.refresh();await f.page.logout();
  assert.equal(f.page.data.auth.status,'guest');assert.match(f.page.data.notice,/暂未确认云端会话撤销/);assert.equal(f.page.data.notice.includes('网络未连接'),false);
});
