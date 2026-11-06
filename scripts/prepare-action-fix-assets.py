"""Register generated headless bodies once into child-v1 pixel density.
Uniform raster registration is part of the character build, never a page/head adjustment.
Keep native originals and record the exact transform; no face pixels are processed.
"""
from pathlib import Path
from PIL import Image
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1];plan=json.loads((root/'content/level1-action-fixes-generation.json').read_text('utf-8'))
native=root/'art-samples/action-fixes-native';web=root/'preview/art/sequence/action-fixes'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
registrations={
 'walk-carry-right':dict(id='walk-carry-right',collar=[535,170],target=[501,225],scale=1176/1255,canvas=[1280,1536],rotation=.08,attachments={'leftPalm':[675,500],'rightPalm':[710,500],'frontSole':[830,1425],'rearSole':[280,1320]}),
 'crouch-reach-right-safe':dict(id='crouch-reach-right',collar=[660,225],target=[720,320],scale=920/973,canvas=[1536,1536],rotation=.35,attachments={'fingertips':[1205,1135],'rightPalm':[1110,1050],'leftPalm':[245,650],'feet':[700,1198]}),
 'invite-up-right':dict(id='invite-up-right',collar=[480,290],target=[501,225],scale=1176/1165,canvas=[1280,1536],rotation=.18,attachments={'rightPalm':[950,155],'leftPalm':[185,725],'feet':[690,1455]})
}
assets={};poses=[]
for job in plan['jobs']:
 if not job['accepted']:continue
 key=job['key'];dst=native/(key+'.png');shutil.copy2(job['source'],dst);source=Image.open(dst).convert('RGBA');im=source
 if job['transparent']:assert source.getextrema()[3][0]==0 and source.getextrema()[3][1]>=254
 meta={'nativeSize':list(source.size),'nativePath':str(dst)}
 if key in registrations:
  r=registrations[key];s=r['scale'];dx=r['target'][0]-r['collar'][0]*s;dy=r['target'][1]-r['collar'][1]*s
  im=source.transform(tuple(r['canvas']),Image.Transform.AFFINE,(1/s,0,-dx/s,0,1/s,-dy/s),resample=Image.Resampling.BICUBIC)
  bounds=im.getchannel('A').point(lambda a:255 if a>200 else 0).getbbox();x,y=r['target']
  pose={'id':r['id'],'version':1,'model':'child-v1','bodyUrl':'./art/sequence/action-fixes/'+key+'.webp','collar':{'x':x,'y':y},'bounds':dict(zip(['left','top','right','bottom'],bounds)),'headRotation':r['rotation'],'attachments':{name:{'x':round(x+(p[0]-r['collar'][0])*s,3),'y':round(y+(p[1]-r['collar'][1])*s,3)} for name,p in r['attachments'].items()}}
  poses.append(pose);meta.update({'registration':{'uniformScale':s,'offset':[dx,dy],'sourceCollar':r['collar'],'canonicalCollar':r['target'],'modelSourcePixelsPerUnit':1176/640},'nativePixelsExact':False,'registeredPixelsLossless':True})
 else:meta['nativePixelsExact']=True
 target=web/(key+'.webp');im.save(target,lossless=True,exact=True,method=6);encoded=Image.open(target).convert('RGBA');assert im.size==encoded.size
 a,b=im.tobytes(),encoded.tobytes();assert all(a[i:i+4]==b[i:i+4] for i in range(0,len(a),4) if a[i+3])
 assets[key]={'url':'./art/sequence/action-fixes/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),**meta}
 job.update({'savedNativePath':str(dst),'savedWebPath':str(target)})
(root/'content/action-fix-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/action-fix-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
libraryfile=root/'content/child-pose-library.json';library=json.loads(libraryfile.read_text('utf-8'))
for p in poses:library['poses'][p['id']]=p
library['version']=max(library['version'],10);libraryfile.write_text(json.dumps(library,ensure_ascii=False,indent=2)+'\n','utf-8')
(root/'content/action-fix-pose-registration.json').write_text(json.dumps({'model':'child-v1','sourcePixelsPerUnit':1176/640,'headPixelsModified':False,'transforms':registrations,'poses':poses},ensure_ascii=False,indent=2),'utf-8')
(root/'content/level1-action-fixes-generation.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('Registered3 headless poses at child-v1 density;2 first-person detail layers;1 clear comparison background. Native originals preserved.')

