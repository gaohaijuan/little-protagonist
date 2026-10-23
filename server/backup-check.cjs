'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{crc32}=require('node:zlib'),{DatabaseSync}=require('node:sqlite');
const Zip=require('../preview/vendor/jszip/jszip.min.js');
const {openStore}=require('./store.cjs'),{createPrintOrders}=require('./print-orders.cjs'),{createBilling}=require('./billing.cjs');
const LIMITS=Object.freeze({archive:512*1024**2,database:256*1024**2,pdf:100*1024**2,total:2304*1024**2,entries:10000});
const failure=message=>Object.assign(Error(message),{status:422});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function restoreBackupForCheck(archive,work,{now=Date.now()}={}){
  if(fs.existsSync(work))throw Object.assign(Error('该备份已有校验任务，请稍后刷新'),{status:409});
  if(fs.statSync(archive).size>LIMITS.archive)throw failure('本机恢复校验暂支持512MiB以内备份；此限制不影响原包下载');
  let zip;try{zip=await Zip.loadAsync(fs.readFileSync(archive));}catch(_){throw failure('备份不是可读取的ZIP文件');}
  const entries=Object.values(zip.files);if(entries.length>LIMITS.entries)throw failure('备份条目过多，不能执行本机校验');let total=0;
  for(const entry of entries){
    const allowed=['operations.sqlite','manifest.json','恢复说明.txt','files/'].includes(entry.name)||/^files\/[0-9a-f-]{36}\.pdf$/.test(entry.name);
    if(!allowed||(entry.unsafeOriginalName&&entry.unsafeOriginalName!==entry.name)||(entry.dir&&entry.name!=='files/'))throw failure('备份包含非预期文件或不安全路径');
    if(entry.dir)continue;
    // The bundled JSZip exposes central-directory sizes before decompression.
    const size=entry._data?.uncompressedSize,limit=entry.name==='operations.sqlite'?LIMITS.database:entry.name.endsWith('.pdf')?LIMITS.pdf:2*1024**2;
    if(!Number.isSafeInteger(size)||size<0||size>limit)throw failure('备份单个条目超过校验大小限制');total+=size;
  }
  if(total>LIMITS.total)throw failure('备份展开后的大小超过本机校验限制');
  for(const name of ['operations.sqlite','manifest.json','恢复说明.txt'])if(!zip.file(name))throw failure('备份缺少必要文件：'+name);
  async function read(name){const entry=zip.file(name);if(!entry)throw failure('清单中的文件缺失：'+name);let bytes;try{bytes=await entry.async('nodebuffer');}catch(_){throw failure('ZIP条目解压失败');}if(bytes.length!==entry._data.uncompressedSize||crc32(bytes)!==(entry._data.crc32>>>0))throw failure('ZIP条目校验失败：'+name);return bytes;}
  let manifest;try{manifest=JSON.parse((await read('manifest.json')).toString('utf8'));}catch(error){if(error.status)throw error;throw failure('备份清单不是有效JSON');}
  if(manifest.version!==1||typeof manifest.includeFiles!=='boolean'||manifest.sessionsIncluded!==false||!Array.isArray(manifest.files)||manifest.files.length>LIMITS.entries||!Number.isSafeInteger(manifest.created)||!Number.isSafeInteger(manifest.expires)||manifest.expires<manifest.created||!/^[a-f0-9]{64}$/.test(manifest.databaseSha256||''))throw failure('备份清单版本或字段无效');
  const seen=new Set(),included=new Set();for(const item of manifest.files){if(!/^[0-9a-f-]{36}$/.test(item.id||'')||seen.has(item.id)||typeof item.included!=='boolean'||!Number.isSafeInteger(item.expires))throw failure('备份PDF清单无效');seen.add(item.id);if(item.included){if(!manifest.includeFiles||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>LIMITS.pdf||!/^[a-f0-9]{64}$/.test(item.sha256||''))throw failure('PDF校验信息无效');included.add(item.id);}}
  for(const entry of entries)if(entry.name.endsWith('.pdf')&&!included.has(entry.name.slice(6,-4)))throw failure('ZIP包含未登记的PDF');
  const parent=path.dirname(work);let free=null;try{const disk=fs.statfsSync(parent);free=disk.bavail*disk.bsize;}catch(_){}
  if(free!==null&&free<total*2+16777216)throw failure('磁盘空间不足以完成隔离恢复校验');
  fs.mkdirSync(work,{mode:0o700});fs.mkdirSync(path.join(work,'files'),{mode:0o700});
  const database=await read('operations.sqlite');if(sha(database)!==manifest.databaseSha256)throw failure('数据库SHA-256与清单不一致');fs.writeFileSync(path.join(work,'operations.sqlite'),database,{mode:0o600});await read('恢复说明.txt');
  let snapshot;try{
    snapshot=new DatabaseSync(path.join(work,'operations.sqlite'),{readOnly:true});snapshot.exec('PRAGMA trusted_schema=OFF;');
    if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||snapshot.prepare('PRAGMA foreign_key_check').all().length)throw failure('数据库完整性或关联关系检查失败');
    const tables=new Set(snapshot.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row=>row.name));for(const name of ['users','prints','sessions','payments','print_orders','print_order_items','print_order_events','billing_products','billing_intents','billing_quotes'])if(!tables.has(name))throw failure('备份缺少业务表：'+name);
    if(snapshot.prepare('SELECT COUNT(*) n FROM sessions').get().n)throw failure('备份不应包含可恢复登录会话');
    for(const item of manifest.files){const row=snapshot.prepare('SELECT bytes,digest,expires,deleted FROM prints WHERE id=?').get(item.id);if(!row||row.expires!==item.expires||row.deleted)throw failure('PDF清单与数据库收件记录不一致');if(!item.included)continue;const bytes=await read('files/'+item.id+'.pdf');if(bytes.length!==item.bytes||sha(bytes)!==item.sha256||row.bytes!==item.bytes||row.digest!==item.sha256)throw failure('PDF原字节校验不一致');fs.writeFileSync(path.join(work,'files',item.id+'.pdf'),bytes,{mode:0o600});}
    const expected=snapshot.prepare('SELECT id FROM prints WHERE deleted IS NULL AND expires>?').all(manifest.created);if(manifest.includeFiles&&expected.some(row=>!seen.has(row.id)))throw failure('PDF清单漏掉数据库中的有效收件');
  }catch(error){if(error.status)throw error;throw failure('数据库无法读取或业务结构无效');}finally{snapshot?.close();}
  let restored;try{
    restored=openStore(work,30,()=>now);const orders=createPrintOrders(restored),billing=createBilling(restored,orders);orders.setBilling(billing);const count=(sql,...args)=>restored.get(sql,...args).n;
    const before={pdfs:count('SELECT COUNT(*) n FROM prints WHERE deleted IS NULL'),contacts:count('SELECT COUNT(*) n FROM print_orders WHERE contact_deleted IS NULL')};restored.cleanup();orders.cleanup();
    const available=restored.all('SELECT id FROM prints WHERE deleted IS NULL AND expires>?',now).filter(row=>fs.existsSync(path.join(work,'files',row.id+'.pdf'))).length;
    return {checkedAt:now,isolatedRestore:true,businessDataUntouched:true,databaseIntegrity:'ok',foreignKeysValid:true,sessionsRestored:0,includeFiles:manifest.includeFiles,pdfsVerified:included.size,pdfsMissing:manifest.files.filter(item=>!item.included).length,pdfsNotIncluded:manifest.includeFiles?0:expectedCount(restored),pdfsAvailableAfterCleanup:available,expiredPdfsCleaned:before.pdfs-count('SELECT COUNT(*) n FROM prints WHERE deleted IS NULL'),expiredContactsCleaned:before.contacts-count('SELECT COUNT(*) n FROM print_orders WHERE contact_deleted IS NULL'),users:count('SELECT COUNT(*) n FROM users'),orders:count('SELECT COUNT(*) n FROM print_orders'),paymentEvents:count('SELECT COUNT(*) n FROM payments')};
  }catch(error){if(error.status)throw error;throw failure('隔离目录中的业务数据无法正常打开');}finally{restored?.close();}
}
function expectedCount(store){return store.get('SELECT COUNT(*) n FROM prints WHERE deleted IS NULL AND expires>?',store.now()).n;}
module.exports={restoreBackupForCheck,LIMITS};
