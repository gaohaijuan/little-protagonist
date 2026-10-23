(function(scope){
  'use strict';
  const base='./art/intro/',files={greeting:'greeting.webp',play:'play.webp',school:'school.webp'},assets={},requests=new Map(),scenes=new Map();
  let manifest=null,manifestRequest=null;
  const sceneFor=(page,options={})=>options.cover||options.framing==='hero'?'greeting':['greeting','play','greeting','play','school','school'][Math.max(0,Math.min(5,Math.floor(Number(page)||0)))];
  function metadata(){
    if(manifest)return Promise.resolve(manifest);if(manifestRequest)return manifestRequest;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    manifestRequest=fetch(base+'manifest.json',{signal:controller.signal,cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('自我介绍插画暂时无法打开。');return response.json();}).then(value=>{
      if(!value||!value.scenes||!value.head)throw Error('自我介绍插画资料不完整。');manifest=value;return value;
    }).catch(error=>{manifestRequest=null;throw error;}).finally(()=>clearTimeout(timer));return manifestRequest;
  }
  function image(name,file){
    if(assets[name])return Promise.resolve(assets[name]);if(requests.has(name))return requests.get(name);
    if(name==='childHead'){
      const existing=scope.LittleFamilyArtLoader&&scope.LittleFamilyArtLoader.peek();
      if(existing&&existing.assets.childHead){assets[name]=existing.assets.childHead;return Promise.resolve(assets[name]);}
    }
    if(typeof file!=='string'||!(/^[a-z0-9][a-z0-9-]*\.webp$/i.test(file)||file==='../family/child-head.webp'))return Promise.reject(Error('自我介绍插画文件名无效。'));
    const request=new Promise((resolve,reject)=>{const result=new Image(),timer=setTimeout(()=>finish(Error('自我介绍插画加载超时。')),20000);
      function finish(error){clearTimeout(timer);result.onload=null;result.onerror=null;if(error){result.src='';reject(error);}else{assets[name]=result;resolve(result);}}
      result.onload=()=>finish(result.naturalWidth&&result.naturalHeight?null:Error('自我介绍插画尺寸无效。'));
      result.onerror=()=>finish(Error('自我介绍插画暂时无法打开。'));result.src=base+file;
    });requests.set(name,request);request.catch(()=>requests.delete(name));return request;
  }
  function ensure(page,options={}){
    const scene=sceneFor(page,options);if(scenes.has(scene))return scenes.get(scene).promise;
    const entry={status:'loading',promise:null};scenes.set(scene,entry);
    entry.promise=metadata().then(value=>Promise.all([image(scene,value.files&&value.files[scene]||files[scene]),image(value.head.asset||'childHead',value.head.url||'../family/child-head.webp')])).then(()=>{entry.status='ready';return {assets,manifest};}).catch(error=>{entry.status='error';throw error;});
    return entry.promise;
  }
  scope.LittleIntroArtLoader={ensure,peek:(page,options={})=>scenes.get(sceneFor(page,options))?.status==='ready'?{assets,manifest}:null,status:(page,options={})=>scenes.get(sceneFor(page,options))?.status||'idle',retry(){for(const [key,entry]of scenes)if(entry.status==='error')scenes.delete(key);}};
})(window);
