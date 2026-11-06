"""Archive native imagegen pixels and encode losslessly; no image editing."""
import json, shutil
from pathlib import Path
from PIL import Image, ImageChops
root=Path(__file__).resolve().parents[1]
source=root/'art-samples/first-ten-native'
target=root/'preview/art/sequence/first-ten'
source.mkdir(exist_ok=True,parents=True)
target.mkdir(exist_ok=True,parents=True)
records=json.loads((root/'content/first-ten-art-provenance.json').read_text(encoding='utf-8'))['assets']
report=[]
for record in records:
    if not record['selected']: continue
    native=source/(record['id']+'.png')
    if not native.exists(): shutil.copyfile(record['path'],native)
    im=Image.open(native).convert('RGBA')
    out=target/(record['id']+'.webp')
    im.save(out,'WEBP',lossless=True,quality=100,method=6,exact=True)
    encoded=Image.open(out).convert('RGBA')
    assert encoded.size==im.size
    diff=ImageChops.difference(im,encoded)
    assert diff.getchannel('A').getbbox() is None
    for band in diff.split()[:3]:
        assert ImageChops.multiply(band,im.getchannel('A').point(lambda a:255 if a else 0)).getbbox() is None
    report.append({'id':record['id'],'file':str(out.relative_to(root)).replace('\\','/'),'nativePixels':im.size,'alphaExtrema':im.getchannel('A').getextrema(),'visiblePixelsExact':True})
(root/'content/first-ten-art-encoding.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'assets':len(report),'nativePixelsUnchanged':True}))
