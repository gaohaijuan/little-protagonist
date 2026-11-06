"""Lossless encoding and provenance only: native pixels are not resized/redrawn."""
from pathlib import Path
import json, shutil, hashlib
from PIL import Image, ImageChops
root=Path(__file__).resolve().parents[1]
plan=json.loads((root/'content/priority-three-generation-jobs.json').read_text('utf-8'))
native=root/'art-samples/priority-three-native';target=root/'preview/art/sequence/priority-three'
native.mkdir(parents=True,exist_ok=True);target.mkdir(parents=True,exist_ok=True)
assets={}
for j in plan['jobs']:
    dst=native/(j['key']+'.png');shutil.copy2(Path(j['source']),dst)
    im=Image.open(dst).convert('RGBA')
    if j.get('transparent'): assert im.getextrema()[3]==(0,255)
    out=target/(j['key']+'.webp');im.save(out,lossless=True,exact=True,method=6)
    check=Image.open(out).convert('RGBA'); assert im.size==check.size
    # Lossless WebP preserves every visible RGBA pixel; alpha-zero RGB is irrelevant.
    assert im.getchannel('A').tobytes()==check.getchannel('A').tobytes()
    visible=im.getchannel('A').point(lambda a:255 if a else 0)
    a=im.tobytes();b=check.tobytes()
    assert all(a[i:i+4]==b[i:i+4] for i in range(0,len(a),4) if a[i+3])
    bounds=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
    assets[j['key']]={'url':'./art/sequence/priority-three/'+out.name,'size':list(im.size),'bounds':list(bounds),'nativePixelsExact':True,'boundsAlphaThreshold':8,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
assets.update({
 'revision-wagon':{'url':'./art/sequence/books-11-15/wagon.png','size':[1536,1024],'bounds':[109,41,1515,985],'existing':True},
 'revision-ball':{'url':'./art/sequence/books-11-15/red-ball.png','size':[1349,1166],'bounds':[243,162,1093,1001],'existing':True},
 'revision-room':{'url':'./art/sequence/first-ten/car-room-wide.webp','size':[1254,1254],'bounds':[0,0,1254,1254],'existing':True},
 'revision-wagon-room':{'url':'./art/sequence/books-14-16/wagon-side.webp','size':[1254,1254],'bounds':[0,0,1254,1254],'existing':True},
 'revision-wagon-overlook':{'url':'./art/sequence/books-14-16/wagon-loading.webp','size':[1254,1254],'bounds':[0,0,1254,1254],'existing':True}
})
(root/'content/priority-three-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2)+'\n','utf-8')
(root/'miniprogram/lib/priority-three-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets,ensure_ascii=False)+';\n','utf-8')
print('Preserved native pixels for',len(plan['jobs']),'new assets; reused 5 existing layers.')

