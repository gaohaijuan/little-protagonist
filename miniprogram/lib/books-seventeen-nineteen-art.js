'use strict';
// Scenes place cached complete child-v1 actors. All other objects are separate.
const assets=require('./books-17-19-assets');
const {CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'carry-play':1175,'eat-fruit':1175,'crouch-book':959,'crouch-touch':920,'crouch-palm':871,'run-left':1148,'run-right':1173,'step-own-shoes':1171,'push-cart':1175};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},seventeenNineteen:true,beat,...extra});
const sheet=(x,ground,width=220,rotation=0)=>({x,ground,width,rotation,flat:ground>800});
const fruit=(bg,pose,beat,extra={})=>scene(bg,pose,370,940,.64,beat,{friend:{key:'fruit-friend',x:460,ground:940,height:590},small:{at:'leftPalm',bitten:false},big:{at:'friendPalm',bitten:false},...extra});
const bed=(bg,pose,x,beat,extra={})=>scene(bg,pose,x,940,.62,beat,{bed:{x:440,ground:955,width:320},cat:{key:'bed-cat-awake',x:800,ground:950,width:165},...extra});
const BOOKS={
 paper:{pages:[
  scene('paper-welcome','carry-play',450,940,.66,'show-my-red-paper',{paper:{at:'hands',width:145}}),
  scene('paper-wind','hands-flower-open',450,940,.66,'wind-lifts-paper',{paper:sheet(690,520,180,-.20),wind:'right'}),
  scene('paper-wind','run-left',420,940,.66,'paper-and-child-go-left',{paper:sheet(145,520,180,-.22),wind:'left'}),
  scene('paper-wind','run-right',550,940,.66,'paper-and-child-go-right',{paper:sheet(735,520,180,.20),wind:'right'}),
  scene('paper-land','crouch-touch',680,940,.74,'paper-comes-down',{paper:sheet(450,925,240)}),
  scene('paper-again','crouch-touch',680,940,.74,'put-it-down-wind-returns',{paper:sheet(450,925,240,.04),wind:'right'}),
  scene('paper-again','crouch-palm',650,940,.75,'place-the-stone-on-paper',{paper:sheet(450,925,240),stone:{x:485,ground:910,width:85}}),
  scene('paper-end','hands-flower-open',330,940,.66,'paper-stays-child-rests',{paper:sheet(570,925,240),stone:{x:605,ground:910,width:85}})
 ]},
 fruit:{pages:[
  fruit('fruit-welcome','carry-play','two-apples-one-big-one-small',{big:{at:'rightPalm',bitten:false}}),
  fruit('fruit-share','carry-play','give-big-keep-small'),
  fruit('fruit-share','carry-play','friend-offers-the-big-one-back',{big:{at:'rightPalm',bitten:false}}),
  fruit('fruit-share','carry-play','big-apple-back-and-forth',{big:{at:[462,620],bitten:false},passing:true}),
  fruit('fruit-welcome','carry-play','small-apple-still-in-my-hand'),
  fruit('fruit-end','eat-fruit','taste-my-small-apple',{small:{at:'bite',bitten:true}}),
  fruit('fruit-end','carry-play','friend-tastes-the-big-apple',{friend:{key:'friend-eating',x:460,ground:940,height:590},small:{at:'leftPalm',bitten:true},big:{at:'friendBite',bitten:true}}),
  fruit('fruit-welcome','eat-fruit','both-apples-are-good',{friend:{key:'friend-eating',x:460,ground:940,height:590},small:{at:'bite',bitten:true},big:{at:'friendBite',bitten:true}})
 ]},
 catbed:{pages:[
  bed('bed-room-wide','hands-flower-open',240,'this-is-the-cats-bed',{cat:null}),
  bed('bed-room-low',null,0,'cat-wants-to-sleep',{cat:{key:'cat-drowsy',x:800,ground:950,width:165}}),
  bed('bed-room-low',null,0,'ball-is-on-the-bed',{ball:{at:[605,895]}}),
  bed('bed-room-low','crouch-book',310,'child-takes-ball-out',{ball:{at:'rightPalm'}}),
  bed('bed-room-wide','crouch-book',390,'child-puts-car-in',{ball:{at:[330,950]},car:{x:495,ground:905,width:220}}),
  bed('bed-room-low','crouch-book',390,'cat-looks-at-the-child',{ball:{at:[330,950]},car:{x:495,ground:905,width:220}}),
  bed('bed-room-wide','crouch-book',310,'child-takes-car-out',{ball:{at:[330,950]},car:{at:'rightPalm',width:180}}),
  bed('bed-room-end','step-own-shoes',260,'cat-sleeps-child-plays-away',{cat:{key:'bed-cat-sleep',x:480,ground:915,width:240},ball:{at:[200,950]},car:{x:85,ground:890,width:180},sleeping:true})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){return [p.background,...(p.paper?['loose-paper']:[]),...(p.stone?['paper-stone']:[]),...(p.friend?[p.friend.key]:[]),...(p.small||p.big?['fruit-whole']:[]),...([p.small,p.big].some(f=>f?.bitten)?['fruit-bitten']:[]),...(p.bed?['pet-bed']:[]),...(p.cat?[p.cat.key]:[]),...(p.ball?['bed-ball']:[]),...(p.car?['bed-car']:[])];}
function cover(id){const p=BOOKS[id].pages[0];return {...p,pose:'stand-wave',placement:{x:id==='fruit'?280:id==='paper'?370:240,y:940-1180/CHILD_MODEL.sourcePixelsPerUnit*.60,scale:.60},paper:id==='paper'?sheet(590,860,240):undefined,small:id==='fruit'?{at:[440,800],bitten:false}:undefined,big:id==='fruit'?{at:[560,800],bitten:false}:undefined,beat:'cover'};}
function prop(c,key,images,x,ground,width){const [l,t,r,b]=assets[key].bounds,h=width*(b-t)/(r-l);c.drawImage(images[key],l,t,r-l,b-t,x,ground-h,width,h);}
function point(p,name,model,library){const pose=library[p.pose],a=pose.attachments[name],s=p.placement.scale/model.sourcePixelsPerUnit;return [p.placement.x+(a.x-pose.collar.x)*s,p.placement.y+(a.y-pose.collar.y)*s];}
function friendPoint(p,name){const f=p.friend,s=f.height/1536,xy=name==='friendBite'?[375,520]:[150,680];return [f.x+xy[0]*s,f.ground-f.height+xy[1]*s];}
function at(p,name,model,library){return Array.isArray(name)?name:name.startsWith('friend')?friendPoint(p,name):point(p,name,model,library);}
function beforeActor(c,p,images){
 if(p.bed)prop(c,'pet-bed',images,p.bed.x,p.bed.ground,p.bed.width);
 if(p.cat)prop(c,p.cat.key,images,p.cat.x,p.cat.ground,p.cat.width);
 if(p.friend){const f=p.friend;c.drawImage(images[f.key],0,0,1024,1536,f.x,f.ground-f.height,f.height*1024/1536,f.height);}
}
function afterActor(c,p,images,model,library){
 if(p.paper){const q=p.paper;let x=q.x,ground=q.ground;if(q.at==='hands'){const a=point(p,'leftPalm',model,library),b=point(p,'rightPalm',model,library);x=(a[0]+b[0])/2-q.width/2;ground=Math.max(a[1],b[1])+15;}c.save();c.translate(x+q.width/2,ground);c.rotate(q.rotation||0);if(q.flat)c.scale(1,.35);prop(c,'loose-paper',images,-q.width/2,0,q.width);c.restore();}
 if(p.stone)prop(c,'paper-stone',images,p.stone.x,p.stone.ground,p.stone.width);
 for(const [kind,size] of [['small',64],['big',100]]){const f=p[kind];if(!f)continue;const [x,y]=at(p,f.at,model,library);prop(c,f.bitten?'fruit-bitten':'fruit-whole',images,x-size/2,y+5,size);}
 if(p.ball){const [x,y]=at(p,p.ball.at,model,library);prop(c,'bed-ball',images,x-32,y,64);}
 if(p.car){let {x,ground,width}=p.car;if(p.car.at){const q=point(p,p.car.at,model,library);x=q[0]-width/2;ground=q[1]+8;}prop(c,'bed-car',images,x,ground,width);}
 if(p.wind||p.passing){c.save();c.strokeStyle='#b49462';c.lineWidth=2;c.setLineDash([6,9]);const left=p.passing?415:p.wind==='left'?205:625,right=p.passing?550:p.wind==='left'?355:775,y=p.passing?665:570;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.setLineDash([]);for(const [x,d] of p.passing?[[left,1],[right,-1]]:[[p.wind==='left'?left:right,p.wind==='left'?1:-1]]){c.beginPath();c.moveTo(x+12*d,y-7);c.lineTo(x,y);c.lineTo(x+12*d,y+7);c.stroke();}c.restore();}
}
function proof(p){return {paper:p.paper||null,stone:p.stone||null,wind:p.wind||null,small:p.small||null,big:p.big||null,bed:p.bed||null,cat:p.cat||null,ball:p.ball||null,car:p.car||null,sleeping:!!p.sleeping};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
