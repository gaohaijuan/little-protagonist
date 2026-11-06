"""Archive built-in images and preserve native pixels/alpha in lossless delivery."""
import json, shutil
from pathlib import Path
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[1]
native_dir = root / 'art-samples/books-17-19-native'
delivery_dir = root / 'preview/art/sequence/books-17-19'
native_dir.mkdir(parents=True, exist_ok=True)
delivery_dir.mkdir(parents=True, exist_ok=True)
records = json.loads((root / 'content/books-17-19-art-provenance.json').read_text(encoding='utf8'))['assets']
assets = {}
for record in records:
    native = native_dir / (record['id'] + '.png')
    if not native.exists():
        shutil.copyfile(record['generated'], native)
    image = Image.open(native).convert('RGBA')
    target = delivery_dir / (record['id'] + '.webp')
    if not target.exists():
        image.save(target, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    encoded = Image.open(target).convert('RGBA')
    assert image.size == encoded.size
    diff = ImageChops.difference(image, encoded)
    assert diff.getchannel('A').getbbox() is None
    visible = image.getchannel('A').point(lambda a: 255 if a else 0)
    assert all(ImageChops.multiply(band, visible).getbbox() is None for band in diff.split()[:3])
    assets[record['id']] = {'url': './' + target.relative_to(root / 'preview').as_posix(), 'size': image.size, 'bounds': image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox(), 'nativePixelsExact': True}

existing = {
    'paper-welcome': 'books-16-20-storyboards-v2/b20-p01.png',
    'paper-wind': 'books-16-20-storyboards-v2/b20-p02.png',
    'paper-land': 'books-16-20-storyboards-v2/b20-p05.png',
    'paper-again': 'books-16-20-storyboards-v2/b20-p06.png',
    'paper-end': 'books-16-20-storyboards-v2/b20-p08.png',
    'loose-paper': 'books-16-20/red-paper.png',
    'paper-stone': 'books-06-10/pebble.png',
    'fruit-welcome': 'books-16-20-storyboards-v2/b20-p01.png',
    'fruit-share': 'books-16-20-storyboards-v2/b20-p05.png',
    'fruit-end': 'books-16-20-storyboards-v2/b20-p08.png',
    'bed-cat-awake': 'books-11-13/cat-quiet.webp',
    'bed-cat-sleep': 'books-16-20/cat-sleep-v2.png',
    'bed-ball': 'books-11-15/red-ball.png',
    'bed-car': 'first-ten/toy-car.webp'
}
for key, name in existing.items():
    image = Image.open(root / 'preview/art/sequence' / name).convert('RGBA')
    assets[key] = {'url': './art/sequence/' + name, 'size': image.size, 'bounds': image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox(), 'existing': True}
(root / 'content/books-17-19-art-assets.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2), encoding='utf8')
(root / 'miniprogram/lib/books-17-19-assets.js').write_text("'use strict';\n// Native-pixel metadata, lossless encoding only.\nmodule.exports=" + json.dumps(assets, ensure_ascii=False) + ';\n', encoding='utf8')
print(json.dumps({'generated': len(records), 'reused': len(existing), 'lossless': True}))
