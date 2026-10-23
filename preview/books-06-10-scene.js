// Complete precomposed characters only. No per-page portrait placement.
const canvas=document.getElementById('ff-art'),sheet=root.querySelector('.ff-book'),cache=new Map(),bundles=new Map();
let saved=null,members=[],books=[],stats=[],current=0,page=-1,refined=true,ticket=0,actors=[],composer,session,adultRole='mom',familyBundle;
const recipes=[['stand-wave','hands-flower-closed','hands-flower-open'],['stand-wave','hold-umbrella'],['stand-wave'],['stand-wave','reach-water'],['stand-wave','hands-flower-open']];
const assetPaths={garden:'./art/sequence/original-style-five/mountain-clear.png',boulder:'./art/sequence/stone-game/boulder.webp',closed:'./art/sequence/stone-game/mother-closed.webp',behind:'./art/sequence/stone-game/mother-behind.webp',empty:'./art/sequence/stone-game/mother-empty.webp',reveal:'./art/sequence/stone-game/mother-reveal.webp',rain:base+'rain-garden.png',umbrella:base+'umbrella-long.png',stem:'./art/sequence/first-five/flower-stem.png',petal:'./art/flower/petal.webp',room:'./art/sequence/sunrise/room.webp',night:'./art/sequence/sunrise/night.webp',red:'./art/sequence/sunrise/red-cloud.webp',glow:'./art/sequence/sunrise/glow.webp',sun:'./art/sequence/sunrise/sun.webp',moon:base+'night-garden.png',basin:base+'basin-still.png',ripples:base+'basin-ripples.png',tree:base+'bird-garden-small-tree.png',bird:base+'bird.png',quiet:base+'bird-quiet.png',cat:base+'cat.png',tricycle:base+'tricycle.png'};
assetPaths.pebble=base+'pebble.png';
assetPaths.darkCloud=base+'dark-cloud.png';
const files=[['garden','boulder','closed','behind','empty','reveal','pebble'],['garden','rain','umbrella','stem','petal','darkCloud'],['room','night','red','glow','sun'],['moon','basin','ripples'],['tree','bird','quiet','cat','tricycle']];
const image=url=>{if(!cache.has(url)){const p=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画暂时无法读取，请重新选择本书重试。'));im.src=url;});cache.set(url,p);p.catch(()=>cache.delete(url));}return cache.get(url);};
async function savedData(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result||null);};t.onabort=()=>{db.close();resolve(null);};};});}
async function loadBook(i){
  if(!bundles.has(i)){const p=Promise.all(files[i].map(async key=>[key,await image(assetPaths[key])])).then(pairs=>{const bundle={assets:Object.fromEntries(pairs)};return {enhanced:bundle,original:bundle};});bundles.set(i,p);p.catch(()=>bundles.delete(i));}return bundles.get(i);
}
function makePlacement(actor,x,ground,scale){return {x:Math.max(26-actor.bounds.left*scale,Math.min(974-actor.bounds.right*scale,x)),y:ground-actor.bounds.bottom*scale,scale};}
function draw(bundle,cover,summary){
  const p=cover?[0,6,5,0,1][current]:summary?books[current].pages.length-1:page,w=summary?330:1280,h=summary?290:cover?1030:1310;canvas.width=w;canvas.height=h;const c=canvas.getContext('2d'),a=bundle.assets;const camera=current===1&&p===3?{x:610,y:570,w:370,h:430}:current===4&&p===1?{x:20,y:150,w:450,h:600}:current===4&&p===4?{x:0,y:600,w:450,h:400}:current===4&&p===7?{x:350,y:180,w:650,h:820}:current===2&&[2,3,4].includes(p)?{x:420,y:40,w:500,h:800}:current===3&&p===3?{x:300,y:560,w:470,h:420}:{x:0,y:0,w:1000,h:1000};const scale=Math.min(w/camera.w,h/camera.h);c.fillStyle='#fbf6e9';c.fillRect(0,0,w,h);c.save();c.beginPath();c.rect(0,0,w,h);c.clip();c.translate((w-camera.w*scale)/2,(h-camera.h*scale)/2);c.scale(scale,scale);c.translate(-camera.x,-camera.y);
  const placements=[];let state={};
  const place=(id,x=350,ground=955,s=.64)=>{const actor=actors.find(t=>t.pose===id);if(!actor)throw Error('本页人物动作尚未准备。');const t=makePlacement(actor,x,ground,s);composer.place(c,actor,t);placements.push({...t,pose:id,bounds:actor.bounds,headScale:actor.headScale});return t;};
  const bg=im=>c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);
  const prop=(im,x,ground,width)=>{const height=width*im.height/im.width;c.drawImage(im,x,ground-height,width,height);return {x,y:ground-height,w:width,h:height};};
  const question=(x,y,label='?')=>{c.save();c.fillStyle='#fff8e4';c.beginPath();c.ellipse(x,y,label==='?'?37:85,40,0,0,Math.PI*2);c.fill();c.fillStyle='#41644d';c.font='bold '+(label==='?'?52:29)+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(label,x,y+3);c.restore();};
  const hands=im=>{c.fillStyle='#fff8e8';c.beginPath();c.roundRect(75,45,850,310,25);c.fill();c.drawImage(im,235,540,530,190,100,58,800,800*190/530);};
  function flower(x=790,ground=950,size=180){const height=size*1.5,cy=ground-height+height*.16;for(let i=0;i<11;i++){c.save();c.translate(x,cy);c.rotate(i*Math.PI*2/11);c.drawImage(a.petal,-size*.16,-size*.45,size*.32,size*.45);c.restore();}c.drawImage(a.stem,x-size/2,ground-height,size,height);return {x,y:cy,ground};}
  if(current===0){
    bg(a.garden);const phases=[null,'behind','behind','closed','empty','reveal','closed'],stage=phases[p];
    if(p===0){place('stand-wave',310,950,.62);prop(a.boulder,475,970,470);}
    else if(p===1){if(adultRole==='mom')prop(a.behind,280,965,550);else{hands(a.closed);question(500,550);}}
    else if(p===2){if(adultRole==='mom')prop(a.behind,540,960,440);place('hands-flower-closed',260,960,.56);question(350,345,'一 二 三');}
    else if(p>=3&&p<=5){hands(a[stage]);place(p===5?'hands-flower-open':'stand-wave',320,960,.57);if(p!==5)question(555,440);}
    else{if(adultRole==='mom')prop(a.closed,545,960,440);const t=place('hands-flower-closed',270,960,.56),u=1/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit,hx=t.x+(510-501)*u*t.scale,hy=t.y+(330-195)*u*t.scale,ww=65,hh=ww*a.pebble.height/a.pebble.width;c.drawImage(a.pebble,hx-ww/2,hy-hh/2,ww,hh);}
    state={kind:'stone',stage:p===0?'discovery':stage,adultRole,childVisible:p!==1,stoneVisible:[0,5,6].includes(p),firstHandEmpty:p===4,childHidesNext:p===6};
  }
  if(current===1){
    bg(p===0?a.garden:a.rain);if(p>=1)c.drawImage(a.darkCloud,305,0,695,695*a.darkCloud.height/a.darkCloud.width);const f=flower();let t=null,umbrella=null;
    if(p!==3){const x=p<5?240:p===5?390:530,actor=actors.find(t=>t.pose===(p<2?'stand-wave':'hold-umbrella'));t=makePlacement(actor,x,955,.58);if(p>=2){const grip={x:t.x+(803-501)/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit*t.scale,y:t.y+(425-225)/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit*t.scale};const us=540/a.umbrella.width,ux=grip.x-a.umbrella.width*.5*us,uy=grip.y-a.umbrella.height*.77*us;c.drawImage(a.umbrella,ux,uy,a.umbrella.width*us,a.umbrella.height*us);umbrella={x:ux,y:uy,width:540,grip};}composer.place(c,actor,t);placements.push({...t,pose:actor.pose,bounds:actor.bounds,headScale:actor.headScale});if(p===4)question(490,450);}
    state={kind:'rain',weather:p===0?'white-clouds':'raining',flower:f,umbrella,childMoves:p===5,sharedUmbrella:p>=6};
  }
  if(current===2){
    const phases=['night','night','red','red','glow','sun','sun'],sky=phases[p];c.drawImage(a[sky],470,70,430,650);bg(a.room);if(![2,3,4].includes(p))place('stand-wave',p===6?500:240,960,.64);if(p===1)question(420,320);state={kind:'sunrise',sky,sunVisible:p>=5,indoors:true,preparingToGoOut:p===6};
  }
  if(current===3){
    bg(a.moon);const bp={x:330,y:620,w:360,h:360};c.drawImage(a.basin,bp.x,bp.y,bp.w,bp.h);
    if(p>=2&&p<=5){c.save();c.beginPath();c.ellipse(bp.x+627/1254*bp.w,bp.y+437/1254*bp.h,516/1254*bp.w,137/1254*bp.h,0,0,Math.PI*2);c.clip();c.drawImage(a.ripples,bp.x,bp.y,bp.w,bp.h);c.restore();}
    if(p!==3){const id=p===2?'reach-water':'stand-wave';place(id,300,955,.64);if(p===1||p===4)question(550,370);}
    state={kind:'moon',basin:bp,water:p<2||p===6?'still':'ripples',reflectionVisible:p<2||p===6,handTouches:p===2,handWithdrawn:p>=5,skyMoonAlwaysPresent:true};
  }
  if(current===4){
    bg(a.tree);const trike=prop(a.tricycle,665,955,300),treeBird=p>=1&&p<=5,catVisible=p>=4;const birdFeet=p===7?{x:trike.x+935/1448*trike.w,y:trike.y+460/1086*trike.h}:{x:238,y:398};
    if(treeBird||p===7){const im=p>=3?a.quiet:a.bird,sz=125;c.drawImage(im,birdFeet.x-sz*.65,birdFeet.y-sz*.92,sz,sz);}
    if(catVisible)prop(a.cat,p===4?110:345,955,175);
    if(p!==1&&p!==4)place(p===2||p===5?'hands-flower-open':'stand-wave',p===7?500:580,960,.63);if([0,3,6].includes(p))question(720,315);
    state={kind:'bird',bird:treeBird?'tree':p===7?'tricycle':'hidden',birdSinging:p===1||p===2,cat:catVisible?'visible':'hidden',catCalls:p===3||p===4,treeBirdAbsent:p>=6,birdFeet};
  }
  c.restore();window.__sixProof.book=current+6;window.__sixProof.page=p;window.__sixProof.scene=state;window.__sixProof.placements=placements;window.__sixProof.window=session.snapshot();window.__sixProof.camera=camera;canvas.dataset.book=String(current+6);canvas.dataset.page=String(p+1);
}
