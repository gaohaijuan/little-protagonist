"""Archive native generation and verify lossless delivery. Measure alpha only."""
import json,shutil
from pathlib import Path
from PIL import Image,ImageChops
root=Path(__file__).resolve().parents[1]
source=root/'art-samples/books-11-13-native';target=root/'preview/art/sequence/books-11-13'
source.mkdir(exist_ok=True,parents=True);target.mkdir(exist_ok=True,parents=True)
records=json.loads((root/'content/books-11-13-art-provenance.json').read_text(encoding='utf-8'))['assets']
assets={}
for record in records:
 native=source/(record['id']+'.png')
 if not native.exists():shutil.copyfile(record['generated'],native)
 im=Image.open(native).convert('RGBA');out=target/(record['id']+'.webp')
 im.save(out,'WEBP',lossless=True,quality=100,method=6,exact=True)
 encoded=Image.open(out).convert('RGBA');assert im.size==encoded.size
 diff=ImageChops.difference(im,encoded);assert diff.getchannel('A').getbbox() is None
 for band in diff.split()[:3]:
  assert ImageChops.multiply(band,im.getchannel('A').point(lambda a:255 if a else 0)).getbbox() is None
 assets[record['id']]={'url':'./'+str(out.relative_to(root/'preview')).replace('\\','/'),'size':im.size,'bounds':im.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox(),'nativePixelsExact':True}
existing={'tree-sapling':'books-11-15/sapling.png','tree-step':'books-11-15/step-stone.png','tree-comparison':'books-11-15/play-courtyard.png','call-bird':'books-06-10/bird.png','call-quiet-bird':'books-06-10/bird-quiet.png','call-cat':'books-06-10/cat.png','call-car':'first-ten/toy-car.webp','cat-red':'books-11-15/red-ball.png','cat-yellow':'books-11-15/yellow-ball.png'}
for key,name in existing.items():
 path=root/'preview/art/sequence'/name;im=Image.open(path).convert('RGBA')
 assets[key]={'url':'./art/sequence/'+name,'size':im.size,'bounds':im.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox(),'existing':True}
(root/'content/books-11-13-art-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'miniprogram/lib/books-11-13-assets.js').write_text("'use strict';\n// Generated native-pixel metadata; no raster editing.\nmodule.exports="+json.dumps(assets,ensure_ascii=False)+";\n",encoding='utf-8')
print(json.dumps({'generated':len(records),'reused':len(existing),'lossless':True}))
