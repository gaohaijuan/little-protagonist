(function(scope){
  'use strict';
  const samples=new WeakMap(),grades=new WeakMap(),origins=new WeakMap();
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function sample(image,face){
    let map=samples.get(image);if(!map){map=new Map();samples.set(image,map);}
    const key=face?JSON.stringify(face):'scene';if(map.has(key))return map.get(key);
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
    if(!w||!h)return null;
    const c=document.createElement('canvas');c.width=64;c.height=64;
    const x=c.getContext('2d',{willReadFrequently:true});
    // Sample the face interior, excluding the hairline and the silhouette's blank margins.
    if(face)x.drawImage(image,face.left+(face.right-face.left)*.16,face.top+(face.bottom-face.top)*.25,(face.right-face.left)*.68,(face.bottom-face.top)*.62,0,0,64,64);
    else x.drawImage(image,0,0,w*.65,h,0,0,64,64);
    const pixels=x.getImageData(0,0,64,64).data,levels=[];let l=0,warm=0,n=0;
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);if(pixels[i+3]<180||hi>245&&lo>225||hi<20)continue;const value=.2126*r+.7152*g+.0722*b;l+=value;levels.push(value);warm+=(r-b)/255;n++;}
    levels.sort((a,b)=>a-b);
    const result=n?{l:l/n,reference:levels[Math.floor((levels.length-1)*.65)],warm:warm/n}:{l:155,reference:155,warm:.1};map.set(key,result);return result;
  }
  function parameters(photo,scene){
    const reference=clamp(photo.reference||photo.l,20,245),desired=clamp(scene.l*.72+12,138,158);
    // Lift underexposed facial midtones, rather than pushing already-bright skin towards paper white.
    const target=reference<desired?desired:reference*.985;
    return {gamma:Math.round(clamp(Math.log(target/255)/Math.log(reference/255),.55,1.03)*1000)/1000,
      warmth:Math.round(clamp(scene.warm*.15-(photo.warm-.12||0)*.12,-.035,.035)*1000)/1000};
  }
  function transform(pixels,p){
    // A pointwise photographic exposure curve: no redrawing, smoothing or texture overlay.
    for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;
      const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2],t=clamp((l-12)/43,0,1),shadowProtection=t*t*(3-2*t);
      const mapped=255*Math.pow(l/255,p.gamma),exposure=l?clamp(1+(mapped-l)*shadowProtection/l,.8,2.4):1;
      for(let channel=0;channel<3;channel++){const gain=channel===0?1+p.warmth:channel===2?1-p.warmth:1+p.warmth*.12;pixels[i+channel]=clamp(pixels[i+channel]*exposure*gain,0,255);}
    }return pixels;
  }
  function grade(actor,background){
    if(!actor||actor.kind!=='cutout'||!actor.image)return actor;
    const image=origins.get(actor.image)||actor.image;
    try{
      const photo=sample(image,actor.metrics?.faceBounds),scene=background?sample(background):{l:185,warm:0};if(!photo||!scene)return actor;
      const p=parameters(photo,scene),key=JSON.stringify(p);let map=grades.get(image);if(!map){map=new Map();grades.set(image,map);}
      let result=map.get(key);if(!result){
        result=document.createElement('canvas');result.width=image.naturalWidth||image.width;result.height=image.naturalHeight||image.height;
        const c=result.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);const frame=c.getImageData(0,0,result.width,result.height);transform(frame.data,p);c.putImageData(frame,0,0);
        origins.set(result,image);map.set(key,result);
        if(map.size>8)map.delete(map.keys().next().value);
      }
      return {...actor,image:result};
    }catch(_){return actor;}
  }
  scope.LittlePhotoTone={apply(avatars,background){const result={};for(const [id,actor]of Object.entries(avatars||{}))result[id]=grade(actor,background);return result;},originalOf:image=>origins.get(image)||image,parameters,transform};
})(window);
