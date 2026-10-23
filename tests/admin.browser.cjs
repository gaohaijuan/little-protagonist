'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const crypto=require('node:crypto');
const { createApplication } = require('../server/app.cjs');
const deps = 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const { chromium } = require(deps + 'playwright');
const { PDFDocument } = require(deps + 'pdf-lib');
const root = path.resolve(__dirname, '..'), directory = path.join(root, '.local/admin-browser-' + Date.now());
const PASSWORD = 'browser-test-admin-password';
async function completeOrderForm(reader){const form=reader.locator('#ls-order-form');await form.locator('[name="name"]').fill('测试家长');await form.locator('[name="phone"]').fill('13800000000');await form.locator('[name="address"]').fill('上海市测试区测试路1号');await form.locator('[name="consent"]').check();await form.locator('button[type="submit"]').click();}
(async () => {
  const errors = [], app = createApplication({ adminPassword: PASSWORD, dataDir: directory, onError: error => errors.push(error.message) });
  app.server.listen(20000+crypto.randomInt(40000), '127.0.0.1'); await once(app.server, 'listening'); const base = 'http://127.0.0.1:' + app.server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 960 } });
    const admin = await context.newPage(), reader = await context.newPage();
    for (const page of [admin, reader]) { page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (message.text().includes('Content Security Policy')) errors.push(message.text()); }); }
    await admin.goto(base + '/admin'); await admin.locator('#password').fill(PASSWORD); await admin.locator('#login-form button').click(); await admin.locator('#workspace').waitFor({ state: 'visible' });
    await admin.locator('[data-tab="prints"]').click(); await admin.getByText('这里还没有记录').waitFor();
    await reader.goto(base+'/?printTools=1'); await reader.locator('.ls-book[data-id="intro"]').click();
    await reader.waitForFunction(() => window.LITTLE_STORY_BACKEND?.enabled);
    const session = await reader.evaluate(() => fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()));
    assert.ok(session.userId);
    let uploads = 0, rejectUpload = true, failCollection=false;
    await reader.route('**/api/prints?*', async route => { uploads++; if (rejectUpload||(failCollection&&new URL(route.request().url()).searchParams.get('book')==='level-1')) { rejectUpload = false;failCollection=false;await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"模拟网络失败"}' }); } else await route.continue(); });
    reader.on('dialog', dialog => dialog.accept());
    await reader.locator('[data-action="submit-print"]').click();
    await completeOrderForm(reader);
    await reader.locator('.ls-print-status').filter({ hasText: '模拟网络失败' }).waitFor({ timeout: 120000 });
    assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n, 0);
    await reader.locator('[data-action="retry-print-submission"]').click();
    await reader.locator('.ls-print-status').filter({ hasText: '运营后台已收到' }).waitFor({ timeout: 30000 });
    assert.equal(uploads, 2); assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n, 1);
    await admin.locator('#refresh').click(); await admin.getByText('你好，我是小石头', { exact: true }).waitFor();
    const receipt = app.store.get('SELECT * FROM prints'); assert.equal(receipt.user_id, session.userId);
    const downloadWait = admin.waitForEvent('download'); await admin.getByRole('link', { name: '下载 PDF' }).click();
    const downloaded = await downloadWait, downloadedPath = await downloaded.path();
    const bytes = fs.readFileSync(downloadedPath), original = fs.readFileSync(path.join(directory, 'files', receipt.id + '.pdf'));
    assert.deepEqual(bytes, original, 'administrator receives the exact personalized PDF');
    const pdf = await PDFDocument.load(bytes); assert.ok(pdf.getPageCount()>1); assert.match(pdf.getSubject(), /not certified PDF\/X/);
    const stateWait = admin.waitForResponse(response => response.url().endsWith('/' + receipt.id) && response.request().method() === 'PATCH');
    await admin.locator('[data-status]').selectOption('processing'); assert.equal((await stateWait).status(), 200);
    await admin.screenshot({ path: path.join(directory, 'prints-desktop.png'), fullPage: true });
    await admin.locator('[data-tab="users"]').click(); await admin.locator('tbody tr').first().waitFor(); assert.match(await admin.locator('tbody').innerText(), /浏览器设备/);
    await admin.locator('[data-tab="payments"]').click(); await admin.getByText('这里还没有记录').waitFor();
    const guest = await browser.newContext(), invited = await guest.newPage();
    const invitedEvent=invited.waitForResponse(response=>response.url().endsWith('/api/events'));
    await invited.goto(base + '/?printTools=1&invite=' + session.inviteCode); await invited.locator('[data-action="download-level"]').waitFor();await invitedEvent;
    await admin.locator('[data-tab="referrals"]').click(); await admin.getByText('尚未付款',{exact:true}).waitFor();
    assert.equal(app.store.dashboard('30').referredUsers, 1);
    await admin.locator('[data-tab="overview"]').click(); await admin.locator('.card').first().waitFor();
    await admin.screenshot({ path: path.join(directory, 'overview-desktop.png'), fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 }); await admin.screenshot({ path: path.join(directory, 'overview-mobile.png'), fullPage: true });
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile dashboard fits viewport');
    await guest.close();
    // Local-only download still generates a file without creating another receipt.
    const localWait = reader.waitForEvent('download'); await reader.locator('[data-action="download-book-pdf"]').click(); await localWait;
    assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n, 1);
    // A level collection retries one stable key after a simulated upload failure.
    await reader.locator('[data-action="home"]').first().click();failCollection=true;
    await reader.locator('[data-action="submit-print"][data-scope="level"]').click();
    await completeOrderForm(reader);
    await reader.locator('.ls-print-status').filter({hasText:'模拟网络失败'}).waitFor({timeout:180000});
    assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n,1);
    await reader.locator('[data-action="retry-print-submission"]').click();
    await reader.locator('.ls-print-status').filter({hasText:'运营后台已收到 1 册绘本文件'}).waitFor({timeout:60000});
    assert.equal(app.store.get('SELECT COUNT(*) n FROM prints').n,2);assert.equal(app.store.get("SELECT COUNT(*) n FROM prints WHERE book='level-1'").n,1);
    assert.deepEqual(errors, []);
    console.log('PASS: actual PDF generation, single + one six-story collection retry without duplicates, authenticated exact-byte download, processing state, referrals, responsive admin, local-only download.');
    console.log('Screenshots: ' + directory);
  } finally { await browser.close(); await new Promise(resolve => app.server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
