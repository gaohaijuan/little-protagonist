'use strict';
const os=require('node:os'),net=require('node:net');
function isPrivateIPv4(value){
  if(typeof value!=='string'||net.isIP(value)!==4)return false;
  const parts=value.split('.').map(Number);
  return parts[0]===10||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168;
}
const ipv4Number=value=>value.split('.').reduce((n,part)=>(n*256+Number(part))>>>0,0);
function lanAccess(origin){
  let url;try{url=new URL(origin);}catch(_){throw Error('局域网测试需要本机私有IPv4访问地址');}
  const entry=Object.values(os.networkInterfaces()).flat().find(item=>item.family==='IPv4'&&!item.internal&&item.address===url.hostname);
  if(url.protocol!=='http:'||!isPrivateIPv4(url.hostname)||!entry||url.username||url.password)throw Error('局域网测试需要本机私有IPv4访问地址');
  const mask=ipv4Number(entry.netmask),subnet=(ipv4Number(entry.address)&mask)>>>0;
  return address=>{
    const ip=(address||'').replace(/^::ffff:/,'');
    if(ip==='127.0.0.1'||ip==='::1')return true;
    return isPrivateIPv4(ip)&&((ipv4Number(ip)&mask)>>>0)===subnet;
  };
}
module.exports={isPrivateIPv4,lanAccess};
