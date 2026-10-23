// Each body page has its own newly painted complete environment.
// Only registered, precomposed characters are placed into those environments.
const canvas=document.getElementById('ff-art'),sheet=root.querySelector('.ff-book'),cache=new Map(),bundles=new Map(),adultCache=new Map(),plates=new Map();
const metadata=/* SIXTEEN_ASSETS */,storyboard=/* SIXTEEN_STORYBOARD */,plateBase='./art/sequence/books-16-20-storyboards-v2/';
let saved=null,members=[],books=[],stats=[],current=0,page=-1,refined=true,ticket=0,actors=[],composer,session,adultRole='dad',familyBundle;
const recipes=Array.from({length:5},(_,i)=>[...new Set(storyboard.pages.filter(s=>s.book===i+16).flatMap(s=>s.actors.filter(a=>!a.adult).map(a=>a.pose)))]);
const assetPaths={garden:base+'garden-nook.png',book:base+'open-book.png',leaf:base+'cabbage-leaf.png',melon:base+'melon.png',shoes:base+'adult-shoes.png',bag:base+'satchel.png',can:base+'watering-can.png',cup:base+'water-cup.png',paper:base+'red-paper.png',pencil:base+'pencil.png',pebble:'./art/sequence/books-06-10/pebble.png'};
const keyNames={book:'open-book',leaf:'cabbage-leaf',shoes:'adult-shoes',bag:'satchel',can:'watering-can',cup:'water-cup',paper:'red-paper'};
const extraFiles={'held-book':['book'],'held-leaf':['leaf'],'held-melon':['melon'],'big-shoes':['shoes'],'held-bag':['bag'],'held-cup':['cup'],'held-can':['can'],'drawing-paper':['paper','pencil'],'flying-paper':['paper'],'landed-paper':['paper'],'anchored-paper':['paper','pebble'],'finished-paper':['paper','pencil','pebble']};
const image=url=>{if(!cache.has(url)){const p=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画暂时无法读取，请重新选择本书重试。'));im.src=url;});cache.set(url,p);p.catch(()=>{if(cache.get(url)===p)cache.delete(url);});}return cache.get(url);};
function frame(i){const n=books[i].pages.length,p=page<0?[6,0,7,6,7][i]:page>=n?n-1:page;return storyboard.pages.find(s=>s.book===i+16&&s.page===p+1);}
async function loadBook(i){
 const s=frame(i),url=plateBase+s.id+'.png';
 if(!plates.has(url)){const p=image(url);plates.set(url,p);p.catch(()=>{if(plates.get(url)===p)plates.delete(url);});}else{const p=plates.get(url);plates.delete(url);plates.set(url,p);}
 while(plates.size>4){const old=plates.keys().next().value;plates.delete(old);cache.delete(old);}
 const keys=[...new Set(s.extras.flatMap(x=>extraFiles[x]||[]))];
 const [plate,pairs]=await Promise.all([plates.get(url),Promise.all(keys.map(async k=>[k,await image(assetPaths[k])]))]);
 const b={plate,frame:s,assets:Object.fromEntries(pairs)};return {enhanced:b,original:b};
}
async function savedData(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const t=db.transaction('child','readonly'),q=t.objectStore('child').get('main');t.oncomplete=()=>{db.close();resolve(q.result||null);};t.onabort=()=>{db.close();resolve(null);};};});}
function adultSprite(role){
 if(adultCache.has(role))return adultCache.get(role);const m=familyBundle.manifest,b=m.body[role],h=m.heads[role],br=b.sourceRect,hr=h.sourceRect,u=1.45,metric=h.metrics,scale=b.face.height/(metric.faceBounds.bottom-metric.faceBounds.top)*u;
 const left=Math.min((b.bounds.left-b.collar.x)*u,(metric.bounds.left-metric.chin.x)*scale),right=Math.max((b.bounds.right-b.collar.x)*u,(metric.bounds.right-metric.chin.x)*scale),top=Math.min((b.bounds.top-b.collar.y)*u,(metric.bounds.top-metric.chin.y)*scale),bottom=Math.max((b.bounds.bottom-b.collar.y)*u,(metric.bounds.bottom-metric.chin.y)*scale),c=document.createElement('canvas');c.width=Math.ceil(right-left)+20;c.height=Math.ceil(bottom-top)+20;const g=c.getContext('2d'),at={x:10-left,y:10-top};g.drawImage(familyBundle.assets[b.asset],br.x,br.y,br.width,br.height,at.x-b.collar.x*u,at.y-b.collar.y*u,br.width*u,br.height*u);g.drawImage(familyBundle.assets[h.asset],hr.x,hr.y,hr.width,hr.height,at.x-metric.chin.x*scale,at.y-metric.chin.y*scale,hr.width*scale,hr.height*scale);adultCache.set(role,c);return c;
}

function draw(bundle,cover,summary){
 const s=bundle.frame,p=s.page-1,w=summary?330:1280,h=summary?290:cover?1030:1310,a=bundle.assets;
 canvas.width=w;canvas.height=h;const c=canvas.getContext('2d'),z=Math.min(w,h)/1000;
 c.fillStyle='#fbf6e9';c.fillRect(0,0,w,h);c.save();c.translate((w-1000*z)/2,(h-1000*z)/2);c.scale(z,z);c.beginPath();c.rect(0,0,1000,1000);c.clip();c.drawImage(bundle.plate,0,0,1000,1000);
 const placements=[],props={},u=1/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit;
 function sprite(key,x,ground,width){const im=a[key],b=metadata[keyNames[key]||key].bounds,k=width/(b[2]-b[0]),height=(b[3]-b[1])*k,y=ground-height;c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],x,y,width,height);return {x,y,w:width,h:height,s:k};}
 function anchored(key,anchor,target,width,rotation=0){const im=a[key],b=metadata[keyNames[key]||key].bounds,k=width/(b[2]-b[0]);c.save();c.translate(target.x,target.y);c.rotate(rotation);c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],(b[0]-anchor.x)*k,(b[1]-anchor.y)*k,width,(b[3]-b[1])*k);c.restore();return {x:target.x,y:target.y,w:width,rotation,s:k};}
 function place(spec){const {pose:id,x,ground,scale,rotation=0}=spec,actor=actors.find(t=>t.pose===id);if(!actor)throw Error('本页人物动作尚未准备。');const pose=poseLibrary.poses[id],t={x,y:ground-(pose.bounds.bottom-pose.collar.y)*u*scale,scale,rotation};composer.place(c,actor,t);placements.push({...t,pose:id,bounds:actor.bounds,headScale:actor.headScale,detail:!!spec.detail});return {...t,pose,ground};}
 const point=(t,key)=>{const v=t.pose.attachments[key],dx=(v.x-t.pose.collar.x)*u*t.scale,dy=(v.y-t.pose.collar.y)*u*t.scale,cs=Math.cos(t.rotation),sn=Math.sin(t.rotation);return {x:t.x+dx*cs-dy*sn,y:t.y+dx*sn+dy*cs};};
 for(const spec of s.actors.filter(a=>a.adult)){const im=adultSprite(adultRole),width=spec.height*im.width/im.height;c.drawImage(im,spec.x-width/2,spec.ground-spec.height,width,spec.height);}
 const placed=s.actors.filter(a=>!a.adult).map(place),t=placed[0],factor=t?t.scale/.64:1;
 for(const extra of s.extras){
  if(extra==='held-book'){const l=point(t,'leftPalm'),r=point(t,'rightPalm');props.book=anchored('book',{x:770,y:600},{x:(l.x+r.x)/2,y:(l.y+r.y)/2+35},290*factor,-.05);}
  if(extra==='held-leaf')props.leaf=anchored('leaf',{x:1580,y:720},point(t,'leftPalm'),180*factor);
  if(extra==='held-melon')props.melon=anchored('melon',{x:700,y:1010},point(t,'leftPalm'),100*factor);
  if(extra==='big-shoes')props.shoes=sprite('shoes',t.x-137*factor,t.ground+12,274*factor);
  if(extra==='held-bag')props.bag=anchored('bag',{x:530,y:220},point(t,'leftPalm'),95*factor);
  if(extra==='held-cup')props.cup=anchored('cup',{x:500,y:980},point(t,'cup'),90*factor);
  if(extra==='held-can'){
   const grip=point(t,'grip'),can=props.can=anchored('can',{x:430,y:250},grip,160*factor,.07),dx=970*can.s,dy=130*can.s,spout={x:grip.x+dx*Math.cos(.07)-dy*Math.sin(.07),y:grip.y+dx*Math.sin(.07)+dy*Math.cos(.07)},soil={x:735,y:540};
   c.save();c.strokeStyle='#c9e6dfcc';c.lineWidth=3;c.setLineDash([3,7]);for(let j=-1;j<=1;j++){c.beginPath();c.moveTo(spout.x+j*4,spout.y);c.quadraticCurveTo((spout.x+soil.x)/2,spout.y+45,soil.x+j*7,soil.y);c.stroke();}c.restore();props.water={spout,soil};
  }
  if(['drawing-paper','finished-paper','flying-paper','landed-paper','anchored-paper'].includes(extra)){
   let center,width=220*factor,angle=0,flat=extra!=='flying-paper',tip=null;
   if(extra==='drawing-paper'||extra==='finished-paper'){
    const grip=point(t,'pencil'),penScale=115*factor/(metadata.pencil.bounds[2]-metadata.pencil.bounds[0]),dx=-1400*penScale,dy=0,rotation=-.9;
    tip={x:grip.x+dx*Math.cos(rotation),y:grip.y+dx*Math.sin(rotation)};center={x:tip.x+20,y:tip.y-5};
   }else if(extra==='flying-paper'){center=p===1?{x:720,y:570}:p===2?{x:180,y:550}:{x:830,y:550};width=200;angle=p===2?.18:-.2;}
   else if(extra==='landed-paper'){const palm=point(t,'palm');center={x:palm.x+90,y:palm.y+35};width=225*factor;}
   else{const l=point(t,'leftPalm');center={x:l.x-95,y:l.y+75};width=225*factor;}
   const b=metadata['red-paper'].bounds,ph=width*(b[3]-b[1])/(b[2]-b[0]);
   c.save();c.translate(center.x,center.y);c.rotate(angle);if(flat)c.scale(1,.62);sprite('paper',-width/2,ph/2,width);c.strokeStyle='#f8e8b7';c.lineWidth=3;c.lineCap='round';c.beginPath();c.arc(0,-8,43,Math.PI,0);
   if(extra==='finished-paper'){c.moveTo(-43,-8);c.quadraticCurveTo(-21,-20,0,-8);c.quadraticCurveTo(21,-20,43,-8);c.moveTo(0,-8);c.lineTo(0,35);c.quadraticCurveTo(-14,52,-20,32);}c.stroke();c.restore();
   props.paper={cx:center.x,cy:center.y,w:width,h:ph*(flat?.62:1),surfaceProjectionY:flat?.62:1,angle};
   if(extra==='anchored-paper'||extra==='finished-paper')props.stone=sprite('pebble',center.x-width*.46,center.y+16,50*factor);
   if(tip)props.pencil=anchored('pencil',{x:1500,y:400},point(t,'pencil'),115*factor,-.9);
  }
 }
 c.restore();
 const state={kind:['cat-book','rabbit-leaf','big-shoes','flower-water','paper-wind'][current],plateId:s.id,wholeScene:true,props,adultRole,
  bookMoved:current===0&&p>=3,asleep:current===0&&p>=5,catOnBook:current===0&&[1,2,4,5,6].includes(p),catCount:current===0?(p?1:0):0,
  rabbitCount:current===1?1:0,revealed:current===1&&p>=4,melon:current===1&&p===7,
  wearingBig:current===2&&p===3,steppingOut:current===2&&p===4,feetOut:current===2&&p===5,ownShoes:current===2&&p>=6,ahead:current===2&&p===7,
  wetFoot:current===3&&p>=3,pouring:current===3&&(p===1||p===2),stoppedPouring:current===3&&p>=3,
  anchored:current===4&&p>=5,direction:current===4?(p===2?'left':p===3?'right':null):null,completeUmbrella:current===4&&p===7};
 Object.assign(window.__sixteenProof,{book:current+16,page:p,scene:state,placements,window:session.snapshot(),camera:{x:0,y:0,w:1000,h:1000},detail:s.actors.some(a=>a.detail),plateCacheCount:plates.size,storyboardVersion:2});
 canvas.dataset.book=String(current+16);canvas.dataset.page=String(p+1);
}

