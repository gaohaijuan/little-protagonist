'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createReadingStore,normalizeReadingRecords,readingStorageKey}=require('../miniprogram/services/reading-store');
function fixture(){const storage=new Map();return {storage,api:{getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,structuredClone(value))}};}
test('reading positions and completion survive restart; rereading preserves completion and resets the active position',()=>{
  const f=fixture(),store=createReadingStore(f.api);store.record('intro',2,6);
  assert.equal(createReadingStore(f.api).get('intro').pageIndex,2);
  store.record('intro',5,6,true);assert.equal(store.get('intro').finished,true);
  store.record('intro',0,6);assert.equal(store.get('intro').completed,true);assert.equal(store.get('intro').finished,false);
  store.record('flower',1,6);assert.equal(store.list().length,2);
});
test('guest, two parents, and re-registered account versions have independent reading records',()=>{
  const f=fixture(),id='usr_'+'a'.repeat(40),other='usr_'+'b'.repeat(40);
  const scopes=[{}, {ownerId:id}, {ownerId:other}, {ownerId:id,accountVersion:'c'.repeat(32)}];
  scopes.forEach((scope,i)=>createReadingStore(f.api,scope).record('intro',i,6));
  scopes.forEach((scope,i)=>assert.equal(createReadingStore(f.api,scope).get('intro').pageIndex,i));
  assert.throws(()=>readingStorageKey({ownerId:'evil'}),/标识/);
});
test('invalid persisted rows and page input are rejected, stale stores cannot write, storage errors are surfaced',()=>{
  const f=fixture(),store=createReadingStore(f.api,{isCurrent:()=>false});assert.throws(()=>store.record('intro',0,6),/已变化/);
  const active=createReadingStore(f.api);assert.throws(()=>active.record('intro',6,6),/页码/);
  assert.throws(()=>active.record('../intro',0,6),/页码/);
  assert.deepEqual(Object.keys(normalizeReadingRecords({version:1,records:[{bookId:'intro',pageIndex:-1,totalPages:6,updatedAt:1},{bookId:'flower',pageIndex:0,totalPages:6,updatedAt:1}]})),['flower']);
  f.api.setStorageSync=()=>{throw Error('quota');};assert.throws(()=>active.record('intro',0,6),/quota/);
  assert.equal(active.get('intro'),null);
});
