'use strict';

// Scene coordinates, camera crops, and neck anchors use the source painting's
// pixel grid. Head geometry is shared with the introduction book so every
// saved portrait keeps its face/hair geometry and uses the authored body frame.
const {headGeometry}=require('./intro-art');
const {frameForPose}=require('./portrait-fit');
const BOOKS=['hands','rain','stone'];
const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y);
function dimensions(image){
  if(!image||image.complete===false)return null;
  const width=positive(image.naturalWidth||image.width,0),height=positive(image.naturalHeight||image.height,0);
  return width&&height?{width,height}:null;
}
function crop(value,fallback){return value&&['x','y','width','height'].every(key=>Number.isFinite(value[key]))&&value.width>0&&value.height>0?{x:value.x,y:value.y,width:value.width,height:value.height}:fallback;}
function pagePlan(manifest,page,options={}){
  if(!manifest||!Array.isArray(manifest.pages)||!manifest.pages.length)return null;
  const index=Math.max(0,Math.min(manifest.pages.length-1,Math.floor(Number(page)||0)));
  const entry=options.cover?manifest.cover||manifest.pages[0]:manifest.pages[index];
  if(!entry||typeof entry.scene!=='string'||!manifest.scenes||!manifest.scenes[entry.scene])return null;
  return {page:options.cover?0:index,scene:entry.scene,crop:entry.crop};
}
function draw(canvas,options){
  const o=options||{},m=o.manifest||{},assets=o.assets||{};
  if(!canvas||typeof canvas.getContext!=='function'||!BOOKS.includes(o.book)||o.framing)return false;
  const plan=pagePlan(m,o.page,o);if(!plan)return false;
  const scene=m.scenes[plan.scene],background=assets[plan.scene],backgroundSize=dimensions(background);
  if(!backgroundSize)return false;
  let item=null,head=null,headSize=null,alignment=null;
  if(scene.head!==false){
    if(!point(scene.neck)||!scene.face||!positive(scene.face.width,0)||!positive(scene.face.height,0))return false;
    const custom=o.avatars&&o.avatars.child||{image:o.avatar,kind:o.avatarKind,metrics:o.avatarMetrics,layout:o.avatarLayout};
    const useCustom=custom.kind==='cutout'&&dimensions(custom.image),headId=typeof scene.head==='string'?scene.head:'childHead';
    const spec=m.heads&&m.heads[headId];
    item=useCustom?custom:spec&&{image:assets[headId],metrics:spec.metrics};
    headSize=item&&dimensions(item.image);if(!headSize)return false;
    const pose=useCustom&&scene.photoPose||{};
    alignment={neck:point(pose.neck)?pose.neck:scene.neck,face:{width:positive(pose.face&&pose.face.width,scene.face.width),height:positive(pose.face&&pose.face.height,scene.face.height)},rotation:Number.isFinite(pose.rotation)?pose.rotation:scene.rotation};
    if(useCustom)alignment.headFrame=frameForPose(pose,spec&&spec.metrics,scene.face);
    head=headGeometry(item,headSize,alignment);
  }
  const c=canvas.getContext('2d');if(!c)return false;
  const width=positive(o.width,800),height=positive(o.height,450),ratio=bounded(o.pixelRatio,.1,3,1),pw=Math.max(1,Math.round(width*ratio)),ph=Math.max(1,Math.round(height*ratio));
  const mw=positive(m.width,backgroundSize.width),mh=positive(m.height,backgroundSize.height),paper=m.paper||'#fbf6e9';
  const defaultView={x:0,y:0,width:mw*(o.cover?1:.65),height:mh};
  let view=crop(plan.crop,crop(scene.crop,defaultView));
  if(head){
    const padding=mh*.025,left=Math.min(view.x,head.extents.left-padding),top=Math.min(view.y,head.extents.top-padding);
    const right=Math.max(view.x+view.width,head.extents.right+padding),bottom=Math.max(view.y+view.height,head.extents.bottom+padding);
    view={x:left,y:top,width:right-left,height:bottom-top};
  }
  const area={x:0,y:0,width:pw*(o.cover||o.artPanel?1:.65),height:ph};
  if(!o.cover&&!o.artPanel){
    // Fill the reading illustration area even on a short phone viewport.
    // Expand towards the painting's quiet right/bottom, retaining all hair
    // and the chosen left edge (which may intentionally exclude a peer).
    const aspect=area.width/area.height;
    if(view.width/view.height<aspect)view.width=view.height*aspect;
    else view.height=view.width/aspect;
  }
  const scale=Math.min(area.width/view.width,area.height/view.height),tx=(area.width-view.width*scale)/2-view.x*scale,ty=(area.height-view.height*scale)/2-view.y*scale;
  const camera={x:tx+view.x*scale,y:ty+view.y*scale,width:view.width*scale,height:view.height*scale};
  if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pw,ph);c.fillStyle=paper;c.fillRect(0,0,pw,ph);
  c.save();c.beginPath();c.rect(camera.x,camera.y,camera.width,camera.height);c.clip();
  c.setTransform(scale,0,0,scale,tx,ty);
  c.drawImage(background,0,0,backgroundSize.width,backgroundSize.height,0,0,mw,backgroundSize.height*mw/backgroundSize.width);
  if(view.y<0){
    // Hair can extend above the source painting, even though it fits inside
    // the camera. Continue the painting's top edge into that camera bleed;
    // paper alone would leave the real head visibly outside the picture.
    // Reflect a thin edge strip only. The body and portrait keep their scale,
    // collar and pixels, and the original painting remains untouched below 0.
    const bleed=-view.y,sourceHeight=Math.min(bleed*backgroundSize.width/mw,backgroundSize.height*.08);
    c.setTransform(scale,0,0,-scale,tx,ty);
    c.drawImage(background,0,0,backgroundSize.width,sourceHeight,0,0,mw,bleed);
    c.setTransform(scale,0,0,scale,tx,ty);
  }
  if(!o.artPanel&&typeof c.createLinearGradient==='function'){
    c.setTransform(1,0,0,1,0,0);
    const fade=Math.min(camera.width*.045,20*ratio);
    for(const leftEdge of [true,false]){
      if(leftEdge&&view.x===0)continue;
      const x=leftEdge?camera.x:camera.x+camera.width-fade,gradient=c.createLinearGradient(x,0,x+fade,0);
      gradient.addColorStop(leftEdge?0:1,paper);gradient.addColorStop(leftEdge?1:0,'rgba(251,246,233,0)');
      c.fillStyle=gradient;c.fillRect(x,camera.y,fade,camera.height);
    }
    c.setTransform(scale,0,0,scale,tx,ty);
  }
  if(head){
    // The soft collar shadow is behind the photo; never paint across hair.
    c.save();c.globalAlpha=.13;c.fillStyle='#786042';c.beginPath();c.ellipse(alignment.neck.x,alignment.neck.y+1,alignment.face.width*.17,alignment.face.height*.035,head.rotation,0,Math.PI*2);c.fill();c.restore();
    c.save();c.translate(head.x,head.y);c.rotate(head.rotation);c.drawImage(item.image,0,0,headSize.width,headSize.height,head.dx,head.dy,headSize.width*head.scale,headSize.height*head.scale);c.restore();
  }
  c.restore();c.setTransform(1,0,0,1,0,0);return true;
}
module.exports={draw,pagePlan};
