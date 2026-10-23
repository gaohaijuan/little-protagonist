'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const uid = () => crypto.randomUUID();
const day = value => new Date(value + 8 * 3600000).toISOString().slice(0, 10);
function openStore(directory, retentionDays = 30, now = Date.now) {
  fs.mkdirSync(path.join(directory, 'files'), { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'operations.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, identity TEXT UNIQUE, source TEXT NOT NULL, invite TEXT UNIQUE NOT NULL, inviter TEXT REFERENCES users(id), created INTEGER NOT NULL, seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, book TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS prints(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL, book TEXT NOT NULL, title TEXT NOT NULL, name TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'received', created INTEGER NOT NULL, expires INTEGER NOT NULL, deleted INTEGER, UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS payments(event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, order_id TEXT NOT NULL, transaction_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS paid_transaction ON payments(transaction_id) WHERE kind='paid';
    CREATE UNIQUE INDEX IF NOT EXISTS paid_order ON payments(order_id) WHERE kind='paid';
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS activity_created ON activity(created);
    CREATE INDEX IF NOT EXISTS prints_created ON prints(created);
    CREATE INDEX IF NOT EXISTS payments_created ON payments(created);`);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function userSession({ token = '', invite = '', identity = null, source = 'browser', trustedId = null, durationDays = 90 } = {}) {
    let user = identity ? get('SELECT * FROM users WHERE identity=?', identity) : get('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?', hash(token), now());
    if (!user) {
      const id = trustedId || uid(), inviter = get('SELECT id FROM users WHERE invite=?', invite)?.id || null;
      run('INSERT INTO users VALUES(?,?,?,?,?,?,?)', id, identity, source, crypto.randomBytes(9).toString('hex'), inviter, now(), now());
      user = get('SELECT * FROM users WHERE id=?', id);
    }
    run('UPDATE users SET seen=? WHERE id=?', now(), user.id);
    const secret = crypto.randomBytes(32).toString('hex');
    run('INSERT INTO sessions VALUES(?,?,?)', hash(secret), user.id, now() + durationDays * 86400000);
    return { token: secret, userId: user.id, inviteCode: user.invite, source: user.source };
  }
  function authenticate(token) {
    return get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?', hash(token || ''), now());
  }
  function event(user, value) {
    if (!['visit', 'read', 'share'].includes(value.kind) || !/^[a-z0-9-]{0,60}$/.test(value.book || '') || !/^[a-zA-Z0-9-]{8,80}$/.test(value.id || '')) throw Object.assign(Error('无效的统计事件'), { status: 400 });
    run('INSERT OR IGNORE INTO activity VALUES(?,?,?,?,?)', user.id + ':' + value.id, user.id, value.kind, value.book || '', now());
    run('UPDATE users SET seen=? WHERE id=?', now(), user.id);
  }
  function payment(value, fingerprint) {
    for (const key of ['eventId', 'orderId', 'transactionId']) if (typeof value[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value[key])) throw Object.assign(Error('付款编号无效'), { status: 400 });
    const prior = get('SELECT fingerprint FROM payments WHERE event_id=?', value.eventId);
    if (prior) { if (prior.fingerprint !== fingerprint) throw Object.assign(Error('事件编号对应内容发生变化'), { status: 409 }); return { duplicate: true }; }
    if (!['paid', 'refund'].includes(value.kind) || !Number.isSafeInteger(value.amountFen) || value.amountFen <= 0 || value.amountFen > 100000000 || !get('SELECT id FROM users WHERE id=?', value.userId)) throw Object.assign(Error('付款数据无效'), { status: 400 });
    if (value.kind === 'refund') {
      if(get("SELECT event_id FROM payments WHERE kind='refund' AND transaction_id=?",value.transactionId))throw Object.assign(Error('退款流水已记录'),{status:409});
      const paid = get("SELECT * FROM payments WHERE order_id=? AND kind='paid'", value.orderId);
      const refunds = get("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE order_id=? AND kind='refund'", value.orderId).total;
      if (!paid || paid.user_id !== value.userId || refunds + value.amountFen > paid.amount) throw Object.assign(Error('退款必须对应已付订单且不能超过实付金额'), { status: 409 });
    }
    try { run('INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)', value.eventId, fingerprint, value.orderId, value.transactionId, value.userId, value.kind, value.amountFen, now()); }
    catch (error) { if (error.code?.startsWith('ERR_SQLITE')) throw Object.assign(Error('支付流水或订单已记录'), { status: 409 }); throw error; }
    return { duplicate: false };
  }
  function audit(action, target) { run('INSERT INTO audit VALUES(?,?,?,?)', uid(), action, target, now()); }
  function cleanup() {
    // Keep the receipt for support, but remove personalized contents at expiry.
    for (const item of all('SELECT id,book FROM prints WHERE deleted IS NULL AND expires<=?', now())) {
      fs.rmSync(path.join(directory, 'files', item.id + '.pdf'), { force: true });
      run('UPDATE prints SET deleted=?,title=? WHERE id=?', now(), '已清理绘本（'+item.book+'）', item.id);
      audit('expire-file', item.id);
    }
    // Recover files left between a disk write and database receipt by an abrupt
    // shutdown. Five minutes exceeds the HTTP upload deadline.
    for(const name of fs.readdirSync(path.join(directory,'files'))){
      const match=name.match(/^([0-9a-f-]{36})\.(pdf|part)$/);if(!match)continue;
      const filename=path.join(directory,'files',name);
      if(fs.statSync(filename).mtimeMs<now()-300000&&!get('SELECT id FROM prints WHERE id=?',match[1]))fs.rmSync(filename,{force:true});
    }
    run('DELETE FROM sessions WHERE expires<=?', now());
  }
  function range(days) { return days === 'all' ? 0 : Date.parse(day(now()) + 'T00:00:00+08:00') - (Number(days) - 1) * 86400000; }
  function dashboard(days) {
    const since = range(days), count = (sql, ...args) => get(sql, ...args).n;
    const paid = count("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE kind='paid' AND created>=?", since);
    const refund = count("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE kind='refund' AND created>=?", since);
    const referred = count('SELECT COUNT(*) n FROM users WHERE inviter IS NOT NULL AND created>=?', since);
    const observed = all("SELECT strftime('%Y-%m-%d',created/1000,'unixepoch','+8 hours') day, COUNT(*) users FROM users WHERE created>=? GROUP BY day ORDER BY day", since);
    const totals=new Map(observed.map(item=>[item.day,item.users]));
    const trend=days==='all'?observed:Array.from({length:Number(days)},(_,i)=>{const date=day(now()-(Number(days)-i-1)*86400000);return {day:date,users:totals.get(date)||0};});
    return { totalUsers: count('SELECT COUNT(*) n FROM users'), newUsers: count('SELECT COUNT(*) n FROM users WHERE created>=?', since), activeUsers: count('SELECT COUNT(DISTINCT user_id) n FROM activity WHERE created>=?', since), reads: count("SELECT COUNT(*) n FROM activity WHERE kind='read' AND created>=?", since), printRequests: count('SELECT COUNT(*) n FROM prints WHERE created>=?', since), paidOrders: count("SELECT COUNT(*) n FROM payments WHERE kind='paid' AND created>=?", since), payingUsers: count("SELECT COUNT(DISTINCT user_id) n FROM payments WHERE kind='paid' AND created>=?", since), paidFen: paid, refundedFen: refund, netFen: paid - refund, referredUsers: referred, referredPayers: count("SELECT COUNT(DISTINCT u.id) n FROM users u JOIN payments p ON p.user_id=u.id AND p.kind='paid' WHERE u.inviter IS NOT NULL AND u.created>=?", since), shares: count("SELECT COUNT(*) n FROM activity WHERE kind='share' AND created>=?", since), trend };
  }
  function list(kind, { days = '30', q = '', page = 1, state = '' } = {}) {
    const since = range(days), term = '%' + q + '%';
    const definitions = {
      prints: { table: 'prints p', where: "p.created>=? AND (p.title LIKE ? OR p.user_id LIKE ? OR p.id LIKE ?) AND (?='' OR p.state=?)", args: [since, term, term, term, state, state], select: 'p.*', order: 'p.created' },
      users: { table: 'users u', where: 'u.created>=? AND (u.id LIKE ? OR u.invite LIKE ?)', args: [since, term, term], select: `u.id,u.source,u.invite,u.inviter,u.created,u.seen,(SELECT COUNT(*) FROM prints WHERE user_id=u.id) prints,(SELECT COUNT(*) FROM payments WHERE user_id=u.id AND kind='paid') paidOrders`, order: 'u.created' },
      payments: { table: 'payments p', where: 'p.created>=? AND (p.order_id LIKE ? OR p.user_id LIKE ?)', args: [since, term, term], select: 'p.event_id,p.order_id,p.transaction_id,p.user_id,p.kind,p.amount,p.created', order: 'p.created' },
      referrals: { table: 'users u', where: 'u.inviter IS NOT NULL AND u.created>=? AND (u.id LIKE ? OR u.inviter LIKE ?)', args: [since, term, term], select: `u.id,u.inviter,u.source,u.created,(SELECT COUNT(*) FROM payments WHERE user_id=u.id AND kind='paid') paidOrders`, order: 'u.created' }
    };
    const spec = definitions[kind];
    if (!spec) throw Object.assign(Error('未知的列表'), { status: 404 });
    const total = get(`SELECT COUNT(*) n FROM ${spec.table} WHERE ${spec.where}`, ...spec.args).n;
    const rows = all(`SELECT ${spec.select} FROM ${spec.table} WHERE ${spec.where} ORDER BY ${spec.order} DESC LIMIT 25 OFFSET ?`, ...spec.args, (page - 1) * 25);
    return { rows: rows.map(row => kind === 'prints' ? { ...row, available: !row.deleted && row.expires > now() && fs.existsSync(path.join(directory,'files',row.id+'.pdf')), request_key: undefined, digest: undefined } : row), total, page, pageSize: 25 };
  }
  return { db, get, all, run, userSession, authenticate, event, payment, audit, cleanup, dashboard, list, retentionDays, now, directory, close: () => db.close() };
}
module.exports = { openStore, hash, uid };
