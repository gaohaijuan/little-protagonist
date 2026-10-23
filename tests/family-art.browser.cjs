'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
let playwright;try{playwright=require('playwright');}catch(_){playwright=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=path.resolve(__dirname,'..'),preview=path.join(root,'preview'),out=path.join(preview,'qa/family-art');
const manifestPath=path.join(preview,'art/family/manifest.json');
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const roles=['child','dad','mom','grandpa','grandma','olderBrother','olderSister','youngerBrother','youngerSister','olderBrother','youngerSister','olderBrother'];
const members=count=>roles.slice(0,count).map((role,index)=>({id:index<9?role:'member-'+index,role,included:true}));
function pointOf(draw,x,y){const a=draw.args,m=draw.matrix,px=a[4]+x*a[6]/a[2],py=a[5]+y*a[7]/a[3];return {x:m[0]*px+m[2]*py+m[4],y:m[1]*px+m[3]*py+m[5]};}
function extentOf(draw,b){const p=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>pointOf(draw,x,y));return {left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))};}
function intersects(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
async function main(){
  assert.ok(fs.existsSync(manifestPath),'real family art manifest must be prepared first');fs.mkdirSync(out,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const long=JSON.parse(fs.readFileSync(path.join(preview,'qa/face/long-hair-results.json'),'utf8')).metrics;
  const child=JSON.parse(fs.readFileSync(path.join(preview,'qa/pose/results.json'),'utf8')).metrics;
  const short={bounds:{left:54,top:15,right:476,bottom:562},chin:{x:270,y:560}};
  // Adult entries model older saved records and must never be painted. The
  // long/short test cutouts also exercise permitted sibling-role geometry.
  const fixtures={child:{file:'qa/pose/extracted-head.png',metrics:child},olderSister:{file:'qa/face/long-hair-cutout.png',metrics:long},olderBrother:{file:'qa/face/portrait-cutout.png',metrics:short},mom:{file:'qa/face/long-hair-cutout.png',metrics:long},dad:{file:'qa/face/portrait-cutout.png',metrics:short},grandpa:{file:'qa/face/portrait-cutout.png',metrics:short},grandma:{file:'qa/face/long-hair-cutout.png',metrics:long}};
  const source=fs.readFileSync(path.join(root,'miniprogram/lib/family-art.js'),'utf8');
  const familySource=fs.readFileSync(path.join(root,'miniprogram/lib/family.js'),'utf8');
  const loader=fs.readFileSync(path.join(preview,'family-art-loader.js'),'utf8');
  const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fbf6e9}canvas{display:block}</style><canvas id="art"></canvas><script>window.qaFamily=(function(){const module={exports:{}};'+familySource+'\nreturn module.exports;})(); const require=name=>{if(name!=="./family")throw Error(name);return window.qaFamily;};const module={exports:{}};'+source+'\nwindow.familyArt=module.exports;</script><script>'+loader+'</script>';
  const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:836,height:471},deviceScaleFactor:1}),errors=[],requests=[];
    await context.route('http://127.0.0.1:4881/**',async route=>{
      const url=new URL(route.request().url());requests.push(url.pathname);assert.equal(route.request().method(),'GET','no photograph upload');
      if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':csp},body:html});
      const file=path.resolve(preview,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(preview+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      return route.fulfill({status:200,contentType:{'.json':'application/json','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream',headers:{'X-Content-Type-Options':'nosniff'},body:fs.readFileSync(file)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4881/');
    await page.evaluate(async()=>{await window.LittleFamilyArtLoader.ensure();window.qaPhotos={};});
    await page.evaluate(async fixtures=>{for(const [role,item]of Object.entries(fixtures)){const image=new Image();image.src='./'+item.file+'?role='+role;await image.decode();window.qaPhotos[role]={image,kind:'cutout',metrics:item.metrics,layout:{scale:1,x:0,y:0}};}},fixtures);
    const cases=[];
    for(const count of [3,5,6,12])cases.push({name:'default-'+count,options:{members:members(count),familyScene:{kind:'group',memberIds:members(count).map(m=>m.id)}}});
    for(const count of [3,5,12])cases.push({name:'photos-'+count,photos:true,options:{members:members(count),familyScene:{kind:'group',memberIds:members(count).map(m=>m.id)}}});
    cases.push({name:'mom-and-child',photos:true,options:{members:members(3),familyScene:{kind:'member',memberIds:['mom','child'],focusId:'mom'}}});
    cases.push({name:'dad-and-child',photos:true,options:{members:members(3),familyScene:{kind:'member',memberIds:['dad','child'],focusId:'dad'}}});
    cases.push({name:'sister-and-child',photos:true,options:{members:members(7),familyScene:{kind:'member',memberIds:['olderSister','child'],focusId:'olderSister'}}});
    cases.push({name:'count-five',photos:true,options:{members:members(6),familyScene:{kind:'count',memberIds:members(6).filter(m=>m.id!=='child').map(m=>m.id),count:5}}});
    cases.push({name:'remember-child',photos:true,options:{page:6,members:members(5),familyScene:{kind:'remember',memberIds:members(5).map(m=>m.id),focusId:'child'}}});
    cases.push({name:'remember-answer',photos:true,options:{page:7,members:members(5),familyScene:{kind:'remember',memberIds:members(5).map(m=>m.id),focusId:'child'}}});
    cases.push({name:'cover-twelve',photos:true,options:{width:120,height:168,cover:true,members:members(12)}});
    cases.push({name:'cover-three',photos:true,options:{width:120,height:168,cover:true,members:members(3)}});
    cases.push({name:'family-settings-three',photos:true,options:{width:360,height:300,cover:true,members:members(3)}});
    cases.push({name:'profile-mom',photos:true,options:{width:360,height:390,framing:'character',characterId:'mom',characterRole:'mom',members:members(3)}});
    cases.push({name:'profile-sister',photos:true,options:{width:360,height:390,framing:'character',characterId:'olderSister',characterRole:'olderSister',members:members(7)}});
    cases.push({name:'small-six',photos:true,options:{width:568,height:216,members:members(6)}});
    cases.push({name:'maximum-hair-layout',photos:true,extreme:true,options:{members:members(5)}});
    const results=[];
    for(const item of cases){
      const width=item.options.width||836,height=item.options.height||470.5;await page.setViewportSize({width:Math.ceil(width),height:Math.ceil(height)});
      const result=await page.evaluate(item=>{
        const canvas=document.querySelector('canvas'),context=canvas.getContext('2d'),calls=[],original=context.drawImage;
        context.drawImage=function(image,...args){const m=context.getTransform();calls.push({src:image.src,args,matrix:[m.a,m.b,m.c,m.d,m.e,m.f]});return original.call(this,image,...args);};
        const avatars={};if(item.photos)for(const member of item.options.members){const photo=window.qaPhotos[member.role]||window.qaPhotos.child;avatars[member.id]={...photo,layout:item.extreme?{scale:1.6,x:35,y:-35}:photo.layout};}
        const options={book:'family',width:836,height:470.5,pixelRatio:1,...item.options,...window.LittleFamilyArtLoader.peek(),avatars};
        const ok=window.familyArt.draw(canvas,options);context.drawImage=original;
        const selected=window.familyArt.selectedMembers(options);
        return {ok,calls,selected:selected.map(m=>({id:m.id,role:m.role,photo:window.qaFamily.canUsePhoto(m.role)&&!!avatars[m.id],metrics:window.qaFamily.canUsePhoto(m.role)&&avatars[m.id]?avatars[m.id].metrics:options.manifest.heads[['dad','mom','grandpa','grandma'].includes(m.role)?m.role:'child'].metrics})),width:canvas.width,height:canvas.height};
      },item);
      assert.equal(result.ok,true,item.name);const custom=result.calls.filter(call=>call.src.includes('/qa/'));
      assert.equal(result.calls.some(call=>['dad','mom','grandpa','grandma'].includes(new URL(call.src).searchParams.get('role'))),false,'no saved adult photograph reaches drawImage');
      const headCalls=result.calls.filter(call=>call.src.includes('/qa/')||/\/(heads|child-head)\.webp$/.test(new URL(call.src).pathname));
      assert.equal(custom.length,result.selected.filter(member=>member.photo).length);
      assert.equal(headCalls.length,result.selected.length);const extents=[];
      headCalls.forEach((call,index)=>{
          const member=result.selected[index],metrics=member.metrics;
          if(member.photo){assert.deepEqual(call.args.slice(0,4),[0,0,540,570]);assert.ok(Math.abs(call.args[6]/540-call.args[7]/570)<1e-8,'original cutout is not stretched');}
          const extent=extentOf(call,metrics.bounds);extents.push(extent);
          assert.ok(extent.left>=-.01&&extent.right<=result.width+.01&&extent.top>=-.01&&extent.bottom<=result.height+.01,item.name+' keeps '+member.id+' complete');
          if(!item.options.cover&&!item.options.framing)assert.ok(extent.right<=result.width*.65+.01,item.name+' keeps photos away from text');
          if(!item.extreme||!member.photo){
            const bodyCall=result.calls[result.calls.indexOf(call)-1],spec=manifest.body[['dad','mom','grandpa','grandma'].includes(member.role)?member.role:'child'];
            const collar=pointOf(bodyCall,spec.collar.x,spec.collar.y),chin=pointOf(call,metrics.chin.x,metrics.chin.y);
            assert.ok(Math.hypot(collar.x-chin.x,collar.y-chin.y)<.1,item.name+' '+member.id+' chin connects to collar');
          }
      });
      extents.forEach((a,i)=>extents.slice(i+1).forEach(b=>assert.equal(intersects(a,b),false,item.name+' complete hairstyles do not overlap')));
      result.calls.forEach(call=>assert.ok(Math.abs(call.args[2]/call.args[3]-call.args[6]/call.args[7])<1e-8,item.name+' assets preserve aspect ratio'));
      await page.locator('canvas').screenshot({path:path.join(out,item.name+'.png')});results.push({name:item.name,width:result.width,height:result.height,people:result.selected.length,customPhotos:custom.length});
    }
    assert.deepEqual(errors,[]);assert.equal(requests.filter(value=>value==='/art/family/manifest.json').length,1);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({cases:results,assetRequests:requests.filter(value=>value.startsWith('/art/family/')),photographsUploaded:false},null,2));
    console.log('PASS: '+cases.length+' real-resource family compositions, 1–12 members, cartoon-only adults despite saved photos, real child/sibling cutouts, exact collar attachment, complete separated hair, no stretching, portrait/landscape layouts, private GET-only processing.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
