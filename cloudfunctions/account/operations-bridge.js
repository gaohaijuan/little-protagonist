'use strict';
const https = require('node:https');
const crypto = require('node:crypto');
function exchangeOperationsSession(accountId, invite, settings = process.env) {
  if (!settings.OPERATIONS_ORIGIN || !settings.ACCOUNT_BRIDGE_SECRET) return Promise.resolve({ ok: false, code: 'AUTH_OPERATIONS_NOT_CONFIGURED', message: '运营统计尚未配置，不影响阅读。' });
  const origin = new URL(settings.OPERATIONS_ORIGIN);
  if (origin.protocol !== 'https:') throw Object.assign(Error('运营服务必须使用HTTPS'), { code: 'AUTH_OPERATIONS_CONFIG' });
  const raw = JSON.stringify({ accountId, invite: typeof invite === 'string' ? invite.slice(0, 50) : '' }), stamp = String(Date.now());
  const signature = crypto.createHmac('sha256', settings.ACCOUNT_BRIDGE_SECRET).update(stamp + '.' + raw).digest('hex');
  return new Promise((resolve, reject) => {
    const request = https.request(new URL('/internal/account-session', origin), { method: 'POST', timeout: 10000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw), 'X-Account-Timestamp': stamp, 'X-Account-Signature': signature } }, response => {
      let body = '';
      response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; if (body.length > 16384) request.destroy(Error('Response too large')); });
      response.on('end', () => { try { const result = JSON.parse(body); if (response.statusCode !== 200 || !result.ok) throw Error('Operation exchange failed'); resolve(result); } catch (_) { reject(Object.assign(Error('运营服务暂时不可用'), { code: 'AUTH_OPERATIONS_UNAVAILABLE' })); } });
    });
    request.on('timeout', () => request.destroy(Error('Timeout')));
    request.on('error', () => reject(Object.assign(Error('运营服务连接失败'), { code: 'AUTH_OPERATIONS_UNAVAILABLE' })));
    request.end(raw);
  });
}
module.exports = { exchangeOperationsSession };
