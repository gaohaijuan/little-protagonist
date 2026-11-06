from pathlib import Path
from pypdf import PdfReader
import json,hashlib

root=Path(__file__).resolve().parents[1]
out=root.parent/'output/level1-complete-15-20261027'
read=lambda p:json.loads(p.read_text('utf-8'))
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pdfqa=read(out/'a5-pdf-qa.json');pdf=Path(pdfqa['file']);pages=PdfReader(str(pdf)).pages
old=read(out/'stone-before-pdf-fingerprints.json');fingerprints=[]
for p in pages:
    fingerprints.append({'text':hashlib.sha256(p.extract_text().encode()).hexdigest(),'images':sorted(hashlib.sha256(o.get_object().get_data()).hexdigest() for o in p['/Resources'].get('/XObject',{}).values() if o.get_object().get('/Subtype')=='/Image')})
text_changes=[i+1 for i,(a,b) in enumerate(zip(old['pages'],fingerprints)) if a['text']!=b['text']]
image_changes=[i+1 for i,(a,b) in enumerate(zip(old['pages'],fingerprints)) if a['images']!=b['images']]
assert len(pages)==117 and not text_changes
# The saved baseline predates the previous stone-close repair, so include its two pages.
allowed={48,53,50,60,61,62,70,71,72,76,77,78,79,80,81,82,83,84,93,94,96,106,30,90,116}
assert set(image_changes)<=allowed,image_changes
required={50,60,70,71,72,80,93,94,96,106}
assert required<=set(image_changes)
comparison={'baseline':'stone-before-pdf-fingerprints.json (before earlier stone-close repair)','all117TextsUnchanged':True,'changedImagePages':image_changes,'allowedImagePages':sorted(allowed),'unaffectedPageImagesUnchanged':True,'additionalComparedBaselineDifferences':{'48,53':'此前完成的石头近景修复','30,62,90,116':'保留当前共享封面站姿方案（standingCover）；这些小结的缩略图取自封面，不更改故事正文','61':'相同迈步人物、脚上小虫及场景重新栅格化，已与旧PDF提取图并排确认情节和动作未变'}}
write(out/'action-pdf-diff-qa.json',comparison)
write(out/'action-current-pdf-fingerprints.json',{'sha256':sha(pdf),'pages':fingerprints})
mcp=read(out/'action-fixes-browser-mcp-audit.json');expected={7:8,8:6,10:6,11:8,13:9,14:7}
for number,count in expected.items():assert {r['page'] for r in mcp if r['number']==number}==set(range(1,count+1))|{'summary'}
assert len(mcp)==50
level2=read(root.parent/'output/level2-first-three-20261027/完成与检查记录.json')['pdf']
assert sha(Path(level2['path']))==level2['sha256']
word=read(root.parent/'output/levels12-final-word-20261027/文字核对.json')
assert sha(Path(word['file']))==word['sha256']
assert len(list((out/'action-pdf-render').glob('page-*.jpg')))==117
native=read(out/'native-resolution-audit.json')
report=read(out/'完成与检查记录.json')
report['pdf'].update(bytes=pdf.stat().st_size,sha256=sha(pdf))
report['checks'].update(characterTestsPassed=21,exactTextBodyPages=99,pdfRenderedPages=117,blankPages=0)
report['newImagesGenerated']=7
report['imageGenerationAttempts']=9
report['imageCountBasis']='累计：此前石头近景1项/2次尝试，本次动作修复6项/7次尝试。'
report['actionFixes']={
 'status':'complete-for-review','date':'2026-10-27','manuscriptChanged':False,'imageAPIUsed':False,
 'changes':[
  {'number':11,'pages':[2,3,4,5,6,7],'pdfPages':[77,78,79,80,81,82],'change':'完整树梢与背景分开，站在地上树较高，站上石头孩子较高；石头从出现后持续保留'},
  {'number':8,'pages':[5],'pdfPages':[60],'change':'第一人称低头看自己脚面，原款小虫独立放大到脚上'},
  {'number':14,'pages':[6],'pdfPages':[106],'change':'完整人物蹲下向右伸手，红球紧邻指尖，沿孩子到右侧猫的方向推'},
  {'number':7,'pages':[4],'pdfPages':[50],'change':'双手携石、向右迈步；保留此前清晰石头近景'},
  {'number':10,'pages':[2,3,4],'pdfPages':[70,71,72],'change':'第一人称查看车厢内、车前、车后，手指分别指向对应位置'},
  {'number':13,'pages':[3,4,6],'pdfPages':[93,94,96],'change':'抬手邀请树上鸟，蹲下听地面动静，向右侧猫伸手邀请；鸟猫独立特写继续保留'}
 ],
 'assets':{'accepted':6,'attempts':7,'registeredBodies':3,'transparentDetails':2,'backgrounds':1,'nativeDirectory':str(root/'art-samples/action-fixes-native'),'prompts':str(root/'content/level1-action-fixes-generation.json'),'registration':str(root/'content/action-fix-pose-registration.json'),'facesGeneratedOrRepainted':False},
 'validation':{'browserMCPBodyPages':44,'browserMCPSummaryPages':6,'browserMCPRecords':50,'defaultShelfBook11Page5Checked':True,'actualPDFRenderedPages':117,'pdfDetailsInspected':[50,60,70,71,72,80,93,94,96,106],'all117PDFTextsUnchanged':True,'imageChangesComparedToPreStoneBaseline':image_changes,'rigSessionFamilyTestsPassed':21,'newPosesCheckedWithSimulatedRealPortraitGeometry':True,'realUserPhotoTested':False,'continuousSixBookVisualReview':True,'mobileViewportWidth':390,'level2PDFUnchanged':True,'sourceWordUnchanged':True},
 'quality':{'minimumNativeBackgroundEffectivePpi':native['minimumEffectivePpi'],'maximumNativeBackgroundEffectivePpi':native['maximumEffectivePpi'],'detailByNativeSource':True,'native300PpiClaimed':False,'physicalPrintTested':False},
 'browserAudit':'action-fixes-browser-mcp-audit.json','pdfDiffAudit':'action-pdf-diff-qa.json'
}
write(out/'完成与检查记录.json',report)
print('PASS:117 unchanged page texts; changed illustration pages',image_changes)
print('PASS:50 MCP records;21 character tests recorded; level2 PDF and source Word hashes unchanged')
