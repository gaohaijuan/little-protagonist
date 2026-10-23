'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..'),preview=path.join(root,'preview'),out=path.join(preview,'qa/intro');
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function pointOf(draw,x,y){const a=draw.args,m=draw.matrix,px=a[4]+x*a[6]/a[2],py=a[5]+y*a[7]/a[3];return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};}
async function main(){
  const manifestFile=path.join(preview,'art/intro/manifest.json');assert.ok(fs.existsSync(manifestFile),'intro painting manifest is required');fs.mkdirSync(out,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),headMetrics=manifest.head.metrics;
  const fixtures={short:{file:'qa/pose/extracted-head.png',metrics:JSON.parse(fs.readFileSync(path.join(preview,'qa/pose/results.json'),'utf8')).metrics},long:{file:'qa/face/long-hair-cutout.png',metrics:JSON.parse(fs.readFileSync(path.join(preview,'qa/face/long-hair-results.json'),'utf8')).metrics}};
  const source=fs.readFileSync(path.join(root,'miniprogram/lib/intro-art.js'),'utf8'),loader=fs.readFileSync(path.join(preview,'intro-art-loader.js'),'utf8');
  const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fbf6e9}canvas{display:block}</style><canvas id="art"></canvas><script>const module={exports:{}};'+source+'\nwindow.introArt=module.exports;</script><script>'+loader+'</script>';
  const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:836,height:471},deviceScaleFactor:1}),requests=[],errors=[];
    await context.route('http://127.0.0.1:4882/**',async route=>{
      const url=new URL(route.request().url());requests.push(url.pathname);assert.equal(route.request().method(),'GET','photo remains local');
      if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':csp},body:html});
      const file=path.resolve(preview,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(preview+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      return route.fulfill({status:200,contentType:{'.json':'application/json','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream',headers:{'X-Content-Type-Options':'nosniff'},body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4882/');
    await page.evaluate(async()=>{await window.LittleIntroArtLoader.ensure(0);window.qaPhotos={};});
    assert.equal(requests.some(url=>/\/(play|school)\.webp$/.test(url)),false,'the hero/shelf requests only greeting plus shared head');
    await page.evaluate(async fixtures=>{for(const [key,item]of Object.entries(fixtures)){const image=new Image();image.src='./'+item.file;await image.decode();window.qaPhotos[key]={image,kind:'cutout',metrics:item.metrics,layout:{scale:1,x:0,y:0}};}},fixtures);
    const cases=[];
    for(const photo of ['default','short','long']){
      for(let index=0;index<6;index++)cases.push({name:photo+'-page-'+(index+1),photo,page:index});
      cases.push({name:photo+'-hero',photo,cover:true,framing:'hero',width:350,height:190});
      cases.push({name:photo+'-cover',photo,cover:true,width:120,height:168});
    }
    for(let index=0;index<6;index++)cases.push({name:'long-extreme-'+(index+1),photo:'long',page:index,width:568,height:216,layout:{scale:1.6,x:index%2?35:-35,y:index%2?-35:35}});
    const results=[];
    for(const item of cases){
      const width=item.width||836,height=item.height||470.5;await page.setViewportSize({width:Math.ceil(width),height:Math.ceil(height)});
      const result=await page.evaluate(async item=>{
        const options={book:'intro',page:0,width:836,height:470.5,pixelRatio:1,...item},loaded=await window.LittleIntroArtLoader.ensure(options.page,options);
        if(item.photo!=='default')options.avatars={child:{...window.qaPhotos[item.photo],layout:item.layout||window.qaPhotos[item.photo].layout}};
        const canvas=document.querySelector('canvas'),context=canvas.getContext('2d'),calls=[],rectangles=[],originalImage=context.drawImage,originalRect=context.rect;
        context.drawImage=function(image,...args){const m=context.getTransform();calls.push({src:image.src,args,matrix:[m.a,m.b,m.c,m.d,m.e,m.f],filter:context.filter});return originalImage.call(this,image,...args);};
        context.rect=function(...args){rectangles.push(args);return originalRect.apply(this,args);};
        const ok=window.introArt.draw(canvas,{...options,...loaded});context.drawImage=originalImage;context.rect=originalRect;
        return {ok,calls,rectangles,scene:window.introArt.pagePlan(options.cover||options.framing==='hero'?0:options.page).scene,width:canvas.width,height:canvas.height};
      },item);
      assert.equal(result.ok,true,item.name);assert.equal(result.calls.length,2,'one painted body scene and one complete head');
      const body=result.calls[0],head=result.calls[1],metrics=item.photo==='default'?headMetrics:fixtures[item.photo].metrics,b=metrics.bounds;
      assert.ok(body.src.endsWith('/'+result.scene+'.webp'));assert.equal(head.filter,'none');
      result.calls.forEach(call=>assert.ok(Math.abs(call.args[2]/call.args[3]-call.args[6]/call.args[7])<1e-8,'assets remain isotropic'));
      if(item.photo!=='default')assert.deepEqual(head.args.slice(0,4),[0,0,540,570]);
      const [cx,cy,cw,ch]=result.rectangles[0],corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>pointOf(head,x,y));
      const textBoundary=item.framing==='hero'?result.width*.52:0,artRight=item.cover?result.width:result.width*.65;
      for(const p of corners){assert.ok(p.x>=cx-.01&&p.x<=cx+cw+.01&&p.y>=cy-.01&&p.y<=cy+ch+.01,item.name+' entire head remains within its actual clip');assert.ok(p.x>=textBoundary-.01&&p.x<=artRight+.01&&p.y>=-.01&&p.y<=result.height+.01,item.name+' does not cover text or leave frame');}
      assert.ok(head.matrix[0]*head.matrix[3]-head.matrix[1]*head.matrix[2]>0,'face is never mirrored');
      if(!item.layout){
        const scene=manifest.scenes[result.scene],pose=item.photo==='default'?scene:scene.photoPose||scene,neck=pose.neck||scene.neck;
        const chin=pointOf(head,metrics.chin.x,metrics.chin.y),bodyNeck=pointOf(body,neck.x,neck.y);
        assert.ok(Math.hypot(chin.x-bodyNeck.x,chin.y-bodyNeck.y)<.1,item.name+' exact neck connection');
      }
      await page.locator('canvas').screenshot({path:path.join(out,item.name+'.png')});results.push({name:item.name,scene:result.scene,width:result.width,height:result.height,headCorners:corners});
    }
    for(const name of ['greeting.webp','play.webp','school.webp'])assert.equal(requests.filter(url=>url==='/art/intro/'+name).length,1,name+' decoded once for multiple pages');
    assert.equal(requests.filter(url=>url==='/art/family/child-head.webp').length,1,'one shared default child head');assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({cases:results,assetRequests:requests.filter(url=>url.startsWith('/art/')),photographsUploaded:false},null,2));
    console.log('PASS: '+cases.length+' real intro compositions, six pages/three gestures, short and long full heads, exact neck connection, hero caption separation, reader text separation, portrait covers, maximum sliders, local GET-only assets.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
