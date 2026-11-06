'use strict';
// All new scenes use registered child-v1 complete actors, in a 1000×1000 world.
const base='./art/sequence/first-ten/',frame={x:0,y:0,width:1000,height:1000};
const scene=(background,pose,x,y,scale,beat,extra={})=>({background,pose,placement:pose?{x,y,scale}:null,camera:{...frame},world:{width:1000,height:1000},firstTen:true,beat,...extra});
const mountain=(pose,beat,cloud)=>scene('mountain-clear',pose,270,660,.42,beat,{cloud,foreground:true});
const garage={x:340,y:475,width:630};
const car=(background,pose,beat,position,extra={})=>scene(background,pose,210,560,.56,beat,{garage:{...garage},carPosition:position,...extra});
const BOOKS={
 mountain:{pages:[
  mountain('stand-wave','white-clouds-above-mountain',null),
  mountain('stand-wave','mountain-hidden',{x:-130,y:85,width:1430}),
  mountain('hands-flower-open','ask-mountain',{x:-130,y:85,width:1430}),
  mountain('stand-wave','wind-moves-cloud',{x:670,y:85,width:1430}),
  mountain('hands-flower-open','mountain-revealed',null),
  mountain('stand-wave','same-mountain-never-moved',null)]},
 car:{pages:[
  car('car-room-wide','stand-wave','two-door-home',{x:380,y:850,width:170}),
  car('car-room-floor',null,'entrance-and-exit',{x:220,y:915,width:170},{garage:{x:125,y:300,width:750}}),
  car('car-room-floor','crouch-book','enter-left-door',{x:480,y:832,width:155}),
  car('car-room-floor','crouch-book','leave-right-door',{x:780,y:850,width:170}),
  car('car-room-wide','push-cart','in-and-out-again',{x:745,y:890,width:170},{route:true}),
  car('car-room-wide','crouch-book','ask-car-to-come-home',{x:755,y:890,width:170}),
  car('car-room-floor','crouch-book','park-inside',{x:485,y:826,width:145}),
  car('car-room-door','reach-water','doors-closed',null,{closed:true,placement:{x:265,y:560,scale:.56}})]},
 ball:{pages:[
  scene('ball-yard-wide','stand-wave',340,505,.65,'want-to-play-no-ball'),
  scene('ball-yard-wide','run-left',380,505,.65,'search-courtyard'),
  scene('ball-mound-detail','crouch-book',250,605,.68,'look-at-small-mound'),
  scene('ball-mound-detail',null,0,0,1,'only-pebbles-on-mound'),
  scene('ball-cart-detail','crouch-book',230,605,.68,'look-inside-toy-cart'),
  scene('ball-cart-detail',null,0,0,1,'only-pebbles-in-cart'),
  scene('ball-home-reveal','stand-wave',490,505,.65,'ball-found-indoors',{ball:{x:770,y:900,width:155}}),
  scene('ball-home-reveal','hands-flower-open',490,505,.65,'ball-never-left-home',{ball:{x:770,y:900,width:155}})]},
 water:{pages:[
  scene('water-puddle-detail',null,0,0,1,'sky-clouds-reflected'),
  scene('water-reflection-bank','crouch-book',560,360,.50,'flower-and-me-reflected',{reflection:{scale:.30,clip:[550,785,360,180]}}),
  scene('water-reflection-bank','run-left',530,350,.43,'walk-and-reflection-follows',{reflection:{scale:.30,clip:[550,785,360,180]}}),
  scene('water-reflection-bank','stand-wave',530,340,.43,'stop-and-reflection-stops',{reflection:{scale:.30,clip:[550,785,360,180]}}),
  scene('water-reflection-bank','crouch-palm',640,380,.50,'hand-approaches-water',{reflection:{scale:.30,clip:[550,785,360,180]}}),
  scene('water-reflection-bank','crouch-touch',640,365,.50,'touch-water-break-reflection',{ripples:{x:542,y:598,strength:1}}),
  scene('water-reflection-bank','crouch-book',640,355,.50,'hand-out-water-calm-again',{reflection:{scale:.30,clip:[550,785,360,180]},ripples:{x:545,y:665,strength:.15}}),
  scene('water-reflection-bank','stand-wave',600,340,.43,'greet-reflection-and-go-home',{reflection:{scale:.30,clip:[550,785,360,180]}})]}
};
const paths={'mountain-clear':'./art/sequence/mountain/clear.png','mountain-cloud':'./art/sequence/mountain/cloud.png','mountain-foreground':'./art/sequence/mountain/foreground.png'};
function imageUrl(key){return paths[key]||base+key+'.webp';}
function assetKeys(p){return [p.background,...(p.foreground?['mountain-foreground']:[]),...(p.cloud?['mountain-cloud']:[]),...(p.garage?[p.closed?'garage-closed':'garage-open']:[]),...(p.carPosition?['toy-car']:[]),...(p.ball?['toy-ball']:[])];}
function cover(id){const source=BOOKS[id].pages[id==='water'?1:0];return {...source,pose:'stand-wave',placement:id==='mountain'?{x:270,y:660,scale:.42}:id==='water'?{x:560,y:340,scale:.43}:id==='ball'?{x:340,y:505,scale:.65}:{x:210,y:560,scale:.56},reflection:undefined,ripples:undefined,beat:'cover'};}
function prop(c,im,p){const h=p.width*im.height/im.width;c.drawImage(im,p.x,p.y-h,p.width,h);}
function garageLayer(c,p,a){
 const g=p.garage,im=a[p.closed?'garage-closed':'garage-open'],h=g.width*im.height/im.width;
 if(p.carPosition&&!p.carInFront)prop(c,a['toy-car'],p.carPosition);
 c.drawImage(im,g.x,g.y,g.width,h);
 if(p.carPosition&&p.carInFront)prop(c,a['toy-car'],p.carPosition);
 // Door labels are typography, added after artwork generation.
 c.save();c.fillStyle='#385640';c.font='22px serif';c.textAlign='center';c.textBaseline='middle';
 c.fillText('入口',g.x+g.width*.337,g.y+h*.337);c.fillText('出口',g.x+g.width*.663,g.y+h*.337);c.restore();
 if(p.route){c.save();c.strokeStyle='#c47b36';c.lineWidth=4;c.setLineDash([8,9]);c.beginPath();c.moveTo(510,860);c.bezierCurveTo(465,975,890,975,825,855);c.stroke();c.setLineDash([]);c.beginPath();c.moveTo(810,876);c.lineTo(825,855);c.lineTo(840,875);c.stroke();c.restore();}
}
function beforeActor(c,p,a){
 if(p.cloud){const q=p.cloud,im=a['mountain-cloud'];c.drawImage(im,q.x,q.y,q.width,q.width*im.height/im.width);}
 if(p.foreground){const im=a['mountain-foreground'];c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);}
 if(p.garage)garageLayer(c,p,a);
 if(p.ball)prop(c,a['toy-ball'],p.ball);
}
function afterActor(c,p,actor,model,library){
 if(p.reflection&&actor){
  const r=p.reflection,[x,y,rx,ry]=r.clip,pose=library[p.pose],foot=(pose.bounds.bottom-pose.collar.y)/model.sourcePixelsPerUnit,ground=p.placement.y+foot*p.placement.scale,reflectionY=ground+foot*r.scale;c.save();c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.clip();c.globalAlpha=.76;
  // Planar reflection reuses and uniformly mirrors the identical cached actor.
  // Face, body and hairstyle are never regenerated or independently resized.
  c.translate(p.placement.x,reflectionY);c.scale(r.scale,-r.scale);c.drawImage(actor.image,-actor.anchor.x,-actor.anchor.y,actor.image.width/actor.pixelDensity,actor.image.height/actor.pixelDensity);c.restore();
 }
 if(p.ripples){const r=p.ripples;c.save();c.beginPath();c.ellipse(550,785,450,185,0,0,Math.PI*2);c.clip();if(r.strength>.5){c.fillStyle='rgba(99,157,170,.28)';c.beginPath();c.ellipse(r.x,r.y,37,13,0,0,Math.PI*2);c.fill();}c.strokeStyle='rgba(87,141,153,'+(.9*r.strength)+')';c.lineWidth=2.5;
  for(const [rx,ry] of [[35,12],[80,28],[170,65],[270,105],[380,160],[490,230],[620,310]]){c.beginPath();c.ellipse(r.x,r.y,rx,ry,0,0,Math.PI*2);c.stroke();}c.restore();}
}
module.exports={BOOKS,imageUrl,assetKeys,cover,beforeActor,afterActor};
