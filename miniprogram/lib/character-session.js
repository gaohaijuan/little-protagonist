'use strict';

// One session belongs to one saved portrait. Work is by distinct pose, not by
// page. Replacing the portrait closes this session before creating another.
function createCharacterSession({composer,portrait,poses,books,loadBody,schedule=callback=>setTimeout(callback,0),windowSize=3}){
  if(!Number.isInteger(windowSize)||windowSize<1||typeof loadBody!=='function')throw Error('Invalid character preparation policy');
  const library=new Map(poses.map(p=>[p.id,p])),catalog=books.map(b=>({id:b.id,poses:[...new Set(b.poses)]}));
  if(library.size!==poses.length||poses.some(p=>typeof p.bodyUrl!=='string'||!p.bodyUrl)||new Set(catalog.map(b=>b.id)).size!==catalog.length||catalog.some(b=>!b.id||b.poses.some(id=>!library.has(id))))throw Error('Invalid book pose dependencies');
  const prepared=composer.prepare(portrait),entries=new Map(),bodies=new Map(),idleWaiters=[];
  let wanted=new Set(),visible=new Set(),windowIds=[],running=null,scheduled=false,paused=false,closed=false,started=false;
  const abortError=()=>Object.assign(Error('Character preparation cancelled'),{name:'AbortError'});
  function notifyIdle(){if(!running&&!scheduled&&![...entries.values()].some(e=>e.status==='queued'))idleWaiters.splice(0).forEach(resolve=>resolve());}
  function dispose(entry){
    entry.controller?.abort();if(entry.actor)composer.release({portrait:prepared,body:entry.body,poseId:entry.id});
    entry.reject(abortError());entries.delete(entry.id);
  }
  function pruneBodies(){
    const urls=new Set([...wanted].map(id=>library.get(id).bodyUrl));
    for(const url of bodies.keys())if(!urls.has(url))bodies.delete(url);
  }
  function entryFor(id){
    if(entries.has(id))return entries.get(id);
    let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});promise.catch(()=>{});
    const entry={id,status:'queued',promise,resolve,reject};entries.set(id,entry);return entry;
  }
  function updateWindow(index){
    windowIds=catalog.slice(index,index+windowSize).map(b=>b.id);
    wanted=new Set(catalog.slice(index,index+windowSize).flatMap(b=>b.poses));
    for(const entry of entries.values())if(!wanted.has(entry.id))dispose(entry);
    for(const id of wanted)entryFor(id);pruneBodies();
  }
  function cancellable(promise,signal){
    return new Promise((resolve,reject)=>{const cancel=()=>{signal.removeEventListener('abort',cancel);reject(abortError());};if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});
  }
  async function pump(){
    if(running||closed)return;
    const queue=[...entries.values()].filter(e=>e.status==='queued').sort((a,b)=>Number(visible.has(b.id))-Number(visible.has(a.id)));
    const entry=queue.find(e=>!paused||visible.has(e.id));if(!entry){notifyIdle();return;}
    running=entry;entry.status='loading';entry.controller=new AbortController();const pose=library.get(entry.id),signal=entry.controller.signal;
    try{
      let bodyPromise=bodies.get(pose.bodyUrl);
      if(!bodyPromise){bodyPromise=Promise.resolve().then(()=>loadBody(pose,{signal}));bodies.set(pose.bodyUrl,bodyPromise);bodyPromise.catch(()=>{if(bodies.get(pose.bodyUrl)===bodyPromise)bodies.delete(pose.bodyUrl);});}
      const body=await cancellable(bodyPromise,signal);
      if(closed||signal.aborted||entries.get(entry.id)!==entry||!wanted.has(entry.id))throw abortError();
      entry.body=body;entry.actor=composer.compose({portrait:prepared,body,poseId:entry.id});entry.status='ready';entry.resolve(entry.actor);
    }catch(error){
      if(error.name==='AbortError'){
        bodies.delete(pose.bodyUrl);
        if(!closed&&entries.get(entry.id)===entry&&wanted.has(entry.id)){entry.status='queued';}else entry.reject(error);
      }else{entry.status='error';entry.error=error;entry.reject(error);}
    }finally{running=null;pruneBodies();kick();notifyIdle();}
  }
  function kick(){
    if(closed||running)return;
    if([...entries.values()].some(e=>e.status==='queued'&&visible.has(e.id))){void pump();return;}
    if(paused||scheduled){notifyIdle();return;}
    if(![...entries.values()].some(e=>e.status==='queued')){notifyIdle();return;}
    scheduled=true;schedule(()=>{scheduled=false;if(!closed)void pump();else notifyIdle();});
  }
  function start(){if(closed)throw Error('Character session closed');if(started)return;started=true;visible=new Set();updateWindow(0);kick();}
  function open(bookId){
    if(closed)return Promise.reject(abortError());const index=catalog.findIndex(b=>b.id===bookId);
    if(index<0)return Promise.reject(Error('Unknown book'));
    started=true;visible=new Set(catalog[index].poses);updateWindow(index);
    // Reading beats background work. Even a loader which ignores abort cannot
    // block the selected book; stale results never enter the new window.
    if(running&&!visible.has(running.id))running.controller.abort();
    const requests=[...visible].map(id=>{
      let e=entries.get(id);if(e.status==='error'){entries.delete(id);e=entryFor(id);}return e.promise;
    });kick();return Promise.all(requests);
  }
  function close(){if(closed)return;closed=true;scheduled=false;wanted.clear();visible.clear();for(const e of entries.values())dispose(e);bodies.clear();notifyIdle();}
  function requirePoses(ids){
    if(closed)return Promise.reject(abortError());if(!started)start();
    if(ids.some(id=>!wanted.has(id)))return Promise.reject(Error('Pose outside current preparation window'));
    const requests=ids.map(id=>{visible.add(id);let e=entries.get(id);if(e.status==='error'){entries.delete(id);e=entryFor(id);}return e.promise;});kick();return Promise.all(requests);
  }
  return Object.freeze({start,open,require:requirePoses,get:id=>entries.get(id)?.status==='ready'?entries.get(id).actor:null,close,pause(){paused=true;if(running&&!visible.has(running.id))running.controller.abort();},resume(){paused=false;kick();},whenIdle(){return !running&&!scheduled&&![...entries.values()].some(e=>e.status==='queued')?Promise.resolve():new Promise(resolve=>idleWaiters.push(resolve));},snapshot(){return {books:windowIds.slice(),poses:[...entries.values()].map(e=>({id:e.id,status:e.status})),loading:running?.id||null};}});
}
module.exports={createCharacterSession};
