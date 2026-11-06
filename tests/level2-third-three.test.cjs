'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createComposer,CHILD_MODEL}=require('../miniprogram/lib/character-rig');
const lib=require('../content/child-pose-library.json');
test('registered cheek hands occlude the original head without repainting or rescaling it',()=>{
 const calls=[],factory=()=>({getContext:()=>Object.fromEntries(['scale','translate','rotate','drawImage','save','restore'].map(k=>[k,(...a)=>calls.push([k,...a])]))});
 const poses=['stand-wave','pretend-bunny','pretend-cat'].map(k=>lib.poses[k]),composer=createComposer(factory,poses);
 const image={width:1000,height:1600};
 for(const bounds of [{left:200,top:40,right:800,bottom:700},{left:0,top:0,right:1000,bottom:1600}]){
  const portrait=composer.prepare({image,kind:'cutout',metrics:{bounds,faceBounds:{left:380,top:250,right:620,bottom:580},chin:{x:500,y:580}}});
  for(const p of poses){calls.length=0;const body={width:1536,height:2560},a=composer.compose({portrait,body,poseId:p.id}),head=calls.find(c=>c[0]==='drawImage'&&c[1]===image);
   assert.deepEqual(head.slice(2,6),[0,0,1000,1600]);assert.equal(a.headScale,CHILD_MODEL.headHeight/(330*1.7));assert.equal(composer.compose({portrait,body,poseId:p.id}),a);
   if(p.id==='pretend-cat'){const draws=calls.filter(c=>c[0]==='drawImage');assert.equal(draws.length,4);assert.equal(draws[1][1],image);assert.equal(draws[2][1],body);assert.equal(draws[3][1],body);}
  }
 }
});
test('new book scenes follow approved reveal, wind, and fruit eating order',()=>{
 const b=require('../miniprogram/lib/level2-third-three-art').BOOKS;
 assert.equal(b['level2-paper'].pages.length,8);assert.ok(b['level2-paper'].pages.slice(5).every(p=>p.stone));
 assert.deepEqual(b['level2-who-laughs'].pages.map(p=>!!p.dadBack),[true,true,true,true,true,false,false]);
 const f=b['level2-fruit'].pages;assert.equal(f[0].friend,null);assert.equal(f[3].small.bitten,false);assert.equal(f[4].small.bitten,false);assert.equal(f[4].big.bitten,true);assert.equal(f[5].small.bitten,true);
});
