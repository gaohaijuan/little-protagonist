"""Copy native outputs and encode losslessly; no raster retouching or resizing."""
from pathlib import Path
from PIL import Image
import json,shutil,hashlib
root=Path(__file__).resolve().parents[1]
plan=json.loads((root/'content/local-eight-generation-jobs.json').read_text('utf-8'))
native=root/'art-samples/local-eight-native';web=root/'preview/art/sequence/local-eight'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
assets={}
for j in plan['jobs']:
    dst=native/(j['key']+'.png');shutil.copy2(j['source'],dst)
    im=Image.open(dst).convert('RGBA')
    if j.get('transparent'):assert im.getextrema()[3]==(0,255)
    target=web/(j['key']+'.webp');im.save(target,lossless=True,exact=True,method=6)
    check=Image.open(target).convert('RGBA');a=im.tobytes();b=check.tobytes()
    assert im.size==check.size and all(a[i:i+4]==b[i:i+4] for i in range(0,len(a),4) if a[i+3])
    assets[j['key']]={'url':'./art/sequence/local-eight/'+target.name,'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()),'nativePixelsExact':True,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(root/'content/local-eight-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),'utf-8')
(root/'miniprogram/lib/local-eight-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets)+';\n','utf-8')
print('Preserved 3 native assets; no new child body or head.')

