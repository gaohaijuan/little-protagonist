"""Archive native generation and verify lossless delivery. Measure alpha only."""
import json,shutil
from pathlib import Path
from PIL import Image,ImageChops
root=Path(__file__).resolve().parents[1]
source=root/'art-samples/books-14-16-native';target=root/'preview/art/sequence/books-14-16'
source.mkdir(exist_ok=True,parents=True);target.mkdir(exist_ok=True,parents=True)
records=json.loads((root/'content/books-14-16-art-provenance.json').read_text(encoding='utf-8'))['assets']
assets={}
for record in records:
 native=source/(record['id']+'.png')
 if not native.exists():shutil.copyfile(record['generated'],native)
 im=Image.open(native).convert('RGBA');out=target/(record['id']+'.webp')
 if not out.exists():im.save(out,'WEBP',lossless=True,quality=100,method=6,exact=True)
 encoded=Image.open(out).convert('RGBA');assert im.size==encoded.size
 diff=ImageChops.difference(im,encoded);assert diff.getchannel('A').getbbox() is None
 for band in diff.split()[:3]:
  assert ImageChops.multiply(band,im.getchannel('A').point(lambda a:255 if a else 0)).getbbox() is None
 assets[record['id']]={'url':'./'+str(out.relative_to(root/'preview')).replace('\\','/'),'size':im.size,'bounds':im.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox(),'nativePixelsExact':True}
existing={'shoes-bench': 'books-16-20-storyboards-v2/b18-p07.png', 'shoes-comparison': 'books-16-20-storyboards-v2/b18-p03.png', 'shoes-try': 'books-16-20-storyboards-v2/b18-p04.png', 'shoes-out': 'books-16-20-storyboards-v2/b18-p06.png', 'shoes-end': 'books-16-20-storyboards-v2/b18-p08.png', 'water-greet': 'books-16-20-storyboards-v2/b19-p01.png', 'water-pour-scene': 'books-16-20-storyboards-v2/b19-p02.png', 'water-drops': 'books-16-20-storyboards-v2/b19-p03.png', 'water-runoff': 'books-16-20-storyboards-v2/b19-p04.png', 'water-feet': 'books-16-20-storyboards-v2/b19-p06.png', 'water-end': 'books-16-20-storyboards-v2/b19-p07.png', 'large-shoes': 'books-16-20/adult-shoes.png', 'pour-can': 'books-16-20/watering-can.png', 'push-wagon': 'books-11-15/wagon.png', 'wagon-ball': 'books-11-15/red-ball.png'}
for key,name in existing.items():
 path=root/'preview/art/sequence'/name;im=Image.open(path).convert('RGBA')
 assets[key]={'url':'./art/sequence/'+name,'size':im.size,'bounds':im.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox(),'existing':True}
(root/'content/books-14-16-art-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'miniprogram/lib/books-14-16-assets.js').write_text("'use strict';\n// Generated native-pixel metadata; no raster editing.\nmodule.exports="+json.dumps(assets,ensure_ascii=False)+";\n",encoding='utf-8')
print(json.dumps({'generated':len(records),'reused':len(existing),'lossless':True}))
