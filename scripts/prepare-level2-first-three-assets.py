"""Preserve native generated pixels and encode losslessly; no image retouching."""
from pathlib import Path
from PIL import Image
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1]
plan=json.loads((root/'content/level2-first-three-generation-jobs.json').read_text('utf-8'))
native=root/'art-samples/level2-first-three-native';web=root/'preview/art/sequence/level2-first-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
assets={}
for j in plan['jobs']:
 dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst);im=Image.open(dst).convert('RGBA')
 if j['transparent']:assert im.getextrema()[3]==(0,255)
 target=web/(j['key']+'.webp');im.save(target,lossless=True,exact=True,method=6)
 check=Image.open(target).convert('RGBA');a,b=im.tobytes(),check.tobytes();assert im.size==check.size and all(a[i:i+4]==b[i:i+4] for i in range(0,len(a),4) if a[i+3])
 assets[j['key']]={'url':'./art/sequence/level2-first-three/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox()),'nativePixelsExact':True,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(root/'content/level2-first-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-first-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
print('Preserved four native outputs and checked lossless pixels.')
