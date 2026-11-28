const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
// End-to-end walkthrough against a local Supabase (see CLAUDE.md). WIPES local data first.
const BASE = process.env.BASE_URL || 'http://localhost:3000', MAIL = 'http://127.0.0.1:54324';
const SP = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'phrf-e2e-'));
const sql = (q) => execSync(`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (m) => console.log(`✓ ${++step}. ${m}`);
function assert(c, m) { if (!c) throw new Error('FAILED: ' + m); }

async function codeFor(email) {
  for (let i = 0; i < 20; i++) {
    const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=1`)).json();
    if (r.messages?.length) {
      const m = await (await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`)).json();
      const code = (m.Text || m.HTML).match(/\b(\d{6})\b/);
      if (code) { await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE', headers: {'content-type':'application/json'}, body: JSON.stringify({ IDs: [r.messages[0].ID] }) }); return code[1]; }
    }
    await sleep(500);
  }
  throw new Error('no email for ' + email);
}
async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(BASE + '/login');
  await page.fill('input[type=email]', email);
  await page.click('text=Email me a sign-in link');
  await page.waitForSelector('text=Check your email');
  await page.fill('input[autocomplete=one-time-code]', await codeFor(email));
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/my/);
  return page;
}
const notice = async (page) => (await page.locator('.notice').allInnerTexts()).join(' | ');

(async () => {
  sql('truncate auth.users cascade; truncate public.boats, public.import_batches, public.activity cascade; alter sequence application_number_seq restart;');
  await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' });
  const browser = await chromium.launch();

  // 1. Brooke signs in first -> admin
  const brooke = await login(browser, 'brooke@example.com');
  assert(sql("select role from profiles where email='brooke@example.com'") === 'admin', 'first user admin');
  ok('First sign-in (email code) becomes admin');

  // A sign-in link works even when opened in a different browser
  {
    const a = await (await browser.newContext()).newPage();
    await a.goto(BASE + '/login');
    await a.fill('input[type=email]', 'linkuser@example.com');
    await a.click('text=Email me a sign-in link');
    await a.waitForSelector('text=Check your email');
    let link;
    for (let i = 0; i < 20 && !link; i++) {
      const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:linkuser@example.com')}&limit=1`)).json();
      if (r.messages?.length) {
        const m = await (await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`)).json();
        link = (m.HTML.match(/href="([^"]+verify[^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
      }
      if (!link) await sleep(500);
    }
    assert(link, 'link in email');
    const b = await (await browser.newContext()).newPage();
    await b.goto(link);
    await b.waitForURL(/\/my/, { timeout: 15000 });
    assert((await b.content()).includes('linkuser@example.com'), 'signed in via link in other browser');
    ok('Sign-in link works when opened in a different browser');
  }

  // committee members sign in once
  const alex = await login(browser, 'alex@example.com');
  const sam = await login(browser, 'sam@example.com');
  await brooke.goto(BASE + '/admin');
  for (const [email, role] of [['alex@example.com', 'committee'], ['sam@example.com', 'committee']]) {
    const row = brooke.locator('tr', { hasText: email });
    await row.locator('select').selectOption(role);
    await row.locator('button:has-text("Save")').click();
    await brooke.waitForSelector('text=Role updated');
  }
  assert(sql("select count(*) from profiles where role='committee'") === '2', 'roles set');
  ok('Admin page assigns committee roles');

  // 2. Owner applies with files
  const owner = await login(browser, 'olive@example.com');
  await owner.goto(BASE + '/apply');
  await owner.fill('[name="owner.full_name"]', 'Olive Owner');
  await owner.fill('[name="owner.phone"]', '361-555-0100');
  await owner.fill('[name="owner.club"]', 'Bay Yacht Club');
  await owner.fill('[name="boat.sail_number"]', 'USA 1234');
  await owner.fill('[name="boat.name"]', 'Windward');
  await owner.fill('[name="boat.make"]', 'J/Boats');
  await owner.fill('[name="boat.model"]', 'J/105');
  await owner.fill('[name="boat.year"]', '1995');
  await owner.selectOption('[name="sails.spinnaker"]', 'Asymmetric on a sprit / pole');
  await owner.selectOption('[name="engine.propeller"]', 'Folding');
  await owner.fill('[name="prior_ratings"]', 'Galveston Bay PHRF 87 (2024)');
  fs.copyFileSync(require('path').join(__dirname, '..', 'public', 'icons', 'icon-512.png'), SP + '/boat-photo.png');
  fs.writeFileSync(SP + '/sails.pdf', '%PDF-1.4\n% test\n');
  await owner.setInputFiles('[name="file:photo"]', SP + '/boat-photo.png');
  await owner.setInputFiles('[name="file:sail_measurements"]', SP + '/sails.pdf');
  await owner.fill('[name="attestation.name"]', 'Olive Owner');
  await owner.check('fieldset:has-text("Fee and signature") input[type=checkbox]');
  await owner.screenshot({ path: SP + '/shot-apply.png', fullPage: false });
  await owner.click('button:has-text("Submit application")');
  await owner.waitForURL(/\/my\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(async (e) => { console.log('NOTICE:', await notice(owner)); throw e; });
  const msg = await notice(owner);
  assert(/Thank you! Application A-\d{4}-0001 was submitted/.test(msg), 'submitted: ' + msg);
  assert(await owner.locator('.file').count() === 2, 'two files shown to owner');
  const appId = owner.url().split('/my/')[1].split('?')[0];
  ok('Owner submits application with photo + sail sheet: ' + msg);

  // owner cannot see committee pages
  await owner.goto(BASE + '/committee');
  assert(/That page is for the rating committee/.test(await notice(owner)), 'owner blocked from committee');
  ok('Owner is kept out of committee pages');

  // 3. Committee: list, open, can't vote before review
  await alex.goto(BASE + '/committee');
  await alex.click('a:has-text("A-2026-0001")'); await alex.waitForURL(/applications/); await alex.waitForSelector('h2:has-text("Votes")');
  assert(await alex.locator('text=Voting opens when the chair starts the review').count() === 1, 'not open');
  assert(await alex.locator('.file img').count() === 1, 'committee sees photo');
  ok('Committee member sees the application, photo and details');

  // 4. Brooke (admin=chair) opens review
  await brooke.goto(`${BASE}/committee/applications/${appId}`);
  await brooke.selectOption('select[name=status]', 'in_review');
  await brooke.click('button:has-text("Update status")');
  await brooke.waitForSelector('text=Status updated');
  ok('Chair opens review (votes due date set automatically)');

  // 5. Votes and discussion
  for (const [page, rating, adj] of [[alex, '90', 'base 93, -3 sprit'], [sam, '87', 'base 90, -3 sprit'], [brooke, '87', 'base 90, -3']]) {
    await page.goto(`${BASE}/committee/applications/${appId}`);
    await page.fill('[name=proposed_rating]', rating);
    await page.fill('[name=adjustments]', adj);
    await page.click('button:has-text("Cast vote")');
    await page.waitForSelector('text=Your vote is saved');
  }
  await alex.fill('[name=body]', 'Sister ship in Galveston rates 87, I can live with 87.');
  await alex.click('button:has-text("Post comment")');
  await alex.waitForSelector('text=Comment posted', {timeout: 8000}).catch(async (e) => { console.log('URL', alex.url(), 'NOTICE', await notice(alex)); await alex.screenshot({path: SP + '/fail.png', fullPage: true}); throw e; });
  // alex changes vote
  await alex.fill('[name=proposed_rating]', '87');
  await alex.click('button:has-text("Update vote")');
  await alex.waitForSelector('text=Your vote is saved');
  await brooke.goto(`${BASE}/committee/applications/${appId}`);
  const votesText = await brooke.locator('.card', { hasText: 'Votes' }).first().innerText();
  assert(/Quorum reached/.test(votesText) && /Median\s*87/.test(votesText), 'quorum + median: ' + votesText);
  ok('Three members vote, discuss, one changes vote; quorum reached, median 87');

  // owner cannot see votes
  await owner.goto(`${BASE}/my/${appId}`);
  assert(!(await owner.content()).includes('base 93'), 'owner cannot see votes');
  ok('Owner sees status but not draft votes');

  // 6. Issue rating
  await brooke.screenshot({ path: SP + '/shot-review.png', fullPage: true });
  await brooke.click('button:has-text("Issue rating")');
  await brooke.waitForSelector('text=Rating 87 issued');
  await brooke.goto(BASE + '/');
  assert((await brooke.locator('tbody tr', { hasText: 'USA 1234' }).innerText()).includes('87'), 'public list');
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(BASE + '/?q=windward');
  assert((await anon.locator('tbody tr').first().innerText()).includes('87'), 'anon sees rating');
  const csv = await (await fetch(BASE + '/ratings.csv')).text();
  assert(csv.includes('USA 1234,Windward,J/Boats,J/105,1995,87,Spinnaker'), 'csv: ' + csv);
  ok('Chair issues 87; it appears on the public list, search, and CSV download');

  // 7. Undo
  await brooke.goto(`${BASE}/committee/applications/${appId}`);
  await brooke.fill('[name=reason]', 'Testing undo');
  await brooke.click('button:has-text("Undo rating")');
  await brooke.waitForSelector('text=Rating undone');
  assert(sql("select count(*) from ratings where withdrawn_at is null") === '0', 'undo removes rating');
  await brooke.click('button:has-text("Issue rating")');
  await brooke.waitForSelector('text=Rating 87 issued');
  ok('Undo rating works, then re-issued');

  // 8. Boat record edit with history
  await brooke.goto(BASE + '/committee/boats');
  await brooke.click('text=USA 1234');
  await brooke.fill('[name=loa_ft]', '34.5');
  await brooke.click('button:has-text("Save boat record")');
  await brooke.waitForSelector('text=Boat record saved');
  assert(await brooke.locator('text=loa_ft “” → “34.5”').count() === 1, 'edit history');
  ok('Boat record edited; change appears in edit history');

  // 9. Import with preview, then undo
  fs.writeFileSync(SP + '/inventory.csv', [
    'Sail #,Boat,Builder,Design,Owner,E-mail,Date Received,Status,PHRF Rating,Drive folder,Hull color',
    '42,Old Salt,Catalina,30,Nate New,"Nate <nate@example.com>",3/1/2025,approved,180,https://drive.google.com/x,white',
    'USA 77,Zephyr,Beneteau,First 36.7,Ida Import,ida@example.com,2025-06-10,pending,,,',
    'USA 1234,Windward,J/Boats,J/105,Olive Owner,olive@example.com,1/15/2025,rated,87,,',
  ].join('\n'));
  await brooke.goto(BASE + '/admin/import');
  await brooke.setInputFiles('input[type=file]', SP + '/inventory.csv');
  await brooke.waitForSelector('text=3 applications found');
  await brooke.screenshot({ path: SP + '/shot-import.png', fullPage: true });
  await brooke.click('button:has-text("Import 3 applications")');
  await brooke.waitForSelector('text=Imported 3 applications');
  assert(sql("select count(*) from boats") === '3', 'boats after import (USA 1234 reused)');
  assert(sql("select count(*) from applications where source='import'") === '3', 'imported apps');
  ok('CSV import with preview: 3 rows, existing boat matched by sail number');
  await brooke.click('button:has-text("Undo import")');
  await brooke.waitForSelector('text=Import undone');
  assert(sql("select count(*) from boats") === '1', 'undo import boats');
  assert(sql("select rating from ratings where withdrawn_at is null") === '87', 'rating kept after undo');
  ok('Undo import removes exactly what it added');

  // 10. phone view + manifest
  const phone = await (await browser.newContext({ ...require('playwright').devices['iPhone 13'] })).newPage();
  await phone.goto(BASE + '/');
  await phone.screenshot({ path: SP + '/shot-phone.png' });
  const man = await (await fetch(BASE + '/manifest.webmanifest')).json();
  assert(man.display === 'standalone', 'manifest');
  const sw = await fetch(BASE + '/sw.js'); assert(sw.ok, 'sw');
  const scroll = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(scroll, 'no horizontal scroll on phone');
  ok('Installable app manifest + service worker served; phone layout has no sideways scroll');

  await browser.close();
  console.log('\nALL END-TO-END CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
