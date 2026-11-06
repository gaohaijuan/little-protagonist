'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CHILD_MODEL,definePose,createComposer}=require('../miniprogram/lib/character-rig');
const library=require('../content/child-pose-library.json');
const base=library.poses['stand-wave'],body={width:1100,height:1500};
const photo={image:{width:600,height:1400},kind:'cutout',metrics:{bounds:{left:20,top:10,right:580,bottom:1380},faceBounds:{left:160,top:230,right:450,bottom:570},chin:{x:300,y:570}}};
function canvasFactory(records){return ()=>{const calls=[];records.push(calls);return {width:0,height:0,getContext:()=>Object.fromEntries(['translate','rotate','drawImage','save','restore'].map(k=>[k,(...args)=>calls.push([k,...args])]))};};}
test('one normalized real portrait and one complete composite are reused across placements and books',()=>{
  const records=[],composer=createComposer(canvasFactory(records),[base]),p=composer.prepare(photo);
  assert.equal(composer.prepare({...photo,metrics:structuredClone(photo.metrics)}),p);
  const actor=composer.compose({portrait:p,body,poseId:base.id});
  assert.equal(composer.compose({portrait:p,body,poseId:base.id}),actor);assert.equal(records.length,1);
  const calls=[],c={save(){},restore(){},translate(){},rotate(){},drawImage(...a){calls.push(a);}};
  for(const scale of [.2,.5,1,2]){composer.place(c,actor,{x:80,y:120,scale});const draw=calls.at(-1);assert.equal(draw[0],actor.image);assert.ok(Math.abs(draw[3]/actor.image.width-draw[4]/actor.image.height)<1e-12);}
  assert.equal(records.length,1,'scenes never reassemble head and body');
});
test('pose changes retain identical facial size, with a chin fixed to each collar',()=>{
  const poses=[base,{...base,id:'crouch-test',headRotation:-.2},{...base,id:'reach-test',headRotation:.18}];
  const records=[],composer=createComposer(canvasFactory(records),poses),p=composer.prepare(photo);
  for(const [id,headRotation] of [['stand-wave',0],['crouch-test',-.2],['reach-test',.18]]){
    const actor=composer.compose({portrait:p,body,poseId:id}),draw=records.at(-1).filter(c=>c[0]==='drawImage').at(-1);
    assert.equal(actor.headScale,p.geometry.scale);assert.ok(Math.abs(draw[6]+photo.metrics.chin.x*actor.headScale)<1e-9);assert.ok(Math.abs(draw[7]+photo.metrics.chin.y*actor.headScale)<1e-9);
    assert.equal(actor.headScale*(photo.metrics.faceBounds.bottom-photo.metrics.faceBounds.top)*CHILD_MODEL.faceToHead,CHILD_MODEL.headHeight);
  }
});
test('hair length and width do not alter facial proportions; all original head pixels are composed',()=>{
  const records=[],composer=createComposer(canvasFactory(records),[base]);
  const p=composer.prepare(photo),short=composer.prepare({...photo,metrics:{...photo.metrics,bounds:{left:110,top:40,right:500,bottom:600}}});
  assert.equal(p.geometry.scale,short.geometry.scale);
  const actor=composer.compose({portrait:p,body,poseId:base.id}),draw=records[0].filter(c=>c[0]==='drawImage').at(-1);
  assert.deepEqual(draw.slice(2,6),[0,0,600,1400]);assert.ok(actor.image.height>CHILD_MODEL.bodyHeight+CHILD_MODEL.headHeight,'long hair expands actor canvas');
});
test('scenes cannot pass separate head dimensions or nonuniform character scaling',()=>{
  const composer=createComposer(canvasFactory([]),[base]),p=composer.prepare(photo),a=composer.compose({portrait:p,body,poseId:base.id});
  for(const patch of [{headScale:.8},{scaleX:2},{scaleY:.8},{headOffset:10},{face:{}},{headFrame:{}},{unitsPerPixel:.8}]){
    assert.throws(()=>composer.place({},a,{x:0,y:0,scale:1,...patch}));assert.throws(()=>definePose({...base,...patch}));
  }
  assert.throws(()=>composer.compose({portrait:p,body,poseId:'unknown'}),/registered/);
  assert.throws(()=>composer.compose({portrait:p,body,poseId:base.id,pose:{...base,unitsPerPixel:2}}),/overrides/);
  assert.throws(()=>composer.compose({portrait:{...p},body,poseId:base.id}),/Prepare/);
  assert.throws(()=>composer.prepare({...photo,metrics:{bounds:photo.metrics.bounds,chin:photo.metrics.chin}}),/landmarks/);
  assert.throws(()=>composer.prepare({...photo,kind:'raw'}),/extracted/);
});
test('portrait or body replacement invalidates only the relevant composites',()=>{
  const records=[],composer=createComposer(canvasFactory(records),[base]),p=composer.prepare(photo),a=composer.compose({portrait:p,body,poseId:base.id});
  assert.notEqual(composer.compose({portrait:p,body:{...body},poseId:base.id}),a);
  const other=composer.prepare({...photo,image:{...photo.image}});assert.notEqual(composer.compose({portrait:other,body,poseId:base.id}),a);
  assert.equal(composer.compose({portrait:p,body,poseId:base.id}),a);
});
test('print-density composites preserve character units and the original portrait geometry',()=>{
  function factory(){const c={};for(const name of ['scale','translate','rotate','drawImage','save','restore'])c[name]=()=>{};return {width:0,height:0,getContext:()=>c};}
  const low=createComposer(factory,[base]),high=createComposer(factory,[base],{pixelDensity:4});
  const a=low.compose({portrait:low.prepare(photo),body,poseId:base.id}),b=high.compose({portrait:high.prepare(photo),body,poseId:base.id});
  assert.deepEqual(a.bounds,b.bounds);assert.equal(a.headScale,b.headScale);assert.equal(b.pixelDensity,4);
  assert.ok(Math.abs(a.image.width-b.image.width/4)<1);assert.ok(Math.abs(a.image.height-b.image.height/4)<1);
  let args;high.place({save(){},restore(){},translate(){},rotate(){},drawImage(...v){args=v;}},b,{x:0,y:0,scale:.5});
  assert.equal(args[3],b.image.width/8);assert.equal(args[4],b.image.height/8);
});
