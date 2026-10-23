'use strict';
// Local, repeatable benchmark. Uses an already extracted head; recognition,
// mobile hardware and a future fully migrated pose library are not simulated.
const fs=require('node:fs'),path=require('node:path');
const pw=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),preview=path.join(root,'preview');
const src=fs.readFileSync(path.join(preview,'index.html'),'utf8').replace('  const { draw } = shared.art;','  window.__compositionShared=shared; return;\n  const { draw } = shared.art;');
const photo={data:'data:image/png;base64,'+fs.readFileSync(path.join(root,'art-samples/my-flower-production/search-head.png')).toString('base64'),metrics:JSON.parse(fs.readFileSync(path.join(preview,'art/flower/manifest.json'),'utf8')).scenes.search.headMetrics};
(async()=>{const browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];try{
  for(const cpuRate of [1,4])for(const count of [3,6])for(let trial=0;trial<3;trial++){
    const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage();
    await page.route('http://127.0.0.1:4173/',r=>r.fulfill({status:200,contentType:'text/html',body:src}));
    await page.goto('http://127.0.0.1:4173/');const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
    // CPU scaling is a desktop laboratory condition, not a real phone result.
    const result=await page.evaluate(async({photo,count})=>{
      const shared=window.__compositionShared,profile={name:'小石头',age:5,className:'大班'},members=shared.family.defaultMembers();
      const books=shared.stories.listBooks(profile,members,{includeApproved:true}).slice(0,count),image=new Image();image.src=photo.data;await image.decode();
      const avatars={child:{image,kind:'cutout',metrics:photo.metrics}},family=shared.stories.getBook('family',profile,members,{includeApproved:true});
      const loader=id=>id==='intro'?window.LittleIntroArtLoader:id==='flower'?window.LittleArtLoader:id==='family'?window.LittleFamilyArtLoader:window.LittleSequenceArtLoader.forBook(id);
      const art=id=>({intro:shared.introArt,flower:shared.flowerArt,family:shared.familyArt}[id]||shared.sequenceArt);
      const entries=books.flatMap(b=>[{id:b.id,page:0,cover:true},...b.pages.map((_,page)=>({id:b.id,page,cover:false}))]);
      performance.clearResourceTimings();const t0=performance.now();
      const layers=await Promise.all(entries.map(e=>loader(e.id).ensure(e.page,{cover:e.cover,members,familyScene:family.scenes?.[e.page]})));
      const t1=performance.now(),canvases=[];
      for(let i=0;i<entries.length;i++){
        const e=entries[i],canvas=document.createElement('canvas'),loaded=layers[i],m=loaded.manifest,a=loaded.assets;
        const scene=['hands','rain','stone'].includes(e.id)?shared.sequenceArt.pagePlan(m,e.page,e).scene:e.id==='intro'?shared.introArt.pagePlan(e.cover?0:e.page).scene:e.id==='flower'?shared.flowerArt.pagePlan(e.cover?0:e.page).scene:m.background;
        const adjusted=window.LittlePhotoTone.apply(avatars,a[scene]);
        if(!art(e.id).draw(canvas,{book:e.id,page:e.page,cover:e.cover,width:1400,height:788,pixelRatio:1,...loaded,avatars:adjusted,members,familyScene:family.scenes?.[e.page],reserveText:e.id==='intro'&&!e.cover}))throw Error('Failed '+e.id);
        canvas.getContext('2d').getImageData(0,0,1,1);canvases.push(canvas);
      }
      const t2=performance.now();let pngBytes=0;
      for(const canvas of canvases)pngBytes+=(await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).size;
      const t3=performance.now(),resources=performance.getEntriesByType('resource');
      const composer=shared.characterRig.createComposer(()=>document.createElement('canvas'),[{id:'stand-wave',version:1,model:'child-v1',bodyUrl:'./art/family/child-body.webp',collar:{x:501,y:225},bounds:{left:180,top:199,right:968,bottom:1405},headRotation:0}]);
      const body=new Image();body.src='./art/family/child-body.webp';await body.decode();const p0=performance.now(),portrait=composer.prepare(avatars.child),actor=composer.compose({portrait,body,poseId:'stand-wave'});actor.image.getContext('2d').getImageData(0,0,1,1);const p1=performance.now();
      for(let n=0;n<1000;n++)composer.compose({portrait,body,poseId:'stand-wave'});const p2=performance.now();
      return {books:books.length,pages:entries.length,assetMs:t1-t0,renderMs:t2-t1,pngEncodeMs:t3-t2,readyMs:t2-t0,totalWithPngMs:t3-t0,assetBytes:resources.reduce((sum,r)=>sum+r.encodedBodySize,0),assetRequests:resources.length,retainedPixelBytes:canvases.length*1400*788*4,pngBytes,registeredPoses:1,actorComposeMs:p1-p0,cached1000Ms:p2-p1};
    },{photo,count});
    results.push({cpuRate,trial,...result});await context.close();
  }
  const out=path.join(root,'.local/composition-benchmark.json');fs.writeFileSync(out,JSON.stringify({environment:'Windows desktop Chrome, localhost assets, 3 fresh browser contexts per condition; CPU 4x is emulation, not a phone',excludes:'face recognition/model download, remote network, future unmade poses',results},null,2));
  const median=ns=>ns.sort((a,b)=>a-b)[Math.floor(ns.length/2)];
  for(const cpuRate of [1,4])for(const count of [3,6]){const rows=results.filter(r=>r.cpuRate===cpuRate&&r.books===count);console.log(JSON.stringify({cpuRate,books:count,pages:rows[0].pages,assetMs:Math.round(median(rows.map(r=>r.assetMs))),renderMs:Math.round(median(rows.map(r=>r.renderMs))),readyMs:Math.round(median(rows.map(r=>r.readyMs))),pngEncodeMs:Math.round(median(rows.map(r=>r.pngEncodeMs))),assetMiB:+(median(rows.map(r=>r.assetBytes))/1048576).toFixed(2),pixelMiB:+(rows[0].retainedPixelBytes/1048576).toFixed(2),onePoseMs:+median(rows.map(r=>r.actorComposeMs)).toFixed(2),cached1000Ms:+median(rows.map(r=>r.cached1000Ms)).toFixed(2)}));}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
