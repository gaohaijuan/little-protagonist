"""A5 RGB reading proof, using the exact browser composition outputs and vector Chinese."""
from pathlib import Path
import json, math, re, sys
from PIL import Image,ImageOps,ImageDraw
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
root=Path(__file__).resolve().parents[1];twelve_mode='--level2-first-twelve' in sys.argv;nine_mode='--level2-first-nine' in sys.argv;six_mode='--level2-first-six' in sys.argv
story_covers='--story-covers' in sys.argv
level2_mode=twelve_mode or nine_mode or six_mode or '--level2-first-three' in sys.argv
complete_mode='--complete-level1' in sys.argv
local_mode='--local-eight' in sys.argv
out=root.parent/('output/level2-first-twelve-20261028' if twelve_mode else 'output/level2-first-nine-20261028' if nine_mode else 'output/level2-first-six-20261028' if six_mode else 'output/level2-first-three-20261027' if level2_mode else 'output/level1-complete-15-20261027' if complete_mode else 'output/revised-eleven-20261027' if local_mode else 'output/priority-three-20261026')
edition=json.loads((out/'browser-render-qa.json').read_text('utf-8'))['edition'] if (local_mode or complete_mode or level2_mode) else json.loads((root/'content/level1-priority-three.json').read_text('utf-8'))
books=edition['books'] if (complete_mode or level2_mode) else [b for b in edition['books'] if b['number'] in edition['localNumbers']] if local_mode else edition['books']
stats=[next(s for s in edition['stats'] if s['id']==b['id']) for b in books]
body_count=sum(len(b['pages']) for b in books);expected_pages=body_count+len(books)+3+(len(books) if story_covers else 0)
cover_title='第二级前十二本校样' if twelve_mode else '第二级前九本校样' if nine_mode else '第二级前六本校样' if six_mode else '第二级前三本校样' if level2_mode else '第一级绘本合集' if complete_mode else '八篇修订合订校样' if local_mode else '三篇合订校样'
subtitle='已完成12本 · 每篇独立封面' if twelve_mode else '已完成9本 · 每篇独立封面' if nine_mode else '已完成6本 · 每篇独立封面' if six_mode else '大鞋和小鞋 · 我还不想睡 · 早上好' if level2_mode else '完整15篇 · 审核版' if complete_mode else '第3、4、5、6、11、12、13、15篇' if local_mode else '第2篇 · 第8篇 · 第10篇'
cover_art='level2-shoes-cover.png' if level2_mode else 'intro-complete-cover.png' if complete_mode else 'family-cover.png' if local_mode else 'snow-revision-cover.png'
back_art='level2-rabbit-08.png' if twelve_mode else 'level2-fruit-07.png' if nine_mode else 'level2-ball-wagon-06.png' if six_mode else 'level2-morning-08.png' if level2_mode else 'catbed-revision-07.png' if complete_mode else 'catbed-revision-07.png' if local_mode else 'ball-revision-06.png'
pdfmetrics.registerFont(TTFont('Story',(root/'preview/vendor/pdf-lib/fonts/NotoSerifSC-Regular.ttf').as_posix()))
mm=72/25.4;W,H=148*mm,210*mm
file=out/('第二级-前十二本-A5合订校样.pdf' if twelve_mode else '第二级-前九本-A5合订校样.pdf' if nine_mode else '第二级-前六本-A5合订校样.pdf' if six_mode else '第二级-前三本-A5合订校样.pdf' if level2_mode else '第一级别-15篇绘本合集-审核版.pdf' if complete_mode else '第一级新版-局部修订8篇-A5合订校样.pdf' if local_mode else '第一级新版-第2第8第10篇-A5合订校样.pdf');c=canvas.Canvas(str(file),pagesize=(W,H),pageCompression=1)
c.setTitle(('第二级 · ' if level2_mode else '第一级新版 · ')+subtitle+' · A5合订校样');c.setAuthor('小小主角');c.setSubject('RGB A5 reading proof; exact approved wording; embedded Chinese vector text; no blank leaves')
if story_covers and complete_mode:
    # Keep the previous 117-page review proof and its audit intact.
    file=out/'第一级别-15篇绘本合集-逐篇封面版.pdf'
    c=canvas.Canvas(str(file),pagesize=(W,H),pageCompression=1)
    c.setTitle('第一级绘本合集 · 每篇独立封面 · A5审核版');c.setAuthor('小小主角')
records=[];n=0
def txt(s,x,y,size=4,align='left'):
    c.setFillColorRGB(.204,.275,.216);c.setFont('Story',size*mm)
    fn=c.drawCentredString if align=='center' else c.drawRightString if align=='right' else c.drawString
    fn(x*mm,H-y*mm,s)
def begin(kind,b=None,page=None):
    global n
    n+=1;c.setFillColorRGB(251/255,246/255,233/255);c.rect(0,0,W,H,fill=1,stroke=0)
    record={'physicalPage':n,'kind':kind,'bookId':b['id'] if b else None,'bodyPage':page};records.append(record)
    return 12 if n%2 else 8
def end(folio=True):
    if folio:txt(str(n),74,201,2.8,'center')
    c.showPage()
def art(name,x,y,w,h):
    p=out/'art'/name
    encoded=out/'pdf-images'/Path(name).with_suffix('.jpg').name
    encoded.parent.mkdir(parents=True,exist_ok=True)
    with Image.open(p) as im:
        pw,ph=im.size
        # PDF-only encoding; no resize, no regeneration; lossless originals remain in art/.
        if not encoded.exists() or encoded.stat().st_mtime < p.stat().st_mtime:
            im.convert('RGB').save(encoded,'JPEG',quality=95 if local_mode else 97,subsampling=0,optimize=True)
    scale=min(w/pw,h/ph);ww,hh=pw*scale,ph*scale
    c.drawImage(str(encoded),(x+(w-ww)/2)*mm,H-(y+(h-hh)/2+hh)*mm,width=ww*mm,height=hh*mm)
def wrap(s,size,width):
    lines=[];line=''
    for ch in s:
        if line and pdfmetrics.stringWidth(line+ch,'Story',size*mm)>width*mm:
            if ch in '，。！？、：；）”' and len(line)>1:lines.append(line[:-1]);line=line[-1]+ch
            else:lines.append(line);line=ch
        else:line+=ch
    if line:lines.append(line)
    if len(lines)==2:
        candidates=[]
        for k in range(1,len(s)):
            if s[k] in '，。！？、：；）”' or s[k-1] in '“（':continue
            a=pdfmetrics.stringWidth(s[:k],'Story',size*mm);b=pdfmetrics.stringWidth(s[k:],'Story',size*mm)
            if max(a,b)<=width*mm:candidates.append((k,a,b))
        clauses=[q for q in candidates if s[q[0]-1] in '，。！？；' and min(q[1],q[2])/max(q[1],q[2])>.4]
        if clauses or candidates:
            k=min(clauses or candidates,key=lambda q:abs(q[1]-q[2]))[0];lines=[s[:k],s[k:]]
    return lines
x=begin('cover');txt('小小主角 · 第二级' if level2_mode else '小小主角 · 第一级新版',74,24,3.8,'center');txt(cover_title,74,41,8.5,'center');txt(subtitle,74,52,3.8,'center')
art(cover_art,x,62,128,117);txt('图文同页 · 竖版A5 · 用户终稿' if level2_mode else '图文同页 · 竖版A5 · 用户指定文稿' if complete_mode else '按已定文稿调整图文与分镜' if local_mode else '下雪了　·　小虫在哪　·　小球在哪',74,193,3.4,'center');end(False)
x=begin('contents');txt('故事目录',74,29,8,'center');start=3
for i,b in enumerate(books):
    y=(43+i*10.5) if twelve_mode else (50+i*13) if nine_mode else (52+i*20) if six_mode else (47+i*9) if complete_mode else (52+i*15) if local_mode else (61+i*28);txt('第'+str(b['levelNumber'])+'本' if level2_mode else '第'+str(b['number'])+'篇',x,y,4);txt(b['title'],x+23,y,4.0 if complete_mode else 4.8 if local_mode else 5.6);txt(str(start),x+128,y,4.5,'right');b['_start']=start;start+=len(b['pages'])+1+(1 if story_covers else 0)
txt(str(len(books))+'篇故事，'+str(body_count)+'页图文正文。',x,185 if complete_mode else 175 if local_mode else 167,3.7);txt('每篇之后，保留识字小结。',x,193 if complete_mode else 185 if local_mode else 177,3.7);
if not complete_mode:txt('对应终稿总篇号16—27。' if twelve_mode else '对应终稿总篇号16—24。' if nine_mode else '对应终稿总篇号16—21。' if six_mode else '对应终稿总篇号16—18。' if level2_mode else '按15篇文稿顺序标注篇号。',x,194 if local_mode else 187,3.3)
end()
for i,b in enumerate(books):
    if story_covers:
        x=begin('story-cover',b);c.bookmarkPage(b['id']);c.addOutlineEntry('第'+str(b['number'])+'篇 '+b['title'],b['id']);txt(('第二级 · 第'+str(b['levelNumber'])+'本' if level2_mode else '第一级 · 第'+str(b['number'])+'篇'),74,24,4,'center');txt(b['title'],74,46,min(9,115/max(len(b['title']),1)), 'center');art(b['id']+'-cover.png',x,65,128,119);txt('小小主角 · 我的故事',74,193,3.6,'center');end()
    for j,paragraphs in enumerate(b['pages']):
        x=begin('story',b,j);
        if j==0 and not story_covers:c.bookmarkPage(b['id']);c.addOutlineEntry('第'+str(b['number'])+'篇 '+b['title'],b['id'])
        txt(('第二级 · 第'+str(b['levelNumber'])+'本 · ' if level2_mode else '第'+str(b['number'])+'篇 · ')+b['title'],x+64,13,3.3,'center')
        art(b['id']+'-'+str(j+1).zfill(2)+'.png',x,24,128,131)
        size=8;lines=[line for p in paragraphs for line in wrap(p,size,128)]
        while len(lines)*size*1.4>29:
            size-=.25;lines=[line for p in paragraphs for line in wrap(p,size,128)]
        assert size>=6.5 and len(lines)*size*1.4<=29
        lineheight=size*1.4;baseline=162+(29-len(lines)*lineheight)/2+size
        for k,line in enumerate(lines):txt(line,x+64,baseline+k*lineheight,size,'center')
        records[-1].update({'text':paragraphs,'textSizeMm':size,'imageRectMm':[x,24,128,131],'textRectMm':[x,162,128,29]});end()
    x=begin('summary',b);s=stats[i];txt(b['title']+' · 识字小结',74,25,6.6,'center');art(b['id']+'-cover.png',x,39,33,34)
    txt('这些字，我在故事里见过了。',x+40,50,3.8);txt('读过不代表已经掌握。',x+40,63,3.5)
    for k,(label,value) in enumerate([('本书用字',s['count']),('首次见字' if level2_mode else '本篇新字',s['newCount']),('顺序累计',s['cumulativeCount'])]):
        mid=x+128*(k+.5)/3;txt(label,mid,86,3.7,'center');txt(str(value)+'字',mid,100,7,'center')
    txt('本书汉字',x,115,4.2);fresh=set(s['newCharacters']);cell=9.5;gap=1.1
    for k,ch in enumerate(s['characters']):
        xx=x+(k%12)*(cell+gap);yy=122+(k//12)*(cell+gap)
        c.setStrokeColorRGB(.82,.79,.70);c.setLineWidth(.15*mm);c.rect(xx*mm,H-(yy+cell)*mm,cell*mm,cell*mm,stroke=1,fill=0);txt(ch,xx+cell/2,yy+7,6.2,'center')
        if ch in fresh:c.line((xx+2)*mm,H-(yy+8)*mm,(xx+cell-2)*mm,H-(yy+8)*mm)
    if b['number']==1:txt('姓名汉字另计：'+ '、'.join(dict.fromkeys(ch for ch in b['title'].split('我是')[-1] if '\u4e00'<=ch<='\u9fff')),x,154,3.2)
    txt('下划线为本篇首次出现的字。',x,164,3.2);txt('按总篇号1—27正文顺序累计，姓名另计。' if twelve_mode else '按总篇号1—24正文顺序累计，姓名另计。' if nine_mode else '按总篇号1—21正文顺序累计，姓名另计。' if six_mode else '按总篇号1—18正文顺序累计，姓名另计。' if level2_mode else '按15篇定稿顺序累计，正文去重、姓名另计。',x,173,2.9)
    if level2_mode:txt('正文接触字与必认字表分别统计。',x,180,2.9)
    txt('阅读日期：________　能独立认读：____字',x,187,3.3);end()
x=begin('back');txt('故事读完啦',74,31,8,'center');art(back_art,x,47,128,115)
txt('再读一遍，还会有新发现。',74,177,4.2,'center');txt('第二级 · 前十二本审核校样' if twelve_mode else '第二级 · 前九本审核校样' if nine_mode else '第二级 · 前六本审核校样' if six_mode else '第二级 · 前三本审核校样' if level2_mode else '第一级新版 · '+('完整15篇审核合集' if complete_mode else '局部修订8篇合订校样' if local_mode else '第2、8、10篇合订校样'),74,192,3.2,'center');end()
c.save()
reader=PdfReader(str(file));assert len(reader.pages)==expected_pages
checks=[]
for p,r in zip(reader.pages,records):
    assert abs(float(p.mediabox.width)/mm-148)<.01 and abs(float(p.mediabox.height)/mm-210)<.01
    text=p.extract_text();assert text.strip(),'Blank page'
    image_count=sum(obj.get_object().get('/Subtype')=='/Image' for obj in p['/Resources'].get('/XObject',{}).values())
    if r['kind']=='story':
        assert image_count>=1,'Missing story image'
        compact=re.sub(r'\s','',text)
        for line in r['text']:assert re.sub(r'\s','',line) in compact,(r['physicalPage'],line)
    checks.append({'physicalPage':r['physicalPage'],'textExtractable':True,'images':image_count})
body_starts=[r['physicalPage'] for r in records if r['kind']=='story' and r['bodyPage']==0]
starts=[r['physicalPage'] for r in records if r['kind']=='story-cover'] if story_covers else body_starts
assert starts==[b['_start'] for b in books]
fonts=[]
for p in reader.pages:
    for f in p['/Resources'].get('/Font',{}).values():
        f=f.get_object();d=f.get('/FontDescriptor');
        if d:fonts.append('/FontFile2' in d.get_object() or '/FontFile3' in d.get_object())
assert fonts and all(fonts),'Font not embedded'
manifest={'file':str(file),'formatMm':[148,210],'pageCount':len(reader.pages),'bodyPages':body_count,'blankPages':0,'covers':1,'contentsPages':1,'summaryPages':len(books),'storyCoverPages':len(books) if story_covers else 0,'bodyStarts':body_starts,'chapterStarts':starts,'storyNumbers':[b['number'] for b in books],'embeddedChineseVectorText':True,'defaultIllustratedCharacter':True,'edition':edition['edition'],'records':records,'checks':checks,'qualityNote':'PDF-only JPEG encoding (95 for local-eight,97 for priority-three), no image resize; lossless originals preserved. Native effective resolution is separately audited; exporting300ppi does not create detail. RGB reading proof, no physical printing claim.'}
(out/('a5-story-covers-qa.json' if story_covers and complete_mode else 'a5-pdf-qa.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
print('PASS:',len(reader.pages),'A5 pages,',body_count,'exact-text illustrated body pages, no blanks, embedded Chinese vector font. Chapter starts',starts)
