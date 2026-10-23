'use strict';
const POLICY_VERSION = 'platform-account-v1';
const fail = (code, message) => Object.assign(Error(message), { code });
function createPlatformAuthService(platform, api, settings = {}) {
  if (!['wechat', 'douyin'].includes(platform)) throw Error('不支持的小程序平台');
  const base = (settings.baseUrl || '').replace(/\/$/, '');
  const configured = () => /^https:\/\/[^/?#]+$/.test(base) && ['login', 'request', 'getStorageSync', 'setStorageSync', 'removeStorageSync'].every(name => typeof api?.[name] === 'function');
  const key = 'little-story.platform-auth.v1:' + platform + ':' + (settings.appId || '') + ':' + base;
  const timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0 ? Math.min(settings.timeoutMs, 60000) : 15000;
  const listeners = new Set();
  let record = null, pending = null, revision = 0, current = { status: 'guest', user: null, error: '' }, invite = '';
  const snapshot = () => ({ ...current, user: current.user ? { ...current.user } : null, configured: configured(), platform });
  function update(status, error = '') { current = { status, user: status === 'authenticated' && record ? { id: record.userId, displayName: '家长', source: platform } : null, error }; listeners.forEach(fn => fn(snapshot())); }
  function request(route, { token, data, method = 'POST' } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false, task;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { finish(fail('PLATFORM_TIMEOUT', '平台服务响应超时，请重试')); if (task?.abort) task.abort(); }, timeoutMs);
      try { task = api.request({ url: base + route, method, data, dataType: 'json', timeout: timeoutMs, header: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, success(response) {
        let value = response.data;
        if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return finish(fail('PLATFORM_RESPONSE', '平台服务返回无效数据')); } }
        if (response.statusCode < 200 || response.statusCode >= 300) return finish(fail(response.statusCode === 401 ? 'AUTH_EXPIRED' : 'PLATFORM_SERVER', value?.error || '平台服务暂时不可用'));
        finish(null, value);
      }, fail: () => finish(fail('PLATFORM_NETWORK', '无法连接平台服务，请重试')) }); }
      catch (_) { finish(fail('PLATFORM_NETWORK', '无法连接平台服务，请重试')); }
    });
  }
  const revoke = token => request('/api/session/logout', { token, data: {} }).catch(() => false);
  function loginCode() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, code) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(code); };
      const timer = setTimeout(() => finish(fail('PLATFORM_TIMEOUT', '平台登录超时，请重试')), timeoutMs);
      try { api.login({ ...(platform === 'douyin' ? { force: true } : { timeout: timeoutMs }), success(value) {
        if (!value?.code || typeof value.code !== 'string' || (platform === 'douyin' && value.isLogin === false)) return finish(fail('PLATFORM_LOGIN', '请先登录平台账号后重试'));
        finish(null, value.code);
      }, fail: () => finish(fail('PLATFORM_LOGIN', '平台登录未完成，可以重试或继续游客阅读')) }); }
      catch (_) { finish(fail('PLATFORM_LOGIN', '当前环境无法使用小程序登录')); }
    });
  }
  function valid(value) {
    return value && value.version === 1 && value.source === platform && value.consentVersion === POLICY_VERSION && /^usr_[a-f0-9]{40}$/.test(value.userId || '') && /^[a-f0-9]{64}$/.test(value.token || '') && /^[a-f0-9]{18}$/.test(value.inviteCode || '') && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now();
  }
  function accept(value, generation, fallbackToken) {
    if (generation !== revision) { const stale=value?.token||fallbackToken;if(stale)void revoke(stale);throw fail('AUTH_CANCELLED', '登录已取消，请重新操作'); }
    const next = { version: 1, userId: value?.userId, source: value?.source, token: value?.token || fallbackToken, inviteCode: value?.inviteCode, expiresAt: value?.expiresAt, consentVersion: value?.consentVersion };
    if (!value?.ok || !valid(next)) { if (value?.token) void revoke(value.token); throw fail('AUTH_INVALID_RESPONSE', '平台登录信息无效，请重新登录'); }
    try { api.setStorageSync(key, next); } catch (_) { void revoke(next.token); throw fail('AUTH_STORAGE', '无法保存登录状态，请检查本机存储后重试'); }
    record = next; update('authenticated'); return snapshot();
  }
  function run(work) { const task = Promise.resolve().then(work); pending = task; void task.finally(() => { if (pending === task) pending = null; }).catch(() => {}); return task; }
  function login({ consent = false } = {}) {
    if (!consent) return Promise.reject(fail('AUTH_CONSENT_REQUIRED', '请先同意小程序账号与运营服务说明'));
    if (!configured()) return Promise.reject(fail('AUTH_NOT_CONFIGURED', '小程序平台服务尚未配置，可以继续游客阅读'));
    if (current.status === 'authenticated' && valid(record)) return Promise.resolve(snapshot());
    if (pending) return pending;
    const generation = ++revision; update('loading');
    return run(async () => {
      try { const code = await loginCode(); if (generation !== revision) throw fail('AUTH_CANCELLED', '登录已取消'); return accept(await request('/api/platform/' + platform + '/session', { data: { code, invite, consentVersion: POLICY_VERSION } }), generation); }
      catch (error) { if (generation === revision) { record = null; update('guest', error.message); } throw error; }
    });
  }
  function restore() {
    if (pending) return pending;
    if (!configured()) { record = null; update('guest'); return Promise.resolve(snapshot()); }
    let saved; try { saved = api.getStorageSync(key); } catch (_) { record = null; update('offline', '无法读取登录状态'); return Promise.resolve(snapshot()); }
    if (!valid(saved)) { record = null; update('guest'); return Promise.resolve(snapshot()); }
    const generation = ++revision; update('loading');
    return run(async () => {
      try { return accept(await request('/api/platform/session', { method: 'GET', token: saved.token }), generation, saved.token); }
      catch (error) { if (generation !== revision) return snapshot(); record = null;
        if (['AUTH_EXPIRED', 'AUTH_INVALID_RESPONSE'].includes(error.code)) { try { api.removeStorageSync(key); } catch (_) {} update('guest', '登录已过期，请重新登录'); }
        else update('offline', error.message);
        return snapshot();
      }
    });
  }
  async function logout() {
    let old = record;
    try { if(!old){const saved=api.getStorageSync(key);if(valid(saved))old=saved;}api.removeStorageSync(key); } catch (_) { throw fail('AUTH_STORAGE', '无法清除登录状态，请检查存储后重试'); }
    revision++; pending = null; record = null; update('guest');
    if (!old) return { revoked: true };
    const result = await revoke(old.token); return { revoked: !!result?.ok };
  }
  return { login, restore, logout, getSnapshot: snapshot, configured, setInvite(value) { invite = typeof value === 'string' ? value.slice(0, 50) : ''; },
    getOperationsSession() { if(current.status==='authenticated'&&!valid(record)){record=null;update('guest','登录已过期，请重新登录');}if (current.status !== 'authenticated' || !valid(record)) throw fail('AUTH_REQUIRED', '请先登录家长账号'); return { ...record }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
module.exports = { createPlatformAuthService, POLICY_VERSION };
