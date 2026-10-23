'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCharacterSession}=require('../miniprogram/lib/character-session');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({loadBody,books,poses}={}){
  const calls={prepare:0,loads:[],compose:[],release:[]};
  poses=poses||Array.from({length:8},(_,i)=>({id:'p'+(i+1),bodyUrl:'body-'+(i+1)+'.webp'}));
  books=books||Array.from({length:8},(_,i)=>({id:'b'+(i+1),poses:['p'+(i+1)]}));
  const session=createCharacterSession({poses,books,portrait:{},composer:{prepare(p){calls.prepare++;return p;},compose(o){calls.compose.push(o.poseId);return {id:o.poseId};},release(o){calls.release.push(o.poseId);}},loadBody:async(p,o)=>{calls.loads.push(p.id);return loadBody?loadBody(p,o):{id:p.id};}});
  return {session,calls};
}
test('initial preparation is deferred, limited to books 1–3, and does not restart',async()=>{
  const {session,calls}=harness();session.start();session.start();assert.deepEqual(calls.loads,[],'avatar save is not held by synchronous background work');
  await session.whenIdle();assert.deepEqual(calls.loads,['p1','p2','p3']);assert.deepEqual(session.snapshot().books,['b1','b2','b3']);assert.equal(calls.prepare,1);session.close();
});
test('reading book 2 prepares book 4 only, and shared actions are never recomposed',async()=>{
  const {session,calls}=harness();session.start();await session.whenIdle();await session.open('b2');await session.whenIdle();
  assert.deepEqual(calls.loads,['p1','p2','p3','p4']);assert.deepEqual(calls.compose,['p1','p2','p3','p4']);assert.deepEqual(calls.release,['p1']);assert.equal(calls.prepare,1);assert.deepEqual(session.snapshot().books,['b2','b3','b4']);session.close();
});
test('a pose reused by multiple books has one body load and one composite',async()=>{
  const poses=[{id:'shared',bodyUrl:'same.webp'},{id:'next',bodyUrl:'same.webp'}],books=[{id:'b1',poses:['shared']},{id:'b2',poses:['shared']},{id:'b3',poses:['shared']},{id:'b4',poses:['shared','next']}];
  const {session,calls}=harness({poses,books});session.start();await session.whenIdle();assert.deepEqual(calls.compose,['shared']);await session.open('b2');await session.whenIdle();assert.deepEqual(calls.compose,['shared','next']);assert.equal(calls.loads.length,1);assert.deepEqual(calls.release,[]);session.close();
});
test('foreground book preempts a stalled background loader and stale work is discarded',async()=>{
  let finish;const {session,calls}=harness({loadBody:p=>p.id==='p1'?new Promise(resolve=>{finish=resolve;}):{id:p.id}});
  session.start();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(session.snapshot().loading,'p1');
  const actors=await session.open('b2');assert.equal(actors[0].id,'p2');await session.whenIdle();finish({id:'late-p1'});await tick();
  assert.equal(calls.compose.includes('p1'),false);assert.deepEqual(session.snapshot().books,['b2','b3','b4']);assert.equal(session.snapshot().poses.length,3);session.close();
});
test('background failure does not poison reading and retries only on a new explicit open',async()=>{
  let fail=true;const {session,calls}=harness({loadBody:p=>{if(p.id==='p2'&&fail)throw Error('offline');return {id:p.id};}});
  session.start();await session.whenIdle();assert.equal(session.snapshot().poses.find(e=>e.id==='p2').status,'error');assert.equal(calls.loads.filter(id=>id==='p2').length,1);
  fail=false;await session.open('b2');await session.whenIdle();assert.equal(calls.loads.filter(id=>id==='p2').length,2);assert.equal(session.snapshot().poses.find(e=>e.id==='p2').status,'ready');session.close();
});
test('a pause stops background jobs while demand reading stays available',async()=>{
  const {session,calls}=harness();session.pause();session.start();await tick();assert.deepEqual(calls.loads,[]);
  await session.open('b2');assert.deepEqual(calls.loads,['p2']);session.resume();await session.whenIdle();assert.deepEqual(calls.loads,['p2','p3','p4']);session.close();
});
test('jumping books and replacing a portrait cannot complete obsolete queued work',async()=>{
  const {session,calls}=harness();session.start();const actors=await session.open('b7');assert.equal(actors[0].id,'p7');await session.whenIdle();assert.deepEqual(calls.loads,['p7','p8']);assert.deepEqual(session.snapshot().books,['b7','b8']);
  session.close();await session.whenIdle();assert.deepEqual(calls.release,['p7','p8']);await assert.rejects(session.open('b1'),{name:'AbortError'});assert.throws(()=>session.start(),/closed/);
});

test('window eviction releases the real composer cache while shared retained actors stay reusable',async()=>{
  const {createComposer}=require('../miniprogram/lib/character-rig'),base=require('../content/child-pose-library.json').poses['stand-wave'];
  const poses=Array.from({length:5},(_,i)=>({...base,id:'pose-'+i,headRotation:i*.03})),books=poses.map((p,i)=>({id:'book-'+i,poses:[p.id]}));
  let canvases=0;const composer=createComposer(()=>{canvases++;return {width:0,height:0,getContext:()=>({translate(){},drawImage(){},save(){},restore(){},rotate(){}})};},poses);
  const body={width:1024,height:1536},portrait={image:{width:540,height:570},kind:'cutout',metrics:{bounds:{left:35,top:8,right:505,bottom:560},faceBounds:{left:125,top:180,right:415,bottom:490},chin:{x:270,y:489}}};
  const session=createCharacterSession({composer,portrait,poses,books,loadBody:async()=>body});session.start();await session.whenIdle();assert.equal(canvases,3);
  const [retained]=await session.open('book-1');await session.whenIdle();assert.equal(canvases,4);
  const [same]=await session.open('book-1');assert.equal(same,retained);assert.equal(canvases,4);
  await session.open('book-0');await session.whenIdle();assert.equal(canvases,5,'only the evicted pose is rebuilt when revisiting');session.close();
});

test('closing an old portrait session discards a late body result without composing it',async()=>{
  let finish;const old=harness({loadBody:()=>new Promise(resolve=>{finish=resolve;})});old.session.start();await new Promise(resolve=>setTimeout(resolve,5));
  old.session.close();await old.session.whenIdle();const next=harness();next.session.start();await next.session.whenIdle();
  finish({id:'old-body'});await tick();assert.deepEqual(old.calls.compose,[]);assert.deepEqual(next.calls.compose,['p1','p2','p3']);next.session.close();
});
