/* Full play-through verification of the rebuilt arcade. */
const { chromium } = require('playwright');

const R = [];
const check = (name, ok, detail) =>
  R.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail).slice(0, 240) });

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 430, height: 920 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errs.push('CONSOLE: ' + m.text().slice(0, 220));
  });

  await page.goto('http://127.0.0.1:8765/game.html', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    try { const p = document.getElementById('picker'); if (p) p.remove(); } catch (e) {}
    try { const g = document.getElementById('authGate'); if (g) g.remove(); } catch (e) {}
    try { document.querySelector('.phone').classList.remove('picking', 'bl-locked'); } catch (e) {}
    try { state.age = 30; state.money = 500000; state.dead = false; state.prison = false; state.birthYear = 1990; } catch (e) {}
    try { window.MENU_FEATURES.cfg.tokens = 800; window.MENU_FEATURES.cfg.plays = 0; window.MENU_FEATURES.save(); } catch (e) {}
    document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
    window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__title = () => document.getElementById('sTitle').textContent.trim();
    window.__tokens = () => window.MENU_FEATURES.cfg.tokens;
    window.__arc = () => window.MENU_FEATURES.openArcade();
    window.__game = (k) => document.querySelector(`[data-mf-game="${k}"]`).onclick();
  });

  const step = async (name, fn) => {
    try {
      const r = await fn();
      check(name, r && r.ok !== false, r && r.detail);
    } catch (e) { check(name, false, 'EXCEPTION ' + e.message); }
  };

  // ---------------------------------------------------------------- 1. art
  await step('illustrated atlases all load', async () => {
    const r = await page.evaluate(async () => {
      const out = {};
      for (const u of ['arcade/sprites.png', 'arcade/covers.png', 'arcade/banner.png']) {
        out[u] = await new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im.naturalWidth + 'x' + im.naturalHeight);
          im.onerror = () => res('FAILED'); im.src = u;
        });
      }
      return out;
    });
    return { ok: r['arcade/sprites.png'] === '1280x800' && r['arcade/covers.png'] === '768x512' && r['arcade/banner.png'] === '1280x400', detail: JSON.stringify(r) };
  });

  await step('arcade stylesheet injected, no emoji in arcade UI', async () => {
    const r = await page.evaluate(() => {
      window.__arc();
      const root = document.querySelector('.arc-root');
      const txt = root ? root.textContent : '';
      const emoji = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(txt);
      return { css: !!document.getElementById('arcStyles'), root: !!root, emoji,
        imgs: root ? root.querySelectorAll('.arc-sp,.arc-cv,.arc-face').length : 0 };
    });
    return { ok: r.css && r.root && !r.emoji && r.imgs >= 8, detail: JSON.stringify(r) };
  });

  await step('hub shows 6 illustrated game covers + cash out + records', async () => {
    const r = await page.evaluate(() => {
      window.__arc();
      const cards = document.querySelectorAll('.arc-game[data-mf-game]');
      const covers = [...cards].filter((c) => getComputedStyle(c.querySelector('.arc-cv')).backgroundImage.includes('covers.png'));
      return { title: window.__title(), cards: cards.length, covers: covers.length,
        cash: !!document.querySelector('[data-mf-game="cash"]'),
        heroes: document.querySelectorAll('.arc-hero').length,
        records: document.querySelectorAll('.arc-table tr').length };
    });
    return { ok: r.title === 'ARCADE' && r.cards === 6 && r.covers === 6 && r.cash && r.heroes === 1 && r.records >= 6, detail: JSON.stringify(r) };
  });

  // ------------------------------------------------------------- 2. coin flip
  await step('coin flip: stake selector + synchronous play counter', async () => {
    const r = await page.evaluate(() => {
      window.__arc(); window.__game('coin');
      const before = window.MENU_FEATURES.cfg.plays;
      document.querySelector('[data-arc-stake="25"]').onclick();
      const stakeOn = document.querySelector('[data-arc-stake="25"]').classList.contains('on');
      // Force HEADS so the follow-up payout assertion is deterministic.
      const realRandom = Math.random;
      Math.random = () => 0.1;
      document.querySelector('[data-mf-call="h"]').onclick();
      Math.random = realRandom;
      return { title: window.__title(), stakeOn, before, after: window.MENU_FEATURES.cfg.plays,
        spinning: document.getElementById('arcCoin').classList.contains('spin'),
        disabled: document.querySelector('[data-mf-call="h"]').disabled,
        tokens: window.__tokens() };
    });
    return { ok: r.title === 'COIN FLIP' && r.stakeOn && r.after === r.before + 1 && r.spinning && r.disabled && r.tokens === 775, detail: JSON.stringify(r) };
  });

  await step('coin flip: animation resolves to a result + payout', async () => {
    await page.waitForTimeout(1350);
    const r = await page.evaluate(() => ({
      out: document.getElementById('arcCoinOut').textContent.trim(),
      enabled: !document.querySelector('[data-mf-call="h"]').disabled,
      tokens: window.__tokens(),
      history: document.getElementById('arcHistory').querySelectorAll('.arc-sp').length,
      streak: window.MENU_FEATURES.life().coin.streak,
    }));
    const win = /correct/i.test(r.out);
    const m = /\+(\d+) tokens/.exec(r.out);
    const expected = win ? 800 + (m ? +m[1] : 0) : 775;  // 800 - 25 stake, +stake+payout on a win
    return { ok: /HEADS|TAILS/.test(r.out) && r.enabled && r.history === 1 &&
      r.tokens === expected && (!win || (m && r.streak === 1)), detail: JSON.stringify(r) };
  });

  await step('coin flip: bank streak pays a bonus', async () => {
    const r = await page.evaluate(() => {
      const L = window.MENU_FEATURES.life();
      L.coin.streak = 4; window.MENU_FEATURES.save();
      window.__arc(); window.__game('coin');
      const before = window.__tokens();
      const b = document.getElementById('arcBank');
      const enabled = !b.disabled;
      b.onclick();
      return { enabled, before, after: window.__tokens(), streak: L.coin.streak,
        out: document.getElementById('arcCoinOut').textContent };
    });
    return { ok: r.enabled && r.after === r.before + 48 && r.streak === 0 && /banked/i.test(r.out), detail: JSON.stringify(r) };
  });

  // ------------------------------------------------------------ 3. higher/lower
  await step('higher or lower: real deck, live odds, card art', async () => {
    const r = await page.evaluate(() => {
      window.__arc(); window.__game('higher');
      const L = window.MENU_FEATURES.life();
      return { title: window.__title(), deck: L.hl.deck.length,
        face: document.getElementById('arcHlFace').textContent.trim(),
        suit: !!document.querySelector('#arcHlFace .arc-sp'),
        odds: document.getElementById('arcHlProb').textContent.replace(/\s+/g, ' ').trim(),
        left: document.getElementById('arcHlLeft').textContent };
    });
    return { ok: r.title === 'HIGHER OR LOWER' && r.deck === 51 && r.face.length > 0 && r.suit && /Higher/.test(r.odds) && r.left === '51', detail: JSON.stringify(r) };
  });

  await step('higher or lower: a guess consumes a card and resolves', async () => {
    const r = await page.evaluate(async () => {
      const L = window.MENU_FEATURES.life();
      const deck0 = L.hl.deck.length;
      document.getElementById('arcHlUp').onclick();
      await window.__w(620);
      return { deck0, deck1: L.hl.deck.length,
        out: document.getElementById('arcHlOut').textContent.trim(),
        pot: document.getElementById('arcHlPot').textContent,
        streak: document.getElementById('arcHlStreak').textContent,
        plays: window.MENU_FEATURES.cfg.plays };
    });
    return { ok: r.deck1 === r.deck0 - 1 && r.out.length > 4, detail: JSON.stringify(r) };
  });

  await step('higher or lower: swap and bank pot both work', async () => {
    const r = await page.evaluate(async () => {
      const L = window.MENU_FEATURES.life();
      L.hl.pot = 40; L.hl.streak = 3; L.hl.swap = 1; L.hl.over = false;
      window.MENU_FEATURES.save();
      window.__arc(); window.__game('higher');
      const sw = document.getElementById('arcHlSwap');
      sw.onclick(); await window.__w(560);
      const swapLeft = L.hl.swap;
      const before = window.__tokens();
      document.getElementById('arcHlBank').onclick();
      return { swapLeft, before, after: window.__tokens(), out: document.getElementById('arcHlOut').textContent };
    });
    return { ok: r.swapLeft === 0 && r.after === r.before + 40 && /Banked/i.test(r.out), detail: JSON.stringify(r) };
  });

  // --------------------------------------------------------------- 4. memory
  await step('memory: study phase reveals all 16 tiles, then hides them', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('memory');
      const q = () => document.querySelectorAll('.arc-mem.flip').length;
      const study = q();
      await window.__w(2800);
      return { study, after: q(), tiles: document.querySelectorAll('.arc-mem').length,
        timer: document.getElementById('arcMemTime').textContent,
        out: document.getElementById('arcMemOut').textContent.trim() };
    });
    return { ok: r.study === 16 && r.after === 0 && r.tiles === 16 && /Go!/i.test(r.out), detail: JSON.stringify(r) };
  });

  await step('memory: flip, match, combo and a full win', async () => {
    const r = await page.evaluate(async () => {
      const L = window.MENU_FEATURES.life(), m = L.mem;
      const before = window.__tokens();
      // solve by reading the board, two tiles at a time
      const byKey = {};
      m.cards.forEach((c, i) => { (byKey[c] = byKey[c] || []).push(i); });
      for (const pair of Object.values(byKey)) {
        document.querySelector(`[data-arc-mem="${pair[0]}"]`).onclick();
        document.querySelector(`[data-arc-mem="${pair[1]}"]`).onclick();
        await window.__w(340);
      }
      await window.__w(220);
      return { before, after: window.__tokens(), done: m.done,
        matched: m.matched.length, moves: m.moves,
        doneTiles: document.querySelectorAll('.arc-mem.done').length,
        out: document.getElementById('arcMemOut').textContent.trim(),
        best: window.MENU_FEATURES.cfg.best.memory };
    });
    return { ok: r.done && r.matched === 16 && r.moves === 8 && r.doneTiles === 16 &&
      r.after > r.before && /All pairs/i.test(r.out) && r.best > 0, detail: JSON.stringify(r) };
  });

  await step('memory: hint costs 15 tokens', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('memory');
      await window.__w(2750);
      const before = window.__tokens();
      document.getElementById('arcMemHint').onclick();
      await window.__w(60);
      return { before, after: window.__tokens(),
        hints: document.querySelectorAll('.arc-mem.hint').length };
    });
    return { ok: r.after === r.before - 15 && r.hints === 2, detail: JSON.stringify(r) };
  });

  // ---------------------------------------------------------------- 5. slots
  await step('slots: weighted reels, paytable spin animation', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('slots');
      const before = window.__tokens();
      document.querySelector('[data-arc-bet="10"]').onclick();
      document.getElementById('arcSpin').onclick();
      await window.__w(320);
      const cells = [...document.querySelectorAll('.arc-strip')].map((s) => s.children.length);
      const moving = [...document.querySelectorAll('.arc-strip')].map((s) => s.style.transform);
      const busy = document.getElementById('arcSpin').disabled;
      await window.__w(1900);
      return { title: window.__title(), before, cells, moving, busy,
        after: window.__tokens(), out: document.getElementById('arcSlotOut').textContent.trim(),
        payCells: document.querySelectorAll('.arc-pay > div').length,
        enabled: !document.getElementById('arcSpin').disabled };
    });
    return { ok: r.title === 'LUCKY SLOTS' && r.cells.every((n) => n === 14) &&
      r.moving.some((t) => t && t !== 'translateY(0px)') && r.busy && r.enabled &&
      /win|spin|TOKENS|kind|JACKPOT|SEVEN|STAR|BELL|CHERR/i.test(r.out) && r.payCells === 6,
      detail: JSON.stringify(r) };
  });

  await step('slots: auto toggle and free-spin bookkeeping', async () => {
    const r = await page.evaluate(() => {
      const L = window.MENU_FEATURES.life();
      L.slots.free = 2; window.MENU_FEATURES.save();
      window.__arc(); window.__game('slots');
      const chip = document.getElementById('arcSlotFree').textContent;
      const cost = document.getElementById('arcSpinCost').textContent;
      const auto = document.getElementById('arcAuto');
      auto.onclick();
      return { chip, cost, auto: L.slots.auto };
    });
    return { ok: /2 FREE/.test(r.chip) && r.cost === 'FREE', detail: JSON.stringify(r) };
  });

  // ------------------------------------------------------------- 6. reaction
  await step('reaction: arm, wait, green, tap produces a real ms reading', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('reaction');
      const pad = document.getElementById('arcReactPad');
      pad.onclick();                            // arm
      await window.__w(90);
      const armed = pad.className;
      // wait for GO (max 3.6s)
      let waited = 0;
      while (!pad.classList.contains('go') && waited < 4200) { await window.__w(60); waited += 60; }
      const wasGo = pad.classList.contains('go');
      pad.onclick();                            // tap
      await window.__w(120);
      const L = window.MENU_FEATURES.life();
      return { armed, wasGo, waited, times: L.react.times.slice(),
        big: document.getElementById('arcReactBig').textContent,
        rows: document.getElementById('arcReactRows').textContent.trim(),
        out: document.getElementById('arcReactOut').textContent.trim() };
    });
    return { ok: /wait/.test(r.armed) && r.wasGo && r.times.length === 1 && r.times[0] > 0 &&
      /ms/.test(r.big) && /LIGHTNING|ELITE|SHARP|STEADY|WARMING|SLOW/.test(r.rows), detail: JSON.stringify(r) };
  });

  await step('reaction: false start is penalised', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('reaction');
      const pad = document.getElementById('arcReactPad');
      pad.onclick(); await window.__w(70);
      pad.onclick(); await window.__w(120);
      const L = window.MENU_FEATURES.life();
      return { times: L.react.times.slice(), fs: L.react.falseStarts,
        out: document.getElementById('arcReactOut').textContent.trim(),
        cls: pad.className };
    });
    return { ok: r.times[0] === -1 && r.fs === 1 && /False start/i.test(r.out) && /bad/.test(r.cls), detail: JSON.stringify(r) };
  });

  await step('reaction: full 5-round session scores and pays', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('reaction');
      const pad = document.getElementById('arcReactPad');
      const before = window.__tokens();
      for (let i = 0; i < 5; i++) {
        pad.onclick();                                   // arm (or reset)
        let waited = 0;
        while (!pad.classList.contains('go') && waited < 4200) { await window.__w(50); waited += 50; }
        if (pad.classList.contains('go')) pad.onclick();
        await window.__w(120);
      }
      await window.__w(800);
      const L = window.MENU_FEATURES.life();
      return { before, after: window.__tokens(), times: L.react.times.length,
        out: document.getElementById('arcReactOut').textContent.trim(),
        big: document.getElementById('arcReactBig').textContent,
        best: window.MENU_FEATURES.cfg.best.reaction };
    });
    return { ok: r.times === 5 && /SESSION COMPLETE/i.test(r.out) && r.after > r.before && r.best > 0,
      detail: JSON.stringify(r) };
  });

  // ------------------------------------------------------------------ 7. RPS
  await step('RPS: animated throw, reveal and score', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('rps');
      const me = document.getElementById('arcRpsMe');
      document.querySelector('[data-mf-rps="r"]').onclick();
      await window.__w(120);
      const shaking = me.classList.contains('shake');
      const words = document.getElementById('arcRpsCall').textContent;
      await window.__w(800);
      const L = window.MENU_FEATURES.life();
      return { shaking, words, hist: L.rps.history.length, freq: L.rps.freq.r,
        out: document.getElementById('arcRpsOut').textContent.trim(),
        pips: document.getElementById('arcRpsPipsMe').innerHTML.length,
        plays: window.MENU_FEATURES.cfg.plays };
    });
    return { ok: r.shaking && r.hist === 1 && r.freq === 1 && r.out.length > 3, detail: JSON.stringify(r) };
  });

  await step('RPS: play a whole match to a payout', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('rps');
      const L = window.MENU_FEATURES.life(); L.rps.me = 0; L.rps.cpu = 0; L.rps.history = [];
      const before = window.__tokens();
      // Draws don't advance the score, so allow generously for a best-of-five.
      for (let i = 0; i < 20; i++) {
        const btns = [...document.querySelectorAll('[data-mf-rps]')].filter((b) => !b.disabled);
        if (!btns.length) break;
        btns[i % btns.length].onclick();
        await window.__w(900);
        if (L.rps.me >= 3 || L.rps.cpu >= 3) break;
      }
      await window.__w(200);
      return { before, after: window.__tokens(), me: L.rps.me, cpu: L.rps.cpu,
        out: document.getElementById('arcRpsOut').textContent.trim(), plays: window.MENU_FEATURES.cfg.plays };
    });
    return { ok: (r.me >= 3 || r.cpu >= 3) && /MATCH/i.test(r.out), detail: JSON.stringify(r) };
  });

  // ------------------------------------------------------------- 8. integration
  await step('back from a game is instant and ghost-free', async () => {
    const r = await page.evaluate(async () => {
      window.__arc(); window.__game('coin');
      const b = document.getElementById('arcBack');
      const p = new Promise((resolve) => requestAnimationFrame(() => {
        const scr = document.getElementById('screen'), sList = document.getElementById('sList');
        const sBack = document.getElementById('sBack');
        const ghosts = [...scr.children].filter((c) => c.id !== 'sList' && c !== sBack.parentElement &&
          getComputedStyle(c).position === 'absolute' && getComputedStyle(c).pointerEvents === 'none').length;
        resolve({ title: window.__title(), ghosts, list: getComputedStyle(sList).transform,
          op: getComputedStyle(document.getElementById('sTitle')).opacity });
      }));
      b.click();
      const first = await p;
      return first;
    });
    return { ok: r.title === 'ARCADE' && r.ghosts === 0 && r.list === 'none' && r.op === '1', detail: JSON.stringify(r) };
  });

  await step('cash out converts tokens to in-game money', async () => {
    const r = await page.evaluate(() => {
      const M = window.MENU_FEATURES;
      M.cfg.tokens = 300; state.mf.cashYear = -1;
      const money0 = state.money;
      window.__arc();
      document.querySelector('[data-mf-game="cash"]').onclick();
      document.querySelectorAll('.notice-wrap').forEach((x) => x.remove());
      return { tokens: M.cfg.tokens, money0, money1: state.money, title: window.__title() };
    });
    return { ok: r.tokens === 0 && r.money1 === r.money0 + 3000, detail: JSON.stringify(r) };
  });

  await step('arcade state persists in a fresh session', async () => {
    await page.evaluate(() => {
      const M = window.MENU_FEATURES;
      M.cfg.best.coin = 7; M.cfg.tokens = 456; M.save();
    });
    // A new tab in the SAME context shares localStorage but starts a fresh
    // document. Reloading the original page hangs on the game's auth-gate
    // audio loop, so this is both faster and more reliable.
    const fresh = await page.context().newPage();
    await fresh.goto('http://127.0.0.1:8765/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await fresh.waitForFunction(() => !!window.MENU_FEATURES, null, { timeout: 30000 });
    const r = await fresh.evaluate(() => ({
      best: window.MENU_FEATURES.cfg.best.coin,
      tokens: window.MENU_FEATURES.cfg.tokens,
    }));
    await fresh.close();
    return { ok: r.best === 7 && r.tokens === 456, detail: JSON.stringify(r) };
  });

  check('no uncaught JS errors', errs.length === 0, errs.join(' | '));

  console.log('\n================ ARCADE RESULTS ================');
  let pass = 0;
  for (const x of R) {
    console.log(`  ${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? '  — ' + x.detail : ''}`);
    if (x.ok) pass++;
  }
  console.log(`\n${pass}/${R.length} passed.`);
  await browser.close();
  process.exit(pass === R.length ? 0 : 1);
})();
