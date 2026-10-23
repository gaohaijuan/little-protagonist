import json, shutil
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
source=root/'art-samples/books-11-15-native'
dest=root/'preview/art/sequence/books-11-15'
dest.mkdir(parents=True,exist_ok=True)
data=json.loads((source/'generation-complete.json').read_text(encoding='utf-8'))
extra=source/'generation-extra.json'
if extra.exists():
    item=json.loads(extra.read_text(encoding='utf-8'))
    if not any(a['name']==item['name'] for a in data['assets']): data['assets'].append(item)
rejected={'child-carry','child-crouch-palm','playroom'}
rows=[]
for a in data['assets']:
    target=source/(a['name']+'.png')
    if not target.exists(): shutil.copy2(a['path'],target)
    im=Image.open(target).convert('RGBA')
    alpha=im.getchannel('A'); bbox=alpha.point(lambda x:255 if x>32 else 0).getbbox()
    a['nativeSize']=list(im.size);a['bounds']=list(bbox);a['accepted']=a['name'] not in rejected
    a['alphaRange']=list(alpha.getextrema())
    if a['accepted']:
        shutil.copy2(target,dest/target.name)
        rows.append(a)
(source/'generation-complete.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(dest/'assets.json').write_text(json.dumps({a['name']:{'size':a['nativeSize'],'bounds':a['bounds']} for a in rows},indent=2),encoding='utf-8')
qa=root/'output/qa/books-11-15-native';qa.mkdir(parents=True,exist_ok=True)
names=['child-body','child-push','child-carry-v2','child-crouch-palm-v2']
sheet=Image.new('RGB',(1024,900),'#fbf6e9');d=ImageDraw.Draw(sheet)
for i,name in enumerate(names):
    path=root/'art-samples/my-family-production/child-body.png' if i==0 else source/(name+'.png')
    im=Image.open(path).convert('RGBA');im.thumbnail((250,750));sheet.paste(im,(i*256,55),im)
    d.text((i*256+5,15),name,fill='black')
sheet.save(qa/'pose-master-comparison.jpg')
im=Image.open(source/'child-crouch-palm-v2.png').convert('RGBA')
crop=Image.new('RGBA',im.size,'#fbf6e9');crop.alpha_composite(im);d=ImageDraw.Draw(crop)
for x in range(0,1024,100): d.line((x,0,x,1536),fill='#b9b7a2');d.text((x,240),str(x),fill='black')
for y in range(0,1536,100): d.line((0,y,1024,y),fill='#b9b7a2');d.text((5,y),str(y),fill='black')
crop.convert('RGB').save(qa/'crouch-grid.jpg')
print(json.dumps([{'name':a['name'],'size':a['nativeSize'],'bounds':a['bounds'],'alpha':a['alphaRange']} for a in rows]))
