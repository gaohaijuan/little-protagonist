'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const manifest=require('../preview/art/family/manifest.json'),poses=require('../content/child-pose-library.json');
const shared={characterRig:require('../miniprogram/lib/character-rig'),characterSession:require('../miniprogram/lib/character-session'),familyArt:require('../miniprogram/lib/family-art'),family:require('../miniprogram/lib/family')};
const bookIds=['intro','flower','family','hands','rain','stone'];
function setup(baseOverride){
  const canvases=[];function canvas(){const calls=[],c={};for(const name of ['scale','translate','rotate','drawImage','save','restore','setTransform','clearRect','fillRect','beginPath','ellipse','fill'])c[name]=(...args)=>calls.push([name,...args]);const result={width:0,height:0,getContext:()=>c,calls};canvases.push(result);return result;}
  const assets={courtyard:{width:1672,height:941},bodies:{width:1254,height:1254},heads:{width:1254,height:1254},childBody:{width:1024,height:1536},childHead:{width:1344,height:1184}};
  const base=baseOverride||{ensure:async()=>({assets,manifest}),retry(){}};
  const scope={};vm.runInNewContext(fs.readFileSync('preview/family-character-loader.js','utf8'),{window:scope,document:{createElement:canvas},Map,WeakMap,Promise,Error,JSON,Object});
  return {manager:scope.createFamilyCharacterLoader(shared,poses,base,bookIds),canvas,assets,canvases};
}
test('family reading, cover, profile and printing reuse whole actors instead of drawing heads in each scene',async()=>{
  const {manager,canvas,assets}=setup(),members=shared.family.defaultMembers(),loader=manager.forCharacters({},members),loaded=await loader.ensure();
  assert.equal(loader.status(),'ready');assert.equal(manager.forCharacters({},members.map(m=>({...m}))),loader);
  const actor=loaded.preparedActors.child;
  assert.equal(actor.composite.image.width>1000,true);
  assert.ok(manager.sourcesOf(actor.composite.image).some(s=>s.kind==='body'));
  for(const options of [{cover:true},{artPanel:true},{framing:'character',characterId:'child',characterRole:'child'}]){
    const target=canvas();assert.equal(shared.familyArt.draw(target,{...loaded,book:'family',width:500,height:512,members,...options}),true);
    const images=target.calls.filter(c=>c[0]==='drawImage');assert.equal(images[0][1],assets.courtyard);
    assert.ok(images.slice(1).every(c=>Object.values(loaded.preparedActors).some(a=>a.composite.image===c[1])),'scene can only place cached whole actors');
  }
  assert.equal((await loader.ensure()).preparedActors.child.composite.image,actor.composite.image);manager.close();
});
test('real portraits retain model proportions; draft replacement cannot overwrite the saved actor',async()=>{
  const {manager}=setup(),members=shared.family.defaultMembers();
  const photo={kind:'cutout',image:{width:600,height:1400},metrics:{bounds:{left:20,top:10,right:580,bottom:1380},faceBounds:{left:160,top:230,right:450,bottom:570},chin:{x:300,y:570}}};
  const savedLoader=manager.forCharacters({child:photo},members),saved=await savedLoader.ensure();
  const source=manager.sourcesOf(saved.preparedActors.child.composite.image).find(s=>s.portrait);
  assert.equal(source.portrait.image,photo.image);
  assert.equal(source.scale/4,300/(340*1.7));
  const draftLoader=manager.forCharacters({child:{...photo,image:{...photo.image}}},members),draft=await draftLoader.ensure();
  assert.notEqual(draft.preparedActors.child.composite.image,saved.preparedActors.child.composite.image);
  assert.equal(savedLoader.peek(),null,'replacing the portrait cancels and releases old jobs');
  const restoredLoader=manager.forCharacters({child:photo},members),restored=await restoredLoader.ensure();
  assert.notEqual(restored.preparedActors.child.composite.image,saved.preparedActors.child.composite.image);
  assert.equal(manager.sourcesOf(restored.preparedActors.child.composite.image).find(s=>s.portrait).portrait.image,photo.image);
  manager.openBook('rain');assert.equal(restoredLoader.peek(),null);
  assert.notEqual((await restoredLoader.ensure()).preparedActors.child.composite.image,restored.preparedActors.child.composite.image);manager.close();
});
test('obsolete downloads cannot publish after the three-book window moves',async()=>{
  let release;const base={ensure:()=>new Promise(resolve=>release=resolve),retry(){}};
  const {manager,assets}=setup(base),loader=manager.forCharacters({},shared.family.defaultMembers()),request=loader.ensure();manager.openBook('rain');release({assets,manifest});
  await assert.rejects(request,{name:'AbortError'});assert.equal(loader.peek(),null);assert.equal(loader.status(),'idle');manager.close();
});
test('one through twelve people keep whole actors and complete heads within the A5 panel',async()=>{
  for(let count=1;count<=12;count++){
    const {manager}=setup(),roles=['child','dad','mom','grandpa','grandma','olderBrother','olderSister','youngerBrother','youngerSister','olderBrother','olderSister','youngerBrother'];
    const members=roles.slice(0,count).map((role,i)=>({id:i===0?'child':'person-'+i,role,included:true})),loaded=await manager.forCharacters({},members).ensure();
    for(const kind of ['group','count','remember']){
      const area={x:60,y:90,width:965,height:790},placements=shared.familyArt.arrange(Object.values(loaded.preparedActors),area,{kind},false);
      const heads=placements.map(p=>({left:p.x+p.headBounds.left*p.scale,right:p.x+p.headBounds.right*p.scale,top:p.y+p.headBounds.top*p.scale,bottom:p.y+p.headBounds.bottom*p.scale}));
      for(const [i,p] of placements.entries()){
        assert.ok(p.x+p.extent.left*p.scale>=area.x-1e-7);assert.ok(p.x+p.extent.right*p.scale<=area.x+area.width+1e-7);
        assert.ok(p.y+p.extent.top*p.scale>=area.y-1e-7);assert.ok(p.y+p.extent.bottom*p.scale<=area.y+area.height+1e-7);
        for(const h of heads.slice(i+1))assert.equal(heads[i].left<h.right&&heads[i].right>h.left&&heads[i].top<h.bottom&&heads[i].bottom>h.top,false,`${count} people ${kind}: heads overlap`);
      }
    }
    manager.close();
  }
});
