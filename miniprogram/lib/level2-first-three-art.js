'use strict';
const assets=require('./level2-first-three-assets'),shoeArt=require('./books-fourteen-sixteen-art'),sleepArt=require('./book-twenty-art'),garageArt=require('./first-ten-art'),{CHILD_MODEL}=require('./character-rig');
const carMetadata=require('./book-20-assets')['sleep-car'];
const sole={'stand-wave':1180,'hands-flower-open':1174,'barefoot-stand':1130,'barefoot-step':1147,'step-own-shoes':1171,'crouch-book':959,'reach-water':1132,'sit-read':1020,'run-left':1180};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2First:true,beat,...extra});
const clone=(p,beat,extra={})=>({...p,camera:{...p.camera},placement:p.placement?{...p.placement}:null,level2First:true,beat,...extra});
const shoes=shoeArt.BOOKS.shoes.pages,sleep=sleepArt.BOOKS.sleepy.pages;
const nightGarage={garage:{x:465,y:535,width:485},closed:true};
const BOOKS={
 'level2-shoes':{pages:[
  clone(shoes[0],'show-my-small-shoes'),clone(shoes[1],'dads-big-shoes'),clone(shoes[2],'try-dads-big-shoes'),clone(shoes[3],'feet-slip-out-on-first-step'),
  clone(shoes[3],'try-again-feet-out',{pose:'barefoot-stand',placement:{x:700,y:930-1130/CHILD_MODEL.sourcePixelsPerUnit*.70,scale:.70}}),
  scene('shoes-bench','crouch-book',640,945,.70,'put-away-big-shoes-wear-small',{fourteenSixteen:true,bigShoes:{x:125,ground:950,width:285},wearing:'own'}),
  clone(shoes[5],'walk-in-my-own-shoes')
 ]},
 'level2-sleepy':{pages:[
  clone(sleep[0],'evening-not-ready-for-bed',{looseCar:{x:560,ground:935,width:145}}),clone(sleep[1],'invite-the-bird',{looseCar:{x:560,ground:935,width:145}}),clone(sleep[2],'bird-asleep-in-tree'),clone(sleep[3],'invite-the-cat'),clone(sleep[4],'cat-asleep-on-small-bed'),
  scene('sleep-toys','reach-water',365,940,.60,'store-car-and-close-door',{nightGarage,carStored:true}),
  scene('sleep-toys','hands-flower-open',300,940,.60,'say-goodnight-to-stored-car',{nightGarage,carStored:true}),
  clone(sleep[7],'ready-for-bed-play-tomorrow')
 ]},
 'level2-morning':{parents:['dad'],pages:[
  scene('morning-child-room','barefoot-stand',290,940,.62,'child-up-early'),
  scene('shoes-bench','hands-flower-open',390,940,.62,'ready-to-go-out-with-dad'),
  scene('shoes-bench','crouch-book',540,945,.68,'child-dressed-and-shoes-on'),
  scene('morning-parent-room','stand-wave',220,945,.51,'discover-dad-still-asleep',{sleepingDad:{x:360,ground:960,width:610}}),
  scene('morning-parent-room','hands-flower-open',220,945,.51,'call-dad-im-ready',{sleepingDad:{x:360,ground:960,width:610}}),
  scene('morning-parent-room','stand-wave',235,945,.52,'dad-up-and-dressed',{dad:{x:700,ground:945,scale:1.65}}),
  scene('shoes-bench','sit-read',370,925,.62,'wait-for-dad-at-door'),
  scene('morning-outside','run-left',320,940,.52,'go-out-together',{dad:{x:700,ground:940,scale:1.65}})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){return [...new Set([...(p.fourteenSixteen?shoeArt.assetKeys(p):p.twenty?sleepArt.assetKeys(p):[p.background]),...(p.sleepingDad?['morning-dad-bed']:[]),...(p.looseCar?['toy-car']:[]),...(p.nightGarage?garageArt.assetKeys({...p.nightGarage,background:p.background}):[])])];}
function cover(id){return {...BOOKS[id].pages[0],beat:'cover'};}
function prop(c,key,images,p,metadata=assets[key]){const b=metadata.bounds,[l,t,r,bot]=b,h=p.width*(bot-t)/(r-l);c.drawImage(images[key],l,t,r-l,bot-t,p.x,p.ground-h,p.width,h);}
function beforeActor(c,p,images){
 if(p.sleepingDad)prop(c,'morning-dad-bed',images,p.sleepingDad);
 if(p.looseCar)prop(c,'toy-car',images,p.looseCar,carMetadata);
 if(p.nightGarage)garageArt.beforeActor(c,{...p.nightGarage},images);
}
function afterActor(c,p,o){
 if(p.dad){const actor=o.preparedActors?.dad;if(!actor)throw Error('爸爸整个人物尚未准备好');const a=actor.composite,q=p.dad;c.drawImage(a.image,q.x+a.left*q.scale,q.ground+a.top*q.scale,a.width*q.scale,a.height*q.scale);}
}
function proof(p){return {sleepingDad:!!p.sleepingDad,fatherStanding:!!p.dad,carStored:!!p.carStored,garageClosed:!!p.nightGarage?.closed,wearing:p.wearing||null,beat:p.beat};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
