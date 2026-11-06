"""Preserve native illustrations and encode a lossless runtime copy."""
from pathlib import Path
from PIL import Image
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1]
p=root/'content/level2-next-three-generation-jobs.json';plan=json.loads(p.read_text('utf-8'))
native=root/'art-samples/level2-next-three-native';web=root/'preview/art/sequence/level2-next-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True);assets={}
for j in plan['jobs']:
 dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst);im=Image.open(dst).convert('RGBA');target=web/(j['key']+'.webp');im.save(target,lossless=True,exact=True,method=6)
 assert Image.open(target).convert('RGBA').tobytes()==im.tobytes()
 assets[j['key']]={'url':'./art/sequence/level2-next-three/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').getbbox()),'nativePixelsExact':True,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 j.update(savedNativePath=str(dst),savedWebPath=str(target))
for key,url in {'warm-water-cup':'books-16-20/water-cup.png','warm-water-hand':'action-fixes/pov-search-hand.webp'}.items():
 im=Image.open(root/'preview/art/sequence'/url).convert('RGBA');assets[key]={'url':'./art/sequence/'+url,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda x:255 if x>8 else 0).getbbox()),'reused':True}
(root/'content/level2-next-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/level2-next-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
p.write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
print('3 native scenes preserved; existing cup and pointing hand reused.')
