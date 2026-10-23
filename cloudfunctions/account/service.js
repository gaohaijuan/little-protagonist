'use strict';
const crypto = require('node:crypto');
const POLICY_VERSION = '2026-10-16';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function validateNickname(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/.test(value) || Array.from(value.trim()).length < 1 || Array.from(value.trim()).length > 16) fail('AUTH_INVALID_NICKNAME', '家长称呼请填写1至16个字，不含换行或控制字符。');
  return value.trim();
}
const generationOf = user => user.generation || 'legacy';
function publicUser(user) {
  return { id: user._id, displayName: user.nickname || '家长', nickname: user.nickname || '',
    onboardingCompleted: user.onboardingCompleted === true, accountVersion: generationOf(user), createdAt: user.createdAt || null };
}
function createAccountService(repository, { now = Date.now, randomToken = () => crypto.randomBytes(32).toString('hex') } = {}) {
  function userId(context) {
    if (!context || !context.OPENID || !context.APPID) fail('AUTH_REQUIRED', '请从微信小程序中登录。');
    return 'usr_' + hash(context.APPID + ':' + context.OPENID).slice(0, 40);
  }
  async function requireUser(context, token) {
    const id = userId(context);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('AUTH_EXPIRED', '登录已过期，请重新登录。');
    const session = await repository.getSession(hash(token));
    if (!session || session.userId !== id || session.expiresAt <= now()) fail('AUTH_EXPIRED', '登录已过期，请重新登录。');
    const user = await repository.getUser(id);
    if (!user || user.status === 'closed' || generationOf(user) !== (session.userGeneration || 'legacy')) fail('AUTH_EXPIRED', '登录已过期，请重新登录。');
    return { user: publicUser(user), expiresAt: session.expiresAt };
  }
  async function handle(event, context) {
    const id = userId(context);
    switch (event && event.action) {
      case 'login': {
        if (event.consentVersion !== POLICY_VERSION) fail('AUTH_CONSENT_REQUIRED', '请阅读并同意最新的用户服务说明和隐私说明。');
        const timestamp = now();
        let user = await repository.ensureUser(id, { createdAt: timestamp, generation: crypto.randomBytes(16).toString('hex'), status: 'active', nickname: '', onboardingCompleted: false });
        let isNewUser = !user.onboardingCompleted && !user.nickname;
        if (user.status === 'closed') {
          if (event.reRegister !== true) fail('AUTH_ACCOUNT_CLOSED', '此阅读账号已注销。若要再次使用，请明确选择重新注册。');
          const data = { createdAt: timestamp, generation: crypto.randomBytes(16).toString('hex'), status: 'active', nickname: '', onboardingCompleted: false };
          if (!await repository.updateUser(id, generationOf(user), data, { closed: true })) fail('AUTH_ACCOUNT_CHANGED', '账号状态已变化，请重新操作。');
          user = { ...data, _id: id }; isNewUser = true;
        }
        const token = randomToken(), expiresAt = timestamp + SESSION_DURATION;
        await repository.saveSession(hash(token), { userId: id, userGeneration: generationOf(user), createdAt: timestamp, expiresAt, consentVersion: POLICY_VERSION, consentAt: timestamp });
        const verified = await requireUser(context, token);
        return { ok: true, ...verified, token, isNewUser };
      }
      case 'session': return { ok: true, ...await requireUser(context, event.token) };
      case 'update-profile': {
        const verified = await requireUser(context, event.token);
        const nickname = validateNickname(event.nickname);
        if (!await repository.updateUser(id, verified.user.accountVersion, { nickname })) fail('AUTH_EXPIRED', '账号状态已变化，请重新登录。');
        return { ok: true, ...await requireUser(context, event.token) };
      }
      case 'complete-onboarding': {
        const verified = await requireUser(context, event.token);
        if (!await repository.updateUser(id, verified.user.accountVersion, { onboardingCompleted: true })) fail('AUTH_EXPIRED', '账号状态已变化，请重新登录。');
        return { ok: true, ...await requireUser(context, event.token) };
      }
      case 'close-account': {
        if (event.confirmation !== '注销') fail('AUTH_CONFIRMATION_REQUIRED', '请输入“注销”确认操作。');
        const verified = await requireUser(context, event.token);
        if (!await repository.closeUser(id, verified.user.accountVersion, crypto.randomBytes(16).toString('hex'), now())) fail('AUTH_EXPIRED', '账号状态已变化，请重新登录。');
        let sessionRecordsRemoved = true;
        try { await repository.removeUserSessions(id, verified.user.accountVersion); } catch (_) { sessionRecordsRemoved = false; }
        return { ok: true, closed: true, sessionRecordsRemoved };
      }
      case 'logout': {
        if (typeof event.token === 'string' && /^[a-f0-9]{64}$/.test(event.token)) {
          const tokenId = hash(event.token), session = await repository.getSession(tokenId);
          if (session && session.userId === id) await repository.removeSession(tokenId);
        }
        return { ok: true };
      }
      default: fail('AUTH_BAD_ACTION', '不支持的账号操作。');
    }
  }
  return { handle, requireUser };
}
module.exports = { createAccountService, POLICY_VERSION, SESSION_DURATION, validateNickname };
