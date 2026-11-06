"""Audit real source detail at A5 display size; never count padded/upsampled pixels."""
from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'output/level2-last-three-20261028'
PANEL_MM = {'width': 128, 'height': 131}
SOURCE_PIXELS_PER_UNIT = 1176 / 640


def read(path):
    return json.loads(path.read_text('utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_file(url):
    return ROOT / 'preview' / url.removeprefix('./')


def main():
    qa_file = OUT / 'browser-render-qa.json'
    if not qa_file.exists():
        raise SystemExit('Browser records are not ready: ' + str(qa_file))
    qa = read(qa_file)
    assets = read(ROOT / 'content/level2-last-three-assets.json')
    generation = read(ROOT / 'content/level2-last-three-generation.json')
    jump_generation = read(ROOT / 'content/level2-last-three-jump-generation.json')
    registration = read(ROOT / 'content/level2-last-three-pose-registration.json')
    registrations = {row['id']: row for row in registration['registrations']}
    jobs = {j.get('assetKey', j['key']): j for j in generation['jobs'] + jump_generation['jobs']}
    node = Path('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
    plans = json.loads(subprocess.check_output([
        str(node), '-e', "process.stdout.write(JSON.stringify(require('./miniprogram/lib/level2-last-three-art').BOOKS));"
    ], cwd=ROOT, text=True, encoding='utf-8'))

    # Recheck metadata and exact pixels rather than treating a lossless filename
    # as evidence that its source was high resolution.
    encodings = []
    for key, meta in assets.items():
        web = runtime_file(meta['url'])
        with Image.open(web) as im:
            runtime_size = list(im.size)
            runtime_pixels = im.convert('RGBA').tobytes()
        assert runtime_size == meta['size'], (key, 'size metadata mismatch')
        if meta.get('sha256'):
            assert sha(web) == meta['sha256'], (key, 'runtime hash mismatch')
        row = {'key': key, 'runtimePath': str(web), 'runtimeSize': runtime_size,
               'runtimeSha256': sha(web), 'reused': bool(meta.get('reused'))}
        job = jobs.get(key)
        if job:
            native = Path(job.get('savedNativePath') or job.get('nativePath') or job['source'])
            with Image.open(native) as im:
                original = im.convert('RGBA')
                row.update({'nativePath': str(native), 'nativeSize': list(original.size),
                            'nativeSha256': sha(native)})
                if meta.get('nativePixelsExact'):
                    assert list(original.size) == runtime_size
                    assert original.tobytes() == runtime_pixels, (key, 'native pixel mismatch')
                    row['runtimeMatchesNativePixels'] = True
                elif key in registrations:
                    r = registrations[key]
                    scale = r['uniformScale']; ox, oy = r['offset']
                    expected = original.transform(tuple(runtime_size), Image.Transform.AFFINE,
                        (1 / scale, 0, -ox / scale, 0, 1 / scale, -oy / scale), Image.Resampling.BICUBIC)
                    assert expected.tobytes() == runtime_pixels, (key, 'registered-body pixel mismatch')
                    row.update({'runtimeMatchesRegisteredResample': True, 'uniformRegistrationScale': scale,
                                'interpolationAddsNativeDetail': False})
        else:
            row['nativeProvenanceNote'] = 'Reused existing asset at its actual available resolution; no new native-resolution claim.'
        encodings.append(row)

    books = {b['id']: b for b in qa['edition']['books']}
    background_rows = []
    body_rows = []
    for record in qa['records']:
        book_id = record['id']
        body_page = record['page']
        if body_page < 0 or body_page >= len(books[book_id]['pages']):
            continue  # Separate cover/summary art boxes are not 128 x 131 mm.
        plan = plans[book_id]['pages'][body_page]
        data = record['canvas']
        camera = json.loads(data['camera']) if isinstance(data['camera'], str) else data['camera']
        key = data.get('scene') or plan['background']
        assert key == plan['background'], (book_id, body_page, 'record/plan background mismatch')
        world = plan.get('world', {'width': 1000, 'height': 1000})
        native_size = next(r.get('nativeSize', r['runtimeSize']) for r in encodings if r['key'] == key)
        # A source pixel covers worldWidth/nativeWidth logical units. The camera
        # maps camera.width units to 128 mm; a close crop therefore LOWERS PPI.
        x_ppi = native_size[0] * camera['width'] / world['width'] / (PANEL_MM['width'] / 25.4)
        y_ppi = native_size[1] * camera['height'] / world['height'] / (PANEL_MM['height'] / 25.4)
        background_rows.append({'id': book_id, 'number': record.get('number', books[book_id]['number']),
            'page': body_page + 1, 'background': key, 'nativeSize': native_size,
            'world': world, 'camera': camera, 'backgroundEffectivePpi': round(min(x_ppi, y_ppi), 2),
            'xPpi': round(x_ppi, 2), 'yPpi': round(y_ppi, 2)})
        pose_id = plan.get('pose')
        if pose_id in registrations:
            reg = registrations[pose_id]
            scene_scale = plan['placement']['scale']
            # Registration may add pixels or canvas padding. Divide by its
            # uniform scale to recover how many ORIGINAL pixels serve one inch.
            x_ppi = SOURCE_PIXELS_PER_UNIT * camera['width'] * 25.4 / (reg['uniformScale'] * scene_scale * PANEL_MM['width'])
            y_ppi = SOURCE_PIXELS_PER_UNIT * camera['height'] * 25.4 / (reg['uniformScale'] * scene_scale * PANEL_MM['height'])
            body_rows.append({'id': book_id, 'page': body_page + 1, 'pose': pose_id,
                'sceneScale': scene_scale, 'registrationScale': reg['uniformScale'],
                'nativeBodyEffectivePpi': round(min(x_ppi, y_ppi), 2)})

    assert len(background_rows) == 22, 'Expected all 22 actual body-page render records'
    new_poses = []
    for pose_id, reg in registrations.items():
        encoding = next(r for r in encodings if r['key'] == pose_id)
        uses = [r for r in body_rows if r['pose'] == pose_id]
        assert uses, 'New registered pose was not exercised: ' + pose_id
        new_poses.append({'pose': pose_id, 'nativeSize': encoding['nativeSize'],
            'registeredRuntimeSize': encoding['runtimeSize'], 'uniformRegistrationScale': reg['uniformScale'],
            'sourceCollar': reg['sourceCollar'], 'offset': reg['offset'], 'basis': reg['basis'],
            'minimumNativeBodyEffectivePpi': min(r['nativeBodyEffectivePpi'] for r in uses),
            'runtimeCanvasIsNativeResolution': False,
            'note': '透明留白及统一对齐重采样不增加原始细节；有效PPI按原始PNG像素及场景整体缩放计算。'})
    minimum = min(row['backgroundEffectivePpi'] for row in background_rows)
    report = {'scope': '第二级最后三本；22页正文插画框128×131mm；封面和小结因版面不同不套用正文PPI',
        'panelMm': PANEL_MM, 'backgroundFormula': 'nativeWidth * camera.width / world.width / (128 / 25.4), and equivalent height; take smaller value',
        'bodyFormula': '(1176 / 640) * camera.width * 25.4 / (registrationScale * sceneScale * 128), and equivalent height; take smaller value',
        'minimumBackgroundEffectivePpi': minimum,
        'maximumBackgroundEffectivePpi': max(row['backgroundEffectivePpi'] for row in background_rows),
        'lowestBackgroundPages': [r for r in background_rows if r['backgroundEffectivePpi'] == minimum],
        'records': background_rows, 'newPoseNativeResolution': new_poses, 'newPosePageUses': body_rows,
        'encodingVerification': encodings, 'native300PpiClaimed': False,
        'outputRasterResolutionIsNotSourceResolution': True,
        'limitations': ['本记录不是300ppi整册证明。', '背景与两个新增动作逐页计算；其他道具及已有动作未作本次全量PPI认证。',
                       'RGB电子校样未经印厂实物打样或色彩确认。'],
        'browserRecordSha256': sha(qa_file)}
    target = OUT / 'native-resolution-audit.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(json.dumps({'file': str(target), 'bodyPages': len(background_rows),
                     'minimumBackgroundEffectivePpi': minimum,
                     'newPoseMinimumPpi': {p['pose']: p['minimumNativeBodyEffectivePpi'] for p in new_poses}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
