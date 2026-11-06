'use strict';
const assets=require('./level2-third-three-assets'),old=require('./books-seventeen-nineteen-art');
const {CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'pretend-bunny':1176,'pretend-cat':1176};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2Third:true,beat,...extra});
const clone=(p,beat,extra={})=>({...p,camera:{...p.camera},placement:p.placement?{...p.placement}:null,level2Third:true,beat,...extra});
const paper=old.BOOKS.paper.pages,fruit=old.BOOKS.fruit.pages;
const friend={key:'fruit-friend',x:420,ground:940,height:590};
const back={x:590,ground:970,width:380};
const laugh=(pose,beat,extra={})=>scene('revision-room',pose,290,940,.57,beat,{dadBack:back,...extra});
const BOOKS={
 'level2-paper':{pages:[
  clone(paper[0],'show-one-red-paper'),
  clone(paper[1],'wind-lifts-the-paper',{wind:undefined}),
  clone(paper[2],'paper-left-child-runs-left',{wind:undefined}),
  clone(paper[3],'paper-right-child-runs-right',{wind:undefined}),
  clone(paper[4],'paper-down-child-takes-it-back'),
  clone(paper[6],'child-puts-stone-on-the-paper'),
  clone(paper[6],'wind-returns-paper-stays-under-stone',{breeze:true}),
  clone(paper[7],'child-no-longer-needs-to-run')
 ]},
 'level2-who-laughs':{parents:['dad'],pages:[
  laugh('stand-wave','look-at-dad-and-keep-a-straight-face'),
  laugh('pretend-bunny','put-both-hands-on-head'),
  laugh('pretend-bunny','pretend-to-be-a-rabbit'),
  laugh('pretend-bunny','dad-still-not-laughing'),
  laugh('pretend-cat','hands-beside-cheeks-pretend-cat'),
  laugh('pretend-cat','dad-breaks-into-a-smile',{dadBack:null,dad:{x:710,ground:945,scale:1.85}}),
  laugh('hands-flower-open','dad-you-laughed-first-we-both-laugh',{dadBack:null,dad:{x:710,ground:945,scale:1.85,rotation:-.025}})
 ]},
 'level2-fruit':{pages:[
  clone(fruit[0],'two-apples-only-the-child',{friend:null}),
  clone(fruit[0],'friend-comes-to-my-home',{background:'fruit-share',friend}),
  clone(fruit[0],'offer-big-keep-small',{background:'fruit-share',friend}),
  clone(fruit[1],'big-apple-has-reached-friend',{friend}),
  clone(fruit[6],'friend-tastes-big-apple-first',{friend:{...friend,key:'friend-eating'},small:{at:'leftPalm',bitten:false},big:{at:'friendBite',bitten:true}}),
  clone(fruit[7],'child-tastes-own-small-apple',{friend:{...friend,key:'friend-eating'}}),
  clone(fruit[1],'friend-thanks-child-both-apples-have-bites',{background:'fruit-end',friend,small:{at:'leftPalm',bitten:true},big:{at:'friendPalm',bitten:true}})
 ]}
};
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){return [...new Set([...(p.seventeenNineteen?old.assetKeys(p):[p.background]),...(p.dadBack?['dad-seated-back']:[])])];}
function cover(id){const p=BOOKS[id].pages[0];return id==='level2-who-laughs'?{...BOOKS[id].pages[1],dadBack:null,dad:{x:710,ground:945,scale:1.85},beat:'cover'}:{...p,beat:'cover'};}
function beforeActor(c,p,images){if(p.dadBack){const q=p.dadBack,[l,t,r,b]=assets['dad-seated-back'].bounds,h=q.width*(b-t)/(r-l);c.drawImage(images['dad-seated-back'],l,t,r-l,b-t,q.x,q.ground-h,q.width,h);}}
function afterActor(c,p,o){
 if(p.dad){const actor=o.preparedActors?.dad;if(!actor)throw Error('爸爸整个人物尚未准备好');const a=actor.composite,q=p.dad;c.save();c.translate(q.x,q.ground);c.rotate(q.rotation||0);c.drawImage(a.image,a.left*q.scale,a.top*q.scale,a.width*q.scale,a.height*q.scale);c.restore();}
 if(p.breeze){c.save();c.strokeStyle='rgba(231,233,213,.9)';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.moveTo(120,300+i*32);c.bezierCurveTo(190,280+i*32,215,325+i*32,285,300+i*32);c.stroke();}c.restore();}
}
function proof(p){return {beat:p.beat,pose:p.pose,dadBack:!!p.dadBack,dadFront:!!p.dad,originalDadFaceReused:!!p.dad,friend:p.friend||null,small:p.small||null,big:p.big||null,paper:p.paper||null,stone:p.stone||null,breeze:!!p.breeze};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
