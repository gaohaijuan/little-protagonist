'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync,backup}=require('node:sqlite');
const Zip=require('../preview/vendor/jszip/jszip.min.js');
const {pipeline}=require('node:stream/promises');
const {uid}=require('./store.cjs');
const {restoreBackupForCheck}=require('./backup-check.cjs');
const problem=(status,message)=>Object.assign(Error(message),{status});
function createSystemAdmin(store,{quotaBytes,platformStatus,cleanSource}={}){
  const {db,get,all,run,now}=store,start=now(),directory=path.join(store.directory,'backups');let busy=false,lastCleanup=null;
  fs.mkdirSync(directory,{recursive:true});
  db.exec(`CREATE TABLE IF NOT EXISTS admin_backups(id TEXT PRIMARY KEY,status TEXT NOT NULL,include_files INTEGER NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,bytes INTEGER NOT NULL DEFAULT 0,file_count INTEGER NOT NULL DEFAULT 0,missing_count INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS system_errors(id TEXT PRIMARY KEY,category TEXT NOT NULL,code TEXT NOT NULL,created INTEGER NOT NULL);`);
  const columns=new Set(all('PRAGMA table_info(admin_backups)').map(row=>row.name));
  for(const [name,type] of [['verification_state',"TEXT NOT NULL DEFAULT ''"],['verified_at','INTEGER'],['verification_json',"TEXT NOT NULL DEFAULT ''"],['verification_error',"TEXT NOT NULL DEFAULT ''"]])if(!columns.has(name))db.exec('ALTER TABLE admin_backups ADD COLUMN '+name+' '+type);
  function decorate(row){let verification=null;try{verification=row.verification_json?JSON.parse(row.verification_json):null;}catch(_){}return {...row,verification_json:undefined,verification};}
  function filename(id,suffix='.zip'){if(!/^[0-9a-f-]{36}$/.test(id))throw problem(404,'备份不存在');return path.join(directory,id+suffix);}
  function removeWork(target){const resolved=path.resolve(target);if(path.dirname(resolved)!==path.resolve(directory)||!/^[0-9a-f-]{36}\.work$/.test(path.basename(resolved)))throw Error('Unsafe backup work directory');fs.rmSync(resolved,{recursive:true,force:true});}
  const statSize=file=>{try{return fs.statSync(file).size;}catch(_){return 0;}};
  function recordError(category,error){const safe=/^[A-Z0-9_]{1,70}$/.test(error.code||'')?error.code:'INTERNAL_ERROR';run('INSERT INTO system_errors VALUES(?,?,?,?)',uid(),category,safe,now());run('DELETE FROM system_errors WHERE id IN(SELECT id FROM system_errors ORDER BY created DESC,rowid DESC LIMIT -1 OFFSET 200)');}
  function invalidateBackups(){for(const row of all("SELECT id FROM admin_backups WHERE status='ready'")){try{fs.rmSync(filename(row.id),{force:true});}catch(_){/* open downloads are retried by cleanup */}}run("UPDATE admin_backups SET status='expired',expires=? WHERE status IN ('ready','building')",now());}
  function cleanup(){
    for(const row of all("SELECT id FROM admin_backups WHERE expires<=? AND status IN ('ready','building')",now())){try{fs.rmSync(filename(row.id),{force:true});}catch(_){continue;}run("UPDATE admin_backups SET status='expired' WHERE id=?",row.id);}
    for(const name of fs.readdirSync(directory)){if(!/^[0-9a-f-]{36}\.(zip|part|work)$/.test(name))continue;const file=path.join(directory,name),id=name.slice(0,36),row=get('SELECT status,expires FROM admin_backups WHERE id=?',id);let modified;try{modified=fs.statSync(file).mtimeMs;}catch(_){continue;}if((!row||row.status!=='building')&&modified<now()-600000){try{if(name.endsWith('.work'))removeWork(file);else if(!row||row.status!=='ready')fs.rmSync(file,{force:true});}catch(_){/* retry after an open handle closes */}}}
    run('DELETE FROM system_errors WHERE created<?',now()-7*86400000);run("DELETE FROM admin_backups WHERE created<? AND status NOT IN ('building','ready')",now()-7*86400000);lastCleanup=now();
  }
  function overview(){
    cleanup();const stats=get('SELECT COUNT(*) count,COALESCE(SUM(bytes),0) bytes FROM prints WHERE deleted IS NULL AND expires>?',now()),files=all('SELECT id FROM prints WHERE deleted IS NULL AND expires>? ORDER BY created LIMIT 5000',now());let missing=0;
    for(const row of files)if(!fs.existsSync(path.join(store.directory,'files',row.id+'.pdf')))missing++;
    const pending=get("SELECT COUNT(*) count FROM print_orders WHERE state IN ('pending_confirmation','awaiting_payment','confirmed') AND created<?",now()-48*3600000).count,exceptions=get("SELECT COUNT(*) count FROM print_orders WHERE state='exception'").count;
    const reviews=get("SELECT COUNT(*) count FROM billing_intents i WHERE review<>'' AND (SELECT COALESCE(SUM(CASE kind WHEN 'paid' THEN amount ELSE -amount END),0) FROM payments WHERE order_id=i.merchant_order_id)>0").count;
    let freeBytes=null;try{const disk=fs.statfsSync(store.directory);freeBytes=disk.bavail*disk.bsize;}catch(_){}
    const errors=all('SELECT id,category,code,created FROM system_errors ORDER BY created DESC,rowid DESC LIMIT 20'),alerts=[];
    if(stats.bytes>=quotaBytes*.8)alerts.push({level:'warning',text:'打印文件空间使用超过80%，请处理旧文件或增加容量'});
    if(missing)alerts.push({level:'error',text:'有'+missing+'份未到期PDF在磁盘中缺失，请检查私有文件目录'});
    if(pending)alerts.push({level:'warning',text:pending+'个订单已等待超过48小时，请跟进处理'});
    if(reviews)alerts.push({level:'error',text:reviews+'笔异常收款仍有余额，请核对商户流水'});
    if(errors.some(e=>e.created>now()-86400000))alerts.push({level:'warning',text:'最近24小时记录到服务异常，可查看下方错误编号'});
    return {checkedAt:now(),startedAt:start,uptimeSeconds:Math.max(0,Math.floor((now()-start)/1000)),nodeVersion:process.versions.node,lastCleanup,storage:{...stats,quotaBytes,freeBytes,databaseBytes:statSize(path.join(store.directory,'operations.sqlite')),walBytes:statSize(path.join(store.directory,'operations.sqlite-wal')),missingFiles:missing,checkedFiles:files.length,scanLimited:stats.count>files.length},orders:{pendingOver48Hours:pending,exceptions},connections:{...platformStatus(),gatewayReady:false},alerts,errors,backups:all('SELECT * FROM admin_backups ORDER BY created DESC,rowid DESC LIMIT 10').map(row=>({...decorate(row),available:row.status==='ready'&&row.expires>now()&&fs.existsSync(filename(row.id))})),backupBusy:busy||!!get("SELECT COUNT(*) n FROM admin_backups WHERE (status='building' OR verification_state='checking') AND expires>?",now()).n,backupRetentionMinutes:10};
  }
  function audits({days='30',q='',action='',page=1}={}){
    if(!['7','30','90','all'].includes(days)||typeof q!=='string'||q.length>100||typeof action!=='string'||action.length>100||!Number.isSafeInteger(page)||page<1)throw problem(400,'操作记录筛选无效');
    const since=days==='all'?0:Date.parse(new Date(now()+8*3600000).toISOString().slice(0,10)+'T00:00:00+08:00')-(Number(days)-1)*86400000,args=[since,'%'+q+'%','%'+q+'%',action,action],where="created>=? AND (action LIKE ? OR target LIKE ?) AND (?='' OR action=?)";
    return {total:get('SELECT COUNT(*) n FROM audit WHERE '+where,...args).n,page,pageSize:25,rows:all('SELECT id,action,target,created FROM audit WHERE '+where+' ORDER BY created DESC,rowid DESC LIMIT 25 OFFSET ?',...args,(page-1)*25),actions:all('SELECT DISTINCT action FROM audit ORDER BY action LIMIT 200').map(row=>row.action)};
  }
  async function createBackup(input){
    if(typeof input.includeFiles!=='boolean')throw problem(400,'请选择是否包含PDF');if(busy)throw problem(409,'正在准备备份，请等待完成');
    cleanSource();cleanup();if(get("SELECT COUNT(*) n FROM admin_backups WHERE (status='building' OR verification_state='checking') AND expires>?",now()).n)throw problem(409,'另一后台入口正在制作备份，请稍后刷新');
    if(get("SELECT COUNT(*) n FROM admin_backups WHERE status='ready' AND expires>?",now()).n>=3)throw problem(409,'已有3份临时备份，请先下载或删除后再创建');
    let free=null;try{const disk=fs.statfsSync(directory);free=disk.bavail*disk.bsize;}catch(_){}
    const databaseBytes=statSize(path.join(store.directory,'operations.sqlite'))+statSize(path.join(store.directory,'operations.sqlite-wal')),pdfBytes=input.includeFiles?get('SELECT COALESCE(SUM(bytes),0) bytes FROM prints WHERE deleted IS NULL AND expires>?',now()).bytes:0;
    if(free!==null&&free<2*(databaseBytes+pdfBytes)+16777216)throw problem(507,'磁盘剩余空间不足，无法安全制作备份');
    busy=true;const id=uid(),created=now(),temporary=filename(id,'.part'),work=filename(id,'.work'),output=filename(id);let snapshot,streams=[];
    try{
      // Claim through SQLite, shared by the desktop and mobile processes.
      db.exec('BEGIN IMMEDIATE');try{if(get("SELECT COUNT(*) n FROM admin_backups WHERE (status='building' OR verification_state='checking') AND expires>?",now()).n)throw problem(409,'另一入口正在备份');run('INSERT INTO admin_backups(id,status,include_files,created,expires) VALUES(?,?,?,?,?)',id,'building',Number(input.includeFiles),created,created+600000);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
      fs.mkdirSync(work);const database=path.join(work,'operations.sqlite');await backup(db,database);snapshot=new DatabaseSync(database);
      snapshot.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; DELETE FROM sessions; DELETE FROM admin_backups; VACUUM;');
      if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed');
      const prints=snapshot.prepare('SELECT id,bytes,digest,expires FROM prints WHERE deleted IS NULL AND expires>?').all(created),contact=snapshot.prepare('SELECT MIN(contact_expires) expires FROM print_orders WHERE contact_deleted IS NULL').get().expires;
      const expires=prints.reduce((expires,p)=>Math.min(expires,p.expires),Math.min(created+600000,contact??Infinity));let copied=0,missing=0;const manifest={version:1,created,expires,includeFiles:input.includeFiles,sessionsIncluded:false,files:[],notice:'Private operations backup. Preserve original data retention periods. Restore requires offline maintenance; no live overwrite endpoint.'};
      if(input.includeFiles){for(const row of prints){const source=path.join(store.directory,'files',row.id+'.pdf'),destination=path.join(work,row.id+'.pdf');try{await fs.promises.copyFile(source,destination);}catch(error){if(error.code==='ENOENT'){missing++;manifest.files.push({id:row.id,included:false,reason:'missing',expires:row.expires});continue;}throw error;}
        const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(destination))digest.update(chunk);if(digest.digest('hex')!==row.digest||statSize(destination)!==row.bytes)throw problem(409,'PDF与收件校验值不一致，请检查文件后再备份');copied++;manifest.files.push({id:row.id,included:true,bytes:row.bytes,sha256:row.digest,expires:row.expires});}}
      snapshot.close();snapshot=null;const zip=new Zip();
      for(const name of fs.readdirSync(work)){if(name!=='operations.sqlite'&&!/^[0-9a-f-]{36}\.pdf$/.test(name))continue;const stream=fs.createReadStream(path.join(work,name));streams.push(stream);zip.file(name==='operations.sqlite'?name:'files/'+name,stream);}
      manifest.databaseSha256=await digestFile(database);zip.file('manifest.json',JSON.stringify(manifest,null,2));zip.file('恢复说明.txt','备份包含用户、订单、价格、核验资金流水、联系人和操作记录；'+(input.includeFiles?'同时包含有效期内可用PDF。':'本次未包含PDF原文件。')+'\n登录会话已移除，平台密钥和管理员密码不在备份中。\n恢复需在离线维护时进行：先保存当前库，停止所有后台入口，检查SQLite完整性和清单校验值，再将operations.sqlite及files中的文件放入私有数据目录，不覆盖运行中的数据库。\n恢复后按原始expires/contact_expires立即执行清理；过期PDF或联系人不得因恢复延长保存。\n下载到本机的备份不会随服务器自动清理，请按原保存期限管理、保护或删除。');
      await pipeline(zip.generateNodeStream({type:'nodebuffer',streamFiles:true,compression:'DEFLATE',compressionOptions:{level:1}}),fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
      if(expires<=now()||get('SELECT status FROM admin_backups WHERE id=?',id)?.status!=='building')throw problem(409,'备份期间数据已到期或被删除，请重新创建');
      const bytes=statSize(temporary);fs.renameSync(temporary,output);run("UPDATE admin_backups SET status='ready',expires=?,bytes=?,file_count=?,missing_count=? WHERE id=?",expires,bytes,copied,missing,id);store.audit('create-backup',id);return {...get('SELECT * FROM admin_backups WHERE id=?',id),available:true};
    }catch(error){if(snapshot)snapshot.close();streams.forEach(stream=>stream.destroy());try{fs.rmSync(temporary,{force:true});fs.rmSync(output,{force:true});}catch(_){}run("UPDATE admin_backups SET status='failed',error=? WHERE id=?",error.status?error.message:'备份制作失败，请检查磁盘空间和服务记录',id);recordError('backup',error);throw error.status?error:problem(500,'备份制作失败，请检查磁盘空间和服务记录');}
    finally{streams.forEach(stream=>stream.destroy());try{if(fs.existsSync(work))removeWork(work);}finally{busy=false;}}
  }
  async function digestFile(file){const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))digest.update(chunk);return digest.digest('hex');}
  async function verify(id){
    if(busy)throw problem(409,'正在进行备份或校验，请稍后刷新');const row=get('SELECT * FROM admin_backups WHERE id=?',id);
    if(!row)throw problem(404,'备份不存在');if(row.status!=='ready'||row.expires<=now()||!fs.existsSync(filename(id)))throw problem(410,'临时备份已失效，请重新生成');
    db.exec('BEGIN IMMEDIATE');try{if(get("SELECT COUNT(*) n FROM admin_backups WHERE (status='building' OR verification_state='checking') AND expires>?",now()).n)throw problem(409,'另一后台入口正在备份或校验');run("UPDATE admin_backups SET verification_state='checking',verified_at=?,verification_error='',verification_json='' WHERE id=?",now(),id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    busy=true;const work=filename(id,'.work');let ownWork=false;
    try{
      if(fs.existsSync(work))throw problem(409,'有尚未清理的校验目录，请重新生成备份');ownWork=true;
      const report=await restoreBackupForCheck(filename(id),work,{now:now()});
      if(get('SELECT status FROM admin_backups WHERE id=?',id)?.status!=='ready'||row.expires<=now())throw problem(410,'校验期间备份已失效，请重新生成');
      removeWork(work);ownWork=false;
      run("UPDATE admin_backups SET verification_state='passed',verified_at=?,verification_json=?,verification_error='' WHERE id=?",now(),JSON.stringify(report),id);store.audit('verify-backup',id);return report;
    }catch(error){run("UPDATE admin_backups SET verification_state='failed',verified_at=?,verification_error=? WHERE id=?",now(),error.status?error.message:'恢复校验失败，请检查备份文件',id);store.audit('verify-backup-failed',id);throw error.status?error:problem(500,'恢复校验失败，请检查备份文件');}
    finally{try{if(ownWork&&fs.existsSync(work))removeWork(work);}finally{busy=false;}}
  }
  function download(id){const row=get('SELECT * FROM admin_backups WHERE id=?',id);if(!row)throw problem(404,'备份不存在');if(row.status!=='ready'||row.expires<=now()||!fs.existsSync(filename(id)))throw problem(410,'临时备份已失效，请重新创建');store.audit('download-backup',id);return {...row,path:filename(id)};}
  function remove(id){const row=get('SELECT * FROM admin_backups WHERE id=?',id);if(!row)throw problem(404,'备份不存在');if(row.status==='building'||row.verification_state==='checking'&&row.expires>now())throw problem(409,'备份正在制作或校验，请完成后再删除');fs.rmSync(filename(id),{force:true});run("UPDATE admin_backups SET status='deleted',expires=? WHERE id=?",now(),id);store.audit('delete-backup',id);return {ok:true};}
  return {overview,audits,createBackup,download,remove,verify,cleanup,invalidateBackups,recordError};
}
module.exports={createSystemAdmin};
