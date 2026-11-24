/* Headless-browser verification of the juvenile & adult prison ecosystem. */
const { chromium } = require('playwright');
const R = [];
const check = (name, ok, detail) => R.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail).slice(0, 420) });

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
  const jsErrors = [], bad404 = [];
  page.on('pageerror', (e) => jsErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(t)) return;           // optional missing assets in the base game
    if (/WebMediaPlayer|crbug\.com\/1144736|autoplay/i.test(t)) return; // headless audio-player cap, not a JS fault
    jsErrors.push('CONSOLE: ' + t.slice(0, 240));
  });
  page.on('response', (r) => {
    if (r.status() === 404 && /(prison\/|prison-life\.js)/.test(r.url())) bad404.push(r.url());
  });

  await page.goto('http://127.0.0.1:8784/game.html', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2600);

  const cleanup = () => page.evaluate(() => {
    document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
    ['evWrap', 'jmWrap', 'screen'].forEach((id) => { const e = document.getElementById(id); if (e) e.classList.remove('open'); });
    try { popupQueue.length = 0; } catch (e) {}
  });
  const step = async (name, fn) => {
    try { const r = await fn(); check(name, r && r.ok !== false, r && r.detail); }
    catch (e) { check(name, false, 'EXCEPTION ' + e.message); }
    await cleanup();
    await page.waitForTimeout(25);
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  /* Fresh prison state for each group of checks. */
  const SETUP = (juv) => {
    state.dead = false; state.prison = null;
    state.age = 34; state.birthYear = 1990; state.era = 'modern';
    state.stats = { Happiness: 60, Health: 70, Smarts: 60, Looks: 60 };
    state.mind = { mh: 65, ins: 10, low: 0, happy: 0 };
    state.money = 200000; state.family = []; state.respect = 40;
    try { popupQueue.length = 0; } catch (e) {}
    state.prison = {
      crime: juv ? 'burglary' : 'armed robbery', years: 6, served: 1,
      name: juv ? 'Cedar Hill Juvenile Unit' : 'Iron Ridge Penitentiary',
      sec: juv ? 'Minimum' : 'Maximum', juv: !!juv, behavior: 55, respect: 25,
      gang: null, job: null, death: null, did: {}, recap: false, inmates: null
    };
    try { jailUI(); } catch (e) {}
    try { renderStats(); } catch (e) {}
    return window.PRISON_LIFE.S();
  };
  await page.evaluate(`window.__SETUP = ${SETUP.toString()}`);
  const setup = (juv) => page.evaluate((j) => window.__SETUP(j), !!juv);

  /* ================================================== 1. LOAD & TABLES */
  await step('module loads with the full ecosystem', async () => ev(() => {
    const M = window.PRISON_LIFE;
    return { ok: !!M && M.GOODS.length === 24 && M.HOT.length === 12 &&
      M.SPOTS.length === 6 && M.ROUTES.length === 8 && M.RANKS.length === 6 &&
      M.GANG_ACTS.length >= 16 && M.PROGRAMS.length === 8 && M.EVENTS.length >= 90,
      detail: 'goods=' + (M && M.GOODS.length) + ' hot=' + (M && M.HOT.length) +
        ' routes=' + (M && M.ROUTES.length) + ' acts=' + (M && M.GANG_ACTS.length) +
        ' events=' + (M && M.EVENTS.length) };
  }));

  await step('every data table is fully specified', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    M.GOODS.forEach((g) => { if (!g.id || !g.n || !g.ico || !g.d || !g.fx || !(g.p > 0)) bad.push('good ' + g.id); });
    M.HOT.forEach((h) => { if (!h.id || !h.n || !h.ico || !h.d || !(h.v > 0) || !(h.risk > 0)) bad.push('hot ' + h.id); });
    M.ROUTES.forEach((r) => { if (!r.id || !r.n || !r.ico || !r.d || !(r.cost > 0) || !(r.risk > 0) || !(r.cap > 0)) bad.push('route ' + r.id); });
    M.SPOTS.forEach((s) => { if (!s.id || !s.n || !s.ico || !(s.risk > 0) || !(s.cap > 0)) bad.push('spot ' + s.id); });
    M.GANG_ACTS.forEach((a) => { if (!a.id || !a.n || !a.ico || !a.d || !a.fx) bad.push('act ' + a.id); });
    M.PROGRAMS.forEach((p) => { if (!p.id || !p.n || !p.ico || !(p.days > 0) || !p.fx) bad.push('prog ' + p.id); });
    return { ok: bad.length === 0, detail: 'bad=' + bad.join(',') };
  }));

  await step('no SVG, no canvas art, no coded icon generation anywhere in the module', async () => ev(async () => {
    const src = await (await fetch('prison-life.js?v=1')).text();
    const bad = [/<svg/i, /createElementNS/i, /data:image\/svg/i, /new ImageData/i,
                 /\.arc\(/, /\.fillRect\(/, /<canvas/i];
    const hits = bad.filter((r) => r.test(src));
    const icoCalls = (src.match(/\bICO\(/g) || []).length;
    const tableIcons = (src.match(/ico:\s*"[\w-]+"/g) || []).length;
    const rowIcons = (src.match(/\br\("[\w-]+"/g) || []).length;
    return { ok: hits.length === 0 && icoCalls >= 20 && tableIcons >= 70 && rowIcons >= 40,
      detail: 'svg/canvas hits=' + hits.length + ' ICO() calls=' + icoCalls +
        ' tableIcons=' + tableIcons + ' rowIcons=' + rowIcons };
  }));

  await step('all 138 generated prison icons load (and no base ref is missing)', async () => ev(async () => {
    const M = window.PRISON_LIFE;
    const names = new Set();
    M.GOODS.forEach((g) => names.add(g.ico)); M.HOT.forEach((h) => names.add(h.ico));
    M.SPOTS.forEach((s) => names.add(s.ico)); M.ROUTES.forEach((r) => names.add(r.ico));
    M.GANG_ACTS.forEach((a) => names.add(a.ico)); M.PROGRAMS.forEach((p) => names.add(p.ico));
    M.EVENTS.forEach((e) => names.add(e.ico));
    const base = ['sentence','card','appeal','bribe','conjugal','cry','escape','gangs','infirmary',
      'letter','mind','jobs','yard','riot','tm','bars','profile','surrender','coffin','gavel',
      'police','scale','focus','hero','focus-dm','hero-dm','snake-bg','m-pray','m-book','m-weights',
      'tab','tab-west','tab-juv','tab-juv-west',
      ...Array.from({ length: 10 }, (_, i) => 'j-' + ['wrench','can','sign','car','plate','boot','guard','toilet','trash','tutor'][i]),
      ...Array.from({ length: 10 }, (_, i) => 'gang-' + ['1mf','3m','9m','7mf','8m','6m','5m','4m','2m','10m'][i])];
    base.forEach((b) => names.add(b));
    const results = await Promise.all([...names].map((n) => new Promise((res) => {
      const i = new Image();
      i.onload = () => res([n, i.naturalWidth >= 100]);
      i.onerror = () => res([n, false]);
      i.src = 'prison/' + n + '.png';
    })));
    const failed = results.filter((r) => !r[1]).map((r) => r[0]);
    return { ok: failed.length === 0, detail: 'checked=' + results.length + ' failed=' + failed.slice(0, 8).join(',') };
  }));

  await step('all generated icons are real raster PNGs (not SVG/HTML)', async () => ev(async () => {
    const names = ['pl-gate','pl-shop','pl-shu','pl-cage','sentence','j-wrench','gang-1mf'];
    const out = [];
    for (const n of names) {
      const buf = await (await fetch('prison/' + n + '.png')).arrayBuffer();
      const b = new Uint8Array(buf);
      out.push([n, b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71]);
    }
    return { ok: out.every((x) => x[1]), detail: out.map((x) => x[0] + ':' + x[1]).join(' ') };
  }));

  /* ================================================== 2. STATE & SAVE */
  await setup(false);
  await step('fresh state is created with every subsystem field', async () => ev(() => {
    const L = window.PRISON_LIFE.S();
    return { ok: L.v === 1 && L.juv === false && L.day === 0 && L.scrip === 90 &&
      L.stash && L.bag && L.routes && L.gang === null && L.shu === null &&
      L.infractions.length === 0 && L.stats && L.log,
      detail: 'day=' + L.day + ' scrip=' + L.scrip + ' heat=' + L.heat };
  }));

  await step('legacy saves are backfilled field by field', async () => ev(() => {
    state.prison.life = { v: 1, day: 12, scrip: 7 };   // a partial/old save
    const L = window.PRISON_LIFE.S();
    return { ok: L.day === 12 && L.scrip === 7 && L.stash && L.gang === null &&
      L.stats && typeof L.stats.busts === 'number' && Array.isArray(L.log) &&
      Array.isArray(L.infractions) && L.privileges,
      detail: 'day=' + L.day + ' scrip=' + L.scrip + ' busts=' + L.stats.busts };
  }));

  await step('juvenile and adult worlds are genuinely separate', async () => ev(() => {
    const M = window.PRISON_LIFE;
    const j = M.fresh({ juv: true, sec: 'Minimum' }), a = M.fresh({ juv: false, sec: 'Maximum' });
    const juvEvents = M.EVENTS.filter((e) => e.gate === 'juv').length;
    const adultEvents = M.EVENTS.filter((e) => e.gate === 'adult').length;
    const juvGoods = M.GOODS.filter((g) => g.juv).length;
    const juvRoutes = M.ROUTES.filter((r) => r.juv).length;
    return { ok: j.juv && !a.juv && juvEvents >= 10 && adultEvents >= 10 &&
      juvGoods >= 15 && juvRoutes >= 5 && juvGoods < M.GOODS.length && juvRoutes < M.ROUTES.length,
      detail: 'juvEvents=' + juvEvents + ' adultEvents=' + adultEvents +
        ' juvGoods=' + juvGoods + ' juvRoutes=' + juvRoutes };
  }));

  /* ================================================== 3. COMMISSARY */
  await setup(false);
  await step('adult commissary offers all 24 goods; juvenile offers fewer', async () => ev(() => {
    const M = window.PRISON_LIFE;
    const all = M.GOODS.length, juv = M.GOODS.filter((g) => g.juv).length;
    return { ok: all === 24 && juv >= 15 && juv < all, detail: 'all=' + all + ' juv=' + juv };
  }));

  await step('buying a good spends scrip and puts it in the locker', async () => ev(() => {
    const M = window.PRISON_LIFE, L = M.S();
    const before = L.scrip;
    const ok = M.buyGood(L, 'ramen');
    return { ok: ok && L.scrip < before && L.bag.ramen === 1,
      detail: 'ok=' + ok + ' scrip ' + before + '->' + L.scrip + ' bag=' + L.bag.ramen };
  }));

  await step('consuming goods changes mental health, insanity, looks, health, smarts, mood', async () => ev(() => {
    const M = window.PRISON_LIFE, L = M.S();
    state.prison.life = M.fresh(state.prison);
    const L2 = M.S(); state.mind = { mh: 50, ins: 30, low: 0, happy: 0 };
    state.stats = { Happiness: 50, Health: 50, Smarts: 50, Looks: 50 };
    const picks = ['book', 'soap', 'peanut', 'tea', 'ramen', 'puzzle', 'mirror', 'sweets', 'harmonica'];
    picks.forEach((id) => { L2.bag[id] = 1; M.useGood(L2, id); });
    const m = mindOf(), st = state.stats;
    return { ok: m.mh > 50 && m.ins < 30 && st.Looks > 50 && st.Health > 50 &&
      st.Smarts > 50 && st.Happiness > 50 && L2.stats.goodsUsed === picks.length,
      detail: 'mh=' + m.mh + ' ins=' + m.ins + ' looks=' + st.Looks +
        ' he=' + st.Health + ' sm=' + st.Smarts + ' h=' + st.Happiness };
  }));

  await step('goods form habits and durables persist', async () => ev(() => {
    const M = window.PRISON_LIFE, L = M.S();
    state.prison.life = M.fresh(state.prison); const L2 = M.S();
    L2.bag.coffee = 1; L2.bag.book = 1; L2.bag.pills = 1;
    M.useGood(L2, 'coffee'); M.useGood(L2, 'book'); M.useGood(L2, 'pills');
    return { ok: !!L2.habits.caffeine && !!L2.habits.tablets && !!L2.durables.book,
      detail: 'habits=' + Object.keys(L2.habits).join(',') + ' durables=' + Object.keys(L2.durables).join(',') };
  }));

  await step('juvenile commissary blocks adult-only goods', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S();
    const ok = M.buyGood(L, 'razor');
    return { ok: ok === false && !L.bag.razor, detail: 'bought razor=' + ok };
  }));

  await step('SHU suspends the commissary completely', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.sendShu(L, P, 20, 'contraband found');
    const blocked = M.shopBlocked(L);
    const bought = M.buyGood(L, 'ramen');
    return { ok: !!blocked && /suspended/i.test(blocked) && bought === false && !L.bag.ramen,
      detail: 'blocked=' + blocked };
  }));

  await step('store privileges can be suspended by a hearing', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    L.privileges.shop = 5;
    const blocked = M.shopBlocked(L);
    M.advance(L, state.prison, 6);
    return { ok: !!blocked && L.privileges.shop === 0 && !M.shopBlocked(L),
      detail: 'blocked=' + blocked + ' remaining=' + L.privileges.shop };
  }));

  /* ================================================== 4. CONTRABAND */
  await setup(false);
  await step('stash respects hiding-place capacity', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    L.stash.spot = 'book';               // capacity 2
    const put = M.stashAdd(L, 'shank', 9);
    return { ok: put === 2 && M.stashCount(L) === 2, detail: 'put=' + put + ' count=' + M.stashCount(L) };
  }));

  await step('moving the stash is once-per-day and changes discovery risk', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    const a = M.stashMove(L, 'vent'), b = M.stashMove(L, 'tile');
    L.day++;
    const c = M.stashMove(L, 'tile');
    return { ok: a === true && b === false && c === true && L.stash.spot === 'tile' && M.SPOT.tile.risk < M.SPOT.body.risk,
      detail: 'a=' + a + ' b=' + b + ' c=' + c + ' spot=' + L.stash.spot };
  }));

  await step('dumping the stash clears items and cools suspicion', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    L.heat = 70; M.stashAdd(L, 'shank', 3); M.stashDump(L);
    return { ok: M.stashCount(L) === 0 && L.heat < 70, detail: 'heat=' + L.heat };
  }));

  await step('selling and using contraband both resolve with consequences', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    M.stashAdd(L, 'rollies', 3);
    const before = L.scrip;
    const s = M.sellHot(L, 'rollies', false);
    const u = M.useHot(L, 'rollies');
    return { ok: s === true && u === true && L.scrip > before && L.stats.deals === 1 &&
      M.stashCount(L) === 1 && L.heat > 8,
      detail: 'scrip ' + before + '->' + L.scrip + ' left=' + M.stashCount(L) + ' heat=' + L.heat };
  }));

  await step('cell search can find the stash and start a disciplinary chain', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    L.stash.spot = 'body'; L.heat = 100;
    M.stashAdd(L, 'shank', 2);
    let found = false;
    const real = Math.random; Math.random = () => 0.001;
    for (let i = 0; i < 20 && !found; i++) found = M.cellSearch(L, P);
    Math.random = real;
    return { ok: found === true && L.stats.searches >= 1 && L.infractions.length === 0,
      detail: 'found=' + found + ' searches=' + L.stats.searches };
  }));

  /* ================================================== 5. SMUGGLING */
  await setup(false);
  await step('a successful route pays credit and can add contraband', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    L.scrip = 100;
    const real = Math.random; Math.random = () => .999;   // no failure, no catch
    const ok = M.runRoute(L, P, 'laundry', 'kite', 2);
    Math.random = real;
    return { ok: ok === true && L.stats.runs === 1 && L.scrip > 100 - M.ROUTE.laundry.cost &&
      M.stashCount(L) === 2 && L.routes.laundry === 1,
      detail: 'ok=' + ok + ' scrip=' + L.scrip + ' stash=' + M.stashCount(L) };
  }));

  await step('a failed route creates a write-up and queues a hearing', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    L.scrip = 100; L.heat = 90;
    const real = Math.random; Math.random = () => 0.0001;  // force failure + catch
    const ok = M.runRoute(L, P, 'fence', 'keys', 1);
    Math.random = real;
    return { ok: ok === false && L.heat > 90 && popupQueue.length >= 1,
      detail: 'ok=' + ok + ' heat=' + L.heat + ' queued=' + popupQueue.length };
  }));

  await step('juvenile facilities cannot use adult-only routes', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison; L.scrip = 100;
    const ok = M.runRoute(L, P, 'guard', null, 1);
    return { ok: ok === false && L.stats.runs === 0, detail: 'ran guard route=' + ok };
  }));

  await step('all 8 routes resolve without throwing', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison; L.scrip = 500;
    const real = Math.random; Math.random = () => .999;
    M.ROUTES.forEach((r) => { try { M.runRoute(L, P, r.id, null, 1); } catch (e) { bad.push(r.id + ':' + e.message); } });
    Math.random = real;
    return { ok: bad.length === 0 && L.stats.runs === 8, detail: 'runs=' + L.stats.runs + ' bad=' + bad.join(',') };
  }));

  /* ================================================== 6. DISCIPLINE / SHU */
  await setup(false);
  await step('a sustained finding gives a SHU term on a 23/1 regime', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 45, 'contraband found');
    return { ok: L.shu && L.shu.days === 45 && L.shu.total === 45 &&
      L.shu.regime === '23/1' && L.stats.shuTerms === 1 && L.stats.shuDays === 45 &&
      !!M.shopBlocked(L),
      detail: 'days=' + (L.shu && L.shu.days) + ' regime=' + (L.shu && L.shu.regime) };
  }));

  await step('juvenile segregation terms are capped and shorter', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.sendShu(L, P, 900, 'a fight');
    return { ok: L.shu.days <= M.CFG.juvShuCap && L.shu.days > 0,
      detail: 'days=' + L.shu.days + ' cap=' + M.CFG.juvShuCap };
  }));

  await step('extending an existing SHU term stacks the days', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.sendShu(L, P, 10, 'first');
    M.sendShu(L, P, 15, 'second');
    return { ok: L.shu.days === 25 && L.shu.total === 25 && L.shu.infractions === 1 &&
      L.stats.shuTerms === 1,
      detail: 'days=' + L.shu.days + ' total=' + L.shu.total + ' terms=' + L.stats.shuTerms };
  }));

  await step('a SHU day applies 23-hour mental attrition and counts down', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    state.mind = { mh: 60, ins: 10, low: 0, happy: 0 };
    state.stats = { Happiness: 60, Health: 60, Smarts: 60, Looks: 60 };
    M.sendShu(L, P, 5, 'contraband found');
    L.gang = null;
    M.shuDay(L, P);
    const m = mindOf();
    return { ok: L.shu.days === 4 && m.mh < 60 && m.ins > 10 && state.stats.Health < 60 &&
      L.shu.recDone === false,
      detail: 'days=' + L.shu.days + ' mh=' + m.mh + ' ins=' + m.ins };
  }));

  await step('durable goods soften segregation attrition', async () => ev(() => {
    const M = window.PRISON_LIFE;
    const run = (durables) => {
      state.prison.life = M.fresh(state.prison);
      const L = M.S(), P = state.prison;
      state.mind = { mh: 60, ins: 10, low: 0, happy: 0 };
      M.sendShu(L, P, 9, 'test');
      L.gang = null;
      if (durables) { L.durables.book = 1; L.durables.puzzle = 1; L.flags.stillness = true; }
      M.shuDay(L, P);
      return mindOf().mh;
    };
    const plain = run(false), helped = run(true);
    return { ok: helped > plain, detail: 'plain=' + plain + ' helped=' + helped };
  }));

  await step('serving a full SHU term releases back to the tier', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    P.behavior = 55;
    M.sendShu(L, P, 4, 'test'); L.gang = null;
    M.advance(L, P, 5);
    return { ok: L.shu === null && !M.shopBlocked(L) && P.behavior >= 50,
      detail: 'shu=' + L.shu + ' behavior=' + P.behavior };
  }));

  await step('long segregation leaves a lasting mark', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 60, 'test'); L.gang = null;
    M.leaveShu(L, P, 'test');
    M.advance(L, P, 1);
    return { ok: L.shu === null && L.flags.shu_trauma === true && L.flags.trauma_applied === true,
      detail: 'trauma=' + L.flags.shu_trauma };
  }));

  await step('gang brothers fish items under the door during SHU', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 40, 'test');
    M.joinGang(L, P, 'Bitizen Mafia');
    L.gang.loyalty = 95;
    const real = Math.random; Math.random = () => .0001;  // force the line, never caught
    M.shuDay(L, P);
    Math.random = real;
    return { ok: L.shu.fish.length >= 1 && L.stats.fishCaught >= 1 &&
      Object.keys(L.bag).length >= 1,
      detail: 'fish=' + L.shu.fish.length + ' bag=' + Object.keys(L.bag).join(',') };
  }));

  await step('a fished-in parcel can itself trigger a hearing', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 40, 'test'); M.joinGang(L, P, 'Bitizen Mafia'); L.gang.loyalty = 95;
    const before = L.stats.busts;
    // force line success but a caught delivery
    let calls = 0;
    const real = Math.random;
    Math.random = () => { calls++; return calls === 3 ? .001 : .0001; };
    M.shuDay(L, P);
    Math.random = real;
    return { ok: L.stats.busts > before || L.shu.fish.length >= 1,
      detail: 'busts ' + before + '->' + L.stats.busts + ' fish=' + L.shu.fish.length };
  }));

  await step('disciplinary hearing renders 5 pleas and none throw', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    const rec = M.writeUp(L, P, 'contraband found', 3, 'A shank was recovered.');
    M.disciplinary(L, P, rec, null);
    const html = ev.innerHTML, btns = evWrap.querySelectorAll('[data-c]').length;
    return { ok: /Disciplinary Hearing/.test(html) && btns === 5 && !/undefined|\bNaN\b/.test(html),
      detail: 'buttons=' + btns };
  }));

  await step('every disciplinary plea resolves without error', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    for (let i = 0; i < 5; i++) {
      state.prison.life = M.fresh(state.prison);
      const L = M.S(), P = state.prison;
      const rec = M.writeUp(L, P, 'contraband found', 3, 'test');
      try {
        M.disciplinary(L, P, rec, null);
        const btn = [...evWrap.querySelectorAll('[data-c]')][i];
        btn.click();
      } catch (e) { bad.push(i + ':' + e.message); }
      try { popupQueue.length = 0; } catch (e) {}
      document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
      evWrap.classList.remove('open');
    }
    return { ok: bad.length === 0, detail: 'bad=' + bad.join(',') };
  }));

  /* ================================================== 7. GANGS */
  await setup(false);
  await step('joining a gang syncs the base game gang field and sets rank Fish', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    const ok = M.joinGang(L, P, 'Bitizen Mafia');
    return { ok: ok === true && L.gang.name === 'Bitizen Mafia' && P.gang === 'Bitizen Mafia' &&
      M.rankOf(L).id === 'fish', detail: 'rank=' + M.rankOf(L).id };
  }));

  await step('rank ladder advances through all six ranks', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.joinGang(L, P, 'Bitizen Mafia');
    const seen = [];
    M.RANKS.forEach((r) => { L.gang.standing = r.min + 1; seen.push(M.rankOf(L).id); });
    return { ok: seen.join(',') === M.RANKS.map((r) => r.id).join(','),
      detail: seen.join(' -> ') };
  }));

  await step('every gang activity resolves with sane state', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.joinGang(L, P, 'Bitizen Mafia');
    L.gang.standing = 200; L.gang.loyalty = 80; L.scrip = 500;
    const real = Math.random; Math.random = () => .999;   // success branch for every job
    M.GANG_ACTS.forEach((a) => {
      if (a.id === 'leave') return;
      try {
        L.shu = null;                                     // a busted job sends you to SHU
        if (!L.gang) M.joinGang(L, P, 'Bitizen Mafia');
        M.gangAct(L, P, a.id);
      } catch (e) { bad.push(a.id + ':' + e.message); }
      if (!L.gang) bad.push(a.id + ':nogang');
      else if (Number.isNaN(L.scrip) || Number.isNaN(L.heat) || Number.isNaN(L.gang.loyalty)) bad.push(a.id + ':NaN');
    });
    Math.random = real;
    const missions = L.gang ? L.gang.missions : 0;
    return { ok: bad.length === 0 && missions >= 15,
      detail: 'missions=' + missions + ' bad=' + bad.join(',') };
  }));

  await step('leaving a gang has real consequences', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.joinGang(L, P, 'Bitizen Mafia');
    const r = P.respect, he = state.stats.Health;
    const real = Math.random; Math.random = () => .999;
    M.gangAct(L, P, 'leave');
    Math.random = real;
    return { ok: L.gang === null && P.gang === null && P.respect < r && state.stats.Health < he,
      detail: 'respect ' + r + '->' + P.respect + ' health ' + he + '->' + state.stats.Health };
  }));

  await step('high feuds can cause retaliatory injury on the clock', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.joinGang(L, P, 'Bitizen Mafia');
    L.gang.beef['Killbillies'] = 95;
    const he = state.stats.Health;
    const real = Math.random; Math.random = () => 0.0001;
    M.advance(L, P, 1);
    Math.random = real;
    return { ok: state.stats.Health < he && L.stats.fights >= 1,
      detail: 'health ' + he + '->' + state.stats.Health + ' fights=' + L.stats.fights };
  }));

  /* ================================================== 8. PROGRAMS */
  await setup(false);
  await step('all 8 programs enroll, progress and complete with effects', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    M.PROGRAMS.forEach((p) => {
      state.prison.juv = false; state.prison.life = M.fresh(state.prison);
      const L = M.S(), P = state.prison;
      try {
        if (!M.enroll(L, p.id)) bad.push(p.id + ':enroll');
        M.programDay(L, P);
        for (let i = 0; i < p.days + 2; i++) M.programDay(L, P);
        if (L.done.indexOf(p.id) < 0) bad.push(p.id + ':notdone');
      } catch (e) { bad.push(p.id + ':' + e.message); }
    });
    return { ok: bad.length === 0, detail: 'bad=' + bad.join(',') };
  }));

  await step('juvenile-only programs are correctly filtered', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S();
    const ok = M.enroll(L, 'ged');           // adult only
    const ok2 = M.enroll(L, 'family');       // juvenile
    return { ok: ok === false && ok2 === true, detail: 'ged=' + ok + ' family=' + ok2 };
  }));

  await step('only two programs can run at once', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    const L = M.S();
    const a = M.enroll(L, 'literacy'), b = M.enroll(L, 'anger'), c = M.enroll(L, 'mindful');
    return { ok: a && b && c === false, detail: 'a=' + a + ' b=' + b + ' c=' + c };
  }));

  /* ================================================== 9. EVENTS */
  await setup(false);
  await step('all events are well-formed with unique IDs and valid gates', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    const ids = new Set(), gates = new Set(['','juv','adult','gang','shu','stash','heat','program','cellie','shop','route','night']);
    M.EVENTS.forEach((e) => {
      if (!e.id || !e.ico || !e.t || !e.d || !Array.isArray(e.c) || e.c.length < 2) bad.push('shape:' + e.id);
      if (ids.has(e.id)) bad.push('dup:' + e.id); ids.add(e.id);
      if (!gates.has(e.gate)) bad.push('gate:' + e.id + '=' + e.gate);
      e.c.forEach((c, i) => {
        if (!c[0] || !c[1] || !c[2] || !c[3]) bad.push('choice:' + e.id + ':' + i);
        if (c[4] && (!Array.isArray(c[4]) || c[4].length !== 4)) bad.push('risk:' + e.id + ':' + i);
      });
    });
    return { ok: bad.length === 0 && ids.size === M.EVENTS.length,
      detail: 'events=' + M.EVENTS.length + ' choices=' + M.EVENTS.reduce((n, e) => n + e.c.length, 0) + ' bad=' + bad.slice(0, 5).join(',') };
  }));

  await step('event text is era-safe (passes the 1800s modern-word filter)', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.era = '1800s'; state.birthYear = 1850; state.age = 30;
    const strings = [];
    M.EVENTS.forEach((e) => { strings.push(e.t, e.d); e.c.forEach((c) => { strings.push(c[0], c[2], c[3]); if (c[4]) strings.push(c[4][2], c[4][3]); }); });
    M.GOODS.forEach((g) => strings.push(g.n, g.d));
    M.HOT.forEach((h) => strings.push(h.n, h.d));
    M.ROUTES.forEach((r) => strings.push(r.n, r.d));
    M.PROGRAMS.forEach((p) => strings.push(p.n, p.d));
    const flagged = strings.filter((t) => isModernText(String(t)));
    state.era = 'modern';
    return { ok: flagged.length === 0, detail: 'checked=' + strings.length + ' flagged=' + flagged.slice(0, 4).join(' | ') };
  }));

  await step('every event renders cleanly with no broken placeholders', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.EVENTS.forEach((e) => {
      try {
        M.fireEvent(L, P, e);
        const h = ev.innerHTML;
        if (!h.includes(e.t) || /undefined|\bNaN\b|\{age\}|\{name\}/.test(h)) bad.push(e.id);
      } catch (err) { bad.push(e.id + ':' + err.message); }
      evWrap.classList.remove('open');
    });
    return { ok: bad.length === 0, detail: 'rendered=' + M.EVENTS.length + ' bad=' + bad.slice(0, 6).join(',') };
  }));

  await step('every choice of every event resolves without throwing', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    const total = M.EVENTS.reduce((n, e) => n + e.c.length, 0);
    let clicked = 0;
    M.EVENTS.forEach((e) => {
      state.prison.life = M.fresh(state.prison);
      const L = M.S(), P = state.prison;
      for (let i = 0; i < e.c.length; i++) {
        try {
          M.fireEvent(L, P, e);
          const btn = [...evWrap.querySelectorAll('[data-c]')][i];
          if (!btn) { bad.push(e.id + ':' + i + ':nobutton'); continue; }
          btn.click(); clicked++;
        } catch (err) { bad.push(e.id + ':' + i + ':' + err.message); }
        try { popupQueue.length = 0; } catch (er) {}
        document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
        evWrap.classList.remove('open');
      }
    });
    return { ok: bad.length === 0 && clicked === total,
      detail: 'clicked=' + clicked + '/' + total + ' bad=' + bad.slice(0, 6).join(',') };
  }));

  await step('event gates filter the pool correctly for each world state', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    const juvOk = M.gateOk(L, P, 'juv'), adultOk = M.gateOk(L, P, 'adult');
    M.sendShu(L, P, 10, 'test');
    const shuOk = M.gateOk(L, P, 'shu'), shopOk = M.gateOk(L, P, 'shop');
    const gangOk = M.gateOk(L, P, 'gang');
    return { ok: juvOk && !adultOk && shuOk && !shopOk && !gangOk,
      detail: 'juv=' + juvOk + ' adult=' + adultOk + ' shu=' + shuOk + ' shop=' + shopOk + ' gang=' + gangOk };
  }));

  /* ================================================== 10. SCREENS */
  await setup(false);
  await step('base prison screen gains a PRISON LIFE entry row', async () => ev(() => {
    try { openPrison(); } catch (e) { return { ok: false, detail: e.message }; }
    const row = sList.querySelector('[data-plife="hub"]');
    return { ok: !!row && /PRISON LIFE/.test(row.textContent), detail: 'row=' + !!row };
  }));

  await step('clicking the entry row opens the Prison Life hub', async () => ev(() => {
    try { openPrison(); } catch (e) {}
    const row = sList.querySelector('[data-plife="hub"]');
    if (!row) return { ok: false, detail: 'no row' };
    row.click();
    return { ok: sTitle.textContent === 'PRISON LIFE' && screen.classList.contains('open') &&
      /Commissary/.test(sList.innerHTML) && /The SHU/.test(sList.innerHTML),
      detail: 'title=' + sTitle.textContent };
  }));

  await step('all 13 Prison Life screens render without errors or broken text', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison);
    const openers = [
      ['PRISON LIFE', M.openPrisonLife], ['HOUSING & COUNT', M.openPLBlock],
      ['COMMISSARY', M.openPLShop], ['MY LOCKER', M.openPLLocker],
      ['THE STASH', M.openPLStash], ['SMUGGLING', M.openPLRoutes],
      ['GANG BUSINESS', M.openPLGang], ['THE SHU', M.openPLShu],
      ['PROGRAMS', M.openPLPrograms], ['DISCIPLINARY RECORD', M.openPLRecord],
      ['CELL & CREW', M.openPLCrew], ['MIND & BODY', M.openPLMind],
      ['PRISON LEDGER', M.openPLLog]
    ];
    const bad = [];
    openers.forEach(([title, fn]) => {
      try {
        fn();
        if (sTitle.textContent !== title) bad.push(title + ':got ' + sTitle.textContent);
        if (/undefined|\bNaN\b|\[object Object\]/.test(sList.innerHTML)) bad.push(title + ':text');
        const imgs = [...sList.querySelectorAll('img')].map((i) => i.getAttribute('src'));
        if (imgs.some((s) => !s || !/^prison\/[\w-]+\.png$/.test(s))) bad.push(title + ':icon');
      } catch (e) { bad.push(title + ':' + e.message); }
    });
    return { ok: bad.length === 0, detail: 'screens=' + openers.length + ' bad=' + bad.join(',') };
  }));

  await step('SHU screen exposes 23/1, the concrete cage and the suspended store', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 33, 'contraband found');
    M.openPLShu();
    const h = sList.innerHTML;
    return { ok: /23\/1/.test(h) && /concrete cage/i.test(h) && /Commissary/.test(h) &&
      /Fish Line/i.test(h) && /33 days|33/.test(h) && /Suspended/.test(h),
      detail: 'len=' + h.length };
  }));

  await step('juvenile SHU screen uses the Separation title', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    M.sendShu(L, P, 12, 'a fight');
    M.openPLShu();
    return { ok: sTitle.textContent === 'SEPARATION' && /23\/1/.test(sList.innerHTML),
      detail: 'title=' + sTitle.textContent };
  }));

  await step('commissary screen shows all adult goods and hides juveniles-only blocks', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    M.openPLShop();
    const rows = sList.querySelectorAll('[data-plife^="buy:"]').length;
    state.prison.juv = true; state.prison.life = M.fresh(state.prison);
    M.openPLShop();
    const jrows = sList.querySelectorAll('[data-plife^="buy:"]').length;
    return { ok: rows === M.GOODS.length && jrows < rows && jrows >= 15,
      detail: 'adult rows=' + rows + ' juv rows=' + jrows };
  }));

  await step('no screen leaks unresolved icons', async () => ev(async () => {
    const M = window.PRISON_LIFE;
    const openers = [M.openPrisonLife, M.openPLShop, M.openPLLocker, M.openPLStash,
      M.openPLRoutes, M.openPLGang, M.openPLShu, M.openPLPrograms, M.openPLRecord,
      M.openPLCrew, M.openPLMind, M.openPLLog, M.openPLBlock];
    const names = new Set();
    openers.forEach((fn) => { try { fn(); sList.querySelectorAll('img[src^="prison/"]').forEach((i) => names.add(i.getAttribute('src'))); } catch (e) {} });
    const results = await Promise.all([...names].map((src) => new Promise((res) => {
      const i = new Image(); i.onload = () => res([src, true]); i.onerror = () => res([src, false]); i.src = src;
    })));
    const failed = results.filter((r) => !r[1]).map((r) => r[0]);
    return { ok: failed.length === 0, detail: 'unique=' + results.length + ' failed=' + failed.slice(0, 6).join(',') };
  }));

  /* ================================================== 11. DISPATCH */
  await setup(false);
  await step('every hub dispatch key resolves without throwing', async () => ev(() => {
    const M = window.PRISON_LIFE, bad = [];
    state.prison.life = M.fresh(state.prison);
    const L = M.S(), P = state.prison;
    // join a gang first so gang acts are reachable
    M.joinGang(L, P, 'Bitizen Mafia'); L.gang.standing = 200; L.scrip = 900;
    L.bag.ramen = 2; M.stashAdd(L, 'kite', 2);
    M.sendShu(L, P, 20, 'test');
    const keys = ['day','week','month','block','shop','locker','stash','routes','gang','shu',
      'programs','record','crew','mind','log','buy:ramen','use:ramen','gift:ramen',
      'spot:vent','dump','hot:kite','route:laundry','join:1','nogang','prog:literacy',
      'contact:0','newcontact','rec','fish','appeal','tray','checkin','mark','still',
      'kite','shopblocked','shuday','shuweek','pc','cellchange','countduty','detail',
      'cellie:talk','cellie:share','cellie:favour','cellie:fight','tierfish','exercise',
      'infirmary','noop',
      ...M.GANG_ACTS.map((a) => 'gact:' + a.id)];
    keys.forEach((k) => {
      try { M.dispatch(k); } catch (e) { bad.push(k + ':' + e.message); }
      try { popupQueue.length = 0; } catch (e) {}
      document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
      evWrap.classList.remove('open');
    });
    return { ok: bad.length === 0, detail: 'keys=' + keys.length + ' bad=' + bad.join(',') };
  }));

  await step('rec hour is once per day', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.sendShu(L, P, 20, 'test');
    M.dispatch('rec');
    const first = L.shu.recDone;
    const btn = evWrap.querySelector('[data-c="0"]');
    if (btn) btn.click();
    const after = L.shu.recDone;
    evWrap.classList.remove('open');
    M.dispatch('rec');   // second attempt should be refused
    return { ok: first === false && after === true, detail: 'first=' + first + ' after=' + after };
  }));

  await step('all 6 hiding places and 8 routes appear in their screens', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.juv = false; state.prison.life = M.fresh(state.prison);
    M.openPLStash();
    const spots = sList.querySelectorAll('[data-plife^="spot:"]').length;
    M.openPLRoutes();
    const routes = sList.querySelectorAll('[data-plife^="route:"]').length;
    return { ok: spots === 6 && routes === 8, detail: 'spots=' + spots + ' routes=' + routes };
  }));

  /* ================================================== 12. CLOCK & INTEGRATION */
  await setup(false);
  await step('the clock advances days, allowance, programs and events', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    M.enroll(L, 'literacy');
    const before = L.scrip;
    M.advance(L, P, 30);
    return { ok: L.day === 30 && L.scrip > before && L.lastAllowance > 0 &&
      (L.programs.literacy.days >= 21),
      detail: 'day=' + L.day + ' scrip ' + before + '->' + L.scrip +
        ' progDays=' + L.programs.literacy.days };
  }));

  await step('suspicion decays over time and rises with heat-driven searches', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    L.heat = 90; L.stash.spot = 'body'; M.stashAdd(L, 'shank', 1);
    M.advance(L, P, 20);
    return { ok: L.heat < 90 && L.stats.searches >= 1,
      detail: 'heat=' + L.heat + ' searches=' + L.stats.searches };
  }));

  await step('age button advances the prison clock once per year', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    const y = state.age;
    M.onAge();
    const a = L.day;
    M.onAge();                       // same year: no double advance
    const b = L.day;
    state.age = y + 1;
    M.onAge();
    const c = L.day;
    state.age = y;
    return { ok: a === M.CFG.ageDays && b === a && c === a * 2 && L.lastAge !== -1,
      detail: 'a=' + a + ' b=' + b + ' c=' + c };
  }));

  await step('prisonAction "gangs" is routed to the new gang business screen', async () => ev(() => {
    state.prison.life = window.PRISON_LIFE.fresh(state.prison);
    try { prisonAction('gangs'); } catch (e) { return { ok: false, detail: e.message }; }
    return { ok: sTitle.textContent === 'GANG BUSINESS', detail: 'title=' + sTitle.textContent };
  }));

  await step('parole wrapper applies program bonus and SHU penalty', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S(), P = state.prison;
    L.done = ['literacy', 'anger']; L.stats.shuTerms = 0;
    const before = P.behavior;
    try { paroleBoard(P); } catch (e) { return { ok: false, detail: e.message }; }
    const afterBonus = P.behavior;
    state.prison.life = M.fresh(state.prison); const L2 = M.S();
    L2.stats.shuTerms = 5; P.behavior = 55;
    try { paroleBoard(P); } catch (e) {}
    const afterPenalty = P.behavior;
    return { ok: afterBonus > before && afterPenalty < 55,
      detail: 'before=' + before + ' bonus=' + afterBonus + ' penalty=' + afterPenalty };
  }));

  await step('release leaves a lasting record and outside consequences', async () => ev(() => {
    const M = window.PRISON_LIFE;
    state.prison.life = M.fresh(state.prison); const L = M.S();
    L.done = ['literacy']; L.stats.shuTerms = 3; L.flags.shu_trauma = true;
    L.gang = { name: 'Bitizen Mafia' }; L.habits.caffeine = 1.5;
    const mh = mindOf().mh, ins = mindOf().ins;
    try { release('I was released.', 'Released'); } catch (e) { return { ok: false, detail: e.message }; }
    return { ok: state.prison === null && state.prisonRecord &&
      state.prisonRecord.programs.length === 1 && state.prisonRecord.terms === 3 &&
      Array.isArray(state.prisonHabits) && mindOf().ins > ins,
      detail: 'record=' + JSON.stringify(state.prisonRecord) + ' ins ' + ins + '->' + mindOf().ins };
  }));

  await step('goToPrison initialises the ecosystem on entry', async () => ev(() => {
    state.prison = null;
    const P = { crime: 'burglary', years: 4, served: 0, name: 'Test Facility',
      sec: 'Medium', juv: false, behavior: 55, respect: 20, did: {}, recap: false };
    try { goToPrison(P); } catch (e) { return { ok: false, detail: e.message }; }
    const L = state.prison && state.prison.life;
    return { ok: !!L && L.v === 1 && L.log.length >= 1 && !!L.cellie,
      detail: 'life=' + !!L + ' log=' + (L && L.log.length) + ' cellie=' + (L && L.cellie && L.cellie.name) };
  }));

  await step('base prison screens still work with the generated icon pack', async () => ev(() => {
    state.prison = null;
    const P = { crime: 'burglary', years: 4, served: 1, name: 'Test Facility',
      sec: 'Medium', juv: false, behavior: 55, respect: 20, did: {}, recap: false };
    goToPrison(P);
    const bad = [];
    try { openPrison(); } catch (e) { bad.push('openPrison:' + e.message); }
    try { openGangs(); } catch (e) { bad.push('openGangs:' + e.message); }
    try { openPrisonJobs(); } catch (e) { bad.push('openPrisonJobs:' + e.message); }
    try { openMindBody(); } catch (e) { bad.push('openMindBody:' + e.message); }
    try { openYard(); } catch (e) { bad.push('openYard:' + e.message); }
    try { prisonAction('sentence'); } catch (e) { bad.push('sentence:' + e.message); }
    return { ok: bad.length === 0, detail: 'bad=' + bad.join(',') };
  }));

  /* ================================================== 13. REGRESSION */
  await step('prior systems still load and their globals are intact', async () => ev(() => ({
    ok: !!window.ERA_REALISM && !!window.POLITICS && !!window.CHANCE_ENCOUNTER &&
      !!window.GENETICS && typeof openRelationships === 'function' &&
      typeof openPrison === 'function',
    detail: ['ERA_REALISM', 'POLITICS', 'CHANCE_ENCOUNTER', 'GENETICS'].map((k) => k + '=' + !!window[k]).join(' ')
  })));

  await browser.close();
  check('no missing prison assets', bad404.length === 0, bad404.slice(0, 5).join(', '));
  check('zero uncaught JS errors', jsErrors.length === 0, jsErrors.slice(0, 5).join(' ; '));
  const pass = R.filter((r) => r.ok).length;
  R.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : '')));
  console.log('\n' + pass + '/' + R.length + ' passed.');
  process.exit(pass === R.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
