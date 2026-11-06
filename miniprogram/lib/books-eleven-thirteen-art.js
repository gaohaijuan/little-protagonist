'use strict';
// Scene recipes only place complete, registered child-v1 actors.
const assets=require('./books-11-13-assets');
const {CHILD_MODEL}=require('./character-rig');
const world={width:1000,height:1000},camera={x:0,y:0,width:1000,height:1000};
// Registered source-space sole minus collar; these only anchor the whole actor.
const sole={ 'stand-wave':1180,'hands-flower-open':1174,'carry-play':1175,'crouch-book':959,'crouch-touch':920 };
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world,camera:{...camera},elevenThirteen:true,beat,...extra});
const tree=(background,pose,x,ground,beat)=>scene(background,pose,x,ground,.60,beat,{tree:true,step:background==='tree-comparison'});
const call=(background,pose,beat,extra={})=>scene(background,pose,330,930,.56,beat,extra);
const cat=(background,pose,beat,extra={})=>scene(background,pose,350,935,.64,beat,{cat:'cat-quiet',...extra});
const BOOKS={
 tree:{pages:[
  tree('tree-welcome','stand-wave',680,925,'greet-the-sapling'),
  tree('tree-growth-detail','stand-wave',680,925,'older-height-marks'),
  tree('tree-comparison','stand-wave',485,920,'compare-on-the-ground'),
  tree('tree-comparison','stand-wave',740,810,'stand-on-the-low-stone'),
  tree('tree-comparison','stand-wave',485,920,'back-on-the-ground'),
  tree('tree-welcome','hands-flower-open',680,925,'grow-together')
 ]},
 calling:{pages:[
  call('calling-wide','stand-wave','listen-before-looking',{car:true}),
  call('calling-up',null,'bird-singing-in-the-tree',{bird:'call-bird',birdAt:[500,454],birdWidth:150}),
  call('calling-wide','hands-flower-open','invite-the-bird',{bird:'call-bird',birdAt:[425,225],car:true}),
  call('calling-wide','stand-wave','bird-is-quiet-listen-again',{bird:'call-quiet-bird',birdAt:[425,225],car:true}),
  call('calling-down',null,'cat-calling-under-the-tree',{cat:'call-cat'}),
  call('calling-down','crouch-book','invite-the-cat',{cat:'cat-quiet'}),
  call('calling-wide','stand-wave','empty-branch',{cat:'cat-quiet',car:true}),
  call('calling-wide','hands-flower-open','bird-found-on-my-car',{cat:'cat-quiet',car:true,bird:'call-quiet-bird',birdAt:[840,735]})
 ]},
 catball:{pages:[
  cat('cat-play-wide','carry-play','show-red-ball',{cat:null,red:'leftPalm'}),
  cat('cat-play-wide','carry-play','show-yellow-ball',{cat:null,red:[550,925],yellow:'rightPalm'}),
  cat('cat-offer-close','crouch-book','ask-the-cat',{red:[495,910],yellow:[555,920]}),
  cat('cat-offer-close','crouch-book','offer-red',{red:'rightPalm',yellow:[525,920]}),
  cat('cat-offer-close','crouch-book','offer-yellow',{red:[525,920],yellow:'rightPalm'}),
  cat('cat-offer-close','crouch-book','cat-waits-beside-still-balls',{red:[495,910],yellow:[555,920]}),
  cat('cat-rolling-side','crouch-touch','hand-starts-the-ball',{red:'fingertips',yellow:[315,920],rolling:true}),
  cat('cat-rolling-side','crouch-book','cat-comes-to-play',{cat:'cat-walk',red:[560,910],yellow:[315,920],rolling:true})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){return [p.background,...(p.tree?['tree-sapling']:[]),...(p.step?['tree-step']:[]),...(p.bird?[p.bird]:[]),...(p.car?['call-car']:[]),...(p.cat?[p.cat]:[]),...(p.red?['cat-red']:[]),...(p.yellow?['cat-yellow']:[])];}
function cover(id){const p=BOOKS[id].pages[0];return {...p,pose:'stand-wave',placement:{x:id==='tree'?680:350,y:925-1180/1.8375*.60,scale:.60},red:id==='catball'?[520,910]:undefined,yellow:undefined,beat:'cover'};}
function prop(c,key,images,x,ground,width,source){
 const im=images[key],b=source||assets[key].bounds,[l,t,r,bottom]=b,h=width*(bottom-t)/(r-l);
 c.drawImage(im,l,t,r-l,bottom-t,x,ground-h,width,h);
}
function bird(c,p,images){const key=p.bird,b=assets[key].bounds,w=p.birdWidth||95,s=w/(b[2]-b[0]),[x,y]=p.birdAt;c.drawImage(images[key],b[0],b[1],b[2]-b[0],b[3]-b[1],x-(899-b[0])*s,y-(1154-b[1])*s,w,(b[3]-b[1])*s);}
function beforeActor(c,p,images){
 if(p.tree){const b=assets['tree-sapling'],q=p.treePlacement;if(q)prop(c,'tree-sapling',images,q.x,q.ground,q.width);else prop(c,'tree-sapling',images,80,920,962*650/1330,[0,0,b.size[0],1330]);}
 if(p.step)prop(c,'tree-step',images,570,920,390);
 if(p.car)prop(c,'call-car',images,700,930,280);
 if(p.bird)bird(c,p,images);
 if(p.cat){const q=p.catPlacement;prop(c,p.cat,images,q?q.x:p.cat==='cat-walk'?640:p.car?520:720,q?q.ground:935,q?q.width:p.cat==='cat-walk'?270:p.car?165:210);}
}
function point(p,attachment,model,library){const pose=library[p.pose],q=pose.attachments[attachment];if(!q)throw Error('Missing registered attachment: '+attachment);return [p.placement.x+(q.x-pose.collar.x)/model.sourcePixelsPerUnit*p.placement.scale,p.placement.y+(q.y-pose.collar.y)/model.sourcePixelsPerUnit*p.placement.scale];}
function afterActor(c,p,images,model,library){
 for(const [color,key] of [['red','cat-red'],['yellow','cat-yellow']]){
  if(!p[color])continue;let center=p[color];if(typeof center==='string'){center=point(p,center,model,library);center=[center[0]+(p[color]==='fingertips'?32:0),center[1]-27];}
  prop(c,key,images,center[0]-32,center[1]+32,64);
 }
 if(p.rolling){c.save();c.strokeStyle='#b18e5c';c.lineWidth=2;c.setLineDash([7,8]);c.beginPath();c.moveTo(395,957);c.lineTo(605,957);c.stroke();c.setLineDash([]);for(const [x,d] of [[395,1],[605,-1]]){c.beginPath();c.moveTo(x+12*d,949);c.lineTo(x,957);c.lineTo(x+12*d,965);c.stroke();}c.restore();}
}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor};
