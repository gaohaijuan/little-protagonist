from pathlib import Path
from PIL import Image
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1]
p=root/'content/level2-review-fixes-generation.json';plan=json.loads(p.read_text('utf-8'))
native=root/'art-samples/level2-review-fixes-native';web=root/'preview/art/sequence/level2-review-fixes'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True);assets={};registration={}
for j in plan['jobs']:
    dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst);im=Image.open(dst).convert('RGBA');key=j['key']
    if key=='wear-big-shoes-body':
        scale=500/540;offset=(768-510*scale,600-120*scale)
        im=im.transform((1536,2048),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
        registration={'sourceCollar':[510,120],'sourceTorsoHeight':540,'masterTorsoHeight':500,'uniformScale':scale,'offset':list(offset),'soleMinusCollar':round((1461-120)*scale,2),'basis':'One uniform collar-to-sweater-hem alignment to the standing master; no limb stretch or head adjustment.'}
    target=web/(key+'.webp');im.save(target,lossless=True,exact=True,method=6);assert Image.open(target).convert('RGBA').tobytes()==im.tobytes()
    bounds=list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox());assets[key]={'url':'./art/sequence/level2-review-fixes/'+target.name,'size':list(im.size),'bounds':bounds,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'nativePixelsExact':key!='wear-big-shoes-body'}
    if key.startswith('child-'):
        top=bounds[1];assets[key]['metrics']={'bounds':dict(zip(['left','top','right','bottom'],bounds)),'chin':{'x':654,'y':top+1147},'faceBounds':{'left':207,'top':391,'right':1096,'bottom':1165}}
    j['nativePath']=str(dst);j['webPath']=str(target)
pose={'id':'wear-big-shoes','version':1,'model':'child-v1','bodyUrl':assets['wear-big-shoes-body']['url'],'collar':{'x':768,'y':600},'bounds':dict(zip(['left','top','right','bottom'],assets['wear-big-shoes-body']['bounds'])),'headRotation':0}
(root/'content/level2-review-fixes-poses.json').write_text(json.dumps({'poses':{'wear-big-shoes':pose},'registration':registration},ensure_ascii=False,indent=2),'utf-8')
(root/'content/level2-review-fixes-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-review-fixes-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
p.write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('Prepared9 transparent layers; registered one uniformly aligned shoe pose; default-only head variants retain the same1147px head reference.')
