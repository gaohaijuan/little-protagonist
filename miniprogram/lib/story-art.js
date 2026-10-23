'use strict';
const {fitScale}=require('./portrait-fit');

const {canUsePhoto}=require('./family');

/**
 * Draw the approved story art into a browser or WeChat type="2d" canvas.
 * width/height are logical CSS pixels; pixelRatio sets the backing-store density.
 * The caller must wait for avatar.onload before supplying an image. Drawing is
 * synchronous, and each call owns its context so different canvases cannot clash.
 * avatarKind: 'cutout' accepts a transparent, isolated head. Optional metrics
 * locate its visible bounds and chin in source pixels, excluding empty padding.
 * avatarLayout scales/moves that head at draw time without editing its pixels.
 * avatars[role] can supply {image, kind, metrics, layout} for each story person.
 */
function draw(canvas, options) {
  if (!canvas || typeof canvas.getContext !== 'function') return;
  const o = options || {};
  const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const width = positive(o.width, 600);
  const height = positive(o.height, 430);
  const pixelRatio = Math.min(positive(o.pixelRatio, 1), 3);
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const c = canvas.getContext('2d');
  if (!c) return;
  const P = { paper:'#fbf6e9', ink:'#69534b', green:'#79947c', darkGreen:'#57765d', leaf:'#99ae82', mint:'#d4dec1', peach:'#eaa48b', blush:'#e7a59e', gold:'#e0b55d', blue:'#94b6c0', skin:'#f2c6a2', shadow:'#e6d8bb' };
  const fill = color => { c.fillStyle=color; c.fill(); };
  function path(points, color, stroke, width) {
    c.beginPath(); points.forEach(p=>{ const [op,...v]=p; c[op](...v); });
    if(color) fill(color);
    if(stroke){c.strokeStyle=stroke;c.lineWidth=width||2;c.lineCap='round';c.lineJoin='round';c.stroke();}
  }
  function ellipse(x,y,rx,ry,color,angle) { c.beginPath();c.ellipse(x,y,rx,ry,angle||0,0,Math.PI*2);fill(color); }
  function line(x1,y1,x2,y2,color,width) { path([['moveTo',x1,y1],['lineTo',x2,y2]],null,color,width); }
  function leaf(x,y,s,angle,color) { c.save();c.translate(x,y);c.rotate(angle);path([['moveTo',0,0],['bezierCurveTo',-s,-s*.8,-s*.5,-s*1.6,0,-s*2],['bezierCurveTo',s*.5,-s*1.2,s*.7,-s*.2,0,0]],color||P.leaf);c.restore(); }
  function sprig(x,y,s,flip) {c.save();c.translate(x,y);c.scale(flip?-1:1,1);path([['moveTo',0,0],['quadraticCurveTo',-7,-s*.45,3,-s]],null,P.green,2.4);leaf(-2,-s*.25,s*.19,-.8);leaf(-1,-s*.5,s*.2,.75);leaf(1,-s*.74,s*.18,-.65);c.restore();}
  function cloud(x,y,s) {c.save();c.translate(x,y);c.scale(s,s);path([['moveTo',-43,8],['bezierCurveTo',-51,-10,-31,-19,-21,-14],['bezierCurveTo',-19,-38,15,-37,20,-18],['bezierCurveTo',42,-27,59,-4,45,11],['bezierCurveTo',21,20,-17,18,-43,8]],'#fffdf4');c.restore();}
  function sparkle(x,y,s,color) {path([['moveTo',x,y-s],['quadraticCurveTo',x+1,y-1,x+s,y],['quadraticCurveTo',x+1,y+1,x,y+s],['quadraticCurveTo',x-1,y+1,x-s,y],['quadraticCurveTo',x-1,y-1,x,y-s]],color||P.gold);}
  function ground() {
    path([['moveTo',-40,356],['bezierCurveTo',118,322,187,366,310,350],['bezierCurveTo',441,333,502,337,650,365],['lineTo',650,470],['lineTo',-40,470],['closePath']], '#e9e9cd');
    path([['moveTo',157,430],['bezierCurveTo',198,386,247,371,295,354],['bezierCurveTo',278,380,282,398,310,430],['closePath']], '#f2e9d2');
    for(let i=0;i<18;i++){const x=28+(i*77)%560,y=366+(i*31)%58;line(x,y,x+4,y-3,'#c2caa7',1.4);}
  }
  function backdrop(book) {
    c.fillStyle=P.paper;c.fillRect(-200,-200,1000,850);
    // A quiet paper grain, with deterministic placement so pages never flicker.
    c.save();c.globalAlpha=.20;for(let i=0;i<1200;i++){let x=(i*73.137)%600,y=(i*41.697)%430;ellipse(x,y,.48,.3,'#d7c8a8');}c.restore();
    ellipse(466,84,31,31,'#f5db91');
    c.save();c.globalAlpha=.36;ellipse(466,84,41,41,'#f4dfae');c.restore();
    cloud(123,96,.85);cloud(369,57,.46);ground();
    sprig(59,377,62,false);sprig(539,375,54,true);
    if(book!=='flower'){for(let i=0;i<3;i++){const x=90+i*13,y=381-(i%2)*14;line(x,y,x,y-14,P.green,1.5);ellipse(x,y-17,4.5,5,P.gold);}}
  }
  function shoe(x,y,flip,color) {path([['moveTo',x-9,y-7],['quadraticCurveTo',x+2,y-10,x+9,y-6],['quadraticCurveTo',x+(flip?-16:20),y+4,x+(flip?-15:17),y+8],['quadraticCurveTo',x,y+12,x-11,y+6],['closePath']],color||'#b98266');line(x-7,y+8,x+11,y+8,'#f8ecd8',2.4);}
  // Every role shares a large-head doll body. Landmark face bounds give real
  // faces the same scale regardless of hair length; older cutouts use their
  // visible silhouette so transparent padding still cannot shrink them.
  const DOLL_HEAD = { rx:54, ry:57, cy:-124 };
  const DOLL_BODY = { shoulder:-78, hem:-27 };
  const CHILD_ROLES = ['child','olderBrother','youngerBrother','olderSister','youngerSister'];
  const ROLES = CHILD_ROLES.concat(['dad','mom','grandpa','grandma']);
  const selectedRole = ROLES.includes(o.characterRole) ? o.characterRole : 'child';
  let currentPersonId = (o.framing==='avatar'||o.framing==='character') ? o.characterId : null;
  function headY(role) { return o.framing==='avatar'||CHILD_ROLES.includes(role) ? DOLL_HEAD.cy : -254; }
  function portrait(role, fallback) {
    // This also covers old saved records, native fallback pages and standalone
    // avatar/body thumbnails: adult portraits and their layout are never read.
    if(!canUsePhoto(role))return {};
    const item = o.avatars && o.avatars[currentPersonId || role];
    if (item && item.image) return item;
    if (role === 'child') return {image:fallback || o.avatar,kind:o.avatarKind,metrics:o.avatarMetrics,layout:o.avatarLayout};
    return {};
  }
  function imageDimensions(image) {
    const width=image && Number(image.naturalWidth || image.width);
    const height=image && Number(image.naturalHeight || image.height);
    return Number.isFinite(width) && Number.isFinite(height) && width>0 && height>0 ? {width,height} : null;
  }
  function cutoutGeometry(item, dimensions, neutral) {
    const iw=dimensions.width, ih=dimensions.height, metrics=item.metrics || {};
    const supplied=metrics.bounds || {};
    const usable=[supplied.left,supplied.top,supplied.right,supplied.bottom].every(Number.isFinite)
      && supplied.left>=0 && supplied.top>=0 && supplied.right<=iw && supplied.bottom<=ih
      && supplied.right>supplied.left && supplied.bottom>supplied.top;
    const bounds=usable ? supplied : {left:0,top:0,right:iw,bottom:ih};
    const chin=metrics.chin || {};
    const chinX=Number.isFinite(chin.x) && chin.x>=bounds.left && chin.x<=bounds.right ? chin.x : (bounds.left+bounds.right)/2;
    const chinY=Number.isFinite(chin.y) && chin.y>=bounds.top && chin.y<=bounds.bottom ? chin.y : bounds.bottom;
    const layout=neutral ? {} : item.layout || {};
    const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
    const face=metrics.faceBounds || {};
    const hasFace=[face.left,face.top,face.right,face.bottom].every(Number.isFinite)
      && face.left>=bounds.left && face.top>=bounds.top && face.right<=bounds.right && face.bottom<=bounds.bottom
      && face.right>face.left && face.bottom>face.top;
    // Scene proportions follow the face rather than long hair. Thumbnails
    // deliberately fit the whole silhouette, independently of body placement.
    const reference=hasFace && !neutral ? face : bounds;
    const base=Math.min((hasFace && !neutral ? 108 : 128)/(reference.right-reference.left),
      (hasFace && !neutral ? 118 : 144)/(reference.bottom-reference.top));
    const scale=(neutral?base:fitScale(base,hasFace?face:null,bounds,{x:chinX,y:chinY},{crownHeight:DOLL_HEAD.ry*2,faceToCrown:1.7}))*bounded(layout.scale,.6,1.6,1);
    if(neutral && hasFace)return {bounds,scale,x:-(bounds.left+bounds.right)*scale/2,y:-11-(bounds.top+bounds.bottom)*scale/2};
    const x=bounded(layout.x,-35,35,0), y=bounded(layout.y,-35,35,0);
    return {bounds,scale,x:x-chinX*scale,y:DOLL_HEAD.ry+y-chinY*scale};
  }
  function cutoutHead(item, dimensions, role) {
    const iw=dimensions.width, ih=dimensions.height;
    const position=cutoutGeometry(item,dimensions,o.framing==='avatar');
    c.save();c.translate(0,headY(role));
    // The source stays complete even at the slider extremes. The body is the
    // positioning reference; no re-export or new inference is needed to move it.
    c.drawImage(item.image,0,0,iw,ih,position.x,position.y,iw*position.scale,ih*position.scale);
    c.restore();
  }
  function familyCoverScale(proposed) {
    let scale=proposed;
    // A shelf cover is narrower than a story page. Pull back its framing when
    // a customized head would otherwise cross the center crop, keeping the
    // same chosen head/body proportion and complete silhouette in the cover.
    const cast=[[235,238,.70,'grandpa'],[365,238,.70,'grandma'],[207,320,.73,'dad'],[393,320,.73,'mom'],[300,404,.71,'child']];
    for(const [x,y,dollScale,role] of cast){
      const item=portrait(role,o.avatar),dimensions=imageDimensions(item.image);
      if(!dimensions || item.kind!=='cutout')continue;
      const p=cutoutGeometry(item,dimensions,false),b=p.bounds;
      const left=x+(p.x+b.left*p.scale)*dollScale,right=x+(p.x+b.right*p.scale)*dollScale;
      const top=y+(DOLL_HEAD.cy+p.y+b.top*p.scale)*dollScale,bottom=y+(DOLL_HEAD.cy+p.y+b.bottom*p.scale)*dollScale;
      const halfWidth=Math.max(300-left,right-300)+6,halfHeight=Math.max(215-top,bottom-215)+6;
      scale=Math.min(scale,canvas.width/(halfWidth*2),canvas.height/(halfHeight*2));
    }
    return scale;
  }
  function childHead(avatar,role) {
    const {rx,ry}=DOLL_HEAD,cy=headY(role);
    c.save();c.translate(0,cy);
    const iw=avatar && Number(avatar.naturalWidth || avatar.width);
    const ih=avatar && Number(avatar.naturalHeight || avatar.height);
    const hasAvatar=Number.isFinite(iw) && Number.isFinite(ih) && iw>0 && ih>0;
    ellipse(-rx+1,7,9,12,P.skin);ellipse(rx-1,7,9,12,P.skin);
    // The fine cream edge separates a real photo from the body without a thick sticker rim.
    ellipse(0,0,rx+.8,ry+.8,'#fffaf0');
    if(hasAvatar){
      c.save();c.beginPath();c.ellipse(0,0,rx,ry,0,0,Math.PI*2);c.clip();
      const ratio=rx/ry;let sw=iw,sh=ih;
      if(iw/ih>ratio)sw=ih*ratio;else sh=iw/ratio;
      // Source and destination have the same aspect ratio: crop, never stretch the face.
      c.drawImage(avatar,(iw-sw)/2,(ih-sh)/2,sw,sh,-rx,-ry,rx*2,ry*2);c.restore();
      c.save();c.globalAlpha=.25;c.strokeStyle='#d8bda0';c.lineWidth=.65;c.beginPath();c.ellipse(0,0,rx,ry,0,0,Math.PI*2);c.stroke();c.restore();
    } else {
      ellipse(0,0,rx,ry,P.skin);
      path([['moveTo',-54,1],['bezierCurveTo',-67,-39,-28,-68,12,-58],['bezierCurveTo',44,-61,65,-24,54,5],['lineTo',47,-18],['quadraticCurveTo',18,-13,7,-37],['quadraticCurveTo',-7,-10,-25,-21],['quadraticCurveTo',-36,-3,-54,1]],'#624c43');
      ellipse(-18,5,3.3,4.5,P.ink);ellipse(18,5,3.3,4.5,P.ink);
      c.save();c.globalAlpha=.6;ellipse(-33,20,10,6.6,P.blush);ellipse(33,20,10,6.6,P.blush);c.restore();
      path([['moveTo',-7,25],['quadraticCurveTo',0,32,8,24]],null,'#a96854',2.2);
    }
    c.restore();
  }
  function head(role,avatar) {
    const item=portrait(role,avatar), dimensions=imageDimensions(item.image);
    if(dimensions && item.kind==='cutout'){cutoutHead(item,dimensions,role);return;}
    if(CHILD_ROLES.includes(role) || dimensions){childHead(item.image,role);return;}
    // Adults retain a cute large head, while their shoulders, torso and legs
    // are visibly longer than the child's rather than being scaled toddlers.
    c.save();c.translate(0,headY(role));c.scale(DOLL_HEAD.rx/27,DOLL_HEAD.ry/31);
    const rx=27, ry=31, hy=0;
    ellipse(-rx+1,hy+5,8,10,P.skin);ellipse(rx-1,hy+5,8,10,P.skin);
    ellipse(0,hy,rx+2,ry+2,'#fffaf0');
    ellipse(0,hy,rx,ry,P.skin);
    const hair=(role==='grandpa'||role==='grandma')?'#d4cdc2':'#624c43';
    if(role==='mom'||role==='grandma'){
      if(role==='grandma')ellipse(22,hy-29,14,14,hair);
      path([['moveTo',-rx-2,hy+13],['bezierCurveTo',-rx-11,hy-24,-22,hy-40,0,hy-36],['bezierCurveTo',30,hy-38,rx+11,hy-14,rx+4,hy+21],['quadraticCurveTo',rx-4,hy+14,rx-5,hy-4],['quadraticCurveTo',7,hy-9,0,hy-25],['quadraticCurveTo',-12,hy-8,-rx+5,hy-7],['lineTo',-rx+5,hy+15],['closePath']],hair);
    } else if(role==='grandpa') {
      path([['moveTo',-rx,hy+3],['bezierCurveTo',-rx-9,hy-26,-15,hy-34,-7,hy-29],['quadraticCurveTo',-18,hy-23,-20,hy-1]],hair);
      path([['moveTo',rx,hy+3],['bezierCurveTo',rx+8,hy-25,15,hy-34,7,hy-29],['quadraticCurveTo',19,hy-22,20,hy-1]],hair);
    } else {
      path([['moveTo',-rx,hy+1],['bezierCurveTo',-rx-11,hy-28,-18,hy-ry-10,8,hy-ry],['bezierCurveTo',31,hy-ry-3,rx+11,hy-14,rx,hy+3],['lineTo',rx-5,hy-14],['quadraticCurveTo',12,hy-12,5,hy-27],['quadraticCurveTo',-4,hy-9,-17,hy-16],['quadraticCurveTo',-24,hy-4,-rx,hy+1]],hair);
    }
    const ey=hy+4;
    ellipse(-12,ey,2.35,3.25,P.ink);ellipse(12,ey,2.35,3.25,P.ink);
    c.save();c.globalAlpha=.6;ellipse(-22,hy+14,7,4.8,P.blush);ellipse(22,hy+14,7,4.8,P.blush);c.restore();
    path([['moveTo',-5,hy+18],['quadraticCurveTo',0,hy+23,6,hy+17]],null,'#a96854',1.8);
    if(role==='grandpa'){ellipse(-12,ey,9,8,'rgba(255,255,255,.18)');ellipse(12,ey,9,8,'rgba(255,255,255,.18)');c.strokeStyle='#927f69';c.lineWidth=1.5;[-12,12].forEach(x=>{c.beginPath();c.ellipse(x,ey,9,8,0,0,Math.PI*2);c.stroke();});line(-3,ey,3,ey,'#927f69',1.5);}
    c.restore();
  }
  function person(x,y,scale,role,pose,avatar,memberId) {
    c.save();c.translate(x,y);c.scale(scale,scale);
    const previousId=currentPersonId;currentPersonId=memberId||((o.framing==='character')?o.characterId:null);
    const child=CHILD_ROLES.includes(role), shoulder=child?DOLL_BODY.shoulder:-208,hem=child?DOLL_BODY.hem:-99;
    const clothes={child:'#e7ba57',dad:'#94adb0',mom:'#d99c8c',grandpa:'#baab88',grandma:'#94a68b',olderBrother:'#91a9b5',youngerBrother:'#b6ad78',olderSister:'#c99a9b',youngerSister:'#d5af86'};
    ellipse(0,11,38,8,'rgba(159,143,103,.15)');
    line(child?-12:-20,hem,child?-14:-22,-7,child?'#c69b69':'#777d70',child?16:24);line(child?12:20,hem,child?14:22,-7,child?'#c69b69':'#777d70',child?16:24);
    shoe(child?-14:-22,0,true);shoe(child?14:22,0,false);
    let left=[child?-39:-52,shoulder+(child?36:72)],right=[child?39:52,shoulder+(child?36:72)];
    if(pose==='wave')right=[70,shoulder-39];
    if(pose==='open'){left=[-55,shoulder+26];right=[55,shoulder+26];}
    if(pose==='point'){right=[64,shoulder+17];}
    if(pose==='hold')right=[57,-70];
    if(pose==='count')right=[68,shoulder-31];
    if(pose==='self'){right=[7,shoulder+25];}
    // Curved sleeves and pillowy palms, rather than stick limbs.
    path([['moveTo',child?-22:-35,shoulder+6],['quadraticCurveTo',child?-37:-48,shoulder+23,left[0],left[1]]],null,clothes[role],child?15:21);
    path([['moveTo',child?22:35,shoulder+6],['quadraticCurveTo',child?40:51,shoulder+19,right[0],right[1]]],null,clothes[role],child?15:21);
    ellipse(left[0],left[1]+2,8.2,9.5,P.skin,-.3);ellipse(right[0],right[1]+2,8.2,9.5,P.skin,.3);
    if(pose==='wave'||pose==='count'){for(let i=0;i<4;i++)line(right[0]-5+i*3.5,right[1]-3,right[0]-7+i*4,right[1]-11+(i%2)*2,P.skin,3.6);}
    if(pose==='point')line(right[0]+1,right[1]-3,right[0]+13,right[1]-4,P.skin,4.5);
    const shoulderWidth=child?28:42,hemWidth=child?31:40;
    path([['moveTo',-10,shoulder-6],['quadraticCurveTo',-shoulderWidth,shoulder-7,-shoulderWidth,shoulder+15],['quadraticCurveTo',-hemWidth-8,hem-14,-hemWidth,hem],['quadraticCurveTo',0,hem+13,hemWidth,hem],['quadraticCurveTo',hemWidth+8,hem-14,shoulderWidth,shoulder+14],['quadraticCurveTo',shoulderWidth,shoulder-8,10,shoulder-6],['closePath']],clothes[role]);
    path([['moveTo',-12,shoulder-6],['quadraticCurveTo',0,shoulder+13,12,shoulder-6]],null,'#f6ead5',5);
    if(child){path([['moveTo',-12,shoulder+29],['lineTo',12,shoulder+29],['lineTo',10,shoulder+41],['quadraticCurveTo',0,shoulder+47,-10,shoulder+41],['closePath']],'#a9b995');ellipse(0,shoulder+33,2,2,'#f5e7cb');}
    else {[23,36,47].forEach(v=>ellipse(0,shoulder+v,1.6,1.6,'#f6e9d7'));}
    head(role,avatar);currentPersonId=previousId;c.restore();
  }
  function house(x,y,s) {c.save();c.translate(x,y);c.scale(s,s);path([['moveTo',-87,0],['lineTo',-84,-106],['lineTo',84,-106],['lineTo',88,0],['quadraticCurveTo',0,7,-87,0]],'#ead3a7');path([['moveTo',-103,-103],['lineTo',-8,-173],['quadraticCurveTo',0,-180,10,-173],['lineTo',106,-103],['quadraticCurveTo',105,-94,95,-94],['lineTo',0,-157],['lineTo',-95,-94],['closePath']],'#c9866e');path([['moveTo',-19,0],['lineTo',-19,-57],['quadraticCurveTo',-18,-80,5,-80],['quadraticCurveTo',25,-78,25,-57],['lineTo',25,0],['closePath']],'#8b9e7e');ellipse(14,-36,2.5,2.5,'#e5c773');[-51,54].forEach(px=>{path([['moveTo',px-16,-76],['lineTo',px+16,-76],['lineTo',px+16,-38],['lineTo',px-16,-38],['closePath']],'#f9edc9');line(px,-73,px,-41,'#c6ae88',2);line(px-13,-57,px+13,-57,'#c6ae88',2);});c.restore();}
  function flag(x,y) {line(x,y,x,y-64,'#b2a181',3);path([['moveTo',x,y-64],['quadraticCurveTo',x+20,y-75,x+39,y-62],['lineTo',x+38,y-37],['quadraticCurveTo',x+17,y-48,x,y-36],['closePath']],P.peach);}
  function balloon(x,y,color) {path([['moveTo',x,y+18],['bezierCurveTo',x-12,y+60,x+17,y+67,x+1,y+97]],null,'#bbaa87',1.2);ellipse(x,y,19,24,color,.08);path([['moveTo',x,y+22],['lineTo',x-4,y+29],['lineTo',x+5,y+28],['closePath']],color);c.save();c.globalAlpha=.4;ellipse(x-6,y-9,3,7,'#fffaf1',.4);c.restore();}
  function intro(page,avatar,cover) {
    if(cover)page=0;
    if(page===0){person(294,369,1.16,'child','wave',avatar);sparkle(387,204,9);sparkle(199,243,6);leaf(459,343,23,-.4);}
    else if(page===1){person(300,369,1.19,'child','self',avatar);sparkle(392,233,7);sparkle(204,200,6);}
    else if(page===2){person(284,369,1.15,'child','open',avatar);path([['moveTo',367,167],['bezierCurveTo',378,139,407,144,413,161],['bezierCurveTo',420,186,386,183,389,202]],null,P.gold,6);ellipse(389,214,3,3,P.gold);}
    else if(page===3){const colors=['#dfac8d','#a8baa0','#e0bf71','#94b5bf','#e3a6a0'];for(let i=0;i<5;i++)balloon(168+i*65,112-Math.sin(i)*23,colors[i]);person(301,379,1.1,'child','count',avatar);}
    else if(page===4){house(411,313,.70);flag(484,274);path([['moveTo',195,288],['quadraticCurveTo',177,275,177,296],['lineTo',179,325],['quadraticCurveTo',186,337,198,327]],'#d8aa65');person(223,371,1.15,'child','wave',avatar);}
    else{person(298,370,1.15,'child','open',avatar);sparkle(190,205,7);sparkle(410,221,8);path([['moveTo',435,344],['quadraticCurveTo',450,326,462,344],['quadraticCurveTo',457,360,444,365],['quadraticCurveTo',429,354,435,344]],'#dca294');}
  }
  function petal(x,y,angle,s,color) {c.save();c.translate(x,y);c.rotate(angle);path([['moveTo',0,0],['bezierCurveTo',-12*s,-5*s,-15*s,-24*s,-5*s,-31*s],['bezierCurveTo',10*s,-38*s,18*s,-18*s,0,0]],color||'#e5a29a');path([['moveTo',0,-5*s],['quadraticCurveTo',-2*s,-17*s,0,-24*s]],null,'rgba(255,250,231,.35)',1.3);c.restore();}
  function flower(page,avatar,cover) {
    if(cover)page=0;
    const cx=376,cy=176,settled=[ [405,353,-.8],[449,367,.8],[488,350,1.2],[468,391,-.3],[423,386,1.9],[513,375,-1.1],[387,378,.2],[535,350,1.2],[452,350,-.6],[500,397,1.1],[553,389,-1.8] ];
    const flight=[[419,126,.7],[475,156,1.7],[453,215,-1.1],[513,247,1.1],[410,147,1.0],[467,179,2.0],[494,247,.2],[438,286,-1.2],[424,207,.5],[471,263,1.7],[513,298,-.4]];
    const released=page<2?0:page===2?4:page===3?8:11;
    const previously=page<3?0:page===3?4:page===4?8:11;
    person(243,370,1.12,'child',page===5?'open':'hold',avatar);
    path([['moveTo',307,291],['bezierCurveTo',351,281,382,244,cx,cy]],null,P.darkGreen,5);
    leaf(356,255,21,-.7,P.green);leaf(375,221,18,.75,P.leaf);
    for(let i=0;i<11;i++){
      const angle=i*Math.PI*2/11;
      if(i>=released){petal(cx+Math.sin(angle)*19,cy-Math.cos(angle)*19,angle,1.23,i%2?'#ebb2a3':'#e5a095');}
      else if(i<previously){const p=settled[i];petal(p[0],p[1],p[2],.9,i%2?'#ebb2a3':'#e5a095');}
      else {const p=flight[i];petal(p[0],p[1],p[2],.94,i%2?'#ebb2a3':'#e5a095');}
    }
    ellipse(cx,cy,22,22,'#e5b958');ellipse(cx-3,cy-3,15,15,'#edc771');
    [[-7,-5],[4,-9],[9,3],[-4,7],[1,0]].forEach(p=>ellipse(cx+p[0],cy+p[1],1.8,1.8,'#d6a344'));
    if(page>=2&&page<5){c.save();c.globalAlpha=.40;for(let i=0;i<2;i++)path([['moveTo',408+i*12,211+i*30],['bezierCurveTo',439,196+i*30,453,225+i*30,478,214+i*30]],null,P.blue,1.7);c.restore();}
    if(page===5){ // Eleven petals are now mostly hidden behind grass, with little pink clues.
      path([['moveTo',363,403],['quadraticCurveTo',363,370,378,347],['lineTo',382,378],['quadraticCurveTo',395,342,405,336],['lineTo',402,373],['quadraticCurveTo',420,333,430,334],['lineTo',425,376],['quadraticCurveTo',442,342,452,335],['lineTo',450,373],['quadraticCurveTo',463,344,478,334],['lineTo',476,376],['quadraticCurveTo',490,343,505,339],['lineTo',504,379],['quadraticCurveTo',523,343,534,335],['lineTo',532,375],['quadraticCurveTo',552,343,565,348],['lineTo',562,385],['lineTo',583,368],['lineTo',577,417],['closePath']],'#9eb083');
      for(let i=0;i<8;i++)line(387+i*23,403,397+i*23,366+(i%3)*8,'#7f9972',1.4);
    }
  }
  function family(page,avatar,cover) {
    if(Array.isArray(o.members)){
      const included=o.members.filter(member=>member&&member.included!==false);
      const ids=!cover&&o.familyScene&&o.familyScene.memberIds;
      const members=(Array.isArray(ids)?ids.map(id=>included.find(member=>member.id===id)).filter(Boolean):included).slice(0,12);
      const area=cover?{x:154,width:292}:{x:22,width:354};
      const columns=Math.min(members.length,cover?3:members.length<=6?members.length:Math.ceil(members.length/2));
      const rows=Math.max(1,Math.ceil(members.length/Math.max(1,columns))),cellHeight=334/rows;
      const cellWidth=area.width/Math.max(1,columns);
      const extents=members.map(member=>{
        const adult=!CHILD_ROLES.includes(member.role),extent={left:-83,right:83,top:adult?-318:-191,bottom:17};
        const previous=currentPersonId;currentPersonId=member.id;
        const item=portrait(member.role,member.id==='child'?avatar:null),size=imageDimensions(item.image);currentPersonId=previous;
        if(size&&item.kind==='cutout'){
          const g=cutoutGeometry(item,size,false),b=g.bounds;
          extent.left=Math.min(extent.left,g.x+b.left*g.scale);extent.right=Math.max(extent.right,g.x+b.right*g.scale);
          extent.top=Math.min(extent.top,headY(member.role)+g.y+b.top*g.scale);extent.bottom=Math.max(extent.bottom,headY(member.role)+g.y+b.bottom*g.scale);
        }
        return extent;
      });
      let scale=Infinity;extents.forEach(e=>{scale=Math.min(scale,cellWidth/(e.right-e.left),cellHeight/(e.bottom-e.top));});scale*=.92;
      house(cover?300:201,282,.86);
      members.forEach((member,index)=>{const row=Math.floor(index/columns),col=index%columns,inRow=Math.min(columns,members.length-row*columns),rowWidth=inRow*cellWidth;
        const e=extents[index],x=area.x+(area.width-rowWidth)/2+(col+.5)*cellWidth-(e.left+e.right)*scale/2,y=51+(row+1)*cellHeight-e.bottom*scale;
        person(x,y,scale,member.role,o.familyScene&&o.familyScene.focusId===member.id?'wave':'open',member.id==='child'?avatar:null,member.id);
      });return;
    }
    const roles=['grandpa','grandma','dad','mom'];
    if(cover){
      // The narrow shelf cover retains roughly x=130..470 after its center crop.
      // A 2+2+1 arrangement keeps all five large faces inside that safe region.
      house(300,283,.83);ellipse(300,330,167,67,'#e3e7c9');
      person(227,250,.57,'grandpa','open',null);person(373,250,.57,'grandma','open',null);
      person(209,404,.57,'dad','open',null);person(391,404,.57,'mom','open',null);
      person(300,404,.58,'child','open',avatar);
    }
    else if(page===0||page===7){
      house(309,276,.85);ellipse(300,331,231,64,'#e3e7c9');
      // Back-row faces end above the child's face; only bodies overlap.
      roles.forEach((r,i)=>person(130+i*111,354,.81,r,i===3?'wave':'open',null));
      person(300,390,.73,'child','open',avatar);
    }
    else if(page===1){person(205,375,1.0,'grandpa','wave',null);person(390,375,1.0,'grandma','open',null);sprig(486,373,49,true);}
    else if(page===2){person(205,375,1.0,'dad','wave',null);person(390,375,1.0,'mom','open',null);sparkle(491,185,6);}
    else if(page===3||page===4){roles.forEach((r,i)=>person(117+i*122,370,.82,r,page===4?'open':'wave',null));if(page===4)sparkle(303,42,8);}
    else if(page===5){person(220,375,1.0,'mom','point',null);person(391,375,1.03,'child','self',avatar);sparkle(470,191,7);}
    else if(page===6){roles.forEach((r,i)=>person(87+i*102,370,.73,r,'open',null));person(507,376,.72,'child','count',avatar);}
  }
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
  c.fillStyle=P.paper;c.fillRect(0,0,canvas.width,canvas.height);
  if(o.framing==='avatar'){
    const s=Math.min(canvas.width/164,canvas.height/164);
    c.setTransform(s,0,0,s,canvas.width/2,canvas.height/2-(DOLL_HEAD.cy-11)*s);
    head(selectedRole,o.avatar);c.setTransform(1,0,0,1,0,0);return;
  }
  let s=o.framing==='hero'?canvas.height/430:o.cover?Math.max(canvas.width/600,canvas.height/430):Math.min(canvas.width/600,canvas.height/430);
  const introText=o.book==='intro'&&o.reserveText&&!o.framing&&!o.cover;
  if(introText)s=Math.min(canvas.width*.65/600,canvas.height/430);
  if(o.cover && o.book==='family' && o.framing!=='hero' && !Array.isArray(o.members))s=familyCoverScale(s);
  c.setTransform(s,0,0,s,o.framing==='hero'?canvas.width*.75-300*s:(canvas.width*(introText ? .65 : 1)-600*s)/2,(canvas.height-430*s)/2);
  c.lineCap='round';c.lineJoin='round';
  backdrop(o.book);
  const page=Math.max(0,Math.floor(Number(o.page)||0));
  if(o.framing==='character')person(300,380,1.10,selectedRole,'wave',o.avatar);
  else if(o.book==='flower')flower(Math.min(page,5),o.avatar,o.cover);
  else if(o.book==='family')family(Math.min(page,7),o.avatar,o.cover);
  else intro(Math.min(page,5),o.avatar,o.cover);
  c.setTransform(1,0,0,1,0,0);
}

module.exports = { draw };
