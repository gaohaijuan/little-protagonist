'use strict';
const crypto = require('node:crypto');
if(Number(process.versions.node.split('.')[0])<24)throw Error('管理后台需要Node.js 24或更高版本，普通阅读预览仍可使用Node.js 18。');
const { createApplication } = require('./app.cjs');
const port = Number(process.env.ADMIN_PORT || 4180);
const host = process.env.ADMIN_HOST || '127.0.0.1';
const localDevelopment = host === '127.0.0.1' && !process.env.PUBLIC_ORIGIN;
const password = process.env.ADMIN_PASSWORD || (localDevelopment ? '111' : crypto.randomBytes(15).toString('base64url'));
if (host !== '127.0.0.1' && (!process.env.PUBLIC_ORIGIN?.startsWith('https://') || !process.env.ADMIN_PASSWORD)) throw Error('公开部署须设置HTTPS PUBLIC_ORIGIN和ADMIN_PASSWORD');
const app = createApplication({ adminPassword: password, localDevelopment, dataDir: process.env.ADMIN_DATA_DIR, publicOrigin: process.env.PUBLIC_ORIGIN, retentionDays: process.env.PRINT_RETENTION_DAYS,orderContactRetentionDays:process.env.ORDER_CONTACT_RETENTION_DAYS, wxAppId: process.env.WX_APP_ID, wxSecret: process.env.WX_APP_SECRET,douyinAppId:process.env.DOUYIN_APP_ID,douyinSecret:process.env.DOUYIN_APP_SECRET, accountBridgeSecret: process.env.ACCOUNT_BRIDGE_SECRET, paymentSecret: process.env.PAYMENT_EVENT_SECRET, onError: error => console.error('后台错误：', error.code || error.name) });
app.server.on('error', error => { console.error('后台启动失败：', error.code); process.exitCode = 1; });
app.server.listen(port, host, () => {
  console.log(`小小主角管理后台：http://${host}:${port}/admin\n配套阅读端：http://${host}:${port}/`);
  if (!process.env.ADMIN_PASSWORD) console.log('管理员密码：' + password + (localDevelopment ? '\n本机后台重启后仍使用此密码。' : '\n重启后密码更换；固定密码请设置 ADMIN_PASSWORD（至少12位）。'));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close());
