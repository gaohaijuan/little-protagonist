'use strict';
const {frameForPose,fitScale}=require('./portrait-fit');

/**
 * The family book is assembled from painted bodies, independent heads and a
 * quiet courtyard. All sprite coordinates are local to sourceRect. A body's
 * face is the target facial landmark box, not the complete hairstyle. Thus a
 * long-haired photograph never gets a smaller face than a short-haired one.
 *
 * manifest: {width,height,paper,background,body:{role:{asset,sourceRect,bounds,
 * collar,foot,face,rotation}},heads:{role:{asset,sourceRect,metrics}}}.
 * metrics: {bounds,faceBounds,chin}. body.face uses sprite pixel units. Adult
 * and child bodies have independently painted proportions; no face stretching
 * or new image inference is performed while turning a page.
 */
const {canUsePhoto}=require('./family');
const ADULTS=['dad','mom','grandpa','grandma'];
const finite=value=>Number.isFinite(Number(value));
const positive=(value,fallback)=>finite(value)&&Number(value)>0?Number(value):fallback;
const bound=(value,min,max,fallback)=>finite(value)?Math.max(min,Math.min(max,Number(value))):fallback;
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y);
function dimensions(image){
  if(!image||image.complete===false)return null;
  const width=positive(image.naturalWidth||image.width,0),height=positive(image.naturalHeight||image.height,0);
  return width&&height?{width,height}:null;
}
function validBounds(b,size){return b&&['left','top','right','bottom'].every(key=>Number.isFinite(b[key]))&&b.left>=0&&b.top>=0&&b.right<=size.width&&b.bottom<=size.height&&b.right>b.left&&b.bottom>b.top;}
function source(spec,image){
  const size=dimensions(image);if(!size)return null;
  const r=spec.sourceRect||{x:0,y:0,width:size.width,height:size.height};
  if(!['x','y','width','height'].every(key=>Number.isFinite(r[key]))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>size.width||r.y+r.height>size.height)return null;
  return {image,rect:r,size:{width:r.width,height:r.height}};
}
function boundsOf(spec,size){return validBounds(spec.bounds,size)?spec.bounds:{left:0,top:0,right:size.width,bottom:size.height};}
function union(a,b){return {left:Math.min(a.left,b.left),top:Math.min(a.top,b.top),right:Math.max(a.right,b.right),bottom:Math.max(a.bottom,b.bottom)};}
function rotatedBounds(b,x,y,scale,rotation,dx=0,dy=0){
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  const points=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([px,py])=>{px=px*scale+dx;py=py*scale+dy;return {x:x+px*cos-py*sin,y:y+px*sin+py*cos};});
  return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
}
function selectedMembers(options){
  const list=Array.isArray(options.members)?options.members.filter(m=>m&&m.id&&m.role):[];
  if(options.framing==='character'){
    const member=list.find(m=>m.id===options.characterId)||{id:options.characterId||'child',role:options.characterRole||'child'};
    return [member];
  }
  const included=list.filter(m=>m.included!==false);
  const ids=!options.cover&&options.familyScene&&options.familyScene.memberIds;
  const selected=(Array.isArray(ids)?ids.map(id=>included.find(m=>m.id===id)).filter(Boolean):included).slice(0,12);
  const kind=options.familyScene&&options.familyScene.kind||'group';
  if(options.cover||(kind==='group'&&selected.length>=5&&selected.length<=6))selected.sort((a,b)=>(ADULTS.includes(a.role)?0:1)-(ADULTS.includes(b.role)?0:1));
  else if(options.familyScene&&options.familyScene.kind==='remember')selected.sort((a,b)=>(a.id===options.familyScene.focusId?1:0)-(b.id===options.familyScene.focusId?1:0));
  return selected;
}
function actor(member,o){
  const m=o.manifest,adult=ADULTS.includes(member.role),key=adult?member.role:'child';
  const spec=m.body&&m.body[key],defaultSpec=m.heads&&m.heads[key];
  if(!spec||!point(spec.collar)||!point(spec.foot)||!spec.face||!positive(spec.face.width,0)||!positive(spec.face.height,0))return null;
  const body=source(spec,o.assets[spec.asset]);if(!body)return null;
  const bodyBounds=boundsOf(spec,body.size);
  // Normalize separately generated sprites by facial dimensions, retaining the
  // longer adult torso, broader shoulders and full-length trousers or skirts.
  const unit=(adult?100:88)/spec.face.height;
  const bodyX=-spec.foot.x*unit,bodyY=-spec.foot.y*unit;
  const collar={x:(spec.collar.x-spec.foot.x)*unit,y:(spec.collar.y-spec.foot.y)*unit};
  // Adults always use the approved painted head. Ignore the complete legacy
  // portrait entry, including metrics and manual layout, at the rendering
  // boundary; retaining its saved data must never restore an adult photograph.
  const custom=canUsePhoto(member.role)?o.avatars&&o.avatars[member.id]||(member.id==='child'?{image:o.avatar,kind:o.avatarKind,layout:o.avatarLayout,metrics:o.avatarMetrics}:{}):{};
  // Version-one photographs were not isolated heads. Preserve that saved
  // original for re-selection, but show a complete new illustrated head until
  // it is reprocessed instead of reverting the entire spread to old artwork.
  const hasPhoto=custom.kind==='cutout'&&custom.image&&dimensions(custom.image);
  const hspec=hasPhoto?{metrics:custom.metrics||{}}:defaultSpec;
  if(!hspec)return null;
  const head=source(hspec,hasPhoto?custom.image:o.assets[hspec.asset]);if(!head)return null;
  const metrics=hspec.metrics||{},hb=boundsOf(metrics,head.size);
  const hasFace=validBounds(metrics.faceBounds,head.size),fb=hasFace?metrics.faceBounds:hb;
  const chin=point(metrics.chin)&&metrics.chin.x>=hb.left&&metrics.chin.x<=hb.right&&metrics.chin.y>=hb.top&&metrics.chin.y<=hb.bottom?metrics.chin:{x:(hb.left+hb.right)/2,y:hb.bottom};
  const layout=hasPhoto?custom.layout||{}:{};
  const targetFace={width:spec.face.width*unit,height:spec.face.height*unit};
  const baseScale=Math.min(targetFace.width/(fb.right-fb.left),targetFace.height*(hasFace?1:1.35)/(fb.bottom-fb.top));
  const bodyFrame=spec.photoHeadFrame?{headFrame:{...spec.photoHeadFrame,crownHeight:spec.photoHeadFrame.crownHeight*unit}}:null;
  const headScale=(hasPhoto?fitScale(baseScale,hasFace?fb:null,hb,chin,frameForPose(bodyFrame,defaultSpec&&defaultSpec.metrics,targetFace)):baseScale)*bound(layout.scale,.6,1.6,1);
  const headX=collar.x+bound(layout.x,-35,35,0)*targetFace.width/108;
  const headY=collar.y+bound(layout.y,-35,35,0)*targetFace.width/108;
  const rotation=bound(spec.rotation,-.35,.35,0);
  const dx=-chin.x*headScale,dy=-chin.y*headScale;
  const headBounds=rotatedBounds(hb,headX,headY,headScale,rotation,dx,dy);
  const faceBounds=rotatedBounds(fb,headX,headY,headScale,rotation,dx,dy);
  const extent=union({left:bodyBounds.left*unit+bodyX,top:bodyBounds.top*unit+bodyY,right:bodyBounds.right*unit+bodyX,bottom:bodyBounds.bottom*unit+bodyY},headBounds);
  return {member,adult,body,bodyBounds,bodyScale:unit,bodyX,bodyY,head,headScale,headX,headY,dx,dy,rotation,headBounds,faceBounds,extent,targetFace};
}

/** Return collision-free head placements. Each column is independent; in
 * deep groups the rear row stands on the distant courtyard ground while the
 * front row may naturally cover bodies, but never a face or hairstyle. */
function arrange(actors,area,scene,portrait){
  if(!actors.length)return [];
  const count=actors.length,kind=scene&&scene.kind||'group';
  const adults=actors.filter(item=>item.adult),children=actors.filter(item=>!item.adult);
  const familyRows=kind==='group'&&count>=5&&count<=6&&adults.length&&children.length;
  // A cover is one family photograph. Even on a narrow card, a large family
  // stays on two courtyard floors instead of climbing into the sky in rows.
  const columns=scene&&scene.cover&&count>6?Math.ceil(count/2):portrait?Math.min(count,count<=3?2:3):kind==='remember'&&count>2?Math.min(count-1,6):Math.min(count,count<=6?count:Math.ceil(count/2));
  const rowActors=familyRows?[adults,children]:Array.from({length:Math.ceil(count/columns)},(_,index)=>actors.slice(index*columns,(index+1)*columns));
  const rows=rowActors.length,gap=Math.min(area.width*.025,24),rowGap=Math.min(area.height*.045,30);
  const cellHeight=(area.height-rowGap*(rows-1))/rows;
  const deep=rows===2;
  const floors=Array.from({length:rows},(_,row)=>deep?area.y+area.height*(row===0?.70:1):area.y+(row+1)*cellHeight+row*rowGap);
  let scale=Infinity;
  rowActors.forEach((rowItems,row)=>rowItems.forEach(item=>{
    const bottom=Math.max(0,item.extent.bottom),cellWidth=(area.width-gap*(rowItems.length-1))/rowItems.length;
    scale=Math.min(scale,cellWidth/(item.extent.right-item.extent.left),deep?(floors[row]-area.y)/(bottom-item.extent.top):cellHeight/(item.extent.bottom-item.extent.top));
  }));
  if(deep){
    const back=rowActors[0],front=rowActors[1];
    const backBottom=Math.max(...back.map(item=>item.headBounds.bottom-Math.max(0,item.extent.bottom)));
    const frontTop=Math.min(...front.map(item=>item.headBounds.top-Math.max(0,item.extent.bottom)));
    if(backBottom>frontTop)scale=Math.min(scale,(floors[1]-floors[0]-rowGap)/(backBottom-frontTop));
  }
  // Introductions have more breathing room than a group or counting spread.
  scale*=kind==='member'?.91:.96;
  const placements=[];
  rowActors.forEach((rowItems,row)=>rowItems.forEach((item,col)=>{
    const cellWidth=(area.width-gap*(rowItems.length-1))/rowItems.length;
    const center=area.x+cellWidth/2+col*(cellWidth+gap);
    // All people in a row stand on one floor, so children stay shorter.
    const floor=floors[row];
    const x=center-(item.extent.left+item.extent.right)*scale/2;
    const y=floor-Math.max(0,item.extent.bottom)*scale;
    placements.push({...item,x,y,scale});
  }));
  return placements;
}

function drawSprite(c,sprite,x,y,scale){const r=sprite.rect;c.drawImage(sprite.image,r.x,r.y,r.width,r.height,x,y,r.width*scale,r.height*scale);}
function draw(canvas,options){
  const o=options||{},m=o.manifest||{},assets=o.assets||{};
  if(!canvas||typeof canvas.getContext!=='function'||o.book!=='family'||(o.framing&&o.framing!=='character'))return false;
  const background=assets[m.background||'courtyard'],backgroundSize=dimensions(background);
  if(!backgroundSize)return false;
  const members=selectedMembers(o);if(!members.length)return false;
  const actors=members.map(member=>o.preparedActors?o.preparedActors[member.id]:actor(member,{...o,manifest:m,assets}));if(actors.some(item=>!item))return false;
  const c=canvas.getContext('2d');if(!c)return false;
  const width=positive(o.width,800),height=positive(o.height,450),ratio=bound(o.pixelRatio,.1,3,1);
  const pw=Math.max(1,Math.round(width*ratio)),ph=Math.max(1,Math.round(height*ratio));
  const mw=positive(m.width,backgroundSize.width),mh=positive(m.height,backgroundSize.height);
  const fullFrame=!!o.cover||o.framing==='character'||!!o.scenePanel;
  const portrait=fullFrame&&width<height;
  // Layout uses the actual canvas aspect ratio for narrow shelf covers. Story
  // spreads reserve their right third for accessible DOM text and controls.
  const artWidth=fullFrame?mw:mw*.65;
  const worldHeight=fullFrame?mw*height/width:mh;
  const area={x:artWidth*.055,y:worldHeight*.09,width:artWidth*.89,height:worldHeight*.84};
  const scene=o.cover?{kind:'group',cover:true}:o.familyScene||{};
  if(scene.kind==='member'&&!fullFrame){area.x+=artWidth*.05;area.width*=.90;area.y=worldHeight*.08;area.height=worldHeight*.85;}
  if(scene.kind==='remember'&&Number(o.page)%2&&!fullFrame){area.x+=artWidth*.065;area.width*=.87;area.y+=worldHeight*.035;area.height*=.95;}
  if(scene.kind==='group'&&scene.count&&!fullFrame){area.x+=artWidth*.025;area.width*=.95;}
  const placements=arrange(actors,area,scene,o.scenePanel?false:portrait);
  if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pw,ph);c.fillStyle=m.paper||'#fbf6e9';c.fillRect(0,0,pw,ph);
  const worldWidth=o.artPanel&&!fullFrame?artWidth:mw;
  const scale=Math.min(pw/worldWidth,ph/worldHeight);
  c.setTransform(scale,0,0,scale,(pw-worldWidth*scale)/2,(ph-worldHeight*scale)/2);
  // A close courtyard crop distinguishes personal introductions; groups show
  // the whole garden. No pre-rendered family is baked into the background.
  const crop=scene.kind==='member'&&!fullFrame?{x:backgroundSize.width*.10,y:backgroundSize.height*.06,width:backgroundSize.width*.82,height:backgroundSize.height*.86}:{x:0,y:0,width:backgroundSize.width,height:backgroundSize.height};
  const bgScale=Math.max(worldWidth/crop.width,worldHeight/crop.height),sw=worldWidth/bgScale,sh=worldHeight/bgScale;
  c.drawImage(background,crop.x+(crop.width-sw)/2,crop.y+(crop.height-sh)/2,sw,sh,0,0,worldWidth,worldHeight);
  for(const p of placements){
    c.save();c.translate(p.x,p.y);c.scale(p.scale,p.scale);
    if(p.composite){
      c.drawImage(p.composite.image,p.composite.left,p.composite.top,p.composite.width,p.composite.height);
      c.restore();continue;
    }
    c.save();c.globalAlpha=.12;c.fillStyle='#665d40';c.beginPath();c.ellipse(0,3,Math.max(22,(p.bodyBounds.right-p.bodyBounds.left)*p.bodyScale*.29),5,0,0,Math.PI*2);c.fill();c.restore();
    drawSprite(c,p.body,p.bodyX,p.bodyY,p.bodyScale);
    // A local neck shadow only; the original alpha/matte and all hair pixels
    // are retained, without a white sticker border or a clipped face circle.
    c.save();c.globalAlpha=.13;c.fillStyle='#77603f';c.beginPath();c.ellipse(p.headX,p.headY+2,p.targetFace.width*.17,3,p.rotation,0,Math.PI*2);c.fill();c.restore();
    c.save();c.translate(p.headX,p.headY);c.rotate(p.rotation);drawSprite(c,p.head,p.dx,p.dy,p.headScale);c.restore();c.restore();
  }
  c.setTransform(1,0,0,1,0,0);
  if(canvas.dataset&&o.scenePanel){canvas.dataset.familyMembers=JSON.stringify(members.map(m=>m.id));canvas.dataset.characterPipeline='composed-actor-v1';canvas.dataset.scene='family-courtyard-reused';}
  return true;
}
// Adult specifications are character-library data; consumers may assemble them
// once before entering a scene. Page rendering only receives whole actors.
module.exports={draw,selectedMembers,arrange,adultGeometry(member,options){return ADULTS.includes(member.role)?actor(member,options):null;}};
