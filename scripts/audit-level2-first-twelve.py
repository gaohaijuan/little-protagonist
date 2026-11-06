from pathlib import Path
from PIL import Image
from pypdf import PdfReader
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root.parent/'output/level2-first-twelve-20261028'
read=lambda p:json.loads(p.read_text('utf-8'))
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
qa=read(out/'browser-render-qa.json');pdfqa=read(out/'a5-pdf-qa.json');pdf=Path(pdfqa['file']);mcp=read(out/'browser-mcp-audit.json')
assert pdfqa['pageCount']==116 and pdfqa['bodyPages']==89 and pdfqa['storyCoverPages']==12 and pdfqa['summaryPages']==12 and pdfqa['blankPages']==0
assert pdfqa['chapterStarts']==[3,12,22,32,42,52,60,70,79,88,97,106]
assert len(mcp)==37
for n,count in [(25,7),(26,7),(27,8)]:assert {r['page'] for r in mcp if r['number']==n}==set(range(1,count+1))|{'cover','summary'}
old=read(root.parent/'output/level2-first-nine-20261028/完成与检查记录.json')['pdf'];assert sha(Path(old['path']))==old['sha256']
word=read(root.parent/'output/levels12-final-word-20261027/文字核对.json');assert sha(Path(word['file']))==word['sha256']
level1=read(root.parent/'output/level1-complete-15-20261027/逐篇封面版-完成与检查记录.json');assert sha(Path(level1['file']))==level1['sha256']
source=read(root.parent/'output/levels12-final-word-20261027/终稿内容.json')
for b in qa['edition']['books']:assert ' '.join(sum(b['pages'],[]))==next(x['text'] for x in source['books'] if x['number']==b['number'])
assert len(list((out/'pdf-render').glob('page-*.jpg')))==116
# Prior six body illustrations must be exactly the same JPEG image streams.
a=PdfReader(old['path']);b=PdfReader(pdf);oldqa=read(root.parent/'output/level2-first-nine-20261028/a5-pdf-qa.json')
def images(page):return sorted(sha_bytes(o.get_object()._data) for o in page['/Resources'].get('/XObject',{}).values() if o.get_object().get('/Subtype')=='/Image')
sha_bytes=lambda b:hashlib.sha256(b).hexdigest()
prior={(r['bookId'],r['bodyPage']):r for r in oldqa['records'] if r['kind']=='story'}
for r in [r for r in pdfqa['records'] if r['kind']=='story' and (r['bookId'],r['bodyPage']) in prior]:
 q=prior[r['bookId'],r['bodyPage']];assert images(a.pages[q['physicalPage']-1])==images(b.pages[r['physicalPage']-1])
 assert a.pages[q['physicalPage']-1].extract_text()==b.pages[r['physicalPage']-1].extract_text()
asset_maps=[read(root/f'content/{name}') for name in ['level2-fourth-three-assets.json','level2-third-three-assets.json','level2-next-three-assets.json','level2-first-three-assets.json','priority-three-assets.json','books-17-19-art-assets.json','books-14-16-art-assets.json','book-20-art-assets.json']]
assets={k:v for m in reversed(asset_maps) for k,v in m.items()};native=[]
for r in qa['records']:
 book=next(b for b in qa['edition']['books'] if b['id']==r['id'])
 if r['page']<0 or r['page']>=len(book['pages']):continue
 key=r['canvas']['scene'];meta=assets[key];w,h=Image.open(root/'preview'/meta['url']).size;c=json.loads(r['canvas']['camera'])
 native.append({'number':r['number'],'page':r['page']+1,'background':key,'nativeSize':[w,h],'camera':c,'backgroundEffectivePpi':round(min(w*c['width']/1000/(128/25.4),h*c['height']/(1500 if r['number']==25 else 1000)/(131/25.4)),1)})
poses=read(root/'content/level2-fourth-three-pose-registration.json')
for p in poses:
 # Native source, not enlarged runtime raster, establishes the real detail.
 p['nativeBodyEffectivePpi']=round((p['sourceSole']-p['sourceCollar'][1])/((p['registeredSoleMinusCollar']/1.8375)*.57/1000*131/25.4),1)
write(out/'native-resolution-audit.json',{'minimumBackgroundEffectivePpi':min(r['backgroundEffectivePpi'] for r in native),'maximumBackgroundEffectivePpi':max(r['backgroundEffectivePpi'] for r in native),'records':native,'newPoseNativeResolution':poses,'native300PpiClaimed':False})
report={'completedOn':'2026-10-28','status':'level2-first-twelve-for-review','level':2,'newNumbers':[25,26,27],'newLevelNumbers':[10,11,12],'newTitles':['谁还在睡','水中的月亮','我和小兔'],'newBodyPages':22,'allNumbers':list(range(16,28)),'approvedWordingChanged':False,'imageAPIUsed':False,'acceptedNewAssets':6,'generatedAttempts':7,'newCharacterPoses':1,'facesRepainted':False,'generationPrompts':str(root/'content/level2-fourth-three-generation-jobs.json'),'nativeAssets':str(root/'art-samples/level2-fourth-three-native'),'runtimeAssets':str(root/'preview/art/sequence/level2-fourth-three'),'browserURL':'http://127.0.0.1:4173/?view=level2-first-twelve','browserMCP':{'covers':12,'newBodyPages':22,'newSummaryPages':3,'records':37},'checks':{'allBodyPagesExactText':89,'mobileWidth':390,'mobileBodyPages':89,'rollingWindowMaxBooks':3,'rigSessionFamilyAndPrintTestsPassed':36,'actualUserPhotoTested':False,'oldFirstNinePDFUnchanged':True,'oldFirstNine67BodyImageStreamsAndTextsUnchanged':True,'level1PDFUnchanged':True,'sourceWordUnchanged':True,'actualPDFRenderedPages':116,'noBlankPages':True,'everyStoryHasCover':True},'pdf':{'path':str(pdf),'bytes':pdf.stat().st_size,'sha256':sha(pdf),'pageCount':116,'bodyPages':89,'storyCoverPages':12,'summaryPages':12,'chapterStarts':pdfqa['chapterStarts'],'bodyStarts':pdfqa['bodyStarts'],'formatMm':[148,210],'color':'RGB','embeddedChineseVectorText':True,'physicalPrintingTested':False},'remainingLevel2Numbers':list(range(28,31))}
write(out/'完成与检查记录.json',report)
print('PASS:12 covers,89 exact-text body pages,116 actual A5 pages;37 MCP checks; old67 image streams and texts unchanged.')
