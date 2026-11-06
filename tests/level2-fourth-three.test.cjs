'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createComposer,CHILD_MODEL}=require('../miniprogram/lib/character-rig'),lib=require('../content/child-pose-library.json');
const art=require('../miniprogram/lib/level2-fourth-three-art'),registration=require('../content/level2-fourth-three-pose-registration.json');
test('resting pose retains original portrait pixels and facial scale, with a registered arm in front',()=>{
 const records=[],factory=()=>({getContext:()=>Object.fromEntries(['scale','translate','rotate','drawImage','save','restore'].map(k=>[k,(...a)=>records.push([k,...a])]))});
 const poses=[lib.poses['stand-wave'],lib.poses['sit-doze']],c=createComposer(factory,poses);
 for(const bounds of [{left:200,top:40,right:800,bottom:700},{left:0,top:0,right:1000,bottom:1600}]){
  const image={width:1000,height:1600},p=c.prepare({image,kind:'cutout',metrics:{bounds,faceBounds:{left:380,top:250,right:620,bottom:580},chin:{x:500,y:580}}});
  for(const pose of poses){records.length=0;const body={width:1536,height:2304},a=c.compose({portrait:p,body,poseId:pose.id}),head=records.find(r=>r[0]==='drawImage'&&r[1]===image);assert.deepEqual(head.slice(2,6),[0,0,1000,1600]);assert.equal(a.headScale,CHILD_MODEL.headHeight/(330*1.7));assert.equal(c.compose({portrait:p,body,poseId:pose.id}),a);
   if(pose.id==='sit-doze'){const draws=records.filter(r=>r[0]==='drawImage');assert.equal(draws.at(-1)[1],body);assert.equal(draws[1][1],image);assert.ok(Object.isFrozen(pose.foregroundRects)||Object.isFrozen(c));}
  }
 }
 assert.equal(registration[0].registeredSoleMinusCollar,851);
});
test('water reflection changes, actual sky moon never disappears, animal has three coherent actions',()=>{
 const moon=art.BOOKS['level2-moon'].pages;
 assert.deepEqual(moon.map(p=>p.reflection),['calm','calm','broken','none','none','calm','calm']);
 assert.equal(moon[2].rabbit.key,'white-rabbit-drink');assert.equal(moon[5].rabbit.key,'white-rabbit-alert');assert.equal(moon[3].background,'moon-pond-close');
 const r=art.BOOKS['level2-rabbit'].pages;assert.ok(r[2].bird);assert.ok(r[4].reverseOnRabbit);assert.equal(r[6].leaf.at,'palm');assert.equal(r[6].pose,'crouch-palm');assert.ok(r[7].teethReveal);assert.equal(r[7].rabbit.key,'white-rabbit-teeth');
 const dawn=art.BOOKS['level2-sunrise'].pages;assert.ok(dawn.slice(0,4).every(p=>p.background==='l2-dawn-night'));assert.ok(dawn.slice(4).every(p=>p.background==='l2-dawn-sun'));assert.deepEqual(dawn.filter(p=>p.pose==='sit-doze').map(p=>p.beat),['sit-wait-and-doze-off','dad-calls-the-child-sun-is-up']);
});
