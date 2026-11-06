"""Save generated originals; register whole-body scales against established masters."""
from pathlib import Path
import json, shutil, hashlib
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
native=root/'art-samples/level2-last-three-native'
web=root/'preview/art/sequence/level2-last-three'
native.mkdir(parents=True,exist_ok=True);web.mkdir(parents=True,exist_ok=True)
plan=json.loads((root/'content/level2-last-three-jump-generation.json').read_text('utf-8'))
poses={};assets={};records=[]
for job in plan['jobs']:
    dst=native/(job['key']+'.png');shutil.copy2(job['source'],dst)
    im=Image.open(dst).convert('RGBA')
    if job['key']=='child-jump':
        key='jump-forward';source_collar=(557,250);scale=500/435
        offset=(768-source_collar[0]*scale,600-source_collar[1]*scale)
        im=im.transform((1536,2048),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
        collar=(768,600);rotation=0;attachments={'leftSole':{'x':round(389*scale+offset[0]),'y':round(1233*scale+offset[1])},'rightSole':{'x':round(685*scale+offset[0]),'y':round(1276*scale+offset[1])}}
        records.append({'id':key,'sourceCollar':source_collar,'uniformScale':scale,'offset':offset,'basis':'Master standing collar to sweater hem: 500 pixels; generated same anatomical span: 435 pixels. No head geometry or independent limb transforms.','sourceAnatomySpan':435,'masterAnatomySpan':500})
    elif job['key']=='child-sit-draw-active':
        key='sit-draw-active';source_collar=(510,298);scale=536/590
        offset=(768-source_collar[0]*scale,600-source_collar[1]*scale)
        im=im.transform((1536,1920),Image.Transform.AFFINE,(1/scale,0,-offset[0]/scale,0,1/scale,-offset[1]/scale),Image.Resampling.BICUBIC)
        collar=(768,600);rotation=-.04;attachments={'pencilTip':{'x':round(960*scale+offset[0]),'y':round(1304*scale+offset[1])}}
        records.append({'id':key,'sourceCollar':source_collar,'uniformScale':scale,'offset':offset,'basis':'Existing sit-draw collar to sweater hem: 536 pixels; generated span: 590 pixels. Original crossed-leg body matched by one uniform scale.','sourceAnatomySpan':590,'masterAnatomySpan':536})
    else:key=job['key']
    alpha=im.getchannel('A');bounds=alpha.point(lambda a:255 if a>8 else 0).getbbox()
    assert alpha.getextrema()[0]==0 and alpha.getextrema()[1]>=250
    target=web/(key+'.webp');im.save(target,lossless=True,exact=True,method=6)
    assert Image.open(target).convert('RGBA').tobytes()==im.tobytes()
    meta={'url':'./art/sequence/level2-last-three/'+target.name,'size':list(im.size),'bounds':list(bounds),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'nativePixelsExact':key=='white-rabbit-jump'}
    assets[key]=meta
    if key!='white-rabbit-jump':poses[key]={'id':key,'version':1,'model':'child-v1','bodyUrl':meta['url'],'collar':dict(zip(('x','y'),collar)),'bounds':dict(zip(('left','top','right','bottom'),bounds)),'headRotation':rotation,'attachments':attachments}
    job.update({'nativePath':str(dst),'webPath':str(target),'assetKey':key,'accepted':True,'size':list(im.size),'bounds':list(bounds)})
(root/'content/level2-last-three-pose-registration.json').write_text(json.dumps({'model':'child-v1','poses':poses,'registrations':records,'assets':assets,'headGeometryChanged':False},ensure_ascii=False,indent=2),'utf-8')
(root/'content/level2-last-three-jump-generation.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),'utf-8')
# At a common source-pixel density: this is QA, not a new image asset.
master=Image.open(root/'preview/art/family/child-body.webp').convert('RGBA')
sit=Image.open(root/'preview/art/sequence/books-16-20/child-sit-draw-v2.png').convert('RGBA')
ims=[(master,(501,225),'standing master'),(Image.open(web/'jump-forward.webp').convert('RGBA'),(768,600),'jump-forward'),(sit,(501,400),'sit-draw master'),(Image.open(web/'sit-draw-active.webp').convert('RGBA'),(768,600),'sit-draw-active')]
sheet=Image.new('RGB',(2000,850),'#faf6eb');d=ImageDraw.Draw(sheet)
for i,(im,col,label) in enumerate(ims):
    scale=.43;im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    origin=(round(i*500+250-col[0]*scale),round(120-col[1]*scale))
    sheet.paste(im,origin,im);d.text((i*500+20,20),label,fill='#263c30');d.line((i*500+20,120,i*500+480,120),fill='#b8baab',width=1)
out=root.parent/'output/level2-last-three-20261028';out.mkdir(parents=True,exist_ok=True);sheet.save(out/'new-pose-master-comparison.jpg',quality=94)
print(json.dumps({'poses':poses,'assets':assets},ensure_ascii=False))
