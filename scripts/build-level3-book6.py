"""Build the isolated, self-contained book 6 proof; preserve the v4 manuscript."""
from pathlib import Path
import json, re, hashlib, base64, mimetypes

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'output/level3-book6-20261104'
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT.parent / 'output/level3-full-review-v4-20261031/文稿与核查.json'
course = json.loads(source.read_text(encoding='utf-8-sig'))
book = course['storyDetails'][5]
paragraphs = book['text'].splitlines()
groups = [[0,1],[2,3],[4],[5],[6,7],[8],[9],[10]]
scenes = [
 ('snow-close','孩子第一视角近景：戴手套的手轻轻摸小雪人的身子；下方大雪球是身子，上方小雪球是头，雪粒触感清楚。'),
 ('snow-wide','退到庭院中景，小雪人仍在室外，屋内窗户透出暖光，妈妈的回答是画外音。画面不把尚未发生的融化画成事实。'),
 ('room-day','回到屋内，孩子坐在地毯上，拿来一张空白纸。纸面暂时没有图案。'),
 ('drawing','俯视纸面：先画下面的大圆，再画上面的小圆；两个圆相接，不把大圆画成脑袋。'),
 ('drawing','延续同一张纸和同一观察方向：圆内增加眼睛，身子画上衣服。纸雪人的外形呼应真实雪人，画始终留在纸上。'),
 ('room-night','夜晚卧室中景：同一张完成的画斜靠在床前的低凳上。孩子在旁边看画，窗外是雪夜。'),
 ('window-night','侧向广景：床前的纸雪人在室内，窗外的小雪人在雪地上；暖光和蓝色雪夜划清空间。孩子站在两者之间。'),
 ('outside-night','从雪地回望窗户：真实雪人在近处，窗内是暖光与画。孩子道别，结尾回到两个朋友各有住处的安静画面。')
]
pages = [dict(number=i+1, text='\n'.join(paragraphs[j] for j in group), background=scenes[i][0], storyboard=scenes[i][1]) for i,group in enumerate(groups)]
assert '\n'.join(p['text'] for p in pages) == book['text']
han = lambda t: re.findall(r'[\u4e00-\u9fff]',t)
chars = list(dict.fromkeys(han(book['text'])))
formal = set(course['priorRequiredCharacters'] + course['requiredAll'])
aux = [c for c in chars if c not in formal]
assert len(han(book['text'])) == 100 and set(aux) == set('怕成圆')
earlier = set(''.join(s['text'] for s in course['storyDetails'][:5]))
first_here = [c for c in chars if c not in earlier and c in course['requiredAll']]
manifest = dict(edition='level3-book6-20261104',level=3,levelNumber=6,id='level3-snowman-home', title=book['title'],
 status='独立插画校样，正文沿用待审v4；未改默认书架', source=str(source), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
 text=book['text'],pages=pages,statistics=dict(bodyHanCount=100,uniqueCount=len(chars),characters=chars,level3RequiredInBody=book['requiredCharacters'],auxiliaryCharacters=aux,
 firstWithinLevel3=first_here,policy='仅计正文。辅助字不纳入180个必认字；本级首次出现与孩子已经掌握是不同概念。'),
 continuity=['真实雪人始终在雪地上；不抱入室内，不融化，不凭空换帽子或耳朵。','纸面先空白，后大小圆，再补眼睛和衣服；第5至8页使用同一绘画道具。','雪人两个雪球：下大上小；纸画清楚保留白纸边缘。','不生成或改变用户照片；室内人物调用child-v1已注册动作，仅整体等比摆放。'],
 readingNote='怕、成、圆由成人随句带读。读完可请孩子指指哪个雪人在屋里、哪个在屋外。')
(OUT/'正文与逐页分镜.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
md = ['# 第三级 · 第6本《雪人住我家》','', '沿用2026-10-31完整复审v4正文，正文100字。8页正文，另有独立封面和识字小结。','']
for p in pages:
 md += [f"## 第{p['number']}页",'',p['text'],'',f"画面：{p['storyboard']}",'']
md += ['## 陪读与用字','',f"正文不同汉字：{len(chars)}种。",'本篇辅助字：怕、成、圆。', '陪读：'+manifest['readingNote'],'','不将接触字数当作掌握量。该独立校样不改变默认书架和打印目录。']
(OUT/'正文与逐页分镜.md').write_text('\n'.join(md),encoding='utf-8')
print(json.dumps({'pages':len(pages),'bodyHanCount':100,'uniqueCount':len(chars),'auxiliaryCharacters':aux},ensure_ascii=False))

assets = OUT/'assets'
required = ['snow-wide','snow-close','room-day','drawing','room-night','window-night','outside-night']
if not all((assets/(key+'.png')).exists() for key in required):
 print('Manuscript ready; illustration assets pending.'); raise SystemExit(0)
def uri(path):
 return 'data:'+ (mimetypes.guess_type(str(path))[0] or 'image/png')+';base64,'+base64.b64encode(path.read_bytes()).decode()
images = {k:uri(assets/(k+'.png')) for k in required}
poses = json.loads((ROOT/'content/child-pose-library.json').read_text(encoding='utf-8-sig'))['poses']
for key in ['sit-draw','stand-wave','crouch-book']:
 images[key] = uri(ROOT/'preview'/poses[key]['bodyUrl'].removeprefix('./'))
images['head'] = uri(ROOT/'preview/art/family/child-head.webp')
family = json.loads((ROOT/'preview/art/family/manifest.json').read_text(encoding='utf-8-sig'))
rig = (ROOT/'miniprogram/lib/character-rig.js').read_text(encoding='utf-8')
template = (ROOT/'preview/level3-book6-template.html').read_text(encoding='utf-8')
for key,value in {'MANIFEST':manifest,'IMAGES':images,'POSES':poses,'HEADMETRICS':family['heads']['child']['metrics']}.items():
 template = template.replace('/* '+key+' */',json.dumps(value,ensure_ascii=False))
template = template.replace('/* CHARACTER_RIG */',rig)
(OUT/'雪人住我家-插画校样.html').write_text(template,encoding='utf-8')
print('Self-contained proof written.')
