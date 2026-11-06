'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CHILD_MODEL,createComposer}=require('../miniprogram/lib/character-rig');
const library=require('../content/child-pose-library.json'),registration=require('../content/action-fix-pose-registration.json');
const fixes=require('../miniprogram/lib/action-fixes-art');
function factory(records){return()=>{const calls=[];records.push(calls);return{getContext:()=>Object.fromEntries(['scale','translate','rotate','drawImage','save','restore'].map(k=>[k,(...args)=>calls.push([k,...args])]))};};}
test('new registered action bodies reuse the complete original portrait at the same facial scale',()=>{
 const records=[],poses=[library.poses['stand-wave'],...registration.poses],composer=createComposer(factory(records),poses,{pixelDensity:2});
 const image={width:1000,height:1600},portraits=[{left:320,top:40,right:690,bottom:700},{left:0,top:0,right:1000,bottom:1600}].map(bounds=>composer.prepare({image,kind:'cutout',metrics:{bounds,faceBounds:{left:380,top:250,right:620,bottom:580},chin:{x:500,y:580}}}));
 for(const portrait of portraits)for(const pose of poses){
  const body={width:1600,height:1700},actor=composer.compose({portrait,body,poseId:pose.id}),draw=records.at(-1).filter(c=>c[0]==='drawImage').at(-1);
  assert.equal(actor.headScale,portraits[0].geometry.scale);assert.deepEqual(draw.slice(2,6),[0,0,1000,1600]);
  assert.ok(Math.abs(draw[6]+500*actor.headScale)<1e-9);assert.ok(Math.abs(draw[7]+580*actor.headScale)<1e-9);
  assert.equal(composer.compose({portrait,body,poseId:pose.id}),actor);
 }
 assert.equal(registration.sourcePixelsPerUnit,CHILD_MODEL.sourcePixelsPerUnit);
});
test('height comparison remains in the correct order when hair expands the actor bounds',()=>{
 for(const top of [-280,-420,-800]){
  const actor={bounds:{top}},scale=.6,ground=920,standingY=ground-1180/CHILD_MODEL.sourcePixelsPerUnit*scale;
  const plan=fixes.resolvePlan({calibrateAgainstStand:true,treePlacement:{x:70,ground},placement:{x:535,y:standingY,scale}},{actorByPose:{'stand-wave':actor}});
  assert.equal(fixes.proof(plan,actor).childHigher,false);
  const raised={...plan,placement:{...plan.placement,y:standingY-110}};
  assert.equal(fixes.proof(raised,actor).childHigher,true);assert.ok(Math.abs(fixes.proof(raised,actor).treeTop-fixes.proof(raised,actor).childCrown-65)<1e-8);
 }
});
