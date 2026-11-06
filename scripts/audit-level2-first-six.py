from pathlib import Path
from PIL import Image
from pypdf import PdfReader
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root.parent/'output/level2-first-six-20261028';l1=root.parent/'output/level1-complete-15-20261027'
read=lambda p:json.loads(p.read_text('utf-8'))
write=lambda p,v:p.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
qa=read(out/'browser-render-qa.json');pdfqa=read(out/'a5-pdf-qa.json');pdf=Path(pdfqa['file']);mcp=read(out/'browser-mcp-audit.json')
assert pdfqa['pageCount']==60 and pdfqa['bodyPages']==45 and pdfqa['storyCoverPages']==6 and pdfqa['summaryPages']==6 and pdfqa['blankPages']==0
assert pdfqa['chapterStarts']==[3,12,22,32,42,52]
assert len(mcp)==31
for n,count in [(19,8),(20,8),(21,6)]:assert {r['page'] for r in mcp if r['number']==n}==set(range(1,count+1))|{'cover','summary'}
old2=read(root.parent/'output/level2-first-three-20261027/完成与检查记录.json')['pdf'];assert sha(Path(old2['path']))==old2['sha256']
word=read(root.parent/'output/levels12-final-word-20261027/文字核对.json');assert sha(Path(word['file']))==word['sha256']
source=read(root.parent/'output/levels12-final-word-20261027/终稿内容.json')
for b in qa['edition']['books']:assert ' '.join(sum(b['pages'],[]))==next(x['text'] for x in source['books'] if x['number']==b['number'])
assert len(list((out/'covers-pdf-render').glob('page-*.jpg')))==60
# The background metadata and captured camera are the native-resolution basis.
asset_maps=[read(root/f'content/{name}') for name in ['level2-next-three-assets.json','level2-first-three-assets.json','books-14-16-art-assets.json','book-20-art-assets.json']]
assets={k:v for m in reversed(asset_maps) for k,v in m.items()};native=[]
for r in qa['records']:
 b=next(b for b in qa['edition']['books'] if b['id']==r['id'])
 if r['page']<0 or r['page']>=len(b['pages']):continue
 key=r['canvas']['scene'];meta=assets[key];path=root/'preview'/meta['url'];w,h=Image.open(path).size;c=json.loads(r['canvas']['camera'])
 native.append({'number':r['number'],'page':r['page']+1,'background':key,'nativeSize':[w,h],'camera':c,'backgroundEffectivePpi':round(min(w*c['width']/1000/(128/25.4),h*c['height']/1000/(131/25.4)),1)})
write(out/'native-resolution-audit.json',{'minimumBackgroundEffectivePpi':min(r['backgroundEffectivePpi'] for r in native),'maximumBackgroundEffectivePpi':max(r['backgroundEffectivePpi'] for r in native),'records':native,'native300PpiClaimed':False})
# The 15 added level1 covers must not replace or redraw any existing body scene.
previous=read(l1/'a5-pdf-qa.json');covers=read(l1/'a5-story-covers-qa.json');a=PdfReader(previous['file']);b=PdfReader(covers['file']);assert len(b.pages)==132 and covers['storyCoverPages']==15
old_records={(r['bookId'],r['bodyPage']):r for r in previous['records'] if r['kind']=='story'}
def image_hashes(page):return sorted(hashlib.sha256(o.get_object()._data).hexdigest() for o in page['/Resources'].get('/XObject',{}).values() if o.get_object().get('/Subtype')=='/Image')
for r in [r for r in covers['records'] if r['kind']=='story']:
 q=old_records[(r['bookId'],r['bodyPage'])];oldpage=a.pages[q['physicalPage']-1];newpage=b.pages[r['physicalPage']-1]
 assert image_hashes(oldpage)==image_hashes(newpage)
 assert oldpage.extract_text().strip().rsplit('\n',1)[0]==newpage.extract_text().strip().rsplit('\n',1)[0]
assert len(list((l1/'covers-pdf-render').glob('page-*.jpg')))==132
cover_report={'completedOn':'2026-10-28','file':covers['file'],'sha256':sha(Path(covers['file'])),'pages':132,'storyCoverPages':15,'bodyPages':99,'summaryPages':15,'blankPages':0,'chapterStarts':covers['chapterStarts'],'all99BodyTextsAndImageStreamsUnchanged':True,'runtimePrintPlanPages':132,'runtimeFirstMiddleLastCoverPainterChecked':True,'physicalPrintingTested':False}
write(l1/'逐篇封面版-完成与检查记录.json',cover_report)
report={'completedOn':'2026-10-28','status':'level2-first-six-for-review','level':2,'newNumbers':[19,20,21],'newLevelNumbers':[4,5,6],'newTitles':['这水太热了','小花喝水','小球也要走'],'newBodyPages':22,'allNumbers':[16,17,18,19,20,21],'approvedWordingChanged':False,'imageAPIUsed':False,'newGeneratedAssets':3,'newCharacterPoses':0,'facesRepainted':False,'generationPrompts':str(root/'content/level2-next-three-generation-jobs.json'),'nativeAssets':str(root/'art-samples/level2-next-three-native'),'runtimeAssets':str(root/'preview/art/sequence/level2-next-three'),'browserURL':'http://127.0.0.1:4173/?view=level2-first-six','browserMCP':{'covers':6,'newBodyPages':22,'newSummaryPages':3,'records':31},'checks':{'allBodyPagesExactText':45,'mobileWidth':390,'mobileBodyPages':45,'rollingWindowMaxBooks':3,'rigSessionFamilyAndPrintTestsPassed':32,'actualUserPhotoTested':False,'oldFirstThreePDFUnchanged':True,'sourceWordUnchanged':True,'actualPDFRenderedPages':60,'noBlankPages':True,'everyStoryHasCover':True},'pdf':{'path':str(pdf),'bytes':pdf.stat().st_size,'sha256':sha(pdf),'pageCount':60,'bodyPages':45,'storyCoverPages':6,'summaryPages':6,'chapterStarts':pdfqa['chapterStarts'],'bodyStarts':pdfqa['bodyStarts'],'formatMm':[148,210],'color':'RGB','embeddedChineseVectorText':True,'physicalPrintingTested':False},'remainingLevel2Numbers':list(range(22,31))}
write(out/'完成与检查记录.json',report)
print('PASS:6 level2 covers,45 exact-text body pages,60 A5 pages;31 MCP checks;3 native scenes reused in22 new pages.')
print('PASS:15 level1 covers,132 A5 pages; all99 existing body image streams and texts unchanged.')
