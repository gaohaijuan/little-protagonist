// Books 16–20: registered complete actors and independent, fixed-size story props.
const canvas=document.getElementById('ff-art'),sheet=root.querySelector('.ff-book'),cache=new Map(),bundles=new Map(),adultCache=new Map();
const metadata=/* SIXTEEN_ASSETS */;
let saved=null,members=[],books=[],stats=[],current=0,page=-1,refined=true,ticket=0,actors=[],composer,session,adultRole='dad',familyBundle;
const recipes=[['sit-read'],['carry-play','crouch-palm'],['stand-wave','barefoot-stand','carry-play'],['drink-water','water-pour','barefoot-stand'],['sit-draw','hands-flower-open','crouch-palm']];
const assetPaths={garden:base+'garden-nook.png',room:'./art/sequence/books-11-15/playroom-clear.png',cat:'./art/sequence/books-06-10/cat.png',sleep:base+'cat-sleep-v2.png',book:base+'open-book.png',rabbit:base+'rabbit.png',rabbitLow:base+'rabbit-low.png',leaf:base+'cabbage-leaf.png',hutch:base+'rabbit-hutch.png',melon:base+'melon.png',shoes:base+'adult-shoes.png',master:'./art/family/child-body.webp',bag:base+'satchel.png',plant:base+'plant-stool.png',can:base+'watering-can.png',cup:base+'water-cup.png',patio:base+'after-rain-patio.png',paper:base+'red-paper.png',pencil:base+'pencil.png',pebble:'./art/sequence/books-06-10/pebble.png'};
const keyNames={garden:'garden-nook',sleep:'cat-sleep-v2',book:'open-book',rabbitLow:'rabbit-low',leaf:'cabbage-leaf',hutch:'rabbit-hutch',shoes:'adult-shoes',bag:'satchel',plant:'plant-stool',can:'watering-can',cup:'water-cup',patio:'after-rain-patio',paper:'red-paper'};
const files=[['room','cat','sleep','book'],['garden','rabbit','rabbitLow','leaf','hutch','melon'],['room','shoes','master','bag'],['garden','plant','can','cup'],['patio','paper','pencil','pebble']];
const image=url=>{if(!cache.has(url)){const p=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画暂时无法读取，请重新选择本书重试。'));im.src=url;});cache.set(url,p);p.catch(()=>cache.delete(url));}return cache.get(url);};
async function savedData(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result||null);};t.onabort=()=>{db.close();resolve(null);};};});}
async function loadBook(i){if(!bundles.has(i)){const p=Promise.all(files[i].map(async key=>[key,await image(assetPaths[key])])).then(pairs=>{const bundle={assets:Object.fromEntries(pairs)};return {enhanced:bundle,original:bundle};});bundles.set(i,p);p.catch(()=>bundles.delete(i));}return bundles.get(i);}
function adultSprite(role){
 if(adultCache.has(role))return adultCache.get(role);const m=familyBundle.manifest,b=m.body[role],h=m.heads[role],br=b.sourceRect,hr=h.sourceRect,u=1.45,metric=h.metrics,scale=b.face.height/(metric.faceBounds.bottom-metric.faceBounds.top)*u;
 const left=Math.min((b.bounds.left-b.collar.x)*u,(metric.bounds.left-metric.chin.x)*scale),right=Math.max((b.bounds.right-b.collar.x)*u,(metric.bounds.right-metric.chin.x)*scale),top=Math.min((b.bounds.top-b.collar.y)*u,(metric.bounds.top-metric.chin.y)*scale),bottom=Math.max((b.bounds.bottom-b.collar.y)*u,(metric.bounds.bottom-metric.chin.y)*scale),c=document.createElement('canvas');c.width=Math.ceil(right-left)+20;c.height=Math.ceil(bottom-top)+20;const g=c.getContext('2d'),at={x:10-left,y:10-top};g.drawImage(familyBundle.assets[b.asset],br.x,br.y,br.width,br.height,at.x-b.collar.x*u,at.y-b.collar.y*u,br.width*u,br.height*u);g.drawImage(familyBundle.assets[h.asset],hr.x,hr.y,hr.width,hr.height,at.x-metric.chin.x*scale,at.y-metric.chin.y*scale,hr.width*scale,hr.height*scale);adultCache.set(role,c);return c;
}
function draw(bundle,cover,summary){
 const p=cover?[1,4,3,1,7][current]:summary?books[current].pages.length-1:page,w=summary?330:1280,h=summary?290:cover?1030:1310,a=bundle.assets;canvas.width=w;canvas.height=h;
 const detail=current===0&&p===5||current===1&&[2,3,6].includes(p)||current===2&&[2,5].includes(p)||current===3&&[3,4,5].includes(p)||current===4&&p===6;
 const camera=current===0?(p===5?{x:665,y:720,w:280,h:280}:{x:180,y:200,w:800,h:800}):current===1&&[2,3].includes(p)?{x:p===2?475:600,y:800,w:150,h:150}:current===1&&p===4?{x:300,y:350,w:700,h:650}:current===1&&p===5?{x:540,y:560,w:460,h:440}:current===1&&p===6?{x:590,y:620,w:380,h:380}:current===2&&p===2?{x:235,y:600,w:620,h:620}:current===2&&p===5?{x:290,y:600,w:490,h:500}:current===3&&p===3?{x:420,y:693,w:300,h:307}:current===3&&p===4?{x:600,y:650,w:350,h:350}:current===3&&p===5?{x:420,y:640,w:360,h:360}:current===4&&p===6?{x:365,y:750,w:250,h:250}:current===4&&[0,4,5,7].includes(p)?{x:180,y:200,w:800,h:800}:{x:0,y:0,w:1000,h:1000};
 const c=canvas.getContext('2d'),zoom=Math.min(w/camera.w,h/camera.h);c.fillStyle='#fbf6e9';c.fillRect(0,0,w,h);c.save();c.beginPath();c.rect(0,0,w,h);c.clip();c.translate((w-camera.w*zoom)/2,(h-camera.h*zoom)/2);c.scale(zoom,zoom);c.translate(-camera.x,-camera.y);const placements=[];let state={};const u=1/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit;
 const bg=im=>{c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);if(camera.y+camera.h>1000)c.drawImage(im,0,im.height*.9,im.width,im.height*.1,0,1000,1000,camera.y+camera.h-1000);},bounds=key=>metadata[keyNames[key]||key].bounds;
 function sprite(key,x,ground,width){const im=a[key],b=bounds(key),s=width/(b[2]-b[0]),height=(b[3]-b[1])*s,y=ground-height;c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],x,y,width,height);return {x,y,w:width,h:height,s,source:b};}
 function anchored(key,anchor,target,width,rotation=0,eaten=0){const im=a[key],b=bounds(key),s=width/(b[2]-b[0]);c.save();c.translate(target.x,target.y);c.rotate(rotation);if(eaten){c.scale(s,s);const cut=(b[2]-b[0])*eaten+b[0]-anchor.x;c.beginPath();c.moveTo(cut,b[1]-anchor.y);for(let y=b[1]-anchor.y;y<=b[3]-anchor.y;y+=50)c.lineTo(cut+(Math.floor(y/50)%2?22:-22),y);c.lineTo(b[2]-anchor.x,b[3]-anchor.y);c.lineTo(b[2]-anchor.x,b[1]-anchor.y);c.closePath();c.clip();c.drawImage(im,-anchor.x,-anchor.y);}else{c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],(b[0]-anchor.x)*s,(b[1]-anchor.y)*s,width,(b[3]-b[1])*s);}c.restore();return {x:target.x,y:target.y,w:width,rotation,eaten,s};}
 function place(id,x,ground,scale=.64,rotation=0){const actor=actors.find(t=>t.pose===id);if(!actor)throw Error('本页人物动作尚未准备。');const pose=poseLibrary.poses[id],t={x,y:ground-(pose.bounds.bottom-pose.collar.y)*u*scale,scale,rotation};composer.place(c,actor,t);placements.push({...t,pose:id,bounds:actor.bounds,headScale:actor.headScale});return {...t,pose};}
 const point=(t,key)=>{const p=t.pose.attachments[key],dx=(p.x-t.pose.collar.x)*u*t.scale,dy=(p.y-t.pose.collar.y)*u*t.scale,cs=Math.cos(t.rotation),sn=Math.sin(t.rotation);return {x:t.x+dx*cs-dy*sn,y:t.y+dx*sn+dy*cs};};
 const adult=(x,ground,height=760)=>{const im=adultSprite(adultRole),width=height*im.width/im.height;c.drawImage(im,x-width/2,ground-height,width,height);};
 function mark(x,y,label='?'){c.save();c.font='bold 45px serif';c.textAlign='center';c.lineWidth=8;c.strokeStyle='#fff6df';c.strokeText(label,x,y);c.fillStyle='#47694e';c.fillText(label,x,y);c.restore();}
 function water(points,width=4){c.save();c.lineCap='round';c.setLineDash([8,6]);for(const [color,k]of [['#71aab699',1],['#e1f8f5cc',.5]]){c.strokeStyle=color;c.lineWidth=width*k;c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length-1;i++){const next=points[i+1];c.quadraticCurveTo(points[i][0],points[i][1],(points[i][0]+next[0])/2,(points[i][1]+next[1])/2);}const last=points.at(-1);c.lineTo(last[0],last[1]);c.stroke();}c.restore();}
 function breeze(y=600){c.save();c.strokeStyle='#87a09b77';c.lineWidth=4;for(let i=0;i<3;i++){c.beginPath();c.moveTo(60+i*20,y+i*26);c.bezierCurveTo(220,y-40+i*26,260,y+40+i*26,380,y+i*26);c.stroke();}c.restore();}
 if(current===0){
  bg(a.room);const t=place('sit-read',455,955),lap=point(t,'lap'),off=p>=3,book=sprite('book',off?690:lap.x-115,off?950:lap.y+10,230);let cat=null;
  if(p===1||p===2)cat=sprite('cat',book.x+8,book.y+book.h-5,190);
  if(p===3)cat=sprite('cat',450,950,190);
  if(p===4)cat=sprite('cat',book.x+10,book.y+book.h-5,190);
  if(p>=5)cat=sprite('sleep',book.x,book.y+book.h-5,210);
  if(p===2)mark(625,680);if(p===4)mark(640,735);state={kind:'cat-book',book,cat,bookMoved:off,catOnBook:[1,2,4,5,6].includes(p),asleep:p>=5,moonOnBook:true,catCount:p===0?0:1};
 }
 if(current===1){
  bg(a.garden);const hutch=sprite('hutch',550,950,400);let rabbit=null,leaf=null,t=null;const rabbitX=p<=1?720:p===2?500:p===3?625:p===4?590:670;
  const low=p>=2;const rabbitKey=low?'rabbitLow':'rabbit';rabbit=sprite(rabbitKey,rabbitX,950,low?190:170);const rb=bounds(rabbitKey),mouth={x:rabbit.x+((low?1330:1225)-rb[0])*rabbit.s,y:rabbit.y+((low?680:510)-rb[1])*rabbit.s};
  if(p===0){t=place('carry-play',300,955);leaf=anchored('leaf',{x:1580,y:720},point(t,'leftPalm'),180);}
  else if(p===1){t=place('carry-play',300,955);leaf=sprite('leaf',400,950,180);}
  else{leaf=anchored('leaf',{x:1580,y:720},mouth,180,0,p>=6?.55:0);if(p===4)t=place('crouch-palm',345,955);}
  if(p===7){t=place('carry-play',300,955);anchored('melon',{x:700,y:1010},point(t,'leftPalm'),100);}
  if(p===2||p===3)mark(p===2?755:850,900);state={kind:'rabbit-leaf',hutch,rabbit,leaf,mouth,rabbitCount:1,mouthContact:p>=2,hiddenByCloseView:p===2||p===3,revealed:p>=4,eaten:p>=6?.55:0,melon:p===7};
 }
 if(current===2){
  bg(a.room);let shoes=null;const barefoot=p===0||p===1||p===3||p===4||p===5,x=p===5?630:p===4?520:p===6?620:p===7?660:p===2?300:470;
  if(p===7)adult(300,950,760);
  const t=place(barefoot?'barefoot-stand':p>=6?'carry-play':'stand-wave',x,950);
  if(p<=5)shoes=sprite('shoes',p<2?690:p===2?590:330,980,250);
  if(p>=6){const palm=point(t,'leftPalm');anchored('bag',{x:530,y:220},{x:palm.x,y:palm.y+5},95);}
  if(p===2){c.save();c.strokeStyle='#7f6844';c.lineWidth=3;c.beginPath();c.moveTo(590,985);c.lineTo(840,985);c.moveTo(235,985);c.lineTo(410,985);c.stroke();c.restore();}
  if(p===5)mark(740,880,'!');state={kind:'big-shoes',shoes,adultRole,barefoot,adultShoeWidth:250,childX:x,wearingBig:p===3,steppingOut:p===4,feetOut:p===5,ownShoes:p>=6,bag:p>=6,ahead:p===7};
 }
 if(current===3){
  bg(a.garden);const plant=sprite('plant',600,950,280),drain={x:plant.x+(315-174)*plant.s,y:plant.y+(750-71)*plant.s},soil={x:plant.x+(450-174)*plant.s,y:plant.y+(490-71)*plant.s};let t,can=null,cup=null,spout=null;
  if(p===0){t=place('drink-water',425,950);cup=anchored('cup',{x:500,y:980},point(t,'cup'),90);}
  else if(p<=2){t=place('water-pour',425,950);const grip=point(t,'grip');can=anchored('can',{x:430,y:250},grip,160,.07);const dx=(1400-430)*can.s,dy=(380-250)*can.s;spout={x:grip.x+dx*Math.cos(.07)-dy*Math.sin(.07),y:grip.y+dx*Math.sin(.07)+dy*Math.cos(.07)};water([[spout.x,spout.y],[soil.x,soil.y]],p===1?3:5);}
  else{t=place('barefoot-stand',425,950);can=sprite('can',145,955,160);}
  const toe=point({...t,pose:poseLibrary.poses['barefoot-stand']},'rightFoot'),route=[[drain.x,drain.y],[drain.x-10,drain.y+24],[607,795],[607,935],[toe.x,toe.y+9]];
  if(p>=3){water(route,5);c.save();c.fillStyle='#8ec0c477';c.beginPath();c.ellipse(555,943,75,10,0,0,Math.PI*2);c.fill();c.strokeStyle='#d3eeee';c.lineWidth=2;c.beginPath();c.ellipse(toe.x,toe.y+8,30,7,0,0,Math.PI*2);c.stroke();c.restore();}
  if(p===3)mark(715,885);state={kind:'flower-water',plant,drain,soil,can,cup,spout,route,toe,drinking:p===0,pouring:p===1||p===2,wetFoot:p>=3,waterFromDrain:p>=3,stoppedPouring:p>=3};
 }
 if(current===4){
  bg(a.patio);let t;const paperCenter=p===1?{x:650,y:600}:p===2?{x:150,y:670}:p===3?{x:850,y:650}:{x:490,y:916},angle=p===1?-.18:p===2?.15:p===3?-.25:0,grounded=p===0||p>=4;
  if(p===0||p===7)t=place('sit-draw',450,960);else if(p===4||p===5)t=place('crouch-palm',590,955);else if(p===6)t={x:800};else t=place('hands-flower-open',p===2?330:p===3?630:450,955);
  const b=bounds('paper'),paperWidth=220,paperHeight=220*(b[3]-b[1])/(b[2]-b[0]);c.save();c.translate(paperCenter.x,paperCenter.y);c.rotate(angle);if(grounded)c.scale(1,.62);sprite('paper',-paperWidth/2,paperHeight/2,paperWidth);c.strokeStyle='#f8e8b7';c.lineWidth=3;c.lineCap='round';c.beginPath();c.arc(0,-8,43,Math.PI,0);if(p===7){c.moveTo(-43,-8);c.quadraticCurveTo(-21,-20,0,-8);c.quadraticCurveTo(21,-20,43,-8);c.moveTo(0,-8);c.lineTo(0,35);c.quadraticCurveTo(-14,52,-20,32);}c.stroke();c.restore();
  let stone=null;if(p>=5)stone=sprite('pebble',392,940,55);
  if(p===0||p===7){const grip=point(t,'pencil');anchored('pencil',{x:1500,y:400},grip,115,-.9);}else sprite('pencil',470,980,115);
  if(p>=1&&p<=3||p===6)breeze(p===6?790:580);state={kind:'paper-wind',paper:{cx:paperCenter.x,cy:paperCenter.y,w:220,h:paperHeight*(grounded?.62:1),surfaceProjectionY:grounded?.62:1,angle},stone,wind:p>=1&&p<=3||p===6,grounded,anchored:p>=5,direction:p===2?'left':p===3?'right':null,drawing:p===0||p===7,completeUmbrella:p===7,childX:t.x};
 }
 c.restore();window.__sixteenProof.book=current+16;window.__sixteenProof.page=p;window.__sixteenProof.scene=state;window.__sixteenProof.placements=placements;window.__sixteenProof.window=session.snapshot();window.__sixteenProof.camera=camera;window.__sixteenProof.detail=detail;canvas.dataset.book=String(current+16);canvas.dataset.page=String(p+1);
}
