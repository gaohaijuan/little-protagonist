'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{once}=require('node:events'),{DatabaseSync}=require('node:sqlite');
const {createApplication}=require('../server/app.cjs'),{hash}=require('../server/store.cjs'),Zip=require('../preview/vendor/jszip/jszip.min.js');
const PDF=Buffer.from('%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF');
async function setup(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'little-story-system-'));let clock=Date.now();const errors=[];
  const app=createApplication({adminPassword:'system-test-password',dataDir:directory,now:()=>clock,quotaBytes:4096,onError:e=>errors.push(e.message)});
  app.server.listen(20000+crypto.randomInt(40000),'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;
  const post=(route,value,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  const login=await post('/api/admin/login',{password:'system-test-password'}),admin={Cookie:login.headers.get('set-cookie').split(';')[0],'X-Admin-CSRF':(await login.json()).csrf},session=app.store.userSession(),auth={Authorization:'Bearer '+session.token};
  async function receipt(){const response=await fetch(base+'/api/prints?book=level-1&title='+encodeURIComponent('第1级合集'),{method:'POST',headers:{...auth,'Content-Type':'application/pdf','X-Print-Consent':'operator-file-v1','Idempotency-Key':crypto.randomUUID()},body:PDF});assert.equal(response.status,201);return(await response.json()).id;}
  async function create(includeFiles){const response=await post('/api/admin/backups',{includeFiles},admin);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return response.json();}
  async function archive(id){const response=await fetch(base+'/api/admin/backups/'+id+'/file',{headers:admin});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');return Zip.loadAsync(Buffer.from(await response.arrayBuffer()),{checkCRC32:true});}
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));assert.deepEqual(errors,[]);const resolved=path.resolve(directory);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('little-story-system-'))throw Error('Unsafe test cleanup');fs.rmSync(resolved,{recursive:true,force:true});});
  return {...app,directory,base,post,admin,session,auth,receipt,create,archive,advance:ms=>clock+=ms};
}
test('system, audit and backups remain private; all backup mutations require CSRF',async t=>{
  const f=await setup(t);for(const route of ['/api/admin/system','/api/admin/audit'])assert.equal((await fetch(f.base+route)).status,401);
  assert.equal((await f.post('/api/admin/backups',{includeFiles:false})).status,401);assert.equal((await f.post('/api/admin/backups',{includeFiles:false},{Cookie:f.admin.Cookie})).status,403);assert.equal((await f.post('/api/admin/backups',{includeFiles:'yes'},f.admin)).status,400);
  const b=await f.create(false);assert.equal((await fetch(f.base+'/api/admin/backups/'+b.id+'/file')).status,401);assert.equal((await fetch(f.base+'/.local/admin-data/backups/'+b.id+'.zip')).status,404);
  assert.equal((await fetch(f.base+'/api/admin/backups/'+b.id,{method:'DELETE',headers:{Cookie:f.admin.Cookie}})).status,403);
});
test('explicit fetch transfer returns the same ZIP bytes without forcing an attachment and still requires login',async t=>{
  const f=await setup(t),saved=await f.create(false),route='/api/admin/backups/'+saved.id+'/file';
  const direct=await fetch(f.base+route,{headers:f.admin});assert.equal(direct.status,200);assert.match(direct.headers.get('content-disposition'),/^attachment;/);const bytes=Buffer.from(await direct.arrayBuffer());
  const transfer=await fetch(f.base+route,{headers:{...f.admin,'X-Backup-Transfer':'fetch'}});assert.equal(transfer.status,200);assert.equal(transfer.headers.get('content-type'),'application/zip');assert.equal(transfer.headers.get('content-disposition'),null);assert.equal(transfer.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await transfer.arrayBuffer()),bytes);
  assert.equal((await fetch(f.base+route,{headers:{'X-Backup-Transfer':'fetch'}})).status,401);
});
test('diagnostics identify missing files and overdue orders without exposing raw error messages or secrets',async t=>{
  const f=await setup(t),id=await f.receipt(),account=f.store.authenticate(f.session.token),o=f.orders.create(account,{consentVersion:'print-order-v1',requestKey:crypto.randomUUID(),items:[{receiptId:id,copies:1}],recipient:{method:'pickup',name:'家长',phone:'13800000000'}});
  f.store.run('UPDATE print_orders SET created=created-? WHERE id=?',3*86400000,o.id);fs.rmSync(path.join(f.directory,'files',id+'.pdf'));f.system.recordError('reader',Object.assign(Error('private-password-and-secret'),{code:'EIO'}));
  const response=await fetch(f.base+'/api/admin/system',{headers:f.admin}),value=await response.json();assert.equal(response.status,200);assert.equal(value.storage.missingFiles,1);assert.equal(value.orders.pendingOver48Hours,1);assert.equal(value.errors[0].code,'EIO');assert.equal(value.connections.gatewayReady,false);assert.ok(value.alerts.length>=3);assert.ok(!JSON.stringify(value).includes('private-password-and-secret'));assert.ok(!JSON.stringify(value).includes(f.session.token));
});
test('audit search, action filters, date and pagination use the same rows',async t=>{
  const f=await setup(t);for(let i=0;i<31;i++)f.store.audit('test-action','needle-'+i);f.store.audit('other-action','needle-extra');
  const data=f.system.audits({days:'all',q:'needle',action:'test-action',page:2});assert.equal(data.total,31);assert.equal(data.rows.length,6);assert.ok(data.rows.every(r=>r.action==='test-action'));assert.ok(data.actions.includes('test-action'));assert.equal(f.system.audits({days:'all',q:"' OR 1=1 --"}).total,0);
  assert.equal((await fetch(f.base+'/api/admin/audit?page=0',{headers:f.admin})).status,400);assert.equal((await fetch(f.base+'/api/admin/audit?days=bad',{headers:f.admin})).status,400);
});
test('full backup contains a consistent readable database and exact verified PDFs, with no login sessions',async t=>{
  const f=await setup(t),id=await f.receipt(),account=f.store.authenticate(f.session.token),order=f.orders.create(account,{consentVersion:'print-order-v1',requestKey:crypto.randomUUID(),items:[{receiptId:id,copies:3}],recipient:{method:'pickup',name:'测试联系人',phone:'13800000000'}});
  f.store.payment({eventId:'backup-paid-1',orderId:'backup-order-1',transactionId:'backup-tx-1',userId:account.id,kind:'paid',amountFen:3000},'test');
  const saved=await f.create(true),zip=await f.archive(saved.id),manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.sessionsIncluded,false);assert.equal(saved.file_count,1);assert.deepEqual(await zip.file('files/'+id+'.pdf').async('nodebuffer'),PDF);
  const database=await zip.file('operations.sqlite').async('nodebuffer');assert.equal(hash(database),manifest.databaseSha256);assert.equal(manifest.files[0].sha256,hash(PDF));const file=path.join(f.directory,'snapshot-verification.sqlite');fs.writeFileSync(file,database);const snapshot=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(snapshot.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.equal(snapshot.prepare('SELECT COUNT(*) n FROM admin_backups').get().n,0);assert.equal(snapshot.prepare('SELECT recipient_name FROM print_orders WHERE id=?').get(order.id).recipient_name,'测试联系人');assert.equal(snapshot.prepare('SELECT copies FROM print_order_items').get().copies,3);assert.equal(snapshot.prepare('SELECT amount FROM payments').get().amount,3000);}finally{snapshot.close();}
  assert.ok(f.store.authenticate(f.session.token),'backup does not revoke live sessions');assert.ok(!fs.readdirSync(path.join(f.directory,'backups')).some(n=>n.endsWith('.work')||n.endsWith('.part')));
});
test('metadata-only and missing-PDF backups declare their contents accurately',async t=>{
  const f=await setup(t),id=await f.receipt(),metadata=await f.create(false),zip=await f.archive(metadata.id);assert.equal(metadata.file_count,0);assert.equal(zip.file(/^files\//).length,0);assert.equal(JSON.parse(await zip.file('manifest.json').async('string')).includeFiles,false);
  fs.rmSync(path.join(f.directory,'files',id+'.pdf'));const missing=await f.create(true),partial=await f.archive(missing.id),manifest=JSON.parse(await partial.file('manifest.json').async('string'));assert.equal(missing.missing_count,1);assert.equal(manifest.files[0].included,false);assert.equal(manifest.files[0].reason,'missing');
});
test('backup expiry follows source expiry and manual file deletion invalidates all server snapshots',async t=>{
  const f=await setup(t),id=await f.receipt();f.store.run('UPDATE prints SET expires=? WHERE id=?',f.store.now()+120000,id);const b=await f.create(true);assert.equal(b.expires,f.store.now()+120000);f.advance(120001);f.system.cleanup();assert.equal((await fetch(f.base+'/api/admin/backups/'+b.id+'/file',{headers:f.admin})).status,410);assert.ok(!fs.existsSync(path.join(f.directory,'backups',b.id+'.zip')));
  const next=await f.receipt(),full=await f.create(true),metadata=await f.create(false);assert.equal((await fetch(f.base+'/api/admin/prints/'+next,{method:'DELETE',headers:f.admin})).status,200);
  for(const snapshot of [full,metadata]){assert.equal((await fetch(f.base+'/api/admin/backups/'+snapshot.id+'/file',{headers:f.admin})).status,410);assert.ok(!fs.existsSync(path.join(f.directory,'backups',snapshot.id+'.zip')));}
});
test('corrupt PDFs fail visibly and leave no partial archive; concurrent entries cannot snapshot simultaneously',async t=>{
  const f=await setup(t),id=await f.receipt();fs.writeFileSync(path.join(f.directory,'files',id+'.pdf'),'changed');await assert.rejects(f.system.createBackup({includeFiles:true}),e=>e.status===409);assert.equal(f.system.overview().backups[0].status,'failed');assert.ok(!fs.readdirSync(path.join(f.directory,'backups')).some(n=>/\.(zip|part|work)$/.test(n)));
  fs.writeFileSync(path.join(f.directory,'files',id+'.pdf'),PDF);const pending=f.system.createBackup({includeFiles:true});await assert.rejects(f.system.createBackup({includeFiles:false}),e=>e.status===409);
  const other=createApplication({adminPassword:'system-other-entry-password',dataDir:f.directory,now:f.store.now});try{await assert.rejects(other.system.createBackup({includeFiles:false}),e=>e.status===409);}finally{other.server.emit('close');}const done=await pending;assert.equal(done.status,'ready');
});
test('isolated restore checks recover snapshot records without replacing current users, contacts or sessions',async t=>{
  const f=await setup(t),id=await f.receipt(),owner=f.store.authenticate(f.session.token),order=f.orders.create(owner,{consentVersion:'print-order-v1',requestKey:crypto.randomUUID(),items:[{receiptId:id,copies:3}],recipient:{method:'pickup',name:'备份中的联系人',phone:'13800000000'}}),saved=await f.create(true);
  const later=f.store.userSession();f.orders.update(order.id,{version:order.version,recipient:{...order.recipient,name:'当前联系人'}});
  assert.equal((await f.post('/api/admin/backups/'+saved.id+'/verify',{})).status,401);assert.equal((await f.post('/api/admin/backups/'+saved.id+'/verify',{},{Cookie:f.admin.Cookie})).status,403);
  const response=await f.post('/api/admin/backups/'+saved.id+'/verify',{},f.admin),report=await response.json();assert.equal(response.status,200,JSON.stringify(report));assert.equal(report.databaseIntegrity,'ok');assert.equal(report.isolatedRestore,true);assert.equal(report.businessDataUntouched,true);assert.equal(report.users,1);assert.equal(report.orders,1);assert.equal(report.pdfsVerified,1);assert.equal(report.pdfsAvailableAfterCleanup,1);assert.equal(report.sessionsRestored,0);
  assert.equal(f.orders.detail(order.id).recipient_name,'当前联系人');assert.equal(f.store.get('SELECT COUNT(*) n FROM users').n,2);assert.ok(f.store.authenticate(later.token));assert.ok(f.store.authenticate(f.session.token));assert.deepEqual(fs.readFileSync(path.join(f.directory,'files',id+'.pdf')),PDF);assert.ok(!fs.existsSync(path.join(f.directory,'backups',saved.id+'.work')));const row=f.system.overview().backups.find(b=>b.id===saved.id);assert.equal(row.verification_state,'passed');assert.equal(row.verification.orders,1);
});
test('metadata and missing-file checks report the recovery limits explicitly',async t=>{
  const f=await setup(t),id=await f.receipt(),metadata=await f.create(false);let report=await f.system.verify(metadata.id);assert.equal(report.includeFiles,false);assert.equal(report.pdfsVerified,0);assert.equal(report.pdfsNotIncluded,1);assert.equal(report.pdfsAvailableAfterCleanup,0);
  fs.rmSync(path.join(f.directory,'files',id+'.pdf'));const partial=await f.create(true);report=await f.system.verify(partial.id);assert.equal(report.pdfsMissing,1);assert.equal(report.pdfsVerified,0);assert.equal(report.includeFiles,true);assert.ok(!fs.existsSync(path.join(f.directory,'backups',partial.id+'.work')));
});
test('restore validation rejects corrupt archives, changed databases and unsafe ZIP paths',async t=>{
  const f=await setup(t),saved=await f.create(false),file=path.join(f.directory,'backups',saved.id+'.zip'),original=fs.readFileSync(file);
  fs.writeFileSync(file,'broken zip');await assert.rejects(f.system.verify(saved.id),e=>e.status===422);assert.equal(f.system.overview().backups[0].verification_state,'failed');
  const changed=await Zip.loadAsync(original),database=await changed.file('operations.sqlite').async('nodebuffer');database[20]^=1;changed.file('operations.sqlite',database);fs.writeFileSync(file,await changed.generateAsync({type:'nodebuffer'}));await assert.rejects(f.system.verify(saved.id),e=>e.status===422&&/SHA-256/.test(e.message));
  const unsafe=await Zip.loadAsync(original);unsafe.file('../escaped.txt','no extraction');fs.writeFileSync(file,await unsafe.generateAsync({type:'nodebuffer'}));await assert.rejects(f.system.verify(saved.id),e=>e.status===422&&/路径|文件/.test(e.message));assert.ok(!fs.existsSync(path.join(f.directory,'backups','escaped.txt')));assert.ok(!fs.existsSync(path.join(f.directory,'backups',saved.id+'.work')));assert.ok(f.store.authenticate(f.session.token));
});
test('recovery rehearsal honors original PDF and contact expiries inside the isolated copy',async t=>{
  const {restoreBackupForCheck}=require('../server/backup-check.cjs'),f=await setup(t),id=await f.receipt(),owner=f.store.authenticate(f.session.token),order=f.orders.create(owner,{consentVersion:'print-order-v1',requestKey:crypto.randomUUID(),items:[{receiptId:id,copies:1}],recipient:{method:'pickup',name:'保留在原库的联系人',phone:'13800000000'}}),saved=await f.create(true),work=path.join(f.directory,'backups',crypto.randomUUID()+'.work');
  const report=await restoreBackupForCheck(path.join(f.directory,'backups',saved.id+'.zip'),work,{now:f.store.now()+100*86400000});assert.equal(report.expiredPdfsCleaned,1);assert.equal(report.expiredContactsCleaned,1);assert.equal(report.pdfsAvailableAfterCleanup,0);assert.ok(!fs.existsSync(path.join(work,'files',id+'.pdf')));assert.ok(fs.existsSync(path.join(f.directory,'files',id+'.pdf')));assert.equal(f.orders.detail(order.id).recipient_name,'保留在原库的联系人');
});
test('verification shares the cross-entry work lock and cannot operate on expired snapshots',async t=>{
  const f=await setup(t),saved=await f.create(false),pending=f.system.verify(saved.id);await assert.rejects(f.system.createBackup({includeFiles:false}),e=>e.status===409);const other=createApplication({adminPassword:'other-entry-test-password',dataDir:f.directory,now:f.store.now});try{await assert.rejects(other.system.verify(saved.id),e=>e.status===409);}finally{other.server.emit('close');}await pending;f.advance(600001);await assert.rejects(f.system.verify(saved.id),e=>e.status===410);
});
test('restore check bounds ZIP expansion before extraction and checks per-entry CRC',async t=>{
  const f=await setup(t),saved=await f.create(false),file=path.join(f.directory,'backups',saved.id+'.zip'),original=fs.readFileSync(file),signature=Buffer.from([0x50,0x4b,0x01,0x02]),central=original.indexOf(signature);assert.ok(central>=0);
  const oversized=Buffer.from(original);oversized.writeUInt32LE(256*1024**2+1,central+24);fs.writeFileSync(file,oversized);await assert.rejects(f.system.verify(saved.id),e=>e.status===422&&/大小限制/.test(e.message));assert.ok(!fs.existsSync(path.join(f.directory,'backups',saved.id+'.work')));
  const badCrc=Buffer.from(original);badCrc.writeUInt32LE((badCrc.readUInt32LE(central+16)^1)>>>0,central+16);fs.writeFileSync(file,badCrc);await assert.rejects(f.system.verify(saved.id),e=>e.status===422&&/ZIP条目校验/.test(e.message));assert.ok(!fs.existsSync(path.join(f.directory,'backups',saved.id+'.work')));
});
