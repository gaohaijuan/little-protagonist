import json,shutil
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];source=root/'art-samples/books-16-20-native';dest=root/'preview/art/sequence/books-16-20';dest.mkdir(parents=True,exist_ok=True)
data=json.loads((source/'generation-complete.json').read_text(encoding='utf-8'))
for f in source.glob('*.json'):
    item=json.loads(f.read_text(encoding='utf-8'))
    if 'name' in item and 'path' in item and not any(a['name']==item['name'] for a in data['assets']):data['assets'].append(item)
rejected={'child-sit-read','child-barefoot','child-sit-draw','cat-sleep'};rows=[]
for a in data['assets']:
    target=source/(a['name']+'.png')
    if not target.exists():shutil.copy2(a['path'],target)
    im=Image.open(target).convert('RGBA');alpha=im.getchannel('A');a['nativeSize']=list(im.size);a['bounds']=list(alpha.point(lambda x:255 if x>32 else 0).getbbox());a['alphaRange']=list(alpha.getextrema());a['accepted']=a['name'] not in rejected
    if a['accepted']:shutil.copy2(target,dest/target.name);rows.append(a)
(source/'generation-complete.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
metadata={a['name']:{'size':a['nativeSize'],'bounds':a['bounds']} for a in rows}
for key,file in [('cat','preview/art/sequence/books-06-10/cat.png'),('pebble','preview/art/sequence/books-06-10/pebble.png')]:
    im=Image.open(root/file).convert('RGBA');metadata[key]={'size':list(im.size),'bounds':list(im.getchannel('A').point(lambda x:255 if x>32 else 0).getbbox())}
(dest/'assets.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
qa=root/'output/qa/books-16-20-native';qa.mkdir(parents=True,exist_ok=True)
names=['child-body']+[a['name'] for a in rows if a['name'].startswith('child-')]
sheet=Image.new('RGB',(250*len(names),820),'#fbf6e9');d=ImageDraw.Draw(sheet)
for i,name in enumerate(names):
    f=root/'art-samples/my-family-production/child-body.png' if name=='child-body' else source/(name+'.png');im=Image.open(f).convert('RGBA');im.thumbnail((245,735));sheet.paste(im,(i*250,50),im);d.text((i*250+5,15),name,fill='black')
sheet.save(qa/'pose-master-comparison.jpg',quality=94)
print(json.dumps([{'name':a['name'],'size':a['nativeSize'],'bounds':a['bounds']} for a in rows]))
