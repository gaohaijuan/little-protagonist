'use strict';
const {frameForPose,fitScale}=require('./portrait-fit');

/** Painted introduction scenes with one independent, replaceable child's head.
 * Coordinates are original scene pixels. manifest.scenes[scene] supplies
 * {neck,face:{width,height},rotation,photoPose?}; manifest.head is
 * {asset:'childHead',metrics:{bounds,faceBounds,chin}}. Optional crops[page],
 * cover and hero rectangles use {x,y,width,height} in the same scene grid.
 * Each viewport expands to retain the complete original hairstyle; photographs
 * are drawn once, isotropically, with no inference, mirroring or pixel edits.
 */
const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y);
function dimensions(image){if(!image||image.complete===false)return null;const width=positive(image.naturalWidth||image.width,0),height=positive(image.naturalHeight||image.height,0);return width&&height?{width,height}:null;}
function bounds(value,size){return value&&['left','top','right','bottom'].every(key=>Number.isFinite(value[key]))&&value.left>=0&&value.top>=0&&value.right<=size.width&&value.bottom<=size.height&&value.right>value.left&&value.bottom>value.top?value:{left:0,top:0,right:size.width,bottom:size.height};}
function rect(value,fallback){return value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.width>0&&value.height>0?{x:value.x,y:value.y,width:value.width,height:value.height}:fallback;}
function pagePlan(value){const page=Math.max(0,Math.min(5,Math.floor(Number(value)||0)));return {page,scene:['greeting','play','greeting','play','school','school'][page],closeup:[1,2,5].includes(page)};}
function geometry(item,size,scene){
  const metrics=item.metrics||{},b=bounds(metrics.bounds,size);
  const face=metrics.faceBounds&&bounds(metrics.faceBounds,size)===metrics.faceBounds?metrics.faceBounds:null;
  const chin=point(metrics.chin)&&metrics.chin.x>=b.left&&metrics.chin.x<=b.right&&metrics.chin.y>=b.top&&metrics.chin.y<=b.bottom?metrics.chin:{x:(b.left+b.right)/2,y:b.bottom};
  const layout=item.layout||{},reference=face||b,target=scene.face;
  const base=Math.min(target.width/(reference.right-reference.left),target.height*(face?1:1.35)/(reference.bottom-reference.top));
  const scale=fitScale(base,face,b,chin,scene.headFrame)*bounded(layout.scale,.6,1.6,1);
  const x=scene.neck.x+bounded(layout.x,-35,35,0)*target.width/108,y=scene.neck.y+bounded(layout.y,-35,35,0)*target.width/108;
  const rotation=bounded(scene.rotation,-Math.PI,Math.PI,0),dx=-chin.x*scale,dy=-chin.y*scale;
  const cos=Math.cos(rotation),sin=Math.sin(rotation),corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([px,py])=>{px=px*scale+dx;py=py*scale+dy;return {x:x+px*cos-py*sin,y:y+px*sin+py*cos};});
  return {x,y,rotation,dx,dy,scale,extents:{left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))}};
}
function draw(canvas,options){
  const o=options||{},m=o.manifest||{},assets=o.assets||{},hero=o.framing==='hero';
  if(!canvas||typeof canvas.getContext!=='function'||o.book!=='intro'||(o.framing&&!hero))return false;
  const plan=pagePlan(o.cover||hero?0:o.page),scene=m.scenes&&m.scenes[plan.scene],background=assets[plan.scene],backgroundSize=dimensions(background);
  if(!backgroundSize||!scene||!point(scene.neck)||!scene.face||!positive(scene.face.width,0)||!positive(scene.face.height,0))return false;
  const custom=o.avatars&&o.avatars.child||{image:o.avatar,kind:o.avatarKind,metrics:o.avatarMetrics,layout:o.avatarLayout};
  const useCustom=custom.kind==='cutout'&&dimensions(custom.image),headSpec=m.head||{};
  const item=useCustom?custom:{image:assets[headSpec.asset||'childHead'],metrics:headSpec.metrics};
  const headSize=dimensions(item.image);if(!headSize)return false;
  const photoPose=useCustom&&scene.photoPose||{},alignment={neck:point(photoPose.neck)?photoPose.neck:scene.neck,face:{width:positive(photoPose.face&&photoPose.face.width,scene.face.width),height:positive(photoPose.face&&photoPose.face.height,scene.face.height)},rotation:Number.isFinite(photoPose.rotation)?photoPose.rotation:scene.rotation};
  if(useCustom)alignment.headFrame=frameForPose(photoPose,headSpec.metrics,scene.face);
  const head=geometry(item,headSize,alignment),context=canvas.getContext('2d');if(!context)return false;
  const width=positive(o.width,800),height=positive(o.height,450),ratio=bounded(o.pixelRatio,.1,3,1),pw=Math.max(1,Math.round(width*ratio)),ph=Math.max(1,Math.round(height*ratio));
  const mw=positive(m.width,backgroundSize.width),mh=positive(m.height,backgroundSize.height);
  const defaultView={x:0,y:0,width:mw*.65,height:mh};
  let view=hero?rect(m.hero,rect(m.cover,defaultView)):o.cover?rect(m.cover,defaultView):rect(m.crops&&m.crops[plan.page],defaultView);
  const padding=mh*.025,left=Math.min(view.x,head.extents.left-padding),top=Math.min(view.y,head.extents.top-padding),right=Math.max(view.x+view.width,head.extents.right+padding),bottom=Math.max(view.y+view.height,head.extents.bottom+padding);
  view={x:left,y:top,width:right-left,height:bottom-top};
  const area=hero?{x:pw*.52,y:0,width:pw*.48,height:ph}:o.cover||o.artPanel?{x:0,y:0,width:pw,height:ph}:{x:0,y:0,width:pw*.65,height:ph};
  if(!hero&&!o.cover&&!o.artPanel){
    // The phone reader is wider than the original 16:9 painting once its
    // controls are removed. Expand the quiet right/bottom background instead
    // of displaying a narrow portrait strip or revealing a cropped friend on
    // the left. The chosen view and complete head always remain included.
    const aspect=area.width/area.height;
    if(view.width/view.height<aspect)view.width=view.height*aspect;
    else view.height=view.width/aspect;
  }
  const scale=Math.min(area.width/view.width,area.height/view.height),tx=area.x+(area.width-view.width*scale)/2-view.x*scale,ty=area.y+(area.height-view.height*scale)/2-view.y*scale;
  const camera={x:tx+view.x*scale,y:ty+view.y*scale,width:view.width*scale,height:view.height*scale};
  if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
  const c=context;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pw,ph);c.fillStyle=m.paper||'#fbf6e9';c.fillRect(0,0,pw,ph);
  // Clip the background to its art viewport, never crop the photo's source.
  // All four head corners were included before fitting this same viewport.
  c.save();c.beginPath();c.rect(camera.x,camera.y,camera.width,camera.height);c.clip();
  c.setTransform(scale,0,0,scale,tx,ty);
  const backgroundHeight=backgroundSize.height*mw/backgroundSize.width;
  c.drawImage(background,0,0,backgroundSize.width,backgroundSize.height,0,0,mw,backgroundHeight);
  // Soften just the painted scene boundary before adding the original head.
  if(!o.artPanel&&typeof c.createLinearGradient==='function'){
    c.setTransform(1,0,0,1,0,0);
    const fade=Math.min(camera.width*.045,20*ratio);
    for(const leftEdge of [true,false]){
      if(leftEdge&&!hero&&view.x===0)continue;
      const x=leftEdge?camera.x:camera.x+camera.width-fade,gradient=c.createLinearGradient(x,0,x+fade,0);
      gradient.addColorStop(leftEdge?0:1,m.paper||'#fbf6e9');gradient.addColorStop(leftEdge?1:0,'rgba(251,246,233,0)');
      c.fillStyle=gradient;c.fillRect(x,camera.y,fade,camera.height);
    }
    c.setTransform(scale,0,0,scale,tx,ty);
  }
  c.save();c.globalAlpha=.13;c.fillStyle='#786042';c.beginPath();c.ellipse(alignment.neck.x,alignment.neck.y+1,alignment.face.width*.17,alignment.face.height*.035,head.rotation,0,Math.PI*2);c.fill();c.restore();
  c.save();c.translate(head.x,head.y);c.rotate(head.rotation);c.drawImage(item.image,0,0,headSize.width,headSize.height,head.dx,head.dy,headSize.width*head.scale,headSize.height*head.scale);c.restore();c.restore();
  c.setTransform(1,0,0,1,0,0);return true;
}
module.exports={draw,pagePlan,headGeometry:geometry};
