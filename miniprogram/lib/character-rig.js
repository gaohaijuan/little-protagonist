'use strict';

// Character space is independent of books, cameras, and device pixels. The
// neutral standing template is 940 units: 300 head + 640 collar-to-ground.
// Crouching changes the pose silhouette, never this character's anatomy.
const CHILD_MODEL=Object.freeze({id:'child-v1',version:1,headHeight:300,bodyHeight:640,sourcePixelsPerUnit:1176/640,faceToHead:1.7,padding:24});
const positive=v=>Number.isFinite(v)&&v>0;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const box=b=>b&&point({x:b.left,y:b.top})&&point({x:b.right,y:b.bottom})&&b.right>b.left&&b.bottom>b.top;
const size=image=>({width:image?.naturalWidth||image?.width,height:image?.naturalHeight||image?.height});
const forbidden=['face','headFrame','headScale','headSize','headOffset','scaleX','scaleY','unitsPerPixel'];
function rejectOverrides(value){for(const key of forbidden)if(Object.hasOwn(value,key))throw Error('Character proportions cannot be overridden: '+key);}
function definePose(input){
  // A pose is registered once with the character library, never authored in
  // a page. Source pixels have one uniform conversion into character units.
  if(!input||input.model!==CHILD_MODEL.id||!input.id||!positive(input.version)||!point(input.collar)||!box(input.bounds)||!Number.isFinite(input.headRotation)||Math.abs(input.headRotation)>Math.PI)throw Error('Invalid child pose');
  rejectOverrides(input);
  if(input.foregroundRects&&(!Array.isArray(input.foregroundRects)||input.foregroundRects.some(r=>!box(r))))throw Error('Invalid registered foreground body regions');
  return Object.freeze({...input,collar:Object.freeze({...input.collar}),bounds:Object.freeze({...input.bounds}),...(input.foregroundRects?{foregroundRects:Object.freeze(input.foregroundRects.map(r=>Object.freeze({...r})))}:{})});
}
function rotated(b,rotation,scale,dx,dy){
  const cs=Math.cos(rotation),sn=Math.sin(rotation),ps=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>{x=x*scale+dx;y=y*scale+dy;return {x:x*cs-y*sn,y:x*sn+y*cs};});
  return {left:Math.min(...ps.map(p=>p.x)),top:Math.min(...ps.map(p=>p.y)),right:Math.max(...ps.map(p=>p.x)),bottom:Math.max(...ps.map(p=>p.y))};
}
function portraitGeometry(portrait){
  if(!['cutout','illustrated'].includes(portrait.kind))throw Error('Only extracted or approved illustrated heads are supported');
  const s=size(portrait.image),m=portrait.metrics||{},b=m.bounds;
  if(!positive(s.width)||!positive(s.height)||!box(b)||b.left<0||b.top<0||b.right>s.width||b.bottom>s.height||!point(m.chin)||m.chin.x<b.left||m.chin.x>b.right||m.chin.y<b.top||m.chin.y>b.bottom)throw Error('Invalid portrait geometry');
  const face=m.faceBounds;
  if(portrait.kind==='cutout'&&(!box(face)||face.left<b.left||face.top<b.top||face.right>b.right||face.bottom>b.bottom))throw Error('A real portrait needs facial landmarks');
  // Normalize each person's real face once. No per-pose width cap: wide or
  // long hair expands the assembled actor's bounds rather than shrinking it.
  const reference=portrait.kind==='cutout'?(face.bottom-face.top)*CHILD_MODEL.faceToHead:m.chin.y-b.top;
  if(!positive(reference))throw Error('Invalid portrait reference');
  return Object.freeze({scale:CHILD_MODEL.headHeight/reference,chin:Object.freeze({...m.chin}),bounds:Object.freeze({...b}),size:Object.freeze(s)});
}
function createComposer(createCanvas,poseDefinitions,{pixelDensity=1}={}){
  if(!positive(pixelDensity)||pixelDensity>4)throw Error('Invalid character pixel density');
  const library=new Map();
  for(const input of poseDefinitions||[]){const pose=definePose(input);if(library.has(pose.id))throw Error('Duplicate character pose');library.set(pose.id,pose);}
  const portraits=new WeakMap(),actors=new WeakMap(),prepared=new WeakSet();
  function prepare(portrait){
    if(!portrait?.image)throw Error('Missing portrait');
    const key=JSON.stringify([CHILD_MODEL.id,portrait.kind,portrait.metrics]);let cache=portraits.get(portrait.image);
    if(!cache){cache=new Map();portraits.set(portrait.image,cache);}
    if(!cache.has(key)){const result=Object.freeze({image:portrait.image,geometry:portraitGeometry(portrait),model:CHILD_MODEL.id});cache.set(key,result);prepared.add(result);}
    return cache.get(key);
  }
  function compose(options){
    if(!options||Object.keys(options).some(k=>!['portrait','body','poseId'].includes(k)))throw Error('Compose a registered pose without size overrides');
    const {portrait,body,poseId}=options,pose=library.get(poseId);
    if(!pose)throw Error('Unknown registered character pose');
    if(!prepared.has(portrait))throw Error('Prepare the portrait before composing poses');
    const bs=size(body);
    if(!positive(bs.width)||!positive(bs.height)||pose.bounds.left<0||pose.bounds.top<0||pose.bounds.right>bs.width||pose.bounds.bottom>bs.height)throw Error('Invalid pose body');
    let cache=actors.get(portrait);if(!cache){cache=new WeakMap();actors.set(portrait,cache);}
    let poses=cache.get(body);if(!poses){poses=new Map();cache.set(body,poses);}
    const key=JSON.stringify(pose);if(poses.has(key))return poses.get(key);
    const g=portrait.geometry,u=1/CHILD_MODEL.sourcePixelsPerUnit,head=rotated(g.bounds,pose.headRotation,g.scale,-g.chin.x*g.scale,-g.chin.y*g.scale);
    const bodyBounds={left:(pose.bounds.left-pose.collar.x)*u,top:(pose.bounds.top-pose.collar.y)*u,right:(pose.bounds.right-pose.collar.x)*u,bottom:(pose.bounds.bottom-pose.collar.y)*u};
    const bounds={left:Math.min(head.left,bodyBounds.left)-CHILD_MODEL.padding,top:Math.min(head.top,bodyBounds.top)-CHILD_MODEL.padding,right:Math.max(head.right,bodyBounds.right)+CHILD_MODEL.padding,bottom:Math.max(head.bottom,bodyBounds.bottom)+CHILD_MODEL.padding};
    const canvas=createCanvas();canvas.width=Math.ceil((bounds.right-bounds.left)*pixelDensity);canvas.height=Math.ceil((bounds.bottom-bounds.top)*pixelDensity);
    const c=canvas.getContext('2d');if(!c)throw Error('Character canvas unavailable');
    if(pixelDensity!==1)c.scale(pixelDensity,pixelDensity);
    c.translate(-bounds.left,-bounds.top);
    c.drawImage(body,0,0,bs.width,bs.height,-pose.collar.x*u,-pose.collar.y*u,bs.width*u,bs.height*u);
    c.save();c.rotate(pose.headRotation);c.drawImage(portrait.image,0,0,g.size.width,g.size.height,-g.chin.x*g.scale,-g.chin.y*g.scale,g.size.width*g.scale,g.size.height*g.scale);c.restore();
    // A registered hand may physically cover a cheek. Composite its original
    // body pixels here once, so scenes still receive one complete cached actor.
    for(const r of pose.foregroundRects||[]){if(r.left<0||r.top<0||r.right>bs.width||r.bottom>bs.height)throw Error('Foreground body region outside source');const w=r.right-r.left,h=r.bottom-r.top;c.drawImage(body,r.left,r.top,w,h,(r.left-pose.collar.x)*u,(r.top-pose.collar.y)*u,w*u,h*u);}
    const actor=Object.freeze({image:canvas,pixelDensity,model:CHILD_MODEL.id,pose:pose.id,version:pose.version,anchor:Object.freeze({x:-bounds.left,y:-bounds.top}),bounds:Object.freeze(bounds),headScale:g.scale});
    poses.set(key,actor);return actor;
  }
  function place(context,actor,placement){
    if(!placement||Object.keys(placement).some(k=>!['x','y','scale','rotation'].includes(k))||!point(placement)||!positive(placement.scale)||placement.rotation!==undefined&&!Number.isFinite(placement.rotation))throw Error('A scene may only position and uniformly scale a complete character');
    context.save();context.translate(placement.x,placement.y);context.rotate(placement.rotation||0);
    context.drawImage(actor.image,-actor.anchor.x*placement.scale,-actor.anchor.y*placement.scale,actor.image.width/(actor.pixelDensity||1)*placement.scale,actor.image.height/(actor.pixelDensity||1)*placement.scale);context.restore();
  }
  function release({portrait,body,poseId}){
    const pose=library.get(poseId),cache=actors.get(portrait)?.get(body);
    return !!pose&&!!cache&&cache.delete(JSON.stringify(pose));
  }
  return Object.freeze({prepare,compose,place,release});
}
module.exports={CHILD_MODEL,definePose,portraitGeometry,createComposer};
