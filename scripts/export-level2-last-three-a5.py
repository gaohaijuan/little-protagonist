"""Export the last three Level 2 stories as a 31-page A5 RGB reading proof.

Requires browser-render-qa.json and all 25 original PNG compositions in art/.
The browser edition, approved manuscript, page order and literacy statistics are
checked before authoring. PNG originals are retained; PDF encoding never resizes.
Run with the bundled Python after the main agent marks the artifact operation.
"""
from pathlib import Path
import hashlib
import json
import re

from PIL import Image
from pypdf import PdfReader
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'output/level2-last-three-20261028'
SOURCE = ROOT.parent / 'output/levels12-final-word-20261027/终稿内容.json'
IDS = {28: 'level2-jump', 29: 'level2-train', 30: 'level2-fish'}
MM = 72 / 25.4
W, H = 148 * MM, 210 * MM


def read_json(path):
    return json.loads(path.read_text('utf-8-sig'))


def unique_han(text):
    return list(dict.fromkeys(re.findall(r'[\u3400-\u4dbf\u4e00-\u9fff]', text)))


source = read_json(SOURCE)
manifest = read_json(ROOT / 'content/level2-last-three.json')
browser = read_json(OUT / 'browser-render-qa.json')
edition = browser['edition']
assert isinstance(edition, dict), 'browser-render-qa.json must contain its edition object'
assert edition['edition'] == manifest['edition'] == 'level2-last-three-20261028'
books = edition['books']
assert [book['number'] for book in books] == [28, 29, 30]
assert [len(book['pages']) for book in books] == [8, 7, 7]
assert edition['wordLists'] == source['wordLists'] == manifest['wordLists']

seen = set()
calculated_stats = {}
for original in source['books'][:30]:
    characters = unique_han(original['text'].replace('【孩子名字】', 'CHILD'))
    new_characters = [ch for ch in characters if ch not in seen]
    seen.update(characters)
    calculated_stats[original['number']] = {
        'characters': characters, 'newCharacters': new_characters,
        'count': len(characters), 'newCount': len(new_characters),
        'cumulativeCount': len(seen)
    }

stats = []
for book, saved in zip(books, manifest['books']):
    original = next(item for item in source['books'] if item['number'] == book['number'])
    assert book['id'] == IDS[book['number']]
    assert book['levelNumber'] == book['number'] - 15
    assert book['title'] == original['title'] == saved['title']
    assert book['text'] == original['text'] == saved['text']
    assert book['pages'] == saved['pages'] == [[paragraph] for paragraph in original['text'].split(' ')]
    assert ' '.join(paragraph for page in book['pages'] for paragraph in page) == original['text']
    stat = next(item for item in edition['stats'] if item['id'] == book['id'])
    for key, value in calculated_stats[book['number']].items():
        assert stat[key] == value, (book['id'], key, stat[key], value)
    stats.append(stat)
    expected_images = [book['id'] + '-cover.png'] + [f"{book['id']}-{page:02}.png" for page in range(1, len(book['pages']) + 1)]
    for name in expected_images:
        image_path = OUT / 'art' / name
        assert image_path.is_file(), f'Missing composition: {image_path}'
        with Image.open(image_path) as image:
            image.verify()

assert [item['cumulativeCount'] for item in stats] == [185, 190, 192]
font_path = ROOT / 'preview/vendor/pdf-lib/fonts/NotoSerifSC-Regular.ttf'
pdfmetrics.registerFont(TTFont('Story', str(font_path)))
file = OUT / '第二级-最后三本-A5合订校样.pdf'
pdf = canvas.Canvas(str(file), pagesize=(W, H), pageCompression=1)
pdf.setTitle('第二级 · 第13-15本 · A5合订校样')
pdf.setAuthor('小小主角')
pdf.setSubject('RGB A5 reading proof; exact approved wording; embedded Chinese vector text; 31 pages')
records = []
image_records = {}
page_number = 0


def text(value, x, y, size=4, align='left'):
    pdf.setFillColorRGB(.204, .275, .216)
    pdf.setFont('Story', size * MM)
    draw = pdf.drawCentredString if align == 'center' else pdf.drawRightString if align == 'right' else pdf.drawString
    draw(x * MM, H - y * MM, value)


def begin(kind, book=None, body_page=None):
    global page_number
    page_number += 1
    pdf.setFillColorRGB(251 / 255, 246 / 255, 233 / 255)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    records.append({'physicalPage': page_number, 'kind': kind, 'bookId': book['id'] if book else None, 'bodyPage': body_page})
    return 12 if page_number % 2 else 8


def end(folio=True):
    if folio:
        text(str(page_number), 74, 201, 2.8, 'center')
    pdf.showPage()


def art(name, x, y, width, height):
    original = OUT / 'art' / name
    encoded = OUT / 'pdf-images' / Path(name).with_suffix('.jpg').name
    encoded.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as image:
        pixel_width, pixel_height = image.size
        # Same encoding as the earlier Level 2 proofs, without changing pixels.
        if not encoded.exists() or encoded.stat().st_mtime < original.stat().st_mtime:
            image.convert('RGB').save(encoded, 'JPEG', quality=97, subsampling=0, optimize=True)
    scale = min(width / pixel_width, height / pixel_height)
    drawn_width, drawn_height = pixel_width * scale, pixel_height * scale
    image_records[name] = {'sourcePixels': [pixel_width, pixel_height], 'resizedForPDF': False}
    pdf.drawImage(str(encoded), (x + (width - drawn_width) / 2) * MM,
                  H - (y + (height - drawn_height) / 2 + drawn_height) * MM,
                  width=drawn_width * MM, height=drawn_height * MM)


def wrap(value, size, width):
    lines, line = [], ''
    for character in value:
        if line and pdfmetrics.stringWidth(line + character, 'Story', size * MM) > width * MM:
            if character in '，。！？、：；）”' and len(line) > 1:
                lines.append(line[:-1])
                line = line[-1] + character
            else:
                lines.append(line)
                line = character
        else:
            line += character
    if line:
        lines.append(line)
    if len(lines) == 2:
        candidates = []
        for index in range(1, len(value)):
            if value[index] in '，。！？、：；）”' or value[index - 1] in '“（':
                continue
            left = pdfmetrics.stringWidth(value[:index], 'Story', size * MM)
            right = pdfmetrics.stringWidth(value[index:], 'Story', size * MM)
            if max(left, right) <= width * MM:
                candidates.append((index, left, right))
        clauses = [item for item in candidates if value[item[0] - 1] in '，。！？；' and min(item[1:]) / max(item[1:]) > .4]
        if clauses or candidates:
            index = min(clauses or candidates, key=lambda item: abs(item[1] - item[2]))[0]
            lines = [value[:index], value[index:]]
    return lines


x = begin('cover')
text('小小主角 · 第二级', 74, 24, 3.8, 'center')
text('最后三本绘本校样', 74, 41, 8.5, 'center')
text('第13-15本 · 每篇独立封面', 74, 52, 3.8, 'center')
art('level2-jump-cover.png', x, 62, 128, 117)
text('图文同页 · 竖版A5 · 用户终稿', 74, 193, 3.4, 'center')
end(False)

x = begin('contents')
text('故事目录', 74, 29, 8, 'center')
start = 3
chapter_starts = []
for index, book in enumerate(books):
    y = 61 + index * 28
    text('第' + str(book['levelNumber']) + '本', x, y, 4)
    text(book['title'], x + 23, y, 5.6)
    text(str(start), x + 128, y, 4.5, 'right')
    chapter_starts.append(start)
    start += len(book['pages']) + 2
text('3篇故事，22页图文正文。', x, 167, 3.7)
text('每篇之后，保留识字小结。', x, 177, 3.7)
text('对应终稿总篇号28-30。', x, 187, 3.3)
end()

for book, stat in zip(books, stats):
    x = begin('story-cover', book)
    pdf.bookmarkPage(book['id'])
    pdf.addOutlineEntry('第二级第' + str(book['levelNumber']) + '本 ' + book['title'], book['id'])
    text('第二级 · 第' + str(book['levelNumber']) + '本', 74, 24, 4, 'center')
    text(book['title'], 74, 46, min(9, 115 / max(len(book['title']), 1)), 'center')
    art(book['id'] + '-cover.png', x, 65, 128, 119)
    text('小小主角 · 我的故事', 74, 193, 3.6, 'center')
    end()

    for index, paragraphs in enumerate(book['pages']):
        x = begin('story', book, index)
        text('第二级 · 第' + str(book['levelNumber']) + '本 · ' + book['title'], x + 64, 13, 3.3, 'center')
        art(f"{book['id']}-{index + 1:02}.png", x, 24, 128, 131)
        size = 8
        lines = [line for paragraph in paragraphs for line in wrap(paragraph, size, 128)]
        while len(lines) * size * 1.4 > 29:
            size -= .25
            lines = [line for paragraph in paragraphs for line in wrap(paragraph, size, 128)]
        assert size >= 6.5 and len(lines) * size * 1.4 <= 29
        line_height = size * 1.4
        baseline = 162 + (29 - len(lines) * line_height) / 2 + size
        for line_index, line in enumerate(lines):
            text(line, x + 64, baseline + line_index * line_height, size, 'center')
        records[-1].update({'text': paragraphs, 'textSizeMm': size, 'imageRectMm': [x, 24, 128, 131], 'textRectMm': [x, 162, 128, 29]})
        end()

    x = begin('summary', book)
    text(book['title'] + ' · 识字小结', 74, 25, 6.6, 'center')
    art(book['id'] + '-cover.png', x, 39, 33, 34)
    text('这些字，我在故事里见过了。', x + 40, 50, 3.8)
    text('读过不代表已经掌握。', x + 40, 63, 3.5)
    for index, (label, value) in enumerate([('本书用字', stat['count']), ('首次见字', stat['newCount']), ('顺序累计', stat['cumulativeCount'])]):
        mid = x + 128 * (index + .5) / 3
        text(label, mid, 86, 3.7, 'center')
        text(str(value) + '字', mid, 100, 7, 'center')
    text('本书汉字', x, 115, 4.2)
    fresh = set(stat['newCharacters'])
    cell, gap = 9.5, 1.1
    for index, character in enumerate(stat['characters']):
        xx = x + (index % 12) * (cell + gap)
        yy = 122 + (index // 12) * (cell + gap)
        pdf.setStrokeColorRGB(.82, .79, .70)
        pdf.setLineWidth(.15 * MM)
        pdf.rect(xx * MM, H - (yy + cell) * MM, cell * MM, cell * MM, stroke=1, fill=0)
        text(character, xx + cell / 2, yy + 7, 6.2, 'center')
        if character in fresh:
            pdf.line((xx + 2) * MM, H - (yy + 8) * MM, (xx + cell - 2) * MM, H - (yy + 8) * MM)
    text('下划线为本篇首次出现的字。', x, 164, 3.2)
    text('按总篇号1-30正文顺序累计，姓名另计。', x, 173, 2.9)
    text('正文接触字与必认字表分别统计。', x, 180, 2.9)
    text('阅读日期：________　能独立认读：____字', x, 187, 3.3)
    end()

x = begin('back')
text('故事读完啦', 74, 31, 8, 'center')
art('level2-fish-07.png', x, 47, 128, 115)
text('再读一遍，还会有新发现。', 74, 177, 4.2, 'center')
text('第二级 · 第13-15本审核校样', 74, 192, 3.2, 'center')
end()
pdf.save()

reader = PdfReader(str(file))
assert len(reader.pages) == len(records) == 31
checks, embedded_fonts = [], []
for page, record in zip(reader.pages, records):
    assert abs(float(page.mediabox.width) / MM - 148) < .01
    assert abs(float(page.mediabox.height) / MM - 210) < .01
    extracted = page.extract_text()
    assert extracted.strip(), ('Blank page', record['physicalPage'])
    image_count = sum(obj.get_object().get('/Subtype') == '/Image' for obj in page['/Resources'].get('/XObject', {}).values())
    if record['kind'] == 'story':
        assert image_count >= 1, ('Missing story image', record['physicalPage'])
        compact = re.sub(r'\s', '', extracted)
        for paragraph in record['text']:
            assert re.sub(r'\s', '', paragraph) in compact, (record['physicalPage'], paragraph)
    for font in page['/Resources'].get('/Font', {}).values():
        descriptor = font.get_object().get('/FontDescriptor')
        if descriptor:
            embedded_fonts.append('/FontFile2' in descriptor.get_object() or '/FontFile3' in descriptor.get_object())
    checks.append({'physicalPage': record['physicalPage'], 'textExtractable': True, 'images': image_count})

actual_starts = [record['physicalPage'] for record in records if record['kind'] == 'story-cover']
body_starts = [record['physicalPage'] for record in records if record['kind'] == 'story' and record['bodyPage'] == 0]
assert chapter_starts == actual_starts == [3, 13, 22]
assert body_starts == [4, 14, 23]
assert embedded_fonts and all(embedded_fonts), 'Chinese font not embedded'
qa = {
    'file': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
    'formatMm': [148, 210], 'pageCount': 31, 'bodyPages': 22, 'blankPages': 0,
    'covers': 1, 'backCovers': 1, 'contentsPages': 1, 'summaryPages': 3, 'storyCoverPages': 3,
    'bodyStarts': body_starts, 'chapterStarts': actual_starts, 'storyNumbers': [28, 29, 30],
    'embeddedChineseVectorText': True, 'defaultIllustratedCharacter': True,
    'approvedWordingChanged': False, 'edition': edition['edition'],
    'cumulativeCharacterCounts': [185, 190, 192], 'records': records, 'checks': checks,
    'images': image_records,
    'qualityNote': 'PDF-only JPEG quality 97, no image resize; original PNG compositions preserved. Native asset resolution requires a separate audit. RGB reading proof; no physical printing or prepress certification claim.'
}
(OUT / 'a5-pdf-qa.json').write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print('PASS: 31 A5 pages, 22 exact-text illustrated body pages, 3 story covers, no blanks, embedded Chinese vector font. Chapter starts', actual_starts)
