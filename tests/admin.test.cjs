'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApplication } = require('../server/app.cjs');
const PASSWORD = 'test-admin-password-123';
const SECRET = 'test-payment-server-secret';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj <</Type/Catalog>> endobj\n%%EOF');
test('simple password is restricted to explicit local development',async t=>{
  assert.throws(()=>createApplication({adminPassword:'111'}),/至少12位/);
  assert.throws(()=>createApplication({adminPassword:'111',localDevelopment:true,publicOrigin:'https://reader.example.com'}),/至少12位/);
  const f=await fixture(t,{adminPassword:'111',localDevelopment:true});
  assert.equal((await f.post('/api/admin/login',{password:'111'})).status,200);
  assert.equal((await f.post('/api/admin/login',{password:'112'})).status,401);
});
async function fixture(t, extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'little-story-admin-'));
  let clock = Date.parse('2026-10-16T09:00:00Z');
  const errors = [], app = createApplication({ dataDir: directory, adminPassword: PASSWORD, paymentSecret: SECRET, now: () => clock, maxUploadBytes: 1024, quotaBytes: 4096, onError: e => errors.push(e), ...extra });
  app.server.listen(20000+crypto.randomInt(40000), '127.0.0.1'); await once(app.server, 'listening');
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const request = (route, options) => fetch(base + route, options);
  const post = (route, data, headers = {}) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  async function session(invite, previous) { const response = await post('/api/session', { invite }, previous ? { Cookie: previous } : {}); assert.equal(response.status, 200); return { ...await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] }; }
  async function login() { const response = await post('/api/admin/login', { password: PASSWORD }); assert.equal(response.status, 200); return { csrf: (await response.json()).csrf, cookie: response.headers.get('set-cookie').split(';')[0] }; }
  const upload = (account, key = crypto.randomUUID(), data = PDF, book = 'intro') => request('/api/prints?' + new URLSearchParams({ book, title: '测试绘本' }), { method: 'POST', headers: { Cookie: account.cookie, 'Content-Type': 'application/pdf', 'Idempotency-Key': key, 'X-Print-Consent': 'operator-file-v1' }, body: data });
  const payment = (value, signature) => { const raw = JSON.stringify(value), stamp = String(clock); return request('/internal/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Timestamp': stamp, 'X-Payment-Signature': signature || crypto.createHmac('sha256', SECRET).update(stamp + '.' + raw).digest('hex') }, body: raw }); };
  t.after(async () => {
    await new Promise(resolve => app.server.close(resolve));
    assert.deepEqual(errors, [], 'no hidden server errors');
    const absolute = path.resolve(directory), tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!absolute.startsWith(tempRoot) || !path.basename(absolute).startsWith('little-story-admin-')) throw Error('Unsafe test cleanup');
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return { ...app, directory, base, request, post, session, login, upload, payment, advance: days => { clock += days * 86400000; } };
}
test('admin authorization, CSRF, private paths and session expiry', async t => {
  const f = await fixture(t), admin = await f.login();
  assert.equal((await f.request('/api/admin/users')).status, 401);
  assert.equal((await f.post('/api/admin/login', { password: 'incorrect' })).status, 401);
  assert.equal((await f.post('/api/admin/logout', {}, { Cookie: admin.cookie })).status, 403);
  assert.equal((await f.post('/api/admin/logout', {}, { Cookie: admin.cookie, 'X-Admin-CSRF': admin.csrf, Origin: 'https://evil.invalid' })).status, 403);
  for (const route of ['/.local/admin-data/operations.sqlite', '/output/pdf/test.pdf', '/server/start.cjs', '/admin/../server/store.cjs']) assert.equal((await f.request(route)).status, 404);
  assert.equal((await f.request('/admin')).status, 200);
  assert.equal((await f.request('/api/admin/users', { headers: { Cookie: admin.cookie } })).status, 200);
  f.advance(1);
  assert.equal((await f.request('/api/admin/users', { headers: { Cookie: admin.cookie } })).status, 401);
});
test('PDF receipt, bytes download, idempotent retries and administrator status', async t => {
  const f = await fixture(t), account = await f.session(), admin = await f.login(), key = crypto.randomUUID();
  const response = await f.upload(account, key); assert.equal(response.status, 201); const item = await response.json();
  const duplicate = await f.upload(account, key); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).id, item.id);
  assert.equal((await f.upload(account, key, Buffer.concat([PDF, Buffer.from('changed')]))).status, 409);
  assert.equal((await f.upload(account, crypto.randomUUID(), Buffer.from('not-pdf'))).status, 400);
  assert.equal((await f.upload(account, crypto.randomUUID(), Buffer.alloc(1025))).status, 413);
  assert.equal((await f.request('/api/admin/prints/' + item.id + '/file')).status, 401);
  const download = await f.request('/api/admin/prints/' + item.id + '/file', { headers: { Cookie: admin.cookie } });
  assert.equal(download.headers.get('content-type'), 'application/pdf'); assert.match(download.headers.get('content-disposition'), /^attachment/); assert.deepEqual(Buffer.from(await download.arrayBuffer()), PDF);
  const update = await f.request('/api/admin/prints/' + item.id, { method: 'PATCH', headers: { Cookie: admin.cookie, 'X-Admin-CSRF': admin.csrf, 'Content-Type': 'application/json' }, body: '{"state":"processing"}' }); assert.equal(update.status, 200);
  const list = await f.request('/api/admin/prints?state=processing&q=测试', { headers: { Cookie: admin.cookie } }); const data = await list.json(); assert.equal(data.total, 1); assert.equal(data.rows[0].state, 'processing');
  assert.equal(f.store.get('SELECT COUNT(*) n FROM audit WHERE action=?', 'download-file').n, 1);
  assert.equal(fs.readdirSync(path.join(f.directory, 'files')).length, 1, 'invalid uploads leave no temporary files');
});
test('consent, spoofed user identity and anonymous uploads rejected', async t => {
  const f = await fixture(t), account = await f.session();
  assert.equal((await f.upload({ cookie: 'ls_user=forged' })).status, 401);
  const result = await f.request('/api/prints?book=intro&title=test', { method: 'POST', headers: { Cookie: account.cookie, 'Content-Type': 'application/pdf', 'Idempotency-Key': crypto.randomUUID() }, body: PDF }); assert.equal(result.status, 400);
  assert.equal((await f.post('/api/wx-session', { code: 'test' })).status, 503);
});
test('first touch referral, returning-device identity and unique event counting', async t => {
  const f = await fixture(t), inviter = await f.session(), invitee = await f.session(inviter.inviteCode), same = await f.session('other-code', invitee.cookie);
  assert.equal(same.userId, invitee.userId);
  const self = await f.session(inviter.inviteCode, inviter.cookie); assert.equal(self.userId, inviter.userId);
  const event = { id: crypto.randomUUID(), kind: 'read', book: 'intro' };
  for (let i = 0; i < 2; i++) assert.equal((await f.post('/api/events', event, { Cookie: same.cookie })).status, 200);
  assert.equal((await f.post('/api/events', { ...event, id: crypto.randomUUID(), kind: 'paid' }, { Cookie: same.cookie })).status, 400);
  const stats = f.store.dashboard('30'); assert.equal(stats.totalUsers, 2); assert.equal(stats.referredUsers, 1); assert.equal(stats.reads, 1); assert.equal(stats.activeUsers, 1);
});
test('signed payments, duplicate delivery, refunds and integer currency accounting', async t => {
  const f = await fixture(t), inviter = await f.session(), account = await f.session(inviter.inviteCode);
  const paid = { eventId: 'paid-1', orderId: 'order-1', transactionId: 'wx-1', userId: account.userId, kind: 'paid', amountFen: 1990 };
  assert.equal((await f.payment(paid, 'forged')).status, 401);
  assert.equal((await f.post('/internal/payments', paid)).status, 401);
  assert.equal((await f.payment(paid)).status, 200);
  assert.equal((await (await f.payment(paid)).json()).duplicate, true);
  assert.equal((await f.payment({ ...paid, amountFen: 1991 })).status, 409);
  assert.equal((await f.payment({ ...paid, eventId: 'another-paid' })).status, 409);
  const refund = { ...paid, eventId: 'refund-1', transactionId: 'refund-wx-1', kind: 'refund', amountFen: 990 };
  assert.equal((await f.payment(refund)).status, 200);
  assert.equal((await f.payment({ ...refund, eventId: 'refund-2', amountFen: 1001 })).status, 409);
  const stats = f.store.dashboard('30'); assert.equal(stats.paidOrders, 1); assert.equal(stats.paidFen, 1990); assert.equal(stats.refundedFen, 990); assert.equal(stats.netFen, 1000); assert.equal(stats.referredPayers, 1);
});
test('expiry removes personalized files, retains receipt and blocks downloads', async t => {
  const f = await fixture(t), account = await f.session(), response = await f.upload(account), item = await response.json();
  f.advance(31); const admin = await f.login();
  assert.equal((await f.request('/api/admin/prints/' + item.id + '/file', { headers: { Cookie: admin.cookie } })).status, 410);
  assert.equal(fs.existsSync(path.join(f.directory, 'files', item.id + '.pdf')), false);
  assert.equal(f.store.list('prints', { days: 'all' }).total, 1);
  assert.doesNotMatch(f.store.list('prints',{days:'all'}).rows[0].title,/测试绘本/,'personalized title is cleared with PDF');
  const retry = await f.upload(account, f.store.get('SELECT request_key FROM prints WHERE id=?', item.id).request_key);
  assert.equal((await retry.json()).available, false);
});
test('cleanup recovers abandoned upload files without touching current receipts',async t=>{
  const f=await fixture(t),name=crypto.randomUUID()+'.part',filename=path.join(f.directory,'files',name);
  fs.writeFileSync(filename,'interrupted upload');const past=new Date(f.store.now()-600000);fs.utimesSync(filename,past,past);
  f.store.cleanup();assert.equal(fs.existsSync(filename),false);
});
test('pagination and time filters count the same dataset', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 27; i++) f.store.userSession();
  const first = f.store.list('users', { days: '30' }), second = f.store.list('users', { days: '30', page: 2 });
  assert.equal(first.total, 27); assert.equal(first.rows.length, 25); assert.equal(second.rows.length, 2);
  f.advance(31); assert.equal(f.store.list('users', { days: '30' }).total, 0); assert.equal(f.store.list('users', { days: 'all' }).total, 27);
});
test('signed account bridge retains the parent account ID and revokes its operations token',async t=>{
  const f=await fixture(t,{accountBridgeSecret:'test-account-bridge-secret'}),accountId='usr_'+'a'.repeat(40);
  const raw=JSON.stringify({accountId}),stamp=String(f.store.now());
  const headers={'Content-Type':'application/json','X-Account-Timestamp':stamp,'X-Account-Signature':crypto.createHmac('sha256','test-account-bridge-secret').update(stamp+'.'+raw).digest('hex')};
  const exchange=()=>f.request('/internal/account-session',{method:'POST',headers,body:raw});
  assert.equal((await f.post('/internal/account-session',{accountId})).status,401);
  const response=await exchange();assert.equal(response.status,200);const first=await response.json();
  assert.equal(first.userId,accountId);assert.equal(first.source,'wechat');assert.equal(first.expiresAt-f.store.now(),7*86400000);
  assert.equal((await (await exchange()).json()).userId,accountId);assert.equal(f.store.dashboard('all').totalUsers,1);
  assert.equal((await f.post('/api/session/logout',{}, {Authorization:'Bearer '+first.token})).status,200);
  assert.equal((await f.post('/api/events',{kind:'visit',id:crypto.randomUUID()},{Authorization:'Bearer '+first.token})).status,401);
});
