'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch (_) { playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
const previewRoot = path.join(root, 'preview');
function servePreview(route) {
  const url = new URL(route.request().url());
  if (url.pathname === '/' || url.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  const file = path.resolve(previewRoot, '.' + url.pathname);
  if (!file.startsWith(previewRoot + path.sep) || !/^\/art\/(intro|flower|family|sequence)\//.test(url.pathname) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: file.endsWith('.json') ? 'application/json' : file.endsWith('.webp') ? 'image/webp' : 'image/png', body: fs.readFileSync(file) });
}
const output = path.join(root, 'preview/qa');
fs.mkdirSync(output, { recursive: true });

async function enterStoryBody(page) {
  await page.locator('.ls-reader').waitFor();
  const cover = page.locator('#ls-swipe-area.ls-reader-cover-stage');
  if (await cover.count()) {
    await page.locator('[data-action="next"]').click();
    await cover.waitFor({ state: 'detached' });
  }
}

async function main() {
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await context.route('http://reading.local/**', servePreview);
    await context.addInitScript(() => {
      window.__photoDraws = [];
      window.__photoWork = { analyze: 0, cutout: 0, encode: 0 };
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.dataset.art) window.__photoDraws.push({ book: this.canvas.dataset.art, source: (window.LittlePhotoTone?.originalOf(image)||image).src, reader: !!this.canvas.closest('.ls-reader') && !this.canvas.closest('.ls-reader-cover-stage') });
        return original.call(this, image, ...args);
      };
      const encode = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        window.__photoWork.encode++;
        return encode.apply(this, args);
      };
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // This suite isolates persistence/navigation. Actual face recognition, masks,
    // multiple faces and upload privacy run with real models in face.browser.cjs.
    const installPhotoStub = () => page.evaluate(() => {
      window.LittleFaceProcessor = {
        async analyze(source) {
          window.__photoWork.analyze++;
          // Like the real processor, own decoded pixels before the importer
          // releases its temporary object URL and source image.
          const copied = document.createElement('canvas'); copied.width = source.naturalWidth || source.width; copied.height = source.naturalHeight || source.height;
          copied.getContext('2d').drawImage(source, 0, 0);
          return {source:copied,faces:[{thumbnail:''}]};
        },
        async cutout(analysis) {
          window.__photoWork.cutout++;
          const canvas = document.createElement('canvas'); canvas.width=540; canvas.height=570;
          canvas.getContext('2d').drawImage(analysis.source,0,0,540,570);
          return {canvas, metrics:{bounds:{left:0,top:0,right:540,bottom:570},chin:{x:270,y:560}}};
        }
      };
    });
    await page.goto('http://reading.local/');
    await page.getByRole('heading', { name: '你好，小石头', exact: true }).waitFor();
    await installPhotoStub();
    await page.screenshot({ path: path.join(output, 'home.png'), fullPage: true });
    const action = name => page.locator('[data-action="' + name + '"]');
    const openProfile = () => page.getByRole('button', { name: '修改主角头像和名字' }).click();
    const role = id => page.locator('[data-action="role"][data-role="' + id + '"]');
    const waitPhoto = () => page.waitForFunction(() => !document.querySelector('[data-action="save-profile"]').disabled && document.querySelector('#ls-photo-status')?.textContent.includes('已自动适配'));
    const selectPhoto = async (name, buffer) => {
      await page.locator('#ls-photo-input').setInputFiles({ name, mimeType: 'image/png', buffer });
      await waitPhoto();
    };
    const readSaved = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('little-story-local', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('child', 'readonly'), item = tx.objectStore('child').get('main'); tx.oncomplete = () => { resolve(item.result); db.close(); }; };
    }));
    const makePhoto = async color => Buffer.from(await page.evaluate(color => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      const c = canvas.getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, 800, 600);
      c.fillStyle = '#f2c6a2'; c.beginPath(); c.ellipse(390, 290, 180, 230, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5b473d'; c.fillRect(330, 260, 22, 22); c.fillRect(430, 260, 22, 22);
      c.beginPath(); c.arc(395, 335, 60, 0, Math.PI); c.stroke();
      return canvas.toDataURL('image/png').split(',')[1];
    }, color), 'base64');

    await openProfile();
    await page.locator('#ls-name').fill(''); await action('save-profile').click();
    await page.getByRole('alert').filter({ hasText: '1 至 8' }).waitFor();
    await page.locator('#ls-name').fill('小豆包');
    await page.locator('#ls-age').selectOption('4'); await page.locator('#ls-class').selectOption('中班');
    await page.locator('#ls-photo-input').setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await page.locator('#ls-photo-error').filter({ hasText: '20 MB' }).waitFor();
    await page.locator('#ls-photo-input').setInputFiles({ name: 'unreadable.png', mimeType: 'image/png', buffer: Buffer.from('not a photo') });
    await page.waitForFunction(() => !!document.querySelector('#ls-photo-error')?.textContent.trim());
    assert.equal(await page.locator('#ls-form-error').textContent(), '', 'photo errors appear beside photo controls rather than under unrelated form fields');
    const photo = await makePhoto('#91b6bc');
    // A photo library can omit or mislabel MIME metadata. Inspect actual bytes;
    // these must pass through the native decoder rather than fail a type list.
    for (const mimeType of ['', 'application/octet-stream', 'image/heic']) {
      await page.locator('#ls-photo-input').setInputFiles({ name: 'phone-library-photo', mimeType, buffer: photo });
      await waitPhoto();
      assert.equal(await page.locator('#ls-photo-error').textContent(), '', 'successful decoding clears the previous photo error');
    }
    const reason = '原照片里的头发已经碰到照片边缘，请换一张头顶和两侧留有空白的照片。';
    await page.evaluate(message => {
      window.__normalCutout = window.LittleFaceProcessor.cutout;
      window.LittleFaceProcessor.cutout = async () => { throw new Error(message); };
    }, reason);
    await page.setViewportSize({ width: 390, height: 844 });
    await action('photo').scrollIntoViewIfNeeded();
    await page.locator('#ls-photo-input').setInputFiles({ name: 'rejected-head.png', mimeType: 'image/png', buffer: photo });
    await page.locator('#ls-photo-error').filter({ hasText: reason }).waitFor();
    assert.equal(await page.locator('#ls-photo-error').textContent(), reason, 'the exact extraction reason is retained');
    assert.equal(await action('save-profile').isDisabled(), true, 'failed input cannot overwrite a saved role');
    assert.equal(await page.evaluate(() => {
      const status = document.querySelector('#ls-photo-status'), error = document.querySelector('#ls-photo-error');
      return !!status && !!error && error.getBoundingClientRect().top >= status.getBoundingClientRect().bottom && error.getBoundingClientRect().top - status.getBoundingClientRect().bottom < 40;
    }), true, 'the cause is displayed immediately below processing status');
    await page.waitForFunction(() => {
      const box = document.querySelector('#ls-photo-error').getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    });
    await page.screenshot({ path: path.join(output, 'phone-photo-error.png'), fullPage: false });
    await page.evaluate(() => { window.LittleFaceProcessor.cutout = window.__normalCutout; });
    await page.setViewportSize({ width: 900, height: 1100 });
    await page.locator('#ls-photo-input').setInputFiles({ name: 'test-avatar.png', mimeType: 'image/png', buffer: photo });
    await waitPhoto();
    assert.equal(await page.locator('input[type="range"], [data-action="reset-head"]').count(),0,'avatar fitting exposes no manual position or size controls');
    assert.match(await page.locator('.ls-photo-guide').innerText(),/高清、正面的上半身照片/);
    assert.equal(await readSaved(), undefined, 'selecting a photo does not save prematurely');
    await page.screenshot({ path: path.join(output, 'profile.png'), fullPage: true });
    await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    const saved = await readSaved();
    assert.equal(saved.profile.name, '小豆包'); assert.equal(saved.profile.age, 4); assert.equal(saved.profile.className, '中班');
    assert.equal(saved.version, 4);
    assert.ok(saved.avatars.child.data.startsWith('data:image/png;base64,'));
    assert.deepEqual(saved.avatars.child.layout, { scale: 1, x: 0, y: 0 });
    await page.reload(); await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    await installPhotoStub();
    await page.waitForFunction(() => window.__photoDraws.some(item => item.book === 'family'));
    for (const book of ['intro', 'flower', 'family']) {
      assert.ok(await page.evaluate(({ book, data }) => window.__photoDraws.some(item => item.book === book && item.source === data), { book, data: saved.avatars.child.data }), `saved photo appears on ${book} cover after reload`);
    }

    // Old manually shifted heads migrate to the automatic fit without changing the photo.
    await page.evaluate(record=>new Promise((resolve,reject)=>{const r=indexedDB.open('little-story-local',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('child','readwrite');record.avatars.child.layout={scale:1.6,x:35,y:-35};tx.objectStore('child').put(record,'main');tx.oncomplete=()=>{db.close();resolve();};};}),saved);
    await page.reload();await page.getByRole('heading',{name:'你好，小豆包',exact:true}).waitFor();await installPhotoStub();
    await openProfile();assert.equal(await page.locator('input[type="range"]').count(),0);await action('save-profile').click();await page.getByRole('heading',{name:'你好，小豆包',exact:true}).waitFor();
    assert.deepEqual(await readSaved(),saved,'legacy manual offsets are cleared while PNG, metrics and profile survive');

    await openProfile(); await page.locator('#ls-name').fill('不保存的名字');
    await page.locator('#ls-photo-input').setInputFiles({ name: 'changed.png', mimeType: 'image/png', buffer: await makePhoto('#e3a6a0') });
    await waitPhoto(); await action('cancel-profile').click();
    await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    assert.deepEqual(await readSaved(), saved, 'cancel preserves committed profile and photo');
    await openProfile(); assert.equal(await page.locator('#ls-name').inputValue(), '小豆包');
    await page.locator('#ls-name').fill('返回也不保存'); await action('home').first().click();
    assert.deepEqual(await readSaved(), saved);

    await openProfile(); await page.locator('#ls-name').fill('失败不覆盖');
    await page.evaluate(() => {
      window.__originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = window.__originalTransaction.apply(this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => transaction.abort());
        return transaction;
      };
    });
    await action('save-profile').click(); await page.getByRole('alert').filter({ hasText: '保存没有成功' }).waitFor();
    assert.equal(await page.locator('#ls-name').inputValue(), '失败不覆盖');
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__originalTransaction; });
    assert.deepEqual(await readSaved(), saved, 'failed transaction leaves committed record intact');
    await action('cancel-profile').click();

    // Different role photos form one draft and one atomic save.
    await openProfile();
    assert.equal(await page.locator('[data-action="role"]').count(), 5, 'only the main child and four sibling roles can edit photos');
    await page.locator('[data-member-included="olderBrother"]').check();
    await page.locator('[data-member-included="youngerBrother"]').check();
    await role('olderBrother').click();
    await selectPhoto('older-brother.png', await makePhoto('#b5b9d1'));
    await role('youngerBrother').click();
    await selectPhoto('younger-brother.png', await makePhoto('#deb590'));
    await role('olderSister').click();
    await selectPhoto('sister.png', await makePhoto('#99bc95'));
    await role('olderBrother').click();
    assert.equal(await page.locator('input[type="range"]').count(),0,'each sibling also uses automatic fitting');
    await role('youngerBrother').click();
    assert.match(await page.locator('.ls-avatar-zone').innerText(),/已自动适配/);
    assert.deepEqual(await readSaved(), saved, 'editing optional roles does not save early');
    await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    const familySaved = await readSaved();
    assert.deepEqual(familySaved.avatars.child, saved.avatars.child, 'family additions preserve the child');
    assert.ok(familySaved.avatars.olderBrother.data.startsWith('data:image/png;base64,'));
    assert.notEqual(familySaved.avatars.olderBrother.data, familySaved.avatars.youngerBrother.data);
    assert.notEqual(familySaved.avatars.youngerBrother.data, familySaved.avatars.olderSister.data);
    assert.equal(familySaved.avatars.olderBrother.layout.x, 0);
    assert.equal(familySaved.avatars.youngerBrother.layout.y, 0);
    assert.ok(!familySaved.avatars.grandpa, 'an omitted optional role keeps its cartoon fallback');
    await page.reload(); await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    await installPhotoStub();
    await page.waitForFunction(data => window.__photoDraws.some(item => item.book === 'family' && item.source === data), familySaved.avatars.olderBrother.data);
    assert.ok(await page.evaluate(data => window.__photoDraws.some(item => item.book === 'family' && item.source === data), familySaved.avatars.youngerBrother.data), 'family art uses the younger brother photo');
    assert.ok(!await page.evaluate(data => window.__photoDraws.some(item => item.book === 'family' && item.source === data), familySaved.avatars.olderSister.data), 'unused sister photo does not replace another family member');
    await page.screenshot({ path: path.join(output, 'family-photos-home.png'), fullPage: true });

    await openProfile(); await role('olderBrother').click(); await action('remove-photo').click();
    await role('youngerBrother').click(); await selectPhoto('cancelled-photo.png',await makePhoto('#bbbbaa'));
    await action('cancel-profile').click();
    assert.deepEqual(await readSaved(), familySaved, 'cancel restores every role, including a removed photo');

    await openProfile(); await role('olderBrother').click(); await action('remove-photo').click();
    await page.evaluate(() => {
      window.__originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = window.__originalTransaction.apply(this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => transaction.abort());
        return transaction;
      };
    });
    await action('save-profile').click(); await page.getByRole('alert').filter({ hasText: '保存没有成功' }).waitFor();
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__originalTransaction; });
    assert.deepEqual(await readSaved(), familySaved, 'a failed multi-role save is atomic');
    await action('cancel-profile').click();

    // Finish a former role's analysis after selecting another role. The late
    // result must not replace either the newly selected role or committed data.
    await openProfile(); await role('youngerSister').click();
    await page.evaluate(() => {
      window.__normalAnalyze = window.LittleFaceProcessor.analyze;
      window.LittleFaceProcessor.analyze = source => new Promise(resolve => {
        window.__pendingRoleAnalysis = true;
        window.__finishRoleAnalysis = () => { window.__pendingRoleAnalysis = false; resolve({ source, faces: [{thumbnail:''}] }); };
      });
    });
    await page.locator('#ls-photo-input').setInputFiles({ name: 'late-younger-sister.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => window.__pendingRoleAnalysis);
    await role('youngerBrother').click();
    assert.match(await page.locator('.ls-avatar-zone').innerText(),/已自动适配/);
    await page.evaluate(() => { window.__finishRoleAnalysis(); window.LittleFaceProcessor.analyze = window.__normalAnalyze; });
    await page.waitForTimeout(50);
    assert.match(await page.locator('.ls-avatar-zone').innerText(),/已自动适配/,'stale role analysis cannot alter the new role');
    await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    assert.deepEqual(await readSaved(), familySaved, 'cancelled role extraction is not accidentally saved');

    await openProfile(); await role('olderSister').click(); await action('remove-photo').click();
    await action('save-profile').click();
    await page.getByRole('heading', { name: '你好，小豆包', exact: true }).waitFor();
    const removed = await readSaved();
    assert.ok(!removed.avatars.olderSister, 'removing a role saves its default cartoon choice');
    assert.deepEqual(removed.avatars.olderBrother, familySaved.avatars.olderBrother);
    assert.deepEqual(removed.avatars.youngerBrother, familySaved.avatars.youngerBrother);

    for (const [book, count] of [['intro', 6], ['flower', 6], ['family', 9]]) {
      await page.locator('[data-action="book"][data-id="' + book + '"]').click(); await action('start').click();
      await action('landscape').click(); await page.locator('.ls-reader').waitFor();
      await enterStoryBody(page);
      assert.ok(await page.locator('#ls-device').evaluate(node => node.classList.contains('ls-landscape')));
      await page.setViewportSize({ width: 800, height: 1060 });
      await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
      assert.equal(await page.locator('.ls-reader').count(), 1, 'manual landscape is not undone by orientation event');
      await page.waitForFunction(() => document.querySelector('#ls-device').getBoundingClientRect().width > 700);
      assert.equal(await action('previous').isDisabled(), false, 'the first story page can return to the cover');
      for (let index = 0; index < count; index++) {
        assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), String(index + 1));
        if (book === 'intro' && index === 0) assert.match(await page.locator('.ls-page-text').innerText(), /小豆包/);
        if (book === 'intro' && index === 3) assert.match(await page.locator('.ls-page-text').innerText(), /四岁/);
        if (book === 'intro' && index === 4) assert.match(await page.locator('.ls-page-text').innerText(), /中班/);
        if (book === 'flower' && index === 1) assert.match(await page.locator('.ls-page-text').innerText(), /有好多片/);
        if (index === 0) {
          await page.waitForFunction(({ book, data }) => window.__photoDraws.some(item => item.book === book && item.reader && item.source === data), { book, data: saved.avatars.child.data });
          await page.screenshot({ path: path.join(output, book + '.png'), fullPage: true });
        }
        await action('next').click();
      }
      await page.locator('.ls-reader-end-stage').waitFor();await action('next').click();await page.getByRole('heading', { name: '我读完啦！' }).waitFor(); await action('home').click();
    }
    await page.setViewportSize({ width: 360, height: 820 });
    await page.screenshot({ path: path.join(output, 'narrow.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    for (const version of [1, 2]) {
      const legacy = { version, profile: { name: '旧版小朋友', age: 5, className: '大班', avatarPath: '' }, avatarData: saved.avatars.child.data, avatarKind: version === 2 ? 'cutout' : '' };
      await page.evaluate(record => new Promise((resolve, reject) => {
        const request = indexedDB.open('little-story-local', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('child', 'readwrite');
          transaction.objectStore('child').put(record, 'main');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onabort = () => { db.close(); reject(transaction.error); };
        };
      }), legacy);
      await page.reload(); await page.getByRole('heading', { name: '你好，旧版小朋友', exact: true }).waitFor();
      await installPhotoStub();
      await page.waitForFunction(data => window.__photoDraws.some(item => item.source === data), legacy.avatarData);
      await openProfile(); await action('save-profile').click();
      await page.getByRole('heading', { name: '你好，旧版小朋友', exact: true }).waitFor();
      const migrated = await readSaved();
      assert.equal(migrated.version, 4, 'legacy version ' + version + ' saves as a role record');
      assert.equal(migrated.avatars.child.data, legacy.avatarData, 'legacy photo survives migration');
      assert.equal(migrated.profile.name, legacy.profile.name);
    }
    assert.deepEqual(errors, []);
    await context.close();

    // Model Safari's older orientation path: direction notification arrives first,
    // then viewport resize arrives later, without another direction notification.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await phone.route('http://reading.local/**', servePreview);
    await phone.addInitScript(() => {
      Object.defineProperty(window.screen, 'orientation', { value: undefined, configurable: true });
      window.addEventListener('orientationchange', event => {
        if (!event.earlyTestEvent) event.stopImmediatePropagation();
      }, true);
    });
    const mobile = await phone.newPage();
    const mobileErrors = []; mobile.on('pageerror', error => mobileErrors.push(error.message));
    await mobile.goto('http://reading.local/');
    await mobile.getByRole('heading', { name: '你好，小石头', exact: true }).waitFor();
    const mobileAction = name => mobile.locator('[data-action="' + name + '"]');
    const notifyEarlyRotation = () => mobile.evaluate(() => {
      const event = new Event('orientationchange'); event.earlyTestEvent = true; window.dispatchEvent(event);
    });
    const assertReaderFits = async label => {
      await mobile.waitForFunction(() => {
        const canvas = document.querySelector('.ls-reader-art canvas');
        return canvas && Math.abs(canvas.width - canvas.getBoundingClientRect().width) <= 1;
      });
      const bounds = await mobile.evaluate(() => {
        const next = document.querySelector('[data-action="next"]').getBoundingClientRect();
        const previous = document.querySelector('[data-action="previous"]').getBoundingClientRect();
        const text = document.querySelector('.ls-page-text');
        return { width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, next: { top: next.top, bottom: next.bottom }, previous: { top: previous.top, bottom: previous.bottom }, textOverflow: text.scrollHeight > text.clientHeight + 1, fontSize: parseFloat(getComputedStyle(text).fontSize) };
      });
      assert.ok(bounds.pageWidth <= bounds.width + 1, label + ': no horizontal scroll');
      assert.ok(bounds.pageHeight <= bounds.height + 1, label + ': fits visible height');
      assert.ok(bounds.next.top >= 0 && bounds.next.bottom <= bounds.height, label + ': next button fully visible');
      assert.ok(bounds.previous.top >= 0 && bounds.previous.bottom <= bounds.height, label + ': previous button fully visible');
      assert.equal(bounds.textOverflow, false, label + ': story text needs no inner scroll');
      assert.ok(bounds.fontSize >= 22, label + ': text remains readable');
    };
    await mobileAction('start-intro').click();
    await mobileAction('landscape').waitFor();
    await notifyEarlyRotation();
    assert.equal(await mobile.locator('.ls-rotate').count(), 1);
    await mobile.setViewportSize({ width: 844, height: 390 });
    await mobile.locator('.ls-reader').waitFor();
    await enterStoryBody(mobile);
    await assertReaderFits('844 × 390 after delayed viewport resize');
    await mobileAction('next').click();
    await notifyEarlyRotation();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.locator('.ls-rotate').waitFor();
    await notifyEarlyRotation();
    await mobile.setViewportSize({ width: 844, height: 390 });
    await mobile.locator('.ls-reader').waitFor();
    assert.equal(await mobile.getByRole('progressbar').getAttribute('aria-valuenow'), '2', 'real rotation preserves current page');
    for (let index = 1; index < 6; index++) await mobileAction('next').click();
    await mobile.locator('.ls-reader-end-stage').waitFor();await mobileAction('next').click();
    await mobileAction('home').click();

    for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await mobile.setViewportSize(size);
      for (const [id, count] of [['intro', 6], ['flower', 6], ['family', 7]]) {
        await mobile.locator('[data-action="book"][data-id="' + id + '"]').click();
        await mobileAction('start').click();
        await mobile.locator('.ls-reader').waitFor();
        await enterStoryBody(mobile);
        for (let index = 0; index < count; index++) {
          await assertReaderFits(`${size.width} × ${size.height}, ${id} page ${index + 1}`);
          if (index === 0 && id === 'intro') await mobile.screenshot({ path: path.join(output, `landscape-${size.width}x${size.height}.png`) });
          await mobileAction('next').click();
        }
        await mobile.locator('.ls-reader-end-stage').waitFor();await mobileAction('next').click();await mobile.getByRole('heading', { name: '我读完啦！' }).waitFor();
        assert.ok(await mobileAction('home').evaluate(button => button.getBoundingClientRect().bottom <= innerHeight), 'completion controls fit short viewport');
        await mobileAction('home').click();
      }
    }
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobileAction('start-intro').click(); await mobileAction('landscape').click();
    await enterStoryBody(mobile);
    await notifyEarlyRotation(); await mobile.setViewportSize({ width: 390, height: 740 });
    await mobile.waitForTimeout(150);
    assert.equal(await mobile.locator('.ls-reader').count(), 1, 'manual landscape survives ordinary portrait viewport resize');
    assert.deepEqual(mobileErrors, []);
    await phone.close();
    console.log('PASS: phone photo MIME compatibility, 20MB import limit and visible exact failure/recovery, automatic landmark fit without manual controls, legacy offset migration, optional family photos and role mapping, atomic save/cancel/failure, stale role cancellation, legacy migration, three books, pagination, portrait/landscape and narrow layouts.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
