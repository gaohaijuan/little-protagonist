(function(scope){
  'use strict';
  const base='./art/family/',assets={},requests=new Map();
  const fallbackFiles={courtyard:'courtyard.webp',bodies:'bodies.webp',childBody:'child-body.webp',heads:'heads.webp',childHead:'child-head.webp'};
  let manifest=null,manifestRequest=null,current=null;
  function metadata(){
    if(manifest)return Promise.resolve(manifest);
    if(manifestRequest)return manifestRequest;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    manifestRequest=fetch(base+'manifest.json',{signal:controller.signal,cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('家庭插画资料暂时无法打开。');return response.json();}).then(value=>{
      if(!value||!value.body||!value.heads)throw Error('家庭插画资料不完整。');manifest=value;return value;
    }).catch(error=>{manifestRequest=null;throw error;}).finally(()=>clearTimeout(timer));
    return manifestRequest;
  }
  function image(name,file){
    if(assets[name])return Promise.resolve(assets[name]);if(requests.has(name))return requests.get(name);
    // Manifest filenames are local asset basenames, never executable URLs.
    if(typeof file!=='string'||!/^[a-z0-9][a-z0-9-]*\.webp$/i.test(file))return Promise.reject(Error('家庭插画文件名无效。'));
    const request=new Promise((resolve,reject)=>{
      const result=new Image(),timer=setTimeout(()=>finish(Error('家庭插画加载超时。')),20000);
      function finish(error){clearTimeout(timer);result.onload=null;result.onerror=null;if(error){result.src='';reject(error);}else{assets[name]=result;resolve(result);}}
      result.onload=()=>finish(result.naturalWidth&&result.naturalHeight?null:Error('家庭插画尺寸无效。'));
      result.onerror=()=>finish(Error('家庭插画暂时无法打开。'));result.src=base+file;
    });requests.set(name,request);request.catch(()=>requests.delete(name));return request;
  }
  function ensure(){
    if(current)return current.promise;
    const entry={status:'loading',promise:null};current=entry;
    entry.promise=metadata().then(value=>Promise.all(Object.entries(value.files||fallbackFiles).map(([name,file])=>image(name,file)))).then(()=>{entry.status='ready';return {assets,manifest};}).catch(error=>{entry.status='error';throw error;});
    return entry.promise;
  }
  scope.LittleFamilyArtLoader={ensure,peek:()=>current&&current.status==='ready'?{assets,manifest}:null,status:()=>current?current.status:'idle',retry(){if(current&&current.status==='error')current=null;}};
})(window);
