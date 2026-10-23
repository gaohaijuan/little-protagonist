'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {draw,selectedMembers}=require('../miniprogram/lib/family-art.js');
const {familyBook,canUsePhoto}=require('../miniprogram/lib/family.js');
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function mockCanvas(){
  const calls=[],images=[],stack=[];let matrix=[1,0,0,1,0,0];const c={};
  for(const method of ['setTransform','clearRect','fillRect','save','restore','translate','scale','rotate','beginPath','ellipse','fill','drawImage'])c[method]=(...args)=>{
    args.filter(a=>typeof a==='number').forEach(a=>assert.ok(Number.isFinite(a)));calls.push([method,...args]);
    if(method==='setTransform')matrix=args.slice();if(method==='save')stack.push(matrix.slice());if(method==='restore'){assert.ok(stack.length);matrix=stack.pop();}
    if(method==='translate')matrix=multiply(matrix,[1,0,0,1,args[0],args[1]]);if(method==='scale')matrix=multiply(matrix,[args[0],0,0,args[1],0,0]);
    if(method==='rotate')matrix=multiply(matrix,[Math.cos(args[0]),Math.sin(args[0]),-Math.sin(args[0]),Math.cos(args[0]),0,0]);
    if(method==='drawImage')images.push({args,matrix:matrix.slice()});
  };
  return {canvas:{width:1,height:1,getContext:()=>c},calls,images,stack};
}
function fixture(count=5){
  const roles=['child','dad','mom','grandpa','grandma','olderBrother','olderSister','youngerBrother','youngerSister','olderBrother','youngerSister','olderBrother'];
  const members=roles.slice(0,count).map((role,i)=>({id:i<9?role:'member-'+i,role,included:true}));
  const assets={courtyard:{width:1672,height:941,name:'courtyard'},bodies:{width:800,height:1400,name:'bodies'},childBody:{width:400,height:600,name:'childBody'},heads:{width:800,height:1000,name:'heads'},childHead:{width:400,height:500,name:'childHead'}};
  const body={},heads={};
  ['dad','mom','grandpa','grandma','child'].forEach((role,i)=>{
    const adult=i<4;
    body[role]={asset:adult?'bodies':'childBody',sourceRect:{x:adult?(i%2)*400:0,y:adult?Math.floor(i/2)*700:0,width:400,height:adult?700:600},bounds:{left:35,top:90,right:365,bottom:adult?690:590},collar:{x:200,y:adult?125:240},foot:{x:200,y:adult?685:585},face:{width:adult?186:200,height:adult?200:240},rotation:0};
    heads[role]={asset:adult?'heads':'childHead',sourceRect:{x:adult?(i%2)*400:0,y:adult?Math.floor(i/2)*500:0,width:400,height:500},metrics:{bounds:{left:15,top:10,right:385,bottom:480},faceBounds:{left:50,top:120,right:350,bottom:470},chin:{x:200,y:465}}};
  });
  const avatars={};members.forEach(member=>{avatars[member.id]={image:{width:540,height:570,name:member.id},kind:'cutout',metrics:{bounds:{left:30,top:15,right:510,bottom:558},faceBounds:{left:110,top:180,right:430,bottom:500},chin:{x:270,y:497}},layout:{scale:1,x:0,y:0}};});
  return {book:'family',width:836,height:470.5,members,avatars,assets,manifest:{width:1672,height:941,body,heads}};
}
function rectFor(call,bounds){
  const {args,matrix:m}=call,sw=args[3],sh=args[4],dx=args[5],dy=args[6],dw=args[7],dh=args[8];
  const p=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>{const px=dx+x*dw/sw,py=dy+y*dh/sh;return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};});
  return {left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))};
}
function intersects(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
test('all family pages follow actual selected member IDs, including duplicate sibling roles',()=>{
  const o=fixture(12),book=familyBook({name:'小石头'},o.members);
  book.scenes.forEach((scene,page)=>{
    const mock=mockCanvas();assert.equal(draw(mock.canvas,{...o,page,familyScene:scene}),true);
    const photos=mock.images.filter(item=>o.avatars[item.args[0].name]);
    assert.deepEqual(photos.map(item=>item.args[0].name).sort(),scene.memberIds.filter(id=>canUsePhoto(o.members.find(m=>m.id===id).role)).sort());
    assert.equal(mock.images.filter(item=>item.args[0]===o.assets.heads).length,scene.memberIds.filter(id=>!canUsePhoto(o.members.find(m=>m.id===id).role)).length);
    assert.equal(mock.stack.length,0);assert.deepEqual(mock.calls.at(-1),['setTransform',1,0,0,1,0,0]);
  });
});
test('one through twelve people keep complete hairstyles separate and outside the text area',()=>{
  for(let count=1;count<=12;count++)for(const kind of ['group','count','remember']){
    const o=fixture(count),mock=mockCanvas(),familyScene={kind,memberIds:o.members.map(m=>m.id),focusId:'child'};
    // Different long hairstyles and manual placement extremes are part of the
    // actual collision calculation rather than being silently slider-clamped.
    o.members.forEach((member,i)=>{o.avatars[member.id].layout={scale:i%2?1.6:.6,x:i%2?35:-35,y:i%2?-35:35};});
    draw(mock.canvas,{...o,familyScene});
    const extents=mock.images.filter(item=>o.avatars[item.args[0].name]||item.args[0]===o.assets.heads).map(item=>{
      const custom=o.avatars[item.args[0].name];
      const spec=custom||Object.values(o.manifest.heads).find(h=>h.asset==='heads'&&h.sourceRect.x===item.args[1]&&h.sourceRect.y===item.args[2]);
      return rectFor(item,spec.metrics.bounds);
    });
    assert.equal(extents.length,count);
    extents.forEach((extent,i)=>{assert.ok(extent.left>=0);assert.ok(extent.top>=0);assert.ok(extent.right<=o.width*.65+1e-7);assert.ok(extent.bottom<=o.height);for(let j=i+1;j<extents.length;j++)assert.equal(intersects(extent,extents[j]),false,`${count} people ${kind}, ${i}/${j} hair overlap`);});
  }
});
test('original photograph pixels remain whole and isotropic for every size and framing',()=>{
  for(const framing of [undefined,'character'])for(const cover of [false,true]){
    const o=fixture(7),mock=mockCanvas();draw(mock.canvas,{...o,framing,cover,characterId:'olderSister',characterRole:'olderSister',width:120,height:168,pixelRatio:2});
    mock.images.forEach(({args})=>assert.ok(Math.abs(args[3]/args[4]-args[7]/args[8])<1e-10,'every painted asset and portrait preserves aspect ratio'));
    const photos=mock.images.filter(item=>o.avatars[item.args[0].name]);
    photos.forEach(({args})=>assert.deepEqual(args.slice(1,5),[0,0,540,570]));
    assert.equal(mock.canvas.width,240);assert.equal(mock.canvas.height,336);
  }
});

test('cover families stay on at most two ground rows at shelf and landscape sizes',()=>{
  for(const count of [3,6,12])for(const [width,height] of [[120,168],[320,200],[470,270]]){
    const o=fixture(count),mock=mockCanvas();
    assert.equal(draw(mock.canvas,{...o,cover:true,width,height}),true);
    const feet=mock.images.filter(call=>[o.assets.bodies,o.assets.childBody].includes(call.args[0])).map(call=>{
      const spec=Object.values(o.manifest.body).find(body=>o.assets[body.asset]===call.args[0]&&body.sourceRect.x===call.args[1]&&body.sourceRect.y===call.args[2]);
      return rectFor(call,{left:spec.foot.x,top:spec.bounds.bottom,right:spec.foot.x+.01,bottom:spec.bounds.bottom+.01}).top;
    });
    assert.equal(feet.length,count);
    const rows=new Set(feet.map(y=>y.toFixed(4)));
    assert.equal(rows.size,count===3&&width>=height?1:2,`${count} people at ${width}×${height} use a grounded group`);
    feet.forEach(y=>assert.ok(y>=height*.65&&y<=height*.95,'nobody stands on the roof or trees'));
  }
});
test('missing selected head or body fails before drawing any incomplete person',()=>{
  for(const missing of ['courtyard','bodies','childBody','heads','childHead']){
    const o=fixture(),mock=mockCanvas();delete o.assets[missing];o.avatars={};
    assert.equal(draw(mock.canvas,o),false,missing);assert.deepEqual(mock.calls,[]);assert.equal(mock.canvas.width,1);
  }
});
test('child photos do not need the unused default child head; adult heads are always required',()=>{
  const o=fixture(3),mock=mockCanvas();delete o.assets.childHead;
  o.members.push({id:'grandma',role:'grandma',included:false});
  assert.equal(draw(mock.canvas,o),true);assert.equal(mock.images.length,7);
  assert.equal(selectedMembers({...o,framing:'character',characterId:'grandma'}).at(0).id,'grandma','an excluded member can still display their default body preview');
  delete o.assets.heads;const missing=mockCanvas();assert.equal(draw(missing.canvas,o),false);assert.deepEqual(missing.calls,[]);
});
test('the same adult and child retain different painted body proportions in a pair',()=>{
  const o=fixture(3),mock=mockCanvas();draw(mock.canvas,{...o,familyScene:{kind:'member',memberIds:['dad','child'],focusId:'dad'}});
  const adult=mock.images.find(item=>item.args[0]===o.assets.bodies),child=mock.images.find(item=>item.args[0]===o.assets.childBody);
  const adultHeight=adult.args[8]*adult.matrix[3],childHeight=child.args[8]*child.matrix[3];
  assert.ok(adultHeight>childHeight*1.35,'adult full trousers/torso must not become a scaled toddler');
});
test('default adult heads use the matching atlas cells and siblings use independent child heads',()=>{
  const o=fixture(7),mock=mockCanvas();o.avatars={};draw(mock.canvas,o);
  const heads=mock.images.filter(item=>item.args[0]===o.assets.heads);
  assert.equal(heads.length,4);assert.deepEqual(heads.map(item=>item.args.slice(1,3)),[[0,0],[400,0],[0,500],[400,500]]);
  assert.equal(mock.images.filter(item=>item.args[0]===o.assets.childHead).length,3);
});
test('invalid sprite coordinates safely retain complete fallback art',()=>{
  for(const mutate of [o=>o.manifest.body.dad.sourceRect.x=9999,o=>o.manifest.body.child.face.height=0]){
    const o=fixture(),mock=mockCanvas();mutate(o);assert.equal(draw(mock.canvas,o),false);assert.deepEqual(mock.calls,[]);
  }
});
test('legacy raw photos use a new illustrated head without discarding the saved photo',()=>{
  const o=fixture(),mock=mockCanvas();o.avatars.child.kind='raw';const original=o.avatars.child.image;
  assert.equal(draw(mock.canvas,o),true);assert.equal(o.avatars.child.image,original);
  assert.equal(mock.images.some(item=>item.args[0]===original),false);
  assert.equal(mock.images.filter(item=>item.args[0]===o.assets.childHead).length,1);
});
test('adult photos, metrics and manual placement never affect any family page or standalone adult preview',()=>{
  const o=fixture(12),adults=o.members.filter(member=>!canUsePhoto(member.role));
  const saved=Object.fromEntries(adults.map(member=>[member.id,o.avatars[member.id]]));
  const baseline={...o,avatars:Object.fromEntries(Object.entries(o.avatars).filter(([id])=>!saved[id]))};
  const modes=[{}, {cover:true}, ...adults.map(member=>({framing:'character',characterId:member.id,characterRole:member.role})),
    ...familyBook({},o.members).scenes.map(familyScene=>({familyScene}))];
  for(const mode of modes){
    const clean=mockCanvas(),old=mockCanvas();draw(clean.canvas,{...baseline,...mode});
    const avatars={...o.avatars};for(const member of adults)avatars[member.id]={...saved[member.id],layout:{scale:1.6,x:35,y:-35},metrics:{bounds:{left:0,top:0,right:99999,bottom:99999},chin:{x:0,y:0}}};
    draw(old.canvas,{...o,...mode,avatars,avatar:o.avatars.dad.image,avatarKind:'cutout',avatarLayout:{scale:1.6,x:-35,y:35}});
    assert.deepEqual(old.calls,clean.calls,'old adult portrait data cannot alter scale, position or head pixels');
    for(const member of adults)assert.equal(old.images.some(item=>item.args[0]===saved[member.id].image),false,member.id+' photo never reaches drawImage');
  }
  for(const member of adults)assert.equal(o.avatars[member.id],saved[member.id],'saved adult data is retained');
});
test('family asset loader shares requests, rejects local filename escapes and supports retry',async()=>{
  const script=fs.readFileSync(require.resolve('../preview/family-art-loader.js'),'utf8'),requests=[],fetches=[];
  let fail=true;
  const manifest={body:{child:{}},heads:{child:{}},files:{courtyard:'courtyard.webp',childBody:'child-body.webp',childHead:'child-head.webp'}};
  class Image{set src(value){if(!value)return;requests.push(value);queueMicrotask(()=>{if(value.includes('child-head')&&fail)this.onerror();else{this.naturalWidth=400;this.naturalHeight=500;this.onload();}});}}
  const context={window:{},Image,AbortController,setTimeout,clearTimeout,fetch:async(url)=>{fetches.push(url);return {ok:true,json:async()=>manifest};}};
  vm.runInNewContext(script,context);const loader=context.window.LittleFamilyArtLoader;
  assert.equal(loader.status(),'idle');const first=loader.ensure(0),second=loader.ensure(9);assert.equal(first,second);
  await assert.rejects(first);assert.equal(loader.status(),'error');assert.equal(loader.peek(),null);
  fail=false;loader.retry();await loader.ensure();assert.equal(loader.status(),'ready');assert.equal(fetches.length,1);assert.equal(requests.length,4,'only failed head retries');
  assert.equal(loader.peek().assets.childHead.naturalWidth,400);
  const unsafe={...context,window:{},fetch:async()=>({ok:true,json:async()=>({...manifest,files:{bad:'../private.webp'}})})};
  vm.runInNewContext(script,unsafe);await assert.rejects(unsafe.window.LittleFamilyArtLoader.ensure(),/文件名/);
});
