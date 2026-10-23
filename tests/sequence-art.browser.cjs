'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..'),preview=path.join(root,'preview'),output=path.join(preview,'qa/sequence');
const selectedBooks=process.argv.length>2?process.argv.slice(2):['hands','rain','stone'];
assert.ok(selectedBooks.length&&selectedBooks.every(book=>['hands','rain','stone'].includes(book)),'optional arguments must be approved book IDs');
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function pointOf(call,x,y){const a=call.args,m=call.matrix,px=a[4]+x*a[6]/a[2],py=a[5]+y*a[7]/a[3];return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};}
async function main(){
  const manifests={};
  for(const book of selectedBooks){
    const file=path.join(preview,'art/sequence',book,'manifest.json');assert.ok(fs.existsSync(file),book+' real-art manifest is required');
    manifests[book]=JSON.parse(fs.readFileSync(file,'utf8'));fs.mkdirSync(path.join(output,book),{recursive:true});
  }
  const fixtureMetrics=JSON.parse(fs.readFileSync(path.join(preview,'art/flower/manifest.json'),'utf8')).scenes.search.headMetrics;
  const longMetrics=JSON.parse(fs.readFileSync(path.join(preview,'qa/face/long-hair-results.json'),'utf8')).metrics;
  // Reuse fictional generated heads for geometry, never upload photographs.
  const fixtures={photo:{url:'./art/flower/search-head.webp',metrics:fixtureMetrics},long:{url:'./qa/face/long-hair-cutout.png',metrics:longMetrics}};
  const introSource=fs.readFileSync(path.join(root,'miniprogram/lib/intro-art.js'),'utf8');
  const sequenceSource=fs.readFileSync(path.join(root,'miniprogram/lib/sequence-art.js'),'utf8');
  const loaderSource=fs.readFileSync(path.join(preview,'sequence-art-loader.js'),'utf8');
  const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fbf6e9}canvas{display:block}</style><canvas></canvas><script>const intro=(function(){const module={exports:{}};'+introSource+'\nreturn module.exports;})(); const require=name=>{if(name!=="./intro-art")throw Error(name);return intro;};const module={exports:{}};'+sequenceSource+'\nwindow.sequenceArt=module.exports;</script><script>'+loaderSource+'</script>';
  const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:836,height:471},deviceScaleFactor:1}),requests=[],errors=[];
    await context.route('http://127.0.0.1:4883/**',route=>{
      const request=route.request(),url=new URL(request.url());requests.push(url.pathname);assert.equal(request.method(),'GET');
      if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':csp},body:html});
      const file=path.resolve(preview,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(preview+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      return route.fulfill({status:200,contentType:{'.json':'application/json','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4883/');
    await page.evaluate(async fixtures=>{
      window.sequencePhotos={};
      for(const [name,spec]of Object.entries(fixtures)){const image=new Image();image.src=spec.url;await image.decode();window.sequencePhotos[name]={image,kind:'cutout',metrics:spec.metrics,layout:{scale:1,x:0,y:0}};}
    },fixtures);
    const cases=[];
    for(const [book,manifest]of Object.entries(manifests)){
      for(let index=0;index<manifest.pages.length;index++){
        cases.push({book,page:index,name:'default-page-'+(index+1),width:836,height:471});
        cases.push({book,page:index,name:'photo-page-'+(index+1),photo:'photo',width:568,height:216});
      }
      for(const [width,height,name]of [[120,110,'shelf'],[540,146,'reader-cover']])for(const photo of [undefined,'photo'])cases.push({book,cover:true,name:(photo||'default')+'-'+name,width,height,photo});
      const headed=manifest.pages.findIndex(entry=>manifest.scenes[entry.scene].head!==false);
      if(headed>=0)cases.push({book,page:headed,name:'long-hair-extreme',photo:'long',width:844,height:286,layout:{scale:1.6,x:-35,y:-35}});
    }
    const results=[];
    for(const item of cases){
      await page.setViewportSize({width:item.width,height:item.height});
      const result=await page.evaluate(async item=>{
        const loader=window.LittleSequenceArtLoader.forBook(item.book),loaded=await loader.ensure(item.page||0,item),canvas=document.querySelector('canvas'),context=canvas.getContext('2d');
        const originalImage=context.drawImage,originalRect=context.rect,calls=[],clips=[];
        context.drawImage=function(image,...args){const m=context.getTransform();calls.push({src:image.src,args,matrix:[m.a,m.b,m.c,m.d,m.e,m.f],sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,filter:context.filter});return originalImage.call(this,image,...args);};
        context.rect=function(...args){clips.push(args);return originalRect.apply(this,args);};
        const options={...item,pixelRatio:1,...loaded};
        if(item.photo)options.avatars={child:{...window.sequencePhotos[item.photo],layout:item.layout||window.sequencePhotos[item.photo].layout}};
        const ok=window.sequenceArt.draw(canvas,options);context.drawImage=originalImage;context.rect=originalRect;
        const plan=window.sequenceArt.pagePlan(loaded.manifest,item.page||0,item),scene=loaded.manifest.scenes[plan.scene];
        const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
        for(let i=0;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/16000)*4))colors.add([pixels[i]>>4,pixels[i+1]>>4,pixels[i+2]>>4].join(','));
        return {ok,calls,clips,plan,scene,width:canvas.width,height:canvas.height,colors:colors.size};
      },item);
      const label=item.book+' '+item.name,m=manifests[item.book],hasHead=result.scene.head!==false;
      assert.equal(result.ok,true,label);assert.equal(result.calls.length,hasHead?2:1,label+' draws complete required layers only');assert.ok(result.colors>30,label+' has a detailed painting');
      assert.ok(result.calls[0].src.endsWith('/'+m.files[result.plan.scene]),label+' uses its own narrative scene');
      for(const call of result.calls)assert.ok(Math.abs(call.args[2]/call.args[3]-call.args[6]/call.args[7])<1e-8,label+' preserves all source proportions');
      if(hasHead){
        const call=result.calls[1],headMetrics=item.photo?fixtures[item.photo].metrics:m.heads[result.scene.head||'childHead'].metrics,b=headMetrics.bounds;
        assert.deepEqual(call.args.slice(0,4),[0,0,call.sourceWidth,call.sourceHeight],label+' keeps original photo pixels');assert.equal(call.filter,'none');
        assert.ok(call.matrix[0]*call.matrix[3]-call.matrix[1]*call.matrix[2]>0,label+' never mirrors a face');
        const [x,y,width,height]=result.clips[0],corners=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([px,py])=>pointOf(call,px,py));
        for(const p of corners){assert.ok(p.x>=x-.01&&p.x<=x+width+.01&&p.y>=y-.01&&p.y<=y+height+.01,label+' keeps hair within its actual clip');assert.ok(p.x>=-.01&&p.x<=result.width*(item.cover?1:.65)+.01&&p.y>=-.01&&p.y<=result.height+.01,label+' keeps hair visible and clear of text');}
        if(!item.layout){const pose=item.photo&&result.scene.photoPose||result.scene,neck=pose.neck||result.scene.neck,chin=pointOf(call,headMetrics.chin.x,headMetrics.chin.y),collar=pointOf(result.calls[0],neck.x,neck.y);assert.ok(Math.hypot(chin.x-collar.x,chin.y-collar.y)<.1,label+' anchors chin to the correct collar');}
      }
      await page.locator('canvas').screenshot({path:path.join(output,item.book,item.name+'.png')});
      results.push({book:item.book,name:item.name,scene:result.plan.scene,hasHead,width:result.width,height:result.height});
    }
    assert.deepEqual(errors,[]);
    for(const book of Object.keys(manifests))assert.equal(requests.filter(url=>url==='/art/sequence/'+book+'/manifest.json').length,1,'one manifest per book');
    // Fixture images are also requested once before the loader starts; shared
    // art requests themselves are cached by canonical path across all books.
    for(const [book,m]of Object.entries(manifests))for(const file of Object.values(m.files))assert.ok(requests.filter(url=>url==='/art/sequence/'+book+'/'+file).length<=1,book+' '+file+' cached across repeated pages/covers');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({cases:results,errors,assetRequests:requests.filter(url=>url.startsWith('/art/')),photographsUploaded:false},null,2));
    console.log('PASS: '+results.length+' real sequence-art scenes/covers; correct narrative plates, object closeups, whole original hair, exact collar attachment, no stretching/text overlap, cached local-only layers.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
