from pathlib import Path
import json,re,hashlib
from PIL import Image
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT.parent/'output/level3-fourth-book-20261104'
book=json.loads((ROOT/'content/level3-fourth-book.json').read_text('utf-8'))
pdfmetrics.registerFont(TTFont('Story',str(ROOT/'preview/vendor/pdf-lib/fonts/NotoSerifSC-Regular.ttf')))
MM=72/25.4;W,H=148*MM,210*MM
target=OUT/'第三级第四本-风也来买果子-A5校样.pdf'
c=canvas.Canvas(str(target),pagesize=(W,H),pageCompression=1);c.setTitle('第三级第四本：风也来买果子');c.setAuthor('小小主角');records=[]
def text(s,x,y,size=4,center=False):
 c.setFillColor(HexColor('#334a55'));c.setFont('Story',size*MM)
 (c.drawCentredString if center else c.drawString)(x*MM,(210-y)*MM,s)
def begin(n):
 c.setFillColor(HexColor('#f9f8f2'));c.rect(0,0,W,H,fill=1,stroke=0)
 text('第三级 · 第4本 · 风也来买果子',74,13,2.8,True);text(str(n),74,201,2.6,True)
def art(file,x=12,y=27,size=128):
 p=OUT/'art'/file;im=Image.open(p);assert im.size==(1500,1500)
 c.drawImage(str(p),x*MM,(210-y-size)*MM,size*MM,size*MM)
def lines(s,x,y,size=4.8,width=124,step=9):
 line='';used=0
 for ch in s:
  if pdfmetrics.stringWidth(line+ch,'Story',size*MM)>width*MM:
   text(line,x,y+used*step,size);used+=1;line=ch
  else:line+=ch
 if line:text(line,x,y+used*step,size)
 return used+1
begin(1);text(book['title'],74,32,8,True);art('cover.png',12,45,128);text('第三级 · 单篇画风试样',74,186,3.5,True);c.showPage()
for i,s in enumerate(book['pages']):
 n=i+2;begin(n);x=12 if n%2 else 8;art(f'{i+1:02}.png',x);lines(s,x,170);records.append({'physicalPage':n,'bodyPage':i+1,'text':s});c.showPage()
begin(11);text('识字小结',74,32,7,True);st=book['stats']
text(f"本篇用字 {st['count']} 种",14,49,4);text(f"首次出现 {st['newCount']} 种 · 累计正文接触 {st['cumulativeCount']} 种",14,60,3.8)
text('本篇必认字',14,78,4.3);lines('　'.join(book['requiredCharacters']),14,90,4.3,120,9)
text('辅助字',14,119,4.3);text('　'.join(book['auxiliaryCharacters']),14,131,4.3)
text('本篇用字表',14,148,4.3);lines(' '.join(st['characters']),14,159,3.2,120,7)
text('累计接触字种包含辅助字，不等同于必认字目标。',14,190,2.7);c.showPage();c.save()
pdf=PdfReader(target);assert len(pdf.pages)==11
for row in records:
 actual=pdf.pages[row['physicalPage']-1].extract_text();norm=lambda s:re.sub(r'\s+','',s)
 assert norm(row['text']) in norm(actual),(row['physicalPage'],actual)
assert all(abs(float(p.mediabox.width)/MM-148)<.01 and abs(float(p.mediabox.height)/MM-210)<.01 for p in pdf.pages)
report={'file':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'pages':11,'bodyPages':9,'exactBodyText':True,'embeddedChineseVectorText':True,'pageSizeMm':[148,210],'nativeMinimumBackgroundPpi':round(1254/128*25.4,2),'printCertification':False,'scope':'默认人物单篇RGB审核校样','records':records}
(OUT/'pdf-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print('PASS:11 A5 pages;9 exact-text illustrated pages;embedded Chinese text.')
