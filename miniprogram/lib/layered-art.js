'use strict';
const firstTen=require('./first-ten-art');
const nextThree=require('./books-eleven-thirteen-art');
const currentThree=require('./books-fourteen-sixteen-art');
const finalThree=require('./books-seventeen-nineteen-art');
const lastBook=require('./book-twenty-art');
const priorityThree=require('./priority-three-art');
const localEight=require('./local-eight-art');
const completeFour=require('./complete-four-art');
const level2First=require('./level2-first-three-art');
const level2Next=require('./level2-next-three-art');
const level2Third=require('./level2-third-three-art');
const level2Fourth=require('./level2-fourth-three-art');
const actionFix=require('./action-fixes-art');
const base='./art/sequence/layered-v1/';
const actorIds=new WeakMap();let nextActorId=0;
const camera=(x=0,y=0,width=1087,height=941)=>({x,y,width,height});
const page=(background,pose,x,y,scale,view=camera(),extra={})=>({background,pose,placement:pose?{x,y,scale}:null,camera:view,...extra});
// These retain the existing story order and scene identities. No facial
// dimensions, neck corrections or per-page portrait geometry are permitted.
const BOOKS={
  intro:{pages:[
    page('intro-greeting','stand-wave',675,379,.70,camera(450,0,920,941)),
    page('intro-play','stand-wave',580,340,.83,camera(210,0,800,941)),
    page('intro-greeting','stand-wave',675,379,.70,camera(0,0,1087,941)),
    page('intro-play','stand-wave',580,340,.83),
    page('intro-school','stand-wave',540,340,.83),
    page('intro-school','stand-wave',540,340,.83,camera(220,0,800,941))
  ]},
  flower:{pages:[
    page('flower-care','crouch-book',590,440,.76),
    page('flower-care',null,0,0,1,camera(560,430,460,480)),
    page('flower-wind','run-left',520,345,.78,camera(0,0,920,941),{petals:2}),
    page('flower-wind','run-left',520,345,.78,camera(0,0,920,941),{petals:3}),
    page('flower-wind','run-left',520,345,.78,camera(0,0,920,941),{petals:4}),
    page('flower-search','crouch-palm',610,430,.78)
  ]},
  hands:{pages:[
    page('hands-room','stand-wave',600,300,.88,camera(220,0,860,941)),
    page('hands-room','hands-flower-open',600,300,.88,camera(220,0,860,941)),
    page('hands-room','hands-flower-closed',600,300,.88,camera(220,0,860,941)),
    page('hands-room','hands-flower-closed',600,300,.88,camera(260,0,800,850)),
    page('hands-room','hands-flower-open',600,300,.88,camera(260,0,800,850)),
    page('hands-room','hands-flower-open',600,300,.88,camera(260,0,800,850))
  ]},
  rain:{pages:[
    page('rain-sky',null,0,0,1),
    page('rain-alone',null,0,0,1,camera(730,310,330,600)),
    page('rain-alone','hold-umbrella',516,445,.55,camera(100,0,985,941),{umbrella:'held'}),
    page('rain-alone',null,0,0,1,camera(745,445,300,445)),
    page('rain-alone','hold-umbrella',516,445,.55,camera(100,0,985,941),{umbrella:'held'}),
    page('rain-walk','hold-umbrella',650,445,.55,camera(130,0,955,941),{umbrella:'held'}),
    page('rain-shelter','crouch-book',515,560,.60,camera(100,0,985,941),{umbrella:'shared'}),
    page('rain-shelter','crouch-book',515,560,.60,camera(100,0,985,941),{umbrella:'shared'})
  ]},
  stone:{pages:[
    page('stone-home','crouch-palm',620,390,.73),
    page('stone-home',null,0,0,1,camera(0,390,440,390)),
    page('stone-hold','carry-play',580,300,.83,camera(180,0,820,941),{pebble:true}),
    page('stone-walk','carry-play',620,300,.83,camera(),{pebble:true}),
    page('stone-walk','carry-play',650,300,.83,camera(180,0,900,941),{pebble:true}),
    page('stone-return','crouch-palm',620,390,.73),
    page('stone-return',null,0,0,1,camera(0,390,440,390)),
    page('stone-leave','run-left',620,300,.83)
  ]}
};
const URLS={'rain-sky':'./art/sequence/rain/rain-sky.webp',petal:'./art/flower/petal.webp',umbrella:base+'rain-umbrella.webp',pebble:'./art/sequence/books-06-10/pebble.png'};
Object.assign(BOOKS,firstTen.BOOKS,nextThree.BOOKS,currentThree.BOOKS,finalThree.BOOKS,lastBook.BOOKS);
Object.assign(BOOKS,priorityThree.BOOKS);
Object.assign(BOOKS,localEight.BOOKS);
Object.assign(BOOKS,completeFour.build(BOOKS));
Object.assign(BOOKS,level2First.BOOKS);
Object.assign(BOOKS,level2Next.BOOKS);
Object.assign(BOOKS,level2Third.BOOKS);
Object.assign(BOOKS,level2Fourth.BOOKS);
Object.assign(BOOKS,actionFix.build(BOOKS));
function imageUrl(key){if(level2Fourth.owns(key))return level2Fourth.imageUrl(key);if(level2Third.owns(key))return level2Third.imageUrl(key);if(level2Next.owns(key))return level2Next.imageUrl(key);if(actionFix.owns(key))return actionFix.imageUrl(key);if(level2First.owns(key))return level2First.imageUrl(key);if(completeFour.owns(key))return completeFour.imageUrl(key);if(localEight.owns(key))return localEight.imageUrl(key);if(priorityThree.owns(key))return priorityThree.imageUrl(key);if(lastBook.owns(key))return lastBook.imageUrl(key);if(finalThree.owns(key))return finalThree.imageUrl(key);if(currentThree.owns(key))return currentThree.imageUrl(key);if(nextThree.owns(key))return nextThree.imageUrl(key);return URLS[key]||(Object.values(firstTen.BOOKS).some(b=>b.pages.some(p=>p.background===key))||['mountain-cloud','mountain-foreground','garage-open','garage-closed','toy-car','toy-ball'].includes(key)?firstTen.imageUrl(key):base+key+'.webp');}
function planFor(id,index=0,options={}){
  const book=BOOKS[id];if(!book)return null;
  const p=book.pages[Math.max(0,Math.min(book.pages.length-1,Math.floor(Number(index)||0)))];
  if(options.cover||options.framing==='hero'){
    if(id==='tree-revision')return {...BOOKS[id].pages[0],beat:'cover'};
    if(level2Fourth.BOOKS[id])return level2Fourth.cover(id);
    if(level2Third.BOOKS[id])return level2Third.cover(id);
    if(level2Next.BOOKS[id])return level2Next.cover(id);
    if(level2First.BOOKS[id])return level2First.cover(id);
    if(completeFour.sourceIds[id])return planFor(completeFour.sourceIds[id],0,options);
    if(localEight.BOOKS[id])return standingCover(localEight.cover(id));
    if(priorityThree.BOOKS[id])return standingCover(priorityThree.cover(id));
    if(firstTen.BOOKS[id])return firstTen.cover(id);
    if(nextThree.BOOKS[id])return nextThree.cover(id);
    if(currentThree.BOOKS[id])return currentThree.cover(id);
    if(finalThree.BOOKS[id])return finalThree.cover(id);
    if(lastBook.BOOKS[id])return lastBook.cover(id);
    // Shelf covers use the same standing actor already needed by books 1–3.
    // Looking at six covers must not prepare all six books' action libraries.
    const source=book.pages[id==='rain'?2:0];
    return {...source,pose:'stand-wave',placement:{x:id==='flower'?530:source.placement?.x||600,y:id==='rain'?450:360,scale:id==='rain'?.58:.73},camera:camera(id==='intro'?450:140,0,id==='intro'?920:945,941),petals:undefined,pebble:false,umbrella:id==='rain'?'shared':undefined};
  }
  return p;
}
// Shelf thumbnails share the standing actor and never request every story's
// body actions outside the rolling reading window. Keep the original sole line.
function standingCover(p){
  if(!p.pose||p.pose==='stand-wave')return p;
  const sole={'hands-flower-open':1174,'barefoot-stand':1130,'crouch-book':959};
  const y=p.placement.y+((sole[p.pose]??1180)-1180)/require('./character-rig').CHILD_MODEL.sourcePixelsPerUnit*p.placement.scale;
  return {...p,pose:'stand-wave',placement:{...p.placement,y}};
}
function dependencies(id){return [...new Set(['stand-wave',...(BOOKS[id]?.pages.map(p=>p.pose).filter(Boolean)||[])])];}
function baseAssetKeys(plan){return plan.level2Fourth?level2Fourth.assetKeys(plan):plan.level2Third?level2Third.assetKeys(plan):plan.level2Next?level2Next.assetKeys(plan):plan.level2First?level2First.assetKeys(plan):plan.localEight?localEight.assetKeys(plan):plan.priorityThree?priorityThree.assetKeys(plan):plan.twenty?lastBook.assetKeys(plan):plan.seventeenNineteen?finalThree.assetKeys(plan):plan.fourteenSixteen?currentThree.assetKeys(plan):plan.elevenThirteen?nextThree.assetKeys(plan):plan.firstTen?firstTen.assetKeys(plan):[plan.background,...(plan.petals?[ 'petal']:[]),...(plan.umbrella?['umbrella']:[]),...(plan.pebble?['pebble']:[])];}
function assetKeys(plan){return [...new Set([...baseAssetKeys(plan),...actionFix.additionalKeys(plan)])];}
function boundsAt(actor,p){return {left:p.x+actor.bounds.left*p.scale,right:p.x+actor.bounds.right*p.scale,top:p.y+actor.bounds.top*p.scale,bottom:p.y+actor.bounds.bottom*p.scale};}
function cameraFor(plan,actor,ratio,propBounds=[]){
  let v={...plan.camera};
  // Crop the scenery to the physical panel before expanding for the actor.
  // This avoids adding empty bands above/below a landscape source image.
  const objectDetail=!actor&&(v.width<700||v.height<700);
  if(!objectDetail){
    if(v.width/v.height>ratio){const width=v.height*ratio;v.x+=(v.width-width)/2;v.width=width;}
    else{const height=v.width/ratio;v.y+=(v.height-height)/2;v.height=height;}
  }
  if(actor){const b=boundsAt(actor,plan.placement),pad=22;
    const left=Math.min(v.x,b.left-pad),top=Math.min(v.y,b.top-pad),right=Math.max(v.x+v.width,b.right+pad),bottom=Math.max(v.y+v.height,b.bottom+pad);
    v={x:left,y:top,width:right-left,height:bottom-top};
  }
  for(const b of propBounds){const left=Math.min(v.x,b.left-22),top=Math.min(v.y,b.top-22),right=Math.max(v.x+v.width,b.right+22),bottom=Math.max(v.y+v.height,b.bottom+22);v={x:left,y:top,width:right-left,height:bottom-top};}
  const width=Math.max(v.width,v.height*ratio),height=Math.max(v.height,v.width/ratio);
  return {x:v.x-(width-v.width)/2,y:v.y-(height-v.height)/2,width,height};
}
function petals(c,image,phase){
  const released=phase===2?4:phase===3?8:11,settled=phase===2?0:phase===3?4:8;
  const flight=[[620,260,1.2],[710,208,.9],[790,250,-.9],[840,174,1.6],[650,285,.8],[750,192,1.1],[810,305,.4],[840,236,-.6],[670,244,.7],[770,193,1.2],[830,295,-.8]];
  const ground=[[125,810,-.5],[255,825,.8],[195,855,2.3],[620,850,.5],[710,815,-.7],[760,870,1.2],[805,840,.2],[830,870,-.5]];
  const scale=Math.min(40/510,78/995);
  for(let i=0;i<11;i++){
    const angle=i*Math.PI*2/11,p=i>=released?[153+Math.sin(angle)*22,563-Math.cos(angle)*22,angle]:i<settled?ground[i]:flight[i];
    c.save();c.translate(p[0],p[1]);c.rotate(p[2]);const s=scale*(i<settled?.78:i<released?.95:1);c.drawImage(image,-632*s,-1120*s,image.width*s,image.height*s);c.restore();
  }
}
function umbrellaPlacement(plan,model,library){
  if(plan.umbrellaTransform)return plan.umbrellaTransform;
  if(plan.umbrella==='shared')return {x:123,y:30,scale:.8,rotation:0,anchor:{x:0,y:0}};
  const pose=library[plan.pose],p=plan.placement,g=pose.attachments.grip,u=1/model.sourcePixelsPerUnit;
  return {x:p.x+(g.x-pose.collar.x)*u*p.scale,y:p.y+(g.y-pose.collar.y)*u*p.scale,scale:.5,rotation:-.18,anchor:{x:614,y:780}};
}
function propExtent(t){
  const cs=Math.cos(t.rotation),sn=Math.sin(t.rotation),points=[[105,2],[1136,2],[105,906],[1136,906]].map(([x,y])=>{x=(x-t.anchor.x)*t.scale;y=(y-t.anchor.y)*t.scale;return {x:t.x+x*cs-y*sn,y:t.y+x*sn+y*cs};});
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function draw(canvas,o){
  const plan=actionFix.resolvePlan(planFor(o.book,o.page,o),o),actor=o.actorByPose?.[plan?.pose],assets=o.assets||{};
  if(!plan||!assets[plan.background]||plan.pose&&!actor||assetKeys(plan).some(key=>!assets[key]))return false;
  const width=Math.max(1,Math.round(o.width*(o.pixelRatio||1))),height=Math.max(1,Math.round(o.height*(o.pixelRatio||1)));
  const umbrella=plan.umbrella?umbrellaPlacement(plan,o.model,o.poseLibrary):null;
  canvas.width=width;canvas.height=height;const c=canvas.getContext('2d'),view=cameraFor(plan,actor,width/height,[...(umbrella?[propExtent(umbrella)]:[]),...actionFix.propBounds(plan)]),s=width/view.width;
  c.setTransform(1,0,0,1,0,0);c.fillStyle='#fbf6e9';c.fillRect(0,0,width,height);c.setTransform(s,0,0,s,-view.x*s,-view.y*s);
  const bg=assets[plan.background];c.drawImage(bg,0,0,bg.width,bg.height,0,0,plan.world?.width||1672,plan.world?.height||941);
  if(plan.level2Fourth)level2Fourth.beforeActor(c,plan,assets);
  if(plan.level2Third)level2Third.beforeActor(c,plan,assets);
  if(plan.level2Next)level2Next.beforeActor(c,plan,assets);
  if(plan.level2First)level2First.beforeActor(c,plan,assets);
  if(plan.localEight)localEight.beforeActor(c,plan,assets);
  if(plan.firstTen)firstTen.beforeActor(c,plan,assets);
  if(plan.elevenThirteen)nextThree.beforeActor(c,plan,assets);
  if(plan.fourteenSixteen)currentThree.beforeActor(c,plan,assets);
  if(plan.seventeenNineteen)finalThree.beforeActor(c,plan,assets);
  if(plan.twenty)lastBook.beforeActor(c,plan,assets);
  if(plan.priorityThree)priorityThree.beforeActor(c,plan,assets);
  if(plan.umbrella){
    const im=assets.umbrella,t=umbrella;c.save();c.translate(t.x,t.y);c.rotate(t.rotation);c.drawImage(im,-t.anchor.x*t.scale,-t.anchor.y*t.scale,im.width*t.scale,im.height*t.scale);c.restore();
  }
  if(actor){c.save();if(plan.level2Fourth&&plan.actorExposure)c.filter='brightness('+plan.actorExposure+')';o.composer.place(c,actor,plan.placement);c.restore();}
  if(plan.firstTen)firstTen.afterActor(c,plan,actor,o.model,o.poseLibrary);
  if(plan.elevenThirteen)nextThree.afterActor(c,plan,assets,o.model,o.poseLibrary);
  if(plan.fourteenSixteen)currentThree.afterActor(c,plan,assets,o.model,o.poseLibrary);
  if(plan.seventeenNineteen)finalThree.afterActor(c,plan,assets,o.model,o.poseLibrary);
  if(plan.twenty)lastBook.afterActor(c,plan,assets,o.model,o.poseLibrary);
  if(plan.priorityThree)priorityThree.afterActor(c,plan,assets,o.model,o.poseLibrary);
  if(plan.level2Fourth)level2Fourth.afterActor(c,plan,o);
  if(plan.level2Third)level2Third.afterActor(c,plan,o);
  if(plan.level2Next)level2Next.afterActor(c,plan,o);
  if(plan.level2First)level2First.afterActor(c,plan,o);
  if(plan.actionFix)actionFix.afterActor(c,plan,o);
  if(plan.petals)petals(c,assets.petal,plan.petals);
  if(plan.pebble){
    const pose=o.poseLibrary[plan.pose],p=plan.placement,a=pose.attachments.leftPalm,u=1/o.model.sourcePixelsPerUnit,im=assets.pebble;
    const x=p.x+(a.x-pose.collar.x)*u*p.scale,y=p.y+(a.y-pose.collar.y)*u*p.scale,w=64,h=w*im.height/im.width;c.drawImage(im,x-w/2,y-h*.85,w,h);
  }
  c.setTransform(1,0,0,1,0,0);
  if(canvas.dataset&&(plan.firstTen||plan.elevenThirteen||plan.fourteenSixteen||plan.seventeenNineteen||plan.twenty)){canvas.dataset.storyBeat=plan.beat;canvas.dataset.reflectionActor=plan.reflection&&actor?'same-cached-actor':'';}
  if(canvas.dataset&&plan.fourteenSixteen)canvas.dataset.sceneGeometry=JSON.stringify(currentThree.proof(plan));
  if(canvas.dataset&&plan.seventeenNineteen)canvas.dataset.sceneGeometry=JSON.stringify(finalThree.proof(plan));
  if(canvas.dataset&&plan.twenty)canvas.dataset.sceneGeometry=JSON.stringify(lastBook.proof(plan));
  if(canvas.dataset&&plan.level2Fourth)canvas.dataset.level2FourthProof=JSON.stringify(level2Fourth.proof(plan));
  if(canvas.dataset&&plan.level2Third)canvas.dataset.level2ThirdProof=JSON.stringify(level2Third.proof(plan));
  if(canvas.dataset&&plan.level2Next)canvas.dataset.level2NextProof=JSON.stringify(level2Next.proof(plan));
  if(canvas.dataset&&plan.level2First)canvas.dataset.level2Proof=JSON.stringify(level2First.proof(plan));
  if(canvas.dataset&&plan.actionFix)canvas.dataset.actionProof=JSON.stringify(actionFix.proof(plan,actor));
  if(canvas.dataset&&plan.localEight)canvas.dataset.localProof=JSON.stringify(localEight.proof(plan));
  if(canvas.dataset){if(actor&&!actorIds.has(actor.image))actorIds.set(actor.image,++nextActorId);canvas.dataset.actorCacheId=actor?String(actorIds.get(actor.image)):'';canvas.dataset.portraitScale=actor?String(actor.headScale):'';canvas.dataset.characterPipeline='composed-actor-v1';canvas.dataset.pose=plan.pose||'none';canvas.dataset.scene=plan.background;canvas.dataset.camera=JSON.stringify(view);}
  return true;
}
module.exports={BOOKS,planFor,dependencies,assetKeys,imageUrl,cameraFor,umbrellaPlacement,propExtent,draw};
