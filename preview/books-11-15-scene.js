// Every scene places complete actors. Attachment points belong to registered poses.
const canvas=document.getElementById('ff-art'),sheet=root.querySelector('.ff-book'),cache=new Map(),bundles=new Map(),adultCache=new Map();
const metadata=/* ELEVEN_ASSETS */;
let saved=null,members=[],books=[],stats=[],current=0,page=-1,refined=true,ticket=0,actors=[],composer,session,adultRole='dad',familyBundle;
const recipes=[['push-cart','carry-play'],['crouch-palm'],['stand-wave'],['carry-play','push-cart'],['carry-play','push-cart']];
const assetPaths={garden:base+'play-courtyard.png',room:base+'playroom-clear.png',soil:base+'soil-garden.png',wagon:base+'wagon.png',garage:base+'garage.png',mound:base+'mound.png',bug:base+'bug.png',sapling:base+'sapling.png',stone:base+'step-stone.png',red:base+'red-ball.png',yellow:base+'yellow-ball.png',dog:base+'dog-return.png',lookback:base+'dog-lookback.png',search:base+'dog-search.png',pebble:'./art/sequence/books-06-10/pebble.png'};
const keyNames={room:'playroom-clear',soil:'soil-garden',garden:'play-courtyard',stone:'step-stone',red:'red-ball',yellow:'yellow-ball',dog:'dog-return',lookback:'dog-lookback',search:'dog-search'};
const files=[['room','wagon','garage','pebble'],['soil','mound','bug'],['garden','sapling','stone'],['garden','wagon','red','yellow'],['garden','red','dog','lookback','search']];
const image=url=>{if(!cache.has(url)){const p=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画暂时无法读取，请重新选择本书重试。'));im.src=url;});cache.set(url,p);p.catch(()=>cache.delete(url));}return cache.get(url);};
async function savedData(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result||null);};t.onabort=()=>{db.close();resolve(null);};};});}
async function loadBook(i){if(!bundles.has(i)){const p=Promise.all(files[i].map(async key=>[key,await image(assetPaths[key])])).then(pairs=>{const bundle={assets:Object.fromEntries(pairs)};return {enhanced:bundle,original:bundle};});bundles.set(i,p);p.catch(()=>bundles.delete(i));}return bundles.get(i);}
function adultSprite(role){
  if(adultCache.has(role))return adultCache.get(role);const m=familyBundle.manifest,b=m.body[role],h=m.heads[role],br=b.sourceRect,hr=h.sourceRect,u=1.45,metric=h.metrics,scale=b.face.height/(metric.faceBounds.bottom-metric.faceBounds.top)*u;
  const left=Math.min((b.bounds.left-b.collar.x)*u,(metric.bounds.left-metric.chin.x)*scale),right=Math.max((b.bounds.right-b.collar.x)*u,(metric.bounds.right-metric.chin.x)*scale),top=Math.min((b.bounds.top-b.collar.y)*u,(metric.bounds.top-metric.chin.y)*scale),bottom=Math.max((b.bounds.bottom-b.collar.y)*u,(metric.bounds.bottom-metric.chin.y)*scale),c=document.createElement('canvas');
  c.width=Math.ceil(right-left)+20;c.height=Math.ceil(bottom-top)+20;const g=c.getContext('2d'),at={x:10-left,y:10-top};g.drawImage(familyBundle.assets[b.asset],br.x,br.y,br.width,br.height,at.x-b.collar.x*u,at.y-b.collar.y*u,br.width*u,br.height*u);g.drawImage(familyBundle.assets[h.asset],hr.x,hr.y,hr.width,hr.height,at.x-metric.chin.x*scale,at.y-metric.chin.y*scale,hr.width*scale,hr.height*scale);adultCache.set(role,c);return c;
}
function draw(bundle,cover,summary){
  const p=cover?[3,2,2,5,0][current]:summary?books[current].pages.length-1:page,w=summary?330:1280,h=summary?290:cover?1030:1310,a=bundle.assets;cvsSize();
  function cvsSize(){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d'),camera=current===0&&p===0?{x:120,y:610,w:590,h:370}:current===0&&p===5?{x:280,y:550,w:670,h:430}:current===1&&p===0?{x:150,y:710,w:470,h:280}:current===1&&p===1?{x:300,y:800,w:230,h:170}:current===1&&[3,4].includes(p)?{x:335,y:795,w:250,h:210}:current===1&&p===6?{x:280,y:820,w:250,h:180}:current===4&&p===4?{x:80,y:270,w:600,h:720}:{x:0,y:0,w:1000,h:1000};
  const zoom=Math.min(w/camera.w,h/camera.h);c.fillStyle='#fbf6e9';c.fillRect(0,0,w,h);c.save();c.beginPath();c.rect(0,0,w,h);c.clip();c.translate((w-camera.w*zoom)/2,(h-camera.h*zoom)/2);c.scale(zoom,zoom);c.translate(-camera.x,-camera.y);
  const placements=[];let state={};const u=1/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit;
  const bg=im=>c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);
  const bounds=key=>metadata[keyNames[key]||key]?.bounds||(key==='pebble'?[368,300,1165,775]:null);
  function sprite(key,x,ground,width){const im=a[key],b=bounds(key),bw=b[2]-b[0],bh=b[3]-b[1],s=width/bw,y=ground-bh*s;c.drawImage(im,b[0],b[1],bw,bh,x,y,width,bh*s);return {x,y,w:width,h:bh*s,s,source:b};}
  function place(id,x,ground,scale){const actor=actors.find(t=>t.pose===id);if(!actor)throw Error('本页人物动作尚未准备。');const pose=poseLibrary.poses[id],foot=(pose.bounds.bottom-pose.collar.y)*u,t={x,y:ground-foot*scale,scale};composer.place(c,actor,t);placements.push({...t,pose:id,bounds:actor.bounds,headScale:actor.headScale});return {...t,actor,pose};}
  const point=(t,key)=>{const p=t.pose.attachments[key];return {x:t.x+(p.x-t.pose.collar.x)*u*t.scale,y:t.y+(p.y-t.pose.collar.y)*u*t.scale};};
  const adult=(x,ground,height=740)=>{const im=adultSprite(adultRole),width=height*im.width/im.height;c.drawImage(im,x-width/2,ground-height,width,height);};
  function shadow(x,y,rx){c.save();c.fillStyle='#596b4030';c.beginPath();c.ellipse(x,y,rx,11,0,0,Math.PI*2);c.fill();c.restore();}
  function mark(x,y,label='?'){c.save();c.font='bold 48px serif';c.textAlign='center';c.lineWidth=8;c.strokeStyle='#fff5d9';c.strokeText(label,x,y);c.fillStyle='#526e4d';c.fillText(label,x,y);c.restore();}
  const ball=(color,x,y)=>sprite(color,x-34,y+34,68);
  const wagon=(x,ground=920)=>sprite('wagon',x,ground,320);
  const cargo=(v)=>sprite('pebble',v.x+80,v.y+116,240);
  const wagonBalls=v=>{ball('red',v.x+195,v.y+111);ball('yellow',v.x+261,v.y+106);};
  if(current===0){
    bg(a.room);const gs=.49,gx=300-73*gs,gy=920-840*gs,lintel=gy+370*gs,garage={x:gx,y:gy,scale:gs,lintel,floor:920};c.drawImage(a.garage,gx,gy,a.garage.width*gs,a.garage.height*gs);
    if(p===1)adult(200,930,740);
    const wx=p===0?200:p===2?205:p===7?490:305;let cart=wagon(wx),rock=null;
    if(p!==6&&p!==7)rock=cargo(cart);
    if(p===2||p===3||p===4){const t=place('push-cart',wx-27,934,.5);const grip=point(t,'grip');state.grip=grip;}
    if(p===5){mark(630,670,'!');}
    if(p===6){const t=place('carry-play',235,950,.5),pal=point(t,'leftPalm');rock=sprite('pebble',pal.x-85,pal.y+100,240);}
    if(p===7){rock=sprite('pebble',110,965,240);place('push-cart',430,955,.5); // Restore front wooden post over the cart inside the opening.
      c.drawImage(a.garage,1080,139,399,768,gx+1080*gs,gy+139*gs,399*gs,768*gs);
    }
    state={...state,kind:'wagon-door',garage,cart,rock,loaded:p<6,inside:p===7,emptyTop:cart.y,loadedTop:cart.y+116-240*475/797,blocked:[3,4,5].includes(p),adultRole};
  }
  if(current===1){
    bg(a.soil);const mound=sprite('mound',240,950,270);let palm=null,t=null;
    if(p>=2){t=place('crouch-palm',550,960,.67);palm=point(t,'palm');}
    let bug;
    if(p===0)bug=null;
    else if(p===1)bug=sprite('bug',mound.x+115,mound.y+13,42);
    else if(p===2||p===6)bug=sprite('bug',p===6?345:395,945,42);
    else bug=sprite('bug',palm.x+(p===4?8:-20),palm.y-5,42);
    if(p===4||p===5){c.save();c.strokeStyle='#a67e43';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.arc(palm.x-20+i*25,palm.y-36,10,3.7,5.7);c.stroke();}c.restore();}
    state={kind:'bug-hand',mound,bug,palm,bugOnHand:p>=3&&p<=5,handLow:p===6,realExpressionUnchanged:true};
  }
  if(current===2){
    bg(a.garden);const ground=950,soilLine=1330,treeScale=650/(soilLine-11),treeX=35,treeY=ground-soilLine*treeScale;c.drawImage(a.sapling,treeX,treeY,a.sapling.width*treeScale,a.sapling.height*treeScale);
    // Foreground soil covers the root layer while preserving the tree's fixed scale.
    c.drawImage(a.garden,0,a.garden.height*.95,a.garden.width,a.garden.height*.05,0,950,1000,50);
    adult(825,950,710);const stone=sprite('stone',560,950,300),top=stone.y+(450-261)*stone.s,onStone=p===2||p===3;const t=place('stand-wave',onStone?660:415,onStone?top:950,.64);
    if(p===4||p===5)mark(700,570);state={kind:'height',adultRole,treeHeight:650,treeTop:300,treeScale,childScale:t.scale,stone,platform:top,onStone,ground,childHeadTop:t.y-300*t.scale,childCollar:t.y};
  }
  if(current===3){
    bg(a.garden);let t=null,red=null,yellow=null,cart=null;
    if(p<5){t=place('carry-play',p===3||p===4?610:350,955,.64);const l=point(t,'leftPalm'),r=point(t,'rightPalm');
      if(p===0||p===4){red=ball('red',600,920);yellow=ball('yellow',760,920);}
      if(p===1){red=ball('red',l.x,l.y-28);yellow=ball('yellow',r.x,r.y-28);}
      if(p===2){red=ball('red',610,920);yellow=ball('yellow',r.x,r.y-28);}
      if(p===3){red=ball('red',l.x,l.y-28);yellow=ball('yellow',760,920);}
    }else{const wx=p===6?580:495;cart=wagon(wx,880);wagonBalls(cart);red={inCart:true};yellow={inCart:true};t=place('push-cart',wx-47,950,.64);}
    state={kind:'two-balls',red,yellow,cart,ballDiameter:68,redHeld:p===1||p===3,yellowHeld:p===1||p===2,redFalls:p===2,yellowFalls:p===3,bothInCart:p>=5};
  }
  if(current===4){
    bg(a.garden);const t=place(p===5?'push-cart':'carry-play',290,955,.64),pal=p===5?point(t,'grip'):point(t,'leftPalm');let dog=null,red=null;
    if(p===0||p===6){dog=sprite('dog',570,955,330);const mouth={x:dog.x+(210-85)*dog.s,y:dog.y+(385-50)*dog.s};red=ball('red',p===0?535:mouth.x,p===0?920:mouth.y);}
    else{if(p!==4)dog=sprite(p===3?'search':'lookback',p===1?500:650,955,330);red=ball('red',p===5?590:pal.x,p===5?920:pal.y-28);}
    if(p===3)mark(835,665);if(p===4)mark(420,520,'!');state={kind:'dog-ball',dog,red,ballDiameter:68,ballHeld:p>=1&&p<=4,earlyRun:p===2,lookingGround:p===3,rolling:p===5,returned:p===6,dogCount:dog?1:0};
  }
  c.restore();window.__elevenProof.book=current+11;window.__elevenProof.page=p;window.__elevenProof.scene=state;window.__elevenProof.placements=placements;window.__elevenProof.window=session.snapshot();window.__elevenProof.camera=camera;canvas.dataset.book=String(current+11);canvas.dataset.page=String(p+1);
}
