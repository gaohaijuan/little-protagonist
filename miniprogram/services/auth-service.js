'use strict';
const config = require('../config/auth');
const { POLICY_VERSION, validateNickname } = require('../lib/account-policy');
const STORAGE_KEY = 'little-story.auth.v1';
const services = new WeakMap();
function authError(code, message) { return Object.assign(new Error(message), { code }); }

function createAuthService(wxApi, settings = config, runtime = {}) {
  const now = runtime.now || Date.now, schedule = runtime.setTimeout || setTimeout, cancel = runtime.clearTimeout || clearTimeout;
  const key = STORAGE_KEY + ':' + settings.envId;
  const listeners = new Set();
  let current = { status: 'guest', user: null, error: '' };
  let session = null, pending = null, revision = 0, initialized = false, expiryTimer = null;
  const configured = () => !!(settings.envId && wxApi.cloud && wxApi.cloud.init && wxApi.cloud.callFunction);
  const readSnapshot = () => ({ ...current, user: current.user ? { ...current.user } : null, configured: configured() });
  const snapshot = () => { expireIfNeeded(); return readSnapshot(); };
  function update(status, user = null, error = '') {
    current = { status, user, error };
    listeners.forEach(listener => listener(readSnapshot()));
  }
  function clearExpiryTimer() { if (expiryTimer !== null) cancel(expiryTimer); expiryTimer = null; }
  function invalidate(message) {
    clearExpiryTimer(); revision++; pending = null; session = null;
    try { wxApi.removeStorageSync(key); }
    catch (_) { try { wxApi.setStorageSync(key, { version: 0 }); } catch (_) {} }
    update('guest', null, message);
  }
  function expireIfNeeded() {
    if (!session || current.status !== 'authenticated' || session.expiresAt > now()) return false;
    invalidate('登录已到期，请重新登录。孩子资料仍保留在本机。');
    return true;
  }
  function armExpiry() {
    clearExpiryTimer();
    if (!session || current.status !== 'authenticated' || expireIfNeeded()) return;
    expiryTimer = schedule(() => { expiryTimer = null; if (!expireIfNeeded()) armExpiry(); }, Math.min(session.expiresAt - now(), 2147483647));
    if (expiryTimer && typeof expiryTimer.unref === 'function') expiryTimer.unref();
  }
  function invoke(functionName, data, action) {
    if (!configured()) return Promise.reject(authError('AUTH_NOT_CONFIGURED', '微信登录暂未开通，请先以游客身份阅读。'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (handler, value) => { if (settled) return; settled = true; cancel(timer); handler(value); };
      const timer = schedule(() => finish(reject, authError('AUTH_TIMEOUT', '账号服务响应较慢，请检查网络后重试。')), settings.timeoutMs || 15000);
      Promise.resolve().then(() => {
        if (!initialized) { wxApi.cloud.init({ env: settings.envId, traceUser: false }); initialized = true; }
        return wxApi.cloud.callFunction({ name: functionName, data });
      }).then(response => {
        const result = response && response.result;
        if (settled) {
          if (action === 'login' && result && result.ok && /^[a-f0-9]{64}$/.test(result.token || '') && result.token !== session?.token) void call('logout', { token: result.token }).catch(() => {});
          return;
        }
        if (action && (!result || !result.ok)) throw authError(result && result.code || 'AUTH_SERVICE_ERROR', result && result.message || '登录服务暂时不可用，请稍后重试。');
        finish(resolve, result);
      }).catch(error => finish(reject, typeof error?.code === 'string' && error.code.startsWith('AUTH_') ? error : authError('AUTH_NETWORK', '无法连接登录服务，请检查网络后重试。')));
    });
  }
  function call(action, data = {}) { return invoke(settings.functionName || 'account', { ...data, action }, action); }
  function valid(value) {
    return value && value.version === 1 && value.user && /^usr_[a-f0-9]{40}$/.test(value.user.id) &&
      typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token) && Number.isFinite(value.expiresAt) && value.expiresAt > now();
  }
  function accept(result, generation, fallbackToken) {
    expireIfNeeded();
    if (generation !== revision) {
      if (result.token) void call('logout', { token: result.token }).catch(() => {});
      throw authError('AUTH_CANCELLED', '登录已取消，请重新操作。');
    }
    const source = result.user || {};
    const nickname = source.nickname ? validateNickname(source.nickname) : '';
    const accountVersion = source.accountVersion || 'legacy';
    if (!/^(legacy|[a-f0-9]{32})$/.test(accountVersion)) throw authError('AUTH_INVALID_RESPONSE', '账号版本无效，请重新登录。');
    if (fallbackToken && session && current.status === 'authenticated' &&
        (source.id !== session.user.id || accountVersion !== session.user.accountVersion)) throw authError('AUTH_INVALID_RESPONSE', '账号信息发生变化，请重新登录确认。');
    const record = { version: 1, user: { id: source.id, nickname, displayName: nickname || '家长',
      onboardingCompleted: source.onboardingCompleted === true, accountVersion, createdAt: source.createdAt || null }, token: result.token || fallbackToken, expiresAt: result.expiresAt };
    if (!valid(record)) throw authError('AUTH_INVALID_RESPONSE', '登录信息无效，请重新登录。');
    try { wxApi.setStorageSync(key, record); }
    catch (_) {
      if (result.token) void call('logout', { token: record.token }).catch(() => {});
      throw authError('AUTH_STORAGE', '无法保存登录状态，请检查本机存储空间后重试。');
    }
    session = record;
    update('authenticated', record.user);
    if (session === record) armExpiry();
    return snapshot();
  }
  function run(work) {
    const operation = Promise.resolve().then(work);
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = null; }).catch(() => {});
    return operation;
  }
  function login({ consent = false, reRegister = false } = {}) {
    if (!consent) return Promise.reject(authError('AUTH_CONSENT_REQUIRED', '请先阅读并同意用户服务说明与隐私说明。'));
    expireIfNeeded();
    if (current.status === 'authenticated' && session) return Promise.resolve(snapshot());
    if (current.status === 'closing') return Promise.reject(authError('AUTH_BUSY', '正在注销账号，请稍候。'));
    if (pending) return pending;
    const generation = ++revision;
    update('loading');
    return run(async () => {
      try { return accept(await call('login', { consentVersion: POLICY_VERSION, reRegister }), generation); }
      catch (error) { if (generation === revision) update('guest', null, error.message); throw error; }
    });
  }
  function restore() {
    if (expireIfNeeded()) return Promise.resolve(readSnapshot());
    if (pending) return pending;
    if (current.status === 'authenticated' && session) return Promise.resolve(snapshot());
    session = null;
    let record;
    try { record = wxApi.getStorageSync(key); }
    catch (_) { update('offline', null, '无法读取登录状态，请重试。'); return Promise.resolve(snapshot()); }
    if (!valid(record)) {
      if (record && Number.isFinite(record.expiresAt) && record.expiresAt <= now()) invalidate('登录已到期，请重新登录。孩子资料仍保留在本机。');
      else if (current.status !== 'guest' || !current.error) update('guest');
      return Promise.resolve(readSnapshot());
    }
    const generation = ++revision;
    update('loading');
    return run(async () => {
      try { return accept(await call('session', { token: record.token }), generation, record.token); }
      catch (error) {
        if (generation !== revision) return snapshot();
        if (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_INVALID_RESPONSE') {
          invalidate('登录已过期，请重新登录。');
        } else update('offline', null, error.message);
        return snapshot();
      }
    });
  }
  async function logout() {
    let old = session, unreadable = false;
    if (!old) {
      try { const stored = wxApi.getStorageSync(key); if (stored?.version === 1 && /^[a-f0-9]{64}$/.test(stored.token || '')) old = { token: stored.token }; }
      catch (_) { unreadable = true; }
    }
    try { wxApi.removeStorageSync(key); }
    catch (_) { throw authError('AUTH_STORAGE', '无法清除本机登录状态，请检查存储后重试。'); }
    clearExpiryTimer(); revision++; pending = null; session = null; update('guest');
    if (!old) return { revoked: !unreadable };
    try { await call('logout', { token: old.token }); return { revoked: true }; }
    catch (_) { return { revoked: false }; }
  }
  function accountAction(action, data = {}) {
    expireIfNeeded();
    if (!session || current.status !== 'authenticated') return Promise.reject(authError('AUTH_REQUIRED', '请先登录家长账号。'));
    if (pending) return Promise.reject(authError('AUTH_BUSY', '上一项账号操作还未完成，请稍候。'));
    const generation = revision, token = session.token;
    return run(async () => {
      try { return accept(await call(action, { ...data, token }), generation, token); }
      catch (error) {
        if (['AUTH_EXPIRED','AUTH_INVALID_RESPONSE'].includes(error.code) && generation === revision) invalidate('登录已失效，请重新登录。');
        throw error;
      }
    });
  }
  function updateAccountProfile(nickname) {
    try { nickname = validateNickname(nickname); } catch (error) { return Promise.reject(error); }
    return accountAction('update-profile', { nickname });
  }
  function completeOnboarding() { return accountAction('complete-onboarding'); }
  function closeAccount({ confirmation } = {}) {
    if (confirmation !== '注销') return Promise.reject(authError('AUTH_CONFIRMATION_REQUIRED', '请输入“注销”确认操作。'));
    expireIfNeeded();
    if (!session || current.status !== 'authenticated') return Promise.reject(authError('AUTH_REQUIRED', '请先登录家长账号。'));
    if (pending) return Promise.reject(authError('AUTH_BUSY', '上一项账号操作还未完成，请稍候。'));
    const generation = ++revision, token = session.token, user = current.user;
    clearExpiryTimer(); update('closing', user);
    return run(async () => {
      try {
        const result = await call('close-account', { token, confirmation });
        if (generation !== revision) throw authError('AUTH_CANCELLED', '账号已切换，请重新确认操作。');
        if (result.closed !== true) throw authError('AUTH_INVALID_RESPONSE', '账号注销结果无法确认，请重试。');
        let localSessionCleared = true;
        try { wxApi.removeStorageSync(key); }
        catch (_) { localSessionCleared = false; try { wxApi.setStorageSync(key, { version: 0, closed: true }); localSessionCleared = true; } catch (_) {} }
        session = null; update('guest');
        return { ...result, localSessionCleared };
      } catch (error) {
        if (generation === revision) {
          if (error.code === 'AUTH_EXPIRED') invalidate('账号状态已变化，请重新登录确认。');
          else { update('authenticated', user, error.message); armExpiry(); }
        }
        throw error;
      }
    });
  }
  async function callWithSession(functionName, data = {}) {
    expireIfNeeded();
    if (!session || current.status !== 'authenticated') {
      throw authError('AUTH_REQUIRED', '请先登录家长账号。');
    }
    const generation = revision;
    const result = await invoke(functionName, { ...data, sessionToken: session.token });
    expireIfNeeded();
    if (generation !== revision) throw authError('AUTH_CANCELLED', '账号已切换，请重新操作。');
    if (result && result.code === 'AUTH_EXPIRED') {
      invalidate('登录已过期，请重新登录。');
      throw authError('AUTH_EXPIRED', '登录已过期，请重新登录。');
    }
    return result;
  }
  return { getSnapshot: snapshot, login, restore, logout, callWithSession, updateAccountProfile, completeOnboarding, closeAccount,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
function getAuthService(wxApi) {
  if (!services.has(wxApi)) services.set(wxApi, createAuthService(wxApi));
  return services.get(wxApi);
}
module.exports = { STORAGE_KEY, createAuthService, getAuthService };
