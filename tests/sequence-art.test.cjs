'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {draw,pagePlan}=require('../miniprogram/lib/sequence-art');
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function canvasMock(){
  const calls=[],images=[],stack=[];let matrix=[1,0,0,1,0,0];const c={};
  for(const method of ['setTransform','clearRect','fillRect','save','restore','translate','rotate','beginPath','rect','clip','ellipse','fill','drawImage'])c[method]=(...args)=>{
    args.filter(value=>typeof value==='number').forEach(value=>assert.ok(Number.isFinite(value)));calls.push([method,...args]);
    if(method==='setTransform')matrix=args.slice();if(method==='save')stack.push(matrix.slice());if(method==='restore'){assert.ok(stack.length);matrix=stack.pop();}
    if(method==='translate')matrix=multiply(matrix,[1,0,0,1,args[0],args[1]]);
    if(method==='rotate')matrix=multiply(matrix,[Math.cos(args[0]),Math.sin(args[0]),-Math.sin(args[0]),Math.cos(args[0]),0,0]);
    if(method==='drawImage')images.push({args,matrix:matrix.slice()});
  };
  return {canvas:{width:1,height:1,getContext:()=>c},calls,images,stack};
}
const metrics={bounds:{left:35,top:8,right:505,bottom:560},faceBounds:{left:125,top:180,right:415,bottom:490},chin:{x:270,y:489}};
function fixture(book='hands'){
  const assets={childHead:{width:540,height:570,name:'default-child'},careHead:{width:540,height:570,name:'default-care'}};
  const scenes={},files={};
  for(let index=0;index<6;index++){
    const name='scene-'+index;assets[name]={width:1672,height:941,name};files[name]=name+'.webp';
    scenes[name]=index===2?{head:false,crop:{x:100,y:250,width:700,height:600}}:{head:index%2?'careHead':'childHead',neck:{x:500+index*15,y:430+index*8},face:{width:210,height:220},rotation:index*.02,photoPose:{neck:{x:505+index*15,y:435+index*8},face:{width:215,height:225},rotation:-.24+index*.08}};
  }
  return {book,width:836,height:470.5,assets,manifest:{version:1,width:1672,height:941,files,heads:{childHead:{url:'../../family/child-head.webp',metrics},careHead:{url:'../../flower/care-head.webp',metrics}},scenes,pages:Array.from({length:6},(_,index)=>({scene:'scene-'+index,...(index===4?{crop:{x:240,y:80,width:750,height:800}}:{})})),cover:{scene:'scene-1',crop:{x:220,y:0,width:760,height:941}}}};
}
function position(call,x,y){const {args:a,matrix:m}=call,px=a[5]+x*a[7]/a[3],py=a[6]+y*a[8]/a[4];return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};}
function corners(call,b){return [[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>position(call,x,y));}

test('production body poses retain the calibrated photo scale and collar across books and default expression changes',()=>{
  const photo={width:540,height:570},portrait={bounds:{left:85,top:15,right:465,bottom:565},faceBounds:{left:125,top:240,right:430,bottom:555},chin:{x:270,y:555}};
  for(const book of ['hands','rain','stone']){
    const manifest=JSON.parse(fs.readFileSync(require.resolve('../preview/art/sequence/'+book+'/manifest.json'),'utf8'));
    const assets=Object.fromEntries(Object.keys(manifest.files).map(id=>[id,{width:1672,height:941}]));
    for(let page=0;page<manifest.pages.length;page++){
      const scene=manifest.scenes[manifest.pages[page].scene];if(scene.head===false)continue;
      const pose=scene.photoPose;assert.ok(pose.headFrame.crownHeight>0,book+' has an authored head frame');
      let originalScale;
      // A default expression can be replaced or re-trimmed without changing
      // the anatomy of a real child already fitted to this fixed body.
      for(const changeReference of [false,true]){
        const m=structuredClone(manifest);
        if(changeReference)for(const head of Object.values(m.heads))head.metrics={...metrics,chin:{x:270,y:200}};
        const mock=canvasMock();assert.equal(draw(mock.canvas,{book,page,width:568,height:318,manifest:m,assets,avatars:{child:{image:photo,kind:'cutout',metrics:portrait}}}),true);
        const head=mock.images.at(-1),body=mock.images[0],chin=position(head,portrait.chin.x,portrait.chin.y),neck=position(body,pose.neck.x,pose.neck.y);
        assert.ok(Math.hypot(chin.x-neck.x,chin.y-neck.y)<1e-8,book+' page '+page+' remains attached to its collar');
        const scale=Math.hypot(head.matrix[0],head.matrix[1])*head.args[7]/photo.width/Math.hypot(body.matrix[0],body.matrix[1]);
        assert.ok(Math.abs(scale*(portrait.faceBounds.bottom-portrait.faceBounds.top)*1.7-pose.headFrame.crownHeight)<1e-8,'regular portrait fills the authored frame');
        if(originalScale!==undefined)assert.equal(scale,originalScale,'default expression metadata cannot resize real faces');originalScale=scale;
        assert.ok(Math.abs(head.args[7]/photo.width-head.args[8]/photo.height)<1e-12,'photo remains isotropic');
      }
    }
  }
});

test('hands crown and its safety margin have painted background above the original scene edge',()=>{
  const manifest=JSON.parse(fs.readFileSync(require.resolve('../preview/art/sequence/hands/manifest.json'),'utf8'));
  const assets=Object.fromEntries(Object.keys(manifest.files).map(id=>[id,{width:1672,height:941}]));
  const photo={width:540,height:570},portrait={bounds:{left:85,top:15,right:465,bottom:565},faceBounds:{left:125,top:240,right:430,bottom:555},chin:{x:270,y:555}};
  for(const page of [0,1,2,3,4,5])for(const cover of [false,true])for(const [width,height] of [[568,318],[844,286],[1400,788]]){
    const mock=canvasMock();draw(mock.canvas,{book:'hands',page,cover,width,height,assets,manifest,avatars:{child:{image:photo,kind:'cutout',metrics:portrait}}});
    const body=mock.images[0],head=mock.images.at(-1),bleed=mock.images.find(call=>call.args[0]===body.args[0]&&call.matrix[3]<0);
    assert.ok(bleed,'camera outside the painting must extend its background');
    const artTop=position(body,0,0).y,hairTop=Math.min(...corners(head,portrait.bounds).map(p=>p.y));
    const bleedTop=position(bleed,0,bleed.args[4]).y;
    assert.ok(hairTop<artTop,'fixture reproduces hair above the unextended painting');
    assert.ok(bleedTop<hairTop,'paint extends above all hair, retaining a visible safety margin');
    assert.ok(Math.abs(position(bleed,0,0).y-artTop)<1e-8,'edge continuation joins the painting without a gap');
    assert.deepEqual(head.args.slice(1,5),[0,0,photo.width,photo.height],'complete source head is retained');
    assert.ok(Math.abs(head.args[7]/photo.width-head.args[8]/photo.height)<1e-12,'no stretching to hide the overflow');
  }
});
test('each approved book selects its own page scene and independent cover',()=>{
  for(const book of ['hands','rain','stone']){
    const o=fixture(book);
    for(let page=0;page<6;page++){
      const mock=canvasMock();assert.equal(draw(mock.canvas,{...o,page}),true);assert.equal(mock.images[0].args[0],o.assets['scene-'+page]);
      assert.equal(mock.images.length,page===2?1:2);assert.equal(mock.stack.length,0);
    }
    const mock=canvasMock();assert.equal(draw(mock.canvas,{...o,page:5,cover:true}),true);assert.equal(mock.images[0].args[0],o.assets['scene-1']);
    assert.equal(pagePlan(o.manifest,999).scene,'scene-5');assert.equal(pagePlan(o.manifest,-1).scene,'scene-0');
  }
});
test('object closeups require no head, neck or face and never insert a saved portrait',()=>{
  const o=fixture(),mock=canvasMock();delete o.assets.childHead;delete o.assets.careHead;delete o.manifest.heads;
  assert.equal(draw(mock.canvas,{...o,page:2,avatar:{width:540,height:570},avatarKind:'cutout'}),true);
  assert.equal(mock.images.length,1);assert.equal(mock.calls.some(call=>call[0]==='ellipse'),false);
});
test('incomplete backgrounds, heads and geometry never paint a half scene or resize the canvas',()=>{
  for(const mutate of [o=>delete o.assets['scene-0'],o=>delete o.assets.childHead,o=>o.assets.childHead.complete=false,o=>delete o.manifest.scenes['scene-0'].neck,o=>o.manifest.scenes['scene-0'].face.width=0,o=>o.manifest.pages[0].scene='missing']){
    const o=fixture(),mock=canvasMock();mutate(o);assert.equal(draw(mock.canvas,o),false);assert.deepEqual(mock.calls,[]);assert.equal(mock.canvas.width,1);
  }
  for(const patch of [{book:'intro'},{book:'other'},{framing:'avatar'},{framing:'hero'}]){const mock=canvasMock();assert.equal(draw(mock.canvas,{...fixture(),...patch}),false);assert.deepEqual(mock.calls,[]);}
});
test('default head assets follow each scene and legacy raw photographs never replace them',()=>{
  const o=fixture(),photo={width:540,height:570,name:'raw-photo'};
  for(const page of [0,1,3,4,5]){
    const mock=canvasMock();draw(mock.canvas,{...o,page,avatar:photo,avatarKind:'raw'});
    assert.equal(mock.images.at(-1).args[0],o.assets[o.manifest.scenes['scene-'+page].head]);assert.equal(mock.images.some(call=>call.args[0]===photo),false);
  }
});
test('original hair is fully inside the viewport and clear of body text at all manual extremes',()=>{
  const photo={width:600,height:1100,name:'local-photo'},b={left:20,top:6,right:580,bottom:1094};
  const photoMetrics={bounds:b,faceBounds:{left:170,top:120,right:430,bottom:480},chin:{x:300,y:479}};
  for(const book of ['hands','rain','stone'])for(const page of [0,1,3,4,5])for(const [width,height,cover]of [[568,216,false],[844,286,false],[120,168,true]])for(const scale of [.6,1.6])for(const x of [-35,35])for(const y of [-35,35]){
    const o=fixture(book),mock=canvasMock();
    assert.equal(draw(mock.canvas,{...o,page,width,height,cover,avatars:{child:{image:photo,kind:'cutout',metrics:photoMetrics,layout:{scale,x,y}}}}),true);
    const call=mock.images.at(-1);assert.equal(call.args[0],photo);assert.deepEqual(call.args.slice(1,5),[0,0,600,1100]);
    assert.ok(Math.abs(call.args[7]/600-call.args[8]/1100)<1e-12,'entire image stays isotropic');
    assert.ok(call.matrix[0]*call.matrix[3]-call.matrix[1]*call.matrix[2]>0,'face is never mirrored');
    const clip=mock.calls.find(call=>call[0]==='rect').slice(1);
    for(const p of corners(call,b)){assert.ok(p.x>=-1e-8&&p.x<=width*(cover?1:.65)+1e-8&&p.y>=-1e-8&&p.y<=height+1e-8);assert.ok(p.x>=clip[0]-1e-8&&p.x<=clip[0]+clip[2]+1e-8&&p.y>=clip[1]-1e-8&&p.y<=clip[1]+clip[3]+1e-8,'hair is inside the actual clip');}
    assert.equal(mock.stack.length,0);
  }
});
test('photo chin and rotation follow each scene pose while source pixels remain unchanged',()=>{
  const o=fixture(),photo={width:540,height:570};delete o.assets.childHead;delete o.assets.careHead;
  for(const page of [0,1,3,4,5]){
    const mock=canvasMock(),pose=o.manifest.scenes['scene-'+page].photoPose;
    assert.equal(draw(mock.canvas,{...o,page,avatar:photo,avatarKind:'cutout',avatarMetrics:metrics}),true);
    const head=mock.images.at(-1),background=mock.images[0],chin=position(head,metrics.chin.x,metrics.chin.y),neck=position(background,pose.neck.x,pose.neck.y);
    assert.ok(Math.hypot(chin.x-neck.x,chin.y-neck.y)<1e-8);assert.ok(Math.abs(Math.atan2(head.matrix[1],head.matrix[0])-pose.rotation)<1e-8);
  }
});
test('page crop overrides scene crop and closeups reserve the same accessible text column',()=>{
  const o=fixture(),first=canvasMock(),second=canvasMock();
  o.manifest.pages[0].crop={x:300,y:150,width:600,height:600};o.manifest.scenes['scene-0'].crop={x:0,y:0,width:1087,height:941};
  draw(first.canvas,o);delete o.manifest.pages[0].crop;draw(second.canvas,o);
  assert.notDeepEqual(first.images[0].matrix,second.images[0].matrix);
  for(const mock of [first,second]){const rect=mock.calls.find(call=>call[0]==='rect');assert.ok(Math.abs(rect[3]-mock.canvas.width*.65)<1e-8);assert.ok(Math.abs(rect[4]-mock.canvas.height)<1e-8);}
});

const loaderSource=fs.readFileSync(require.resolve('../preview/sequence-art-loader.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function loaderHarness({manifests={},failImage=()=>false,holdImage=()=>false,failMetadata=()=>false,reused={}}={}){
  const requests=[],fetches=[],waiting=new Map();
  class Image{
    set src(value){if(!value)return;requests.push(value);const finish=()=>{if(failImage(value)){this.onerror();return;}this.naturalWidth=1672;this.naturalHeight=941;this.onload();};if(holdImage(value))waiting.set(value,finish);else queueMicrotask(finish);}
  }
  const scope={window:{...reused},Image,AbortController,setTimeout,clearTimeout,fetch:async url=>{fetches.push(url);const book=url.split('/').at(-2);return {ok:!failMetadata(book),json:async()=>manifests[book]||fixture(book).manifest};}};
  vm.runInNewContext(loaderSource,scope);return {api:scope.window.LittleSequenceArtLoader,requests,fetches,waiting};
}
test('loaders are isolated per book and load only requested scenes, sharing repeated scene/head assets',async()=>{
  const hands=fixture().manifest;hands.pages[3]={scene:'scene-0'};
  const h=loaderHarness({manifests:{hands}}),loader=h.api.forBook('hands');assert.equal(loader,h.api.forBook('hands'));assert.equal(h.api.forBook('unknown'),null);
  assert.equal(loader.status(0),'idle');const first=loader.ensure(0);assert.equal(first,loader.ensure(0));assert.equal(loader.status(0),'loading');assert.equal(h.requests.length,0,'metadata precedes image selection');
  await first;assert.equal(loader.status(3),'ready');assert.equal(loader.status(2),'idle');assert.equal(loader.peek(0).assets['scene-0'].naturalWidth,1672);
  assert.equal(h.requests.length,2);assert.equal(h.fetches.length,1);
  const before=h.requests.length;await loader.ensure(3);assert.equal(h.requests.length,before);
  await loader.ensure(2);assert.equal(h.requests.length,before+1,'object closeup loads only its background');
  await loader.ensure(1,{cover:true});assert.ok(h.requests.includes('./art/flower/care-head.webp'));
  await h.api.forBook('rain').ensure(0);assert.equal(h.requests.filter(url=>url==='./art/family/child-head.webp').length,1,'heads are shared across books');
  assert.notEqual(loader.peek(0).assets['scene-0'],h.api.forBook('rain').peek(0).assets['scene-0'],'identically named scenes from different books never cross over');
  assert.equal(h.api.forBook('stone').status(0),'idle');
});
test('all scene layers must finish before ready, including when a prefetch becomes visible',async()=>{
  const h=loaderHarness({holdImage:url=>url.endsWith('child-head.webp')}),loader=h.api.forBook('hands');
  const prefetched=loader.ensure(0);await tick();assert.equal(loader.status(0),'loading');assert.equal(loader.peek(0),null);
  assert.ok(h.requests.includes('./art/sequence/hands/scene-0.webp'),'background already arrived');
  const visible=loader.ensure(0);assert.equal(loader.status(0),'loading');
  h.waiting.get('./art/family/child-head.webp')();await Promise.all([prefetched,visible]);assert.equal(loader.status(0),'ready');assert.ok(loader.peek(0).assets.childHead);
});
test('image errors remain errors until explicit retry and only failed layers are requested again',async()=>{
  let failing=true;const h=loaderHarness({failImage:url=>url.endsWith('child-head.webp')&&failing}),loader=h.api.forBook('hands');
  await assert.rejects(loader.ensure(0));assert.equal(loader.status(0),'error');assert.equal(loader.peek(0),null);
  const requests=h.requests.length;await assert.rejects(loader.ensure(0));assert.equal(h.requests.length,requests,'no automatic retry loop');
  failing=false;loader.retry();await loader.ensure(0);assert.equal(loader.status(0),'ready');
  assert.equal(h.requests.filter(url=>url.endsWith('scene-0.webp')).length,1);assert.equal(h.requests.filter(url=>url.endsWith('child-head.webp')).length,2);assert.equal(h.fetches.length,1);
});
test('failed metadata does not retry when another page opens and retries only on request',async()=>{
  let failing=true;const h=loaderHarness({failMetadata:()=>failing}),loader=h.api.forBook('stone');
  await assert.rejects(loader.ensure(0));await assert.rejects(loader.ensure(4));assert.equal(h.fetches.length,1);assert.equal(loader.status(3),'error');assert.equal(h.requests.length,0);
  failing=false;loader.retry();await loader.ensure(4);assert.equal(h.fetches.length,2);assert.equal(loader.status(4),'ready');
});
test('existing shared heads are reused and malformed asset paths cannot escape local artwork',async()=>{
  const shared={naturalWidth:1254,naturalHeight:1254},h=loaderHarness({reused:{LittleFamilyArtLoader:{peek:()=>({assets:{childHead:shared}})}}});
  await h.api.forBook('hands').ensure(0);assert.equal(h.requests.length,1);assert.equal(h.api.forBook('hands').peek(0).assets.childHead,shared);
  for(const url of ['https://example.com/face.webp','../../../private.webp','../../family/secret.webp','../scene.webp','face.webp?upload=true']){
    const m=fixture().manifest;m.heads.childHead.url=url;const unsafe=loaderHarness({manifests:{hands:m}});
    await assert.rejects(unsafe.api.forBook('hands').ensure(0),/文件名/);assert.equal(unsafe.requests.length,0);
  }
});

test('dedicated art panel uses its full width without a second text column, preserving photo/body proportions',()=>{
  const o=fixture(),photo={width:540,height:570},base={...o,width:500,height:700,avatars:{child:{image:photo,kind:'cutout',metrics}}};
  const legacy=canvasMock(),panel=canvasMock();assert.equal(draw(legacy.canvas,base),true);assert.equal(draw(panel.canvas,{...base,artPanel:true}),true);
  const a=legacy.images.at(-1),b=panel.images.at(-1),bodyA=legacy.images[0],bodyB=panel.images[0];
  assert.ok(Math.abs(a.matrix[0]/bodyA.matrix[0]-b.matrix[0]/bodyB.matrix[0])<1e-9,'only whole scene scale changes');
  const clip=panel.calls.find(c=>c[0]==='rect');assert.equal(clip[3],500);assert.ok(clip[4]>0&&clip[4]<=700,'natural art aspect is preserved, not stretched');
  for(const q of corners(b,metrics.bounds))assert.ok(q.x>=-1&&q.x<=500+1&&q.y>=-1&&q.y<=700+1,'complete real hair stays inside panel');
});
