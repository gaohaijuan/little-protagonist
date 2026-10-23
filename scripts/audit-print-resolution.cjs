'use strict';
// Inspect actual source-image draws at final A5 physical size. No image resizing,
// sharpening, asset replacement, user storage access or PDF export is performed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project=path.resolve(__dirname,'..'),preview=path.join(project,'preview');
const output=path.join(project,'output/qa/print-resolution');fs.mkdirSync(output,{recursive:true});
const hook=`
window.__auditPrintSources=async()=>{
  const pages=[],assets=new Map(),prototype=CanvasRenderingContext2D.prototype,original=prototype.drawImage;
  let current=null;
  root.replaceChildren();
  prototype.drawImage=function(image,...args){
    if(current&&image instanceof HTMLImageElement&&image.src.includes('/art/')){
      const transform=this.getTransform(),sw=args.length===8?args[2]:image.naturalWidth,sh=args.length===8?args[3]:image.naturalHeight;
      const dw=args.length===8?args[6]:args.length===4?args[2]:sw,dh=args.length===8?args[7]:args.length===4?args[3]:sh;
      const scale=Math.max(Math.hypot(transform.a,transform.b)*Math.abs(dw/sw),Math.hypot(transform.c,transform.d)*Math.abs(dh/sh));
      if(scale>0){
        const density=this.canvas.width/(128/25.4),ppi=density/scale,url=new URL(image.src).pathname;
        const layer={asset:url,sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,effectivePpi:+ppi.toFixed(2),sampledPixels:{width:sw,height:sh}};
        current.layers.push(layer);
        const prior=assets.get(url);
        if(!prior||ppi<prior.minimumPpi)assets.set(url,{asset:url,width:image.naturalWidth,height:image.naturalHeight,minimumPpi:ppi,worstBook:current.bookId,worstPage:current.page,kind:current.kind});
      }
    }
    return original.call(this,image,...args);
  };
  try{
    for(const b of listBooks(state.profile,state.members,browserCatalog)){
      const plan=shared.printPlan.createBookPlan(b),painter=createPrintPainter(b,{profile:state.profile,members:state.members,avatars:{},dpi:300,plan});
      try{
        for(const leaf of plan.pages){
          current={bookId:b.id,title:b.title,kind:leaf.kind,page:leaf.page===undefined?null:leaf.page+1,layers:[]};
          const rendered=await painter.render(leaf,{bleed:true});
          rendered.canvas.width=rendered.canvas.height=1;
          current.minimumLayerPpi=current.layers.length?Math.min(...current.layers.map(l=>l.effectivePpi)):null;
          pages.push(current);current=null;
        }
      }finally{painter.dispose();}
    }
  }finally{prototype.drawImage=original;}
  return {pages,assets:[...assets.values()].map(a=>({...a,minimumPpi:+a.minimumPpi.toFixed(2),passes300:a.minimumPpi>=300,requiredResolutionMultiplier:+Math.max(1,300/a.minimumPpi).toFixed(4),requiredFullMaster:[Math.ceil(a.width*Math.max(1,300/a.minimumPpi)),Math.ceil(a.height*Math.max(1,300/a.minimumPpi))]}))};
};`;
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1000,height:800}}),errors=[];
  const html=fs.readFileSync(path.join(preview,'index.html'),'utf8').replace('  const { draw } = shared.art;','  const { draw } = shared.art;'+hook);
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.hostname!=='resolution.local'||route.request().method()!=='GET')return route.abort();
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
    const file=path.resolve(preview,'.'+url.pathname);
    if(!file.startsWith(preview+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:file.endsWith('.json')?'application/json':file.endsWith('.js')?'application/javascript':'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://resolution.local/');await page.locator('.ls-book').last().waitFor();
  const audit=await page.evaluate(()=>window.__auditPrintSources());
  if(errors.length)throw Error(errors.join('\n'));
  for(const asset of audit.assets){const p=path.join(preview,asset.asset.slice(1));asset.sha256=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
  const result={version:1,testedAt:new Date().toISOString(),method:'Observed original raster sampling through actual A5 renderer; every bitmap layer, not only first background draw.',physicalPanelMm:{width:128,height:131},targetPpi:300,
    limits:['Default cartoon avatar and default three-person family; no private saved user data loaded.','Portrait PPI varies with user original image and family count; this is not a real-photo certification.','Native pixels establish sampling sufficiency, not artistic detail or print-color approval.'],
    summary:{books:new Set(audit.pages.map(p=>p.bookId)).size,storyPages:audit.pages.filter(p=>p.kind==='story').length,assets:audit.assets.length,below300Assets:audit.assets.filter(a=>!a.passes300).length,minimumPpi:Math.min(...audit.assets.map(a=>a.minimumPpi))},...audit};
  fs.writeFileSync(path.join(output,'source-audit.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.summary));
  for(const a of result.assets.filter(a=>!a.passes300))console.log(a.asset+': '+a.minimumPpi+'ppi; at least '+a.requiredFullMaster.join('x')+' source pixels at current maximum framing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
