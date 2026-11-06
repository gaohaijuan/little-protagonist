'use strict';
const assets=require('./level2-last-three-assets');
const drawing=require('./level2-last-drawing-scenes');
const {CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'jump-forward':1183,'crouch-reach-right':918,'crouch-book':959};
function scene(background,pose,x,ground,scale,beat,extra={}){return {background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2Last:true,kind:'jump',beat,...extra};}
const rabbit=(key,x,ground,width,extra={})=>({key,x,ground,width,...extra});
const rock={key:'jump-stone',x:505,ground:925,width:215};
const paper={key:'jump-paper',x:442,ground:920,width:145,flat:.36};
const BOOKS={...drawing.BOOKS,'level2-jump':{pages:[
 scene('jump-garden-wide','stand-wave',270,935,.56,'watch-the-rabbit-and-want-to-learn',{rabbit:rabbit('white-rabbit-alert',725,925,200),stone:rock}),
 scene('jump-ground-close',null,0,0,1,'rabbit-clears-the-stone',{rabbit:rabbit('white-rabbit-jump',495,725,330),stone:rock,camera:{x:270,y:370,width:700,height:630},rabbitClears:true}),
 scene('jump-ground-close','jump-forward',315,835,.58,'first-jump-stops-before-the-stone',{rabbit:rabbit('white-rabbit-alert',775,925,165),stone:rock,jumpShadow:{x:315,y:925,width:180},failedAttempt:true}),
 scene('jump-ground-close','crouch-book',275,935,.62,'look-closely-the-stone-is-too-high',{stone:rock,rabbit:rabbit('white-rabbit-alert',700,925,135),camera:{x:10,y:250,width:940,height:750}}),
 scene('jump-ground-close','crouch-reach-right',365,935,.59,'place-a-small-paper-on-the-ground',{paper:{...paper,x:535},rabbit:rabbit('white-rabbit-alert',770,925,165),paperPlaced:true}),
 scene('jump-garden-wide','stand-wave',245,935,.56,'choose-the-flat-paper-for-practice',{paper,rabbit:rabbit('white-rabbit-alert',775,925,180)}),
 scene('jump-garden-wide','jump-forward',650,815,.58,'jump-across-the-paper-successfully',{paper,rabbit:rabbit('white-rabbit-alert',820,925,145),jumpShadow:{x:650,y:925,width:180},clearedPaper:true}),
 scene('jump-ground-close','hands-flower-open',655,935,.58,'land-on-the-other-side-and-show-rabbit',{paper,rabbit:rabbit('white-rabbit-alert',145,925,185,{flip:true}),clearedPaper:true})
]}};
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){return p.kind==='jump'?[p.background,...[p.rabbit,p.stone,p.paper].filter(Boolean).map(a=>a.key)]:drawing.assetKeys(p);}
function cover(id){
 if(id==='level2-jump')return scene('jump-garden-wide','jump-forward',570,770,.56,'cover',{paper:{...paper,x:330,ground:855},rabbit:rabbit('white-rabbit-alert',700,855,140),jumpShadow:{x:570,y:855,width:180},clearedPaper:true});
 const index=id==='level2-train'?4:6;return {...BOOKS[id].pages[index],beat:'cover'};
}
function prop(c,images,q){const a=assets[q.key],[l,t,r,b]=a.bounds,w=q.width,h=w*(b-t)/(r-l)*(q.flat||1);c.save();if(q.flip){c.translate(q.x+w,q.ground-h);c.scale(-1,1);c.drawImage(images[q.key],l,t,r-l,b-t,0,0,w,h);}else c.drawImage(images[q.key],l,t,r-l,b-t,q.x,q.ground-h,w,h);c.restore();}
function beforeActor(c,p,images){
 if(p.kind!=='jump')return drawing.beforeActor(c,p,images);
 if(p.jumpShadow){const q=p.jumpShadow;c.save();c.fillStyle='rgba(88,66,35,.16)';c.beginPath();c.ellipse(q.x,q.y,q.width/2,17,0,0,Math.PI*2);c.fill();c.restore();}
 if(p.stone)prop(c,images,p.stone);if(p.paper)prop(c,images,p.paper);if(p.rabbit)prop(c,images,p.rabbit);
}
function afterActor(c,p,o){if(p.kind!=='jump')return drawing.afterActor(c,p,o);}
function proof(p){return p.kind!=='jump'?drawing.proof(p):{beat:p.beat,pose:p.pose,background:p.background,rabbit:p.rabbit||null,stone:p.stone||null,paper:p.paper||null,rabbitClears:!!p.rabbitClears,failedAttempt:!!p.failedAttempt,clearedPaper:!!p.clearedPaper,paperPlaced:!!p.paperPlaced};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
