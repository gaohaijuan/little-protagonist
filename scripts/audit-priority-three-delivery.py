from pathlib import Path
import json,hashlib,math
from PIL import Image,ImageOps
root=Path(__file__).resolve().parents[1];out=root.parent/'output/priority-three-20261026';qa=out/'qa'
browser=json.loads((out/'browser-render-qa.json').read_text('utf-8'))
edition=json.loads((root/'content/level1-priority-three.json').read_text('utf-8'))
pageCounts={b['id']:len(b['pages']) for b in edition['books']}
assets=json.loads((root/'content/priority-three-assets.json').read_text('utf-8'))
native=[]
for r in browser['records']:
    if not 0<=r['page']<pageCounts[r['id']]:continue
    scene=r['canvas']['scene'];a=assets[scene];v=json.loads(r['canvas']['camera'])
    ppi=min(a['size'][0]*v['width']/1000/(128/25.4),a['size'][1]*v['height']/1000/(131/25.4))
    native.append({'book':r['id'],'page':r['page']+1,'background':scene,'effectivePpi':round(ppi,1)})
minimum=min(p['effectivePpi'] for p in native);assert minimum>240
(out/'native-resolution-audit.json').write_text(json.dumps({'minimumEffectivePpi':minimum,'note':'Full native close-up replaces the former149ppi crop; encoding300ppi does not create300ppi source detail.','records':native},ensure_ascii=False,indent=2),'utf-8')
p=out/'a5-pdf-qa.json';data=json.loads(p.read_text('utf-8'));data['qualityNote']='原生背景1254x1254，A5插图128x131mm下约243ppi；PDF采用JPEG97编码，无插值放大，原始无损素材保留。RGB电子校样，未经实物打印。';p.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf-8')
pdf=Path(data['file']);provenance=json.loads((root/'content/priority-three-generation-jobs.json').read_text('utf-8'))
report={'status':'three-revised-books-complete-for-review','books':[{'number':2,'title':'下雪了','bodyPages':5},{'number':8,'title':'小虫在哪','bodyPages':6},{'number':10,'title':'小球在哪','bodyPages':6}],'approvedWordingChanged':False,'otherStoriesModified':False,'browserUrl':'http://127.0.0.1:4173/?view=priority-three','mainShelf':'原书架保留；顶部新增新版三篇入口。未将其余12篇误标为已迁移。','pdf':{'path':str(pdf),'bytes':pdf.stat().st_size,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'pages':23,'bodyPages':17,'blankPages':0,'chapterStartPages':[3,9,16],'ChineseFontEmbedded':True},'illustrations':{'mode':'built-in-imagegen','imageApiUsed':False,'newAssets':len(provenance['jobs']),'nativeDirectory':str(root/'art-samples/priority-three-native'),'webDirectory':str(root/'preview/art/sequence/priority-three'),'promptsAndProvenance':str(root/'content/priority-three-generation-jobs.json'),'existingCharactersRedrawn':False,'newCharacterPoses':0,'nativeMinimumEffectivePpi':minimum},'checks':['17页正文逐字匹配用户定稿；仅合并第10篇前两段到一页','浏览器MCP逐页翻阅三篇，返回原书架并从新版入口再进入','软件渲染检查封面、正文、小结及390px手机布局','跨动作头像归一化比例一致，透明完整人物缓存复用','小虫脚面连接修正并视觉复查；揭晓前不在画面脚上露出','小车里、前、后均无球，门后揭晓后拿起同一小球','实际PDF23页均渲染核查，图文同页、无空白、目录指向3/9/16页、中文可提取且字体嵌入'],'characterScope':'当前MCP及PDF为原有默认人物。本机没有已保存的真人头像；预览会读取本机合法头像并走相同人物合成流程，未上传照片。','physicalPrintPerformed':False}
(out/'完成与检查记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
files=sorted(qa.glob('a5-*.png'));assert len(files)==23
for start in range(0,23,8):
    sheet=Image.new('RGB',(1240,890),(235,235,225))
    for i,f in enumerate(files[start:start+8]):sheet.paste(ImageOps.contain(Image.open(f).convert('RGB'),(296,420)),((i%4)*310+7,(i//4)*445+18))
    sheet.save(qa/('pdf-contact-'+str(start//8+1)+'.jpg'))
print('Final proof:23 pages; minimum background effectiveppi',minimum,'; PDF MB',round(pdf.stat().st_size/1000000,1))
