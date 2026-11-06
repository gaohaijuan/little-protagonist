'use strict';
const assets=require('./level2-fourth-three-assets'),birdArt=require('./books-eleven-thirteen-art');
const {CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'invite-up-right':1176,'sit-read':851,'sit-doze':851,'crouch-reach-right':918,'crouch-book':959,'crouch-palm':871};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2Fourth:true,beat,...extra});
const dawn=(background,pose,beat,extra={})=>scene(background,pose,300,1420,.57,beat,{world:{width:1000,height:1500},camera:{x:0,y:450,width:1000,height:1024},dad:{x:800,ground:1420,scale:1.9},actorExposure:background==='l2-dawn-night'?.74:1,...extra});
const rabbit=(key,x,ground,width,extra={})=>({key,x,ground,width,...extra});
const moon=(pose,beat,extra={})=>scene('moon-pond-wide',pose,250,930,.51,beat,{actorExposure:.8,rabbit:rabbit('white-rabbit-alert',405,875,245,{flip:true}),reflection:'calm',...extra});
const garden=(pose,beat,extra={})=>scene('l2-rabbit-garden',pose,300,945,.66,beat,{rabbit:rabbit('white-rabbit-alert',665,945,240),...extra});
const BOOKS={
 'level2-sunrise':{parents:['dad'],pages:[
  dawn('l2-dawn-night','stand-wave','arrive-before-sunrise'),
  dawn('l2-dawn-night',null,'dark-sky-sun-not-up',{dad:null,camera:{x:60,y:180,width:900,height:1000}}),
  dawn('l2-dawn-night','invite-up-right','call-the-sun-to-get-up'),
  dawn('l2-dawn-night','sit-doze','sit-wait-and-doze-off'),
  dawn('l2-dawn-sun','sit-doze','dad-calls-the-child-sun-is-up'),
  dawn('l2-dawn-sun','invite-up-right','child-wakes-and-sees-the-red-sky'),
  dawn('l2-dawn-sun','hands-flower-open','dad-teases-the-late-sleeper')
 ]},
 'level2-moon':{pages:[
  moon(null,'moon-in-sky-and-calm-water',{rabbit:null}),
  moon('crouch-book','child-and-white-rabbit-at-water'),
  moon(null,'rabbit-drinks-water-ripples',{background:'moon-pond-close',rabbit:rabbit('white-rabbit-drink',80,865,480,{flip:true}),reflection:'broken',ripples:1}),
  moon(null,'water-moon-no-longer-visible',{background:'moon-pond-close',rabbit:rabbit('white-rabbit-drink',80,865,480,{flip:true}),reflection:'none',ripples:1}),
  moon('crouch-reach-right','ask-if-rabbit-drank-the-moon',{rabbit:rabbit('white-rabbit-drink',405,875,245,{flip:true}),reflection:'none',ripples:.7}),
  moon('crouch-book','rabbit-stops-and-water-becomes-still',{ripples:0}),
  moon(null,'same-moon-reflection-returns',{background:'moon-pond-close',rabbit:null,reflection:'calm'})
 ]},
 'level2-rabbit':{pages:[
  garden('crouch-reach-right','look-at-the-white-rabbit'),
  garden('stand-wave','compare-long-rabbit-and-small-child-ears'),
  garden('invite-up-right','both-listen-to-bird-in-tree',{background:'l2-rabbit-bird-garden',bird:true}),
  garden('crouch-book','red-rabbit-eye-and-black-child-eyes'),
  garden(null,'rabbit-listens-to-the-smiling-child-offscreen',{rabbit:rabbit('white-rabbit-alert',180,965,620),reverseOnRabbit:true}),
  garden('crouch-reach-right','ask-rabbit-about-its-teeth'),
  scene('l2-rabbit-garden-end','crouch-palm',740,945,.66,'offer-one-cabbage-leaf',{rabbit:rabbit('white-rabbit-alert',200,945,240,{flip:true}),leaf:{at:'palm',width:205,flip:false}}),
  garden(null,'tiny-rabbit-teeth-revealed-while-eating',{background:'l2-rabbit-garden-end',rabbit:rabbit('white-rabbit-teeth',90,990,840),teethReveal:true})
 ]}
};
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){return [p.background,...(p.rabbit?[p.rabbit.key]:[]),...(p.reflection?['l2-moon-disc']:[]),...(p.bird?['call-bird']:[]),...(p.leaf?['l2-cabbage-leaf']:[])];}
function cover(id){return id==='level2-moon'?{...BOOKS[id].pages[6],camera:{x:0,y:260,width:1000,height:740},beat:'cover'}:{...BOOKS[id].pages[id==='level2-sunrise'?5:0],beat:'cover'};}
function prop(c,images,q,exposure=1){const meta=assets[q.key],[l,t,r,b]=meta.bounds,h=q.width*(b-t)/(r-l);c.save();if(exposure!==1)c.filter='brightness('+exposure+')';if(q.flip){c.translate(q.x+q.width,q.ground-h);c.scale(-1,1);c.drawImage(images[q.key],l,t,r-l,b-t,0,0,q.width,h);}else c.drawImage(images[q.key],l,t,r-l,b-t,q.x,q.ground-h,q.width,h);c.restore();return {x:q.x,y:q.ground-h,width:q.width,height:h};}
function water(c,p,images){
 const close=p.background==='moon-pond-close',cx=close?765:727,cy=close?845:850,w=close?130:100,h=close?100:78,im=images['l2-moon-disc'];
 c.save();c.globalAlpha=.7;
 if(p.reflection==='calm'){c.save();c.translate(cx,cy);c.scale(1,-1);c.drawImage(im,-w/2,-h/2,w,h);c.restore();}
 if(p.reflection==='broken'){for(let i=0;i<24;i++){const sh=im.height/24,dx=Math.sin(i*.65)*10;c.drawImage(im,0,(23-i)*sh,im.width,sh,cx-w/2+dx,cy-h/2+i*h/24,w,h/24*.82);}}
 c.restore();
 if(p.ripples){c.save();c.strokeStyle='rgba(164,188,211,'+(.65*p.ripples)+')';c.lineWidth=2;const x=close?535:620,y=close?835:860;for(const r of [22,55,100,165,245]){c.beginPath();c.ellipse(x,y,r,r*.22,0,0,Math.PI*2);c.stroke();}c.restore();}
}
function beforeActor(c,p,images){if(p.reflection)water(c,p,images);if(p.rabbit)prop(c,images,p.rabbit,p.reflection?.8:1);if(p.bird)birdArt.beforeActor(c,{bird:'call-bird',birdAt:[425,225],birdWidth:100},images);}
function afterActor(c,p,o){
 if(p.dad){const actor=o.preparedActors?.dad;if(!actor)throw Error('爸爸整个人物尚未准备好');const a=actor.composite,q=p.dad;c.save();if(p.actorExposure)c.filter='brightness('+p.actorExposure+')';c.drawImage(a.image,q.x+a.left*q.scale,q.ground+a.top*q.scale,a.width*q.scale,a.height*q.scale);c.restore();}
 if(p.leaf){const pose=o.poseLibrary[p.pose],a=pose.attachments[p.leaf.at],s=p.placement.scale/o.model.sourcePixelsPerUnit,x=p.placement.x+(a.x-pose.collar.x)*s,y=p.placement.y+(a.y-pose.collar.y)*s,im=o.assets['l2-cabbage-leaf'],q=assets['l2-cabbage-leaf'],scale=p.leaf.width/(q.bounds[2]-q.bounds[0]);c.save();c.translate(x,y);c.scale(p.leaf.flip===false?scale:-scale,scale);c.drawImage(im,-1580,-720);c.restore();}
}
function proof(p){return {beat:p.beat,pose:p.pose,dad:!!p.dad,background:p.background,reflection:p.reflection||null,ripples:p.ripples||0,rabbit:p.rabbit||null,leaf:!!p.leaf,bird:!!p.bird,teethReveal:!!p.teethReveal,reverseOnRabbit:!!p.reverseOnRabbit,actorExposure:p.actorExposure||1};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
