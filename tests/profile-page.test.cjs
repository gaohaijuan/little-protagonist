const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const file = path.resolve(__dirname, '../miniprogram/pages/profile/profile.js');
const localRequire = createRequire(file);
const initial = {name:'小石头', age:5, className:'大班', avatarPath:'/saved/original.png'};
function setup({withAccount=false}={}) {
  let definition;
  const calls = [], saved = {...initial};
  const controls = {saveFailure:false, mediaFailure:null, delayedSave:null};
  const authState={status:'authenticated',user:{id:'usr_'+'a'.repeat(40),accountVersion:'a'.repeat(32)}};
  const listeners=new Set();
  const store = {loadProfile:()=>({...saved}), async saveProfile(draft, options) {
    calls.push({type:'save',draft:{...draft},options:{...options}});
    if (controls.delayedSave) await controls.delayedSave;
    if (controls.saveFailure) throw new Error('存储空间不足');
    Object.assign(saved,draft,{avatarPath: options.removeAvatar ? '' : options.avatarTempPath ? '/saved/new.png' : saved.avatarPath});
    return {...saved};
  }};
  const context = {clearRect(){},drawImage(...args){calls.push({type:'draw', args});}};
  const canvas = {width:0,height:0,getContext:()=>context,createImage(){
    const image={width:900,height:1200};
    Object.defineProperty(image,'src',{set(){queueMicrotask(()=>image.onload());}});
    return image;
  }};
  const wx = {chooseMedia(options){
    if(controls.delayMedia){controls.finishMedia=()=>options.success({tempFiles:[{tempFilePath:'/temp/photo.jpg',size:2000}]});return;}
    if(controls.mediaFailure) options.fail(controls.mediaFailure);
    else options.success({tempFiles:[{tempFilePath:'/temp/photo.jpg',size:2000}]});
  }, getWindowInfo:()=>({pixelRatio:2}), canvasToTempFilePath(options){
    calls.push({type:'export',width:options.destWidth,height:options.destHeight}); options.success({tempFilePath:'/temp/cropped.png'});
  },showToast(options){calls.push({type:'toast',title:options.title});},navigateBack(){calls.push({type:'back'});},reLaunch(){}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:d=>{definition=d;},wx,
    ...(withAccount?{getApp:()=>({getProfileStore:()=>store,auth:{getSnapshot:()=>authState,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}}})}:{}),
    require:id=>id.endsWith('/profile-store')?{createProfileStore:()=>store}:localRequire(id)});
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(patch,cb){Object.assign(this.data,patch);if(cb)cb();},
    createSelectorQuery(){return {select(){return this;},fields(){return this;},exec(cb){cb([{node:canvas,width:240,height:240*57/54}]);}};}};
  page.onLoad();
  return {page,calls,saved,controls,canvas,authState,listeners};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
test('native account/version change cancels an outstanding photo picker and closes the old editor',async()=>{
  const f=setup({withAccount:true});f.page.onShow();f.controls.delayMedia=true;
  const pending=f.page.choosePhoto();await tick();
  f.authState.user={...f.authState.user,accountVersion:'b'.repeat(32)};f.listeners.forEach(fn=>fn(f.authState));
  f.controls.finishMedia();await pending;
  assert.equal(f.page.data.editingPhoto,false);assert.equal(f.page._alive,false);
  assert.equal(f.calls.filter(c=>c.type==='back').length,1);assert.equal(f.calls.some(c=>c.type==='save'),false);
});
test('changing only the parent nickname does not discard an unsaved child draft',()=>{
  const f=setup({withAccount:true});f.page.onShow();f.page.onName({detail:{value:'孩子的新名字'}});
  f.authState.user={...f.authState.user,nickname:'新的家长称呼'};f.listeners.forEach(fn=>fn(f.authState));
  assert.equal(f.page._alive,true);assert.equal(f.page.data.name,'孩子的新名字');assert.equal(f.calls.length,0);
  f.page.onHide();assert.equal(f.listeners.size,0);
});

test('native profile validates before saving and preserves selected age/class',async()=>{
  const {page,calls,saved}=setup();
  page.onName({detail:{value:'   '}});await page.save();
  assert.match(page.data.error,/名字/);assert.equal(calls.length,0);
  page.onName({detail:{value:' 小豆包 '}});page.onAge({detail:{value:'1'}});page.onClass({detail:{value:'1'}});
  await page.save();
  assert.deepEqual(saved,{name:'小豆包',age:4,className:'中班',avatarPath:initial.avatarPath});
  assert.equal(calls.filter(c=>c.type==='back').length,1);
});
test('choosing/cropping is only a draft until saved; crop output preserves head ratio',async()=>{
  const {page,calls,saved}=setup();
  await page.choosePhoto();await tick();
  assert.equal(page.data.photoReady,true);
  page.changeZoom({detail:{value:180}});page.changeX({detail:{value:100}});page.changeY({detail:{value:0}});
  await page.applyCrop();
  assert.equal(page.data.draftAvatarPath,'/temp/cropped.png');
  assert.equal(saved.avatarPath,initial.avatarPath);
  const output=calls.find(c=>c.type==='export');assert.equal(output.width/output.height,54/57);
  await page.save();
  assert.equal(saved.avatarPath,'/saved/new.png');
  assert.equal(calls.find(c=>c.type==='save').options.avatarTempPath,'/temp/cropped.png');
});
test('photo cancellation and leaving an edited profile do not commit data',async()=>{
  const {page,calls,saved,controls}=setup();
  controls.mediaFailure={errMsg:'chooseMedia:fail cancel'};await page.choosePhoto();
  assert.equal(page.data.error,'');assert.equal(page.data.editingPhoto,false);
  controls.mediaFailure=null;await page.choosePhoto();await tick();page.cancelCrop();
  assert.equal(page.data.draftAvatarPath,initial.avatarPath);
  page.removePhoto();page.onName({detail:{value:'未保存'}});page.onUnload();
  assert.deepEqual(saved,initial);assert.equal(calls.filter(c=>c.type==='save').length,0);
});
test('save failure stays editable and never shows success; repeated taps submit once',async()=>{
  const {page,calls,saved,controls}=setup();
  controls.saveFailure=true;page.onName({detail:{value:'小豆包'}});await page.save();
  assert.match(page.data.error,/空间/);assert.equal(page.data.saving,false);assert.deepEqual(saved,initial);
  assert.equal(calls.filter(c=>c.type==='toast'||c.type==='back').length,0);
  controls.saveFailure=false;let release;controls.delayedSave=new Promise(resolve=>{release=resolve;});
  const saving=page.save();await page.save();assert.equal(calls.filter(c=>c.type==='save').length,2);
  release();await saving;assert.equal(saved.name,'小豆包');
});
test('photo callback after unload does not replace the current page',async()=>{
  const {page}=setup();await page.choosePhoto();page.onUnload();await tick();
  assert.equal(page.data.photoReady,false);
});
