'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAuthService, STORAGE_KEY } = require('../miniprogram/services/auth-service');
const { createAccountService, SESSION_DURATION, POLICY_VERSION } = require('../cloudfunctions/account/service');
const { POLICY_VERSION: CLIENT_POLICY } = require('../miniprogram/lib/account-policy');
const { createProfileStore, STORAGE_KEY: PROFILE_KEY } = require('../miniprogram/services/profile-store');

function fixture() {
  const users = new Map(), sessions = new Map(), storage = new Map(), calls = [];
  let clock = Date.now();
  const context = { APPID: 'test-app', OPENID: 'parent-one' };
  const repository = {
    getUser: async id => users.get(id), saveUser: async (id, value) => users.set(id, { ...value, _id: id }),
    async ensureUser(id,value) { if (!users.has(id)) users.set(id,{...value,_id:id});return users.get(id); },
    async updateUser(id,generation,value,{closed=false}={}) {
      const user=users.get(id);
      if (!user||(user.generation||'legacy')!==generation||(user.status==='closed')!==closed)return false;
      users.set(id,{...user,...value});return true;
    },
    async closeUser(id,generation,nextGeneration,closedAt) {
      const changed=await this.updateUser(id,generation,{status:'closed',generation:nextGeneration,closedAt});
      if(changed){const user=users.get(id);delete user.nickname;delete user.onboardingCompleted;delete user.createdAt;}
      return changed;
    },
    async removeUserSessions(id,generation) { for(const[key,value]of sessions)if(value.userId===id&&(value.userGeneration||'legacy')===generation)sessions.delete(key); },
    getSession: async id => sessions.get(id), saveSession: async (id, value) => sessions.set(id, { ...value, _id: id }),
    removeSession: async id => sessions.delete(id)
  };
  const server = createAccountService(repository, { now: () => clock });
  const controls = { offline: false, writeFailure: false, beforeCall: null, removeFailure: false };
  const api = {
    getStorageSync: key => storage.get(key),
    setStorageSync(key, value) { if (controls.writeFailure) throw new Error('quota'); storage.set(key, structuredClone(value)); },
    removeStorageSync(key) { if (controls.removeFailure) throw new Error('quota'); storage.delete(key); },
    cloud: {
      init: () => calls.push('init'),
      async callFunction({ name, data }) {
        calls.push({ name, data });
        if (controls.beforeCall) await controls.beforeCall(data);
        if (controls.offline) throw new Error('network');
        try { return { result: await server.handle(data, context) }; }
        catch (error) { return { result: { ok: false, code: error.code || 'AUTH_SERVICE_ERROR', message: error.message } }; }
      }
    }
  };
  const settings = { envId: 'test-env', functionName: 'account', timeoutMs: 1000 };
  return { api, server, repository, users, sessions, storage, calls, controls, context, settings,
    client: createAuthService(api, settings), now:()=>clock, advance: milliseconds => { clock += milliseconds; } };
}
const login = client => client.login({ consent: true });
const tick = () => new Promise(resolve => setImmediate(resolve));
function timedClient(f) {
  let sequence=0;const timers=new Map();
  const runtime={now:f.now,setTimeout(callback,delay){const id=++sequence;timers.set(id,{callback,at:f.now()+delay});return id;},clearTimeout:id=>timers.delete(id)};
  return {client:createAuthService(f.api,f.settings,runtime),flush(){for(const [id,timer]of [...timers].sort((a,b)=>a[1].at-b[1].at)){if(timer.at<=f.now()&&timers.delete(id))timer.callback();}}};
}

test('login requires current consent, creates stable account, stores only a session hash on server', async () => {
  const f = fixture();
  assert.equal(CLIENT_POLICY, POLICY_VERSION);
  await assert.rejects(f.client.login(), { code: 'AUTH_CONSENT_REQUIRED' });
  assert.equal(f.calls.length, 0);
  const first = await login(f.client);
  const record = f.storage.get(STORAGE_KEY + ':test-env');
  const hash = crypto.createHash('sha256').update(record.token).digest('hex');
  assert.equal(first.status, 'authenticated');
  assert.equal(first.user.displayName, '家长');
  assert.equal(first.token, undefined, 'UI snapshots must never expose the credential');
  assert.equal(f.sessions.get(hash).userId, first.user.id);
  assert.ok(!JSON.stringify([...f.sessions.values()]).includes(record.token));
  assert.equal(f.sessions.get(hash).expiresAt - f.sessions.get(hash).createdAt, SESSION_DURATION);
  assert.equal(f.calls.filter(call => call.data && call.data.action === 'login').length, 1);
  await f.client.logout();
  assert.equal((await login(f.client)).user.id, first.user.id);
  assert.equal(f.users.size, 1);
});

test('server ignores supplied identity and rejects missing trusted context and obsolete consent', async () => {
  const f = fixture();
  await assert.rejects(f.server.handle({ action: 'login', OPENID: 'forged', consentVersion: POLICY_VERSION }, {}), { code: 'AUTH_REQUIRED' });
  await assert.rejects(f.server.handle({ action: 'login', consentVersion: 'old' }, f.context), { code: 'AUTH_CONSENT_REQUIRED' });
  const real = await f.server.handle({ action: 'login', userId: 'forged', OPENID: 'other', child: { photo: 'secret' }, consentVersion: POLICY_VERSION }, f.context);
  assert.ok(/^usr_[a-f0-9]{40}$/.test(real.user.id));
  assert.ok(!JSON.stringify([...f.users.values(), ...f.sessions.values()]).includes('secret'));
});

test('session is bound to the WeChat user and app, expires and is revoked on logout', async () => {
  const f = fixture();
  const result = await f.server.handle({ action: 'login', consentVersion: POLICY_VERSION }, f.context);
  for (const context of [{ ...f.context, OPENID: 'other' }, { ...f.context, APPID: 'other' }]) {
    await assert.rejects(f.server.requireUser(context, result.token), { code: 'AUTH_EXPIRED' });
    await f.server.handle({ action: 'logout', token: result.token }, context);
  }
  assert.equal((await f.server.requireUser(f.context, result.token)).user.id, result.user.id);
  await f.server.handle({ action: 'logout', token: result.token }, f.context);
  await assert.rejects(f.server.requireUser(f.context, result.token), { code: 'AUTH_EXPIRED' });
  const next = await f.server.handle({ action: 'login', consentVersion: POLICY_VERSION }, f.context);
  f.advance(SESSION_DURATION);
  await assert.rejects(f.server.requireUser(f.context, next.token), { code: 'AUTH_EXPIRED' });
});

test('restore validates against server; tampered local identity never becomes authenticated', async () => {
  const f = fixture();
  const first = await login(f.client);
  const record = f.storage.get(STORAGE_KEY + ':test-env');
  record.user.id = 'usr_' + 'a'.repeat(40);
  const fresh = createAuthService(f.api, f.settings);
  assert.equal(fresh.getSnapshot().user, null);
  const restored = await fresh.restore();
  assert.equal(restored.user.id, first.user.id);
  f.advance(SESSION_DURATION);
  const expired = createAuthService(f.api, f.settings);
  assert.equal((await expired.restore()).status, 'guest');
  assert.equal(f.storage.size, 0);
});

test('network failure during restore preserves credentials for retry without claiming login', async () => {
  const f = fixture(); await login(f.client);
  const fresh = createAuthService(f.api, f.settings);
  f.controls.offline = true;
  assert.equal((await fresh.restore()).status, 'offline');
  assert.equal(fresh.getSnapshot().user, null);
  assert.equal(f.storage.size, 1);
  f.controls.offline = false;
  assert.equal((await fresh.restore()).status, 'authenticated');
});

test('duplicate login is deduplicated and logout invalidates a late login response', async () => {
  const f = fixture(); let release;
  f.controls.beforeCall = data => data.action === 'login' ? new Promise(resolve => { release = resolve; }) : null;
  const first = login(f.client), second = login(f.client);
  assert.equal(first, second);
  await tick();
  await f.client.logout();
  release();
  await assert.rejects(first, { code: 'AUTH_CANCELLED' });
  await tick();
  assert.equal(f.client.getSnapshot().status, 'guest');
  assert.equal(f.storage.size, 0);
  assert.equal(f.sessions.size, 0, 'discarded successful login should revoke its session');
});

test('storage failure never reports a successful login, and cloud failure still allows local logout', async () => {
  const f = fixture(); f.controls.writeFailure = true;
  await assert.rejects(login(f.client), { code: 'AUTH_STORAGE' });
  assert.equal(f.client.getSnapshot().status, 'guest');
  f.controls.writeFailure = false; await login(f.client);
  f.controls.removeFailure = true;
  await assert.rejects(f.client.logout(), { code: 'AUTH_STORAGE' });
  assert.equal(f.client.getSnapshot().status, 'authenticated');
  f.controls.removeFailure = false; f.controls.offline = true;
  assert.equal((await f.client.logout()).revoked, false);
  assert.equal(f.client.getSnapshot().status, 'guest');
  assert.equal(f.storage.size, 0);
});

test('unconfigured project stays a guest and failed login can be retried', async () => {
  const f = fixture(); const disabled = createAuthService(f.api, { envId: '' });
  assert.equal((await disabled.restore()).status, 'guest');
  await assert.rejects(login(disabled), { code: 'AUTH_NOT_CONFIGURED' });
  assert.equal(f.calls.length, 0);
  f.controls.offline = true;
  await assert.rejects(login(f.client), { code: 'AUTH_NETWORK' });
  f.controls.offline = false;
  assert.equal((await login(f.client)).status, 'authenticated');
});

test('timeout ends loading and a late response cannot mark the user as logged in', async () => {
  const f = fixture(); let release;
  f.controls.beforeCall = () => new Promise(resolve => { release = resolve; });
  const client = createAuthService(f.api, { ...f.settings, timeoutMs: 15 });
  await assert.rejects(login(client), { code: 'AUTH_TIMEOUT' });
  release(); await tick();
  assert.equal(client.getSnapshot().status, 'guest');
  assert.equal(f.storage.size, 0);
});

test('future picture-book calls require an active session and discard results after logout', async () => {
  const f = fixture();
  await assert.rejects(f.client.callWithSession('pictureBook'), { code: 'AUTH_REQUIRED' });
  await login(f.client);
  let release;
  f.api.cloud.callFunction = async options => {
    if (options.name === 'pictureBook') {
      assert.match(options.data.sessionToken, /^[a-f0-9]{64}$/);
      assert.equal(options.data.sessionToken, f.storage.get(STORAGE_KEY + ':test-env').token);
      await new Promise(resolve => { release = resolve; });
      return { result: { ok: true } };
    }
    return { result: { ok: true } };
  };
  const pending = f.client.callWithSession('pictureBook', { sessionToken: 'forged' });
  await tick(); await f.client.logout(); release();
  await assert.rejects(pending, { code: 'AUTH_CANCELLED' });
});

test('child stores isolate guest and accounts; copying a guest photo never removes the original', async () => {
  const storage = new Map(), files = new Set(['/tmp/guest.png']); let sequence = 0;
  const api = { env: { USER_DATA_PATH: '/local' },
    getStorageSync: key => storage.get(key), setStorageSync: (key,value) => storage.set(key,structuredClone(value)),
    getFileSystemManager: () => ({
      accessSync(path) { if (!files.has(path)) throw new Error('missing'); },
      copyFile({destPath,success}) { sequence++; files.add(destPath); success(); },
      unlink({filePath,success}) { files.delete(filePath); success(); }
    })
  };
  const guest = createProfileStore(api);
  await guest.saveProfile({ name:'小豆包', age:4, className:'中班' }, { avatarTempPath:'/tmp/guest.png' });
  const guestPhoto = guest.loadProfile().avatarPath;
  const a = createProfileStore(api,{ ownerId:'usr_'+'a'.repeat(40) });
  const b = createProfileStore(api,{ ownerId:'usr_'+'b'.repeat(40) });
  assert.equal(a.loadProfile().name,'小石头');
  await a.saveProfile(guest.loadProfile(), { avatarTempPath:guestPhoto });
  assert.notEqual(a.loadProfile().avatarPath,guestPhoto);
  await a.saveProfile({name:'小苹果'}, {removeAvatar:true});
  assert.equal(guest.loadProfile().name,'小豆包');
  assert.equal(guest.loadProfile().avatarPath,guestPhoto);
  assert.ok(files.has(guestPhoto));
  assert.equal(b.loadProfile().name,'小石头');
  assert.equal(storage.get(PROFILE_KEY).name,'小豆包');
  assert.equal(sequence,2);
});

test('account switch while photo copy is pending rolls back the new photo without overwriting data', async () => {
  const storage = new Map(); let current = true, complete, removed;
  const api = { env:{ USER_DATA_PATH:'/local' }, getStorageSync:key=>storage.get(key), setStorageSync:(key,value)=>storage.set(key,value),
    getFileSystemManager:()=>({accessSync(){},copyFile({destPath,success}){complete=()=>success();},unlink({filePath,success}){removed=filePath;success();}}) };
  const store=createProfileStore(api,{ownerId:'usr_'+'a'.repeat(40),isCurrent:()=>current});
  const pending=store.saveProfile({name:'小豆包',age:4,className:'中班'},{avatarTempPath:'/tmp/new.png'});
  await tick();current=false;complete();
  await assert.rejects(pending,/账号已切换/);
  assert.equal(storage.size,0);
  assert.match(removed,/hero-avatar-/);
});

test('nickname and onboarding persist independently of child data and reject invalid Unicode input', async () => {
  const f=fixture(); await login(f.client);
  for (const name of ['', '  ', '亲'.repeat(17), '家\n长', '\u202e家长']) {
    await assert.rejects(f.client.updateAccountProfile(name),{code:'AUTH_INVALID_NICKNAME'});
    await assert.rejects(f.server.handle({action:'update-profile',token:f.storage.get(STORAGE_KEY+':test-env').token,nickname:name},f.context),{code:'AUTH_INVALID_NICKNAME'});
  }
  await f.client.updateAccountProfile('  𠮷豆妈妈  ');
  assert.equal(f.client.getSnapshot().user.displayName,'𠮷豆妈妈');
  await f.client.completeOnboarding();
  const fresh=createAuthService(f.api,f.settings); await fresh.restore();
  assert.equal(fresh.getSnapshot().user.nickname,'𠮷豆妈妈');
  assert.equal(fresh.getSnapshot().user.onboardingCompleted,true);
  assert.equal(f.storage.size,1,'account metadata never creates or replaces a child profile');
});

test('closing an account requires confirmation, clears personal metadata and invalidates every old session', async () => {
  const f=fixture(); await login(f.client); await f.client.updateAccountProfile('豆豆爸爸');
  const previous=f.client.getSnapshot().user;
  const first=f.storage.get(STORAGE_KEY+':test-env').token;
  const second=await f.server.handle({action:'login',consentVersion:POLICY_VERSION},f.context);
  await assert.rejects(f.client.closeAccount({confirmation:'删除'}),{code:'AUTH_CONFIRMATION_REQUIRED'});
  assert.equal(f.client.getSnapshot().status,'authenticated');
  const closed=await f.client.closeAccount({confirmation:'注销'});
  assert.equal(closed.closed,true);assert.equal(f.client.getSnapshot().status,'guest');assert.equal(f.storage.size,0);
  const tombstone=f.users.get(previous.id);
  assert.equal(tombstone.nickname,undefined);assert.equal(tombstone.onboardingCompleted,undefined);assert.equal(tombstone.createdAt,undefined);
  assert.equal(tombstone.status,'closed');assert.equal(f.sessions.size,0);
  for(const token of [first,second.token])await assert.rejects(f.server.requireUser(f.context,token),{code:'AUTH_EXPIRED'});
  await assert.rejects(login(f.client),{code:'AUTH_ACCOUNT_CLOSED'});
  const registered=await f.client.login({consent:true,reRegister:true});
  assert.equal(registered.user.id,previous.id);assert.notEqual(registered.user.accountVersion,previous.accountVersion);
  assert.equal(registered.user.nickname,'');assert.equal(registered.user.onboardingCompleted,false);
  // Even a session left behind by a delayed pre-cancellation login cannot revive.
  const staleHash=crypto.createHash('sha256').update(first).digest('hex');
  f.sessions.set(staleHash,{userId:previous.id,userGeneration:previous.accountVersion,expiresAt:Date.now()+60000});
  await assert.rejects(f.server.requireUser(f.context,first),{code:'AUTH_EXPIRED'});
});

test('closing network failure keeps the account usable; late metadata responses cannot undo logout',async()=>{
  const f=fixture();await login(f.client);f.controls.offline=true;
  await assert.rejects(f.client.closeAccount({confirmation:'注销'}),{code:'AUTH_NETWORK'});
  assert.equal(f.client.getSnapshot().status,'authenticated');
  f.controls.offline=false;let release;
  f.controls.beforeCall=data=>data.action==='update-profile'?new Promise(resolve=>{release=resolve;}):null;
  const pending=f.client.updateAccountProfile('新的家长称呼');await tick();await f.client.logout();release();
  await assert.rejects(pending);assert.equal(f.client.getSnapshot().status,'guest');assert.equal(f.storage.size,0);
});

test('cancellation still denies old tokens if physical session cleanup fails',async()=>{
  const f=fixture();await login(f.client);const record=f.storage.get(STORAGE_KEY+':test-env');
  f.repository.removeUserSessions=async()=>{throw Error('database unavailable');};
  const result=await f.client.closeAccount({confirmation:'注销'});assert.equal(result.sessionRecordsRemoved,false);
  await assert.rejects(f.server.requireUser(f.context,record.token),{code:'AUTH_EXPIRED'});
});

test('legacy accounts retain their existing child namespace and remain editable',async()=>{
  const f=fixture();const first=await login(f.client),id=first.user.id;
  const record=f.storage.get(STORAGE_KEY+':test-env');
  delete f.users.get(id).generation;for(const session of f.sessions.values())delete session.userGeneration;
  const fresh=createAuthService(f.api,f.settings);await fresh.restore();
  assert.equal(fresh.getSnapshot().user.accountVersion,'legacy');
  await fresh.updateAccountProfile('旧用户');assert.equal(fresh.getSnapshot().user.displayName,'旧用户');
  assert.equal((await f.server.requireUser(f.context,record.token)).user.id,id);
});

test('session expiry updates subscribers, clears only credentials, and blocks account operations without network calls',async()=>{
  const f=fixture(),timed=timedClient(f),events=[];timed.client.subscribe(value=>events.push(value));await login(timed.client);
  f.storage.set('child-fixture',{name:'保留孩子',photo:'keep'});f.advance(SESSION_DURATION);timed.flush();
  assert.equal(timed.client.getSnapshot().status,'guest');assert.equal(events.at(-1).user,null);assert.match(events.at(-1).error,/到期/);
  assert.deepEqual(f.storage.get('child-fixture'),{name:'保留孩子',photo:'keep'});assert.equal(f.storage.has(STORAGE_KEY+':test-env'),false);
  const calls=f.calls.length;await assert.rejects(timed.client.updateAccountProfile('妈妈'),{code:'AUTH_REQUIRED'});await assert.rejects(timed.client.closeAccount({confirmation:'注销'}),{code:'AUTH_REQUIRED'});assert.equal(f.calls.length,calls);
  assert.match((await timed.client.restore()).error,/到期/);
});

test('a suspended expiry timer is checked on snapshot and a late metadata response cannot restore expired identity',async()=>{
  const f=fixture(),timed=timedClient(f);await login(timed.client);const original=f.api.cloud.callFunction;let release;
  f.api.cloud.callFunction=async options=>{const result=await original(options);if(options.data.action==='update-profile')await new Promise(resolve=>{release=resolve;});return result;};
  const pending=timed.client.updateAccountProfile('新称呼');await tick();f.advance(SESSION_DURATION);
  assert.equal(timed.client.getSnapshot().user,null);release();await assert.rejects(pending,{code:'AUTH_CANCELLED'});assert.equal(timed.client.getSnapshot().status,'guest');
});

test('a timed-out login revokes only its own late token and cannot remove a successful retry session',async()=>{
  const f=fixture();let release,requests=0;
  f.controls.beforeCall=data=>data.action==='login'&&++requests===1?new Promise(resolve=>{release=resolve;}):null;
  const client=createAuthService(f.api,{...f.settings,timeoutMs:15});await assert.rejects(login(client),{code:'AUTH_TIMEOUT'});
  await login(client);const current=f.storage.get(STORAGE_KEY+':test-env').token;release();await tick();await tick();
  assert.equal(client.getSnapshot().status,'authenticated');assert.equal(f.storage.get(STORAGE_KEY+':test-env').token,current);assert.equal(f.sessions.size,1);
  assert.equal((await f.server.requireUser(f.context,current)).user.id,client.getSnapshot().user.id);
});

test('logout after an offline restore revokes the retained token when network returns; unreadable storage does not claim revocation',async()=>{
  const f=fixture();await login(f.client);const fresh=createAuthService(f.api,f.settings);f.controls.offline=true;await fresh.restore();
  f.controls.offline=false;assert.equal((await fresh.logout()).revoked,true);assert.equal(f.sessions.size,0);
  await login(f.client);const another=createAuthService(f.api,f.settings),read=f.api.getStorageSync;f.api.getStorageSync=()=>{throw Error('unavailable');};
  assert.equal((await another.logout()).revoked,false);f.api.getStorageSync=read;assert.equal(f.storage.size,0);
});

test('authenticated downstream cloud calls time out rather than hang indefinitely',async()=>{
  const f=fixture(),client=createAuthService(f.api,{...f.settings,timeoutMs:15});await login(client);const original=f.api.cloud.callFunction;
  f.api.cloud.callFunction=options=>options.name==='pictureBook'?new Promise(()=>{}):original(options);
  await assert.rejects(client.callWithSession('pictureBook'),{code:'AUTH_TIMEOUT'});assert.equal(client.getSnapshot().status,'authenticated');await client.logout();
});

test('an unexpected account identity in a metadata response requires fresh login and never switches child spaces silently',async()=>{
  const f=fixture();await login(f.client);const original=f.api.cloud.callFunction;
  f.api.cloud.callFunction=async options=>{const response=await original(options);if(options.data.action==='update-profile')response.result.user.id='usr_'+'f'.repeat(40);return response;};
  await assert.rejects(f.client.updateAccountProfile('家长称呼'),{code:'AUTH_INVALID_RESPONSE'});assert.equal(f.client.getSnapshot().user,null);assert.equal(f.storage.size,0);
});

test('an unconfirmed cancellation response does not clear the local account or permit child cleanup',async()=>{
  const f=fixture();await login(f.client);const original=f.api.cloud.callFunction;
  f.api.cloud.callFunction=options=>options.data.action==='close-account'?Promise.resolve({result:{ok:true}}):original(options);
  await assert.rejects(f.client.closeAccount({confirmation:'注销'}),{code:'AUTH_INVALID_RESPONSE'});assert.equal(f.client.getSnapshot().status,'authenticated');assert.equal(f.storage.size,1);
});

test('failed cancellation after the deadline cannot put an expired account back into authenticated state',async()=>{
  const f=fixture(),timed=timedClient(f);await login(timed.client);const original=f.api.cloud.callFunction;let rejectClose;
  f.api.cloud.callFunction=options=>options.data.action==='close-account'?new Promise((resolve,reject)=>{rejectClose=reject;}):original(options);
  const pending=timed.client.closeAccount({confirmation:'注销'});await tick();f.advance(SESSION_DURATION);rejectClose(Error('offline'));
  await assert.rejects(pending,{code:'AUTH_NETWORK'});assert.equal(timed.client.getSnapshot().status,'guest');assert.match(timed.client.getSnapshot().error,/到期/);
});
