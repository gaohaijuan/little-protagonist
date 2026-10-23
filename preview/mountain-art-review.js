// Isolated illustration proof; uses the existing character rig and never edits user data.
  const root=document.getElementById('little-story-preview');
  const mountainLibrary=/* MOUNTAIN_POSES */;
  root.innerHTML=`<style>
  .mountain-review{max-width:900px;margin:auto;padding:24px 14px;color:#345747}.mountain-review a{color:inherit}.mountain-review h1{font-size:28px;margin:12px 0}.mountain-review p{line-height:1.7}.mountain-sheet{background:#fbf6e9;max-width:600px;margin:20px auto;padding:18px;border-radius:8px;box-shadow:0 8px 30px #314b3020}.mountain-sheet canvas{width:100%;display:block;aspect-ratio:1}.mountain-caption{text-align:center;font-size:clamp(23px,4vw,32px);min-height:100px;display:grid;align-content:center;line-height:1.7;padding:16px 0}.mountain-controls{display:flex;justify-content:center;align-items:center;gap:24px}.mountain-review button{font:inherit;border:0;border-radius:14px;background:#41674d;color:white;padding:12px 24px;cursor:pointer}.mountain-review button:disabled{opacity:.4}.mountain-note{font-size:14px;color:#687368}.mountain-review select{font:inherit;max-width:100%;padding:8px;border:1px solid #d7dece;border-radius:8px;background:#fffef8}.mountain-error{color:#a23c27}
  </style><main class="mountain-review"><a href="./">‹ 返回书架</a><h1>山不见了</h1><p>插画样稿 · 同一座山，云来了，又走了</p><label>对照文字 <select id="mountain-edition"><option value="new">新版30篇稿</option><option value="old">原第7篇稿</option></select></label><div class="mountain-sheet"><canvas id="mountain-scene" width="1000" height="1000" aria-label="山不见了插画"></canvas><div id="mountain-caption" class="mountain-caption"></div></div><nav class="mountain-controls" aria-label="翻页"><button id="mountain-prev" disabled>上一页</button><span id="mountain-page">1 / 6</span><button id="mountain-next" disabled>下一页</button></nav><p id="mountain-source" class="mountain-note">正在准备人物和场景…</p><p class="mountain-note">本页为插画审阅样稿，尚未加入书架或打印清单。真人照片只在本机使用；当前素材用于阅读预览。</p><p id="mountain-error" class="mountain-error" role="alert"></p></main>`;
  const manuscripts={new:/* MOUNTAIN_NEW */,old:/* MOUNTAIN_OLD */};
  const image=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画素材未加载，请刷新重试。'));im.src=url;});
  async function savedAvatar(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const tx=db.transaction('child','readonly'),q=tx.objectStore('child').get('main');tx.oncomplete=()=>{db.close();resolve(q.result?.version>=3?q.result.avatars?.child:null);};tx.onabort=()=>{db.close();resolve(null);};};});}
  (async()=>{try{
    const [background,cloud,foreground,body,head,manifest,saved]=await Promise.all([image('./art/sequence/mountain/clear.png'),image('./art/sequence/mountain/cloud.png'),image('./art/sequence/mountain/foreground.png'),image('./art/family/child-body.webp'),image('./art/family/child-head.webp'),fetch('./art/family/manifest.json').then(r=>r.json()),savedAvatar()]);
    const composer=shared.characterRig.createComposer(()=>document.createElement('canvas'),Object.values(mountainLibrary.poses));
    let portrait={image:head,kind:'illustrated',metrics:manifest.heads.child.metrics},real=false;
    if(saved?.kind==='cutout'&&saved.data?.startsWith('data:image/png;base64,')&&saved.metrics?.faceBounds){try{const p={image:await image(saved.data),kind:'cutout',metrics:saved.metrics};shared.characterRig.portraitGeometry(p);portrait=p;real=true;}catch(_){}}
    const prepared=composer.prepare(portrait),actor=composer.compose({portrait:prepared,body,poseId:'stand-wave'});
    const canvas=document.getElementById('mountain-scene'),context=canvas.getContext('2d');
    // One assembled actor, one fixed camera. Hair can expand the actor's canvas;
    // only the whole actor is scaled to stay inside the safe foreground area.
    const scale=Math.min(.42,440/actor.image.height,360/actor.image.width);
    const placement={x:280,y:945-actor.bounds.bottom*scale,scale};
    const fixedBackground=document.createElement('canvas');fixedBackground.width=fixedBackground.height=1000;fixedBackground.getContext('2d').drawImage(background,0,0,1000,1000);
    const fixedForeground=document.createElement('canvas');fixedForeground.width=fixedForeground.height=1000;
    const foregroundContext=fixedForeground.getContext('2d');foregroundContext.drawImage(foreground,0,0,1000,1000);composer.place(foregroundContext,actor,placement);
    const clouds=[null,{x:-110,y:120,w:1400},{x:-110,y:120,w:1400},{x:570,y:120,w:1400},null,null];
    let page=0;
    const render=()=>{
      context.clearRect(0,0,1000,1000);context.drawImage(fixedBackground,0,0);
      const fog=clouds[page];
      if(fog)context.drawImage(cloud,fog.x,fog.y,fog.w,fog.w*cloud.height/cloud.width);
      context.drawImage(fixedForeground,0,0);
      if(page===2){context.save();const qx=placement.x+actor.bounds.right*scale+42,qy=placement.y+actor.bounds.top*scale+24;context.fillStyle='#fffbee';context.strokeStyle='#6f8868';context.lineWidth=2;context.beginPath();context.ellipse(qx,qy,38,43,0,0,Math.PI*2);context.fill();context.stroke();context.fillStyle='#456b53';context.font='bold 56px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText('?',qx,qy+3);context.restore();}
      const lines=manuscripts[document.getElementById('mountain-edition').value][page];
      const caption=document.getElementById('mountain-caption');caption.replaceChildren(...lines.map(line=>{const p=document.createElement('div');p.textContent=line;return p;}));
      document.getElementById('mountain-page').textContent=(page+1)+' / 6';document.getElementById('mountain-prev').disabled=page===0;document.getElementById('mountain-next').disabled=page===5;
      canvas.dataset.page=String(page+1);
    };
    document.getElementById('mountain-prev').onclick=()=>{if(page>0){page--;render();}};
    document.getElementById('mountain-next').onclick=()=>{if(page<5){page++;render();}};
    document.getElementById('mountain-edition').onchange=render;
    document.getElementById('mountain-source').textContent=real?'使用本机已保存的真人头像。六页复用同一个完整人物。':'当前显示默认绘本头像；在书架保存真人头像后，本页会自动读取。';
    window.__mountainProof={real,actorCount:1,backgroundCount:1,placement,bounds:actor.bounds,headScale:actor.headScale,sceneCount:6};
    render();root.dataset.mountainReady='true';
  }catch(error){root.dataset.mountainReady='error';document.getElementById('mountain-error').textContent=error.message;}})();
