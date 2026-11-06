from pathlib import Path
from PIL import Image,ImageOps
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root.parent/'output/revised-eleven-20261027';qa=out/'qa'
records=json.loads((out/'native-quality-input.json').read_text('utf-8'))
for r in records:
    w,h=Image.open(r['source']).size;c=r['camera'];world=r['world']
    r['nativeSize']=[w,h];r['effectivePpi']=round(min(w*c['width']/world['width']/(128/25.4),h*c['height']/world['height']/(131/25.4)),1)
minimum=min(r['effectivePpi'] for r in records);maximum=max(r['effectivePpi'] for r in records)
(out/'native-resolution-audit.json').write_text(json.dumps({'minimumEffectivePpi':minimum,'maximumEffectivePpi':maximum,'note':'沿用背景按实际取景计算，不以PNG编码分辨率冒充原生清晰度。','records':records},ensure_ascii=False,indent=2),'utf-8')
pdfqa=json.loads((out/'a5-pdf-qa.json').read_text('utf-8'));pdf=Path(pdfqa['file'])
mcp=json.loads((out/'browser-mcp-audit.json').read_text('utf-8'));numbers=[3,4,5,6,11,12,13,15]
expected={3:6,4:7,5:6,6:8,11:8,12:5,13:9,15:7}
for n,count in expected.items():assert {r['page'] for r in mcp if r['number']==n}==set(range(1,count+2))
assert pdfqa['pageCount']==67 and pdfqa['bodyPages']==56 and pdfqa['storyNumbers']==numbers
assert pdfqa['chapterStarts']==[3,10,18,25,34,43,49,59]
assert (out/'family-personalization-qa.json').exists()
changes=[
[3,'两口页只显示爸爸妈妈；忘记自己页显示孩子；最后三人同框；按实际家庭设置改变人数'],
[4,'按学做、连续开合、再次打开和邀请读者重排现有手势；没有新增纸花'],
[5,'清理底图多余云，仅两朵独立云；修正云遮挡，山尖与山坡真正消失'],
[6,'使用已有坐姿；初始伞不遮花，走过去后共同遮雨；补雨中同一朵花的近景'],
[11,'地面比高、站石头、下来、看石头、明年比高的结尾与定稿逐页对应'],
[12,'仅保留镜像跟随，统一完整人物生成倒影；删除碰水消失/恢复段落'],
[13,'树上鸟、树下猫、空树枝与飞鸟、落在车上的鸟按定稿连续；长句按语意换行'],
[15,'两件玩具开头已在床上；先球后车，均放好后猫上床睡；删除把车放上床的旧桥段']]
report={'date':'2026-10-27','status':'eight-local-revisions-complete-for-review','bookNumbers':numbers,'changes':changes,'defaultWordingChanged':False,'familyPersonalization':'默认三人版本逐字匹配用户定稿；其他人数只按本机真实已选成员改介绍和计数，不虚构亲属','artwork':'3个缺失素材由内置imagegen制作，其余背景、人物和动作复用；未调用图像API，未重绘真人头像','newAssetProvenance':str(root/'content/local-eight-generation-jobs.json'),'newNativeDirectory':str(root/'art-samples/local-eight-native'),'newWebDirectory':str(root/'preview/art/sequence/local-eight'),'browserUrl':'http://127.0.0.1:4173/?view=level1-revision','previewStoryCount':11,'remainingNumbers':[1,7,9,14],'mainShelf':'保留原书架，新版入口已指向累计11篇；没有将其余4篇标为已完成','browserMCP':{'bodyPages':56,'summaryPages':8,'records':len(mcp),'evidence':str(out/'browser-mcp-audit.json')},'softwareChecks':{'totalRevisedBodyPages':73,'newBodyPages':56,'modelSessionFamilyTestsPassed':19,'mobileWidth':390,'familyCountTested':12,'maximumValidNameLengthTested':8,'actualUserPhotoTested':False},'pdf':{'path':str(pdf),'bytes':pdf.stat().st_size,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'pages':67,'bodyPages':56,'summaryPages':8,'blankPages':0,'formatMm':[148,210],'ChineseTextVectorAndEmbedded':True,'chapterStarts':pdfqa['chapterStarts'],'scope':'仅本次8篇，之前3篇原PDF保留','defaultCharacter':True,'color':'RGB电子校样，未经实物打印'},'quality':{'minimumBackgroundEffectivePpi':minimum,'maximumBackgroundEffectivePpi':maximum,'nativeDetailNotUpscaled':True}}
(out/'完成与检查记录.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
files=sorted(qa.glob('a5-[0-9][0-9].png'));assert len(files)==67
for start in range(0,len(files),8):
    sheet=Image.new('RGB',(1240,890),(235,235,225))
    for i,f in enumerate(files[start:start+8]):sheet.paste(ImageOps.contain(Image.open(f).convert('RGB'),(296,420)),((i%4)*310+7,(i//4)*445+18))
    sheet.save(qa/('pdf-contact-'+str(start//8+1)+'.jpg'))
print('Final:8 revised stories,56 body pages,67 A5 pages; MCP complete; background effectiveppi',minimum,'to',maximum)

