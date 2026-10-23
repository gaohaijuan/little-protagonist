'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProfileStore,getPendingProfileCleanups,cleanupDeletedProfiles}=require('../miniprogram/services/profile-store');
const {createReadingStore}=require('../miniprogram/services/reading-store');
function fixture(){
  const storage=new Map(),files=new Set(['/outside/source.png']);
  const controls={remove:false,unlink:false,active:true};
  const api={env:{USER_DATA_PATH:'/private'},getStorageSync:key=>storage.get(key),
    getStorageInfoSync:()=>({keys:[...storage.keys()]}),
    setStorageSync:(key,value)=>storage.set(key,structuredClone(value)),
    removeStorageSync(key){if(controls.remove)throw Error('storage busy');storage.delete(key);},
    getFileSystemManager:()=>({accessSync(path){if(!files.has(path))throw Error('ENOENT');},
      copyFile({destPath,success}){files.add(destPath);success();},
      unlink({filePath,success,fail}){if(controls.unlink)return fail(Error('file busy'));files.delete(filePath);success();}})};
  const ownerId='usr_'+'a'.repeat(40),otherId='usr_'+'b'.repeat(40);
  const options={ownerId,isCurrent:()=>controls.active};
  return{api,storage,files,controls,options,ownerId,otherId,store:createProfileStore(api,options)};
}
const child={name:'小豆包',age:4,className:'中班'};
test('confirmed child deletion removes only its owned record/photo and invalidates already-open editors',async()=>{
  const f=fixture(),guest=createProfileStore(f.api),other=createProfileStore(f.api,{ownerId:f.otherId});
  await guest.saveProfile({...child,name:'游客孩子'});await other.saveProfile({...child,name:'其他孩子'});
  await f.store.saveProfile(child,{avatarTempPath:'/outside/source.png'});const path=f.store.loadProfile().avatarPath;
  const editor=createProfileStore(f.api,f.options);
  const oldReading=createReadingStore(f.api,{...f.options,isCurrent:()=>editor.isCurrent()});oldReading.record('intro',2,6);
  createReadingStore(f.api).record('flower',1,6);
  assert.equal(f.store.hasProfile(),true);await f.store.deleteProfile();
  assert.equal(f.store.hasProfile(),false);assert.equal(f.files.has(path),false);assert.equal(f.files.has('/outside/source.png'),true);
  assert.equal(other.loadProfile().name,'其他孩子');assert.equal(guest.loadProfile().name,'游客孩子');
  await assert.rejects(editor.saveProfile({...child,name:'迟到的旧编辑'}),/账号已切换/);
  assert.equal(createProfileStore(f.api,f.options).hasProfile(),false);
  assert.equal(createReadingStore(f.api,f.options).list().length,0);
  assert.equal(createReadingStore(f.api).list().length,1);
  assert.throws(()=>oldReading.record('intro',3,6),/已变化/);
});
test('deletion journal allows a failed photo cleanup to be retried after the profile is removed',async()=>{
  const f=fixture();await f.store.saveProfile(child,{avatarTempPath:'/outside/source.png'});const path=f.store.loadProfile().avatarPath;
  const remove=f.store.prepareDeletion();f.controls.unlink=true;
  await assert.rejects(remove(),/头像文件清理未完成/);assert.equal(f.store.hasProfile(),false);assert.equal(f.files.has(path),true);
  f.controls.unlink=false;await remove();assert.equal(f.files.has(path),false);
  assert.equal([...f.storage.keys()].some(key=>key.endsWith('pending-delete')),false);
});
test('retrying an old failed photo cleanup does not delete a newly saved child',async()=>{
  const f=fixture();await f.store.saveProfile(child,{avatarTempPath:'/outside/source.png'});
  const oldPhoto=f.store.loadProfile().avatarPath,remove=f.store.prepareDeletion();f.controls.unlink=true;
  await assert.rejects(remove(),/头像文件清理未完成/);
  const fresh=createProfileStore(f.api,f.options);await fresh.saveProfile({...child,name:'新小主角'},{avatarTempPath:'/outside/source.png'});
  const newPhoto=fresh.loadProfile().avatarPath;f.controls.unlink=false;await remove();
  assert.equal(fresh.loadProfile().name,'新小主角');assert.equal(f.files.has(newPhoto),true);assert.equal(f.files.has(oldPhoto),false);
});
test('retrying a failed record removal requires confirmation again when the child was edited',async()=>{
  const f=fixture();await f.store.saveProfile(child);const remove=f.store.prepareDeletion();f.controls.remove=true;
  await assert.rejects(remove());f.controls.remove=false;await f.store.saveProfile({...child,name:'后来改过的名字'});
  await assert.rejects(remove(),/重新确认/);assert.equal(f.store.loadProfile().name,'后来改过的名字');
});
test('storage deletion failure preserves the old profile/photo, and confirmed cleanup can run after sign-out',async()=>{
  const f=fixture();await f.store.saveProfile(child,{avatarTempPath:'/outside/source.png'});const path=f.store.loadProfile().avatarPath;
  const remove=f.store.prepareDeletion();f.controls.remove=true;
  await assert.rejects(remove(),/storage busy/);assert.equal(f.store.hasProfile(),true);assert.equal(f.files.has(path),true);
  f.controls.remove=false;f.controls.active=false;await remove();assert.equal(f.store.hasProfile(),false);assert.equal(f.files.has(path),false);
});
test('re-registration uses a fresh profile namespace; legacy names and photos are not silently imported',async()=>{
  const f=fixture();await f.store.saveProfile(child);
  const next=createProfileStore(f.api,{ownerId:f.ownerId,accountVersion:'c'.repeat(32)});
  assert.equal(next.hasProfile(),false);assert.equal(next.loadProfile().name,'小石头');
  await next.saveProfile({...child,name:'新资料'});await next.deleteProfile();
  assert.equal(f.store.loadProfile().name,'小豆包');
});
test('a new page can find and finish an already-confirmed deletion without touching a live profile',async()=>{
  const f=fixture();await f.store.saveProfile(child,{avatarTempPath:'/outside/source.png'});const path=f.store.loadProfile().avatarPath;
  f.controls.unlink=true;await assert.rejects(f.store.deleteProfile());assert.equal(getPendingProfileCleanups(f.api).length,1);
  f.controls.unlink=false;await cleanupDeletedProfiles(f.api);assert.equal(getPendingProfileCleanups(f.api).length,0);assert.equal(f.files.has(path),false);
  const other=createProfileStore(f.api,{ownerId:f.otherId});await other.saveProfile(child,{avatarTempPath:'/outside/source.png'});const live=other.loadProfile().avatarPath;
  const key=[...f.storage.keys()].find(key=>key.endsWith(f.otherId));f.storage.set(key+':pending-delete',[live]);
  await cleanupDeletedProfiles(f.api);assert.equal(f.files.has(live),true);assert.equal(other.hasProfile(),true);
});
