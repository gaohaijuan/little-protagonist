import json,shutil,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
src=root/'art-samples/books-16-20-storyboards-v2'
dest=root/'preview/art/sequence/books-16-20-storyboards-v2';dest.mkdir(parents=True,exist_ok=True)
qa=root/'output/qa/books-16-20-storyboards-v2';qa.mkdir(parents=True,exist_ok=True)
selected=['sit-shoo','crouch-book','barefoot-step','run-left-clean','run-right-v2']
rows=[]
for f in sorted(src.glob('*.json')):
    a=json.loads(f.read_text(encoding='utf-8'))
    if not a.get('path') or 'correction' in f.stem:continue
    correction=src/(f.stem+'-correction.json')
    if correction.exists():a['correction']=json.loads(correction.read_text(encoding='utf-8'))
    p=src/(f.stem+'.png')
    if not p.exists():shutil.copy2(a['path'],p)
    im=Image.open(p).convert('RGBA');alpha=im.getchannel('A');b=alpha.point(lambda x:255 if x>32 else 0).getbbox()
    accepted=f.stem.startswith('b') and '-p' in f.stem or f.stem in selected
    a.update(nativeSize=list(im.size),bounds=list(b),alphaRange=list(alpha.getextrema()),accepted=accepted,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
    f.write_text(json.dumps(a,ensure_ascii=False,indent=2),encoding='utf-8')
    if accepted:shutil.copy2(p,dest/p.name);rows.append(a)
(dest/'assets.json').write_text(json.dumps({a.get('id',a.get('name')):{'size':a['nativeSize'],'bounds':a['bounds']} for a in rows},indent=2),encoding='utf-8')
names=['master']+selected
sheet=Image.new('RGB',(260*len(names),850),'#fbf6e9');d=ImageDraw.Draw(sheet)
for i,n in enumerate(names):
    p=root/'art-samples/my-family-production/child-body.png' if n=='master' else src/(n+'.png')
    im=Image.open(p).convert('RGBA');im.thumbnail((250,768));sheet.paste(im,(i*260,50),im);d.text((i*260+5,15),n,fill='black')
    for y in [225,730,955,1403]:d.line((i*260,50+y*.5,(i+1)*260,50+y*.5),fill='#b8bcbb',width=1)
sheet.save(qa/'pose-master-comparison.jpg',quality=94)
(src/'assets-audit.json').write_text(json.dumps({'assets':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'name':a.get('id',a.get('name')),'size':a['nativeSize'],'bounds':a['bounds']} for a in rows]))
