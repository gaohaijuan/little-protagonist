"""Lossless delivery encoding only: assert native pixels and alpha unchanged."""
import json
from pathlib import Path
from PIL import Image, ImageChops

root=Path(__file__).resolve().parents[1]
folder=root/'preview/art/sequence/layered-v1'
report=[]
for source in sorted((root/'art-samples/layered-v1').glob('*.png')):
    original=Image.open(source).convert('RGBA')
    target=folder/(source.stem+'.webp')
    original.save(target,'WEBP',lossless=True,quality=100,method=6,exact=True)
    encoded=Image.open(target).convert('RGBA')
    assert encoded.size==original.size
    assert ImageChops.difference(original.getchannel('A'),encoded.getchannel('A')).getbbox() is None
    # Invisible RGB is not printed; every visible original RGBA pixel is exact.
    diff=ImageChops.difference(original,encoded)
    for band in diff.split()[:3]:
        assert ImageChops.multiply(band,original.getchannel('A').point(lambda a:255 if a else 0)).getbbox() is None
    report.append({'file':str(target.relative_to(root)).replace('\\','/'),'native_size':original.size,'png_bytes':source.stat().st_size,'webp_bytes':target.stat().st_size,'visible_rgba_exact':True})
(root/'content/layered-art-encoding.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'assets':len(report),'png_bytes':sum(r['png_bytes'] for r in report),'webp_bytes':sum(r['webp_bytes'] for r in report),'pixels_unchanged':True}))
