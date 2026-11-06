(function(scope){
  'use strict';
  // A saved/draft identity owns one composer and a rolling three-book session.
  // Backgrounds are independent assets; pages receive only complete actors.
  scope.createCharacterArtLoader=scope.createFamilyCharacterLoader=function(shared,library,baseLoader,bookIds){
    const density=4,unit=.36,pose=library.poses['stand-wave'];
    const definitions=Object.values(library.poses),scenes=shared.layeredArt;
    const composer=shared.characterRig.createComposer(()=>document.createElement('canvas'),definitions,{pixelDensity:density});
    const ids=new WeakMap(),buckets=new Map(),sources=new WeakMap(),adults=new Map();let nextId=0,visible=bookIds[0];
    const images=new Map(),timing={bodyDownloadMs:0,backgroundDownloadMs:0,composeMs:0,composites:0,pageDrawMs:0,draws:0},now=()=>typeof performance!=='undefined'?performance.now():Date.now();
    function image(url,kind,signal){
      if(images.has(url))return images.get(url);
      const start=now(),pending=new Promise((resolve,reject)=>{
        const im=new Image(),timer=setTimeout(()=>finish(Error('素材读取超时，请重试。')),20000);
        function finish(error){clearTimeout(timer);signal?.removeEventListener('abort',cancel);im.onload=im.onerror=null;if(error){im.src='';reject(error);}else{timing[kind+'DownloadMs']+=now()-start;resolve(im);}}
        const cancel=()=>finish(Object.assign(Error('素材准备已取消。'),{name:'AbortError'}));
        im.onload=()=>finish(im.naturalWidth&&im.naturalHeight?null:Error('素材尺寸无效。'));im.onerror=()=>finish(Error('素材暂时无法打开，请重试。'));
        if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});im.src=url;
      });images.set(url,pending);pending.catch(()=>{if(images.get(url)===pending)images.delete(url);});return pending;
    }
    const identity=image=>{if(!image)return 0;if(!ids.has(image))ids.set(image,++nextId);return ids.get(image);};
    const crop=(c,sprite,x,y,scale)=>{const r=sprite.rect;c.drawImage(sprite.image,r.x,r.y,r.width,r.height,x,y,r.width*scale,r.height*scale);};
    function adult(member,loaded){
      let result=adults.get(member.role);
      if(!result){
        const a=shared.familyArt.adultGeometry(member,{...loaded,avatars:{}}),b=a.extent,pad=3;
        const canvas=document.createElement('canvas');canvas.width=Math.ceil((b.right-b.left+pad*2)*density);canvas.height=Math.ceil((b.bottom-b.top+pad*2)*density);
        const c=canvas.getContext('2d');c.scale(density,density);c.translate(pad-b.left,pad-b.top);
        crop(c,a.body,a.bodyX,a.bodyY,a.bodyScale);
        c.save();c.translate(a.headX,a.headY);c.rotate(a.rotation);crop(c,a.head,a.dx,a.dy,a.headScale);c.restore();
        result={...a,composite:{image:canvas,left:b.left-pad,top:b.top-pad,width:canvas.width/density,height:canvas.height/density}};
        sources.set(canvas,[{kind:'body',scale:a.bodyScale*density},{kind:'head',scale:a.headScale*density}]);adults.set(member.role,result);
      }
      return {...result,member};
    }
    function child(member,actor,portrait,loaded){
      const body=loaded.manifest.body.child,u=1/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit;
      const foot={x:(body.foot.x-pose.collar.x)*u,y:(body.foot.y-pose.collar.y)*u};
      const map=b=>({left:(b.left-foot.x)*unit,top:(b.top-foot.y)*unit,right:(b.right-foot.x)*unit,bottom:(b.bottom-foot.y)*unit});
      const g=shared.characterRig.portraitGeometry(portrait),b=g.bounds;
      const headBounds=map({left:(b.left-g.chin.x)*g.scale,top:(b.top-g.chin.y)*g.scale,right:(b.right-g.chin.x)*g.scale,bottom:(b.bottom-g.chin.y)*g.scale});
      sources.set(actor.image,[{kind:'body',scale:u*density},{kind:'head',scale:g.scale*density,portrait:portrait.kind==='cutout'?portrait:null}]);
      return {member,adult:false,extent:map(actor.bounds),headBounds,
        composite:{image:actor.image,left:(actor.bounds.left-foot.x)*unit,top:(actor.bounds.top-foot.y)*unit,width:actor.image.width/density*unit,height:actor.image.height/density*unit}};
    }
    function forCharacters(avatars,members){
      const key=JSON.stringify(members.map(m=>[m.id,m.role,shared.family.canUsePhoto(m.role)?identity(avatars[m.id]?.image):0,shared.family.canUsePhoto(m.role)?avatars[m.id]?.metrics:null]));
      if(buckets.has(key)){const bucket=buckets.get(key);buckets.delete(key);buckets.set(key,bucket);return bucket.loader;}
      // An edit never retains background jobs or large composites for the
      // previous identity. Cancelling an edit rebuilds from its saved portrait.
      for(const old of buckets.values())old.close();buckets.clear();
      let closed=false,current=visible;const sessions=new Map(),sessionRoles=new Map(),loaders=new Map(),entries=new Map();
      const cancelled=()=>Object.assign(Error('人物准备已取消。'),{name:'AbortError'});
      const bucket={close(){closed=true;sessions.forEach(s=>s.close());sessions.clear();sessionRoles.clear();entries.forEach(e=>{e.revision++;e.loaded=e.pending=null;});entries.clear();},
        open(id){
          current=id;const windowIds=bookIds.slice(bookIds.indexOf(id),bookIds.indexOf(id)+3),familyWanted=windowIds.some(id=>id==='family'||scenes?.BOOKS[id]?.parents?.length);
          if(!familyWanted){adults.clear();for(const [key,s] of sessions)if(!sessionRoles.get(key)){s.close();sessions.delete(key);sessionRoles.delete(key);}}
          sessions.forEach(s=>void s.open(id).catch(()=>{}));
          entries.forEach(e=>{if((!e.cover&&!windowIds.includes(e.book))||e.book==='family'&&!familyWanted){e.revision++;e.loaded=e.pending=null;e.status='idle';}});
        },loader:null};
      async function prepare(entry,page,options){
        const token=entry.revision,check=()=>{if(closed||token!==entry.revision)throw cancelled();};
        let loaded=await baseLoader.ensure();check();
        if(entry.book==='family'&&bookIds.includes('intro-complete')){
          const background=await image('./art/sequence/books-11-15/play-courtyard.png','background');check();
          loaded={...loaded,assets:{...loaded.assets,revisedCourtyard:background},manifest:{...loaded.manifest,background:'revisedCourtyard'}};
        }
        const defaultPortrait={image:loaded.assets.childHead,kind:'illustrated',metrics:loaded.manifest.heads.child.metrics};
        const plan=scenes?.planFor(entry.book,page,options),needed=entry.book==='family'?members.filter(m=>m.included!==false):[members.find(m=>m.id==='child')||{id:'child',role:'child'},...(plan?.dad?[{id:'dad',role:'dad',included:true}]:[])],portraits=new Map(),actors={},actorByPose={};
        for(const member of needed){
          if(!shared.family.canUsePhoto(member.role)){actors[member.id]=adult(member,loaded);continue;}
          const custom=avatars[member.id];let portrait=defaultPortrait;
          if(custom?.kind==='cutout'&&custom.image&&custom.metrics?.faceBounds){
            try{shared.characterRig.portraitGeometry(custom);portrait=custom;}catch(_){/* Older incomplete landmarks use the approved default. */}
          }
          const personKey=identity(portrait.image);portraits.set(member.id,portrait);
          if(!sessions.has(personKey)){
            const primary=member.id==='child';
            const observedComposer={prepare:composer.prepare,release:composer.release,compose(o){const start=now(),actor=composer.compose(o);timing.composeMs+=now()-start;timing.composites++;sources.set(actor.image,[{kind:'body',scale:density/shared.characterRig.CHILD_MODEL.sourcePixelsPerUnit},{kind:'head',scale:actor.headScale*density,portrait:portrait.kind==='cutout'?portrait:null}]);return actor;}};
            const session=shared.characterSession.createCharacterSession({composer:observedComposer,portrait,poses:definitions,books:bookIds.map(id=>({id,poses:scenes?(primary?scenes.dependencies(id):[pose.id]):id==='family'?[pose.id]:[]})),loadBody:(p,{signal})=>p.id===pose.id?loaded.assets.childBody:image(p.bodyUrl,'body',signal)});
            sessions.set(personKey,session);sessionRoles.set(personKey,primary);session.start();if(current!==bookIds[0])void session.open(current).catch(()=>{});
          }
        }
        const assets=plan?Object.fromEntries(await Promise.all(scenes.assetKeys(plan).map(async key=>[key,await image(scenes.imageUrl(key),'background')]))):loaded.assets;check();
        if(!entry.cover)bucket.open(entry.book);
        for(const member of needed){const portrait=portraits.get(member.id);if(!portrait)continue;
          const session=sessions.get(identity(portrait.image)),poseId=entry.book==='family'?pose.id:plan?.pose;
          if(!poseId)continue;
          const [actor]=scenes?await session.require([poseId]):await session.open('family');check();
          if(entry.book==='family')actors[member.id]=child(member,actor,portrait,loaded);else {actorByPose[poseId]=actor;if(plan?.calibrateAgainstStand&&poseId!=='stand-wave'){const [stand]=await session.require(['stand-wave']);check();actorByPose['stand-wave']=stand;}}
        }
        return {...loaded,assets,preparedActors:actors,actorByPose,composer,model:shared.characterRig.CHILD_MODEL,poseLibrary:library.poses};
      }
      function forBook(book){
        if(loaders.has(book))return loaders.get(book);
        function entryFor(page=0,options={}){const cover=!!options.cover||['hero','character'].includes(options.framing),key=book+':'+(cover?'cover':book==='family'?'family':page);if(!entries.has(key))entries.set(key,{book,cover,status:'idle',pending:null,loaded:null,revision:0});return entries.get(key);}
        const loader={ensure(page=0,options={}){const e=entryFor(page,options);if(e.pending)return e.pending;e.status='loading';const token=e.revision;e.pending=prepare(e,page,options).then(value=>{if(closed||token!==e.revision)throw cancelled();e.loaded=value;e.status='ready';return value;}).catch(error=>{if(!closed&&token===e.revision)e.status='error';throw error;});return e.pending;},
          peek:(page,options)=>entryFor(page,options).loaded,status:(page,options)=>entryFor(page,options).status,
          retry(){entries.forEach(e=>{if(e.book===book&&e.status==='error'){e.revision++;e.pending=null;e.status='idle';}});baseLoader.retry();}};
        loaders.set(book,loader);return loader;
      }
      bucket.forBook=forBook;bucket.loader=forBook('family');bucket.snapshot=()=>({window:bookIds.slice(bookIds.indexOf(current),bookIds.indexOf(current)+3),sessions:[...sessions.values()].map(s=>s.snapshot())});
      buckets.set(key,bucket);return bucket.loader;
    }
    return {forCharacters,forBook(id,avatars,members){const family=forCharacters(avatars,members);return [...buckets.values()].find(b=>b.loader===family).forBook(id);},sourcesOf:image=>sources.get(image),recordDraw(ms){timing.pageDrawMs+=ms;timing.draws++;},snapshot(){return {...timing,adultComposites:adults.size,buckets:[...buckets.values()].map(b=>b.snapshot())};},openBook(id){visible=id;buckets.forEach(b=>b.open(visible));},close(){buckets.forEach(b=>b.close());buckets.clear();adults.clear();images.clear();}};
  };
})(window);
