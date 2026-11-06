'use strict';
const assets=require('./action-fix-assets'),treeAssets=require('./books-11-13-assets'),bugAssets=require('./priority-three-assets');
const {CHILD_MODEL}=require('./character-rig');
const clone=p=>({...p,camera:{...p.camera},placement:p.placement?{...p.placement}:null,actionFix:true});
const place=(x,ground,scale,sole)=>({x,y:ground-sole/CHILD_MODEL.sourcePixelsPerUnit*scale,scale});
function build(base){
 const result={};for(const id of ['tree-revision','insect-revision','ball-revision','stone-complete','catball-complete','calling-revision'])result[id]={...base[id],pages:base[id].pages.map(clone)};
 const trees=result['tree-revision'].pages;
 for(const [i,p]of trees.entries()){
  p.calibrateAgainstStand=true;p.heightComparison=true;p.treePlacement={x:70,ground:920,width:346};
  if(i>=1&&i<=6)p.background='height-comparison-wall';
  if([1,2,5].includes(i))p.placement={...p.placement,x:535};
  // Once introduced, the stepping stone remains in the scene after stepping down.
  if(i>=3&&i<=6)p.step=true;
 }
 const bug=result['insect-revision'].pages[4];Object.assign(bug,{pose:null,placement:null,bugOnFoot:false,povFeet:true,povBug:{x:647,ground:558,width:90},beat:'look-down-bug-clear-on-my-foot'});
 const search=result['ball-revision'].pages;
 Object.assign(search[1],{pose:null,placement:null,wagon:{x:180,ground:820,width:650},povSearch:{target:[510,600],side:'left'},beat:'my-view-look-inside-cart'});
 Object.assign(search[2],{pose:null,placement:null,wagon:{x:200,ground:790,width:520},povSearch:{target:[810,840],side:'left'},beat:'my-view-look-in-front-of-cart'});
 Object.assign(search[3],{pose:null,placement:null,wagon:{x:350,ground:790,width:520},povSearch:{target:[250,840],side:'right'},beat:'my-view-look-behind-cart'});
 Object.assign(result['stone-complete'].pages[3],{pose:'walk-carry-right',walking:true,beat:'walk-and-carry-the-pebble'});
 Object.assign(result['catball-complete'].pages[5],{pose:'crouch-reach-right',placement:place(350,935,.64,920),red:undefined,pushBall:true,rolling:false,beat:'push-red-ball-right-toward-cat'});
 const call=result['calling-revision'].pages;
 Object.assign(call[2],{pose:'invite-up-right',placement:place(330,930,.56,1180),inviteTarget:'bird',beat:'open-hand-up-toward-bird'});
 Object.assign(call[3],{pose:'crouch-reach-right',placement:place(350,930,.56,920),inviteTarget:'listen-down',beat:'turn-and-listen-toward-ground'});
 Object.assign(call[5],{pose:'crouch-reach-right',placement:place(440,935,.56,920),catPlacement:{x:660,ground:935,width:230},inviteTarget:'cat',beat:'beckon-right-toward-cat'});
 return result;
}
function resolvePlan(p,o){
 if(!p?.calibrateAgainstStand)return p;
 const actor=o.actorByPose?.['stand-wave'];if(!actor)return p;
 const scale=.60,standingCrown=920-1180/CHILD_MODEL.sourcePixelsPerUnit*scale+(actor.bounds.top+CHILD_MODEL.padding)*scale;
 const a=treeAssets['tree-sapling'].bounds,top=standingCrown-45,width=(920-top)*(a[2]-a[0])/(a[3]-a[1]);
 return {...p,standingCrown,treePlacement:{...p.treePlacement,width},treeTop:top};
}
function propBounds(p){return p?.treePlacement?[{left:p.treePlacement.x,right:p.treePlacement.x+p.treePlacement.width,top:p.treeTop||310,bottom:p.treePlacement.ground}]:[];}
function additionalKeys(p){return [...(p.povFeet?['pov-bare-feet','little-bug']:[]),...(p.povSearch?['pov-search-hand']:[]),...(p.pushBall?['cat-red']:[])];}
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function sprite(c,key,images,p,metadata=assets[key]){const [l,t,r,b]=metadata.bounds,h=p.width*(b-t)/(r-l);c.drawImage(images[key],l,t,r-l,b-t,p.x,p.ground-h,p.width,h);}
function afterActor(c,p,o){
 if(p.povFeet){const im=o.assets['pov-bare-feet'];c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);sprite(c,'little-bug',o.assets,p.povBug,bugAssets['little-bug']);}
 if(p.povSearch){const im=o.assets['pov-search-hand'],[x,y]=p.povSearch.target,anchor={x:1140,y:130},s=(1000-y)/(im.height-anchor.y),flip=p.povSearch.side==='right',ax=flip?im.width-anchor.x:anchor.x;c.save();c.translate(x-ax*s,y-anchor.y*s);if(flip){c.translate(im.width*s,0);c.scale(-1,1);}c.drawImage(im,0,0,im.width*s,im.height*s);c.restore();}
 if(p.pushBall){const pose=o.poseLibrary[p.pose],a=pose.attachments.fingertips,s=p.placement.scale/CHILD_MODEL.sourcePixelsPerUnit,q={x:p.placement.x+(a.x-pose.collar.x)*s,y:p.placement.y+(a.y-pose.collar.y)*s};sprite(c,'cat-red',o.assets,{x:q.x+4,ground:q.y+32,width:64},treeAssets['cat-red']);}
}
function proof(p,actor){
 const crown=actor&&p.placement?p.placement.y+(actor.bounds.top+CHILD_MODEL.padding)*p.placement.scale:null;
 return {beat:p.beat,pov:p.povFeet?'look-at-own-foot':p.povSearch?'search-'+p.search:null,searchTarget:p.povSearch?.target||null,bug:p.povBug||null,walking:!!p.walking,pushTowardCat:!!p.pushBall,inviteTarget:p.inviteTarget||null,treeTop:p.treeTop??null,childCrown:crown,standingCrown:p.standingCrown??null,childHigher:p.treeTop!=null&&crown!=null?crown<p.treeTop:null};
}
module.exports={build,resolvePlan,propBounds,additionalKeys,owns,imageUrl,afterActor,proof};
