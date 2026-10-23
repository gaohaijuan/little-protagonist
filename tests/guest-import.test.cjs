'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProfileStore,STORAGE_KEY}=require('../miniprogram/services/profile-store');
const {prepareGuestImport}=require('../miniprogram/services/guest-import');
const {createReadingStore}=require('../miniprogram/services/reading-store');
const source={name:'游客宝宝',age:3,className:'小班'},target={name:'账号宝宝',age:5,className:'大班'};
function fixture(){
  const storage=new Map(),files=new Set(['/outside/source.png','/outside/target.png']);
  const controls={active:true,readFail:'',writeFail:false,copyFail:false,holdCopy:false};
  const api={env:{USER_DATA_PATH:'/private'},getStorageSync(key){if(key===controls.readFail)throw Error('storage unavailable');return storage.get(key);},
    setStorageSync(key,value){if(controls.writeFail)throw Error('quota');storage.set(key,structuredClone(value));},removeStorageSync:key=>storage.delete(key),
    getFileSystemManager:()=>({accessSync(path){if(!files.has(path))throw Error('ENOENT');},
      copyFile({srcPath,destPath,success,fail}){
        if(!files.has(srcPath))return fail(Error('ENOENT'));files.add(destPath);
        if(controls.copyFail)return fail(Error('copy failed'));
        if(controls.holdCopy){controls.releaseCopy=success;controls.copyStarted();}else success();
      },unlink({filePath,success}){files.delete(filePath);success();}})};
  const options={ownerId:'usr_'+'a'.repeat(40),accountVersion:'b'.repeat(32),isCurrent:()=>controls.active};
  const guest=createProfileStore(api),parent=createProfileStore(api,options);
  const prepare=()=>prepareGuestImport(api,parent,{isCurrent:()=>controls.active});
  return{api,storage,files,controls,options,guest,parent,prepare};
}
test('import requires an actually saved guest; missing or unreadable storage cannot replace the current child with defaults',async()=>{
  const f=fixture();await f.parent.saveProfile(target);assert.throws(f.prepare,/没有保存游客/);
  await f.guest.saveProfile(source);f.controls.readFail=STORAGE_KEY;assert.throws(f.prepare,/unavailable/);
  assert.equal(f.parent.loadProfile().name,target.name);
});
test('confirmed import independently copies the avatar, preserves guest data and both reading spaces, and cannot repeat',async()=>{
  const f=fixture();await f.guest.saveProfile(source,{avatarTempPath:'/outside/source.png'});await f.parent.saveProfile(target,{avatarTempPath:'/outside/target.png'});
  const sourcePhoto=f.guest.loadProfile().avatarPath,oldPhoto=f.parent.loadProfile().avatarPath;
  createReadingStore(f.api).record('intro',1,6);createReadingStore(f.api,f.options).record('flower',2,6);
  const transfer=f.prepare();assert.equal(transfer.source.name,source.name);assert.equal(transfer.target.name,target.name);
  await transfer.commit();const copied=f.parent.loadProfile();assert.equal(copied.name,source.name);assert.notEqual(copied.avatarPath,sourcePhoto);
  assert.equal(f.files.has(copied.avatarPath),true);assert.equal(f.files.has(oldPhoto),false);assert.equal(f.guest.loadProfile().avatarPath,sourcePhoto);
  assert.equal(createReadingStore(f.api).get('intro').pageIndex,1);assert.equal(createReadingStore(f.api,f.options).get('flower').pageIndex,2);
  await assert.rejects(transfer.commit(),/已提交/);await f.guest.deleteProfile();assert.equal(f.files.has(copied.avatarPath),true);
});
test('import without a saved source photo explicitly replaces the target photo with the default appearance',async()=>{
  const f=fixture();await f.guest.saveProfile(source);await f.parent.saveProfile(target,{avatarTempPath:'/outside/target.png'});
  const oldPhoto=f.parent.loadProfile().avatarPath;await f.prepare().commit();assert.equal(f.parent.loadProfile().avatarPath,'');assert.equal(f.files.has(oldPhoto),false);
});
test('source changes, destination edits queued after confirmation, and newly created profiles require new confirmation',async()=>{
  const f=fixture();await f.guest.saveProfile(source);await f.parent.saveProfile(target);
  let transfer=f.prepare();await f.guest.saveProfile({...source,name:'游客改过了'});await assert.rejects(transfer.commit(),/游客小主角已变化/);
  transfer=f.prepare();const edit=f.parent.saveProfile({...target,name:'账号刚改过'}),commit=transfer.commit();await edit;await assert.rejects(commit,/重新确认/);assert.equal(f.parent.loadProfile().name,'账号刚改过');
  const fresh=fixture();await fresh.guest.saveProfile(source);transfer=fresh.prepare();await fresh.parent.saveProfile({name:'小石头',age:5,className:'大班'});
  await assert.rejects(transfer.commit(),/重新确认/);assert.equal(fresh.parent.loadProfile().name,'小石头');
});

test('a queued guest edit cannot be copied from an older confirmation',async()=>{
  const f=fixture();await f.guest.saveProfile(source);await f.parent.saveProfile(target);const transfer=f.prepare();
  const edit=f.guest.saveProfile({...source,name:'队列里的新名字'}),commit=transfer.commit();await edit;
  await assert.rejects(commit,/确认已变化/);assert.equal(f.parent.loadProfile().name,target.name);
});
test('copy or write failures preserve both profiles and photos and permit an explicit retry',async()=>{
  const f=fixture();await f.guest.saveProfile(source,{avatarTempPath:'/outside/source.png'});await f.parent.saveProfile(target,{avatarTempPath:'/outside/target.png'});
  const previous=f.parent.loadProfile(),files=[...f.files].sort(),transfer=f.prepare();f.controls.copyFail=true;
  await assert.rejects(transfer.commit(),/copy failed/);assert.deepEqual(f.parent.loadProfile(),previous);assert.deepEqual([...f.files].sort(),files);
  f.controls.copyFail=false;f.controls.writeFail=true;await assert.rejects(transfer.commit(),/quota/);assert.deepEqual(f.parent.loadProfile(),previous);assert.deepEqual([...f.files].sort(),files);
  f.controls.writeFail=false;await transfer.commit();assert.equal(f.parent.loadProfile().name,source.name);
});
test('account changes during a photo copy roll back the new file and duplicate in-flight commits are rejected',async()=>{
  const f=fixture();await f.guest.saveProfile(source,{avatarTempPath:'/outside/source.png'});await f.parent.saveProfile(target);
  const previous=f.parent.loadProfile(),files=[...f.files].sort(),transfer=f.prepare();
  f.controls.holdCopy=true;const started=new Promise(resolve=>{f.controls.copyStarted=resolve;});
  const pending=transfer.commit();await assert.rejects(transfer.commit(),/已提交/);await started;f.controls.active=false;f.controls.releaseCopy();
  await assert.rejects(pending,/账号已切换/);assert.deepEqual(f.parent.loadProfile(),previous);assert.deepEqual([...f.files].sort(),files);
});

test('leaving the confirmation page during a photo copy cancels the write even while the same account remains active',async()=>{
  const f=fixture();await f.guest.saveProfile(source,{avatarTempPath:'/outside/source.png'});await f.parent.saveProfile(target);
  let visible=true;const transfer=prepareGuestImport(f.api,f.parent,{isCurrent:()=>visible}),files=[...f.files].sort();
  f.controls.holdCopy=true;const started=new Promise(resolve=>{f.controls.copyStarted=resolve;});const pending=transfer.commit();await started;
  visible=false;f.controls.releaseCopy();await assert.rejects(pending,/确认已变化/);
  assert.equal(f.parent.loadProfile().name,target.name);assert.deepEqual([...f.files].sort(),files);
});
