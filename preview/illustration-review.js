// New-manuscript art proof. Read-only with respect to saved user information.
  const root=document.getElementById('little-story-preview');
  const manuscript=/* REVIEW_MANUSCRIPT */,library=/* REVIEW_POSES */;
  const selection=[{key:'mountain',source:7},{key:'stone-game',source:6},{key:'sunrise',source:22}];
  const summaries=shared.literacy.summarizeBooks(manuscript);
  const books=selection.map(item=>{const book=manuscript.find(b=>b.sourceNumber===item.source);return {...book,key:item.key,summary:summaries.find(s=>s.id===book.id)};});
  root.innerHTML=`<style>
  .ir{max-width:1000px;margin:auto;padding:24px 16px;color:#345747}.ir a{color:inherit}.ir h1{font-size:28px;margin:14px 0 8px}.ir p{line-height:1.7}.ir-books{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.ir button{font:inherit;cursor:pointer;border:1px solid #d4ddcb;border-radius:14px;padding:12px 20px;background:#fffdf5;color:#355841}.ir button[aria-pressed=true],.ir .ir-next{background:#41674d;color:#fff}.ir button:disabled{opacity:.45;cursor:default}.ir-sheet{box-sizing:border-box;background:#fbf6e9;max-width:600px;margin:24px auto;padding:18px;border-radius:8px;box-shadow:0 8px 28px #314b3020}.ir-sheet canvas{width:100%;display:block;aspect-ratio:1}.ir-title{text-align:center;font-size:30px;margin:12px 0 22px}.ir-caption{min-height:100px;display:grid;align-content:center;text-align:center;font-size:clamp(22px,4vw,30px);line-height:1.7;padding:16px 0}.ir-controls{display:flex;justify-content:center;align-items:center;gap:22px}.ir-note{font-size:14px;color:#697363}.ir-status{min-height:25px}.ir-error{color:#a33c28}.ir [hidden]{display:none!important}.ir-sheet[aria-busy=true] canvas{visibility:hidden}.ir-sheet[aria-busy=true] .ir-caption{visibility:hidden}.ir-summary{padding:14px 8px 22px}.ir-summary h2{text-align:center;font-size:26px}.ir-counts{display:flex;justify-content:space-around;gap:8px;text-align:center;margin:20px 0}.ir-counts b{display:block;font-size:26px}.ir-counts span{font-size:13px}.ir-chars{font-size:22px;letter-spacing:.15em;line-height:1.9;overflow-wrap:anywhere}.ir-summary p{font-size:14px}.ir-sheet.is-summary canvas{width:40%;margin:auto}.ir-sheet.is-summary .ir-caption{display:none}.ir-sheet.is-cover .ir-caption{font-size:19px}.ir-sheet.is-cover .ir-title{font-size:32px}.ir-small{font-size:13px}@media(max-width:450px){.ir{padding:16px 10px}.ir-books{gap:6px}.ir-books button{padding:10px;font-size:15px}.ir-sheet{padding:12px}.ir-controls{gap:14px}.ir-counts b{font-size:23px}.ir-title{font-size:25px}}
  </style><main class="ir"><a href="./">‹ 返回书架</a><h1>新故事 · 插画样稿</h1><p class="ir-note">新版30篇稿：山不见了、小石头不见了、太阳出来了吗</p><nav class="ir-books" aria-label="选择故事">${books.map(b=>`<button data-book="${b.key}" aria-pressed="false">${b.title}</button>`).join('')}</nav><p id="ir-status" class="ir-status ir-note" role="status">正在准备人物…</p><section class="ir-sheet" aria-busy="true"><h2 id="ir-title" class="ir-title"></h2><canvas id="ir-scene" width="1000" height="1000"></canvas><div id="ir-caption" class="ir-caption"></div><div id="ir-summary" class="ir-summary" hidden></div></section><nav class="ir-controls" aria-label="翻页"><button id="ir-prev" disabled>上一页</button><span id="ir-page"></span><button id="ir-next" class="ir-next" disabled>下一页</button></nav><p id="ir-source" class="ir-note"></p><p class="ir-note">插画审阅版，尚未加入正式书架或打印清单。识字小结按新版故事稿顺序统计，表示接触过的汉字，不等于已掌握。</p><p id="ir-error" class="ir-error" role="alert"></p></main>`;
  const image=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('插画暂时无法加载，请重新选择这本故事重试。'));im.src=url;});
  async function savedData(){return new Promise(resolve=>{const r=indexedDB.open('little-story-local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('child'))r.result.createObjectStore('child');};r.onerror=()=>resolve(null);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('child')){db.close();resolve(null);return;}const tx=db.transaction('child','readonly'),q=tx.objectStore('child').get('main');tx.oncomplete=()=>{db.close();resolve(q.result||null);};tx.onabort=()=>{db.close();resolve(null);};};});}
  const canvas=document.getElementById('ir-scene'),ctx=canvas.getContext('2d'),sheet=root.querySelector('.ir-sheet');
  const status=document.getElementById('ir-status'),errorBox=document.getElementById('ir-error');
  let current=null,page=-1,ticket=0,assets={},actor=null,session=null,composer=null,real=false;
  const keep=new Map();
  const observedActors=new Set();
  const files={mountain:['clear.png','cloud.png','foreground.png'],'stone-game':['mother-closed.webp','mother-behind.webp','mother-empty.webp','mother-reveal.webp','boulder.webp'],sunrise:['room.webp','night.webp','red-cloud.webp','glow.webp','sun.webp']};
  function raster(im,w=1000,h=1000){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);return c;}
  function fit(x,ground){const scale=Math.min(.42,440/actor.image.height,350/actor.image.width);return {x:Math.min(970-actor.bounds.right*scale,Math.max(30-actor.bounds.left*scale,x)),y:ground-actor.bounds.bottom*scale,scale};}
  function place(x=280,ground=945){const placement=fit(x,ground);composer.place(ctx,actor,placement);window.__illustrationReview.placement=placement;return placement;}
  function question(placement,text='?'){const x=placement.x+actor.bounds.right*placement.scale+45,y=placement.y+actor.bounds.top*placement.scale+25;ctx.save();ctx.fillStyle='#fffbee';ctx.strokeStyle='#6f8868';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,text==='?'?35:80,40,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#456b53';ctx.font='bold '+(text==='?'?54:32)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y+2);ctx.restore();}
  function panel(x,y,w,h){ctx.fillStyle='#fff9ea';ctx.strokeStyle='#d1c6aa';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(x,y,w,h,24);ctx.fill();ctx.stroke();}
  function hands(im){ctx.save();panel(85,42,830,248);ctx.drawImage(im,235,540,530,190,110,62,780,210);ctx.restore();}
  function scene(p){
    ctx.clearRect(0,0,1000,1000);ctx.fillStyle='#fbf6e9';ctx.fillRect(0,0,1000,1000);
    let pose;
    if(current.key==='mountain'){
      ctx.drawImage(assets['clear.png'],0,0);
      const fog=[null,[-110,120,1400],[-110,120,1400],[570,120,1400],null,null][p];
      if(fog){const im=assets['cloud.png'];ctx.drawImage(im,fog[0],fog[1],fog[2],fog[2]*im.height/im.width);}
      ctx.drawImage(assets['foreground.png'],0,0);pose=place();if(p===2)question(pose);
      window.__illustrationReview.sceneState={cloud:p===1||p===2?'covering':p===3?'leaving':'clear'};
    }else if(current.key==='stone-game'){
      ctx.drawImage(keep.get('garden'),0,0);pose=place(250);
      const states=[null,'mother-reveal.webp','mother-behind.webp','mother-closed.webp','mother-empty.webp','mother-reveal.webp','mother-closed.webp'];
      if(p===0){const rock=assets['boulder.webp'];ctx.drawImage(rock,380,590,540,360);}
      else{const mother=assets[states[p]];ctx.drawImage(mother,430,300,440,660);if(p!==2)hands(mother);}
      if(p===2)question(pose,'1 · 2 · 3');if(p===3)question(pose);
      window.__illustrationReview.sceneState={mother:states[p],stoneVisible:p===0||p===1||p===5,handsBehind:p===2,closeup:p!==0&&p!==2};
    }else{
      const phases=['night.webp','night.webp','red-cloud.webp','red-cloud.webp','glow.webp','sun.webp','sun.webp'];
      ctx.drawImage(assets[phases[p]],470,80,420,630);ctx.drawImage(assets['room.webp'],0,0);
      pose=place(p===6?550:340,p===6?930:945);if(p===1||p===2)question(pose);
      window.__illustrationReview.sceneState={sky:phases[p],sunVisible:p>=5,indoors:true};
    }
    canvas.dataset.book=current.key;canvas.dataset.page=String(p+1);
  }
  function render(){
    const cover=page===-1,summary=page===current.pages.length;
    sheet.classList.toggle('is-cover',cover);sheet.classList.toggle('is-summary',summary);
    scene(cover?0:summary?current.pages.length-1:page);
    const title=document.getElementById('ir-title');title.textContent=cover?current.title:summary?'识字小结':'';title.hidden=!cover&&!summary;
    const caption=document.getElementById('ir-caption');caption.replaceChildren(...(cover?['第一级 · 第'+current.number+'篇']:summary?[]:current.pages[page]).map(line=>{const d=document.createElement('div');d.textContent=line;return d;}));
    const block=document.getElementById('ir-summary');block.hidden=!summary;
    if(summary){const s=current.summary;block.replaceChildren();const counts=document.createElement('div');counts.className='ir-counts';for(const [label,n]of [['本故事用字',s.count],['新出现汉字',s.newCount],['按新版顺序累计',s.cumulativeCount]]){const d=document.createElement('div'),b=document.createElement('b'),small=document.createElement('span');b.textContent=n+'字';small.textContent=label;d.append(b,small);counts.append(d);}const chars=document.createElement('div');chars.className='ir-chars';chars.textContent=s.characters.join(' ');block.append(counts,chars);}
    document.getElementById('ir-page').textContent=cover?'封面':summary?'识字小结':(page+1)+' / '+current.pages.length;
    document.getElementById('ir-prev').disabled=cover;document.getElementById('ir-next').disabled=summary;
    document.getElementById('ir-next').textContent=cover?'开始阅读':page===current.pages.length-1?'识字小结':'下一页';
    window.__illustrationReview.book=current.key;window.__illustrationReview.page=page;window.__illustrationReview.pageCount=current.pages.length;
    root.dataset.illustrationReady='true';
  }
  async function openBook(key){
    const requested=books.find(b=>b.key===key)||books[0],generation=++ticket;root.dataset.illustrationReady='loading';sheet.setAttribute('aria-busy','true');status.textContent='正在准备《'+requested.title+'》…';errorBox.textContent='';
    document.getElementById('ir-prev').disabled=document.getElementById('ir-next').disabled=true;
    document.getElementById('ir-title').hidden=true;document.getElementById('ir-summary').hidden=true;
    root.querySelectorAll('[data-book]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.book===requested.key)));
    try{
      const values=await Promise.all(files[requested.key].map(name=>image('./art/sequence/'+requested.key+'/'+name)));
      const [readyActor]=await session.open(requested.key);
      if(generation!==ticket)return;
      // Only the selected book's original layers stay referenced. Pages are drawn on demand.
      assets=Object.fromEntries(files[requested.key].map((name,i)=>[name,['clear.png','foreground.png','room.webp'].includes(name)?raster(values[i]):values[i]]));
      current=requested;actor=readyActor;observedActors.add(actor);window.__illustrationReview.actorCount=observedActors.size;window.__illustrationReview.characterBounds=actor.bounds;window.__illustrationReview.headScale=actor.headScale;page=-1;sheet.setAttribute('aria-busy','false');status.textContent='第'+current.number+'篇 · '+current.pages.length+'页正文';
      render();
    }catch(error){if(generation!==ticket)return;root.dataset.illustrationReady='error';status.textContent='这本故事暂时未加载';errorBox.textContent=error.message;}
  }
  document.getElementById('ir-prev').onclick=()=>{if(current&&page>-1){page--;render();}};
  document.getElementById('ir-next').onclick=()=>{if(current&&page<current.pages.length){page++;render();}};
  (async()=>{try{
    const [head,manifest,saved,garden]=await Promise.all([image('./art/family/child-head.webp'),fetch('./art/family/manifest.json').then(r=>{if(!r.ok)throw Error('人物资料暂时无法读取');return r.json();}),savedData(),image('./art/sequence/mountain/clear.png')]);
    keep.set('garden',raster(garden));let portrait={image:head,kind:'illustrated',metrics:manifest.heads.child.metrics};
    const photo=saved?.version>=3?saved.avatars?.child:null;
    if(photo?.kind==='cutout'&&photo.data?.startsWith('data:image/png;base64,')&&photo.metrics?.faceBounds){try{const p={image:await image(photo.data),kind:'cutout',metrics:photo.metrics};shared.characterRig.portraitGeometry(p);portrait=window.LittlePhotoTone.apply({child:p},garden).child;real=true;}catch(_){}}
    composer=shared.characterRig.createComposer(()=>document.createElement('canvas'),Object.values(library.poses));
    session=shared.characterSession.createCharacterSession({composer,portrait,poses:Object.values(library.poses),books:books.map(b=>({id:b.key,poses:['stand-wave']})),loadBody:pose=>image(pose.bodyUrl)});
    const visibility=()=>document.hidden?session.pause():session.resume();document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',()=>{ticket++;session.close();keep.clear();assets={};document.removeEventListener('visibilitychange',visibility);},{once:true});
    window.__illustrationReview={real,characterModel:shared.characterRig.CHILD_MODEL.id,actorCount:0,sceneCount:20,characterBounds:null};
    document.getElementById('ir-source').textContent=real?'使用本机保存的真人头像，只做曝光与冷暖适配；妈妈保持卡通形象。':'当前显示默认绘本头像。在书架保存真人头像后，这三本会读取同一份本机照片。';
    root.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openBook(b.dataset.book));
    await openBook(new URLSearchParams(location.search).get('book'));
    window.__illustrationReview.characterBounds=actor?.bounds;window.__illustrationReview.headScale=actor?.headScale;
  }catch(error){root.dataset.illustrationReady='error';status.textContent='人物暂时无法准备';errorBox.textContent=error.message;}})();
