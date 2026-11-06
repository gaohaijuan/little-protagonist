from pathlib import Path
from PIL import Image
import json,hashlib,shutil
root=Path(__file__).resolve().parents[1]
plan=json.loads((root/'content/level2-last-three-generation.json').read_text('utf-8'))
native=root/'art-samples/level2-last-three-native';web=root/'preview/art/sequence/level2-last-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
assets=json.loads((root/'content/level2-last-three-pose-registration.json').read_text('utf-8'))['assets']
for j in plan['jobs']:
    target=native/(j['key']+'.png');shutil.copy2(j['source'],target)
    im=Image.open(target).convert('RGBA');dst=web/(j['key']+'.webp');im.save(dst,lossless=True,exact=True,method=6)
    assert Image.open(dst).convert('RGBA').tobytes()==im.tobytes()
    assets[j['key']]={'url':'./art/sequence/level2-last-three/'+dst.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'nativePixelsExact':True}
    j['savedNativePath']=str(target);j['savedWebPath']=str(dst)
aliases={'jump-garden-wide':'books-16-20-storyboards-v2/b20-p05.png','white-rabbit-alert':'level2-fourth-three/white-rabbit-alert.webp','jump-stone':'books-06-10/pebble.png','jump-paper':'books-16-20/red-paper.png'}
for key,rel in aliases.items():
    p=root/'preview/art/sequence'/rel;im=Image.open(p).convert('RGBA')
    assets[key]={'url':'./art/sequence/'+rel,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'reused':True,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(root/'content/level2-last-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-last-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
(root/'content/level2-last-three-generation.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('Prepared',len(plan['jobs']),'generated layers,',len(assets),'total assets; native pixels preserved.')
