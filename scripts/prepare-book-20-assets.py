"""Copy native PNG outputs without raster modification; measure alpha only."""
import json,shutil
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'content/book-20-art-provenance.json').read_text(encoding='utf8'))
extra=json.loads((root/'content/book-20-final-prompts.json').read_text(encoding='utf8'))
records=list({r['id']:r for r in manifest['assets']+extra}.values())
manifest['assets']=records
(root/'content/book-20-art-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
native=root/'art-samples/book-20-native';dest=root/'preview/art/sequence/book-20'
native.mkdir(parents=True,exist_ok=True);dest.mkdir(parents=True,exist_ok=True)
assets={}
for r in records:
    a=native/(r['id']+'.png');b=dest/a.name
    if not a.exists():shutil.copyfile(r['generated'],a)
    if not b.exists():shutil.copyfile(a,b)
    assert a.read_bytes()==b.read_bytes()
    im=Image.open(b).convert('RGBA')
    assets[r['id']]={'url':'./art/sequence/book-20/'+b.name,'size':im.size,'bounds':im.getchannel('A').point(lambda x:255 if x>16 else 0).getbbox(),'nativePixelsExact':True}
for key,name in {'sleep-pet-bed':'books-17-19/pet-bed.webp','sleep-cat':'books-16-20/cat-sleep-v2.png','sleep-shoes':'books-16-20/adult-shoes.png','sleep-car':'first-ten/toy-car.webp'}.items():
    im=Image.open(root/'preview/art/sequence'/name).convert('RGBA')
    assets[key]={'url':'./art/sequence/'+name,'size':im.size,'bounds':im.getchannel('A').point(lambda x:255 if x>16 else 0).getbbox(),'existing':True}
(root/'content/book-20-art-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf8')
(root/'miniprogram/lib/book-20-assets.js').write_text("'use strict';\nmodule.exports="+json.dumps(assets,ensure_ascii=False)+';\n',encoding='utf8')
print(json.dumps({'nativeCopies':len(records),'reused':4,'pixelExact':True}))
