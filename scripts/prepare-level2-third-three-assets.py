"""Save native assets and register body poses once, without changing head geometry."""
from pathlib import Path
from PIL import Image
import json, shutil, hashlib
root=Path(__file__).resolve().parents[1]
p=root/'content/level2-third-three-generation-jobs.json'
plan=json.loads(p.read_text('utf-8'))
v2={'key':'child-bunny-hands-v2','kind':'pose','transparent':True,
    'source':'C:/Users/Administrator/.codex/generated_images/01a166e7-882e-77b3-92c6-d14037784b34/exec-135d5c42-5326-4898-9d36-412b0e6f80b6.png','accepted':True}
if not any(j['key']==v2['key'] for j in plan['jobs']):plan['jobs'].append(v2)
native=root/'art-samples/level2-third-three-native';web=root/'preview/art/sequence/level2-third-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
assets={};regs=[];libp=root/'content/child-pose-library.json';lib=json.loads(libp.read_text('utf-8'))
for j in plan['jobs']:
    dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst);j['savedNativePath']=str(dst)
    if not j.get('accepted'):continue
    im=Image.open(dst).convert('RGBA');key=j['key'];size=im.size
    if key.startswith('child-'):
        bunny='bunny' in key;collar=(632,440) if bunny else (510,300);sole=1236 if bunny else 1460
        scale=1176/(sole-collar[1]);offset=(768-collar[0]*scale,1100-collar[1]*scale)
        im=im.transform((1536,2560),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
        key='pretend-bunny' if bunny else 'pretend-cat'
        bounds=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
        pose={'id':key,'version':1,'model':'child-v1','bodyUrl':'./art/sequence/level2-third-three/'+key+'.webp','collar':{'x':768,'y':1100},'bounds':dict(zip(['left','top','right','bottom'],bounds)),'headRotation':0}
        if not bunny:
            pose['foregroundRects']=[dict(zip(['left','top','right','bottom'],[round(l*scale+offset[0]),round(t*scale+offset[1]),round(r*scale+offset[0]),round(b*scale+offset[1])])) for l,t,r,b in [(300,140,450,345),(575,140,725,345)]]
        lib['poses'][key]=pose;regs.append({'pose':key,'sourceSize':size,'sourceCollar':collar,'sourceSole':sole,'uniformScale':scale,'offset':offset,'registeredSize':im.size,'registeredCollar':[768,1100],'registeredSole':2276,'headGeometryChanged':False})
    target=web/(key+'.webp');im.save(target,lossless=True,exact=True,method=6)
    assert Image.open(target).convert('RGBA').tobytes()==im.tobytes()
    assets[key]={'url':'./art/sequence/level2-third-three/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'nativePixelsExact':not key.startswith('pretend-'),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    j['savedWebPath']=str(target)
lib['version']=max(lib['version'],11);libp.write_text(json.dumps(lib,ensure_ascii=False,indent=2),'utf-8')
(root/'content/level2-third-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-third-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
(root/'content/level2-third-three-pose-registration.json').write_text(json.dumps(regs,ensure_ascii=False,indent=2),'utf-8')
p.write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('Saved 3 accepted assets; preserved rejected draft; registered 2 poses at unchanged model density.')
