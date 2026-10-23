const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../../sites/manuscript-review/dist');
const out = __dirname;
const manuscript = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../content/level1-stories-reviewed-30.json'), 'utf8'));
const { personalizeReviewedBooks, auditReviewedBooks } = require('../../miniprogram/lib/reviewed-personalization');
const { defaultMembers } = require('../../miniprogram/lib/family');
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html', 'books-01-40.html', 'books-11-20.html'].includes(filename)) {
    response.writeHead(404).end(); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(fs.readFileSync(path.join(root, filename)));
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(4178, '127.0.0.1', resolve));
    const readiness = await fetch('http://127.0.0.1:4178/');
    assert.equal(readiness.status, 200);
    console.log('Local preview http://127.0.0.1:4178/ HTTP 200');
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const checks = [];
    for (const width of [320, 390, 1200]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:4178/', { waitUntil: 'load', timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('article').count(), 30);
      assert.equal(await page.locator('.toc a').count(), 30);
      assert.ok((await page.locator('#series-review').innerText()).includes('全册连读与旧词回访'));
      assert.ok((await page.locator('#book-15 h2').innerText()).includes('球还在我手里'));
      assert.ok(!(await page.locator('#book-15 .pages').innerText()).includes('小脚在车上'));
      const generated=personalizeReviewedBooks(manuscript.books,{name:'小主角',age:5,className:'大班'},defaultMembers());
      for (const book of generated) {
        const card = page.locator(`#book-${book.number}`);
        assert.equal(await card.locator('h2').innerText(), book.title.replaceAll('CHILD', '小主角'));
        assert.deepEqual(await card.locator('.pages p').allTextContents(), book.pages.flat().map(line => line.replaceAll('CHILD', '小主角')), `Story ${book.number}: browser text must match canonical prose`);
      }
      const links = await page.locator('a[href^="#"]').evaluateAll(nodes => nodes.every(a => document.querySelector(a.getAttribute('href'))));
      assert.ok(links, 'All chapter anchors resolve');
      assert.deepEqual(errors,[], 'Client modules initialize without errors');
      if(width===390){
        await page.locator('[name="name"]').fill('宁宁');
        await page.locator('[name="age"]').selectOption('4');
        await page.locator('[name="className"]').selectOption('中班');
        await page.locator('[data-family-preset="4"]').click();
        assert.ok((await page.locator('#book-1 .pages').innerText()).includes('我四岁了。'));
        assert.ok((await page.locator('#book-21 .pages').innerText()).includes('我四岁了！'));
        assert.ok((await page.locator('#book-21 .pages').innerText()).includes('我上中班了！'));
        assert.equal(await page.locator('#book-3 .pages li').count(),7);
        assert.ok((await page.locator('#book-3 .pages').innerText()).includes('一共有三口人。'));
        assert.ok((await page.locator('#book-3 .pages').innerText()).includes('我家有四口人。'));
        const four=defaultMembers().map(m=>({...m,included:['child','dad','mom','youngerSister'].includes(m.id)}));
        const expectedFour=auditReviewedBooks(personalizeReviewedBooks(manuscript.books,{name:'宁宁',age:4,className:'中班'},four,{forStatistics:true}));
        assert.equal(await page.locator('#book-3 [data-count="new"]').innerText(),String(expectedFour[2].newCount));
        await page.locator('#book-3').evaluate(el=>el.scrollIntoView());
        await page.screenshot({path:path.join(out,'reviewed-mobile-four-family.png')});
        await page.locator('[data-family-preset="6"]').click();
        assert.ok((await page.locator('#book-3 .pages').innerText()).includes('一共有五口人。'));
        assert.ok((await page.locator('#book-3 .pages').innerText()).includes('我家有六口人。'));
        assert.equal(await page.locator('#book-3 .pages li').count(),7);
        await page.reload({waitUntil:'load'});
        assert.ok((await page.locator('#current-profile').innerText()).includes('宁宁 · 4岁 · 中班 · 家庭6口人'));
        await page.locator('#book-3').evaluate(el=>el.scrollIntoView());
        await page.screenshot({path:path.join(out,'reviewed-mobile-six-family.png')});
        for(const age of ['3','4','5','6']){
          await page.locator('[name="age"]').selectOption(age);
          await page.locator('button[type="submit"]').click();
          const word={3:'三',4:'四',5:'五',6:'六'}[age];
          assert.ok((await page.locator('#book-21 .pages').innerText()).includes('我'+word+'岁了！'));
        }
        // Restore the initial example for subsequent layout and source-text checks.
        await page.locator('[name="name"]').fill('小主角');
        await page.locator('[name="age"]').selectOption('5');
        await page.locator('[name="className"]').selectOption('大班');
        await page.locator('[data-family-preset="3"]').click();
        assert.deepEqual(errors,[],'Settings and persistence have no script errors');
      }
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      const layout = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, paragraphs: [...document.querySelectorAll('.pages p')].every(p => p.scrollWidth <= p.clientWidth + 1) }));
      assert.ok(layout.content <= width + 1, `Page overflows at ${width}: ${layout.content}`);
      assert.ok(layout.paragraphs, `Reading text overflows at ${width}`);
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = false; }));
      if (width === 390) {
        await page.evaluate(()=>scrollTo(0,0));
        await page.screenshot({ path: path.join(out, 'reviewed-mobile-top.png') });
        for (const number of manuscript.rewrittenInThisEdition) {
          await page.locator(`#book-${number}`).evaluate(el => el.scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: path.join(out, `reviewed-mobile-story${number}.png`) });
        }
      }
      checks.push({ width, ...layout, chapterAnchors: 30 });
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'level-1-reviewed-30-layout.json'), JSON.stringify({ checks, mode: 'local-http-preview', browser: 'installed-chrome', device: 'simulated-viewports-not-a-physical-phone' }, null, 2));
    console.log(JSON.stringify(checks));
  } finally {
    if (browser) await browser.close();
    if (process.argv.includes('--keep-preview')) {
      process.once('SIGINT', () => server.close(() => process.exit(0)));
    } else server.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
