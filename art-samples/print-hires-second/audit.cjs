// Measurement only: executes existing renderers against a Canvas matrix spy.
// Does not rasterize, resize, or alter source art or user photographs.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const dims=JSON.parse(fs.readFileSync(path.join(__dirname,'source-dimensions.json'),'utf8'));
const family=require(path.join(root,'miniprogram/lib/family'));
const familyArt=require(path.join(root,'miniprogram/lib/family-art'));
const sequenceArt=require(path.join(root,'miniprogram/lib/sequence-art'));
const outputPpi=910/(128.5/25.4);
function multiply(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
function spy(){
 let m=[1,0,0,1,0,0],stack=[],calls=[];
 const c={save(){stack.push([...m]);},restore(){m=stack.pop();},setTransform(...n){m=n;},translate(x,y){m=multiply(m,[1,0,0,1,x,y]);},scale(x,y){m=multiply(m,[x,0,0,y,0,0]);},rotate(r){m=multiply(m,[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0]);},
 clearRect(){},fillRect(){},beginPath(){},ellipse(){},fill(){},rect(){},clip(){},createLinearGradient(){return {addColorStop(){}};},
 drawImage(img,...a){let sw=img.width,sh=img.height,dw=sw,dh=sh;if(a.length===8){sw=a[2];sh=a[3];dw=a[6];dh=a[7];}else if(a.length===4){dw=a[2];dh=a[3];}
 const sx=dw/sw,sy=dh/sh,aa=m[0]*sx,bb=m[1]*sx,cc=m[2]*sy,dd=m[3]*sy;
 const trace=aa*aa+bb*bb+cc*cc+dd*dd,det=(aa*dd-bb*cc)**2;
 const scale=Math.sqrt((trace+Math.sqrt(Math.max(0,trace*trace-4*det)))/2);
 const ppi=outputPpi/scale;
 calls.push({source:img.source,width:img.width,height:img.height,sourceRect:a.length===8?{x:a[0],y:a[1],width:sw,height:sh}:{x:0,y:0,width:sw,height:sh},effectivePpi:ppi,requiredLinearScale:Math.max(1,300/ppi)});
 }};
 return {canvas:{getContext(){return c;}},calls};
}
function image(source){const d=dims[source];if(!d)throw Error('Unknown source '+source);return {source,width:d[0],height:d[1],naturalWidth:d[0],naturalHeight:d[1],complete:true};}
function load(book){const dir=book==='family'?'preview/art/family':`preview/art/sequence/${book}`,m=JSON.parse(fs.readFileSync(path.join(root,dir,'manifest.json'),'utf8')),assets={};
 if(book==='family'){for(const [key,name]of Object.entries({courtyard:'courtyard',bodies:'bodies',heads:'heads',childBody:'child-body',childHead:'child-head'}))assets[key]=image(`${dir}/${name}.webp`);}
 else {for(const [key,name]of Object.entries(m.files))assets[key]=image(`${dir}/${name}`);for(const [key,spec]of Object.entries(m.heads))assets[key]=image(path.posix.normalize(`${dir}/${spec.url}`));}
 return {m,assets};
}
function measure(book,config,backgroundOnly=false){const {m,assets}=load(book);if(backgroundOnly)for(const scene of Object.values(m.scenes))scene.head=false;const pages=book==='family'?family.familyBook({name:'小朋友'},config):{scenes:m.pages};return pages.scenes.map((scene,page)=>{
 const s=spy(),o={book,page,width:1400,height:788,pixelRatio:1,manifest:m,assets,members:config,familyScene:scene,avatars:{}};
 if(!(book==='family'?familyArt:sequenceArt).draw(s.canvas,o))throw Error('Draw failed');
 const calls=s.calls,bySource={};for(const call of calls)if(!bySource[call.source]||call.effectivePpi<bySource[call.source].effectivePpi)bySource[call.source]=call;
 const components=Object.values(bySource).map(call=>({...call,requiredWidth:Math.ceil(call.width*call.requiredLinearScale),requiredHeight:Math.ceil(call.height*call.requiredLinearScale),passes300:call.effectivePpi>=300}));
 return {page:page+1,scene:book==='family'?scene.kind:scene.scene,minEffectivePpi:Math.min(...components.map(c=>c.effectivePpi)),passes300:components.every(c=>c.passes300),components};
 });}
const defaultMembers=family.defaultMembers(),pages={family:measure('family',defaultMembers),rain:measure('rain'),stone:measure('stone')};
const authoredCameraBackground={rain:measure('rain',undefined,true),stone:measure('stone',undefined,true)};
const worst={};function collect(book,pages,config){for(const page of pages)for(const c of page.components){const key=c.source;if(!worst[key]||c.effectivePpi<worst[key].effectivePpi)worst[key]={...c,book,page:page.page,scene:page.scene,configuration:config};}}
for(const b of ['rain','stone']){collect(b,pages[b],'generic illustrated head, authored camera');collect(b,authoredCameraBackground[b],'authored camera before optional head-extents expansion; conservative maximum background magnification');}
// Adults have four distinct sprites. More repeated child roles only shrink
// shared-scale groups; enumerate all four-adult subsets and 1..12 children.
for(let mask=0;mask<16;mask++)for(let children=1;children<=12;children++){
 const adults=['dad','mom','grandpa','grandma'].filter((_,i)=>mask&(1<<i));if(adults.length+children>12)continue;
 const members=[{id:'child',role:'child',included:true},...adults.map(role=>({id:role,role,included:true})),...Array.from({length:children-1},(_,i)=>({id:`member-audit${i}`,role:'youngerBrother',included:true}))];
 collect('family',measure('family',members),{adults,children});
}
const report={schemaVersion:1,measurement:{renderer:'existing family-art.js / sequence-art.js via affine Canvas draw spy',storyCanvasPx:[1400,788],printedArtPanelMm:[128.5,128.5*788/910],extractedCanvasRegionPx:[0,0,910,788],targetPpi:300,runtimeUserPhotos:'excluded: must measure actual decoded source, metrics and final camera per user; authoredCameraBackground records conservative max background magnification without optional avatar camera expansion',familyDefault:'child + dad + mom',familyEnumeration:'every adult subset, 1..12 children, max 12 total; all photographed child roles share same painted sprite'},pages,authoredCameraBackground,sourceWorst:Object.values(worst)};
fs.writeFileSync(path.join(__dirname,'ppi-audit.json'),JSON.stringify(report,null,2));
const rows=['measurement,book,page,scene,source,width,height,effective_ppi,required_linear_scale,required_width,required_height,passes_300'];
for(const [mode,collection]of Object.entries({generic_head_actual:pages,authored_camera_background_max:authoredCameraBackground}))for(const [b,ps]of Object.entries(collection))for(const p of ps)for(const c of p.components)rows.push([mode,b,p.page,p.scene,c.source,c.width,c.height,c.effectivePpi.toFixed(2),c.requiredLinearScale.toFixed(3),c.requiredWidth,c.requiredHeight,c.passes300].join(','));
fs.writeFileSync(path.join(__dirname,'page-ppi.csv'),rows.join('\n')+'\n');
console.log(JSON.stringify({pages:Object.fromEntries(Object.entries(pages).map(([b,ps])=>[b,ps.map(p=>({page:p.page,scene:p.scene,ppi:Math.round(p.minEffectivePpi),backgroundPpi:Math.round(p.components.find(c=>/courtyard|rain-|stone-(home|hold|walk|return|leave)/.test(c.source)).effectivePpi)}))])),worst:Object.values(worst).map(c=>({source:c.source,ppi:Math.round(c.effectivePpi),required:[c.requiredWidth,c.requiredHeight]}))},null,2));
