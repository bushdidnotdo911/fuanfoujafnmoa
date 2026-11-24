/* Capture the prison-life screens for a visual pass. */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const out = '/data/workspace/prison-shots';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true, executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 920 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:8786/game.html', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);

  const clean = () => page.evaluate(() => {
    try { const p = document.getElementById('picker'); if (p) p.remove(); } catch (e) {}
    try { const g = document.getElementById('authGate'); if (g) g.remove(); } catch (e) {}
    try { document.querySelector('.phone').classList.remove('picking', 'bl-locked'); } catch (e) {}
    try { document.querySelectorAll('.ll-fl, .pk-box, #splash').forEach((x) => x.remove()); } catch (e) {}
    document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
    try { evWrap.classList.remove('open'); } catch (e) {}
    try { popupQueue.length = 0; } catch (e) {}
  });

  const prep = (juv, shu) => page.evaluate(({ juv, shu }) => {
    const M = window.PRISON_LIFE;
    state.dead = false; state.prison = null;
    state.age = 34; state.birthYear = 1990; state.era = 'modern';
    state.stats = { Happiness: 58, Health: 71, Smarts: 63, Looks: 55 };
    state.mind = { mh: 62, ins: 14, low: 0, happy: 0 };
    state.money = 200000; state.family = []; state.respect = 40;
    state.prison = {
      crime: juv ? 'burglary' : 'armed robbery', years: 6, served: 2,
      name: juv ? 'Cedar Hill Juvenile Unit' : 'Iron Ridge Penitentiary',
      sec: juv ? 'Minimum' : 'Maximum', juv: !!juv, behavior: 61, respect: 28,
      gang: null, job: null, death: null, did: {}, recap: false, inmates: null
    };
    state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    L.day = 214; L.scrip = 137; L.heat = 37;
    M.initCrew(L, P);
    P.gang = 'Bitizen Mafia';
    L.gang = { name: 'Bitizen Mafia', standing: 52, loyalty: 68, turf: 44,
               beef: { Killbillies: 58 }, treasury: 0, missions: 12, since: 120 };
    L.bag.ramen = 2; L.bag.book = 1; L.bag.soap = 1;
    M.stashAdd(L, 'kite', 2); M.stashAdd(L, 'rollies', 1);
    L.routes.laundry = 4; L.routes.kitchen = 2;
    L.done.push('literacy'); L.programs.anger = { days: 11, done: false, since: 200 };
    L.infractions.push({ d: 88, kind: 'contraband found', sev: 3, detail: 'A kite recovered from a mattress.', resolved: true, outcome: 'sustained' });
    L.stats.hearings = 2; L.stats.shuTerms = 1; L.stats.shuDays = 24; L.stats.runs = 6;
    L.stats.deals = 9; L.stats.searches = 5;
    L.log.push({ d: 212, t: 'I ate with the tier in the chow hall.' });
    L.log.push({ d: 213, t: 'I ran the laundry cart route.' });
    L.log.push({ d: 214, t: 'I read the thickest book on the cart.' });
    if (shu) { M.sendShu(L, P, 26, 'contraband found'); L.shu.recDone = false; }
    try { renderStats(); } catch (e) {}
    try { popupQueue.length = 0; } catch (e) {}
  }, { juv, shu });

  const calm = () => page.evaluate(() => {
    document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
    ['evWrap', 'jmWrap'].forEach((id) => { const e = document.getElementById(id); if (e) e.classList.remove('open'); });
    try { popupQueue.length = 0; } catch (e) {}
  });

  const shot = async (name, juv, shu, openFn, scroll) => {
    await clean();
    await prep(juv, shu);
    await calm();
    await page.evaluate(openFn);
    await calm();
    if (scroll) await page.evaluate((y) => { sList.scrollTop = y; }, scroll);
    await page.waitForTimeout(420);
    await page.locator('#screen').screenshot({ path: out + '/' + name + '.png' });
    console.log('captured', name);
  };

  await shot('01-hub', false, false, () => window.PRISON_LIFE.openPrisonLife());
  await shot('09-hub-economy', false, false, () => window.PRISON_LIFE.openPrisonLife(), 470);
  await shot('02-commissary', false, false, () => window.PRISON_LIFE.openPLShop());
  await shot('03-stash', false, false, () => window.PRISON_LIFE.openPLStash());
  await shot('04-gang', false, false, () => window.PRISON_LIFE.openPLGang());
  await shot('05-shu', false, true, () => window.PRISON_LIFE.openPLShu());
  await shot('06-juvenile', true, false, () => window.PRISON_LIFE.openPrisonLife());
  await shot('07-record', false, false, () => window.PRISON_LIFE.openPLRecord());

  /* disciplinary hearing card */
  await clean();
  await prep(false, false);
  await calm();
  await page.evaluate(() => {
    const M = window.PRISON_LIFE, L = M.S(), P = state.prison;
    const rec = M.writeUp(L, P, 'contraband found', 4, 'A shank was recovered from a loose floor tile.');
    M.disciplinary(L, P, rec, null);
  });
  await page.waitForTimeout(400);
  await page.locator('#ev').screenshot({ path: out + '/08-hearing.png' });
  console.log('captured 08-hearing');

  console.log('JS errors:', errs.length, errs.slice(0, 3).join(' | '));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
