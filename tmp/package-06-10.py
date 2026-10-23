from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json

raw = Path('art-samples/books-06-10-native')
out = Path('output/books-06-10-native')
qa = Path('output/qa/books-06-10-native')
record = json.loads((raw / 'generation-records.json').read_text(encoding='utf-8'))
rows = []
for item in record['rows']:
    file = raw / (item['name'] + '.png')
    with Image.open(file) as im:
        rows.append(dict(name=item['name'], status='not-used' if item['name'] in record['notUsed'] else 'used', pixels=list(im.size), mode=im.mode, sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
(raw / 'manifest.json').write_text(json.dumps(dict(method=record['method'], files=rows, printCertified=False, provenance='generation-records.json'), ensure_ascii=False, indent=2), encoding='utf-8')

files = sorted(out.glob('*/page-*.png'))
contact = Image.new('RGB', (1280, 1145), '#e6e5da')
draw = ImageDraw.Draw(contact)
for i, file in enumerate(files):
    contact.paste(ImageOps.contain(Image.open(file).convert('RGB'), (154, 209)), ((i % 8) * 160 + 3, (i // 8) * 229 + 18))
    draw.text(((i % 8) * 160 + 5, (i // 8) * 229 + 2), file.parent.name + '-' + file.stem, fill='black')
contact.save(qa / 'contact-body.jpg')

pose = Image.new('RGB', (768, 400), '#fbf6e9')
draw = ImageDraw.Draw(pose)
sources = [Path('art-samples/my-family-production/child-body.png'), raw / 'child-umbrella.png', raw / 'child-water-reach.png']
for i, file in enumerate(sources):
    with Image.open(file) as im:
        on_paper = Image.alpha_composite(Image.new('RGBA', (1024, 1536), '#fbf6e9'), im.convert('RGBA'))
        pose.paste(on_paper.resize((256, 384)), (i * 256, 16))
    draw.text((i * 256 + 6, 2), ['master', 'umbrella', 'water'][i], fill='black')
for y in (225, 700, 1405):
    draw.line((0, int(y / 4) + 16, 768, int(y / 4) + 16), fill='#658a78')
pose.save(qa / 'pose-master-comparison.jpg')

target = out / '第6—10本-插画样稿.zip'
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(out.glob('*/*.png')):
        if not file.name.startswith('art-'):
            archive.write(file, str(file.relative_to(out)))
    archive.write(out / 'manifest.json', 'manifest.json')
    for item in rows:
        if item['status'] == 'used':
            file = raw / (item['name'] + '.png')
            archive.write(file, '原生素材/' + file.name)
    archive.write(raw / 'generation-records.json', '原生素材/generation-records.json')
    archive.write(raw / 'manifest.json', '原生素材/manifest.json')
    for folder in ('stone', 'sunrise'):
        for file in sorted((Path('art-samples/next-three-production') / folder).glob('*.png')):
            archive.write(file, '复用素材/' + folder + '/' + file.name)
print('Native files:', len(rows), '; used:', sum(r['status'] == 'used' for r in rows))
print('Review ZIP MiB:', round(target.stat().st_size / 1024**2, 1))
