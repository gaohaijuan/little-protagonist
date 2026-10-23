'use strict';
const {frameForPose,fitScale}=require('./portrait-fit');

/**
 * Pre-painted, headless picture-book scenes with replaceable local portraits.
 * All manifest coordinates use the original scene's pixel grid. Assets must be
 * loaded Images (or WeChat canvas Images); an unavailable layer returns false
 * before touching the canvas, allowing story-art to draw a complete fallback.
 *
 * assets: care, wind, search, careHead, windHead, searchHead, petal.
 * manifest: {width,height,paper,scenes:{care,wind,search},flower,petal,closeup,cover}.
 * scene: {neck:{x,y},face:{width,height},rotation,headMetrics:{bounds,faceBounds,chin},
 *         photoPose:{neck:{x,y},face:{width,height},rotation}}.
 * Example heads already contain their own gaze and tilt. photoPose aligns the
 * upright, extracted photograph to the body's actual collar instead.
 * flower: {x,y,radius,petalWidth,petalHeight,flight:[{x,y,rotation}],
 *          settled:[{x,y,rotation}]}.
 * petal: {bounds,tip:{x,y}} where the tip is the narrow end against the flower.
 * closeup / cover: {x,y,width,height}, cropped from the care scene.
 * Avatar metrics use their own image coordinates. faceBounds controls facial
 * size independently of hair length; the entire original PNG is always drawn.
 */
function dimensions(image) {
  if(image && image.complete===false)return null;
  const width = image && Number(image.naturalWidth || image.width);
  const height = image && Number(image.naturalHeight || image.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height } : null;
}

function validBounds(value, size) {
  return value && [value.left,value.top,value.right,value.bottom].every(Number.isFinite)
    && value.left >= 0 && value.top >= 0 && value.right <= size.width && value.bottom <= size.height
    && value.right > value.left && value.bottom > value.top;
}

function bounded(value, min, max, fallback) {
  return Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function point(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function photoScene(scene) {
  const pose=scene.photoPose || {};
  return {neck:point(pose.neck) ? pose.neck : scene.neck,
    face:{width:positive(pose.face && pose.face.width,scene.face.width),
      height:positive(pose.face && pose.face.height,scene.face.height)},
    rotation:Number.isFinite(pose.rotation) ? pose.rotation : scene.rotation,
    headFrame:frameForPose(pose,scene.headMetrics,scene.face)};
}

function pagePlan(value) {
  const page = Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));
  const released = page < 2 ? 0 : page === 2 ? 4 : page === 3 ? 8 : 11;
  const settled = page < 3 ? 0 : page === 3 ? 4 : page === 4 ? 8 : 11;
  return { page, scene: page < 2 ? 'care' : page < 5 ? 'wind' : 'search',
    attached: 11-released, flying: released-settled, settled };
}

function headGeometry(item, size, scene) {
  const metrics = item.metrics || {};
  const b = validBounds(metrics.bounds,size) ? metrics.bounds : {left:0,top:0,right:size.width,bottom:size.height};
  const suppliedFace=metrics.faceBounds;
  const face = validBounds(suppliedFace,size) ? suppliedFace : null;
  const chin = point(metrics.chin) && metrics.chin.x >= b.left && metrics.chin.x <= b.right
    && metrics.chin.y >= b.top && metrics.chin.y <= b.bottom
    ? metrics.chin : {x:(b.left+b.right)/2,y:b.bottom};
  const layout = item.layout || {};
  const target = scene.face;
  // Legacy PNGs lack landmark metrics: keep their previous complete silhouette
  // rather than estimating new facial features from the photograph.
  const reference = face || b;
  const base = Math.min(target.width/(reference.right-reference.left),
    (face ? target.height : target.height*1.35)/(reference.bottom-reference.top));
  const scale = fitScale(base,face,b,chin,scene.headFrame) * bounded(layout.scale,.6,1.6,1);
  const unit = target.width/108;
  return {bounds:b, scale, rotation:Number.isFinite(Number(scene.rotation)) ? Number(scene.rotation) : 0,
    x:scene.neck.x+bounded(layout.x,-35,35,0)*unit,
    y:scene.neck.y+bounded(layout.y,-35,35,0)*unit,
    dx:-chin.x*scale,dy:-chin.y*scale};
}

function headExtents(head) {
  const b=head.bounds,cos=Math.cos(head.rotation),sin=Math.sin(head.rotation);
  const corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>{
    const px=head.dx+x*head.scale,py=head.dy+y*head.scale;
    return {x:head.x+px*cos-py*sin,y:head.y+px*sin+py*cos};
  });
  return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),
    top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
}

function rectangle(value, fallback) {
  return value && [value.x,value.y,value.width,value.height].every(Number.isFinite) && value.width>0 && value.height>0
    ? {x:value.x,y:value.y,width:value.width,height:value.height} : fallback;
}

function draw(canvas, options) {
  const o=options || {},m=o.manifest || {},assets=o.assets || {};
  if (!canvas || typeof canvas.getContext!=='function' || o.book!=='flower' || o.framing) return false;
  const plan=pagePlan(o.cover ? 0 : o.page),scene=m.scenes && m.scenes[plan.scene];
  const background=assets[plan.scene],backgroundSize=dimensions(background);
  if (!backgroundSize || !scene || !point(scene.neck) || !scene.face
    || !Number.isFinite(scene.face.width) || !Number.isFinite(scene.face.height) || !(scene.face.width>0) || !(scene.face.height>0)) return false;
  const width=positive(m.width,backgroundSize.width),height=positive(m.height,backgroundSize.height);
  const closeup=plan.page===1 && !o.cover;
  const crop=closeup ? rectangle(m.closeup,null) : null;
  if(closeup && (!crop || crop.x<0 || crop.y<0 || crop.x+crop.width>backgroundSize.width || crop.y+crop.height>backgroundSize.height))return false;
  const custom=o.avatars && o.avatars.child || {image:o.avatar,kind:o.avatarKind,metrics:o.avatarMetrics,layout:o.avatarLayout};
  if(!closeup && custom.image && dimensions(custom.image) && custom.kind!=='cutout')return false;
  const useCustom=custom && custom.kind==='cutout' && dimensions(custom.image);
  const item=useCustom ? custom : {image:assets[plan.scene+'Head'],metrics:scene.headMetrics};
  const headSize=dimensions(item.image);
  if (!closeup && !headSize) return false;
  const alignment=useCustom ? photoScene(scene) : scene;
  const head=closeup ? null : headGeometry(item,headSize,alignment);
  const flower=m.flower || {},petalSize=dimensions(assets.petal);
  if (plan.scene==='wind' && (!petalSize || !point(flower))) return false;
  const context=canvas.getContext('2d');
  if (!context) return false;
  const logicalWidth=positive(o.width,800),logicalHeight=positive(o.height,450),ratio=bounded(o.pixelRatio,.1,3,1);
  const pixelWidth=Math.max(1,Math.round(logicalWidth*ratio)),pixelHeight=Math.max(1,Math.round(logicalHeight*ratio));
  if(canvas.width!==pixelWidth)canvas.width=pixelWidth;
  if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
  const c=context;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pixelWidth,pixelHeight);
  c.fillStyle=m.paper || '#fbf6e9';c.fillRect(0,0,pixelWidth,pixelHeight);
  let view={x:0,y:0,width:o.artPanel&&!o.cover?width*.65:width,height};
  if(o.cover){
    view=rectangle(m.cover,{x:0,y:0,width:width*.68,height});
    const extents=headExtents(head),padding=height*.025;
    const left=Math.min(view.x,extents.left-padding),top=Math.min(view.y,extents.top-padding);
    const right=Math.max(view.x+view.width,extents.right+padding),bottom=Math.max(view.y+view.height,extents.bottom+padding);
    view={x:left,y:top,width:right-left,height:bottom-top};
  }else if(head){
    // A larger hairstyle or the full adjustment range may cross the original
    // painted frame. Pull the camera back, preserving the chosen head/body
    // ratio, rather than trimming source hair or silently clamping the slider.
    const extents=headExtents(head),padding=height*.025,artLimit=.65;
    const left=Math.min(0,extents.left-padding),top=Math.min(0,extents.top-padding);
    const artRight=Math.max(width*artLimit,extents.right+padding);
    const bottom=Math.max(height,extents.bottom+padding);
    view={x:left,y:top,width:o.artPanel?artRight-left:Math.max(width,(artRight-left)/artLimit),height:bottom-top};
  }
  const scale=Math.min(pixelWidth/view.width,pixelHeight/view.height);
  c.setTransform(scale,0,0,scale,(o.cover ? (pixelWidth-view.width*scale)/2 : 0)-view.x*scale,(pixelHeight-view.height*scale)/2-view.y*scale);
  if(closeup){
    // The close-up has its own deliberately head-free crop. This avoids showing
    // a sliced-off forehead while keeping the reading area on the right clear.
    const targetWidth=width*.65,targetHeight=height;
    const cropScale=Math.min(targetWidth/crop.width,targetHeight/crop.height);
    const dw=crop.width*cropScale,dh=crop.height*cropScale;
    c.drawImage(background,crop.x,crop.y,crop.width,crop.height,(targetWidth-dw)/2,(height-dh)/2,dw,dh);
    if(!o.artPanel&&typeof c.createLinearGradient==='function'){
      const right=(targetWidth+dw)/2,fade=Math.min(width*.045,dw*.1);
      const gradient=c.createLinearGradient(right-fade,0,right,0);
      gradient.addColorStop(0,'rgba(251,246,233,0)');gradient.addColorStop(1,m.paper||'#fbf6e9');
      c.save();c.fillStyle=gradient;c.fillRect(right-fade,(height-dh)/2,fade,dh);c.restore();
    }
  }else{
    c.drawImage(background,0,0,backgroundSize.width,backgroundSize.height,0,0,width,height);
    if(plan.scene==='wind'){
      const specification=m.petal || {},b=validBounds(specification.bounds,petalSize) ? specification.bounds : {left:0,top:0,right:petalSize.width,bottom:petalSize.height};
      const tip=point(specification.tip) ? specification.tip : {x:(b.left+b.right)/2,y:b.bottom};
      const petalWidth=positive(flower.petalWidth,width*.029),petalHeight=positive(flower.petalHeight,height*.115);
      const petalScale=Math.min(petalWidth/(b.right-b.left),petalHeight/(b.bottom-b.top));
      const radius=positive(flower.radius,height*.032);
      for(let i=0;i<11;i++){
        let p,factor=1;
        const angle=i*Math.PI*2/11;
        if(i>=11-plan.attached){p={x:flower.x+Math.sin(angle)*radius,y:flower.y-Math.cos(angle)*radius,rotation:angle};}
        else if(i<plan.settled){
          p=flower.settled && flower.settled[i] || {x:width*(.36+(i%6)*.045),y:height*(.80+Math.floor(i/6)*.085),rotation:-.7+i*.64};
          factor=.78;
        }else{
          p=flower.flight && flower.flight[i] || {x:width*(.40+(i%4)*.07),y:height*(.21+Math.floor(i/4)*.13+(i%2)*.035),rotation:.4+i*.65};
          factor=.95;
        }
        c.save();c.translate(p.x,p.y);c.rotate(Number(p.rotation)||0);
        const s=petalScale*factor;
        c.drawImage(assets.petal,0,0,petalSize.width,petalSize.height,-tip.x*s,-tip.y*s,petalSize.width*s,petalSize.height*s);
        c.restore();
      }
    }
    // Only the connection at the collar gets a soft shadow. A whole-head drop
    // shadow or white sticker outline would flatten the mixed-media portrait.
    c.save();c.globalAlpha=.16;c.fillStyle='#796343';c.beginPath();
    c.ellipse(alignment.neck.x,alignment.neck.y+alignment.face.height*.01,alignment.face.width*.19,alignment.face.height*.045,head.rotation,0,Math.PI*2);c.fill();c.restore();
    c.save();c.translate(head.x,head.y);c.rotate(head.rotation);
    c.drawImage(item.image,0,0,headSize.width,headSize.height,head.dx,head.dy,headSize.width*head.scale,headSize.height*head.scale);
    c.restore();
  }
  c.setTransform(1,0,0,1,0,0);
  return true;
}

module.exports={draw,pagePlan};
