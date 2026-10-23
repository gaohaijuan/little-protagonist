(function(scope){
  'use strict';
  const books=new Set(['hands','rain','stone']),loaders=new Map(),images=new Map(),imageRequests=new Map();
  const localFile=/^[a-z0-9][a-z0-9-]*\.webp$/i;
  const sharedHeads={
    '../../family/child-head.webp':'./art/family/child-head.webp',
    '../../flower/care-head.webp':'./art/flower/care-head.webp',
    '../../flower/wind-head.webp':'./art/flower/wind-head.webp',
    '../../flower/search-head.webp':'./art/flower/search-head.webp'
  };
  function reusedHead(url){
    if(url==='./art/family/child-head.webp')return scope.LittleFamilyArtLoader?.peek()?.assets.childHead||scope.LittleIntroArtLoader?.peek(0,{cover:true})?.assets.childHead;
    const match=url.match(/\/flower\/(care|wind|search)-head\.webp$/);
    if(match){const scene=match[1],page={care:0,wind:2,search:5}[scene];return scope.LittleArtLoader?.peek(page)?.assets[scene+'Head'];}
    return null;
  }
  function image(url){
    if(images.has(url))return Promise.resolve(images.get(url));
    const reused=reusedHead(url);if(reused){images.set(url,reused);return Promise.resolve(reused);}
    if(imageRequests.has(url))return imageRequests.get(url);
    const request=new Promise((resolve,reject)=>{
      const result=new Image(),timer=setTimeout(()=>finish(Error('插画加载超时。')),20000);
      function finish(error){clearTimeout(timer);result.onload=null;result.onerror=null;if(error){result.src='';reject(error);}else{images.set(url,result);resolve(result);}}
      result.onload=()=>finish(result.naturalWidth&&result.naturalHeight?null:Error('插画尺寸无效。'));
      result.onerror=()=>finish(Error('插画暂时无法打开。'));result.src=url;
    });
    imageRequests.set(url,request);request.catch(()=>imageRequests.delete(url));return request;
  }
  function create(book){
    const base='./art/sequence/'+book+'/',assets={},scenes=new Map(),views=new Map();
    let manifest=null,manifestRequest=null,manifestState='idle';
    function key(page,options){return options.cover?'cover':'page:'+Math.max(0,Math.floor(Number(page)||0));}
    function plan(page,options){
      if(!manifest)return null;
      const index=Math.max(0,Math.min(manifest.pages.length-1,Math.floor(Number(page)||0)));
      const entry=options.cover?manifest.cover||manifest.pages[0]:manifest.pages[index];
      if(!entry||typeof entry.scene!=='string'||!manifest.scenes[entry.scene])throw Error('这一页的插画资料不完整。');
      return entry.scene;
    }
    function metadata(){
      if(manifest)return Promise.resolve(manifest);if(manifestRequest)return manifestRequest;
      manifestState='loading';
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      manifestRequest=fetch(base+'manifest.json',{signal:controller.signal,cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('插画资料暂时无法打开。');return response.json();}).then(value=>{
        if(!value||!value.scenes||!value.files||!Array.isArray(value.pages)||!value.pages.length)throw Error('插画资料不完整。');
        for(const entry of value.pages.concat(value.cover?[value.cover]:[]))if(!entry||typeof entry.scene!=='string'||!value.scenes[entry.scene])throw Error('插画页码无效。');
        manifest=value;manifestState='ready';return manifest;
      }).catch(error=>{manifestState='error';throw error;}).finally(()=>clearTimeout(timer));
      return manifestRequest;
    }
    function sceneLayers(scene){
      const entry=manifest.scenes[scene],file=manifest.files[scene];
      if(typeof file!=='string'||!localFile.test(file))throw Error('插画文件名无效。');
      const layers=[[scene,base+file]];
      if(entry.head!==false){
        const head=typeof entry.head==='string'?entry.head:'childHead',spec=manifest.heads&&manifest.heads[head];
        if(!spec||typeof spec.url!=='string'||head===scene)throw Error('插画头像资料不完整。');
        const url=sharedHeads[spec.url]||(localFile.test(spec.url)?base+spec.url:null);
        if(!url)throw Error('插画头像文件名无效。');
        layers.push([head,url]);
      }
      return layers;
    }
    function ensureScene(scene){
      if(scenes.has(scene))return scenes.get(scene).promise;
      const entry={status:'loading',promise:null};scenes.set(scene,entry);
      entry.promise=Promise.resolve().then(()=>Promise.all(sceneLayers(scene).map(([name,url])=>image(url).then(result=>{assets[name]=result;})))).then(()=>{entry.status='ready';return {assets,manifest};}).catch(error=>{entry.status='error';throw error;});
      return entry.promise;
    }
    function ensure(page,options={}){
      if(manifest){try{return ensureScene(plan(page,options));}catch(error){return Promise.reject(error);}}
      const viewKey=key(page,options);if(views.has(viewKey))return views.get(viewKey).promise;
      const entry={status:'loading',promise:null};views.set(viewKey,entry);
      entry.promise=metadata().then(()=>ensureScene(plan(page,options))).then(result=>{entry.status='ready';return result;}).catch(error=>{entry.status='error';throw error;});
      return entry.promise;
    }
    function status(page,options={}){
      if(manifest){try{return scenes.get(plan(page,options))?.status||'idle';}catch(_){return 'error';}}
      return manifestState==='error'?'error':views.get(key(page,options))?.status||'idle';
    }
    return {ensure,status,peek(page,options={}){return status(page,options)==='ready'?{assets,manifest}:null;},retry(){
      for(const [name,entry]of scenes)if(entry.status==='error')scenes.delete(name);
      views.clear();
      if(manifestState==='error'){manifestRequest=null;manifestState='idle';}
    }};
  }
  scope.LittleSequenceArtLoader={forBook(book){if(!books.has(book))return null;if(!loaders.has(book))loaders.set(book,create(book));return loaders.get(book);}};
})(window);
