'use strict';
const assets=require('./book-20-assets'),{CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'crouch-book':959,'barefoot-stand':1130};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},twenty:true,beat,...extra});
const BOOKS={sleepy:{pages:[
 scene('sleep-window','stand-wave',330,940,.62,'evening-not-sleepy'),
 scene('sleep-window','hands-flower-open',330,940,.62,'call-the-bird-from-indoors'),
 scene('sleep-branch',null,0,0,1,'bird-is-sleeping',{bird:{x:455,ground:485,width:230}}),
 scene('sleep-catwide','hands-flower-open',280,940,.62,'call-the-cat',{bed:{x:540,ground:950,width:360},cat:{x:580,ground:905,width:275}}),
 scene('sleep-catclose',null,0,0,1,'cat-is-asleep-in-its-bed',{bed:{x:250,ground:940,width:500},cat:{x:310,ground:880,width:380}}),
 scene('sleep-toys','crouch-book',370,940,.65,'call-the-missing-car'),
 scene('sleep-shoeclose',null,0,0,1,'car-is-inside-a-big-shoe',{shoes:{x:170,ground:940,width:700},carInside:true}),
 scene('sleep-bedroom','barefoot-stand',300,940,.60,'ready-for-my-own-bed')
]}};
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){return [p.background,...(p.bird?['sleep-bird']:[]),...(p.bed?['sleep-pet-bed']:[]),...(p.cat?['sleep-cat']:[]),...(p.shoes?['sleep-shoes','sleep-car']:[])];}
function cover(){return {...BOOKS.sleepy.pages[0],beat:'cover'};}
function prop(c,key,images,p){const [l,t,r,b]=assets[key].bounds,h=p.width*(b-t)/(r-l);c.drawImage(images[key],l,t,r-l,b-t,p.x,p.ground-h,p.width,h);}
function carInShoe(c,p,images){
 const q=p.shoes,b=assets['sleep-shoes'].bounds,s=q.width/(b[2]-b[0]),ox=q.x-b[0]*s,oy=q.ground-b[3]*s;
 // The existing shoe opening occludes the wheels and lower body of the car.
 const opening=[[515,300],[610,215],[710,205],[770,255],[782,335],[743,405],[660,420],[610,365]];
 c.save();c.beginPath();opening.forEach(([x,y],i)=>i?c.lineTo(ox+x*s,oy+y*s):c.moveTo(ox+x*s,oy+y*s));c.clip();
 prop(c,'sleep-car',images,{x:ox+500*s,ground:oy+430*s,width:250*s});c.restore();
}
function beforeActor(c,p,images){
 if(p.bird)prop(c,'sleep-bird',images,p.bird);
 if(p.bed)prop(c,'sleep-pet-bed',images,p.bed);
 if(p.cat)prop(c,'sleep-cat',images,p.cat);
 if(p.shoes){prop(c,'sleep-shoes',images,p.shoes);carInShoe(c,p,images);}
}
function afterActor(){}
function proof(p){return {indoors:true,bird:p.bird||null,birdSleeping:!!p.bird,bed:p.bed||null,cat:p.cat||null,catSleeping:!!p.cat,shoes:p.shoes||null,carInside:!!p.carInside,readyForBed:p.beat==='ready-for-my-own-bed'};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
