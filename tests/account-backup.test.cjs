'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const codec=require('../miniprogram/lib/account-backup'),{defaultMembers}=require('../miniprogram/lib/family');
const {createProfileStore}=require('../miniprogram/services/profile-store'),{createReadingStore}=require('../miniprogram/services/reading-store');
const {createBackupService}=require('../miniprogram/services/account-backup');
const profile={name:'小豆包',age:4,className:'中班'},png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3xoAAAAASUVORK5CYII=';
const metrics={resolution:1200,bounds:{left:1,top:2,right:70,bottom:100},faceBounds:{left:10,top:15,right:60,bottom:70},chin:{x:35,y:80}};
const record={version:4,profile,members:defaultMembers(),avatars:{child:{data:png,kind:'cutout',metrics,layout:{scale:1,x:0,y:0}}}};
const browserReading=[{bookId:'intro',page:2,cover:false,completed:false,finished:false,updatedAt:1}],nativeReading=[{bookId:'intro',pageIndex:2,totalPages:6,completed:false,finished:false,updatedAt:1}];
const sourceResolution={version:1,provenance:'original-photo-roi',sourceWidth:4096,sourceHeight:3072,
  originalFacePixels:{width:501.25,height:701.5},retainedFacePixels:{width:500.75,height:701.25},outputFacePixels:{width:490.125,height:690.375},nativeFacePixels:{width:490.125,height:690.375},
  originalHeadPixels:{width:900.75,height:1200.125},retainedHeadPixels:{width:899.5,height:1199.875},outputHeadPixels:{width:880.125,height:1180.5},nativeHeadPixels:{width:880.125,height:1180.5},
  textureSamplingScale:0.875,detectionMaxEdge:1600,maskWidth:512,maskHeight:480,outputScale:0.91375};
test('browser backup preserves original photo bytes, landmark metrics, family and progress without exporting identity or local paths',()=>{
  const text=codec.createBrowserBackup({...record,profile:{...profile,avatarPath:'/private/photo.png'},token:'secret',userId:'usr_private'},browserReading),restored=codec.parseBrowserBackup(text);
  assert.equal(restored.child.avatars.child.data,png);assert.deepEqual(restored.child.avatars.child.metrics,metrics);assert.equal(restored.child.members.length,9);
  assert.deepEqual(restored.reading,browserReading);assert.equal(restored.child.profile.avatarPath,'');assert.equal(text.includes('/private'),false);assert.equal(text.includes('secret'),false);assert.equal(text.includes('usr_private'),false);
  assert.equal(codec.parseBrowserBackup(codec.createBrowserBackup({version:1,profile,avatarData:png},[])).child.avatars.child.data,png);
});
test('backup rejects malformed/oversize JSON, incompatible platforms, network images, invalid family and reading pages',()=>{
  const good=JSON.parse(codec.createBrowserBackup(record,browserReading));
  assert.throws(()=>codec.parseBrowserBackup('{broken'),/无法读取/);
  assert.throws(()=>codec.parseBrowserBackup(' '.repeat(codec.MAX_BACKUP_BYTES+1)),/32MB/);
  assert.throws(()=>codec.parseNativeBackup(JSON.stringify(good)),/格式不同/);
  for(const change of [b=>b.version=99,b=>b.child.profile.name='',b=>b.child.avatars.child.data='https://example.test/photo.png',b=>b.child.members.push({...b.child.members[0]}),b=>b.reading[0].page=-1,b=>b.child.avatars.child.metrics.bounds.right=-1]){
    const invalid=structuredClone(good);change(invalid);assert.throws(()=>codec.parseBrowserBackup(JSON.stringify(invalid)));
  }
  const malicious=structuredClone(good);malicious.child.avatars.__proto__={data:png};
  assert.equal(Object.hasOwn(codec.parseBrowserBackup(JSON.stringify(malicious)).child.avatars,'__proto__'),false);
  const literal=JSON.stringify(good).replace('"avatars":{','"avatars":{"__proto__":{"data":"'+png+'"},');assert.throws(()=>codec.parseBrowserBackup(literal),/归属/);
});

test('structured resolution metadata preserves every current source-pixel field exactly while retaining legacy numbers',()=>{
  const current=structuredClone(record);current.avatars.child.metrics.resolution=sourceResolution;
  const restored=codec.parseBrowserBackup(codec.createBrowserBackup(current,browserReading));
  assert.deepEqual(restored.child.avatars.child.metrics.resolution,sourceResolution);assert.equal(restored.child.avatars.child.data,png);
  assert.equal(codec.parseBrowserBackup(codec.createBrowserBackup(record,[])).child.avatars.child.metrics.resolution,1200);
  delete current.avatars.child.metrics.resolution;assert.equal(Object.hasOwn(codec.parseBrowserBackup(codec.createBrowserBackup(current,[])).child.avatars.child.metrics,'resolution'),false);
});

test('structured resolution rejects missing, non-finite, unsupported or inflated pixel evidence and strips unknown properties',()=>{
  const make=()=>{const value=structuredClone(record);value.avatars.child.metrics.resolution=structuredClone(sourceResolution);return value;};
  for(const change of [r=>delete r.retainedFacePixels,r=>r.version=2,r=>r.provenance='interpolated',r=>r.sourceWidth=Infinity,r=>r.outputScale=0,r=>r.nativeHeadPixels.height=5000,r=>r.maskWidth='512',r=>r.originalFacePixels.width=-1]){
    const value=make();change(value.avatars.child.metrics.resolution);assert.throws(()=>codec.createBrowserBackup(value,[]));
  }
  const value=make();value.avatars.child.metrics.resolution.secret='not exported';value.avatars.child.metrics.resolution.nativeFacePixels.unknown=true;
  const result=codec.parseBrowserBackup(codec.createBrowserBackup(value,[]));assert.deepEqual(result.child.avatars.child.metrics.resolution,sourceResolution);
});
test('native backup round-trip keeps photo/progress and rejects arbitrary stored file paths',()=>{
  const saved=codec.parseNativeBackup(codec.createNativeBackup({...profile,avatarPath:'/secret'},png,nativeReading));
  assert.equal(saved.child.avatarData,png);assert.equal(saved.child.profile.avatarPath,'');assert.deepEqual(saved.reading,nativeReading);
});
function fixture(){
  const storage=new Map(),files=new Map([['/outside/source.png',png.split(',')[1]]]);
  const controls={active:true,failKey:'',copyFail:false,imageFail:false,shareCancel:false,shares:[],pick:null};
  const wx={env:{USER_DATA_PATH:'/private'},getStorageSync:key=>storage.get(key),setStorageSync(key,value){if(key.startsWith(controls.failKey)&&controls.failKey)throw Error('quota');storage.set(key,structuredClone(value));},removeStorageSync:key=>storage.delete(key)};
  const fs={accessSync(path){if(!files.has(path))throw Error('ENOENT');},
    copyFile({srcPath,destPath,success,fail}){if(controls.copyFail||!files.has(srcPath))return fail(Error('copy failed'));files.set(destPath,files.get(srcPath));success();},
    unlink({filePath,success}){files.delete(filePath);success();},
    readFile({filePath,success,fail}){if(!files.has(filePath))return fail(Error('ENOENT'));success({data:files.get(filePath)});},
    writeFile({filePath,data,success}){files.set(filePath,data);success();}};
  wx.getFileSystemManager=()=>fs;wx.getImageInfo=({success,fail})=>controls.imageFail?fail(Error('bad image')):success({width:1,height:1});
  wx.shareFileMessage=({filePath,success,fail})=>{controls.shares.push(files.get(filePath));controls.shareCancel?fail({errMsg:'shareFileMessage:fail cancel'}):success({});};
  wx.chooseMessageFile=({success})=>success({tempFiles:[controls.pick]});
  const scope={ownerId:'usr_'+'a'.repeat(40),accountVersion:'b'.repeat(32),isCurrent:()=>controls.active};
  const app={getProfileStore:()=>createProfileStore(wx,scope),getReadingStore:()=>createReadingStore(wx,scope)};
  return{wx,app,controls,storage,files,scope,service:createBackupService(wx,app,()=>controls.active)};
}
test('native export includes only current data and removes its temporary file after an explicit save/cancel',async()=>{
  const f=fixture();await assert.rejects(f.service.exportFile(),/先保存/);
  await f.app.getProfileStore().saveProfile(profile,{avatarTempPath:'/outside/source.png'});f.app.getReadingStore().record('intro',2,6);
  await f.service.exportFile();const saved=codec.parseNativeBackup(f.controls.shares[0]);assert.equal(saved.child.avatarData,png);assert.equal(saved.reading[0].pageIndex,2);
  assert.equal([...f.files.keys()].some(path=>path.includes('account-backup')),false);
  f.controls.shareCancel=true;await assert.rejects(f.service.exportFile());assert.equal([...f.files.keys()].some(path=>path.includes('account-backup')),false);assert.equal(f.app.getProfileStore().loadProfile().name,profile.name);
});
test('native restore independently saves photo/progress and preserves guest/other spaces, without importing login state',async()=>{
  const f=fixture(),guest=createProfileStore(f.wx);await guest.saveProfile({...profile,name:'游客孩子'});
  await f.app.getProfileStore().saveProfile({...profile,name:'旧账号孩子'});f.app.getReadingStore().record('flower',0,6);
  const plan=f.service.prepareRestore(codec.parseNativeBackup(codec.createNativeBackup(profile,png,nativeReading)));
  assert.equal(plan.summary.targetName,'旧账号孩子');assert.deepEqual(await plan.commit(),{complete:true});
  const restored=f.app.getProfileStore().loadProfile();assert.equal(restored.name,profile.name);assert.equal(f.files.get(restored.avatarPath),png.split(',')[1]);
  assert.equal(f.app.getReadingStore().get('intro').pageIndex,2);assert.equal(f.app.getReadingStore().get('flower'),null);assert.equal(guest.loadProfile().name,'游客孩子');
  assert.equal([...f.files.keys()].some(path=>path.includes('account-backup')),false);await assert.rejects(plan.commit(),/已提交/);
});
test('native bad images, stale confirmation and copy failures preserve current profile and progress',async()=>{
  const f=fixture();await f.app.getProfileStore().saveProfile({...profile,name:'原来的孩子'});f.app.getReadingStore().record('flower',1,6);
  const backup=codec.parseNativeBackup(codec.createNativeBackup(profile,png,nativeReading));
  f.controls.imageFail=true;await assert.rejects(f.service.prepareRestore(backup).commit(),/bad image/);f.controls.imageFail=false;
  let plan=f.service.prepareRestore(backup);await f.app.getProfileStore().saveProfile({...profile,name:'刚改过的孩子'});await assert.rejects(plan.commit(),/重新确认/);
  f.controls.copyFail=true;await assert.rejects(f.service.prepareRestore(backup).commit(),/copy failed/);f.controls.copyFail=false;
  assert.equal(f.app.getProfileStore().loadProfile().name,'刚改过的孩子');assert.equal(f.app.getReadingStore().get('flower').pageIndex,1);
  plan=f.service.prepareRestore(backup);f.app.getReadingStore().record('flower',3,6);await assert.rejects(plan.commit(),/确认已变化/);
  assert.equal([...f.files.keys()].some(path=>path.includes('account-backup')),false);
});
test('native partial reading restore is reported accurately and can retry without rewriting the child',async()=>{
  const f=fixture();await f.app.getProfileStore().saveProfile({...profile,name:'原孩子'});f.app.getReadingStore().record('flower',1,6);
  const plan=f.service.prepareRestore(codec.parseNativeBackup(codec.createNativeBackup(profile,png,nativeReading)));f.controls.failKey='little-story.reading.v1';
  const partial=await plan.commit();assert.equal(partial.complete,false);assert.match(partial.message,/孩子资料已恢复/);const path=f.app.getProfileStore().loadProfile().avatarPath;
  assert.equal(f.app.getReadingStore().get('flower').pageIndex,1);f.controls.failKey='';assert.deepEqual(await plan.commit(),{complete:true});
  assert.equal(f.app.getProfileStore().loadProfile().avatarPath,path);assert.equal(f.app.getReadingStore().get('intro').pageIndex,2);
});
test('native chooser validates selected size/platform and cannot continue after account changes',async()=>{
  const f=fixture();f.controls.pick={path:'/chosen.json',size:codec.MAX_BACKUP_BYTES+1};await assert.rejects(f.service.chooseFile(),/32MB/);
  const text=codec.createNativeBackup(profile,'',nativeReading);f.files.set('/chosen.json',text);f.controls.pick={path:'/chosen.json',size:Buffer.byteLength(text)};
  const plan=await f.service.chooseFile();assert.equal(plan.summary.name,profile.name);f.controls.active=false;await assert.rejects(plan.commit(),/账号或页面/);
});
