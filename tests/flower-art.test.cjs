'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {draw,pagePlan}=require('../miniprogram/lib/flower-art.js');

const multiply=(a,b)=>[
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
];

function mockCanvas(){
  const calls=[],images=[],stack=[];
  let matrix=[1,0,0,1,0,0];
  const c={};
  for(const method of ['setTransform','clearRect','fillRect','save','restore','translate','rotate','beginPath','ellipse','fill','drawImage']){
    c[method]=(...args)=>{
      args.filter(arg=>typeof arg==='number').forEach(arg=>assert.ok(Number.isFinite(arg)));
      calls.push([method,...args]);
      if(method==='setTransform')matrix=args.slice();
      if(method==='save')stack.push(matrix.slice());
      if(method==='restore'){assert.ok(stack.length);matrix=stack.pop();}
      if(method==='translate')matrix=multiply(matrix,[1,0,0,1,args[0],args[1]]);
      if(method==='rotate')matrix=multiply(matrix,[Math.cos(args[0]),Math.sin(args[0]),-Math.sin(args[0]),Math.cos(args[0]),0,0]);
      if(method==='drawImage')images.push({args,matrix:matrix.slice()});
    };
  }
  return {canvas:{width:1,height:1,getContext:()=>c},calls,images,stack};
}

function fixture(){
  const assets={};
  ['care','wind','search'].forEach(name=>{
    assets[name]={width:1672,height:941,name};
    assets[name+'Head']={width:500,height:600,name:name+'Head'};
  });
  assets.petal={width:100,height:200,name:'petal'};
  const headMetrics={bounds:{left:50,top:25,right:450,bottom:580},faceBounds:{left:100,top:180,right:400,bottom:510},chin:{x:250,y:510}};
  const scenes={};
  ['care','wind','search'].forEach(name=>{scenes[name]={neck:{x:390,y:480},face:{width:180,height:200},rotation:0,headMetrics};});
  const manifest={width:1672,height:941,scenes,flower:{x:720,y:420,radius:27,petalWidth:44,petalHeight:97,
    flight:Array.from({length:11},(_,i)=>({x:750+i*17,y:130+i*29,rotation:i*.4})),
    settled:Array.from({length:11},(_,i)=>({x:600+i*26,y:790+i*3,rotation:i*.2}))},
    petal:{bounds:{left:10,top:10,right:90,bottom:190},tip:{x:50,y:185}},
    closeup:{x:490,y:400,width:490,height:450},cover:{x:0,y:0,width:1060,height:941}};
  return {book:'flower',width:836,height:470.5,assets,manifest};
}

test('the six pages keep an exact eleven-petal narrative',()=>{
  const expected=[[11,0,0],[11,0,0],[7,4,0],[3,4,4],[0,3,8],[0,0,11]];
  for(let page=0;page<6;page++){
    const plan=pagePlan(page);
    assert.deepEqual([plan.attached,plan.flying,plan.settled],expected[page]);
    assert.equal(plan.attached+plan.flying+plan.settled,11);
  }
});

test('each scene uses its matching expression head, with a separate flower close-up',()=>{
  for(let page=0;page<6;page++){
    const options=fixture(),mock=mockCanvas(),scene=pagePlan(page).scene;
    assert.equal(draw(mock.canvas,{...options,page}),true);
    assert.equal(mock.images[0].args[0],options.assets[scene]);
    const heads=mock.images.filter(image=>/Head$/.test(image.args[0].name));
    assert.equal(heads.length,page===1?0:1);
    if(heads.length)assert.equal(heads[0].args[0],options.assets[scene+'Head']);
    assert.equal(mock.stack.length,0);
    assert.deepEqual(mock.calls.at(-1),['setTransform',1,0,0,1,0,0]);
    if(page===1)assert.deepEqual(mock.images[0].args.slice(1,5),[490,400,490,450]);
  }
});

test('every wind page draws eleven raster petals at the correct attached, flying and settled positions',()=>{
  for(const page of [2,3,4]){
    const options=fixture(),mock=mockCanvas(),plan=pagePlan(page),f=options.manifest.flower;
    draw(mock.canvas,{...options,page});
    const petals=mock.images.filter(image=>image.args[0]===options.assets.petal);
    assert.equal(petals.length,11);
    petals.forEach((image,i)=>{
      const angle=i*Math.PI*2/11;
      const expected=i>=11-plan.attached ? {x:f.x+Math.sin(angle)*f.radius,y:f.y-Math.cos(angle)*f.radius}
        : i<plan.settled ? f.settled[i] : f.flight[i];
      const base=mock.images[0].matrix;
      assert.ok(Math.abs(image.matrix[4]-(expected.x*base[0]+base[4]))<1e-8);
      assert.ok(Math.abs(image.matrix[5]-(expected.y*base[3]+base[5]))<1e-8);
    });
  }
});

test('incomplete assets fail before touching the canvas, without exposing a headless person',()=>{
  for(const missing of ['care','careHead','wind','windHead','search','searchHead','petal','closeup']){
    const options=fixture(),mock=mockCanvas();
    const page=missing.startsWith('wind')||missing==='petal'?2:missing.startsWith('search')?5:missing==='closeup'?1:0;
    if(missing==='closeup')delete options.manifest.closeup;else delete options.assets[missing];
    assert.equal(draw(mock.canvas,{...options,page}),false,missing);
    assert.deepEqual(mock.calls,[]);
    assert.equal(mock.canvas.width,1);
  }
});

test('custom cutouts replace the example entirely and retain their full original source pixels',()=>{
  for(const page of [0,2,3,4,5]){
    const options=fixture(),mock=mockCanvas(),photo={width:720,height:960,name:'child-photo'};
    options.avatars={child:{image:photo,kind:'cutout',metrics:{bounds:{left:70,top:10,right:650,bottom:950},faceBounds:{left:180,top:220,right:540,bottom:630},chin:{x:360,y:630}}}};
    delete options.assets[pagePlan(page).scene+'Head'];
    assert.equal(draw(mock.canvas,{...options,page}),true,'a photo does not require the unused example head');
    const images=mock.images.filter(image=>image.args[0]===photo);
    assert.equal(images.length,1);
    assert.deepEqual(images[0].args.slice(1,5),[0,0,720,960]);
    assert.ok(Math.abs(images[0].args[7]/720-images[0].args[8]/960)<1e-12,'no stretching or reshaping');
    assert.ok(!mock.images.some(image=>/Head$/.test(image.args[0].name)));
  }
});

test('long hair does not reduce facial size, and old portraits without face landmarks still work',()=>{
  const options=fixture(),photo={width:500,height:900};
  const faceBounds={left:100,top:120,right:400,bottom:450},chin={x:250,y:450};
  const widths=[];
  for(const bottom of [460,890]){
    const mock=mockCanvas();
    draw(mock.canvas,{...options,avatars:{child:{image:photo,kind:'cutout',metrics:{bounds:{left:30,top:10,right:470,bottom},faceBounds,chin}}}});
    widths.push(mock.images.at(-1).args[7]);
  }
  assert.equal(widths[0],widths[1]);
  const old=mockCanvas();
  assert.equal(draw(old.canvas,{...options,avatar:photo,avatarKind:'cutout'}),true);
  assert.ok(old.images.at(-1).args[7]>0);
});

test('upright photographs follow each body collar and tilt without rotating the painted example again',()=>{
  const poses=[{neck:{x:370,y:460},face:{width:190,height:245},rotation:.14},
    {neck:{x:420,y:405},face:{width:165,height:225},rotation:-.18},
    {neck:{x:410,y:450},face:{width:220,height:280},rotation:.12}];
  const photo={width:500,height:600,name:'upright-photo'};
  for(const [index,page] of [0,2,5].entries()){
    const options=fixture(),scene=pagePlan(page).scene,metrics=options.manifest.scenes[scene].headMetrics;
    const before=mockCanvas();draw(before.canvas,{...options,page});
    options.manifest.scenes[scene].photoPose=poses[index];
    const example=mockCanvas();draw(example.canvas,{...options,page});
    assert.deepEqual(example.calls,before.calls,'the approved example already contains its own tilt');
    for(const legacy of [false,true]){
      const savedMetrics=legacy ? {bounds:metrics.bounds,chin:metrics.chin} : metrics;
      const actor={image:photo,kind:'cutout',metrics:savedMetrics,layout:{scale:1.1,x:0,y:0}};
      const snapshot=JSON.stringify(actor),mock=mockCanvas();
      draw(mock.canvas,{...options,page,avatars:{child:actor}});
      assert.equal(JSON.stringify(actor),snapshot,'rendering does not modify the stored photo or manual adjustments');
      const {args,matrix}=mock.images.at(-1),[,,,,,dx,dy,dw,dh]=args;
      const x=dx+metrics.chin.x*dw/photo.width,y=dy+metrics.chin.y*dh/photo.height;
      const collar=poses[index].neck,background=mock.images[0].matrix;
      assert.ok(Math.abs(matrix[0]*x+matrix[2]*y+matrix[4]-(background[0]*collar.x+background[4]))<1e-8,'chin is anchored to the physical collar even when the whole camera pulls back');
      assert.ok(Math.abs(matrix[1]*x+matrix[3]*y+matrix[5]-(background[3]*collar.y+background[5]))<1e-8);
      assert.ok(Math.abs(Math.atan2(matrix[1],matrix[0])-poses[index].rotation)<1e-10);
      assert.ok(Math.abs(dw/photo.width-dh/photo.height)<1e-12,'no face reshaping');
      assert.deepEqual(args.slice(1,5),[0,0,500,600],'the whole source hairstyle is kept');
      const shadow=mock.calls.find(call=>call[0]==='ellipse');
      assert.equal(shadow[1],collar.x,'contact shadow follows the corrected collar');
      assert.equal(shadow[5],poses[index].rotation);
    }
  }
});

test('manual offsets keep screen left/right and up/down semantics after automatic posing',()=>{
  const options=fixture(),photo={width:500,height:600};
  options.manifest.scenes.care.photoPose={neck:{x:380,y:475},face:{width:180,height:245},rotation:.25};
  const render=layout=>{
    const mock=mockCanvas();
    draw(mock.canvas,{...options,avatars:{child:{image:photo,kind:'cutout',metrics:options.manifest.scenes.care.headMetrics,layout}}});
    return mock.images.at(-1).matrix;
  };
  const initial=render({}),right=render({x:20}),down=render({y:20});
  assert.ok(Math.abs(right[4]-initial[4]-20*180/108*.5)<1e-9);
  assert.equal(right[5],initial[5]);
  assert.equal(down[4],initial[4]);
  assert.ok(Math.abs(down[5]-initial[5]-20*180/108*.5)<1e-9);
});

test('movement and scale remain continuous over the complete advertised slider ranges',()=>{
  const options=fixture(),photo={width:500,height:600};
  const render=layout=>{
    const mock=mockCanvas();
    draw(mock.canvas,{...options,avatars:{child:{image:photo,kind:'cutout',metrics:options.manifest.scenes.care.headMetrics,layout}}});
    return mock.images.at(-1);
  };
  const low=render({scale:1,x:-35,y:-35}),high=render({scale:1,x:35,y:35});
  assert.ok(Math.abs(high.matrix[4]-low.matrix[4]-70*180/108*.5)<1e-10);
  assert.ok(Math.abs(high.matrix[5]-low.matrix[5]-70*180/108*.5)<1e-10);
  assert.ok(Math.abs(render({scale:1.6}).args[7]/render({scale:.6}).args[7]-1.6/.6)<1e-10);
});

test('narrow covers include complete long hair at the extreme size and movement settings',()=>{
  const options=fixture(),photo={width:500,height:1000},bounds={left:5,top:5,right:495,bottom:995};
  options.manifest.scenes.care.photoPose={neck:{x:390,y:480},face:{width:180,height:245},rotation:.14};
  for(const x of [-35,35])for(const y of [-35,35]){
    const mock=mockCanvas();
    const metrics={bounds,faceBounds:{left:120,top:100,right:380,bottom:420},chin:{x:250,y:420}};
    draw(mock.canvas,{...options,cover:true,width:120,height:168,avatars:{child:{image:photo,kind:'cutout',metrics,layout:{scale:1.6,x,y}}}});
    const {args,matrix}=mock.images.at(-1),[, , ,sw,sh,dx,dy,dw,dh]=args;
    for(const [x,y] of [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]]){
      const px=dx+x*dw/sw,py=dy+y*dh/sh;
      const actualX=matrix[0]*px+matrix[2]*py+matrix[4],actualY=matrix[1]*px+matrix[3]*py+matrix[5];
      assert.ok(actualX>=0 && actualX<=120,`x=${actualX}`);
      assert.ok(actualY>=0 && actualY<=168,`y=${actualY}`);
    }
  }
});

test('wide screens extend blank paper and retain the full right-hand reading zone',()=>{
  const options=fixture(),mock=mockCanvas();
  draw(mock.canvas,{...options,width:1200,height:400,pixelRatio:2});
  assert.deepEqual([mock.canvas.width,mock.canvas.height],[2400,800]);
  const background=mock.images[0],rightOfArtwork=background.matrix[4]+1672*.67*background.matrix[0];
  assert.ok(rightOfArtwork<=2400*.67);
});

test('extreme portrait placement keeps the whole hairstyle on screen and outside the reading area',()=>{
  const options=fixture(),photo={width:1000,height:1400},bounds={left:5,top:5,right:995,bottom:1395};
  options.manifest.scenes.care.photoPose={neck:{x:390,y:480},face:{width:180,height:245},rotation:.14};
  const metrics={bounds,faceBounds:{left:360,top:300,right:640,bottom:640},chin:{x:500,y:640}};
  for(const x of [-35,35])for(const y of [-35,35]){
    const mock=mockCanvas();
    draw(mock.canvas,{...options,width:568,height:230,avatars:{child:{image:photo,kind:'cutout',metrics,layout:{scale:1.6,x,y}}}});
    const {args,matrix}=mock.images.at(-1),[, , ,sw,sh,dx,dy,dw,dh]=args;
    for(const [x,y] of [[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]]){
      const px=dx+x*dw/sw,py=dy+y*dh/sh;
      const actualX=matrix[0]*px+matrix[2]*py+matrix[4],actualY=matrix[1]*px+matrix[3]*py+matrix[5];
      assert.ok(actualX>=0 && actualX<=568*.65,`x=${actualX} stays in the picture`);
      assert.ok(actualY>=0 && actualY<=230,`y=${actualY} preserves crown and hair ends`);
    }
  }
});

test('unrelated books, unavailable contexts and legacy cropped photos retain the old renderer',()=>{
  const options=fixture();
  for(const custom of [{book:'family'},{framing:'avatar'},{avatar:{width:100,height:100},avatarKind:'ellipse'}]){
    const mock=mockCanvas();assert.equal(draw(mock.canvas,{...options,...custom}),false);assert.deepEqual(mock.calls,[]);
  }
  assert.equal(draw(null,options),false);
  assert.equal(draw({},options),false);
  assert.equal(draw({getContext:()=>null},options),false);
});
