import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((root/'migration/FILE_MANIFEST.json').read_text(encoding='utf-8'))
fail=[]
for e in manifest['files']:
 p=root/e['path'];h=hashlib.sha256()
 if not p.is_file():fail.append(e['path']+': missing');continue
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 if p.stat().st_size!=e['bytes'] or h.hexdigest()!=e['sha256']:fail.append(e['path']+': mismatch')
print(json.dumps({'checked':len(manifest['files']),'failures':fail},ensure_ascii=True))
sys.exit(bool(fail))
