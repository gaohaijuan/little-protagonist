'use strict';
// Drawings, toys and the paper share one affine paper plane. The child stays
// outside this plane: a self portrait is a crayon picture, never a new face.
const assets=require('./level2-last-three-assets'),{CHILD_MODEL}=require('./character-rig');
const density=CHILD_MODEL.sourcePixelsPerUnit;
const sole={'sit-draw-active':919,'sit-draw':870};
const PAPER={width:1000,height:700};
function scene(kind,stage,pose,beat,{close=false,ground=720,contact=[40,160],trainX=200,...extra}={}){
 const scale=.68,x=240,placement=pose?{x,y:ground-sole[pose]/density*scale,scale}:null;
 let paper;
 if(close)paper={a:.86,b:0,c:0,d:.86,e:70,f:170};
 else{
  const tip={x:x+409/density*scale,y:ground-5/density*scale};
  const a=.58,c=.04,d=contact[1]>=300?.56:.40;
  paper={a,b:0,c,d,e:tip.x-a*contact[0]-c*contact[1],f:tip.y-d*contact[1]};
 }
 return {background:'studio-floor',pose,placement,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2Last:true,kind,stage,beat,paper,close,contact:pose==='sit-draw-active'?contact:null,trainX,...extra};
}
const BOOKS={
 'level2-train':{pages:[
  scene('train',0,'sit-draw-active','draw-a-narrow-road-for-the-train',{contact:[40,160],blocked:true}),
  scene('train',0,null,'close-the-train-is-too-wide-for-the-road',{close:true,blocked:true}),
  scene('train',1,'sit-draw-active','draw-a-second-much-wider-road',{contact:[40,350],trainX:50}),
  scene('train',1,null,'the-train-now-fits-and-moves-right',{close:true,trainX:390}),
  scene('train',2,'sit-draw-active','add-green-trees-and-red-flowers-beside-the-road',{ground:650,contact:[40,180],trainX:390}),
  scene('train',2,'sit-draw','invite-the-train-to-follow-the-wide-road',{contact:[40,350],trainX:550}),
  scene('train',2,null,'the-train-departs-along-the-new-road',{close:true,trainX:690,departed:true})
 ]},
 'level2-fish':{pages:[
  scene('fish',0,null,'show-the-one-crayon-fish-on-paper',{close:true}),
  scene('fish',0,'sit-draw','ask-the-drawn-fish-where-its-home-is',{contact:[40,350]}),
  scene('fish',1,'sit-draw-active','draw-blue-water-around-the-fish',{contact:[40,160]}),
  scene('fish',2,'sit-draw-active','draw-water-plants-and-small-and-large-stones',{contact:[40,550]}),
  scene('fish',2,null,'reveal-the-fishs-drawn-home-in-water',{close:true}),
  scene('fish',3,'sit-draw-active','add-a-small-crayon-self-portrait-to-the-paper',{ground:650,contact:[150,130]}),
  scene('fish',3,null,'finished-drawing-child-and-fish-play-together',{close:true,finished:true})
 ]}
};
function assetKeys(p){return [p.background,...(p.kind==='train'?['toy-train',...(p.stage>=2?['drawing-trees-flowers']:[])]:['drawing-fish',...(p.stage>=1?['drawing-water']:[]),...(p.stage>=2?['drawing-habitat']:[]),...(p.stage>=3?['drawing-self']:[])])];}
function applyPaper(c,p){const q=p.paper;c.transform(q.a,q.b,q.c,q.d,q.e,q.f);}
function crayon(c,x1,y1,x2,y2,color,width=5){
 c.save();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';
 for(let k=0;k<3;k++){c.globalAlpha=.30;c.beginPath();for(let j=0;j<=40;j++){const t=j/40,x=x1+(x2-x1)*t+Math.sin(j*2.3+k)*1.8,y=y1+(y2-y1)*t+Math.cos(j*1.7+k)*2.1;(j?c.lineTo:c.moveTo).call(c,x,y);}c.stroke();}c.restore();
}
function sprite(c,images,key,x,y,w,{raw=false,height=null}={}){
 const m=assets[key],im=images[key],b=raw?[0,0,...m.size]:m.bounds,h=height||w*(b[3]-b[1])/(b[2]-b[0]);
 c.drawImage(im,b[0],b[1],b[2]-b[0],b[3]-b[1],x,y,w,h);return {x,y,width:w,height:h};
}
function train(c,p,images){
 crayon(c,40,70,950,70,'#4b7b93');crayon(c,40,160,950,160,'#4b7b93');
 if(p.stage>=1){crayon(c,40,350,960,350,'#326e99',7);crayon(c,40,630,960,630,'#326e99',7);}
 if(p.stage>=2)sprite(c,images,'drawing-trees-flowers',290,68,650);
 // Same physical toy and size on both roads. Its 181px depth exceeds the
 // first 90px lane but sits wholly inside the second 280px lane.
 const w=280,m=assets['toy-train'],h=w*(m.bounds[3]-m.bounds[1])/(m.bounds[2]-m.bounds[0]);
 const bottom=p.stage?610:205;
 sprite(c,images,'toy-train',p.trainX,bottom-h,w);
}
function fish(c,p,images){
 if(p.stage>=1)sprite(c,images,'drawing-water',28,60,944,{height:620});
 if(p.stage>=2)sprite(c,images,'drawing-habitat',140,40,720,{raw:true});
 sprite(c,images,'drawing-fish',500,225,345);
 if(p.stage>=3)sprite(c,images,'drawing-self',150,130,230);
}
function beforeActor(c,p,images){
 if(p.close){const im=images[p.background];c.drawImage(im,0,im.height*.40,im.width,im.height*.60,0,0,1000,1000);}
 c.save();applyPaper(c,p);
 c.fillStyle='rgba(100,75,44,.16)';c.fillRect(8,12,PAPER.width,PAPER.height);
 c.fillStyle='#fffdf3';c.fillRect(0,0,PAPER.width,PAPER.height);
 c.strokeStyle='#d8cdb5';c.lineWidth=1.5;c.strokeRect(0,0,PAPER.width,PAPER.height);
 c.beginPath();c.rect(0,0,PAPER.width,PAPER.height);c.clip();
 if(p.kind==='train')train(c,p,images);else fish(c,p,images);
 c.restore();
}
function afterActor(c,p){
 if(!p.contact)return;
 // The registered pencil tip and the paper contact are the same world point.
 // A tiny stroke after the tip makes the blue crayon touch visibly readable.
 c.save();applyPaper(c,p);crayon(c,p.contact[0]+2,p.contact[1]+1,p.contact[0]+22,p.contact[1]+1,'#387caf',3);c.restore();
}
function proof(p){
 const q=p.paper,contact=p.contact?{x:q.a*p.contact[0]+q.c*p.contact[1]+q.e,y:q.b*p.contact[0]+q.d*p.contact[1]+q.f}:null;
 return {beat:p.beat,kind:p.kind,stage:p.stage,pose:p.pose,background:p.background,paperPlane:{...q},paperSize:PAPER,view:p.close?'overhead-paper-detail':'seated-room-view',drawingIsOnPaper:true,childEntersWater:false,pencilContact:contact,
 ...(p.kind==='train'?{narrowRoadWidth:90,wideRoadWidth:p.stage>=1?280:null,trainX:p.trainX,trainDirection:'right',trainWidth:280,trainBlocked:!!p.blocked,secondRoad:p.stage>=1,treesAndFlowers:p.stage>=2,departed:!!p.departed}:{fish:true,water:p.stage>=1,plantsAndStones:p.stage>=2,selfPortrait:p.stage>=3,finished:!!p.finished})};
}
module.exports={BOOKS,assetKeys,beforeActor,afterActor,proof};
