'use strict';
const assets=require('./level2-review-fixes-assets'),oldFruit=require('./books-seventeen-nineteen-art');
const {CHILD_MODEL}=require('./character-rig');
const place=(x,ground,scale,sole)=>({x,y:ground-sole/CHILD_MODEL.sourcePixelsPerUnit*scale,scale});
function apply(input){
 const books={...input};for(const id of ['level2-shoes','level2-morning','level2-who-laughs','level2-fruit','level2-rabbit'])books[id]={...input[id],pages:input[id].pages.map(p=>({...p,placement:p.placement?{...p.placement}:null,camera:{...p.camera}}))};
 Object.assign(books['level2-shoes'].pages[2],{reviewFix:true,fixType:'shoes',level2First:false,fourteenSixteen:false,bigShoes:null,pose:'wear-big-shoes',placement:place(500,954,.70,1241.67),wearing:'big',anklesInsideShoes:true});
 Object.assign(books['level2-morning'].pages[5],{reviewFix:true,fixType:'bed',emptyBed:{key:'morning-empty-bed',x:360,ground:960,width:610},dad:{...books['level2-morning'].pages[5].dad,x:530,ground:975}});
 const who=books['level2-who-laughs'].pages;
 for(let i=0;i<7;i++){
  Object.assign(who[i],{reviewFix:true,fixType:'laugh',level2Third:false,dadBack:null,dad:null,storyPortrait:i<6?'neutral':null,dadFigure:{key:i<5?'dad-seated-neutral-front':'dad-seated-smile-front',x:600,ground:945,height:600},childNotLaughing:i<6,dadNotLaughing:i<5,dadLaughing:i>=5,photoPov:i<5,photoHands:[1,2].includes(i)?'pov-rabbit-hands':i===4?'pov-cat-hands':null});
  if(who[i].pose)who[i].placement=place(290,940,.59,who[i].pose==='stand-wave'?1180:who[i].pose==='hands-flower-open'?1174:1176);
 }
 Object.assign(who[3],{pose:null,placement:null,camera:{x:470,y:280,width:530,height:620},dadExpressionClose:true});
 const fruit=books['level2-fruit'].pages;
 for(const i of [4,5,6]){Object.assign(fruit[i],{reviewFix:true,fixType:'fruit',seventeenNineteen:false,level2Third:false});fruit[i].small={...fruit[i].small,bitten:i>=5};fruit[i].big={...fruit[i].big,bitten:true};}
 Object.assign(books['level2-rabbit'].pages[4],{reviewFix:true,fixType:'teeth',level2Fourth:false,pose:'crouch-book',placement:place(345,950,.91,959),camera:{x:0,y:0,width:1000,height:1000},rabbit:{key:'white-rabbit-alert',x:705,ground:950,width:260},reverseOnRabbit:false,storyPortrait:'teeth',childTeethVisible:true,beat:'child-smiles-with-visible-teeth-rabbit-looks-at-child'});
 return books;
}
function portrait(which){const m=assets[which==='neutral'?'child-neutral-head':'child-teeth-head'];return {url:m.url,metrics:m.metrics};}
function resolvePlan(p,o){if(p?.photoPov&&o.portraitKind==='cutout')return {...p,pose:null,placement:null,storyPortrait:null,firstPerson:true};return p;}
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){
 if(p.fixType==='fruit')return [p.background,p.friend.key,'fruit-eaten-clear',...(!p.small.bitten?['fruit-whole']:[])];
 return [p.background,...(p.emptyBed?['morning-empty-bed']:[]),...(p.dadFigure?[p.dadFigure.key]:[]),...(p.photoHands?[p.photoHands]:[]),...(p.rabbit?[p.rabbit.key]:[])];
}
function sprite(c,images,q,meta=assets[q.key]){const [l,t,r,b]=meta.bounds,w=q.width||q.height*(r-l)/(b-t),h=q.height||w*(b-t)/(r-l);c.drawImage(images[q.key],l,t,r-l,b-t,q.x,q.ground-h,w,h);}
function beforeActor(c,p,o){if(p.emptyBed)sprite(c,o.assets,p.emptyBed);if(p.dadFigure)sprite(c,o.assets,p.dadFigure);if(p.fixType==='teeth'){const meta=require('./level2-fourth-three-assets')[p.rabbit.key];sprite(c,o.assets,p.rabbit,meta);}if(p.fixType==='fruit')oldFruit.beforeActor(c,p,o.assets);}
function afterActor(c,p,o){
 if(p.firstPerson&&p.photoHands){const im=o.assets[p.photoHands];c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000*im.height/im.width);}
 if(p.fixType==='fruit')for(const[k,width]of [['small',72],['big',108]]){
  const f=p[k];let x,y;
  if(f.at.startsWith('friend')){const a=f.at==='friendBite'?[375,520]:[150,680],s=p.friend.height/1536;x=p.friend.x+a[0]*s;y=p.friend.ground-p.friend.height+a[1]*s;}
  else{const pose=o.poseLibrary[p.pose],a=pose.attachments[f.at],s=p.placement.scale/o.model.sourcePixelsPerUnit;x=p.placement.x+(a.x-pose.collar.x)*s;y=p.placement.y+(a.y-pose.collar.y)*s;}
  const key=f.bitten?'fruit-eaten-clear':'fruit-whole',meta=f.bitten?assets[key]:require('./books-17-19-assets')[key];sprite(c,o.assets,{key,x:x-width/2,ground:y+5,width},meta);
 }
}
function proof(p,o){return {type:p.fixType,beat:p.beat,childNotLaughing:!!p.childNotLaughing,dadNotLaughing:!!p.dadNotLaughing,dadLaughing:!!p.dadLaughing,dadExpressionClose:!!p.dadExpressionClose,firstPerson:!!p.firstPerson,realPortraitExpressionPreserved:o.portraitKind==='cutout',storyPortrait:o.portraitKind==='cutout'?null:p.storyPortrait||null,childVisible:!!p.pose,childTeethVisible:!!p.childTeethVisible&&o.portraitKind!=='cutout',emptyBed:p.emptyBed||null,anklesInsideShoes:!!p.anklesInsideShoes,smallBitten:!!p.small?.bitten,bigBitten:!!p.big?.bitten};}
module.exports={apply,portrait,resolvePlan,owns,imageUrl,assetKeys,beforeActor,afterActor,proof};
