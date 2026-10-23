'use strict';
const codec = require('../lib/account-backup');
let fileSequence = 0;
function createBackupService(wxApi, app, isCurrent) {
  const fs = wxApi.getFileSystemManager(), directory = wxApi.env.USER_DATA_PATH.replace(/\/+$/,'');
  const call = (owner, method, data) => new Promise((resolve,reject)=>owner[method]({...data,success:resolve,fail:reject}));
  const check = () => { if (!isCurrent()) throw Error('账号或页面已变化，请重新打开账号页后操作。'); };
  const remove = async path => { if(path)try{await call(fs,'unlink',{filePath:path});}catch(_){} };
  function newPath(extension) { return directory + '/account-backup-' + Date.now().toString(36) + '-' + (++fileSequence) + '.' + extension; }
  async function exportFile() {
    check();
    if(typeof wxApi.shareFileMessage!=='function')throw Error('当前微信版本不支持保存备份文件，请更新微信后重试。');
    const store=app.getProfileStore();if(!store.hasProfile())throw Error('请先保存小主角，再导出备份。');
    const profile=store.loadProfile({strict:true}),reading=app.getReadingStore().list();let image='';
    if(profile.avatarPath){
      const extension=/\.(png|jpe?g|webp)$/i.exec(profile.avatarPath)?.[1].toLowerCase();
      if(!extension)throw Error('头像格式无法备份，请重新保存小主角照片。');
      const result=await call(fs,'readFile',{filePath:profile.avatarPath,encoding:'base64'});
      image='data:image/'+(extension==='jpg'?'jpeg':extension)+';base64,'+result.data;
    }
    check();if(!store.isCurrent()||JSON.stringify(store.loadProfile({strict:true}))!==JSON.stringify(profile))throw Error('孩子资料已变化，请重新导出备份。');
    const text=codec.createNativeBackup(profile,image,reading),path=newPath('json');
    try {
      await call(fs,'writeFile',{filePath:path,data:text,encoding:'utf8'});check();
      await call(wxApi,'shareFileMessage',{filePath:path,fileName:'小小主角-微信资料备份.json'});
      return {exported:true};
    } finally {await remove(path);}
  }
  async function chooseFile() {
    check();if(typeof wxApi.chooseMessageFile!=='function')throw Error('当前微信版本不支持选择备份文件，请更新后重试。');
    const result=await call(wxApi,'chooseMessageFile',{count:1,type:'file',extension:['json']});check();
    const file=result.tempFiles?.[0];
    if(!file||!Number.isFinite(file.size)||file.size<1||file.size>codec.MAX_BACKUP_BYTES)throw Error('请选择不超过32MB的JSON备份文件。');
    const content=await call(fs,'readFile',{filePath:file.path,encoding:'utf8'});check();
    return prepareRestore(codec.parseNativeBackup(content.data));
  }
  function prepareRestore(input) {
    check();const backup=codec.parseNativeBackup(JSON.stringify(input)),store=app.getProfileStore(),readingStore=app.getReadingStore();
    const existed=store.hasProfile(),previous=store.loadProfile({strict:true}),previousReading=readingStore.list();
    let savedProfile=null,busy=false,done=false;
    return { summary:{name:backup.child.profile.name,age:backup.child.profile.age,className:backup.child.profile.className,
      hasPhoto:!!backup.child.avatarData,readingCount:backup.reading.length,targetName:existed?previous.name:''},
      async commit(){
        check();if(busy||done)throw Error('这次恢复已提交，请勿重复操作。');busy=true;let temporary='';
        try {
          if(!savedProfile){
            const avatar=backup.child.avatarData;
            if(avatar){
              const type=/^data:image\/(png|jpeg|webp);base64,/.exec(avatar)[1];temporary=newPath(type==='jpeg'?'jpg':type);
              await call(fs,'writeFile',{filePath:temporary,data:avatar.slice(avatar.indexOf(',')+1),encoding:'base64'});
              const info=await call(wxApi,'getImageInfo',{src:temporary});
              if(!Number.isFinite(info.width)||!Number.isFinite(info.height)||info.width<1||info.height<1||info.width>8192||info.height>8192||info.width*info.height>16000000)throw Error('备份中的头像尺寸无效或过大。');
              check();
            }
            savedProfile=await store.saveProfile(backup.child.profile,{...(temporary?{avatarTempPath:temporary}:{removeAvatar:true}),
              expectedProfile:previous,expectedHasProfile:existed,isCurrent:()=>isCurrent()&&JSON.stringify(readingStore.list())===JSON.stringify(previousReading)});
          } else if(!store.isCurrent()||JSON.stringify(store.loadProfile({strict:true}))!==JSON.stringify(savedProfile))throw Error('孩子资料已变化，请重新选择备份并确认。');
          check();
          try {readingStore.replace(backup.reading,previousReading);done=true;return{complete:true};}
          catch(error){return{complete:false,childRestored:true,message:'孩子资料已恢复，阅读记录暂未恢复：'+(error.message||error.errMsg||'本机存储不可用')};}
        } finally {busy=false;await remove(temporary);}
      }
    };
  }
  return {exportFile,chooseFile,prepareRestore};
}
module.exports={createBackupService};
