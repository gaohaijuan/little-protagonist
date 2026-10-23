'use strict';
// Cross-device contract test: real downloaded file, isolated origins/profiles.
// Phone device descriptors run in desktop Chrome, not real iOS Safari/hardware.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const playwright = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const codec = require('../miniprogram/lib/account-backup');
const family = require('../miniprogram/lib/family');
const project = path.resolve(__dirname, '..');
const appRoot = path.join(project, 'sites/mobile-preview/dist');
const output = path.join(project, 'preview/qa/backup-transfer');
const privateOutput = fs.mkdtempSync(path.join(project, '.local/backup-transfer-'));
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const desktopOrigin = 'http://127.0.0.1:4173';
const phoneOrigin = 'https://little-story-reader.zippyelm16.chatgpt.site';
const readingKey = 'little-story.preview-reading.v1';
fs.mkdirSync(output, { recursive: true });
const errors = [], external = [];
const action = (page, name) => page.locator('[data-action="' + name + '"]');
const account = page => page.goto(new URL('/?view=account', page.url()).href).then(() => page.locator('.ls-account-child').waitFor());
const readChild = page => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('little-story-local', 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result, tx = db.transaction('child', 'readonly');
    const get = tx.objectStore('child').get('main');
    tx.oncomplete = () => { db.close(); resolve(get.result || null); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  };
}));
const readRows = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.records || [], readingKey);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
async function routeLocal(context, origin) {
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      external.push({ method: request.method(), origin: url.origin });
      return route.abort();
    }
    const filename = url.pathname === '/' ? path.join(appRoot, 'index.html') : path.resolve(appRoot, '.' + url.pathname);
    if (!filename.startsWith(appRoot + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return route.fulfill({status:404,body:''});
    const types = {'.html':'text/html','.json':'application/json','.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.webp':'image/webp'};
    return route.fulfill({status:200,contentType:types[path.extname(filename)] || 'application/octet-stream',body:fs.readFileSync(filename)});
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
}
async function downloadBackup(page, target) {
  await action(page, 'account-backup-export').click();
  await action(page, 'account-backup-generate').click();
  const link = page.getByRole('link', {name:'下载备份文件'});
  await link.waitFor();
  const event = page.waitForEvent('download');
  await link.click();
  const download = await event;
  assert.equal(await download.failure(), null);
  await download.saveAs(target);
  await action(page, 'account-cancel-backup').click();
  return codec.parseBrowserBackup(fs.readFileSync(target, 'utf8'));
}
async function startBook(page, id) {
  await page.goto(new URL('/', page.url()).href);
  await page.locator('.ls-book[data-id="' + id + '"]').click();
  await action(page, 'start').click();
  if (await action(page, 'landscape').count()) await action(page, 'landscape').click();
  await page.locator('.ls-reader').waitFor();
}
async function extract(page, file) {
  const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const processor = window.LittleFaceProcessor, analysis = await processor.analyze(image);
    if (analysis.faces.length !== 1) throw Error('expected one fixture face');
    try {
      const result = await processor.cutout(analysis, 0);
      return {data:result.canvas.toDataURL('image/png'),kind:'cutout',layout:{scale:1,x:0,y:0},metrics:result.metrics};
    } finally { processor.release(analysis); image.src = ''; }
  }, 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64'));
}
async function verifyPhone(label, descriptor, backupFile, expected) {
  const userDataDir = path.join(privateOutput, label + '-profile');
  const options = {...descriptor, executablePath:chrome, headless:true, acceptDownloads:true};
  delete options.defaultBrowserType;
  let context = await playwright.chromium.launchPersistentContext(userDataDir, options);
  const open = async () => {
    await routeLocal(context, phoneOrigin);
    await context.addInitScript(() => {
      // A restored, extracted portrait must never be re-detected or re-cut.
      let processor;
      window.__restoreInferenceCalls = 0;
      Object.defineProperty(window, 'LittleFaceProcessor', {
        configurable:true, get:() => processor,
        set:value => {
          processor = value;
          for (const method of ['analyze', 'cutout']) value[method] = async () => {
            window.__restoreInferenceCalls++; throw Error('unexpected inference during restore');
          };
        }
      });
    });
    const page = await context.newPage();
    await page.goto(phoneOrigin + '/?view=account');
    await page.locator('.ls-account-child').waitFor();
    return page;
  };
  try {
    let page = await open();
    assert.equal(await readChild(page), null, 'phone starts without desktop IndexedDB');
    assert.deepEqual(await readRows(page), [], 'phone starts without desktop reading storage');
    await page.evaluate(() => {
      localStorage.setItem('unrelated-test-data', 'keep-on-phone');
      sessionStorage.setItem('little-story.preview-demo.v1', JSON.stringify({version:1,mode:'demo',expiresAt:Date.now()+3600000}));
      localStorage.setItem('little-story.preview-account-profile.v1', JSON.stringify({version:1,nickname:'手机家长',onboardingCompleted:true}));
    });
    await page.reload();
    await action(page, 'account-backup-import').click();
    // Select the actual downloaded file by path; never populate destination data directly.
    await page.locator('#ls-account-backup-file').setInputFiles(backupFile);
    await page.locator('#ls-account-backup-word').waitFor();
    assert.equal(await readChild(page), null, 'preview cannot overwrite phone data');
    assert.match(await page.locator('.ls-account-backup').innerText(), /家庭故事 5 人，3 张已保存头像，4 本阅读记录/);
    assert.equal(await page.locator('#ls-account-backup-restore').isDisabled(), true);
    await page.locator('#ls-account-backup-word').fill('恢复');
    await page.locator('.ls-account-backup').screenshot({path:path.join(output,label + '-confirmation.png')});
    await action(page, 'account-backup-confirm').click();
    await page.getByRole('status').filter({hasText:'小主角、家人头像和阅读记录已恢复'}).waitFor();
    assert.deepEqual(await readChild(page), expected.child);
    assert.deepEqual(await readRows(page), expected.reading);
    assert.match(await page.locator('.ls-account-identity').innerText(), /手机家长/);
    assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-test-data')), 'keep-on-phone');
    await page.waitForFunction(() => document.querySelector('.ls-account-child img')?.naturalWidth > 0);
    await page.screenshot({path:path.join(output,label + '-restored.png'),fullPage:true});
    assert.equal(await page.evaluate(() => window.__restoreInferenceCalls), 0);
    // Close the entire browser and reopen the same phone profile, not just reload a tab.
    await context.close();
    context = await playwright.chromium.launchPersistentContext(userDataDir, options);
    page = await open();
    assert.deepEqual(await readChild(page), expected.child, 'all portraits/family survive browser restart');
    assert.deepEqual(await readRows(page), expected.reading, 'all progress survives browser restart');
    const reexport = await downloadBackup(page, path.join(privateOutput,label + '-reexport.json'));
    assert.deepEqual(reexport.child, expected.child);
    assert.deepEqual(reexport.reading, expected.reading);
    await page.locator('.ls-account > [data-action="profile"]').click();
    for (const member of expected.child.members) assert.equal(await page.locator('[data-member-included="' + member.id + '"]').isChecked(), member.included);
    for (const id of Object.keys(expected.child.avatars)) assert.match(await page.locator('[data-action="role"][data-role="' + id + '"]').innerText(), /✓/);
    await page.waitForFunction(() => document.querySelector('.ls-profile-preview canvas')?.dataset.artState === 'ready');
    await page.screenshot({path:path.join(output,label + '-family-settings.png'),fullPage:true});
    await action(page, 'cancel-profile').click();
    await account(page);
    assert.match(await page.locator('.ls-account-reading').innerText(), /读过 4 本 · 已读完 1 本/);
    // Verify actual navigation uses restored page, completion and dynamic family content.
    for (const row of expected.reading) {
      await page.locator('[data-action="account-continue-book"][data-id="' + row.bookId + '"]').click();
      if (row.finished || row.cover) await page.locator('.ls-reader-cover-stage').waitFor();
      else assert.equal(await page.locator('.ls-page-text').getAttribute('aria-label'), '第' + (row.page+1) + '页正文');
      if (row.bookId === 'family') assert.match(await page.locator('.ls-page-text').innerText(), /姐姐/);
      await page.waitForFunction(() => [...document.querySelectorAll('.ls-reader canvas')].some(c => c.dataset.artState === 'ready'));
      if (row.bookId === 'intro') await page.locator('.ls-reader').screenshot({path:path.join(output,label + '-resumed-reader.png')});
      await account(page);
    }
    assert.equal(await page.evaluate(() => window.__restoreInferenceCalls), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('PASS ' + label + ': fresh isolated phone profile/origin, real file import, exact 3 PNGs+metrics, all family flags/IDs, 4 reading states, browser restart, re-export, visible portraits and resume.');
    return {label,engine:'desktop Chrome device emulation',avatars:3,participants:5,readingRecords:4,restart:true,reexport:true,resume:true};
  } finally { await context.close(); }
}
async function main() {
  const browser = await playwright.chromium.launch({executablePath:chrome,headless:true});
  let backup;
  const backupFile = path.join(privateOutput, 'desktop-export.json');
  try {
    const desktop = await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
    await routeLocal(desktop, desktopOrigin);
    const page = await desktop.newPage();
    await page.goto(desktopOrigin + '/');
    await page.locator('.ls-bottomnav [data-action="profile"]').click();
    await page.locator('#ls-name').fill('跨设备小豆包');
    await page.locator('#ls-age').selectOption('4');
    await page.locator('#ls-class').selectOption('中班');
    await page.locator('[data-member-included="mom"]').uncheck();
    for (const id of ['grandpa','olderSister']) await page.locator('[data-member-included="' + id + '"]').check();
    await page.locator('#ls-sibling-role').selectOption('olderSister');
    await action(page, 'add-member').click();
    const sisterId = await page.locator('[data-action="role"][aria-pressed="true"]').getAttribute('data-role');
    await action(page, 'save-profile').click();
    await page.getByRole('heading', {name:'你好，跨设备小豆包',exact:true}).waitFor();
    const child = await extract(page, path.join(project,'.local/face-fixtures/portrait.jpg'));
    const sister = await extract(page, path.join(project,'.local/face-fixtures/fictional-long-hair.png'));
    assert.notEqual(child.data, sister.data);
    // Fixtures are pre-extracted through the real model; backup/restore is the operation under test.
    await page.evaluate(({child,sister,sisterId}) => new Promise((resolve,reject) => {
      const request = indexedDB.open('little-story-local',1);
      request.onsuccess = () => {
        const db=request.result,tx=db.transaction('child','readwrite'),store=tx.objectStore('child'),get=store.get('main');
        get.onsuccess=()=>store.put({...get.result,avatars:{child,[sisterId]:sister,youngerBrother:child}},'main');
        tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);
      };
    }), {child,sister,sisterId});
    await page.reload();
    await startBook(page, 'intro');
    await action(page,'next').click(); await action(page,'next').click(); await action(page,'next').click();
    await startBook(page, 'flower');
    for(let i=0;i<16 && !await page.locator('.ls-done').count();i++) await action(page,'next').click();
    await page.locator('.ls-done').waitFor();
    await startBook(page, 'family');
    for(let i=0;i<4;i++) await action(page,'next').click();
    assert.match(await page.locator('.ls-page-text').innerText(), /姐姐/);
    await startBook(page, 'hands'); // A separate record paused at its cover.
    await account(page);
    const sourceChild=await readChild(page),sourceRows=await readRows(page);
    assert.equal(sourceRows.length,4);assert.equal(family.participants(sourceChild.members).length,5);
    backup = await downloadBackup(page, backupFile);
    assert.deepEqual(backup.child, sourceChild);assert.deepEqual(backup.reading,sourceRows);
    assert.equal(backup.child.members.find(m=>m.id==='youngerBrother').included,false);
    console.log('PASS desktop: actual JSON downloaded from desktop UI, including multiple sisters and a saved non-participating sibling portrait.');
  } finally { await browser.close(); }
  const cases=[];
  cases.push(await verifyPhone('iphone-chrome-emulation',playwright.devices['iPhone 13'],backupFile,backup));
  cases.push(await verifyPhone('android-chrome-emulation',playwright.devices['Pixel 7'],backupFile,backup));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={testedAt:new Date().toISOString(),appBundleSha256:digest(fs.readFileSync(path.join(appRoot,'index.html'))),backupBytes:fs.statSync(backupFile).size,
    avatarHashes:Object.fromEntries(Object.entries(backup.child.avatars).map(([id,a])=>[id,digest(Buffer.from(a.data.split(',')[1],'base64'))])),cases,
    externalRequests:external,errors,limits:['Separate browser profiles/origins on one Windows computer; phone descriptors use desktop Chrome.','Published static bundle is served locally with all external requests blocked.','Physical phone, iOS Safari, OS file sharing/Files picker and native WeChat are not tested.']};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS transfer report: ' + path.join(output,'report.json'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
