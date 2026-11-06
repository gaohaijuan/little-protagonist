"""Preserve native assets, encode losslessly, register one whole-body action."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1];p=root/'content/level2-fourth-three-generation-plan.json';plan=json.loads(p.read_text('utf-8'))
native=root/'art-samples/level2-fourth-three-native';web=root/'preview/art/sequence/level2-fourth-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True);assets={};registrations=[]
def save(key,im,**extra):
 target=web/(key+'.webp');im.save(target,lossless=True,exact=True,method=6);assert Image.open(target).convert('RGBA').tobytes()==im.convert('RGBA').tobytes()
 assets[key]={'url':'./art/sequence/level2-fourth-three/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),**extra};return target
for j in plan['jobs']:
 if not j.get('accepted'):continue
 dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst);j['savedNativePath']=str(dst);im=Image.open(dst).convert('RGBA');key=j['key']
 if key=='child-sit-rest-side':
  collar=(510,555);source_sole=1377;scale=851/(source_sole-collar[1]);offset=(768-collar[0]*scale,1000-collar[1]*scale)
  im=im.transform((1536,2304),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC);key='sit-doze'
  bounds=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox();foreground=[dict(zip(['left','top','right','bottom'],[round(l*scale+offset[0]),round(t*scale+offset[1]),round(r*scale+offset[0]),round(b*scale+offset[1])])) for l,t,r,b in [(620,345,800,735)]]
  pose={'id':key,'version':1,'model':'child-v1','bodyUrl':'./art/sequence/level2-fourth-three/sit-doze.webp','collar':{'x':768,'y':1000},'bounds':dict(zip(['left','top','right','bottom'],bounds)),'headRotation':1.25,'foregroundRects':[dict(zip(['left','top','right','bottom'],[0,0,1536,2304]))]}
  libp=root/'content/child-pose-library.json';lib=json.loads(libp.read_text('utf-8'));lib['poses'][key]=pose;lib['version']=max(12,lib['version']);libp.write_text(json.dumps(lib,ensure_ascii=False,indent=2),'utf-8')
  registrations.append({'pose':key,'sourceSize':Image.open(dst).size,'sourceCollar':collar,'sourceSole':source_sole,'uniformScale':scale,'offset':offset,'registeredSoleMinusCollar':851,'basis':'Existing seated pose sole minus collar851; standing density unchanged. Final whole-actor comparison required.','headGeometryChanged':False})
 j['savedWebPath']=str(save(key,im,nativePixelsExact=key!='sit-doze'))
 if key=='moon-pond-wide':
  # Same original sky disk is used for the water; no second moon is generated.
  disc=im.crop((848,118,975,245));mask=Image.new('L',disc.size,0);ImageDraw.Draw(mask).ellipse((1,1,125,125),fill=255);disc.putalpha(mask);save('l2-moon-disc',disc,nativePixelsExact=False,extraction={'source':str(dst),'rect':[848,118,975,245],'skyCenterWorld':[727,145]})
aliases={'l2-dawn-night':'sunrise/night.webp','l2-dawn-red':'sunrise/red-cloud.webp','l2-dawn-sun':'sunrise/sun.webp','l2-rabbit-garden':'books-16-20-storyboards-v2/b20-p05.png','l2-rabbit-garden-end':'books-16-20-storyboards-v2/b20-p08.png','l2-rabbit-bird-garden':'books-11-13/calling-wide.webp','l2-cabbage-leaf':'books-16-20/cabbage-leaf.png'}
for key,rel in aliases.items():
 im=Image.open(root/'preview/art/sequence'/rel).convert('RGBA');assets[key]={'url':'./art/sequence/'+rel,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'reused':True}
(root/'content/level2-fourth-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-fourth-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
(root/'content/level2-fourth-three-pose-registration.json').write_text(json.dumps(registrations,ensure_ascii=False,indent=2),'utf-8')
p.write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8');(root/'content/level2-fourth-three-generation-jobs.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('Saved',sum(bool(j.get('accepted')) for j in plan['jobs']),'accepted native assets and metadata.')
