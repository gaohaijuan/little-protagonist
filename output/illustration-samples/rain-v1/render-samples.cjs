'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
const out=__dirname;
const source=fs.readFileSync(path.join(root,'miniprogram/lib/character-rig.js'),'utf8');
const registered=JSON.parse(fs.readFileSync(path.join(root,'content/child-pose-library.json'),'utf8')).poses['stand-wave'];
const candidate={...registered,id:'sample-stand-hold',bodyUrl:'child-body-hold-v2.png',bounds:{left:88,top:199,right:972,bottom:1405}};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'preview/art/family/manifest.json'),'utf8'));
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1);
  const file=path.resolve(root,relative||'output/illustration-samples/rain-v1/index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  const type={'.png':'image/png','.webp':'image/webp','.html':'text/html; charset=utf-8'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));
});
(async()=>{
  let browser;
  try{
    await new Promise(resolve=>server.listen(4193,'127.0.0.1',resolve));
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage();await page.goto('http://127.0.0.1:4193/preview/art/family/child-body.webp');
    const result=await page.evaluate(async({source,registered,candidate,metrics})=>{
      const module={exports:{}};new Function('module','exports',source)(module,module.exports);
      const rig=module.exports;
      const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
      const [head,body,master,bg,umbrella]=await Promise.all([
        load('/preview/art/family/child-head.webp'),load('/output/illustration-samples/rain-v1/child-body-hold-v2.png'),load('/preview/art/family/child-body.webp'),load('/output/illustration-samples/rain-v1/garden-rain-background.png'),load('/output/illustration-samples/rain-v1/umbrella.png')
      ]);
      const composer=rig.createComposer(()=>document.createElement('canvas'),[registered,candidate]);
      const portrait=composer.prepare({image:head,kind:'illustrated',metrics});
      const actor=composer.compose({portrait,body,poseId:candidate.id});
      const masterActor=composer.compose({portrait,body:master,poseId:registered.id});
      const cacheReused=composer.compose({portrait,body,poseId:candidate.id})===actor;
      const w=bg.width,h=bg.height,scale=.74;
      const scenes=[{page:2,name:'page-02-weather.png'},{page:3,name:'page-03-umbrella.png',x:500},{page:7,name:'page-07-share.png',x:620,umbrellaTilt:35}];
      const images=scenes.map(scene=>{
        const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(bg,0,0);
        if(scene.x){
          const neck={x:scene.x,y:680};
          const gripX=neck.x+(170-501)/rig.CHILD_MODEL.sourcePixelsPerUnit*scale;
          const propScale=.70;
          ctx.save();ctx.fillStyle='rgba(74,58,32,.22)';ctx.filter='blur(9px)';ctx.beginPath();ctx.ellipse(neck.x+28,1150,104,18,0,0,Math.PI*2);ctx.fill();ctx.restore();
          const gripY=neck.y+(300-225)/rig.CHILD_MODEL.sourcePixelsPerUnit*scale;
          ctx.save();ctx.translate(gripX,gripY);ctx.rotate((scene.umbrellaTilt||0)*Math.PI/180);
          ctx.drawImage(umbrella,-512*propScale,12-gripY,umbrella.width*propScale,umbrella.height*propScale);ctx.restore();
          composer.place(ctx,actor,{...neck,scale});
        }
        return {...scene,data:c.toDataURL('image/png')};
      });
      const qa=document.createElement('canvas');qa.width=1100;qa.height=1040;const qc=qa.getContext('2d');qc.fillStyle='#f7f4ea';qc.fillRect(0,0,1100,1040);qc.fillStyle='#364d3e';qc.font='24px sans-serif';qc.fillText('Master',180,45);qc.fillText('Umbrella pose candidate',660,45);
      composer.place(qc,masterActor,{x:270,y:390,scale:.88});composer.place(qc,actor,{x:810,y:390,scale:.88});
      return {images,actor:actor.image.toDataURL('image/png'),comparison:qa.toDataURL('image/png'),checks:{cacheReused,headScaleSame:actor.headScale===masterActor.headScale,headScale:actor.headScale,anatomicalScale:rig.CHILD_MODEL.sourcePixelsPerUnit,headHeight:rig.CHILD_MODEL.headHeight,bodyHeight:rig.CHILD_MODEL.bodyHeight,onlySceneScale:scale,width:w,height:h,backgroundNativePpiAtA5:Math.min(w/(148/25.4),h/(210/25.4)),defaultIllustratedHead:true}};
    },{source,registered,candidate,metrics:manifest.heads.child.metrics});
    const save=(name,data)=>fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));
    for(const im of result.images)save(im.name,im.data);save('assembled-child.png',result.actor);save('master-comparison.png',result.comparison);
    fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result.checks,null,2)+'\n');
    fs.writeFileSync(path.join(out,'pose-candidate.json'),JSON.stringify({status:'sample-only-not-registered-in-production',pose:candidate,model:'child-v1'},null,2)+'\n');
    const captions=[['02','黑云来了，','下雨了。'],['03','小伞开了。','我在伞下。'],['07','我和小花，','都在伞下。']];
    fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>下雨了 · 插画样图</title><style>body{margin:0;background:#e8e7db;color:#344c3b;font:16px/1.8 sans-serif}main{max-width:780px;margin:auto;padding:20px 12px}figure{position:relative;margin:24px 0;background:#fbf5e9;box-shadow:0 3px 18px #0002}img{display:block;width:100%;height:auto}figcaption{position:absolute;bottom:3.5%;left:10%;right:10%;text-align:center;font:clamp(20px,4vw,35px)/1.7 KaiTi,STKaiti,serif}figcaption p{margin:0}small{color:#6d795d}</style><main><h1>《下雨了》3页插画样图</h1><p>默认人物用于确认画风与合成效果。人物、伞与场景独立保存；正式真人版沿用原照片面孔。</p>'+result.images.map((im,i)=>'<figure><img src="'+im.name+'" alt="故事第'+captions[i][0]+'页样图"><figcaption><p>'+captions[i][1]+'</p><p>'+captions[i][2]+'</p></figcaption></figure>').join('')+'<small>画风校样，非印刷成品。原生场景'+result.checks.width+'×'+result.checks.height+'像素，按A5铺满约'+Math.floor(result.checks.backgroundNativePpiAtA5)+'ppi；未通过插值放大宣称300ppi。</small></main></html>');
    console.log(JSON.stringify(result.checks));
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
