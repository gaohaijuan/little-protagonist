import json,zipfile,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
root=Path(__file__).resolve().parents[1];out=root/'output/books-16-20-storyboards-v2';qa=root/'output/qa/books-16-20-storyboards-v2';src=root/'art-samples/books-16-20-storyboards-v2'
audit=[]
for n in range(16,21):
    pages=sorted((out/str(n)).glob('page-*.png'));sheet=Image.new('RGB',(1200,930),'#e9e7da');d=ImageDraw.Draw(sheet)
    previous=None
    for i,p in enumerate(pages):
        im=Image.open(p).convert('RGB');im.thumbnail((292,415));x=(i%4)*300;y=(i//4)*465+25;sheet.paste(im,(x,y));d.text((x+8,y-18),f'{n} / {i+1}',fill='black')
        native=src/f'b{n}-p{i+1:02}.png';arr=np.asarray(Image.open(native).convert('RGB').resize((160,160)),dtype=float)
        audit.append({'book':n,'page':i+1,'sha256':hashlib.sha256(native.read_bytes()).hexdigest(),'neighborMeanAbsoluteDifference':None if previous is None else round(float(np.abs(arr-previous).mean()),2)});previous=arr
    sheet.save(qa/f'contact-{n}.jpg',quality=94)
assert len(audit)==38 and len({a['sha256'] for a in audit})==38
assert min(a['neighborMeanAbsoluteDifference'] for a in audit if a['neighborMeanAbsoluteDifference'] is not None)>12
(qa/'scene-distinctness.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
if json.loads((qa/'results.json').read_text())['passed']:
    archive=out/'第16—20本-逐页分镜重绘样稿.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
        for p in out.rglob('*.png'):
            if not p.name.startswith('art-'):z.write(p,p.relative_to(out))
        z.write(out/'manifest.json','manifest.json')
        for a in audit:z.write(src/f'b{a["book"]}-p{a["page"]:02}.png',f'native/b{a["book"]}-p{a["page"]:02}.png')
        generation=json.loads((src/'assets-audit.json').read_text(encoding='utf-8'))
        z.writestr('native/generation.json',json.dumps({'method':'Built-in image generation; original native pixels, no upscaling','printCertified':False,'assets':[{k:v for k,v in a.items() if k not in ['path','refs']} for a in generation['assets']]},ensure_ascii=False,indent=2))
    print(f'{archive}: {archive.stat().st_size/1024/1024:.1f} MiB; 38 unique native scene plates, minimum neighbor difference '+str(min(a['neighborMeanAbsoluteDifference'] for a in audit if a['neighborMeanAbsoluteDifference'] is not None)))
