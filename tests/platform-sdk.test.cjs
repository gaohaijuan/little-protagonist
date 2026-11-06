'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApplication } = require('../server/app.cjs');
const { PLATFORM_POLICY_VERSION } = require('../server/platform-login.cjs');
const { createWechatSDK, createDouyinSDK } = require('../miniprogram/services/platform-sdk');
const { POLICY_VERSION } = require('../miniprogram/services/platform-auth-service');
const { createAccountService } = require('../cloudfunctions/account/service');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF');
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'little-story-platform-'));
  const providerCalls = [], codes = new Map(), provider = { error: false, offline: false };
  const app = createApplication({ adminPassword: 'platform-test-password', dataDir: directory, wxAppId: 'wx-test-app', wxSecret: 'wechat-secret-not-public', douyinAppId: 'tt-test-app', douyinSecret: 'douyin-secret-not-public', platformFetch: async (url, init) => {
    if (provider.offline) throw Error('secret-not-public upstream error');
    providerCalls.push({ url, init });
    const platform = url.startsWith('https://api.weixin.qq.com/') ? 'wechat' : 'douyin';
    const code = platform === 'wechat' ? new URL(url).searchParams.get('js_code') : JSON.parse(init.body).code;
    const identity = { openid: codes.get(code) || 'same-openid', session_key: 'private-session-key', unionid: 'private-union-id' };
    return Response.json(platform === 'wechat' ? provider.error ? { errcode: 40029, errmsg: 'secret-not-public' } : identity : { err_no: provider.error ? 40018 : 0, err_tips: 'secret-not-public', data: identity });
  }, ...options });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  function native(platform, controls = {}) {
    const calls = [], storage = new Map();
    const api = {
      login(value) { calls.push({ kind: 'login', value }); const code = crypto.randomUUID(); codes.set(code, controls.account || 'same-openid'); if (controls.holdLogin) controls.finishLogin = () => value.success({ code, isLogin: true }); else value.success(controls.anonymous ? { anonymousCode: code, isLogin: false } : { code, isLogin: true }); },
      request(value) {
        calls.push({ kind: 'request', value }); const controller = new AbortController();
        if (controls.offline) { value.fail({ errMsg: 'offline' }); return { abort() {} }; }
        const target = new URL(value.url);
        fetch(base + target.pathname + target.search, { method: value.method, headers: value.header, body: value.method === 'GET' ? undefined : value.data instanceof ArrayBuffer ? Buffer.from(value.data) : JSON.stringify(value.data), signal: controller.signal }).then(async response => {
          const result = { statusCode: response.status, data: await response.json() };
          if (controls.holdResponse && target.pathname === '/api/platform/' + platform + '/session') controls.finishResponse = () => value.success(result);
          else value.success(result);
        }).catch(() => value.fail({ errMsg: 'network' }));
        return { abort: () => controller.abort() };
      },
      getStorageSync: key => storage.get(key),
      setStorageSync(key, value) { if (controls.failStore) throw Error('storage full'); storage.set(key, structuredClone(value)); },
      removeStorageSync(key) { storage.delete(key); },
      getFileSystemManager: () => ({ readFile: value => value.success({ data: PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.byteLength) }) })
    };
    return { api, controls, calls, storage, sdk: (platform === 'wechat' ? createWechatSDK : createDouyinSDK)(api, { baseUrl: 'https://sdk.example.test', appId: platform === 'wechat' ? 'wx-test-app' : 'tt-test-app', shareTemplateId: platform === 'douyin' ? 'approved-template-placeholder' : '', timeoutMs: controls.timeoutMs || 3000 }) };
  }
  t.after(async () => {
    await new Promise(resolve => app.server.close(resolve));
    const absolute = path.resolve(directory);
    if (!absolute.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(absolute).startsWith('little-story-platform-')) throw Error('Unsafe test cleanup');
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return { ...app, base, native, provider, providerCalls };
}
const until = async predicate => { const deadline = Date.now() + 5000; while (!predicate()) { if (Date.now() > deadline) throw Error('Timed out waiting for test state'); await new Promise(resolve => setTimeout(resolve, 5)); } };
for (const platform of ['wechat', 'douyin']) test(platform + ' SDK: native code, server verification, share attribution, PDF receipt and revocation', async t => {
  const f = await fixture(t), native = f.native(platform), sdk = native.sdk;
  assert.equal(POLICY_VERSION, PLATFORM_POLICY_VERSION);
  await assert.rejects(sdk.login(), /同意/); assert.equal(native.calls.length, 0);
  await sdk.login({ consent: true }); const first = sdk.getSnapshot();
  assert.equal(first.status, 'authenticated'); assert.equal(first.user.source, platform); assert.ok(!Object.hasOwn(first, 'token'));
  assert.equal(native.calls.filter(call => call.kind === 'login').length, 1);
  const loginCall = native.calls.find(call => call.kind === 'login').value;
  assert.equal(platform === 'douyin' ? loginCall.force : loginCall.timeout, platform === 'douyin' ? true : 3000);
  const exchange = native.calls.find(call => call.kind === 'request' && call.value.url.endsWith('/' + platform + '/session')).value;
  assert.deepEqual(Object.keys(exchange.data).sort(), ['code', 'consentVersion', 'invite']);
  const upstream = f.providerCalls[0];
  if (platform === 'wechat') { assert.equal(new URL(upstream.url).hostname, 'api.weixin.qq.com'); assert.equal(upstream.init.method, 'GET'); assert.equal(new URL(upstream.url).searchParams.get('grant_type'), 'authorization_code'); }
  else { assert.equal(upstream.url, 'https://developer.toutiao.com/api/apps/v2/jscode2session'); assert.equal(upstream.init.method, 'POST'); assert.deepEqual(Object.keys(JSON.parse(upstream.init.body)).sort(), ['appid', 'code', 'secret']); }
  const share = sdk.onShareAppMessage(); assert.match(share.path, /invite=[a-f0-9]{18}/);
  if (platform === 'douyin') assert.equal(share.templateId, 'approved-template-placeholder'); else assert.ok(!share.templateId);
  const invited = f.native(platform, { account: 'invited-parent' }); invited.sdk.setInvite(new URL('https://example.test' + share.path).searchParams.get('invite'));
  await invited.sdk.login({ consent: true }); assert.equal(f.store.dashboard('30').referredUsers, 1);
  assert.equal(await sdk.track('read', 'intro'), true);
  const receipt = await sdk.submitPdf({ filePath: 'local.pdf', bookId: 'intro', title: '测试绘本', requestKey: crypto.randomUUID(), consent: true });
  assert.equal(f.store.get('SELECT user_id FROM prints WHERE id=?', receipt.id).user_id, first.user.id);
  const printOrder=await sdk.createPrintOrder({requestKey:crypto.randomUUID(),items:[{receiptId:receipt.id,copies:2}],recipient:{method:'pickup',name:'测试家长',phone:'13800000000'},consent:true});
  assert.equal((await sdk.getPrintOrder(printOrder.id)).items[0].copies,2);
  const saved = [...native.storage.values()][0]; assert.ok(!Object.hasOwn(saved, 'openid')); assert.ok(!Object.hasOwn(saved, 'session_key'));
  assert.equal((await sdk.logout()).revoked, true); assert.equal(sdk.getSnapshot().status, 'guest');
  const check = await fetch(f.base + '/api/platform/session', { headers: { Authorization: 'Bearer ' + saved.token } }); assert.equal(check.status, 401);
});
test('WeChat preserves cloud account IDs; equal OpenIDs on Douyin stay separate', async t => {
  const f = await fixture(t), wx = f.native('wechat'), tt = f.native('douyin');
  await Promise.all([wx.sdk.login({ consent: true }), tt.sdk.login({ consent: true })]);
  const users=new Map(),sessions=new Map();
  const cloud = createAccountService({ getUser:async id=>users.get(id),ensureUser:async(id,value)=>{if(!users.has(id))users.set(id,{...value,_id:id});return users.get(id);},saveSession:async(id,value)=>sessions.set(id,value),getSession:async id=>sessions.get(id) });
  const expected = await cloud.handle({ action: 'login', consentVersion: '2026-10-16' }, { APPID: 'wx-test-app', OPENID: 'same-openid' });
  assert.equal(wx.sdk.getSnapshot().user.id, expected.user.id); assert.notEqual(wx.sdk.getSnapshot().user.id, tt.sdk.getSnapshot().user.id);
});
test('raw OpenID, missing consent and code replay cannot establish an SDK identity', async t => {
  const f = await fixture(t), post = value => fetch(f.base + '/api/platform/douyin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await post({ openid: 'provided-by-client' })).status, 400);
  assert.equal((await post({ code: 'valid-code' })).status, 400);
  assert.equal((await post({ code: 'valid-code', consentVersion: POLICY_VERSION, userId: 'forged' })).status, 400);
  const good = { code: 'valid-code', consentVersion: POLICY_VERSION };
  const response = await post(good), value = await response.json(); assert.equal(response.status, 200);
  assert.doesNotMatch(JSON.stringify(value), /private-session-key|private-union-id|same-openid|secret-not-public/);
  assert.equal((await post(good)).status, 409); assert.equal(f.providerCalls.length, 1);
});
test('provider failure, anonymous Douyin response and unconfigured SDK remain guests', async t => {
  const f = await fixture(t); f.provider.error = true;
  const wx = f.native('wechat'); await assert.rejects(wx.sdk.login({ consent: true }), /验证失败/); assert.equal(wx.sdk.getSnapshot().status, 'guest');
  f.provider.error = false; f.provider.offline = true;
  const offline = f.native('douyin'); await assert.rejects(offline.sdk.login({ consent: true }), /无法验证/);
  const anonymous = f.native('douyin', { anonymous: true }); await assert.rejects(anonymous.sdk.login({ consent: true }), /登录平台账号/); assert.equal(anonymous.calls.filter(call => call.kind === 'request').length, 0);
  const unconfigured = createDouyinSDK(anonymous.api, { baseUrl: '' }); await assert.rejects(unconfigured.login({ consent: true }), /尚未配置/);
});
test('restore verifies saved tokens with server; offline credentials never become authenticated', async t => {
  const f = await fixture(t), native = f.native('douyin'); await native.sdk.login({ consent: true });
  const factory = () => createDouyinSDK(native.api, { baseUrl: 'https://sdk.example.test', appId: 'tt-test-app', timeoutMs: 3000 });
  native.controls.offline = true; const offline = factory(); assert.equal((await offline.restore()).status, 'offline'); assert.equal(native.storage.size, 1);
  native.controls.offline = false; const fresh = factory(); assert.equal((await fresh.restore()).status, 'authenticated');
  const record = [...native.storage.values()][0], key = [...native.storage.keys()][0]; native.storage.set(key, { ...record, token: 'f'.repeat(64) });
  const forged = factory(); assert.equal((await forged.restore()).status, 'guest'); assert.equal(native.storage.size, 0);
});
test('logout discards and revokes a late platform login response', async t => {
  const f = await fixture(t), native = f.native('wechat', { holdResponse: true });
  const pending = native.sdk.login({ consent: true }), rejected = assert.rejects(pending, /取消/);
  await until(() => native.controls.finishResponse); await native.sdk.logout(); native.controls.finishResponse(); await rejected;
  await until(() => f.store.get('SELECT COUNT(*) n FROM sessions').n === 0);
  assert.equal(native.sdk.getSnapshot().status, 'guest'); assert.equal(native.storage.size, 0);
});
test('native login timeout ignores a late callback; storage failure revokes the minted token', async t => {
  const f = await fixture(t), timed = f.native('douyin', { holdLogin: true, timeoutMs: 20 });
  await assert.rejects(timed.sdk.login({ consent: true }), /超时/); timed.controls.finishLogin();
  assert.equal(timed.calls.filter(call => call.kind === 'request').length, 0);
  const full = f.native('wechat', { failStore: true }); await assert.rejects(full.sdk.login({ consent: true }), /无法保存/);
  await until(() => f.store.get('SELECT COUNT(*) n FROM sessions').n === 0); assert.equal(full.sdk.getSnapshot().status, 'guest');
});
test('platform endpoints stay disabled until real server credentials are configured', async t => {
  const f = await fixture(t, { wxAppId: '', douyinAppId: '' });
  for (const platform of ['wechat', 'douyin']) {
    const response = await fetch(f.base + '/api/platform/' + platform + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'test', consentVersion: POLICY_VERSION }) }); assert.equal(response.status, 503);
  }
  assert.equal(f.providerCalls.length, 0);
});
