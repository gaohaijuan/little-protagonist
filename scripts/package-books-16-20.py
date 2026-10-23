import json,zipfile
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'output/books-16-20-native';qa=root/'output/qa/books-16-20-native';native=root/'art-samples/books-16-20-native'
for n in range(16,21):
    pages=sorted((out/str(n)).glob('page-*.png'))
    sheet=Image.new('RGB',(1000,760),'#e9e7da');d=ImageDraw.Draw(sheet)
    for i,p in enumerate(pages):
        im=Image.open(p).convert('RGB');im.thumbnail((242,344));x=(i%4)*250;y=(i//4)*380+24;sheet.paste(im,(x,y));d.text((x+6,y-18),f'{n} / {i+1}',fill='black')
    sheet.save(qa/f'contact-{n}.jpg',quality=92)
if (qa/'results.json').exists() and json.loads((qa/'results.json').read_text())['passed']:
    archive=out/'第16—20本-插画样稿.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
        for p in out.rglob('*.png'):
            if not p.name.startswith('art-'):z.write(p,p.relative_to(out))
        z.write(out/'manifest.json','manifest.json')
        provenance=json.loads((native/'generation-complete.json').read_text(encoding='utf-8'))
        for a in provenance['assets']:
            if a['accepted']:z.write(native/(a['name']+'.png'),'native/'+a['name']+'.png')
        z.writestr('native/generation.json',json.dumps({'mode':provenance['mode'],'assets':[{k:v for k,v in a.items() if k not in ['path','ref']} for a in provenance['assets'] if a['accepted']]},ensure_ascii=False,indent=2))
    print(f'{archive}: {archive.stat().st_size/1024/1024:.1f} MiB')
