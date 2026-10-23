'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {draw,pagePlan,headGeometry}=require('../miniprogram/lib/intro-art.js');
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
test('automatic fit follows chin and scene angle for round/narrow faces and long/wide hairstyles',()=>{
  const size={width:1200,height:1500};
  for(const face of [{left:380,top:300,right:820,bottom:740},{left:450,top:280,right:750,bottom:780}]){
    const metrics={faceBounds:face,chin:{x:600,y:face.bottom-1}},target={width:300,height:310};
    for(const rotation of [-.24,0,.2]){
      const scene={neck:{x:500,y:560},face:target,rotation};let scale;
      for(const b of [{left:330,top:180,right:870,bottom:860},{left:200,top:10,right:1000,bottom:1490},{left:4,top:80,right:1196,bottom:1200}]){
        const g=headGeometry({metrics:{...metrics,bounds:b} },size,scene);
        assert.equal(g.x,scene.neck.x);assert.equal(g.y,scene.neck.y);assert.equal(g.rotation,rotation);
        assert.ok(Math.abs(metrics.chin.x*g.scale+g.dx)<1e-9&&Math.abs(metrics.chin.y*g.scale+g.dy)<1e-9);
        assert.ok((face.right-face.left)*g.scale<=target.width+1e-9);assert.ok((face.bottom-face.top)*g.scale<=target.height+1e-9);
        if(scale!==undefined)assert.equal(g.scale,scale,'hair length or width must not shrink the face');scale=g.scale;
      }
    }
  }
});
function mockCanvas(){
  const calls=[],images=[],stack=[];let matrix=[1,0,0,1,0,0];const c={};
  for(const method of ['setTransform','clearRect','fillRect','save','restore','translate','rotate','beginPath','rect','clip','ellipse','fill','drawImage'])c[method]=(...args)=>{
    args.filter(v=>typeof v==='number').forEach(v=>assert.ok(Number.isFinite(v)));calls.push([method,...args]);
    if(method==='setTransform')matrix=args.slice();if(method==='save')stack.push(matrix.slice());if(method==='restore'){assert.ok(stack.length);matrix=stack.pop();}
    if(method==='translate')matrix=multiply(matrix,[1,0,0,1,args[0],args[1]]);if(method==='rotate')matrix=multiply(matrix,[Math.cos(args[0]),Math.sin(args[0]),-Math.sin(args[0]),Math.cos(args[0]),0,0]);
    if(method==='drawImage')images.push({args,matrix:matrix.slice()});
  };
  return {canvas:{width:1,height:1,getContext:()=>c},calls,images,stack};
}

test('real-photo crown and chin fit the painted body across all intro cameras, without taller heads than its illustrated peer style',()=>{
  // A regular cropped child photo can have much more crown above its facial
  // landmarks than the round painted head. This used to pass all clipping tests.
  const photo={width:540,height:570},metrics={bounds:{left:85,top:15,right:465,bottom:565},faceBounds:{left:125,top:240,right:430,bottom:555},chin:{x:270,y:555}};
  for(let page=0;page<6;page++){
    const o=fixture(),normal=mockCanvas(),custom=mockCanvas();
    assert.equal(draw(normal.canvas,{...o,page,width:568,height:318}),true);
    assert.equal(draw(custom.canvas,{...o,page,width:568,height:318,avatars:{child:{image:photo,kind:'cutout',metrics}}}),true);
    const h=custom.images.at(-1),body=custom.images[0],defaultHead=normal.images.at(-1),defaultBody=normal.images[0];
    const photoScale=Math.hypot(h.matrix[0],h.matrix[1])*h.args[7]/photo.width/Math.hypot(body.matrix[0],body.matrix[1]);
    const artMetrics=o.manifest.head.metrics,paintedSize=o.assets.childHead.width;
    const paintedScale=Math.hypot(defaultHead.matrix[0],defaultHead.matrix[1])*defaultHead.args[7]/paintedSize/Math.hypot(defaultBody.matrix[0],defaultBody.matrix[1]);
    const realHeight=(metrics.chin.y-metrics.bounds.top)*photoScale,paintedHeight=(artMetrics.chin.y-artMetrics.bounds.top)*paintedScale;
    assert.ok(realHeight<=paintedHeight*1.02&&realHeight>=paintedHeight*.8,'the photograph belongs to the same head/body proportion, page '+page);
  }
});
function fixture(){
  const assets={childHead:{width:540,height:570,name:'defaultHead'}};for(const name of ['greeting','play','school'])assets[name]={width:1672,height:941,name};
  const metrics={bounds:{left:35,top:8,right:505,bottom:560},faceBounds:{left:125,top:180,right:415,bottom:490},chin:{x:270,y:489}};
  const scenes={};for(const name of ['greeting','play','school'])scenes[name]={neck:{x:510,y:490},face:{width:220,height:230},rotation:.05,photoPose:{neck:{x:505,y:485},face:{width:215,height:225},rotation:-.12}};
  return {book:'intro',width:836,height:470.5,assets,manifest:{width:1672,height:941,head:{asset:'childHead',metrics},scenes,crops:{1:{x:260,y:100,width:720,height:720},2:{x:80,y:50,width:970,height:850},5:{x:220,y:60,width:760,height:810}},cover:{x:200,y:0,width:760,height:941},hero:{x:230,y:0,width:800,height:941}}};
}
function corners(item,b){const {args:a,matrix:m}=item;return [[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>{const px=a[5]+x*a[7]/a[3],py=a[6]+y*a[8]/a[4];return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};});}
test('six pages use three gestures and different camera crops',()=>{
  assert.deepEqual(Array.from({length:6},(_,page)=>pagePlan(page).scene),['greeting','play','greeting','play','school','school']);
  const cameras=[];
  for(let page=0;page<6;page++){const o=fixture(),mock=mockCanvas();assert.equal(draw(mock.canvas,{...o,page}),true);assert.equal(mock.images[0].args[0],o.assets[pagePlan(page).scene]);assert.equal(mock.images[1].args[0],o.assets.childHead);cameras.push(mock.images[0].matrix);assert.equal(mock.stack.length,0);}
  assert.notDeepEqual(cameras[0],cameras[2]);assert.notDeepEqual(cameras[1],cameras[3]);assert.notDeepEqual(cameras[4],cameras[5]);
});
test('missing required layer leaves a complete fallback untouched instead of painting a headless body',()=>{
  for(const missing of ['greeting','play','school','childHead']){const o=fixture(),mock=mockCanvas();delete o.assets[missing];assert.equal(draw(mock.canvas,{...o,page:missing==='play'?1:missing==='school'?4:0}),false);assert.deepEqual(mock.calls,[]);assert.equal(mock.canvas.width,1);}
});
test('custom heads stay whole and clear of reading text or hero captions at every manual extreme',()=>{
  for(let page=0;page<6;page++)for(const mode of [{},{cover:true},{framing:'hero',cover:true}])for(const x of [-35,35])for(const y of [-35,35])for(const scale of [.6,1.6]){
    const o=fixture(),mock=mockCanvas(),photo={width:600,height:1100,name:'local-photo'};
    const b={left:20,top:6,right:580,bottom:1094},metrics={bounds:b,faceBounds:{left:170,top:120,right:430,bottom:480},chin:{x:300,y:479}};
    const width=mode.cover&&!mode.framing?120:350,height=mode.cover&&!mode.framing?168:190;
    assert.equal(draw(mock.canvas,{...o,...mode,page,width,height,avatars:{child:{image:photo,kind:'cutout',metrics,layout:{scale,x,y}}}}),true);
    const head=mock.images.find(item=>item.args[0]===photo);assert.deepEqual(head.args.slice(1,5),[0,0,600,1100]);assert.ok(Math.abs(head.args[7]/600-head.args[8]/1100)<1e-12);
    const minX=mode.framing==='hero'?width*.52:0,maxX=mode.cover?width:width*.65;
    for(const p of corners(head,b)){assert.ok(p.x>=minX-1e-8&&p.x<=maxX+1e-8);assert.ok(p.y>=-1e-8&&p.y<=height+1e-8);}
    assert.ok(head.matrix[0]>0,'the original face is not mirrored');assert.equal(mock.stack.length,0);
  }
});
test('a local head can render without downloading the unused default; raw legacy photos use the new default',()=>{
  const o=fixture(),mock=mockCanvas(),photo={width:540,height:570};delete o.assets.childHead;
  assert.equal(draw(mock.canvas,{...o,avatar:photo,avatarKind:'cutout',avatarMetrics:o.manifest.head.metrics}),true);
  const raw=fixture(),second=mockCanvas();assert.equal(draw(second.canvas,{...raw,avatar:photo,avatarKind:'raw'}),true);assert.equal(second.images[1].args[0],raw.assets.childHead);assert.equal(second.images.some(item=>item.args[0]===photo),false);
});
test('neck attachment and pose are scene-specific without changing the photograph',()=>{
  const o=fixture(),mock=mockCanvas(),photo={width:540,height:570};
  draw(mock.canvas,{...o,avatars:{child:{image:photo,kind:'cutout',metrics:o.manifest.head.metrics}}});
  const head=mock.images.at(-1),body=mock.images[0],chin=o.manifest.head.metrics.chin;
  const position=corners(head,{left:chin.x,top:chin.y,right:chin.x,bottom:chin.y})[0];
  const pose=o.manifest.scenes.greeting.photoPose;
  assert.ok(Math.abs(position.x-(pose.neck.x*body.matrix[0]+body.matrix[4]))<1e-8);
  assert.ok(Math.abs(position.y-(pose.neck.y*body.matrix[3]+body.matrix[5]))<1e-8);
  assert.ok(Math.abs(Math.atan2(head.matrix[1],head.matrix[0])-pose.rotation)<1e-8);
});
test('unsupported framings and invalid scene geometry safely defer to the established renderer',()=>{
  for(const changes of [{book:'family'},{framing:'avatar'},{framing:'character'}]){const mock=mockCanvas();assert.equal(draw(mock.canvas,{...fixture(),...changes}),false);assert.deepEqual(mock.calls,[]);}
  const o=fixture(),mock=mockCanvas();o.manifest.scenes.greeting.face.width=0;assert.equal(draw(mock.canvas,o),false);assert.deepEqual(mock.calls,[]);
});
test('intro loader requests only the visible scene, shares its head and retries only failed layers',async()=>{
  const source=fs.readFileSync(require.resolve('../preview/intro-art-loader.js'),'utf8'),requests=[],fetches=[];let fail=true;
  const manifest={scenes:{greeting:{},play:{},school:{}},head:{asset:'childHead',url:'../family/child-head.webp'}};
  class Image{set src(value){if(!value)return;requests.push(value);queueMicrotask(()=>{if(value.endsWith('play.webp')&&fail)this.onerror();else{this.naturalWidth=1672;this.naturalHeight=941;this.onload();}});}}
  const context={window:{},Image,AbortController,setTimeout,clearTimeout,fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>manifest};}};vm.runInNewContext(source,context);
  const loader=context.window.LittleIntroArtLoader;assert.equal(loader.status(0),'idle');const first=loader.ensure(0);assert.equal(first,loader.ensure(2));await first;
  assert.equal(requests.length,2);assert.ok(requests.some(url=>url.endsWith('/family/child-head.webp')));assert.equal(loader.status(4),'idle');
  await assert.rejects(loader.ensure(1));assert.equal(loader.status(1),'error');assert.equal(loader.status(0),'ready');fail=false;loader.retry();await loader.ensure(3);assert.equal(requests.filter(url=>url.includes('child-head')).length,1);assert.equal(fetches.length,1);
  await loader.ensure(4);assert.equal(loader.peek(5).assets.school.naturalWidth,1672);assert.equal(requests.filter(url=>url.endsWith('school.webp')).length,1);
  const shared={naturalWidth:1254,naturalHeight:1254},reused={...context,window:{LittleFamilyArtLoader:{peek:()=>({assets:{childHead:shared}})}}};vm.runInNewContext(source,reused);const before=requests.length;await reused.window.LittleIntroArtLoader.ensure(0);assert.equal(requests.length,before+1);assert.equal(reused.window.LittleIntroArtLoader.peek(0).assets.childHead,shared);
});
