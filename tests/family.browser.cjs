'use strict';
// This suite exercises family membership and storage with synthetic local heads.
// Real face extraction is covered separately by face.browser.cjs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const family = require('../miniprogram/lib/family');
const project = path.resolve(__dirname, '..');
const preview = path.join(project, 'preview');
const html = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
const output = path.join(preview, 'qa', 'family-ui');
const hasFamilyArt = fs.existsSync(path.join(preview, 'art', 'family', 'manifest.json'));
fs.mkdirSync(output, { recursive: true });
async function main() {
  const browser = await playwright.chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await context.route('http://family.local/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      const file = path.resolve(preview, '.' + pathname);
      if (!file.startsWith(preview + path.sep) || !/^\/art\/(intro|family|flower|sequence)\//.test(pathname) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : 'image/webp', body: fs.readFileSync(file) });
    });
    await context.addInitScript(() => {
      window.__imageSources = [];
      const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(value) { window.__imageSources.push(String(value)); src.set.call(this, value); } });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const action = name => page.locator('[data-action="' + name + '"]');
    const role = id => page.locator('[data-action="role"][data-role="' + id + '"]');
    const include = id => page.locator('[data-member-included="' + id + '"]');
    const open = () => page.getByRole('button', { name: '修改主角头像和名字' }).click();
    const home = () => page.getByRole('heading', { name: '你好，小石头', exact: true }).waitFor();
    const saved = () => page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('little-story-local', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { const db = req.result, tx = db.transaction('child', 'readonly'), get = tx.objectStore('child').get('main'); tx.oncomplete = () => { resolve(get.result); db.close(); }; };
    }));
    const store = record => page.evaluate(record => new Promise((resolve, reject) => {
      const req = indexedDB.open('little-story-local', 1);
      req.onsuccess = () => { const db = req.result, tx = db.transaction('child', 'readwrite'); tx.objectStore('child').put(record, 'main'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
    }), record);
    const stub = () => page.evaluate(() => {
      window.__analysisCalls = 0;
      window.LittleFaceProcessor = { async analyze(source) { window.__analysisCalls++; const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth || source.width; canvas.height = source.naturalHeight || source.height; canvas.getContext('2d').drawImage(source, 0, 0); return { source: canvas, faces: [{ thumbnail: '' }] }; }, async cutout(result) { return { canvas: result.source, metrics: { bounds: { left: 20, top: 10, right: 180, bottom: 220 }, chin: { x: 100, y: 215 }, faceBounds: { left: 35, top: 85, right: 165, bottom: 220 } } }; } };
    });
    const add = async roleName => { await page.locator('#ls-sibling-role').selectOption(roleName); await action('add-member').click(); return page.locator('[data-action="role"][aria-pressed="true"]').getAttribute('data-role'); };
    await page.goto('http://family.local/'); await home(); await stub();
    const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 230; const x = c.getContext('2d'); x.fillStyle = '#bd957f'; x.beginPath(); x.ellipse(100, 120, 78, 105, 0, 0, Math.PI * 2); x.fill(); return c.toDataURL('image/png'); });
    const photo = { name: 'local-synthetic-head.png', mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64') };
    const upload = async () => { await page.locator('#ls-photo-input').setInputFiles(photo); await page.waitForFunction(() => document.querySelector('#ls-photo-status')?.textContent.includes('已自动适配') && !document.querySelector('[data-action="save-profile"]').disabled); };
    const save = async () => { await action('save-profile').click(); await home(); };
    const start = async id => {
      await page.locator('[data-action="book"][data-id="' + id + '"]').click();
      await action('start').click();
      if (await action('landscape').count()) await action('landscape').click();
      await page.locator('.ls-reader').waitFor();
      const cover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
      if (await cover.count()) {
        await action('next').click();
        await cover.waitFor({ state: 'detached' });
      }
    };
    await open();
    if (hasFamilyArt) {
      await page.waitForFunction(() => document.querySelector('.ls-profile-preview canvas')?.dataset.artState === 'ready');
      await role('olderSister').click();
      await page.waitForFunction(() => document.querySelector('.ls-profile-preview canvas')?.dataset.artState === 'ready');
      await page.locator('.ls-profile-preview').screenshot({ path: path.join(output, 'sibling-body-preview.png') });
      await page.locator('.ls-family-comparison summary').click();
      await page.waitForFunction(() => document.querySelector('.ls-family-art canvas')?.dataset.artState === 'ready');
      await page.locator('.ls-family-art').screenshot({ path: path.join(output, 'three-person-comparison.png') });
      await role('child').click();
    }
    assert.equal(await include('child').isDisabled(), true);
    for (const id of ['dad', 'mom', 'grandpa', 'grandma']) assert.equal(await role(id).count(), 0, 'adult photo editor is absent');
    assert.equal(await page.locator('[data-action="role"]').count(), 5);
    await include('mom').uncheck(); await include('mom').check();
    assert.equal(await page.evaluate(() => window.__analysisCalls), 0, 'selecting adult participants does not analyze photos');
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'role'; b.dataset.role = 'mom'; document.querySelector('#ls-screen').appendChild(b); b.click(); b.remove(); });
    assert.equal(await role('child').getAttribute('aria-pressed'), 'true', 'adult roles cannot be selected by a stale role event');
    for (const id of ['child', 'dad', 'mom']) assert.equal(await include(id).isChecked(), true);
    for (const id of ['grandpa', 'grandma', 'olderBrother', 'youngerBrother', 'olderSister', 'youngerSister']) assert.equal(await include(id).isChecked(), false);
    await save();
    const initial = await saved(); assert.equal(initial.version, 4); assert.equal(family.participants(initial.members).length, 3);

    // Independent photos for repeated relationships and cancel/failed-save safety.
    await open(); await include('olderSister').check();
    const sister2 = await add('olderSister'); await upload();
    const sister3 = await add('olderSister'); await upload();
    assert.notEqual(sister2, sister3);
    assert.equal(await role('olderSister').getAttribute('aria-label'), '编辑姐姐 1头像');
    assert.equal(await role(sister2).getAttribute('aria-label'), '编辑姐姐 2头像');
    assert.equal(await role(sister3).getAttribute('aria-label'), '编辑姐姐 3头像');
    await save(); const many = await saved();
    assert.equal(family.participants(many.members).length, 6);
    assert.ok(many.avatars[sister2]?.data); assert.ok(many.avatars[sister3]?.data);
    await page.reload(); await home(); await stub(); await open();
    assert.equal(await role(sister3).count(), 1, 'extra sibling ID survives reload');
    await include(sister2).uncheck(); await save(); const excluded = await saved();
    assert.ok(excluded.avatars[sister2]?.data, 'not appearing in a book keeps the photo');
    assert.equal(excluded.members.find(member => member.id === sister2).included, false);
    await open(); await page.locator('[data-action="remove-member"][data-member="' + sister3 + '"]').click(); await action('cancel-profile').click();
    assert.deepEqual(await saved(), excluded, 'cancelled deletion does not discard a sibling/photo');
    await open(); await page.locator('[data-action="remove-member"][data-member="' + sister3 + '"]').click();
    await page.evaluate(() => { window.__transaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (...args) { const tx = window.__transaction.apply(this, args); if (args[1] === 'readwrite') queueMicrotask(() => tx.abort()); return tx; }; });
    await action('save-profile').click(); await page.locator('#ls-form-error').filter({ hasText: '保存没有成功' }).waitFor();
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__transaction; });
    assert.deepEqual(await saved(), excluded, 'failed save keeps all committed members and photos');
    await save(); const deleted = await saved();
    assert.ok(!deleted.members.some(member => member.id === sister3)); assert.ok(!deleted.avatars[sister3]);
    assert.ok(deleted.members.some(member => member.id === sister2)); assert.ok(deleted.avatars[sister2]);

    // Membership changes reset only the affected book's progress.
    await start('intro'); await action('next').click(); await action('next').click(); await action('home').click();
    await start('family'); await action('next').click(); await action('next').click(); await action('home').click();
    await open(); await include('grandpa').check(); await save();
    await start('family'); assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '1'); await action('home').click();
    await start('intro'); assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '3'); await action('home').click();

    // Removing an active extra member invalidates an in-flight face result.
    await open(); const brother = await add('olderBrother');
    await page.evaluate(() => { window.LittleFaceProcessor.analyze = source => new Promise(resolve => { window.__pending = true; window.__finish = () => resolve({ source, faces: [{ thumbnail: '' }] }); }); });
    await page.locator('#ls-photo-input').setInputFiles(photo); await page.waitForFunction(() => window.__pending);
    await page.locator('[data-action="remove-member"][data-member="' + brother + '"]').click();
    await page.evaluate(() => window.__finish());
    assert.equal(await role('child').getAttribute('aria-pressed'), 'true'); await save();
    assert.ok(!(await saved()).avatars[brother], 'late extraction cannot resurrect a removed sibling');

    // v3 migration preserves original five people and already configured siblings.
    const adultData = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 12; c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#226699'; x.fillRect(0,0,12,16); return c.toDataURL('image/png'); });
    const adultRecord = { data: adultData, kind: 'cutout', layout: { scale: 1.13, x: 12, y: -5 }, metrics: { bounds: { left: 0, top: 0, right: 12, bottom: 16 }, chin: { x: 6, y: 16 } } };
    const legacy = { version: 3, profile: initial.profile, avatars: { olderBrother: { data, kind: 'cutout', layout: { scale: 1, x: 0, y: 0 } }, dad: adultRecord, mom: adultRecord, grandpa: adultRecord, grandma: adultRecord } };
    await store(legacy); await page.reload(); await home(); await stub(); await open();
    assert.equal(await page.evaluate(data => window.__imageSources.includes(data), adultData), false, 'stored adult photos are never decoded');
    for (const id of ['dad', 'mom', 'grandpa', 'grandma']) assert.equal(await role(id).count(), 0);
    await include('mom').uncheck(); await action('cancel-profile').click();
    assert.deepEqual(await saved(), legacy, 'cancel preserves stored adult data');
    await open();
    await page.evaluate(() => { window.__transaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (...args) { const tx = window.__transaction.apply(this, args); if (args[1] === 'readwrite') queueMicrotask(() => tx.abort()); return tx; }; });
    await action('save-profile').click(); await page.locator('#ls-form-error').filter({ hasText: '保存没有成功' }).waitFor();
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__transaction; });
    assert.deepEqual(await saved(), legacy, 'failed save preserves stored adult data');
    assert.equal(await include('olderBrother').isChecked(), true); assert.equal(await include('grandpa').isChecked(), true);
    await save(); const migrated = await saved();
    assert.equal(migrated.version, 4); assert.equal(family.participants(migrated.members).length, 6); assert.equal(migrated.avatars.olderBrother.data, data);

    for (const id of ['dad', 'mom', 'grandpa', 'grandma']) assert.deepEqual(migrated.avatars[id], adultRecord, 'successful migration retains unused adult data');
    await page.reload(); await home(); await stub();
    assert.equal(await page.evaluate(data => window.__imageSources.includes(data), adultData), false, 'adult data stays undecoded after a v4 reload');

    // The UI has a clear maximum and never silently adds a thirteenth person.
    await open();
    for (const id of ['olderSister', 'youngerSister', 'youngerBrother']) await include(id).check();
    while (await action('add-member').isEnabled()) await add('youngerSister');
    assert.equal(await page.locator('[data-member-included]:checked').count(), 12);
    assert.equal(await action('add-member').isDisabled(), true);
    await save(); const twelve = await saved();
    assert.equal(family.participants(twelve.members).length, 12);
    await open(); await include('dad').uncheck(); const thirteenth = await add('olderBrother');
    await include('dad').click();
    assert.equal(await include('dad').isChecked(), false); await page.locator('#ls-form-error').filter({ hasText: '最多安排 12' }).waitFor();
    await action('cancel-profile').click(); assert.ok(!(await saved()).members.some(member => member.id === thirteenth));

    // 1, 3, 6 and 12-person books finish correctly at phone sizes and readable text.
    for (const count of [1, 3, 6, 12]) {
      const members = twelve.members.map((member, index) => ({ ...member, included: index < count }));
      await store({ ...twelve, avatars: {}, members }); await page.reload(); await home();
      const expected = family.familyBook(initial.profile, members).pages;
      for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
        await page.setViewportSize(size); await start('family');
        if (hasFamilyArt) await page.waitForFunction(() => document.querySelector('.ls-reader-art canvas')?.dataset.artState === 'ready');
        for (let index = 0; index < expected.length; index++) {
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), String(index + 1));
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuemax'), String(expected.length));
          assert.equal((await page.locator('.ls-page-text').innerText()).replace(/\s/g, ''), expected[index].join('').replace(/\s/g, ''));
          const fits = await page.locator('.ls-page-text').evaluate(element => { const r = element.getBoundingClientRect(); return { font: parseFloat(getComputedStyle(element).fontSize), height: element.scrollHeight <= element.clientHeight + 1, width: element.scrollWidth <= element.clientWidth + 1, bottom: r.bottom <= innerHeight }; });
          assert.ok(fits.font >= 22 && fits.height && fits.width && fits.bottom, `${count} people, ${size.width}px, page ${index + 1} text fits`);
          if (index === 0 && size.width === 568) await page.screenshot({ path: path.join(output, count + '-people.png') });
          await action('next').click();
        }
        await page.locator('.ls-reader-end-stage').waitFor();await action('next').click();await page.getByRole('heading', { name: '我读完啦！' }).waitFor(); await action('home').click();
      }
    }
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS: child-only photo editing, stored adult photos retained without decoding, family v4, selectable roles, repeated siblings, stable IDs and photos, atomic save/cancel, excluded-photo retention, stale deleted-member extraction, v3 migration, 12-person limit, independent progress, and 1/3/6/12-person mobile pagination.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
