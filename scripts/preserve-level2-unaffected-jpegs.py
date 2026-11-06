"""Reuse unchanged prior PDF JPEG streams; only13 reviewed body images are replaced.

Run after rendering and before export-complete-level2-a5.py. The JPEG streams
remain at the original pixel size and compression; no image is regenerated.
"""
from pathlib import Path
from pypdf import PdfReader
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'output/level2-complete-15-20261028'
BEFORE=ROOT.parent/'output/level2-review-fixes-20261028/before'
qa=json.loads((BEFORE/'a5-pdf-qa.json').read_text('utf-8'))
reader=PdfReader(BEFORE/'第二级-完整15本-A5合订校样.pdf')
ids={b['id']:b['number'] for b in json.loads((ROOT/'content/level2-complete-fifteen.json').read_text('utf-8'))['books']}
changed={(16,2),(18,5),*((23,i) for i in range(7)),*((24,i) for i in [4,5,6]),(27,4)}
saved={};target=OUT/'pdf-images';target.mkdir(exist_ok=True)
for row in qa['records']:
    if not row['bookId'] or row['kind'] not in ['story','story-cover','summary']:continue
    number=ids[row['bookId']]
    if row['kind']=='story' and (number,row['bodyPage']) in changed:continue
    suffix=f"{row['bodyPage']+1:02}" if row['kind']=='story' else 'cover'
    name=row['bookId']+'-'+suffix+'.jpg'
    if name in saved:continue
    page=reader.pages[row['physicalPage']-1]
    im=next(v.get_object() for v in page['/Resources'].get('/XObject',{}).values() if v.get_object().get('/Subtype')=='/Image')
    data=im.get_data();assert data.startswith(b'\xff\xd8'),name
    (target/name).write_bytes(data);saved[name]=hashlib.sha256(data).hexdigest()
report={'preservedJpegImages':len(saved),'changedBodyPages':13,'pixelsResized':False,'images':saved}
(OUT/'preserved-original-jpegs.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print('Preserved',len(saved),'original JPEG streams;13 reviewed body images remain new.')
