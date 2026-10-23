  const poseLibrary=/* POSE_LIBRARY */;
  const root=document.getElementById('little-story-preview');
  root.innerHTML='<style>.cs-wrap{max-width:1100px;margin:0 auto;padding:24px 8px}.cs-wrap h1{font-size:28px}.cs-wrap p{line-height:1.8;color:#667263}.cs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.cs-card{margin:0;background:#fbf6e9;border:1px solid #dddccb;border-radius:18px;padding:12px}.cs-card figcaption{text-align:center;color:#426950;font-weight:600}.cs-card canvas{display:block;width:100%;height:auto}.cs-note{padding:16px;background:#e8eddf;border-radius:14px}.cs-wrap a{color:#426950}@media(max-width:640px){.cs-grid{gap:5px}.cs-card{padding:5px;border-radius:10px}.cs-card figcaption{font-size:12px}.cs-wrap h1{font-size:23px}}</style><main class="cs-wrap"><a href="./">‹ 返回书架</a><p>统一人物模板 · 比例验证样稿</p><h1>同一个人物，整体放大缩小</h1><p id="cs-source">正在读取本机头像…</p><div class="cs-grid">'+[['标准大小',1],['近景 · 1.2 倍',1.2],['远景 · 0.7 倍',.7]].map(([label,scale])=>'<figure class="cs-card"><figcaption>'+label+'</figcaption><canvas width="420" height="620" data-scale="'+scale+'"></canvas></figure>').join('')+'</div><p>统一逻辑尺寸：头部 300 · 身体 640，站立时约 3.1 头身。长发完整保留，不用头发长度计算脸部大小。</p><p class="cs-note">这里验证独立人物模板。动作素材须先遵守同一比例，再供各本书调用；现有与背景合画的旧素材尚未整体切换。</p><p id="cs-status" role="status"></p></main>';
  const load=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('人物素材暂时无法读取，请刷新重试。'));im.src=url;});
  async function savedPortrait(){
    try{return await new Promise(resolve=>{const request=indexedDB.open('little-story-local',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('child'))request.result.createObjectStore('child');};request.onerror=()=>resolve(null);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const tx=db.transaction('child','readonly'),read=tx.objectStore('child').get('main');tx.oncomplete=()=>{db.close();const saved=read.result;resolve(saved?.version>=3?saved.avatars?.child:null);};tx.onabort=()=>{db.close();resolve(null);};};});}catch(_){return null;}
  }
  (async()=>{
    try{
      const [manifest,saved]=await Promise.all([fetch('./art/family/manifest.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('人物资料暂时无法读取。');return r.json();}),savedPortrait()]);
      const composer=shared.characterRig.createComposer(()=>document.createElement('canvas'),Object.values(poseLibrary.poses));
      let portrait=null;
      if(saved?.kind==='cutout'&&saved.data?.startsWith('data:image/png;base64,')&&saved.metrics?.faceBounds){try{const candidate={image:await load(saved.data),kind:'cutout',metrics:saved.metrics};shared.characterRig.portraitGeometry(candidate);portrait=candidate;}catch(_){}}
      const real=!!portrait;
      if(!portrait)portrait={image:await load('./art/family/child-head.webp'),kind:'illustrated',metrics:manifest.heads.child.metrics};
      const session=shared.characterSession.createCharacterSession({composer,portrait,poses:Object.values(poseLibrary.poses),books:[{id:'template',poses:['stand-wave']}],loadBody:(pose,{signal})=>new Promise((resolve,reject)=>{
        const image=new Image(),cancel=()=>{image.src='';reject(Object.assign(Error('人物准备已取消'),{name:'AbortError'}));};
        signal.addEventListener('abort',cancel,{once:true});image.onload=()=>{signal.removeEventListener('abort',cancel);resolve(image);};image.onerror=()=>{signal.removeEventListener('abort',cancel);reject(Error('人物素材暂时无法读取，请刷新重试。'));};image.src=pose.bodyUrl;
      }),schedule:callback=>window.requestIdleCallback?requestIdleCallback(callback,{timeout:400}):setTimeout(callback,32)});
      const visibility=()=>document.hidden?session.pause():session.resume();document.addEventListener('visibilitychange',visibility);
      window.addEventListener('pagehide',()=>{document.removeEventListener('visibilitychange',visibility);session.close();},{once:true});
      const [actor]=await session.open('template'),base=Math.min(380/actor.image.width,550/actor.image.height)/1.2;
      root.querySelectorAll('canvas').forEach(canvas=>{const c=canvas.getContext('2d'),scale=base*Number(canvas.dataset.scale);composer.place(c,actor,{x:210,y:600-actor.bounds.bottom*scale,scale});});
      document.getElementById('cs-source').textContent=real?'使用当前浏览器已保存的真人头像。三个画面复用同一个完整人物，五官和发型保持原样。':'使用默认绘本头像。保存真人头像后，本页会自动使用本机资料，照片不会上传。';
      root.dataset.characterReady='true';
    }catch(error){document.getElementById('cs-status').textContent=error.message||'人物样稿暂时无法打开，请刷新重试。';root.dataset.characterReady='error';}
  })();
