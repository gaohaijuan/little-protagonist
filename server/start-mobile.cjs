'use strict';
// Explicit, temporary LAN entry; production and the loopback-only 111 entry
// retain their existing guards. Never bind this test server to all interfaces.
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {createApplication}=require('./app.cjs');
const {isPrivateIPv4}=require('./lan-access.cjs');
function networkAddress(value){
  const candidates=Object.values(os.networkInterfaces()).flat().filter(item=>item.family==='IPv4'&&!item.internal&&isPrivateIPv4(item.address));
  if(value){if(!isPrivateIPv4(value)||!candidates.some(item=>item.address===value))throw Error('手机测试地址须为本机已连接的私有IPv4地址');return value;}
  if(candidates.length!==1)throw Error('请通过MOBILE_TEST_IP明确选择本机局域网IPv4地址');return candidates[0].address;
}
function start(){
  if(Number(process.versions.node.split('.')[0])<24)throw Error('手机后台测试需要Node.js 24或更高版本');
  const host=networkAddress(process.env.MOBILE_TEST_IP),port=Number(process.env.MOBILE_TEST_PORT||4181);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('手机测试端口须为1024–65535');
  const configPath=path.resolve(__dirname,'../.local/mobile-test.json');fs.mkdirSync(path.dirname(configPath),{recursive:true});
  let config={};if(fs.existsSync(configPath))config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  config.password='111';fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  const app=createApplication({adminPassword:config.password,lanDevelopment:true,publicOrigin:`http://${host}:${port}`,dataDir:process.env.ADMIN_DATA_DIR,retentionDays:process.env.PRINT_RETENTION_DAYS,orderContactRetentionDays:process.env.ORDER_CONTACT_RETENTION_DAYS,wxAppId:process.env.WX_APP_ID,wxSecret:process.env.WX_APP_SECRET,douyinAppId:process.env.DOUYIN_APP_ID,douyinSecret:process.env.DOUYIN_APP_SECRET,accountBridgeSecret:process.env.ACCOUNT_BRIDGE_SECRET,paymentSecret:process.env.PAYMENT_EVENT_SECRET,onError:e=>console.error('手机测试服务错误：',e.code||e.name)});
  app.server.on('error',e=>{console.error('手机测试服务启动失败：',e.code);process.exitCode=1;});
  app.server.listen(port,host,()=>{console.log(`手机阅读测试：http://${host}:${port}/\n手机后台：http://${host}:${port}/admin\n手机后台测试密码：${config.password}\n手机须连接与电脑相同的局域网，电脑及此服务须保持运行。`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close());
  return app;
}
if(require.main===module)start();
module.exports={isPrivateIPv4,networkAddress};
