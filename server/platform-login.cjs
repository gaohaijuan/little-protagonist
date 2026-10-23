'use strict';
const { hash } = require('./store.cjs');
const PLATFORM_POLICY_VERSION = 'platform-account-v1';
const fail = (status, message) => Object.assign(Error(message), { status });
function createPlatformLogin({ wxAppId, wxSecret, douyinAppId, douyinSecret, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const providers = { wechat: { appId: wxAppId, secret: wxSecret }, douyin: { appId: douyinAppId, secret: douyinSecret } };
  const consumed = new Map();
  function configured(platform) { const provider = providers[platform]; return !!(provider && provider.appId && provider.secret); }
  async function exchange(platform, input, { requireConsent = true } = {}) {
    if (!Object.hasOwn(providers, platform)) throw fail(400, '不支持的小程序平台');
    if (!configured(platform)) throw fail(503, platform === 'wechat' ? '尚未配置正式微信登录' : '尚未配置正式抖音登录');
    if (!input || typeof input.code !== 'string' || !input.code || input.code.length > 256 || /[\x00-\x20]/.test(input.code)) throw fail(400, '小程序登录凭证无效');
    if (['openid', 'openId', 'userId', 'session_key'].some(key => Object.hasOwn(input, key))) throw fail(400, '用户身份须由平台登录验证取得');
    if (requireConsent && input.consentVersion !== PLATFORM_POLICY_VERSION) throw fail(400, '请先同意小程序账号与运营服务说明');
    for (const [key, expires] of consumed) if (expires <= now()) consumed.delete(key);
    const key = hash(platform + ':' + input.code);
    if (consumed.has(key)) throw fail(409, '登录凭证已使用，请重新发起平台登录');
    if (consumed.size >= 5000) throw fail(429, '登录请求较多，请稍后重试');
    consumed.set(key, now() + 10 * 60000);
    const provider = providers[platform];
    let response, value;
    try {
      if (platform === 'wechat') {
        const query = new URLSearchParams({ appid: provider.appId, secret: provider.secret, js_code: input.code, grant_type: 'authorization_code' });
        response = await fetchImpl('https://api.weixin.qq.com/sns/jscode2session?' + query, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) });
      } else {
        response = await fetchImpl('https://developer.toutiao.com/api/apps/v2/jscode2session', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appid: provider.appId, secret: provider.secret, code: input.code }), signal: AbortSignal.timeout(10000) });
      }
      value = await response.json();
    } catch (_) { throw fail(502, '暂时无法验证平台登录，请重新登录'); }
    const identity = platform === 'wechat' ? value : value?.data;
    const invalid = platform === 'wechat' ? !!value?.errcode : value?.err_no !== 0;
    if (!response.ok || invalid || !identity || typeof identity.openid !== 'string' || !identity.openid || identity.openid.length > 256) throw fail(401, '平台登录验证失败，请重新登录');
    // Keep the existing WeChat cloud-account ID. Douyin has an independent
    // namespace; matching OpenID strings never merge two platform accounts.
    const accountId = 'usr_' + hash((platform === 'wechat' ? '' : 'douyin:') + provider.appId + ':' + identity.openid).slice(0, 40);
    return { accountId, identity: 'account:' + accountId, source: platform };
  }
  return { configured, exchange };
}
module.exports = { createPlatformLogin, PLATFORM_POLICY_VERSION };
