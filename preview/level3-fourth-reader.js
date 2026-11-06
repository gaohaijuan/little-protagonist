(async function(){
'use strict';
const {book,assets,poses,headMetrics}=window.L3_DATA,rig=window.L3_RIG;
const images={},actors={},timings={downloadMs:0,composeMs:0,drawMs:0},start=performance.now();
const image=src=>new Promise((yes,no)=>{let i=new Image;i.onload=()=>yes(i);i.onerror=()=>no(Error(src));i.src=src});
try{
await Promise.all(Object.entries(assets).map(async([k,m])=>images[k]=await image(m.url)));
const head=await image('./art/family/child-head.webp');
await Promise.all(Object.values(poses).map(async p=>images[p.id]=await image(p.bodyUrl)));
timings.downloadMs=performance.now()-start;let t=performance.now();
const composer=rig.createComposer(()=>document.createElement('canvas'),Object.values(poses),{pixelDensity:3});
const portrait=composer.prepare({image:head,kind:'illustrated',metrics:headMetrics});
for(const p of Object.values(poses))actors[p.id]=composer.compose({portrait,body:images[p.id],poseId:p.id});
// Assemble three separate leaves and the original gripping fingers into the
// cached whole actor. Every leaf shares one physical stem anchor in the hand.
function holdingBundle(id,grip,fingers){
 const base=actors[id],pose=poses[id],u=1/rig.CHILD_MODEL.sourcePixelsPerUnit;
 const canvas=document.createElement('canvas');canvas.width=base.image.width;canvas.height=base.image.height;
 const c=canvas.getContext('2d');c.drawImage(base.image,0,0);c.scale(base.pixelDensity,base.pixelDensity);c.translate(base.anchor.x,base.anchor.y);
 const gx=(grip.x-pose.collar.x)*u,gy=(grip.y-pose.collar.y)*u;
 const b=assets.leaf.bounds,stem={x:208,y:975},width=145,s=width/(b[2]-b[0]);
 for(const angle of [-1.62,-.88,-.12]){c.save();c.translate(gx,gy);c.rotate(angle);c.drawImage(images.leaf,b[0],b[1],b[2]-b[0],b[3]-b[1],(b[0]-stem.x)*s,(b[1]-stem.y)*s,(b[2]-b[0])*s,(b[3]-b[1])*s);c.restore();}
 const [x,y,w,h]=fingers;c.drawImage(images[id],x,y,w,h,(x-pose.collar.x)*u,(y-pose.collar.y)*u,w*u,h*u);
 actors[id+'-leaves']={...base,image:canvas,basePose:id,grip:{x:gx,y:gy},leafCount:3};
}
holdingBundle('run-left',{x:293,y:407},[260,405,70,55]);
holdingBundle('carry-play',{x:592,y:510},[535,506,104,32]);
timings.composeMs=performance.now()-t;
let current=-1;const ui=document.querySelector('#art'),caption=document.querySelector('#caption'),folio=document.querySelector('#folio');
function draw(index,canvas=ui){
const t=performance.now();canvas.width=1500;canvas.height=1500;const c=canvas.getContext('2d');c.scale(1.5,1.5);
const n=index<0?8:index,meta={page:n+1,pose:null,leafCount:0,applePurchased:n>=2,headScale:null};
function bg(k){const im=images[k];if(k==='counter-detail'){const h=1000*im.height/im.width;c.fillStyle='#e9f0e5';c.fillRect(0,0,1000,1000);c.drawImage(im,0,(1000-h)/2,1000,h);}else c.drawImage(im,0,0,1000,1000)}
function sprite(k,x,y,w,rotation=0){const a=assets[k],b=a.bounds,im=images[k],h=w*(b[3]-b[1])/(b[2]-b[0]);c.save();c.translate(x,y);c.rotate(rotation);c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],-w/2,-h,w,h);c.restore();return {x,y,w,h};}
function leaf(x,y,w=68,rotation=0){sprite('leaf',x,y,w,rotation);meta.leafCount++;}
function actor(id,x,ground,scale){const a=actors[id],y=ground-a.bounds.bottom*scale;rigPlace(a,{x,y,scale});meta.pose=id;meta.headScale=a.headScale;if(a.leafCount){meta.leafCount=a.leafCount;meta.sharedStemAnchor=true;meta.fingerOcclusion=true;}return {x,y,scale,id};}
function rigPlace(a,p){composer.place(c,a,p);}
function palm(p,name){const q=poses[p.id],v=q.attachments[name],u=p.scale/rig.CHILD_MODEL.sourcePixelsPerUnit;return {x:p.x+(v.x-q.collar.x)*u,y:p.y+(v.y-q.collar.y)*u};}
function mom(x=775,ground=955,w=400){const m=sprite('mother-apple',x,ground,w);meta.motherHeight=m.h;return m;}
function counter(sold,x=360,ground=950,w=500){sprite(sold?'shop-counter-sold':'shop-counter',x,ground,w);}
function wind(points){c.save();c.strokeStyle='rgba(87,126,149,.65)';c.lineWidth=2.7;c.setLineDash([7,8]);c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.stroke();c.restore();}
if(n===0){bg('garden-wide');actor('stand-wave',370,930,.60);counter(false);leaf(390,757,60);}
if(n===1){bg('counter-detail');leaf(505,635,180,-.08);}
if(n===2){bg('garden-wide');actor('stand-wave',360,935,.60);counter(true,340);const m=mom();leaf(m.x-m.w*.36,m.y-m.h*.55,70,-.25);}
if(n===3){bg('garden-wide');actor('invite-up-right',360,935,.60);counter(true,340);mom();leaf(670,435,76,-.5);wind([[480,690],[570,630],[620,510],[670,450]]);}
if(n===4){bg('garden-chase-clean');actor('run-right',565,950,.64);leaf(825,520,80,-.4);wind([[170,705],[270,670],[230,610],[400,590],[600,625],[800,540]]);}
if(n===5){bg('garden-tree');leaf(610,865,155,-.1);}
if(n===6){bg('garden-tree');const p=actor('crouch-reach-right',355,965,.66),h=palm(p,'fingertips');leaf(h.x+7,h.y+14,70,-.35);leaf(642,480,82,.7);leaf(800,650,80,-.5);}
if(n===7){bg('garden-chase-clean');actor('run-left-leaves',510,965,.68);meta.runDirection='back-toward-shop-left';}
if(n===8){bg('garden-wide');actor('carry-play-leaves',350,950,.60);counter(true,325,963,450);mom();}
canvas.dataset.proof=JSON.stringify(meta);timings.drawMs+=performance.now()-t;return canvas;
}
function open(i){current=Math.max(-1,Math.min(book.pages.length,i));document.querySelector('#summary').hidden=current!==book.pages.length;ui.hidden=current===book.pages.length;caption.hidden=current<0||current===book.pages.length;caption.textContent=book.pages[current]||'';document.querySelector('#coverTitle').hidden=current!==-1;folio.textContent=current===-1?'封面':current===book.pages.length?'识字小结':`正文 ${current+1} / ${book.pages.length}`;if(current<book.pages.length)draw(current);document.querySelector('#previous').disabled=current===-1;document.querySelector('#next').disabled=current===book.pages.length;}
document.querySelector('#previous').onclick=()=>open(current-1);document.querySelector('#next').onclick=()=>open(current+1);
document.querySelector('#summary').textContent=`本篇用字${book.stats.count}种 · 首次出现${book.stats.newCount}种\n累计正文接触${book.stats.cumulativeCount}种\n\n本篇必认字：${book.requiredCharacters.join('　')}\n\n辅助字：${book.auxiliaryCharacters.join('　')}\n\n辅助字可由成人首读带读，不计入累计必认目标。`;
window.__L3={book,open,draw:(i)=>draw(i,document.createElement('canvas')),timings,actors,composer,poses,headMetrics,images};open(-1);document.body.dataset.ready='true';
}catch(e){document.body.dataset.ready='error';document.querySelector('#error').textContent=e.stack;}
})();
