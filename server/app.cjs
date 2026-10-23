'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openStore, hash, uid } = require('./store.cjs');
const { createPlatformLogin, PLATFORM_POLICY_VERSION } = require('./platform-login.cjs');
const { createPrintOrders } = require('./print-orders.cjs');
const { createBilling } = require('./billing.cjs');
const { createUserAdmin } = require('./user-admin.cjs');
const { lanAccess } = require('./lan-access.cjs');
const { createSystemAdmin } = require('./system-admin.cjs');
const ROOT = path.resolve(__dirname, '..');
const STATES = ['received', 'processing', 'completed', 'cancelled'];
const token = () => crypto.randomBytes(32).toString('hex');
function problem(status, message) { return Object.assign(Error(message), { status }); }
function equal(a, b) { const aa = Buffer.from(a || ''), bb = Buffer.from(b || ''); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); }
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || ''; }
async function body(req, max = 16384) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > max) throw problem(413, '请求超过大小限制'); parts.push(part); }
  return Buffer.concat(parts);
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw problem(415, '需要JSON请求');
  try { const value=JSON.parse((await body(req)).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw problem(400,'JSON须为对象');return value; } catch (e) { if (e.status) throw e; throw problem(400, 'JSON格式无效'); }
}
function createApplication(options = {}) {
  const localOnly = options.localDevelopment === true && !options.publicOrigin;
  const lanAllowed=options.lanDevelopment===true?lanAccess(options.publicOrigin):null;
  if (typeof options.adminPassword !== 'string' || !options.adminPassword || (!localOnly && !lanAllowed && options.adminPassword.length < 12)) throw Error('公开部署管理员密码至少12位');
  const now = options.now || Date.now, retention = Number(options.retentionDays || 30);
  if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw Error('文件保存天数须为1–365');
  const directory = path.resolve(options.dataDir || path.join(ROOT, '.local/admin-data'));
  const store = openStore(directory, retention, now), admins = new Map(), limits = new Map();
  const orders=createPrintOrders(store,{contactRetentionDays:Number(options.orderContactRetentionDays??90)});
  const billing=createBilling(store,orders),userAdmin=createUserAdmin(store,orders);orders.setBilling(billing);
  const platforms = createPlatformLogin({ wxAppId:options.wxAppId,wxSecret:options.wxSecret,douyinAppId:options.douyinAppId,douyinSecret:options.douyinSecret,fetchImpl:options.platformFetch,now });
  const salt = crypto.randomBytes(16), passwordHash = crypto.scryptSync(options.adminPassword, salt, 64);
  const publicOrigin = options.publicOrigin ? new URL(options.publicOrigin).origin : null;
  const secure = !!publicOrigin?.startsWith('https:');
  const maxUpload = options.maxUploadBytes || 100 * 1024 * 1024, quota = options.quotaBytes || 2 * 1024 ** 3;
  let uploading = false;
  const system=createSystemAdmin(store,{quotaBytes:quota,platformStatus:()=>({wechatConfigured:!!options.accountBridgeSecret||platforms.configured('wechat'),douyinConfigured:platforms.configured('douyin'),paymentEventsConfigured:!!options.paymentSecret}),cleanSource:()=>{store.cleanup();orders.cleanup();}});
  const send = (res, code, value, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(value)); };
  function rate(req, name, limit, ms = 60000) {
    const key = name + ':' + req.socket.remoteAddress, entry = limits.get(key);
    if (!entry || entry.reset <= now()) { limits.set(key, { count: 1, reset: now() + ms }); return; }
    if (++entry.count > limit) throw problem(429, '请求过于频繁，请稍后重试');
  }
  function origin(req) {
    // Never trust a caller-controlled Host to authorize administrative writes.
    const expected = publicOrigin || 'http://127.0.0.1:' + server.address().port;
    if (req.headers.origin && req.headers.origin !== expected) throw problem(403, '来源不允许');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw problem(403, '来源不允许');
  }
  function admin(req, mutate = false) {
    const session = admins.get(cookie(req, 'ls_admin'));
    if (!session || session.expires <= now()) throw problem(401, '请先登录管理后台');
    if (mutate && !equal(req.headers['x-admin-csrf'], session.csrf)) throw problem(403, '登录凭证已变化，请重新登录');
    return session;
  }
  const user = req => {
    const found = store.authenticate(req.headers.authorization?.replace(/^Bearer /, '') || cookie(req, 'ls_user'));
    if (!found) throw problem(401, '用户会话已过期，请刷新重试');
    return found;
  };
  const cookies = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function file(res, filename, contentType, headers = {}) {
    res.writeHead(200, { 'Content-Type': contentType, ...headers });
    const stream = fs.createReadStream(filename); stream.on('error', () => res.destroy()); stream.pipe(res);
  }
  async function upload(req, res, url) {
    const account = user(req); rate(req, 'upload', 30);
    if (uploading) throw problem(429, '正在接收其他文件，请稍后重试');
    const requestKey = req.headers['idempotency-key'], book = url.searchParams.get('book') || '', title = url.searchParams.get('title') || '';
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey || '') || !/^[a-z0-9-]{1,60}$/.test(book) || !title || title.length > 100 || /[\x00-\x1f]/.test(title)) throw problem(400, '绘本或请求编号无效');
    if (req.headers['x-print-consent'] !== 'operator-file-v1') throw problem(400, '请先确认提交文件用途和保存期限');
    if (req.headers['content-type'] !== 'application/pdf') throw problem(415, '只接收PDF绘本');
    const prior = store.get('SELECT * FROM prints WHERE user_id=? AND request_key=?', account.id, requestKey);
    if (prior) {
      const bytes = await body(req, maxUpload);
      if (prior.digest !== hash(bytes) || prior.book !== book || (!prior.deleted&&prior.title !== title)) throw problem(409, '重试编号与原文件不一致');
      return send(res, 200, { id: prior.id, duplicate: true, expires: prior.expires, available: !prior.deleted && prior.expires > now() });
    }
    const active = store.get('SELECT COALESCE(SUM(bytes),0) total FROM prints WHERE deleted IS NULL').total;
    if (active >= quota) throw problem(507, '后台文件空间不足，请联系运营人员');
    const id = uid(), temporary = path.join(directory, 'files', id + '.part'), destination = path.join(directory, 'files', id + '.pdf');
    uploading = true;
    let handle, size = 0, prefix = Buffer.alloc(0), tail = Buffer.alloc(0); const digest = crypto.createHash('sha256');
    try {
      handle = await fs.promises.open(temporary, 'wx', 0o600);
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxUpload || active + size > quota) throw problem(413, '文件过大或后台文件空间不足');
        if (prefix.length < 5) prefix = Buffer.concat([prefix, chunk]).subarray(0, 5);
        tail = Buffer.concat([tail, chunk.subarray(Math.max(0, chunk.length - 1024))]).subarray(-1024);
        digest.update(chunk); await handle.writeFile(chunk);
      }
      await handle.close(); handle = null;
      if (size < 20 || prefix.toString() !== '%PDF-' || !tail.includes(Buffer.from('%%EOF'))) throw problem(400, '文件不是完整PDF，请重新生成');
      await fs.promises.rename(temporary, destination);
      const expires = now() + retention * 86400000, name = book + '-proof.pdf';
      store.run('INSERT INTO prints(id,user_id,request_key,book,title,name,digest,bytes,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?)', id, account.id, requestKey, book, title, name, digest.digest('hex'), size, now(), expires);
      store.audit('receive-file', id);
      send(res, 201, { id, expires, duplicate: false, available: true });
    } catch (e) { if (handle) await handle.close(); await fs.promises.rm(temporary, { force: true }); await fs.promises.rm(destination, { force: true }); throw e; }
    finally { uploading = false; }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      if(localOnly&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw problem(403,'本机后台只允许本机访问');
      if(lanAllowed&&!lanAllowed(req.socket.remoteAddress))throw problem(403,'手机测试仅允许同一局域网访问');
      const url = new URL(req.url, 'http://local'), route = url.pathname;
      if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(req.method)) throw problem(405, '不支持此方法');
      if (!['GET', 'HEAD'].includes(req.method)) origin(req);
      if (route === '/api/session' && req.method === 'POST') {
        rate(req, 'session', 30); const input = await jsonBody(req);
        // Cookie restores a browser device; no caller-supplied user ID is accepted.
        const session = store.userSession({ token: cookie(req, 'ls_user'), invite: input.invite });
        send(res, 200, { userId: session.userId, inviteCode: session.inviteCode }, { 'Set-Cookie': cookies('ls_user', session.token, 90 * 86400) }); return;
      }
      if(route==='/api/session/logout'&&req.method==='POST'){
        user(req);const secret=req.headers.authorization?.replace(/^Bearer /,'')||cookie(req,'ls_user');
        store.run('DELETE FROM sessions WHERE token=?',hash(secret));send(res,200,{ok:true});return;
      }
      const platformRoute=route.match(/^\/api\/platform\/(wechat|douyin)\/session$/);
      if ((platformRoute || route === '/api/wx-session') && req.method === 'POST') {
        rate(req, 'platform-login', 20);
        const platform=platformRoute?platformRoute[1]:'wechat',input=await jsonBody(req);
        const verified=await platforms.exchange(platform,input,{requireConsent:!!platformRoute});
        const result=store.userSession({identity:verified.identity,trustedId:verified.accountId,source:verified.source,invite:input.invite,durationDays:7});
        send(res,200,{ok:true,...result,expiresAt:now()+7*86400000,consentVersion:PLATFORM_POLICY_VERSION});return;
      }
      if(route==='/api/platform/session'&&req.method==='GET'){
        const account=user(req);
        if(!['wechat','douyin'].includes(account.source))throw problem(403,'需要已验证的平台账号');
        const secret=req.headers.authorization?.replace(/^Bearer /,'')||cookie(req,'ls_user');
        const session=store.get('SELECT expires FROM sessions WHERE token=?',hash(secret));
        send(res,200,{ok:true,userId:account.id,source:account.source,inviteCode:account.invite,expiresAt:session.expires,consentVersion:PLATFORM_POLICY_VERSION});return;
      }
      if(route==='/internal/account-session'&&req.method==='POST'){
        rate(req,'account-bridge',120);
        if(!options.accountBridgeSecret)throw problem(503,'账号统计衔接尚未配置');
        const raw=await body(req),stamp=req.headers['x-account-timestamp'];
        if(!/^\d{13}$/.test(stamp||'')||Math.abs(now()-Number(stamp))>300000)throw problem(401,'账号签名已过期');
        const expected=crypto.createHmac('sha256',options.accountBridgeSecret).update(stamp+'.').update(raw).digest('hex');
        if(!equal(expected,req.headers['x-account-signature']))throw problem(401,'账号签名无效');
        let value;try{value=JSON.parse(raw);}catch(_){throw problem(400,'账号JSON无效');}
        if(!/^usr_[a-f0-9]{40}$/.test(value.accountId||''))throw problem(400,'账号编号无效');
        const session=store.userSession({identity:'account:'+value.accountId,trustedId:value.accountId,source:'wechat',invite:value.invite,durationDays:7});
        send(res,200,{ok:true,...session,expiresAt:now()+7*86400000});return;
      }
      if (route === '/api/events' && req.method === 'POST') { rate(req, 'events', 180); store.event(user(req), await jsonBody(req)); send(res, 200, { ok: true }); return; }
      if (route === '/api/prints' && req.method === 'POST') { await upload(req, res, url); return; }
      if(route==='/api/print-orders'&&req.method==='POST'){
        rate(req,'create-order',30);const account=user(req),result=orders.create(account,await jsonBody(req));send(res,result.duplicate?200:201,result);return;
      }
      if(route==='/api/print-orders'&&req.method==='GET'){
        orders.cleanup();const account=user(req);send(res,200,orders.list({days:'all',userId:account.id,page:Number(url.searchParams.get('page')||1)}));return;
      }
      const userOrder=route.match(/^\/api\/print-orders\/([0-9a-f-]{36})(\/cancel)?$/);
      const preparePayment=route.match(/^\/api\/print-orders\/([0-9a-f-]{36})\/payment-intents$/);
      if(preparePayment&&req.method==='POST'){rate(req,'prepare-payment',30);orders.cleanup();send(res,200,billing.prepareIntent(user(req),preparePayment[1],await jsonBody(req)));return;}
      const ownPayment=route.match(/^\/api\/payment-intents\/([0-9a-f-]{36})$/);
      if(ownPayment&&req.method==='GET'){send(res,200,billing.intentDetail(ownPayment[1],user(req).id));return;}
      if(userOrder){
        const account=user(req);orders.cleanup();
        if(!userOrder[2]&&req.method==='GET'){send(res,200,orders.detail(userOrder[1],account.id));return;}
        if(userOrder[2]&&req.method==='POST'){const input=await jsonBody(req);send(res,200,orders.update(userOrder[1],{...input,state:'cancelled'},{userId:account.id}));return;}
      }
      if (route === '/internal/payments' && req.method === 'POST') {
        rate(req, 'payment', 120);
        if (!options.paymentSecret) throw problem(503, '支付核验对接尚未启用');
        const raw = await body(req), stamp = req.headers['x-payment-timestamp'];
        if (!/^\d{13}$/.test(stamp || '') || Math.abs(now() - Number(stamp)) > 300000) throw problem(401, '付款签名已过期');
        const expected = crypto.createHmac('sha256', options.paymentSecret).update(stamp + '.').update(raw).digest('hex');
        if (!equal(expected, req.headers['x-payment-signature'])) throw problem(401, '付款签名无效');
        let value; try { value = JSON.parse(raw); } catch (_) { throw problem(400, '付款JSON无效'); }
        if(!value||typeof value!=='object'||Array.isArray(value))throw problem(400,'付款数据无效');
        const result = billing.recordPayment(value, hash(raw)); store.audit('payment-' + value.kind, value.eventId); send(res, 200, result); return;
      }
      if (route === '/api/admin/login' && req.method === 'POST') {
        rate(req, 'admin-login', 8, 15 * 60000); const input = await jsonBody(req);
        if (typeof input.password !== 'string' || input.password.length > 500 || !crypto.timingSafeEqual(crypto.scryptSync(input.password, salt, 64), passwordHash)) throw problem(401, '管理员密码错误');
        const secret = token(), session = { csrf: token(), expires: now() + 8 * 3600000 }; admins.set(secret, session); store.audit('admin-login', 'owner');
        send(res, 200, { csrf: session.csrf }, { 'Set-Cookie': cookies('ls_admin', secret, 8 * 3600) }); return;
      }
      if (route.startsWith('/api/admin/')) {
        const session = admin(req, !['GET', 'HEAD'].includes(req.method));
        if (route === '/api/admin/session' && req.method === 'GET') { send(res, 200, { csrf: session.csrf }); return; }
        if (route === '/api/admin/logout' && req.method === 'POST') { admins.delete(cookie(req, 'ls_admin')); send(res, 200, { ok: true }, { 'Set-Cookie': cookies('ls_admin', '', 0) }); return; }
        if (route === '/api/admin/config' && req.method === 'GET') { send(res, 200, { retentionDays: retention,orderContactRetentionDays:orders.contactRetentionDays, paymentConnected: !!options.paymentSecret, wechatConnected: !!options.accountBridgeSecret || platforms.configured('wechat'),douyinConnected:platforms.configured('douyin') }); return; }
        const days = url.searchParams.get('days') || '30';
        if (!['7', '30', '90', 'all'].includes(days)) throw problem(400, '日期范围无效');
        if(route==='/api/admin/system'&&req.method==='GET'){store.cleanup();orders.cleanup();send(res,200,system.overview());return;}
        if(route==='/api/admin/audit'&&req.method==='GET'){send(res,200,system.audits({days,q:url.searchParams.get('q')||'',action:url.searchParams.get('action')||'',page:Number(url.searchParams.get('page')||1)}));return;}
        if(route==='/api/admin/backups'&&req.method==='POST'){rate(req,'backup',6,600000);send(res,201,await system.createBackup(await jsonBody(req)));return;}
        const checkBackup=route.match(/^\/api\/admin\/backups\/([0-9a-f-]{36})\/verify$/);
        if(checkBackup&&req.method==='POST'){rate(req,'backup-check',6,600000);await jsonBody(req);send(res,200,await system.verify(checkBackup[1]));return;}
        const savedBackup=route.match(/^\/api\/admin\/backups\/([0-9a-f-]{36})(\/file)?$/);
        if(savedBackup){if(savedBackup[2]&&req.method==='GET'){
          const item=system.download(savedBackup[1]),headers={'Content-Length':item.bytes};
          // Fetch receives ZIP bytes; navigation retains normal attachment semantics.
          if(req.headers['x-backup-transfer']!=='fetch')headers['Content-Disposition']=`attachment; filename="little-story-backup-${item.id}.zip"`;
          file(res,item.path,'application/zip',headers);return;
        }if(!savedBackup[2]&&req.method==='DELETE'){send(res,200,system.remove(savedBackup[1]));return;}}
        if(route==='/api/admin/products'&&req.method==='GET'){send(res,200,billing.productList());return;}
        const product=route.match(/^\/api\/admin\/products\/([a-z0-9-]{1,100})$/);
        if(product&&req.method==='PATCH'){send(res,200,billing.updateProduct(product[1],await jsonBody(req)));return;}
        const price=route.match(/^\/api\/admin\/print-orders\/([0-9a-f-]{36})\/quote$/);
        if(price&&req.method==='POST'){orders.cleanup();send(res,200,billing.quote(price[1],await jsonBody(req)));return;}
        if(route==='/api/admin/billing'&&req.method==='GET'){send(res,200,billing.listIntents({days,q:url.searchParams.get('q')||'',page:Number(url.searchParams.get('page')||1)}));return;}
        const intent=route.match(/^\/api\/admin\/billing\/([0-9a-f-]{36})(\/refund-requests)?$/);
        if(intent){if(!intent[2]&&req.method==='GET'){send(res,200,billing.intentDetail(intent[1]));return;}if(intent[2]&&req.method==='POST'){send(res,201,billing.refundRequest(intent[1],await jsonBody(req)));return;}}
        const refund=route.match(/^\/api\/admin\/refund-requests\/([0-9a-f-]{36})\/cancel$/);
        if(refund&&req.method==='POST'){send(res,200,billing.cancelRefund(refund[1],await jsonBody(req)));return;}
        const person=route.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]{1,100})$/);
        if(person&&req.method==='GET'){orders.cleanup();send(res,200,userAdmin.detail(person[1],{section:url.searchParams.get('section')||'activity',page:Number(url.searchParams.get('page')||1)}));return;}
        if(route==='/api/admin/print-orders'&&req.method==='GET'){
          orders.cleanup();send(res,200,orders.list({days,q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'',source:url.searchParams.get('source')||'',page:Number(url.searchParams.get('page')||1)}));return;
        }
        if(route==='/api/admin/print-orders/export'&&req.method==='GET'){
          orders.cleanup();const csv=orders.exportCsv({days,q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'',source:url.searchParams.get('source')||''});
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="print-orders.csv"'});res.end(csv);return;
        }
        const adminOrder=route.match(/^\/api\/admin\/print-orders\/([0-9a-f-]{36})$/);
        if(adminOrder){orders.cleanup();if(req.method==='GET'){send(res,200,orders.detail(adminOrder[1]));return;}if(req.method==='PATCH'){send(res,200,orders.update(adminOrder[1],await jsonBody(req)));return;}}
        if (route === '/api/admin/overview' && req.method === 'GET') { store.cleanup(); send(res, 200, store.dashboard(days)); return; }
        if (/^\/api\/admin\/(prints|users|payments|referrals)$/.test(route) && req.method === 'GET') {
          const page = Number(url.searchParams.get('page') || 1), state = url.searchParams.get('state') || '', q = url.searchParams.get('q') || '';
          if (!Number.isSafeInteger(page) || page < 1 || q.length > 100 || (state && !STATES.includes(state))) throw problem(400, '筛选条件无效');
          store.cleanup(); send(res, 200, store.list(route.split('/').pop(), { days, page, state, q })); return;
        }
        const match = route.match(/^\/api\/admin\/prints\/([0-9a-f-]{36})(\/file)?$/);
        if (match) {
          const item = store.get('SELECT * FROM prints WHERE id=?', match[1]);
          if (!item) throw problem(404, '打印记录不存在');
          if (match[2] && req.method === 'GET') {
            if (item.deleted || item.expires <= now()) { store.cleanup(); throw problem(410, '文件已到期或删除'); }
            if (!fs.existsSync(path.join(directory, 'files', item.id + '.pdf'))) throw problem(410, '文件不可用');
            store.audit('download-file', item.id);
            file(res, path.join(directory, 'files', item.id + '.pdf'), 'application/pdf', { 'Content-Length': item.bytes, 'Content-Disposition': `attachment; filename="${item.name}"; filename*=UTF-8''${encodeURIComponent(item.title + '-试印校样.pdf')}` }); return;
          }
          if (!match[2] && req.method === 'PATCH') {
            const value = await jsonBody(req); if (!STATES.includes(value.state)) throw problem(400, '处理状态无效');
            store.run('UPDATE prints SET state=? WHERE id=?', value.state, item.id); store.audit('state-' + value.state, item.id); send(res, 200, { ok: true }); return;
          }
          if (!match[2] && req.method === 'DELETE') {
            system.invalidateBackups();await fs.promises.rm(path.join(directory, 'files', item.id + '.pdf'), { force: true }); store.run('UPDATE prints SET deleted=?,title=? WHERE id=?', now(), '已清理绘本（'+item.book+'）', item.id); store.audit('delete-file', item.id); send(res, 200, { ok: true }); return;
          }
        }
        throw problem(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw problem(404, '接口不存在');
      if (route === '/admin' || route === '/admin/') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
        file(res, path.join(ROOT, 'admin/index.html'), 'text/html; charset=utf-8'); return;
      }
      if (['/admin/app.js','/admin/orders.js','/admin/billing.js','/admin/users.js','/admin/system.js', '/admin/style.css'].includes(route)) { file(res, path.join(ROOT, route.slice(1)), route.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8'); return; }
      if (route === '/' || route === '/index.html') {
        const config = { enabled: true, retentionDays: retention,orderContactRetentionDays:orders.contactRetentionDays };
        const html = fs.readFileSync(path.join(ROOT, 'preview/index.html'), 'utf8').replace('<head>', '<head><script>window.LITTLE_STORY_BACKEND=' + JSON.stringify(config) + ';</script>');
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(req.method === 'HEAD' ? '' : html); return;
      }
      if (/^\/(?:vendor\/(?:mediapipe|pdf-lib|jszip)|models|art\/(?:flower|family|intro|sequence))\/[a-zA-Z0-9_./-]+$/.test(route) && !route.includes('..')) {
        const filename = path.join(ROOT, 'preview', route), ext = path.extname(filename), types = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain' };
        if (fs.existsSync(filename) && fs.statSync(filename).isFile()) { file(res, filename, types[ext] || 'application/octet-stream'); return; }
      }
      throw problem(404, '页面不存在');
    } catch (e) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      send(res, e.status || 500, { error: e.status ? e.message : '后台暂时无法处理，请稍后重试' });
      if (!e.status && options.onError) options.onError(e);
      if(!e.status){const category=req.url?.startsWith('/api/admin/')?'admin':req.url?.startsWith('/internal/')?'internal':'reader';try{system.recordError(category,e);}catch(_){} }
    }
  });
  server.requestTimeout = 120000; server.headersTimeout = 15000;
  store.cleanup();orders.cleanup();system.cleanup();
  const timer = setInterval(() => { store.cleanup();orders.cleanup();system.cleanup(); for (const [key, value] of limits) if (value.reset <= now()) limits.delete(key); for (const [key, value] of admins) if (value.expires <= now()) admins.delete(key); }, 60000); timer.unref();
  server.on('close', () => { clearInterval(timer); store.close(); });
  return { server, store,orders,billing,userAdmin,system };
}
module.exports = { createApplication };
