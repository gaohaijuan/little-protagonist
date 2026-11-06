"""Create a screen PDF; preserve vector text, page geometry and the original."""
from pathlib import Path
from io import BytesIO
import hashlib,json
from PIL import Image
from pypdf import PdfReader,PdfWriter
from pypdf.generic import NameObject,NumberObject
OUT=Path(__file__).resolve().parents[2]/'output/level3-fourth-book-20261104'
source=OUT/'第三级第四本-风也来买果子-A5校样.pdf'
target=OUT/'第三级第四本-风也来买果子-轻量预览.pdf'
original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
reader=PdfReader(source);writer=PdfWriter();writer.clone_document_from_reader(reader)
seen=set();records=[]
for page in writer.pages:
 for entry in page.images:
  ref=entry.indirect_reference
  if ref.idnum in seen:continue
  seen.add(ref.idnum);im=entry.image.convert('RGB');before=im.size
  im.thumbnail((1200,1200),Image.Resampling.LANCZOS)
  encoded=BytesIO();im.save(encoded,'JPEG',quality=80,optimize=True,subsampling=0)
  obj=ref.get_object();obj._data=encoded.getvalue()
  obj[NameObject('/Filter')]=NameObject('/DCTDecode')
  obj[NameObject('/Width')]=NumberObject(im.width);obj[NameObject('/Height')]=NumberObject(im.height)
  obj[NameObject('/BitsPerComponent')]=NumberObject(8);obj[NameObject('/ColorSpace')]=NameObject('/DeviceRGB')
  for key in ['/SMask','/Mask','/DecodeParms','/Decode']:obj.pop(key,None)
  records.append({'before':before,'preview':im.size,'jpegBytes':len(obj._data)})
writer.compress_identical_objects(remove_identicals=True,remove_orphans=True)
with target.open('wb') as f:writer.write(f)
check=PdfReader(target);assert len(check.pages)==len(reader.pages)==11
assert all(a.extract_text()==b.extract_text() for a,b in zip(reader.pages,check.pages))
assert all(a.mediabox==b.mediabox for a,b in zip(reader.pages,check.pages))
assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
assert target.stat().st_size<5_000_000
report={'sourceBytes':source.stat().st_size,'previewBytes':target.stat().st_size,'previewSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'pages':11,'allPageTextsUnchanged':True,'allPageSizesUnchanged':True,'originalUnchanged':True,'images':records,'scope':'屏幕阅读轻量版，原高清校样保留。'}
(OUT/'轻量预览核查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='images'},ensure_ascii=False))
