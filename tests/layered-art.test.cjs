'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scenes=require('../miniprogram/lib/layered-art'),rig=require('../miniprogram/lib/character-rig'),library=require('../content/child-pose-library.json');
const shared={layeredArt:scenes,characterRig:rig,characterSession:require('../miniprogram/lib/character-session'),family:require('../miniprogram/lib/family'),familyArt:require('../miniprogram/lib/family-art')};
const bookIds=['intro','flower','family','hands','rain','stone','mountain','car','ball','water','tree','calling','catball','shoes','watering','wagon','paper','fruit','catbed','sleepy'];
function canvas(){const calls=[],ctx={};for(const name of ['scale','translate','rotate','save','restore','setTransform','clearRect','fillRect','beginPath','ellipse','fill','drawImage','clip','fillText','setLineDash','moveTo','lineTo','bezierCurveTo','stroke','rect','arc','closePath'])ctx[name]=(...args)=>{assert.ok(args.filter(a=>typeof a==='number').every(Number.isFinite));calls.push([name,...args]);};return {width:0,height:0,dataset:{},calls,getContext:()=>ctx};}
function setup(ids=bookIds){
  const assets={courtyard:{width:1672,height:941},bodies:{width:1254,height:1254},heads:{width:1254,height:1254},childBody:{width:1024,height:1536},childHead:{width:1344,height:1184}},manifest=require('../preview/art/family/manifest.json');
  const scope={},loads=[];class Image{constructor(){this.width=this.naturalWidth=1672;this.height=this.naturalHeight=941;}set src(url){if(!url)return;loads.push(url);if(Object.values(library.poses).some(p=>p.bodyUrl===url)){this.width=this.naturalWidth=1024;this.height=this.naturalHeight=1536;}queueMicrotask(()=>this.onload?.());}}
  vm.runInNewContext(fs.readFileSync('preview/family-character-loader.js','utf8'),{window:scope,document:{createElement:canvas},Image,setTimeout,clearTimeout,Map,WeakMap,Promise,Error,JSON,Object,Date,performance});
  const manager=scope.createCharacterArtLoader(shared,library,{ensure:async()=>({assets,manifest}),retry(){}},ids);
  return {manager,loads,members:shared.family.defaultMembers()};
}
test('all registered non-family pages use independent background assets and registered poses without facial overrides',()=>{
  assert.ok(Object.keys(scenes.BOOKS).length>=bookIds.length-1);
  for(const [id,b] of Object.entries(scenes.BOOKS))for(const [index,p] of b.pages.entries()){
    assert.ok(fs.existsSync('preview/'+scenes.imageUrl(p.background).slice(2)),`${id} ${index}: independent background exists`);
    if(p.pose){assert.ok(library.poses[p.pose]);assert.deepEqual(Object.keys(p.placement).sort(),['scale','x','y']);}
    assert.ok(!/photoPose|headScale|headOffset|avatarLayout/.test(JSON.stringify(p)));
    for(const key of scenes.assetKeys(p))assert.ok(fs.existsSync('preview/'+scenes.imageUrl(key).slice(2)));
  }
});
test('twenty shelf covers share one complete standing actor and do not move the initial three-book window',async()=>{
  const {manager,loads,members}=setup(),avatars={};let image;
  for(const id of bookIds){const bundle=await manager.forBook(id,avatars,members).ensure(0,{cover:true}),actor=id==='family'?bundle.preparedActors.child.composite.image:bundle.actorByPose['stand-wave'].image;if(image)assert.equal(actor,image);image=actor;}
  for(let i=0;i<100;i++){if(manager.snapshot().buckets[0].sessions.every(s=>s.poses.every(p=>p.status==='ready')))break;await new Promise(r=>setTimeout(r,1));}
  const snap=manager.snapshot();assert.deepEqual(Array.from(snap.buckets[0].window),['intro','flower','family']);
  assert.deepEqual(snap.buckets[0].sessions[0].poses.map(p=>p.id).sort(),['crouch-book','crouch-palm','run-left','stand-wave']);
  assert.equal(loads.some(p=>p.includes('child-umbrella')||p.includes('hands-open')||p.includes('child-carry')),false);
  await manager.forBook('family',avatars,members).ensure(0,{framing:'character'});
  assert.deepEqual(Array.from(manager.snapshot().buckets[0].window),['intro','flower','family'],'profile preview does not act like opening book 3');
  assert.equal(manager.snapshot().adultComposites,2);manager.openBook('stone');assert.equal(manager.snapshot().adultComposites,0,'unused adult composites are released with the family book');
  await manager.forBook('family',avatars,members).ensure(0,{cover:true});assert.equal(manager.snapshot().adultComposites,2,'a visible shelf cover may rebuild its adults on demand');
  assert.deepEqual(Array.from(manager.snapshot().buckets[0].window),['stone','mountain','car']);manager.close();
});
test('every page renders background, props and cached whole actor; book changes evict old action references',async()=>{
  const {manager,members}=setup([...Object.keys(scenes.BOOKS),'family']);let oldCrouch;
  for(const [id,b] of Object.entries(scenes.BOOKS)){
    manager.openBook(id);const loader=manager.forBook(id,{},members);
    for(let i=0;i<b.pages.length;i++){
      const o={book:id,page:i,width:1400,height:1433,pixelRatio:1},loaded=await loader.ensure(i,o),target=canvas(),p=scenes.planFor(id,i,o);
      assert.equal(scenes.draw(target,{...o,...loaded}),true);
      const images=target.calls.filter(c=>c[0]==='drawImage').map(c=>c[1]);assert.equal(images[0],loaded.assets[p.background]);
      if(p.pose)assert.ok(images.includes(loaded.actorByPose[p.pose].image));
      assert.ok(images.every(im=>im!==loaded.assets.childBody&&im!==loaded.assets.childHead),'page renderer never joins raw heads/bodies');
      if(id==='flower'&&i===0)oldCrouch=loaded.actorByPose[p.pose];
      assert.equal(target.dataset.characterPipeline,'composed-actor-v1');
    }
  }
  const poses=manager.snapshot().buckets[0].sessions[0].poses.map(p=>p.id);assert.equal(poses.includes('hold-umbrella'),false);assert.ok(oldCrouch);manager.close();
});
test('wide and long real hairstyles expand the camera without changing model proportions',()=>{
  const actor={bounds:{left:-700,top:-800,right:500,bottom:650}},p=scenes.planFor('hands',3);
  for(const ratio of [128/131,.56,1.4]){const v=scenes.cameraFor(p,actor,ratio),t=p.placement;assert.ok(Math.abs(v.width/v.height-ratio)<1e-10);assert.ok(v.x<=t.x+actor.bounds.left*t.scale);assert.ok(v.y<=t.y+actor.bounds.top*t.scale);assert.ok(v.x+v.width>=t.x+actor.bounds.right*t.scale);assert.ok(v.y+v.height>=t.y+actor.bounds.bottom*t.scale);}
});

test('current fifteen covers use only the initial window and share the standing actor',async()=>{
 const ids=require('../miniprogram/lib/current-edition').listBooks().map(b=>b.id),{manager,members}=setup(ids);let standing;
 for(const id of ids){
   const bundle=await manager.forBook(id,{},members).ensure(0,{cover:true}),plan=scenes.planFor(id,0,{cover:true});
   if(id!=='family'&&plan.pose){assert.equal(plan.pose,'stand-wave');const image=bundle.actorByPose['stand-wave'].image;if(standing)assert.equal(image,standing);standing=image;}
   if(id==='family')assert.ok(bundle.assets.revisedCourtyard);
 }
 assert.deepEqual(Array.from(manager.snapshot().buckets[0].window),ids.slice(0,3));
 const allowed=new Set(ids.slice(0,3).flatMap(id=>scenes.dependencies(id)));
 for(const s of manager.snapshot().buckets[0].sessions)assert.ok(s.poses.every(p=>allowed.has(p.id)));
 manager.close();
});
test('the complete original umbrella remains inside the illustration safety frame',()=>{
  for(const p of scenes.BOOKS.rain.pages.filter(p=>p.umbrella)){
    const t=scenes.umbrellaPlacement(p,rig.CHILD_MODEL,library.poses),b=scenes.propExtent(t),v=scenes.cameraFor(p,{bounds:{left:-200,top:-300,right:250,bottom:650}},128/131,[b]);
    assert.ok(b.left>=v.x+21);assert.ok(b.right<=v.x+v.width-21);assert.ok(b.top>=v.y+21);assert.ok(b.bottom<=v.y+v.height-21);
  }
});
test('object closeups retain their source area rather than magnifying a smaller crop',()=>{
  for(const b of Object.values(scenes.BOOKS))for(const p of b.pages.filter(p=>!p.pose&&(p.camera.width<700||p.camera.height<700))){
    const v=scenes.cameraFor(p,null,128/131);assert.ok(v.width>=p.camera.width);assert.ok(v.height>=p.camera.height);
  }
});

test('new stories retain their reveal order and share the registered actor in water reflections',()=>{
  const f=require('../miniprogram/lib/first-ten-art');
  const m=f.BOOKS.mountain.pages;assert.equal(m[0].background,m[5].background);assert.ok(m[1].cloud&&m[2].cloud);assert.equal(m[4].cloud,null);
  const c=f.BOOKS.car.pages;assert.equal(c[2].beat,'enter-left-door');assert.equal(c[3].beat,'leave-right-door');assert.ok(c[6].carPosition);assert.equal(c[7].closed,true);assert.equal(c[7].carPosition,null);
  for(const p of f.BOOKS.ball.pages.slice(0,6))assert.equal(p.ball,undefined);assert.ok(f.BOOKS.ball.pages[6].ball);
  const water=f.BOOKS.water.pages;assert.ok(water[4].reflection);assert.equal(water[5].pose,'crouch-touch');assert.equal(water[5].reflection,undefined);assert.ok(water[5].ripples);assert.ok(water[6].reflection);
  const actor={image:{width:400,height:500},anchor:{x:40,y:20},pixelDensity:1};const target=canvas();
  f.afterActor(target.getContext('2d'),water[1],actor,rig.CHILD_MODEL,library.poses);
  const images=target.calls.filter(c=>c[0]==='drawImage');assert.equal(images.length,1);assert.equal(images[0][1],actor.image,'reflection never constructs another portrait');
  const mirrors=target.calls.filter(c=>c[0]==='scale');assert.deepEqual(mirrors[0].slice(1),[.30,-.30],'whole actor reflection keeps uniform magnitude');
});

test('books 11–13 preserve the causal comparison and animal reveal',()=>{
  const next=require('../miniprogram/lib/books-eleven-thirteen-art'),t=next.BOOKS.tree.pages,c=next.BOOKS.calling.pages,b=next.BOOKS.catball.pages;
  const ground=p=>p.placement.y+(library.poses[p.pose].bounds.bottom-library.poses[p.pose].collar.y)/rig.CHILD_MODEL.sourcePixelsPerUnit*p.placement.scale;
  assert.deepEqual(t.slice(2,5).map(p=>p.background),Array(3).fill('tree-comparison'));
  assert.deepEqual(t.slice(2,5).map(p=>p.placement.scale),[.6,.6,.6]);
  assert.deepEqual(t.slice(2,5).map(ground),[920,810,920]);
  assert.equal(ground(t[5]),925,'open hands have the same sole position, not an assumed crouching footprint');
  assert.equal(c[1].bird,'call-bird');assert.equal(c[3].bird,'call-quiet-bird');
  assert.equal(c[6].bird,undefined);assert.equal(c[7].car,true);assert.equal(c[7].beat,'bird-found-on-my-car');
  assert.ok(c[4].cat);assert.equal(c[0].cat,undefined);
  assert.equal(b[3].red,'rightPalm');assert.equal(b[4].yellow,'rightPalm');
  assert.ok(b.slice(2,7).every(p=>p.cat==='cat-quiet'));assert.equal(b[7].cat,'cat-walk');
  assert.ok(b.slice(2).every(p=>p.red&&p.yellow),'both balls persist after they are introduced');
  assert.equal(b[6].red,'fingertips');assert.equal(b[6].pose,'crouch-touch');
});

test('books 14–16 keep shoes fixed and distinguish front, behind and inside',()=>{
  const next=require('../miniprogram/lib/books-fourteen-sixteen-art'),s=next.BOOKS.shoes.pages,w=next.BOOKS.wagon.pages,f=next.BOOKS.watering.pages;
  assert.equal(s[2].background,s[3].background);assert.deepEqual(s[2].bigShoes,s[3].bigShoes);
  assert.equal(s[2].wearing,'big');assert.equal(s[3].pose,'barefoot-step');assert.equal(s[5].pose,'step-own-shoes');
  assert.deepEqual(library.poses['step-own-shoes'].collar,library.poses['barefoot-step'].collar);
  const native=require('../content/books-14-16-art-assets.json');assert.deepEqual(native['step-own-shoes'].size,[1024,1536]);
  assert.equal(library.poses['step-own-shoes'].headRotation,0);assert.equal(library.poses['step-own-shoes'].model,'child-v1');
  assert.equal(f[1].can,true);assert.equal(f[2].pose,null);assert.ok(f.slice(5).every(p=>p.basin&&!p.can));
  for(const p of w.slice(0,4))assert.equal(p.background,'wagon-side');
  for(const p of w.slice(0,2))assert.ok(p.ball.x-32>p.wagon.x+p.wagon.width,'front is always beyond the right-facing cart');
  assert.equal(w[2].ball.x,w[3].ball.x,'rear ball is left behind when the cart moves');
  assert.ok(w[2].ball.x+32<w[2].wagon.x);
  assert.ok(w[3].wagon.x>w[2].wagon.x);
  for(const p of w.slice(5)){assert.equal(p.ball.where,'inside');assert.equal(p.ball.x-p.wagon.x,200);}
  assert.ok(w.filter(p=>p.motion).every(p=>p.pose==='push-cart'),'moving cart is pushed by the child');
});

test('books 17–19 preserve direction, fruit ownership and a cleared cat bed',()=>{
 const books=require('../miniprogram/lib/books-seventeen-nineteen-art').BOOKS;
 const p=books.paper.pages,f=books.fruit.pages,b=books.catbed.pages;
 assert.equal(p[2].background,p[3].background);assert.deepEqual(p[2].camera,p[3].camera);
 assert.ok(p[2].paper.x+p[2].paper.width<p[2].placement.x);assert.ok(p[3].paper.x>p[3].placement.x);
 assert.equal(p[2].pose,'run-left');assert.equal(p[3].pose,'run-right');
 assert.ok(p.slice(0,6).every(p=>!p.stone));assert.ok(p.slice(6).every(p=>p.stone));
 assert.ok(f.every(p=>p.small&&p.big),'exactly two apples persist through sharing');
 assert.ok(f.slice(0,5).every(p=>!p.small.bitten&&!p.big.bitten));
 assert.equal(f[5].pose,'eat-fruit');assert.equal(f[5].small.bitten,true);assert.equal(f[5].big.bitten,false);
 assert.ok(f.slice(6).every(p=>p.small.bitten&&p.big.bitten));
 assert.deepEqual(library.poses['eat-fruit'].collar,library.poses['carry-play'].collar);
 assert.equal(library.poses['eat-fruit'].model,'child-v1');
 assert.deepEqual(require('../content/books-17-19-art-assets.json')['eat-fruit'].size,[1024,1536]);
 assert.deepEqual(b[2].ball.at,[605,895]);assert.equal(b[3].ball.at,'rightPalm');
 assert.ok(!b[3].car);assert.ok(b[4].car&&!b[4].car.at);assert.equal(b[6].car.at,'rightPalm');
 assert.equal(b[7].cat.key,'bed-cat-sleep');assert.equal(b[7].sleeping,true);
 assert.ok(b[7].car.x+b[7].car.width<b[7].bed.x);assert.ok(b[7].ball.at[0]+32<b[7].bed.x);
});

test('book 20 keeps the child indoors and reveals resting companions in order',()=>{const b=require('../miniprogram/lib/book-twenty-art'),p=b.BOOKS.sleepy.pages;assert.equal(p.length,8);assert.ok(p.slice(0,2).every(p=>!p.bird&&!p.cat&&!p.shoes));assert.ok(p[2].bird&&!p[2].pose);assert.ok(p[3].cat&&p[4].cat);assert.notEqual(p[3].background,p[4].background);assert.ok(!p[5].shoes);assert.ok(p[6].carInside&&p[6].shoes&&!p[6].pose);assert.equal(p[7].pose,'barefoot-stand');assert.ok(p.every(p=>b.proof(p).indoors));assert.deepEqual(b.assetKeys(p[6]),['sleep-shoeclose','sleep-shoes','sleep-car']);});
