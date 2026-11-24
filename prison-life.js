/*
 * prison-life.js — juvenile & adult prison as a complete ecosystem
 * =============================================================
 *
 * The base game treats prison as a menu of thirteen one-shot actions. This
 * module gives the inside its own clock, economy, politics, contraband
 * market, smuggling network, commissary, disciplinary law and segregation
 * unit, with separate content and consequences for juvenile and adult
 * facilities.
 *
 * Everything is data-only: no eval, no user JS, no SVG icons. All artwork
 * comes from the generated raster icons in prison/*.png.
 *
 * State lives on state.prison.life, which lifeCopy() deep-copies, so saves
 * and Switch Lives carry it. Legacy saves are backfilled on first use.
 * Loaded last. Exposes window.PRISON_LIFE.
 */
(function () {
  if (window.PRISON_LIFE) return;

  /* ------------------------------------------------------------------ *
   * 0. Safe wrappers around game globals
   * ------------------------------------------------------------------ */
  function yr() { try { return (state.birthYear || 1990) + (state.age || 0); } catch (e) { return 1990; } }
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function chance(p) { return Math.random() < p; }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function cap(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function ICO(n) { return "prison/" + n + ".png"; }
  function sfx(k) { try { play(k || "choice"); } catch (e) {} }
  function sayIt(t) { try { say(t); } catch (e) {} }
  function stats() { try { renderStats(); } catch (e) {} }
  function note(t, b, html) { try { notice(t, b, null, true, html || ""); } catch (e) {} }
  function queue(fn) { try { queuePopup(fn); } catch (e) { setTimeout(fn, 340); } }
  function card(cfg) { try { jCard(cfg); } catch (e) {} }
  function res(t, b, logLine) {
    if (logLine) sayIt(logLine);
    stats(); note(t, b);
  }
  function closeEv() { try { evWrap.classList.remove("open"); } catch (e) {} }
  function closeScr() { try { screen.classList.remove("open"); } catch (e) {} }
  function money(n) { try { return usd(Math.round(n)); } catch (e) { return "$" + Math.round(n); } }
  function scrStr(n) { return Math.max(0, Math.round(n)).toLocaleString("en-US") + " scrip"; }

  var CFG = {
    v: 1,
    dayChance: .115,          // chance of a random event on any given day
    maxQueued: 3,             // most events surfaced per advance
    searchBase: .035,         // daily cell-search chance at heat 0
    searchHeat: .0016,        // added per point of heat
    shuRecHours: 1,
    shuLockHours: 23,
    allowanceEvery: 7,
    allowance: 18,
    passWeek: 7,
    passMonth: 30,
    juvShuCap: 30,
    adultShuCap: 180,
    maxLog: 160,
    maxInfractions: 80
  };

  /* ------------------------------------------------------------------ *
   * 1. COMMISSARY — 24 goods with real effects
   *    fx keys: h Happiness, he Health, sm Smarts, lk Looks,
   *             mh mental health, ins insanity, r respect, b behavior,
   *             heat suspicion, scrip, money, injury
   * ------------------------------------------------------------------ */
  var GOODS = [
    { id: "ramen", n: "Instant Noodles", ico: "pl-ramen", p: 4, k: "food", juv: 1,
      d: "A brick of dried noodles and a salt packet. The currency of the block.",
      fx: { h: 5, he: 1, mh: 2, ins: -1 } },
    { id: "coffee", n: "Instant Coffee", ico: "pl-coffee", p: 6, k: "food", juv: 0,
      d: "A tin of bitter granules. Trades for almost anything before count.",
      fx: { h: 4, sm: 2, mh: -1, he: -1 }, habit: "caffeine" },
    { id: "soap", n: "Soap & Toothbrush", ico: "pl-soap", p: 5, k: "hygiene", juv: 1,
      d: "A plain bar, a worn brush. Being clean is being somebody.",
      fx: { lk: 4, he: 2, mh: 2 } },
    { id: "book", n: "Paperback", ico: "pl-book", p: 9, k: "mind", juv: 1,
      d: "Whatever the library cart had left. Read twice, then traded.",
      fx: { sm: 5, mh: 6, ins: -5, h: 2 }, durable: 1 },
    { id: "cards", n: "Deck of Cards", ico: "pl-cards", p: 7, k: "mind", juv: 1,
      d: "Fifty-two squares of cardboard and a hundred arguments.",
      fx: { h: 7, mh: 3, ins: -2, r: 1 }, durable: 1 },
    { id: "pills", n: "Pain Tablets", ico: "pl-pills", p: 12, k: "med", juv: 0,
      d: "Issued from the infirmary window, one strip at a time.",
      fx: { he: 9, mh: 2, ins: -1 }, habit: "tablets" },
    { id: "sweets", n: "Chocolate Bar", ico: "pl-sweets", p: 5, k: "food", juv: 1,
      d: "Melts in the pocket. Worth more than the price suggests.",
      fx: { h: 9, mh: 3, lk: -1, he: -1 }, habit: "sugar" },
    { id: "stamps", n: "Stamped Envelopes", ico: "pl-stamps", p: 4, k: "mail", juv: 1,
      d: "Three envelopes. The only way out of here that fits in a pocket.",
      fx: { h: 4, mh: 6, ins: -4 } },
    { id: "puzzle", n: "Puzzle Book", ico: "pl-puzzle", p: 6, k: "mind", juv: 1,
      d: "Crosswords with half the answers already filled in.",
      fx: { sm: 6, mh: 4, ins: -4 }, durable: 1 },
    { id: "blanket", n: "Wool Blanket", ico: "pl-blanket", p: 14, k: "cell", juv: 1,
      d: "One extra layer. The nights are longer than the days.",
      fx: { he: 4, mh: 5, ins: -3, h: 3 }, durable: 1 },
    { id: "socks", n: "Fresh Socks", ico: "pl-socks", p: 4, k: "hygiene", juv: 1,
      d: "Dry feet. A small, underrated mercy.",
      fx: { he: 2, lk: 1, mh: 1 } },
    { id: "mirror", n: "Hand Mirror", ico: "pl-mirror", p: 8, k: "cell", juv: 1,
      d: "Polished metal in a frame. You check who is looking back.",
      fx: { lk: 6, mh: 2 }, durable: 1 },
    { id: "weights", n: "Weight Yard Pass", ico: "pl-weights", p: 10, k: "yard", juv: 1,
      d: "A slip that lets you use the iron pile at rec.",
      fx: { he: 7, lk: 3, h: 3, ins: -2 }, durable: 1 },
    { id: "letters", n: "Writing Paper", ico: "pl-letters", p: 3, k: "mail", juv: 1,
      d: "Twenty sheets, no envelope. Enough for a long apology.",
      fx: { mh: 5, ins: -3, sm: 2 } },
    { id: "harmonica", n: "Harmonica", ico: "pl-harmonica", p: 16, k: "cell", juv: 0,
      d: "Seven notes, all of them sad, all of them yours.",
      fx: { h: 8, mh: 7, ins: -5, r: 2 }, durable: 1 },
    { id: "slippers", n: "Shower Sandals", ico: "pl-slippers", p: 5, k: "hygiene", juv: 1,
      d: "Nobody asks where they have been. You just wear them.",
      fx: { he: 3, h: 2 } },
    { id: "tea", n: "Tea Sachets", ico: "pl-tea", p: 5, k: "food", juv: 1,
      d: "A dozen little bags. Hot water is the hard part.",
      fx: { h: 5, mh: 4, ins: -2 } },
    { id: "peanut", n: "Peanut Butter", ico: "pl-peanut", p: 7, k: "food", juv: 1,
      d: "A jar of dense, salty calories. Bodybuilders hoard it.",
      fx: { he: 5, h: 4, lk: 1 } },
    { id: "tuna", n: "Tin of Fish", ico: "pl-tuna", p: 6, k: "food", juv: 1,
      d: "Shelf-stable protein. Traded like coin on some tiers.",
      fx: { he: 5, h: 3 } },
    { id: "crackers", n: "Sleeve of Crackers", ico: "pl-crackers", p: 3, k: "food", juv: 1,
      d: "Mostly air, entirely useful.",
      fx: { h: 3, he: 1 } },
    { id: "razor", n: "Safety Razor", ico: "pl-razor", p: 11, k: "hygiene", juv: 0,
      d: "Signed out at dawn, counted back at dusk.",
      fx: { lk: 7, mh: 2, heat: 1 }, durable: 1 },
    { id: "lotion", n: "Skin Lotion", ico: "pl-lotion", p: 6, k: "hygiene", juv: 1,
      d: "The block air takes everything out of you. This puts a little back.",
      fx: { lk: 5, he: 1, mh: 2 } },
    { id: "script", n: "Scrip Voucher", ico: "pl-script", p: 20, k: "money", juv: 1,
      d: "A signed credit slip from the business office.",
      fx: { scrip: 22 } },
    { id: "icons", n: "Commissary Sheet", ico: "pl-shop", p: 1, k: "mind", juv: 1,
      d: "The printed list itself. Somehow people read it every week.",
      fx: { sm: 1, mh: 1 } }
  ];
  var GOOD = {}; GOODS.forEach(function (g) { GOOD[g.id] = g; });

  /* ------------------------------------------------------------------ *
   * 2. CONTRABAND — possession is a crime with a catch chain
   * ------------------------------------------------------------------ */
  var HOT = [
    { id: "shank", n: "Shank", ico: "pl-shank", v: 34, risk: 4, juv: 0,
      d: "A sharpened piece of scrap wrapped in tape.", fx: { r: 7, b: -6, heat: 9, ins: 3 } },
    { id: "rollies", n: "Hand-Rolled Smokes", ico: "pl-rollies", v: 12, risk: 2, juv: 0,
      d: "Three loose cigarettes. The most common currency after scrip.",
      fx: { h: 8, mh: 4, ins: -3, he: -3, heat: 4 }, habit: "smoke" },
    { id: "lighter", n: "Lighter", ico: "pl-lighter", v: 16, risk: 3, juv: 0,
      d: "Contraband on every tier, and nobody will admit owning it.",
      fx: { r: 3, heat: 5, h: 2 } },
    { id: "hooch", n: "Fermented Drink", ico: "pl-hooch", v: 22, risk: 4, juv: 0,
      d: "A sealed jar from somewhere warm and hidden.",
      fx: { h: 11, mh: -6, ins: 6, he: -6, b: -4, heat: 8 }, habit: "drink" },
    { id: "tablets", n: "Loose Tablets", ico: "pl-pills", v: 26, risk: 4, juv: 0,
      d: "Unlabelled, counted by hand, sold by the strip.",
      fx: { mh: 5, ins: 5, he: -4, heat: 10, b: -5 }, habit: "tablets" },
    { id: "kite", n: "Kite (Secret Note)", ico: "pl-kite", v: 4, risk: 1, juv: 1,
      d: "A folded message. The contents are worth more than the paper.",
      fx: { mh: 3, ins: -2, r: 2, heat: 2 } },
    { id: "tattoo", n: "Tattoo Kit", ico: "pl-tattoo", v: 20, risk: 3, juv: 0,
      d: "Ink, a needle and a steady hand. Permanently expensive.",
      fx: { lk: 4, r: 6, he: -3, heat: 6, ins: 2 }, habit: "ink" },
    { id: "keys", n: "Copied Key", ico: "pl-keys", v: 40, risk: 5, juv: 0,
      d: "Nobody asks how it exists. Everybody asks what it opens.",
      fx: { r: 9, heat: 12, b: -8, ins: 3 } },
    { id: "package", n: "Unchecked Parcel", ico: "pl-package", v: 18, risk: 3, juv: 1,
      d: "Something that came in without being opened at the desk.",
      fx: { h: 7, mh: 4, heat: 6, scrip: 8 } },
    { id: "candy", n: "Outside Candy", ico: "pl-sweets", v: 7, risk: 1, juv: 1,
      d: "Not on the sheet. That is the whole point.", fx: { h: 6, mh: 2, heat: 2 } },
    { id: "dice", n: "Handmade Dice", ico: "pl-cards", v: 9, risk: 2, juv: 1,
      d: "Carved from soap. Nobody wins for long.", fx: { h: 5, r: 2, b: -3, heat: 3 } },
    { id: "stamps_hot", n: "Blank Stamps", ico: "pl-stamps", v: 11, risk: 2, juv: 1,
      d: "Envelopes that never went through the office.", fx: { scrip: 9, mh: 2, heat: 4 } }
  ];
  var HOTBY = {}; HOT.forEach(function (h) { HOTBY[h.id] = h; });

  /* Hiding places: each has a discovery multiplier and a capacity. */
  var SPOTS = [
    { id: "mattress", n: "Inside the Mattress", ico: "pl-stash", risk: 1.0, cap: 6,
      d: "The first place they look. Fast to reach." },
    { id: "tile", n: "Loose Floor Tile", ico: "pl-stash", risk: .58, cap: 5,
      d: "A hollow under the bunk. Slow, but they rarely lift it." },
    { id: "vent", n: "Vent Shaft", ico: "pl-search", risk: .42, cap: 4,
      d: "Behind the grille. Dusty, awkward, good." },
    { id: "book", n: "Hollowed Book", ico: "pl-book", risk: .70, cap: 2,
      d: "Only fits flat things. Looks innocent on the shelf." },
    { id: "yard", n: "Yard Drop", ico: "pl-drop", risk: .85, cap: 8,
      d: "Buried near the fence. Anyone on the tier might find it." },
    { id: "body", n: "On Your Person", ico: "pl-shackles", risk: 2.1, cap: 2,
      d: "Instant access, instant trouble at a shake-down." }
  ];
  var SPOT = {}; SPOTS.forEach(function (s) { SPOT[s.id] = s; });

  /* ------------------------------------------------------------------ *
   * 3. SMUGGLING ROUTES
   * ------------------------------------------------------------------ */
  var ROUTES = [
    { id: "laundry", n: "Laundry Cart", ico: "pl-laundry", cost: 6, risk: .16, cap: 3, juv: 1,
      d: "Folded linens move between blocks all day. Small, steady, dull." },
    { id: "kitchen", n: "Kitchen Crate", ico: "pl-kitchen", cost: 9, risk: .20, cap: 4, juv: 1,
      d: "Produce comes in at dawn. The work crew knows which crate." },
    { id: "visit", n: "Visiting Room", ico: "pl-visit", cost: 14, risk: .28, cap: 3, juv: 1,
      d: "Across the glass, under the table, into a sleeve." },
    { id: "mail", n: "Mail Room", ico: "pl-mail", cost: 7, risk: .13, cap: 2, juv: 1,
      d: "Paper is checked, but paper is also endless." },
    { id: "trash", n: "Refuse Bin", ico: "pl-trash", cost: 4, risk: .24, cap: 5, juv: 1,
      d: "Cheap, filthy, and the officers hate searching it." },
    { id: "workshop", n: "Workshop Pallet", ico: "pl-route", cost: 11, risk: .18, cap: 4, juv: 0,
      d: "Finished goods leave the gate every afternoon." },
    { id: "guard", n: "An Officer's Pocket", ico: "pl-bribe", cost: 32, risk: .10, cap: 6, juv: 0,
      d: "Expensive, quiet, and catastrophic if it ever comes out." },
    { id: "fence", n: "Night Fence", ico: "pl-night", cost: 18, risk: .36, cap: 2, juv: 0,
      d: "After lights out, at the blind spot near the old tower." }
  ];
  var ROUTE = {}; ROUTES.forEach(function (r) { ROUTE[r.id] = r; });

  /* ------------------------------------------------------------------ *
   * 4. GANGS — rank ladder, mission board, turf and feuds
   * ------------------------------------------------------------------ */
  var RANKS = [
    { id: "fish", n: "Fish", min: 0, d: "New. Watched. Given the worst jobs." },
    { id: "associate", n: "Associate", min: 18, d: "Trusted with small errands." },
    { id: "soldier", n: "Soldier", min: 45, d: "Expected to show up and stand firm." },
    { id: "enforcer", n: "Enforcer", min: 72, d: "The name people lower their voice for." },
    { id: "shotcaller", n: "Shot Caller", min: 108, d: "You decide who eats and who does not." },
    { id: "boss", n: "Tier Boss", min: 155, d: "The block moves when you say so." }
  ];
  var GANG_ACTS = [
    { id: "dues", n: "Pay Dues", ico: "pl-tax", cost: 8, d: "Weekly scrip to the treasury. Skipping it is noticed.",
      fx: { standing: 6, loyalty: 3, scrip: -8, b: 2 }, fail: { standing: -8, loyalty: -6, r: -3 } },
    { id: "taxes", n: "Collect Commissary Tax", ico: "pl-tax", d: "Take a cut of the new fish's store orders.",
      fx: { scrip: 16, standing: 5, r: 4, heat: 7, b: -3 }, risk: .30,
      bust: { heat: 22, b: -10, shu: 14 } },
    { id: "product", n: "Move Product", ico: "pl-package", d: "Carry a parcel from one tier to another.",
      fx: { scrip: 22, standing: 7, heat: 9, b: -2 }, risk: .27,
      bust: { heat: 26, shu: 20, b: -12 } },
    { id: "turf", n: "Hold the Turf", ico: "pl-turf", d: "Stand on the corner of the yard all afternoon.",
      fx: { turf: 9, standing: 4, r: 5, he: -3, heat: 4 }, risk: .22,
      bust: { he: -18, heat: 15, r: -4 } },
    { id: "recruit", n: "Recruit a Fish", ico: "pl-fish", d: "Find someone new with nobody else to sit with.",
      fx: { standing: 6, loyalty: 2, r: 2, mh: 2 }, risk: .16,
      bust: { standing: -4, r: -3, heat: 6 } },
    { id: "debt", n: "Collect a Debt", ico: "pl-tax", d: "Someone owes the crew and has been avoiding you.",
      fx: { scrip: 19, standing: 6, r: 5, he: -4, b: -4, heat: 8 }, risk: .33,
      bust: { he: -22, shu: 16, heat: 20, b: -10 } },
    { id: "kite", n: "Send a Kite", ico: "pl-kite", d: "Get word to another block without an officer reading it.",
      fx: { standing: 4, loyalty: 3, heat: 5, mh: 2 }, risk: .18,
      bust: { heat: 18, shu: 9, b: -6 } },
    { id: "council", n: "Sit With the Shot Callers", ico: "pl-boss", need: "soldier",
      d: "Listen more than you speak. That is the test.",
      fx: { standing: 12, loyalty: 5, sm: 2, r: 3 }, risk: .10,
      bust: { standing: -6, loyalty: -4 } },
    { id: "hit", n: "Carry Out a Hit", ico: "pl-hit", need: "enforcer",
      d: "A named rival, a crowded rec, no witnesses who will talk.",
      fx: { r: 16, standing: 14, beef: 22, turf: 6, he: -8, b: -14, heat: 24, ins: 5 }, risk: .48,
      bust: { he: -32, shu: 75, heat: 40, b: -22, years: 1 } },
    { id: "truce", n: "Offer a Truce", ico: "pl-truce", need: "associate",
      d: "Send a clean cloth and a proposal to the other crew.",
      fx: { beef: -28, standing: 4, r: -2, heat: -6, mh: 3 }, risk: .20,
      bust: { r: -8, standing: -5, beef: 10 } },
    { id: "war", n: "Declare War", ico: "pl-war", need: "enforcer",
      d: "No more quiet corners in the yard.",
      fx: { beef: 40, turf: 8, r: 12, standing: 10, heat: 16, b: -10 }, risk: .30,
      bust: { he: -20, shu: 35, heat: 25 } },
    { id: "protect", n: "Sell Protection", ico: "pl-protection", d: "A nervous inmate pays to walk to chow.",
      fx: { scrip: 24, standing: 5, r: 6, heat: 10, b: -5 }, risk: .34,
      bust: { heat: 24, shu: 18, b: -12 } },
    { id: "launder", n: "Launder Scrip", ico: "pl-script", need: "associate",
      d: "Move store credit through a dozen clean accounts.",
      fx: { scrip: 30, standing: 5, sm: 2, heat: 8 }, risk: .26,
      bust: { heat: 22, shu: 12, scrip: -30, b: -9 } },
    { id: "testify", n: "Stand Up For a Brother", ico: "pl-oath", d: "Tell the hearing officer what they want to hear is wrong.",
      fx: { loyalty: 12, standing: 8, r: 6, b: -8, heat: 12 }, risk: .28,
      bust: { heat: 20, shu: 12, b: -10 } },
    { id: "challenge", n: "Challenge the Boss", ico: "pl-boss", need: "shotcaller",
      d: "One conversation, in front of everyone. No going back after.",
      fx: { rank: 1, r: 20, standing: 20, he: -14, heat: 18, ins: 4 }, risk: .55,
      bust: { standing: -30, loyalty: -22, r: -18, he: -30, shu: 40, beef: 25 } },
    { id: "laylow", n: "Lay Low", ico: "pl-beef", d: "Keep your head down for a few days.",
      fx: { heat: -14, standing: -3, loyalty: -2, mh: 3, ins: -2 } },
    { id: "leave", n: "Leave the Crew", ico: "pl-beef", d: "There is a price, and everybody knows it.",
      fx: { r: -18, standing: -100, loyalty: -100, beef: 20, he: -10 }, risk: .35,
      bust: { he: -26, r: -12 } }
  ];
  var GACT = {}; GANG_ACTS.forEach(function (a) { GACT[a.id] = a; });

  /* ------------------------------------------------------------------ *
   * 5. PROGRAMS — time served doing something that changes the record
   * ------------------------------------------------------------------ */
  var PROGRAMS = [
    { id: "literacy", n: "Literacy Circle", ico: "pl-book", days: 21, juv: 1,
      d: "Read aloud, slowly, with people who will not laugh.", fx: { sm: 9, mh: 5, ins: -4, b: 6 } },
    { id: "ged", n: "School Credit Course", ico: "pl-library", days: 35, juv: 0,
      d: "The same exam, in a room with bars on the window.", fx: { sm: 13, mh: 4, b: 8 } },
    { id: "anger", n: "Anger Group", ico: "pl-counselor", days: 28, juv: 1,
      d: "Say it out loud instead of doing it with your hands.", fx: { mh: 11, ins: -10, b: 10, he: 2 } },
    { id: "substance", n: "Substance Group", ico: "pl-infirmary", days: 30, juv: 0,
      d: "A circle of chairs and a list of things you lost.", fx: { he: 9, mh: 10, ins: -9, b: 7 } },
    { id: "trade", n: "Vocational Shop", ico: "j-wrench", days: 42, juv: 0,
      d: "Measure twice. Something outside might want this skill.", fx: { sm: 8, he: 3, b: 9, scrip: 30 } },
    { id: "restorative", n: "Restorative Circle", ico: "pl-truce", days: 24, juv: 1,
      d: "Sit across from the person you hurt and listen.", fx: { mh: 9, ins: -7, r: 4, b: 12 } },
    { id: "family", n: "Family Conference", ico: "pl-visit", days: 18, juv: 1,
      d: "A staff member, a visitor, and a very quiet table.", fx: { h: 9, mh: 12, ins: -6, b: 6 } },
    { id: "mindful", n: "Stillness Practice", ico: "pl-counselor", days: 20, juv: 1,
      d: "Twenty minutes of nothing, once a day, on a hard floor.", fx: { mh: 14, ins: -12, h: 3 } }
  ];
  var PROG = {}; PROGRAMS.forEach(function (p) { PROG[p.id] = p; });

  /* ------------------------------------------------------------------ *
   * 6. EVENT POOL — weighted, filtered, era-safe, no modern slang
   *    EV(id, ico, title, lead, gate, choices, weight)
   *    gate: "" | "juv" | "adult" | "gang" | "shu" | "stash" | "heat" |
   *          "program" | "cellie" | "shop" | "route" | "night"
   *    choice: [label, fx, note, logLine, optionalRisk]
   *    optionalRisk: [probability, fx, note, logLine]
   * ------------------------------------------------------------------ */
  var EVENTS = [];
  function EV(id, ico, t, d, gate, c, w) {
    EVENTS.push({ id: id, ico: ico, t: t, d: d, gate: gate || "", c: c, w: w || 1 });
  }

  /* --- general block life (both) --- */
  EV("count", "pl-count", "Count Clears", "The officer finishes the tally and the tier exhales at once. Somebody two cells down starts humming.", "", [
    ["Get up and stretch", { he: 2, mh: 2, ins: -1 }, "You moved for the first time in hours.", "I stretched after count cleared."],
    ["Stay on the bunk", { h: 2, mh: 1 }, "You let the noise wash over you.", "I stayed on my bunk after count."],
    ["Ask for the infirmary list", { b: 2, heat: 2, mh: -1 }, "They wrote your name down. That is all.", "I put my name on the infirmary list."]
  ], 1.3);
  EV("chow", "pl-chow", "Chow Hall", "The tray is warm in one corner and cold in the other. A long table has one empty seat.", "", [
    ["Sit with the tier", { h: 5, r: 2, mh: 2 }, "You ate with the block. Nobody made room, but nobody objected.", "I ate with the tier in the chow hall."],
    ["Sit alone", { h: 2, mh: 3, ins: -2, r: -2 }, "The quiet was worth the looks.", "I ate alone in the chow hall."],
    ["Trade the tray for a favour", { scrip: 7, r: 3, he: -2 }, "Somebody owes you now.", "I traded my tray for a favour."]
  ], 1.4);
  EV("tier_noise", "pl-tier", "Noise on the Tier", "Somebody is kicking a locker door, over and over, at a rhythm that gets inside your head.", "", [
    ["Ask them to stop", { r: 3, mh: 2, ins: -1, he: -3 }, "It stopped. Your ear did not.", "I asked for quiet on the tier.", [.3, { he: -12, mh: -4 }, "They turned on you instead.", "I got hurt asking for quiet."]],
    ["Kick back in time", { h: 4, r: 2, b: -2 }, "The whole tier joined in until an officer came.", "I joined the noise on the tier."],
    ["Put the blanket over your head", { mh: -3, ins: 2, h: -2 }, "It did not help.", "I hid under the blanket during the noise."]
  ], 1.1);
  EV("library", "pl-library", "Library Cart", "A wheeled shelf with thirty books, none of them the one you asked for last week.", "", [
    ["Take the thickest one", { sm: 6, mh: 5, ins: -4 }, "It took nine days and was worth it.", "I read the thickest book on the cart."],
    ["Ask for a law volume", { sm: 4, b: 2, heat: 2 }, "The clerk wrote something beside your number.", "I asked the library cart for a law volume."],
    ["Skip it", { h: 1 }, "The cart rolled on.", "I let the library cart pass."]
  ], 1.2);
  EV("letter_day", "pl-letters", "Mail Call", "A name gets called. Not yours. Then, a second later, it is yours after all.", "", [
    ["Read it twice", { h: 8, mh: 8, ins: -5 }, "Three pages about ordinary things. Exactly what you needed.", "I got a letter from outside."],
    ["Read it once and put it away", { h: 4, mh: 3 }, "You did not want to wear it out.", "I put the letter away unread a second time."],
    ["Trade it for scrip", { scrip: 12, mh: -4, ins: 3 }, "Somebody wanted the stamp. You let them have the whole thing.", "I traded a letter for scrip."]
  ], 1.2);
  EV("weightyard", "pl-weights", "The Iron Pile", "Two homemade bells and a queue of people pretending not to wait.", "", [
    ["Take a turn", { he: 7, lk: 3, h: 3, ins: -2 }, "Your arms remembered something.", "I used the iron pile at rec."],
    ["Spot for somebody", { r: 5, mh: 2, he: 1 }, "They nodded at you on the way out.", "I spotted for someone at the iron pile."],
    ["Watch from the wall", { h: 1, lk: -1 }, "You learned the pecking order instead.", "I watched the iron pile from the wall."]
  ], 1.0);
  EV("sick", "pl-infirmary", "Infirmary Window", "The line moves one person every ten minutes. The person ahead of you is breathing badly.", "", [
    ["Give them your place", { r: 5, mh: 4, b: 3, he: -2 }, "They did not forget it.", "I gave up my place at the infirmary."],
    ["Keep your place", { he: 4, mh: -2, ins: 2 }, "You got seen. You heard the coughing the whole time.", "I kept my place at the infirmary window."],
    ["Leave the line", { h: -2, mh: -1 }, "Some things are not worth the wait.", "I left the infirmary line."]
  ], 1.0);
  EV("rain", "pl-yard", "Rain in the Yard", "Rec is not cancelled. The officers stand under the overhang and everyone else gets wet.", "", [
    ["Walk the perimeter anyway", { he: 4, mh: 6, ins: -4, h: 3 }, "Cold, clean, and yours.", "I walked the yard in the rain."],
    ["Stay under the overhang", { h: 2, r: -1 }, "You were dry and slightly ashamed of it.", "I stayed dry during rec."],
    ["Start a race in it", { h: 8, r: 4, he: -3, b: -2 }, "Six people slipped. Everybody laughed.", "I raced in the rain at rec."]
  ], 1.0);
  EV("newfish", "pl-fish", "New Arrival", "Someone in a fresh uniform is standing in the doorway with no idea where to put their things.", "", [
    ["Show them the ropes", { r: 5, mh: 3, loyalty: 2 }, "They will remember who was kind first.", "I showed the new arrival around."],
    ["Charge for the tour", { scrip: 10, r: 3, heat: 4, b: -2 }, "Business is business.", "I charged the new arrival for a tour."],
    ["Say nothing", { mh: -1 }, "They found their own bunk eventually.", "I ignored the new arrival."]
  ], 1.2);
  EV("cellie", "pl-cell", "Cellie Trouble", "Your cellmate has rearranged everything again, including the shelf that was yours.", "", [
    ["Let it go", { mh: 3, ins: -2, r: -2 }, "Peace is cheaper than a shelf.", "I let my cellmate have the shelf."],
    ["Move it back", { r: 3, he: -4, h: -2, b: -3 }, "It stayed where you put it. Nothing else did.", "I moved my things back in the cell."],
    ["Ask for a cell change", { b: 4, heat: 3, mh: -2, r: -4 }, "The officer made a note and a face.", "I asked for a cell change."]
  ], 1.1, 1);
  EV("haircut", "pl-mirror", "The Tier Barber", "A chair, a pair of clippers and a queue. He says he has done this for eleven years.", "", [
    ["Sit down", { lk: 7, h: 3, mh: 2 }, "Better than you expected. Much better.", "I got a haircut on the tier."],
    ["Offer to sweep instead", { r: 3, scrip: 4, lk: -1 }, "He paid you in store credit.", "I swept for the tier barber."],
    ["Decline", { lk: -2, h: 1 }, "You kept what you had.", "I declined the tier haircut."]
  ], .9);
  EV("chess", "pl-cards", "A Board in the Dayroom", "Two older men have been on the same move for twenty minutes. One of them offers you the seat.", "", [
    ["Play properly", { sm: 5, mh: 4, ins: -3, r: 3 }, "You lost in fourteen moves and they invited you back.", "I played a board game in the dayroom."],
    ["Play to lose", { r: 4, h: 3, mh: 1 }, "They knew. They appreciated it anyway.", "I let the older man win."],
    ["Watch instead", { sm: 2, h: 2 }, "You saw the trap three moves early.", "I watched the board game."]
  ], 1.0);
  EV("chaplain", "pl-counselor", "A Quiet Visit", "Someone with no uniform and no clipboard asks if you want to sit for a while.", "", [
    ["Talk", { mh: 11, ins: -8, h: 4 }, "You said more than you meant to. It helped.", "I talked with the visitor"],
    ["Ask them to write a letter", { mh: 6, ins: -3, b: 2 }, "It went out the next morning.", "I asked the visitor to write a letter for me."],
    ["Say you are fine", { mh: -2, ins: 2 }, "They left the door open, figuratively.", "I told the visitor I was fine."]
  ], 1.0);
  EV("lockdown", "pl-custody", "Lockdown", "A door somewhere slammed wrong and the whole block is confined to cells. No rec today.", "", [
    ["Do nothing at all", { mh: -4, ins: 3, h: -3 }, "Fourteen hours of ceiling.", "I sat through a lockdown."],
    ["Keep a count of the hours", { sm: 2, mh: 2, ins: -2 }, "You knew exactly when it ended.", "I counted the hours of a lockdown."],
    ["Shout for an officer", { b: -3, heat: 5, r: 3, mh: -2 }, "Somebody answered eventually. Nobody helped.", "I shouted during a lockdown."]
  ], .9);
  EV("birthday", "pl-clock", "A Birthday on the Tier", "Someone made a cake out of crushed biscuits and stored sweetness. It is mostly gesture.", "", [
    ["Take a piece", { h: 8, mh: 4, he: 1 }, "It tasted like the gesture, which was the point.", "I had a piece of the tier cake."],
    ["Give your piece away", { r: 6, mh: 5, b: 3 }, "The person who got it did not expect it.", "I gave away my piece of cake."],
    ["Stay on your bunk", { h: -2, mh: -2 }, "You heard the singing anyway.", "I skipped the tier birthday."]
  ], .8);
  EV("officer", "pl-guard", "An Officer Stops By", "Not a search. Just a pause at the door and a question about how you are getting on.", "", [
    ["Answer plainly", { b: 4, heat: -5, mh: 1 }, "He wrote something short and moved on.", "I answered an officer plainly."],
    ["Ask about a transfer", { b: 2, heat: 2, mh: -1 }, "It goes on a list. Lists are long.", "I asked an officer about a transfer."],
    ["Say nothing", { heat: 4, r: 2 }, "He waited, then left.", "I said nothing to the officer."]
  ], .9);
  EV("radio_room", "pl-harmonica", "Music Down the Tier", "Somebody has an instrument they should not have, and they are playing it badly on purpose.", "", [
    ["Listen", { h: 6, mh: 6, ins: -4 }, "It was the best hour of the week.", "I listened to music down the tier."],
    ["Sing along", { h: 8, r: 4, b: -2, mh: 3 }, "The tier joined in. An officer did not.", "I sang along on the tier."],
    ["Ask them to stop", { r: -4, mh: -3, ins: 2 }, "They stopped. The tier did not forget.", "I asked for the music to stop."]
  ], .8);
  EV("laundry_detail", "pl-laundry", "Laundry Detail", "Two hundred sheets, one folding table, and a man who has done this since before you arrived.", "", [
    ["Work steadily", { scrip: 9, b: 4, he: 2, mh: 2 }, "He showed you a faster fold.", "I worked the laundry detail."],
    ["Slip a note into a fold", { heat: 6, mh: 3, r: 2, standing: 2 }, "It went out with the clean linen.", "I sent a note out with the laundry."],
    ["Do as little as possible", { h: 3, b: -4, scrip: 3 }, "You got away with it. Mostly.", "I did as little as possible on laundry."]
  ], 1.0);
  EV("window", "pl-night", "The Window at Dusk", "A strip of sky you can only see from the top bunk. Tonight it is doing something worth looking at.", "", [
    ["Look until it is gone", { mh: 9, ins: -6, h: 4 }, "You forgot which building you were in.", "I watched the sky from the top bunk."],
    ["Describe it out loud", { h: 4, r: 3, mh: 4 }, "Three other people climbed up to see.", "I described the sky to the cell."],
    ["Pull the blanket down", { h: -2, mh: -3, ins: 2 }, "Easier not to.", "I hid from the window at dusk."]
  ], .9);
  EV("argument", "pl-writeup", "A Loud Argument", "Two people three doors down are working themselves toward something stupid.", "", [
    ["Step between them", { r: 7, b: 5, he: -6, mh: 2 }, "It worked. Your shoulder did not.", "I broke up an argument on the tier.", [.25, { he: -16, shu: 9, heat: 12 }, "An officer saw the wrong moment.", "I got written up breaking up a fight."]],
    ["Fetch an officer", { b: 6, heat: 3, r: -8, mh: -2 }, "The tier has a long memory for this.", "I fetched an officer during an argument."],
    ["Close the door", { mh: -2, ins: 2, h: -1 }, "It sorted itself out loudly.", "I closed the door during an argument."]
  ], 1.0);
  EV("package", "pl-package", "A Package Arrives", "The desk officer holds it a moment too long before calling your name.", "", [
    ["Open it in front of everyone", { h: 7, r: 3, mh: 3, heat: 3 }, "Nothing to hide. That was the right call.", "I opened a package in front of the tier."],
    ["Open it later, alone", { h: 5, mh: 5, heat: 6, ins: -2 }, "You had the contents to yourself for one evening.", "I opened my package alone."],
    ["Send it back unopened", { mh: -4, ins: 3, b: 3 }, "It cost you something, and you still do not know why.", "I sent a package back unopened."]
  ], .9);
  EV("rumor", "pl-snitch", "A Rumour", "By lunch it has three different versions and one of them has your name in it.", "", [
    ["Find out who started it", { r: 5, sm: 2, heat: 4, he: -3 }, "You found him. He was smaller than the story.", "I tracked down a rumour."],
    ["Laugh it off", { h: 4, mh: 3, r: 1 }, "It died faster than it spread.", "I laughed off a rumour."],
    ["Start a better one", { r: 4, h: 5, b: -2, heat: 3 }, "The new version was much more flattering.", "I started a better rumour."]
  ], .9);
  EV("good_time", "pl-record", "Good Time Review", "A clerk reads out which names earned days off. Yours is somewhere in the middle of the list.", "", [
    ["Ask to see the calculation", { sm: 3, b: 3, heat: 1, mh: -1 }, "They were missing eight days. Now they are not.", "I checked my good time calculation."],
    ["Just take it", { h: 5, mh: 3, b: 2 }, "Days off are days off.", "I accepted my good time review."],
    ["Argue about it", { b: -5, heat: 4, r: 3, mh: -2 }, "Nothing changed except the clerk's expression.", "I argued about my good time review."]
  ], .8);
  EV("visit_day", "pl-visit", "Visiting Day", "The room is loud with people trying to speak normally across a table.", "", [
    ["Sit with your visitor", { h: 10, mh: 10, ins: -6 }, "An hour that went far too fast.", "I had a visit."],
    ["Ask them to bring something next time", { heat: 7, mh: 4, scrip: 6, b: -2 }, "They wrote it on their hand.", "I asked my visitor for a favour."],
    ["Ask them not to come again", { mh: -8, ins: 5, h: -5 }, "You meant it kindly. It did not land that way.", "I asked my visitor to stop coming."]
  ], 1.0);
  EV("winter", "pl-blanket", "A Cold Night", "The block heating is doing its best, which is not enough. Somebody has an extra layer.", "", [
    ["Ask to borrow it", { he: 3, mh: 3, r: 1 }, "It came back warmer than it left.", "I borrowed an extra blanket."],
    ["Share your own", { r: 5, mh: 4, he: -2 }, "You were cold. So was he. Less so together.", "I shared my blanket on a cold night."],
    ["Say nothing", { he: -3, mh: -3, ins: 2 }, "You slept in short pieces.", "I froze through a cold night."]
  ], .8);
  EV("kitchen_job", "pl-chow", "Kitchen Detail", "Peeling, lifting, stacking. The work is dull and the cook is generous with scraps.", "", [
    ["Work hard", { scrip: 10, b: 5, he: 2, mh: 2 }, "He slipped you an extra portion at the end.", "I worked the kitchen detail."],
    ["Pocket a little", { scrip: 8, heat: 7, he: 2, b: -3 }, "Nobody counted the crate.", "I took something from the kitchen."],
    ["Take your time", { h: 3, b: -3, scrip: 4 }, "The shift ended when it ended.", "I took my time on kitchen detail."]
  ], .9);
  EV("insomnia", "pl-night", "Three in the Morning", "The tier is never fully quiet, but tonight it is close enough to hear your own thoughts.", "", [
    ["Get up and walk the cell", { mh: 3, ins: -3, he: -1 }, "Twelve steps, turn, twelve steps.", "I walked my cell at night."],
    ["Write it all down", { sm: 3, mh: 7, ins: -6 }, "Four pages. You did not reread them.", "I wrote through the night."],
    ["Lie still until dawn", { mh: -4, ins: 4, he: -2 }, "Dawn came. It always does.", "I lay awake until dawn."]
  ], 1.0);
  EV("officer_help", "pl-guard", "An Officer Asks a Favour", "Nothing improper. Just carry a stack of files down two flights while he takes the stairs.", "", [
    ["Do it", { b: 6, heat: -6, mh: 1 }, "He remembered your name.", "I helped an officer with a stack of files."],
    ["Say you are busy", { heat: 3, r: 2, b: -2 }, "He found somebody else.", "I refused an officer's small favour."],
    ["Ask what is in the files", { sm: 3, heat: 8, mh: -2 }, "He stopped asking.", "I asked about the files."]
  ], .8);
  EV("tier_meeting", "pl-map", "Tier Meeting", "A staff member wants everyone in the dayroom to discuss the broken washbasin, again.", "", [
    ["Speak up about it", { r: 4, b: 4, sm: 2, mh: 2 }, "It got fixed on Thursday.", "I spoke at the tier meeting."],
    ["Say whatever agrees", { h: 2, b: 2 }, "The meeting ended early.", "I agreed through the tier meeting."],
    ["Do not go", { b: -3, r: -2, h: 2 }, "Your absence was counted.", "I skipped the tier meeting."]
  ], .8);
  EV("old_timer", "pl-clock", "The Old Timer", "He has been here longer than some of the officers. He offers you the chair by the door.", "", [
    ["Ask him how he does it", { mh: 9, ins: -7, sm: 4, h: 3 }, "'One day at a time' turns out to be practical advice.", "I talked with the old timer."],
    ["Give him your pudding", { r: 5, mh: 5, b: 2, he: -1 }, "He took it without making a speech.", "I gave my pudding to the old timer."],
    ["Tell him you will not be here that long", { h: 3, mh: -2, r: -2 }, "He smiled at the floor.", "I told the old timer I would be out soon."]
  ], .8);
  EV("shakedown", "pl-search", "Shake-Down", "Officers go along the tier with gloves and a list. They are two cells away.", "", [
    ["Sit tight and say nothing", { heat: -4, b: 3, mh: -3, ins: 2 }, "They passed. Your hands did not stop shaking for an hour.", "I sat through a shake-down."],
    ["Offer to help carry the bin", { b: 4, heat: -7, r: -3, mh: 1 }, "It got you out of the cell for ten minutes.", "I helped carry the bin during a shake-down."],
    ["Warn the next cell", { r: 6, heat: 12, b: -7, mh: -2 }, "They heard you. Everybody heard you.", "I warned the next cell about a shake-down."]
  ], .9);
  EV("exam", "pl-book", "A Test", "A folded sheet of questions and a pencil with no eraser. Nobody said it counted.", "", [
    ["Take it seriously", { sm: 8, mh: 3, b: 4 }, "The clerk filed it somewhere that mattered.", "I took a test inside."],
    ["Write your name and stop", { h: 2, b: -2, sm: 1 }, "Technically, you sat the test.", "I barely sat the test."],
    ["Help the person next to you", { r: 5, b: -3, heat: 3, sm: 2 }, "They passed. You got a look from the clerk.", "I helped someone during a test."]
  ], .8);

  /* --- juvenile-specific --- */
  EV("juv_school", "pl-library", "School Block", "A classroom with a barred window and a teacher who keeps coming back.", "juv", [
    ["Finish the assignment", { sm: 8, b: 7, mh: 4, ins: -3 }, "She wrote 'good' in the margin. It landed harder than expected.", "I finished my school assignment inside."],
    ["Help the kid next to you", { r: 5, mh: 4, sm: 2, b: 3 }, "He did not say thanks, but he passed.", "I helped someone in the school block."],
    ["Put your head down", { h: 3, b: -4, sm: -2 }, "She let you sleep. She did not forget.", "I slept through the school block."]
  ], 1.3);
  EV("juv_room", "pl-cell", "Room Check", "A staff member checks the dorm room while you are standing right there.", "juv", [
    ["Offer to show them everything", { b: 5, heat: -6, mh: -1 }, "It was over in a minute.", "I opened everything for a room check."],
    ["Stand in the doorway", { heat: 4, mh: -2, ins: 1 }, "They took longer because you stood there.", "I stood in the doorway during a room check."],
    ["Ask why, politely", { sm: 2, b: 2, heat: 2 }, "You got an honest answer for once.", "I asked why my room was being checked."]
  ], 1.1);
  EV("juv_family", "pl-visit", "Family Conference", "A long table, a tired relative and a staff member taking notes. Nobody knows where to look.", "juv", [
    ["Say what actually happened", { mh: 10, ins: -7, b: 9, h: 4 }, "The room got very quiet, and then easier.", "I told the truth at my family conference."],
    ["Say what they want to hear", { h: 3, b: 3, mh: -4, ins: 3 }, "It went in the notes. It did not help.", "I said the expected thing at my conference."],
    ["Ask them to stop coming", { mh: -9, ins: 6, h: -6, b: -3 }, "They came back the following month anyway.", "I asked my family to stop visiting."]
  ], 1.0);
  EV("juv_dorm", "pl-tier", "Dorm Night", "Eight beds, one light that stays on, and somebody crying very quietly at the far end.", "juv", [
    ["Go and sit with them", { mh: 7, r: 6, h: 3, ins: -4 }, "They did not say much. They did stop.", "I sat with someone in the dorm at night."],
    ["Tell a story until they laugh", { h: 8, r: 4, mh: 4, ins: -3 }, "It worked on the third try.", "I told stories in the dorm."],
    ["Pretend to be asleep", { mh: -4, ins: 3 }, "You heard it stop eventually.", "I pretended to be asleep in the dorm."]
  ], 1.1);
  EV("juv_rec", "pl-yard", "Organised Rec", "A staff member has a ball and a plan. The plan is not going well.", "juv", [
    ["Join in properly", { he: 6, h: 7, mh: 3, r: 3, ins: -2 }, "For forty minutes nobody was anywhere else.", "I played organised rec."],
    ["Keep score instead", { sm: 3, b: 4, h: 2 }, "You were the only one who knew the real total.", "I kept score at rec."],
    ["Sit on the step", { h: 2, mh: 1, lk: -1 }, "You watched the whole thing.", "I sat out organised rec."]
  ], 1.0);
  EV("juv_staff", "pl-counselor", "A Staff Member Asks", "Not a telling-off. Just 'how are you actually doing', asked like they will wait for the answer.", "juv", [
    ["Tell them the truth", { mh: 12, ins: -9, b: 6 }, "They wrote less than you expected, and did more.", "I told a staff member the truth."],
    ["Say 'fine'", { mh: -3, ins: 3, h: 1 }, "They waited anyway. You held.", "I said I was fine."],
    ["Ask about getting out early", { sm: 2, b: 3, mh: 2 }, "They explained the actual rules. Nobody had before.", "I asked about early release."]
  ], 1.1);
  EV("juv_letter", "pl-letters", "Writing Home", "A sheet of paper and a staff member who will read it before it goes.", "juv", [
    ["Write it anyway", { mh: 9, ins: -5, b: 5, h: 4 }, "You said the real thing in the middle paragraph.", "I wrote a letter home."],
    ["Draw instead of writing", { sm: 3, mh: 6, ins: -4, h: 3 }, "It came back with a note on the back.", "I drew a picture instead of writing."],
    ["Leave it blank", { mh: -4, ins: 3 }, "The blank sheet went in the bin.", "I left my letter blank."]
  ], 1.0);
  EV("juv_bully", "pl-beef", "Someone Bigger", "He has taken the seat you were using and is waiting for you to say something.", "juv", [
    ["Ask for the seat back, calmly", { r: 6, b: 5, mh: 3, he: -5 }, "He moved. Slowly. Loudly. But he moved.", "I asked for my seat back calmly."],
    ["Find another seat", { mh: -4, ins: 3, r: -4, h: -2 }, "It followed you for the rest of the day.", "I gave up my seat."],
    ["Tell a staff member", { b: 6, heat: 2, r: -7, mh: -2 }, "It stopped. The tier noted how.", "I told a staff member about a bully."]
  ], 1.1);
  EV("juv_group", "pl-truce", "Circle Time", "Chairs in a ring and a rule that you can pass if you want to. Most people pass.", "juv", [
    ["Speak", { mh: 9, ins: -7, b: 6, r: 3 }, "Nobody laughed. That was the whole miracle.", "I spoke in the circle."],
    ["Pass, but listen", { mh: 4, ins: -3, sm: 2 }, "You heard two things you needed.", "I listened in the circle."],
    ["Make a joke of it", { h: 6, r: 3, b: -4, mh: -2 }, "It got a laugh and a note in the file.", "I joked through circle time."]
  ], 1.0);
  EV("juv_bed", "pl-blanket", "Lights Low", "Not out. Low. Enough to see who is still awake.", "juv", [
    ["Whisper across the room", { h: 6, mh: 5, ins: -3, r: 2 }, "A whole conversation in half-voices.", "I whispered across the dorm after lights low."],
    ["Write in the dark", { sm: 3, mh: 5, ins: -4 }, "Illegible by morning. Still worth it.", "I wrote in the dark."],
    ["Go to sleep early", { he: 4, mh: 2, h: 1 }, "The safest choice, and a good one.", "I slept early in the dorm."]
  ], .9);
  EV("juv_release", "pl-clock", "A Review Date", "Someone reads out a date. It is not yours yet, but it is closer than the last one.", "juv", [
    ["Ask what you still need to do", { sm: 4, b: 6, mh: 4, ins: -3 }, "Three things, written down. Manageable.", "I asked what I still needed for release."],
    ["Celebrate quietly", { h: 8, mh: 5, ins: -3 }, "You told one person. It was enough.", "I celebrated a review date quietly."],
    ["Say it means nothing", { mh: -5, ins: 4, h: -3 }, "You believed it for about an hour.", "I dismissed my review date."]
  ], .9);

  /* --- adult-specific --- */
  EV("adult_yard", "pl-yard", "Yard Politics", "The benches are not assigned, but everybody knows exactly who sits where.", "adult", [
    ["Sit where you always sit", { r: 2, h: 2, mh: 1 }, "Order was maintained. Nothing happened.", "I sat in my usual place in the yard."],
    ["Take a different bench", { r: 9, he: -6, h: 3, heat: 5 }, "Four heads turned. You held the seat.", "I took a different bench in the yard."],
    ["Stand by the wall instead", { mh: 3, ins: -2, r: -2 }, "You saw the whole map from there.", "I watched the yard from the wall."]
  ], 1.2);
  EV("adult_tax", "pl-tax", "Store Order Day", "The sheet goes around the tier. Somebody is collecting more than the price of the goods.", "adult", [
    ["Pay the extra without comment", { h: 2, r: -2, mh: -3, scrip: -8 }, "Your order arrived on time. That was the service.", "I paid the extra on store order day."],
    ["Refuse the extra", { r: 8, he: -8, b: -3, heat: 6, mh: 2 }, "Your order did not arrive. You ate anyway.", "I refused to pay the extra."],
    ["Order nothing this week", { mh: -3, ins: 2, scrip: 5, he: -2 }, "You saved the credit and lost the little comforts.", "I skipped store order day."]
  ], 1.1);
  EV("adult_hearing", "pl-hearing", "A Hearing Down the Hall", "You are not on the list, but you can hear every word through the vent.", "adult", [
    ["Listen carefully", { sm: 4, heat: 2, mh: -3, ins: 2 }, "You learned exactly how they ask the question.", "I listened to a disciplinary hearing."],
    ["Bang on the vent to stop it", { b: -5, heat: 7, r: 3, mh: -2 }, "It got quiet. Then it got worse.", "I interrupted a hearing through the vent."],
    ["Walk to the other end of the tier", { mh: 3, ins: -2, h: 1 }, "You heard nothing and felt better for it.", "I walked away from a hearing."]
  ], 1.0);
  EV("adult_boss", "pl-boss", "A Summons", "Someone you do not know tells you that somebody wants to see you at rec. No name, no reason.", "adult", [
    ["Go", { r: 6, standing: 4, mh: -3, he: -4, heat: 4 }, "It was a five-minute conversation about loyalty.", "I went to the summons at rec."],
    ["Send a polite refusal", { r: -6, mh: 2, ins: -2, heat: 3 }, "It was noted. Politely.", "I refused a summons."],
    ["Bring someone with you", { r: 4, loyalty: 3, he: -2, heat: 5 }, "The conversation was shorter with a witness.", "I brought someone to the summons."]
  ], 1.0);
  EV("adult_pay", "pl-script", "Work Pay Posts", "The detail pay is on the board, except yours is eight scrip short.", "adult", [
    ["Query it at the office", { sm: 2, b: 4, scrip: 8, heat: 2, mh: -1 }, "They found the error. They did not apologise.", "I queried my detail pay."],
    ["Let it go", { h: 2, mh: -2, r: 2 }, "Eight scrip is not worth the queue.", "I let a pay error go."],
    ["Offer to work an extra shift", { scrip: 14, he: -4, b: 5, mh: 1 }, "More than made up for it.", "I worked an extra shift."]
  ], 1.0);
  EV("adult_transfer", "pl-map", "Transfer List", "A name on the board means a bus at dawn and a completely different set of rules.", "adult", [
    ["Ask to be put on it", { mh: 3, heat: 2, b: 3, h: -2 }, "You go on a different list now: the one of people who asked.", "I asked for a transfer."],
    ["Ask to be kept off it", { mh: 2, r: 2, heat: 3 }, "Somebody owed you a favour, apparently.", "I asked to stay at this facility."],
    ["Say nothing", { h: 1, mh: -1 }, "The board changed overnight anyway.", "I ignored the transfer list."]
  ], .9);
  EV("adult_legal", "pl-record", "Law Clerk", "An inmate who has read every volume in the library offers to look at your paperwork.", "adult", [
    ["Let them read it", { sm: 6, b: 4, mh: 4, ins: -3, scrip: -6 }, "There is a date nobody had mentioned. It matters.", "I had a law clerk read my paperwork."],
    ["Pay for a proper letter", { scrip: -14, b: 5, mh: 5, sm: 3 }, "It went out with the right words on it.", "I paid for a legal letter."],
    ["Decline", { mh: -2, sm: 1 }, "You kept the paperwork folded in your pocket.", "I declined the law clerk."]
  ], .9);
  EV("adult_cook", "pl-kitchen", "After the Dinner Shift", "The kitchen is closed but the door is not locked. Somebody is already in there.", "adult", [
    ["Take a portion and go", { he: 3, h: 5, heat: 8, b: -4 }, "Nobody said anything, which is not the same as nobody noticing.", "I took food after the dinner shift."],
    ["Help clean instead", { b: 5, scrip: 6, mh: 2, he: 1 }, "The cook started greeting you by name.", "I helped clean the kitchen."],
    ["Walk past", { mh: 1, ins: -1 }, "Clean hands, empty stomach.", "I walked past the open kitchen."]
  ], .9);
  EV("adult_fight", "pl-war", "A Fight Breaks Out", "Two people, four seconds, and a crowd that forms faster than the officers.", "adult", [
    ["Back away fast", { mh: -3, ins: 2, he: 2, r: -2 }, "You were not in the report. That was the win.", "I backed away from a fight."],
    ["Pull them apart", { r: 9, b: 3, he: -12, mh: 2 }, "You got a name in the good column and a bruised rib.", "I pulled two people apart."],
    ["Shout for the officers", { b: 6, heat: 3, r: -7, mh: -2 }, "It ended quickly. The tier will remember the shout.", "I shouted for officers during a fight."]
  ], 1.0);
  EV("adult_longtimer", "pl-clock", "Somebody Leaves", "A man with twenty-two years in gets his gate slip. Nobody claps. Everybody watches.", "adult", [
    ["Say goodbye properly", { mh: 7, h: 3, ins: -3, r: 2 }, "He told you the exact bus times, which was the real gift.", "I said goodbye to a long-timer."],
    ["Ask him what it is like out there", { sm: 3, mh: -3, ins: 2, h: 1 }, "He said he would write. He did not know how to explain it.", "I asked a long-timer about the outside."],
    ["Stay on the bunk", { mh: -4, ins: 3 }, "The door closing sounded very loud.", "I stayed on my bunk when someone left."]
  ], .9);
  EV("adult_seg", "pl-shu", "The Segregation Door", "You pass the unit on the way to rec. There is a slot in the door at hand height.", "adult", [
    ["Keep walking", { mh: -2, ins: 2 }, "You thought about it for the rest of the day.", "I walked past the segregation unit."],
    ["Slide a note under the door", { heat: 9, mh: 4, r: 4, b: -5 }, "Somebody on the other side took it.", "I slid a note under a segregation door."],
    ["Ask an officer about it", { sm: 2, heat: 3, mh: -2 }, "The answer was one sentence and a look.", "I asked about the segregation unit."]
  ], .9);

  /* --- gang-gated --- */
  EV("gang_dues", "pl-tax", "Dues Are Due", "Somebody stops by the bunk with a list and no sense of humour.", "gang", [
    ["Pay it", { scrip: -10, loyalty: 4, standing: 3, b: 2 }, "Your name got a tick.", "I paid my gang dues."],
    ["Say you will tomorrow", { loyalty: -6, standing: -4, r: -2, mh: -2 }, "Tomorrow arrived sooner than expected.", "I put off my gang dues."],
    ["Refuse", { loyalty: -14, standing: -10, r: 4, he: -10, heat: 6 }, "It was brave. It was also expensive.", "I refused gang dues.", [.4, { he: -18, shu: 12, heat: 14, b: -8 }, "They made an example of it.", "I was punished for refusing dues."]]
  ], 1.2);
  EV("gang_oath", "pl-oath", "A Brother Gets Written Up", "The hearing is tomorrow and the story needs one more voice.", "gang", [
    ["Stand up for him", { loyalty: 12, standing: 8, r: 5, b: -7, heat: 10 }, "The crew noticed. So did the officer.", "I stood up for a brother at a hearing."],
    ["Say you saw nothing", { loyalty: -12, standing: -8, mh: -5, ins: 4 }, "He did not say anything either. That was worse.", "I stayed silent for a brother."],
    ["Tell the truth, which is awkward", { loyalty: -4, b: 8, heat: -6, mh: 3, r: -5 }, "Nobody liked it. It held up.", "I told the truth at a brother's hearing."]
  ], 1.0);
  EV("gang_turf", "pl-turf", "A Turf Marker", "Somebody has scratched a new sign into the wall by the yard gate. It is not yours.", "gang", [
    ["Scratch it out", { turf: 8, r: 6, beef: 14, heat: 7, he: -3 }, "The wall remembered both marks.", "I scratched out a rival turf marker."],
    ["Leave it and report it up", { loyalty: 3, standing: 3, r: -2, heat: 3 }, "It was handled by people above you.", "I reported a rival turf marker."],
    ["Walk past", { turf: -5, r: -4, mh: -2 }, "By the next day it had spread.", "I ignored a rival turf marker."]
  ], 1.0);
  EV("gang_war", "pl-war", "Word From Another Block", "The feud has moved from looks to names. Somebody is going to get hurt at rec.", "gang", [
    ["Go to rec anyway", { r: 10, standing: 8, he: -14, beef: 12, heat: 12 }, "You came back upright. That was the point.", "I went to rec during a gang feud."],
    ["Stay in the cell", { r: -8, loyalty: -6, mh: -4, ins: 3, he: 2 }, "Nobody said anything. Everybody counted it.", "I sat out rec during a gang feud."],
    ["Try to call it off", { beef: -22, standing: 5, mh: 5, r: -3, heat: -5 }, "It held for nine days.", "I talked a feud down."]
  ], 1.1);
  EV("gang_newfish", "pl-fish", "Somebody Wants In", "A new arrival has been asking the right people the wrong questions about your crew.", "gang", [
    ["Vouch for them", { standing: 7, loyalty: 4, r: 3, mh: 2 }, "They got a seat at the table.", "I vouched for a new gang recruit."],
    ["Tell them to earn it", { standing: 4, r: 4, loyalty: 2, heat: 2 }, "They came back a week later with a favour.", "I made a recruit earn it."],
    ["Warn them off", { standing: 2, r: -3, mh: -1, beef: 6 }, "They joined the other crew by Thursday.", "I warned a recruit off."]
  ], .9);
  EV("gang_protection", "pl-protection", "A Request for Protection", "A quiet inmate asks what it would cost to be left alone for a month.", "gang", [
    ["Name a fair price", { scrip: 14, standing: 4, r: 3, mh: 3, heat: 5 }, "They paid. They slept.", "I sold protection at a fair price."],
    ["Name a steep price", { scrip: 28, standing: 6, r: 6, heat: 10, b: -4, ins: 2 }, "They paid. They did not sleep.", "I sold protection at a steep price."],
    ["Refuse the whole thing", { r: -3, standing: -4, mh: 4, ins: -3 }, "They looked relieved and then worried.", "I refused to sell protection."]
  ], .9);
  EV("gang_snitch", "pl-snitch", "A Name in a Report", "Somebody's name is in an officer's notebook. It might be yours. It might be your brother's.", "gang", [
    ["Find out before rec", { sm: 4, heat: 8, loyalty: 5, mh: -3 }, "It was neither of you. This time.", "I checked a report for a name."],
    ["Warn the crew", { loyalty: 8, standing: 5, heat: 9, r: 4, b: -4 }, "Four people changed their plans at once.", "I warned the crew about a report."],
    ["Destroy the notebook", { heat: 28, shu: 22, b: -14, r: 8, standing: 8 }, "Everybody knew who had done it. That was the idea.", "I destroyed an officer's notebook."]
  ], .8);
  EV("gang_boss", "pl-boss", "The Boss Is Watching", "Nothing is said to you all day. That is somehow the loudest thing that happens.", "gang", [
    ["Ask for a job", { standing: 8, loyalty: 3, heat: 4, mh: -2 }, "You got one. It was not small.", "I asked the boss for work."],
    ["Keep your head down", { standing: -2, mh: 2, ins: -2, heat: -4 }, "You were not noticed, which was the plan.", "I kept my head down around the boss."],
    ["Hold the eye a second too long", { r: 8, standing: 5, he: -6, heat: 8, loyalty: -3 }, "He laughed. Nobody else did.", "I held the boss's eye."]
  ], .9);

  /* --- contraband / stash gated --- */
  EV("stash_smell", "pl-search", "A Smell Near the Bunk", "An officer pauses at your door on the way past and says nothing at all.", "stash", [
    ["Move the stash to the vent", { heat: -8, mh: -3, ins: 2 }, "It took an hour and cost you a night's sleep.", "I moved my stash to the vent."],
    ["Sit perfectly still", { heat: 4, mh: -5, ins: 4, b: 2 }, "He moved on. Your heart did not.", "I sat still while an officer paused."],
    ["Offer him your store sheet", { heat: -10, scrip: -6, r: -2, mh: 1 }, "Distraction worked. It was expensive.", "I distracted an officer with my store sheet."]
  ], 1.2);
  EV("stash_offer", "pl-package", "An Offer for Your Stash", "Somebody on the tier will pay well for what you have, today only.", "stash", [
    ["Sell half", { scrip: 30, heat: 8, r: 4, standing: 2 }, "Clean trade. Too clean, maybe.", "I sold half my stash."],
    ["Sell all of it", { scrip: 52, heat: 14, mh: 3, ins: -2 }, "Empty hands, full account.", "I sold my whole stash."],
    ["Decline", { heat: -4, r: -2, mh: 1 }, "You still have it. That is the risk.", "I declined an offer for my stash."]
  ], 1.0);
  EV("stash_cellie", "pl-cell", "Your Cellie Notices", "They are not angry. They are asking what you intend to do about it.", "stash", [
    ["Cut them in", { scrip: 12, r: 5, loyalty: 6, heat: 6, mh: 2 }, "Two people now know. It is safer and less safe.", "I cut my cellie into the stash."],
    ["Move it tonight", { heat: -6, mh: -4, ins: 2 }, "They pretended not to watch.", "I moved the stash after my cellie noticed."],
    ["Tell them it is none of their business", { r: -5, heat: 10, mh: -3, ins: 3 }, "They said nothing. They said it loudly.", "I shut my cellie out over the stash."]
  ], 1.0);
  EV("stash_dog", "pl-search", "A Search Team", "Gloves, a torch, and a handler who is not in a hurry. They start at the far end.", "stash", [
    ["Volunteer to open your cell first", { heat: -12, b: 5, mh: -4, ins: 2 }, "They barely looked. You got lucky.", "I opened my cell first for a search team."],
    ["Wait your turn", { heat: 8, mh: -7, ins: 5 }, "Every minute was longer than the last.", "I waited for the search team."],
    ["Get rid of it now", { scrip: -6, heat: -6, mh: 3, ins: -3, r: -3 }, "Gone is gone. You slept fine.", "I dumped my stash before a search."]
  ], 1.1);
  EV("stash_kite", "pl-kite", "A Kite Under the Door", "A folded square of paper slides in. It is a price list, written in pencil.", "stash", [
    ["Place an order", { scrip: -14, heat: 7, mh: 3, r: 2 }, "It arrived in a laundry fold two days later.", "I ordered from a kite price list."],
    ["Pass it on", { r: 4, heat: -3, b: 2 }, "You are not on the list. You are on the route.", "I passed a kite on."],
    ["Hand it to an officer", { b: 8, heat: -10, r: -12, mh: -3, ins: 3 }, "The tier got colder by evening.", "I handed a kite to an officer."]
  ], .9);
  EV("stash_withdraw", "pl-infirmary", "A Rough Morning", "You have been without the thing you had got used to. Your hands are not steady.", "stash", [
    ["Ask the infirmary for help", { he: 5, mh: 6, ins: -6, b: 4, heat: 3 }, "They wrote it down and gave you something plain.", "I asked the infirmary about a rough morning."],
    ["Work through it at rec", { he: 4, mh: 3, ins: -3 }, "By noon it had passed.", "I worked through a rough morning."],
    ["Find the tier dealer", { heat: 12, mh: -4, ins: 5, scrip: -16, he: -2 }, "It stopped. That is the problem with it.", "I went back to the tier dealer."]
  ], .9);

  /* --- smuggling / route gated --- */
  EV("route_delay", "pl-laundry", "A Cart Held Up", "The laundry cart has been stopped at the gate for twenty minutes. Your parcel is in it.", "route", [
    ["Walk past and say nothing", { heat: 6, mh: -6, ins: 4 }, "It moved eventually. Nobody looked at you.", "I waited out a held-up cart."],
    ["Ask the crew what is happening", { heat: 11, r: 3, sm: 2, mh: -3 }, "Too much interest. That was noted.", "I asked about a held-up cart."],
    ["Create a small distraction", { heat: -8, b: -5, r: 5, he: -3 }, "The cart rolled on while everybody watched the other thing.", "I distracted the gate for a cart."]
  ], 1.1);
  EV("route_contact", "pl-mule", "Word From Outside", "A message arrives through a channel that is not on any form. Somebody wants to know if you are still willing.", "route", [
    ["Say yes", { scrip: 18, heat: 8, mh: 2, standing: 3 }, "A date and a place, in two words.", "I agreed to another run."],
    ["Say not for a while", { heat: -10, mh: 3, ins: -2, scrip: -4 }, "They understood. That was a relief.", "I paused my outside contact."],
    ["Ask for better terms", { scrip: 26, heat: 12, r: 3, sm: 2 }, "They agreed, which means they needed you.", "I renegotiated my outside contact."]
  ], 1.0);
  EV("route_officer", "pl-bribe", "An Officer at the Gate", "He has started checking the crates himself. He also has not written down the last three.", "route", [
    ["Offer him something small", { scrip: -18, heat: -14, b: -3, mh: -2 }, "He looked through you. The crate went through.", "I paid an officer at the gate."],
    ["Change the route for a week", { heat: -8, scrip: -6, mh: 2, ins: -2 }, "Slower, safer, boring.", "I changed my route for a week."],
    ["Run it anyway", { heat: 20, scrip: 24, r: 5, mh: -4, ins: 3 }, "It worked. That is the dangerous part.", "I ran a route under an officer's nose."]
  ], .9);
  EV("route_lost", "pl-drop", "A Drop Goes Missing", "The parcel is not where it was put, and nobody will admit having seen it.", "route", [
    ["Search the area quietly", { heat: 7, mh: -4, ins: 3, scrip: 6 }, "You found half of it under a bench.", "I searched for a missing drop."],
    ["Ask the tier", { r: 5, heat: 9, mh: 2, standing: 2 }, "It came back by evening, minus one item.", "I asked the tier about a missing drop."],
    ["Write the loss off", { mh: 3, ins: -2, scrip: -8 }, "Some weeks cost money.", "I wrote off a lost drop."]
  ], .9);
  EV("route_night", "pl-night", "After Lights Low", "The blind spot near the old tower is exactly where it was described. It is also very quiet.", "route", [
    ["Make the exchange", { scrip: 30, heat: 12, r: 4, mh: -3, ins: 2, he: -2 }, "Two minutes, and then a very long walk back.", "I made a night exchange."],
    ["Go and look, do not touch", { sm: 3, heat: 3, mh: 2, ins: -2 }, "You learned the timing without the risk.", "I scouted a night exchange."],
    ["Turn back at the door", { heat: -6, mh: 3, r: -3 }, "A sensible night. You slept.", "I turned back from a night exchange."]
  ], .9);

  /* --- SHU / segregation gated --- */
  EV("shu_count", "pl-regimen", "The Twenty-Third Hour", "Twenty-three hours in the cell, one out. You have started counting the marks on the wall.", "shu", [
    ["Add today's mark", { mh: 4, ins: -4, sm: 1 }, "There are more than you thought.", "I added a mark in segregation."],
    ["Do not add it", { mh: -5, ins: 4 }, "Not counting made it longer, somehow.", "I stopped counting the days."],
    ["Rub the old marks out", { mh: -3, ins: 5, b: -3 }, "An officer noticed at the next check.", "I rubbed out my wall marks."]
  ], 1.3);
  EV("shu_rec", "pl-cage", "One Hour, Alone", "A concrete cage with a strip of sky above it. Nobody else is brought out at the same time.", "shu", [
    ["Pace the whole hour", { he: 4, mh: 5, ins: -5 }, "Sixty minutes, four walls, one line of sky.", "I paced my recreation hour."],
    ["Do push-ups until your arms fail", { he: 6, lk: 1, mh: 3, ins: -3, h: -1 }, "The hour went faster that way.", "I exercised through my recreation hour."],
    ["Sit and look up", { mh: 9, ins: -8, h: 2 }, "The sky changed colour twice.", "I watched the sky in the concrete cage."],
    ["Refuse to come out", { b: -4, shu: 4, mh: -6, ins: 5 }, "They wrote it down and added days.", "I refused my recreation hour."]
  ], 1.4);
  EV("shu_line", "pl-slip", "Something Under the Door", "A thin line of thread, a scrape, and a small parcel pushed along the floor. Somebody remembered you.", "shu", [
    ["Take it", { mh: 10, h: 8, ins: -6, loyalty: 5, heat: 8, item: 1 }, "A note, a sweet, and a name you are not to say.", "I took a delivery under the door."],
    ["Push it back", { mh: -6, ins: 4, loyalty: -6, heat: -8 }, "They will not try a third time.", "I refused a delivery under the door."],
    ["Call an officer", { b: 8, heat: -12, loyalty: -14, mh: -4, r: -10 }, "The tier heard about it within the hour.", "I reported a delivery under the door."]
  ], 1.2);
  EV("shu_counselor", "pl-counselor", "A Check-In", "A face at the slot. They ask the same three questions, in the same order, every week.", "shu", [
    ["Answer honestly", { mh: 8, ins: -7, b: 4 }, "They wrote more than usual. It might help at the review.", "I answered a segregation check-in honestly."],
    ["Say the expected thing", { mh: 2, ins: -1, b: 2 }, "The visit lasted forty seconds.", "I gave the expected answers at a check-in."],
    ["Ask to come out", { mh: -3, ins: 3, b: 3, sm: 1 }, "They said the review is on such-and-such a date. That was new.", "I asked to leave segregation."]
  ], 1.1);
  EV("shu_noise", "pl-shu", "Voices Through the Vent", "Somewhere down the unit somebody is talking to somebody who is not there. Or is.", "shu", [
    ["Talk back", { mh: 6, ins: -4, h: 3, heat: 3 }, "A whole conversation with a stranger. It helped.", "I talked through the vent in segregation."],
    ["Cover the vent", { mh: -4, ins: 4, h: -2 }, "Quieter. Not better.", "I covered the vent."],
    ["Listen and say nothing", { sm: 2, mh: -2, ins: 2 }, "You learned three names and a date.", "I listened through the vent."]
  ], 1.0);
  EV("shu_tray", "pl-tray-slot", "The Tray Slot", "A tray comes through the slot. Today there is an extra item, and no explanation.", "shu", [
    ["Eat it", { he: 4, h: 6, mh: 4, ins: -3 }, "Somebody on the kitchen detail has a long memory.", "I got an extra item through the tray slot."],
    ["Leave it", { mh: -3, ins: 2, b: 2 }, "You did not want to owe anybody.", "I left the extra tray item."],
    ["Ask the officer about it", { heat: 6, mh: -2, b: 2 }, "He said it was a mistake. He did not take it back.", "I asked about an extra tray item."]
  ], .9);
  EV("shu_appeal", "pl-hearing", "A Review Slip", "A form comes under the door with a date on it and one line for a statement.", "shu", [
    ["Write a careful statement", { b: 6, sm: 3, mh: 5, ins: -4, shu: -4 }, "Two days came off. It was worth the pencil.", "I wrote a segregation review statement."],
    ["Write an angry one", { b: -5, heat: 5, mh: 3, ins: -2, shu: 3 }, "It felt good for eleven minutes.", "I wrote an angry review statement."],
    ["Leave it blank", { mh: -4, ins: 3, shu: 2 }, "The review happened without you.", "I left my review slip blank."]
  ], 1.0);
  EV("shu_sleep", "pl-night", "The Light Stays On", "It is never fully dark in here. You have stopped noticing, which is not the same as being used to it.", "shu", [
    ["Make a shade from the sheet", { he: 2, mh: 5, ins: -4, b: -2 }, "They took it at the next check. You made another.", "I made a shade in segregation."],
    ["Sleep in short pieces", { he: -2, mh: -3, ins: 3 }, "Four hours, in fragments.", "I slept in fragments under the light."],
    ["Stay awake and count", { sm: 2, mh: -5, ins: 5, he: -3 }, "You got to four thousand and lost the thread.", "I stayed awake counting."]
  ], 1.0);
  EV("shu_邻", "pl-cage", "A Name Scratched in the Wall", "Under the paint, someone else's name and a number of days. It is a larger number than yours.", "shu", [
    ["Add yours underneath", { mh: 6, ins: -5, r: 3 }, "A small, stubborn piece of company.", "I added my name to the wall."],
    ["Read it and leave it", { mh: 3, ins: -2, sm: 1 }, "You wondered where they are now.", "I read a name on the segregation wall."],
    ["Scratch it out", { mh: -4, ins: 5, b: -3 }, "It did not make the days shorter.", "I scratched out a name on the wall."]
  ], .8);

  /* --- heat / discipline gated --- */
  EV("heat_watch", "pl-guard", "You Are Being Watched", "Two officers in two different places, both looking at you a beat too long.", "heat", [
    ["Keep everything visible", { heat: -14, b: 5, mh: -3, ins: 2 }, "Boring is the safest thing you can be.", "I kept everything visible while being watched."],
    ["Ask them directly", { heat: -6, sm: 2, r: 2, b: 2, mh: -2 }, "They said 'routine'. You know what routine looks like.", "I asked why I was being watched."],
    ["Move the stash before lights low", { heat: 9, mh: -5, ins: 4 }, "You are now the person who moved something.", "I moved things while being watched."]
  ], 1.2);
  EV("heat_report", "pl-writeup", "A Report Is Filed", "The office window closes. A form with your number on it goes into a tray.", "heat", [
    ["Ask to read it", { sm: 3, b: 3, heat: 3, mh: -1 }, "Mostly accurate, which is worse than wrong.", "I asked to read a filed report."],
    ["Write a response", { b: 5, sm: 3, mh: 4, ins: -3 }, "It goes in the same folder. That still matters.", "I wrote a response to a report."],
    ["Do nothing", { heat: 6, mh: -3, ins: 3 }, "The folder got thicker on its own.", "I ignored a filed report."]
  ], 1.0);
  EV("heat_hearing", "pl-hearing", "Called to a Hearing", "A time, a room, and an officer who will not tell you what it is about.", "heat", [
    ["Go early and wait quietly", { b: 6, heat: -8, mh: 2, ins: -2 }, "It was a minor matter. Your manner did most of the work.", "I went early to a disciplinary hearing."],
    ["Take someone to speak for you", { loyalty: 4, r: 3, b: 3, heat: -4, mh: 2 }, "Two voices are harder to wave away.", "I brought a witness to a hearing."],
    ["Say you were never told", { heat: 10, b: -6, mh: -2, shu: 6 }, "They had the slip with your signature on it.", "I claimed I was never told about a hearing."]
  ], 1.1);
  EV("heat_cleanup", "pl-search", "A Tier Clean-Up", "Everybody out, every bunk stripped. An officer says it is 'routine' before anybody asks.", "heat", [
    ["Help fold the bedding", { b: 5, heat: -9, mh: 1 }, "It got you near the front of the queue.", "I helped with a tier clean-up."],
    ["Stand in line", { mh: -4, ins: 3, heat: 3 }, "Three hours on your feet.", "I stood through a tier clean-up."],
    ["Ask what they are looking for", { heat: 9, sm: 2, mh: -2, r: 3 }, "'You will know if we find it.'", "I asked about a tier clean-up."]
  ], .9);

  /* --- program / commissary / cellie gated --- */
  EV("prog_group", "pl-counselor", "Group Runs Long", "Nobody leaves when the hour is up. The chairs stay in a circle.", "program", [
    ["Say the thing you have not said", { mh: 12, ins: -9, b: 6, h: 3 }, "The room did not fix anything. It got lighter.", "I spoke honestly in group."],
    ["Listen to the person opposite", { mh: 6, ins: -5, sm: 2, r: 3 }, "You heard your own story with different names.", "I listened in group."],
    ["Ask to leave early", { b: -4, mh: -2, ins: 2 }, "They let you. It went in the notes.", "I left group early."]
  ], 1.1);
  EV("prog_cert", "pl-library", "A Certificate", "A sheet of paper with your name spelled correctly. Nobody on the tier claps, but they look.", "program", [
    ["Pin it on the wall", { h: 7, mh: 6, ins: -4, r: 4, lk: 1 }, "It is the only thing in the cell that is yours alone.", "I pinned my certificate up."],
    ["Fold it into your letter home", { mh: 9, ins: -5, b: 4 }, "It came back with a crease and a sentence on the back.", "I sent my certificate home."],
    ["Put it in the folder", { sm: 2, b: 4, mh: 2 }, "The folder is what the board will read.", "I filed my certificate."]
  ], 1.0);
  EV("shop_short", "pl-no-shop", "Commissary Closed", "A sign on the shutter. No reason, no date. The tier has three theories by lunch.", "shop", [
    ["Wait it out", { mh: 3, ins: -2, h: -2, b: 2 }, "It opened again on Thursday.", "I waited out a commissary closure."],
    ["Buy from the tier instead", { scrip: -12, h: 5, heat: 7, r: 3 }, "Twice the price, half the choice.", "I bought from the tier while the store was closed."],
    ["Ask the officer when", { b: 3, heat: 3, mh: 1, sm: 1 }, "'When it opens.'", "I asked about a commissary closure."]
  ], 1.0);
  EV("shop_line", "pl-shop", "Store Queue", "Forty people, one window, and a rumour that the sweet stock is already gone.", "shop", [
    ["Hold your place", { h: 4, mh: 2, b: 2, scrip: 3 }, "You got the last one of what you wanted.", "I held my place in the store queue."],
    ["Sell your place for scrip", { scrip: 9, r: 2, h: 1, b: -2 }, "Somebody else got the last one.", "I sold my place in the store queue."],
    ["Leave and come back tomorrow", { mh: 2, ins: -2, h: -2 }, "Tomorrow had none left at all.", "I left the store queue."]
  ], .9);
  EV("shop_gift", "pl-package", "A Small Gift", "Somebody on the tier hands you something from their own store order, for no stated reason.", "shop", [
    ["Accept it", { h: 8, mh: 7, ins: -4, r: 3 }, "You will find a way to return it.", "I accepted a gift from the tier."],
    ["Accept it and ask what it costs", { mh: 2, ins: -2, sm: 2, r: -2 }, "They laughed. You are still not sure.", "I asked what a gift would cost."],
    ["Give it back gently", { mh: -3, ins: 2, r: -4, b: 2 }, "They nodded and put it away.", "I returned a gift."]
  ], .9);
  EV("cellie_story", "pl-cell", "Cellie's Story", "Out of nowhere, your cellmate tells you how they ended up here. It takes a long time.", "cellie", [
    ["Listen all the way", { mh: 8, ins: -5, r: 5, sm: 2 }, "They had never told it in one piece before.", "I listened to my cellmate's story."],
    ["Tell yours back", { mh: 10, ins: -6, h: 4, r: 4 }, "Two people, one cell, and a much quieter night.", "I told my story back."],
    ["Say you are tired", { mh: -4, ins: 3, r: -5 }, "They stopped mid-sentence and never restarted.", "I cut off my cellmate's story."]
  ], 1.0);
  EV("cellie_favour", "pl-oath", "A Favour Asked", "Nothing big. Just cover the door for ten minutes while they sort something out.", "cellie", [
    ["Do it", { loyalty: 6, r: 5, heat: 7, b: -4, mh: -2 }, "They repaid it before the week was out.", "I covered the door for my cellmate."],
    ["Ask what it is first", { sm: 2, heat: -4, mh: 2, ins: -2 }, "You decided not to. That was allowed.", "I asked what the favour was."],
    ["Refuse", { r: -4, mh: -2, ins: 2 }, "The cell got very tidy and very quiet.", "I refused my cellmate a favour."]
  ], .9);
  EV("cellie_leave", "pl-clock", "Your Cellie Leaves", "A gate slip or a transfer. The bunk is stripped by dinner.", "cellie", [
    ["Help them pack", { mh: 7, r: 4, h: 2, ins: -3 }, "They left you a book and a short note.", "I helped my cellmate pack."],
    ["Say goodbye properly", { mh: 6, ins: -4, h: 3 }, "You meant it. That surprised you.", "I said goodbye to my cellmate."],
    ["Be out at rec", { mh: -4, ins: 3, h: -2 }, "You came back to an empty bunk and no note.", "I missed my cellmate leaving."]
  ], .9);

  var EV_BY = {}; EVENTS.forEach(function (e) { EV_BY[e.id] = e; });

  /* ------------------------------------------------------------------ *
   * 7. STATE — backfilled onto state.prison.life
   * ------------------------------------------------------------------ */
  function fresh(P) {
    return {
      v: CFG.v, juv: !!P.juv, day: 0, heat: 8, scrip: 90,
      stash: { spot: "mattress", items: {}, lastMove: -1 },
      bag: {}, durables: {}, habits: {},
      routes: {}, contacts: [{ n: "a cousin on the outside", rel: 45, type: "family" }],
      gang: null, cellie: null, crew: [],
      shu: null, privileges: { shop: 0, visit: 0, yard: 0 },
      infractions: [], programs: {}, done: [],
      log: [], seen: {}, flags: {},
      stats: { searches: 0, busts: 0, shuTerms: 0, shuDays: 0, deals: 0,
               runs: 0, fishCaught: 0, programsDone: 0, yearsAdded: 0,
               goodsUsed: 0, fights: 0, appeals: 0, hearings: 0 },
      lastAge: -1, lastAllowance: 0, lastRestock: 0, lastReview: 0,
      pending: []
    };
  }

  function S() {
    var P;
    try { P = state.prison; } catch (e) { return null; }
    if (!P) return null;
    var L = P.life;
    if (!L || L.v !== CFG.v) { L = fresh(P); P.life = L; }
    /* backfill missing keys from older builds */
    (function () {
      var d = fresh(P);
      Object.keys(d).forEach(function (k) {
        if (typeof L[k] === "undefined") L[k] = d[k];
      });
      if (!L.stats) L.stats = d.stats;
      Object.keys(d.stats).forEach(function (k) {
        if (typeof L.stats[k] !== "number") L.stats[k] = 0;
      });
      if (!L.privileges) L.privileges = d.privileges;
      if (!Array.isArray(L.log)) L.log = [];
      if (!Array.isArray(L.infractions)) L.infractions = [];
      if (!Array.isArray(L.contacts)) L.contacts = d.contacts;
      if (typeof L.juv !== "boolean") L.juv = !!P.juv;
    })();
    return L;
  }

  function pushLog(L, t) {
    L.log.push({ d: L.day, t: t });
    if (L.log.length > CFG.maxLog) L.log = L.log.slice(-CFG.maxLog);
  }
  function seen(L, id) { return typeof L.seen[id] === "number"; }
  function markSeen(L, id) { L.seen[id] = L.day; }

  /* ------------------------------------------------------------------ *
   * 8. EFFECT ENGINE — one funnel for every consequence
   * ------------------------------------------------------------------ */
  function applyFx(o, opts) {
    if (!o) return;
    opts = opts || {};
    var P = state.prison, L = S();
    if (!P || !L) return;
    var st = state.stats || {};
    var m = null;
    try { m = mindOf(); } catch (e) {}
    function stAdd(k, v) {
      if (!v || typeof st[k] !== "number") return;
      st[k] = clamp(st[k] + v);
    }
    stAdd("Happiness", o.h); stAdd("Health", o.he);
    stAdd("Smarts", o.sm); stAdd("Looks", o.lk);
    if (m) {
      if (o.mh) m.mh = clamp(m.mh + o.mh);
      if (o.ins) m.ins = clamp(m.ins + o.ins);
    }
    if (o.r) P.respect = clamp(P.respect + o.r);
    if (o.b) P.behavior = clamp(P.behavior + o.b);
    if (o.heat) L.heat = clamp(L.heat + o.heat);
    if (o.scrip) L.scrip = Math.max(0, L.scrip + o.scrip);
    if (o.money) { try { state.money = Math.max(0, state.money + o.money); } catch (e) {} }
    if (o.years) { P.years = Math.max(P.served + 1, P.years + o.years); L.stats.yearsAdded += Math.max(0, o.years); }
    if (o.injury) { try { hurt(); } catch (e) {} }
    if (L.gang) {
      if (o.standing) L.gang.standing = Math.max(0, L.gang.standing + o.standing);
      if (o.loyalty) L.gang.loyalty = clamp(L.gang.loyalty + o.loyalty);
      if (o.turf) L.gang.turf = clamp(L.gang.turf + o.turf);
      if (o.beef) {
        var rivals = (typeof GANGS !== "undefined" ? GANGS : []).filter(function (g) { return g[0] !== L.gang.name; });
        if (rivals.length) {
          var rn = pick(rivals)[0];
          L.gang.beef[rn] = clamp((L.gang.beef[rn] || 20) + o.beef);
        }
      }
      if (o.rank) promote(L, o.rank);
      if (o.loyalty && o.loyalty <= -100) dropGang(L, P);
    }
    if (o.shu) {
      if (o.shu > 0) sendShu(L, P, Math.round(o.shu), opts.reason || "a disciplinary finding");
      else if (L.shu) L.shu.days = Math.max(1, L.shu.days + Math.round(o.shu));
    }
    if (o.item && opts.eventId) {
      var g = pick(GOODS.filter(function (x) { return x.juv || !L.juv; }));
      L.bag[g.id] = (L.bag[g.id] || 0) + 1;
    }
    if (o.habit && o.habit !== true) L.habits[o.habit] = (L.habits[o.habit] || 0) + 1;
    if (o.priv && L.privileges[o.priv] !== undefined)
      L.privileges[o.priv] = Math.max(0, L.privileges[o.priv] + (o.privDays || 0));
    if (o.flag) L.flags[o.flag] = true;
    stats();
  }

  function rankIndex(n) {
    for (var i = RANKS.length - 1; i >= 0; i--) if (n >= RANKS[i].min) return i;
    return 0;
  }
  function rankOf(L) {
    if (!L.gang) return null;
    return RANKS[rankIndex(L.gang.standing)];
  }
  function promote(L, steps) {
    if (!L.gang) return;
    var cur = rankIndex(L.gang.standing);
    var want = Math.min(RANKS.length - 1, cur + (steps || 1));
    if (want > cur) L.gang.standing = Math.max(L.gang.standing, RANKS[want].min + 2);
  }
  function dropGang(L, P) {
    var n = L.gang && L.gang.name;
    L.gang = null;
    try { P.gang = null; } catch (e) {}
    if (n) pushLog(L, "I left the " + n + ".");
  }

  /* ------------------------------------------------------------------ *
   * 9. DISCIPLINARY LAW — catch -> hearing -> SHU term
   * ------------------------------------------------------------------ */
  function writeUp(L, P, kind, sev, detail) {
    var rec = { d: L.day, kind: kind, sev: sev, detail: detail || "", resolved: false };
    L.infractions.push(rec);
    if (L.infractions.length > CFG.maxInfractions) L.infractions = L.infractions.slice(-CFG.maxInfractions);
    L.heat = clamp(L.heat + 6 + sev * 4);
    L.stats.busts++;
    pushLog(L, "Written up for " + kind + ".");
    return rec;
  }

  function caught(L, P, kind, sev, detail, onDone) {
    var risk = .22 + L.heat / 260 + sev * .11 - (P.behavior > 70 ? .08 : 0);
    if (L.gang && rankIndex(L.gang.standing) >= 3) risk -= .05;
    risk = cap(risk, .08, .92);
    if (!chance(risk)) {
      L.heat = clamp(L.heat + 7);
      note("Not This Time", "Nobody could prove anything. An officer looked at you for a long moment on the way past.");
      if (onDone) onDone(false);
      return false;
    }
    var rec = writeUp(L, P, kind, sev, detail);
    queue(function () { disciplinary(L, P, rec, onDone); });
    return true;
  }

  function disciplinary(L, P, rec, onDone) {
    L.stats.hearings++;
    var days = rec.sev >= 4 ? ri(45, 110) : rec.sev >= 3 ? ri(24, 60) : rec.sev >= 2 ? ri(12, 30) : ri(5, 16);
    if (L.juv) days = Math.min(CFG.juvShuCap, Math.round(days * .55));
    days = Math.min(CFG.adultShuCap, days);
    L.stats.appeals += 0;
    card({
      tag: L.juv ? "Juvenile Unit" : "Prison", brick: true,
      iconSrc: ICO("pl-hearing"), title: "Disciplinary Hearing", close: true,
      lead: "The officer reads from a short form. <b>" + E(rec.kind) + "</b>. " +
            (rec.detail ? E(rec.detail) + " " : "") +
            "They ask whether you have anything to say before the finding is entered.",
      rows: [["Infraction", E(rec.kind)], ["Severity", rec.sev + " / 5"],
             ["Guard suspicion", Math.round(L.heat) + "%"],
             ["Proposed segregation", days + " days"]],
      bars: [["Behavior", P.behavior], ["Suspicion", L.heat, barColSafe(100 - L.heat)]],
      choices: [
        ["Plead guilty, respectfully", function () {
          closeEv(); sfx();
          var d = Math.max(2, Math.round(days * .7));
          applyFx({ b: 5, heat: -10, r: -2 }, { reason: rec.kind });
          sendShu(L, P, d, rec.kind);
          pushLog(L, "I pleaded guilty at a hearing and took " + d + " days.");
          if (onDone) onDone(true);
        }, "green"],
        ["Deny it", function () {
          closeEv(); sfx();
          if (chance(.42 + P.behavior / 400)) {
            note("Finding: Not Sustained", "The form is put aside. Nobody apologises. You go back to the tier with your record clean on this one.");
            rec.resolved = true; rec.outcome = "dismissed";
            applyFx({ heat: -12, b: 2, mh: 3, ins: -2 }, {});
          } else {
            var d = Math.round(days * 1.2);
            note("Finding: Sustained", "They had more than you thought. The segregation term was increased.");
            sendShu(L, P, d, rec.kind);
            applyFx({ b: -8, heat: 6 }, { reason: rec.kind });
          }
          pushLog(L, "I denied an infraction at a hearing.");
          if (onDone) onDone(true);
        }],
        ["Blame the cellie", function () {
          closeEv(); sfx();
          applyFx({ r: -12, mh: -6, ins: 5, b: -4, heat: 4 }, {});
          var d = Math.max(3, Math.round(days * .8));
          sendShu(L, P, d, rec.kind);
          note("Finding: Sustained", "They wrote the name down. The tier found out before you got back.");
          pushLog(L, "I blamed my cellmate at a hearing.");
          if (onDone) onDone(true);
        }],
        ["Offer a bribe", function () {
          closeEv(); sfx();
          var cost = 40 + rec.sev * 25;
          if (L.scrip >= cost) {
            L.scrip -= cost;
            if (chance(.68)) {
              rec.resolved = true; rec.outcome = "dismissed";
              note("Finding: Not Sustained", "The form is filed under something else. Nobody will discuss it.");
              applyFx({ heat: -16, mh: -3, ins: 2, b: -2 }, {});
            } else {
              note("Worse", "The offer was reported. The segregation term was increased and the bribe is gone.");
              sendShu(L, P, Math.round(days * 1.35), "attempted bribery");
              applyFx({ b: -12, heat: 12, shu: 0 }, {});
            }
          } else {
            note("Not Enough Scrip", "You do not have " + scrStr(cost) + ". The officer waits, then writes.");
            sendShu(L, P, days, rec.kind);
          }
          if (onDone) onDone(true);
        }],
        ["Call a witness", function () {
          closeEv(); sfx();
          var good = (L.gang && L.gang.loyalty > 55) || (L.cellie && L.cellie.rel > 55) || chance(.25);
          if (good) {
            note("Finding: Not Sustained", "Somebody stood up and said the right thing. It held.");
            rec.resolved = true; rec.outcome = "dismissed";
            applyFx({ heat: -14, b: 4, loyalty: 5, mh: 4, ins: -3 }, {});
          } else {
            note("No Witness", "Nobody would speak for you. The finding was entered.");
            sendShu(L, P, days, rec.kind);
          }
          if (onDone) onDone(true);
        }]
      ]
    });
  }

  function barColSafe(v) { try { return barCol(v); } catch (e) { return "#2fa03b"; } }

  /* ------------------------------------------------------------------ *
   * 10. THE SHU — 23/1, no commissary, one hour in the concrete cage,
   *     and brothers fishing items under the door
   * ------------------------------------------------------------------ */
  function sendShu(L, P, days, reason) {
    days = cap(Math.round(days), 1, L.juv ? CFG.juvShuCap : CFG.adultShuCap);
    if (L.shu) {
      L.shu.days += days; L.shu.total += days;
      L.shu.infractions++;
      pushLog(L, "My segregation term was extended by " + days + " days for " + reason + ".");
      note("Term Extended", days + " more days added. " + L.shu.days + " remaining. The regime does not change: twenty-three in, one out.");
      stats(); return;
    }
    L.shu = { days: days, total: days, reason: reason, start: L.day,
              recDone: false, infractions: 0, fish: [], appeals: 0, regime: "23/1" };
    L.stats.shuTerms++;
    L.stats.shuDays += days;
    P.behavior = clamp(P.behavior - 6);
    applyFx({ mh: -6, ins: 5, h: -5, heat: -8 }, {});
    pushLog(L, "I was sent to segregation for " + days + " days after " + reason + ".");
    writeUp(L, P, "segregation order", 3, reason);
    queue(function () {
      whenClearSafe(function () {
        card({
          tag: L.juv ? "Separation Unit" : "Special Housing Unit", brick: true,
          iconSrc: ICO("pl-shu"), title: L.juv ? "Separation" : "The SHU", close: true,
          lead: "A solid door with a slot at hand height. <b>Twenty-three hours in the cell, one hour out</b>, in a concrete cage by yourself. " +
                "No store orders, no visits, no tier. The officer says the term is <b>" + days + " days</b> and then closes the slot.",
          rows: [["Reason", E(reason)], ["Term", days + " days"],
                 ["Regime", "23 / 1"], ["Recreation", "1 hour, alone"],
                 ["Commissary", "Suspended"]],
          choices: [
            ["Take it one day at a time", function () { closeEv(); sfx(); applyFx({ mh: 3, ins: -3, b: 2 }, {}); }, "green"],
            ["Shout at the door", function () { closeEv(); sfx(); applyFx({ r: 3, b: -4, mh: -3, ins: 4, shu: 2 }, {}); note("On the Record", "It went in the unit log. Two days were added."); }],
            ["Ask for the review date", function () { closeEv(); sfx(); applyFx({ sm: 2, mh: 3, ins: -2, b: 2 }, {}); note("Review", "The unit review is on day " + Math.max(7, Math.round(days / 2)) + ". It is written on the slip."); }]
          ]
        });
      });
    });
    stats();
  }

  function leaveShu(L, P, why) {
    if (!L.shu) return;
    var total = L.shu.total;
    var trauma = total >= 30;
    L.shu = null;
    P.behavior = clamp(P.behavior + 5);
    applyFx({ heat: -12, r: trauma ? 6 : 2, mh: trauma ? -4 : 3, ins: trauma ? 5 : -3, h: 3 }, {});
    if (trauma) L.flags.shu_trauma = true;
    pushLog(L, "I came out of segregation after " + total + " days (" + why + ").");
    note("Back on the Tier", "The door opens onto the ordinary noise of the block. " +
      (trauma ? "It takes you a while to walk through it." : "You had forgotten how loud everything is."));
  }

  function shuDay(L, P) {
    if (!L.shu) return;
    var s = L.shu;
    s.days--; s.recDone = false;
    /* 23 hours of nothing costs something */
    var o = { mh: L.juv ? -2 : -3, ins: L.juv ? 1 : 2, he: -1, h: -2 };
    /* durable goods in the cell take the edge off */
    if (L.durables.book) { o.mh = (o.mh || 0) + 3; o.ins = (o.ins || 0) - 3; }
    if (L.durables.puzzle) { o.sm = 2; o.mh = (o.mh || 0) + 2; o.ins = (o.ins || 0) - 2; }
    if (L.flags.stillness) { o.mh = (o.mh || 0) + 4; o.ins = (o.ins || 0) - 4; }
    applyFx(o, {});
    /* a fish line from the crew */
    if (L.gang && L.gang.loyalty >= 40 && chance(.13 + L.gang.loyalty / 700)) {
      var pool = GOODS.filter(function (g) { return g.juv || !L.juv; });
      var g = pick(pool);
      L.bag[g.id] = (L.bag[g.id] || 0) + 1;
      s.fish.push({ d: L.day, item: g.id });
      if (s.fish.length > 24) s.fish = s.fish.slice(-24);
      L.stats.fishCaught++;
      applyFx({ h: 5, mh: 6, ins: -4, loyalty: 2 }, {});
      if (chance(.18)) {
        L.stats.busts++;
        var rec = writeUp(L, P, "a delivery under the door", 3, "A line was seen at the slot.");
        queue(function () { disciplinary(L, P, rec, null); });
      } else {
        queue(function () { note("Under the Door", E(g.n) + ", pushed along the floor on a thread. Somebody out there still counts you in.", '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(g.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>'); });
      }
    }
    if (s.days <= 0) leaveShu(L, P, "term served");
  }

  function whenClearSafe(fn) { try { whenClear(fn); } catch (e) { fn(); } }

  /* ------------------------------------------------------------------ *
   * 11. ECONOMY — commissary, stash, routes, habits
   * ------------------------------------------------------------------ */
  function shopBlocked(L) {
    if (L.shu) return "The commissary is suspended for the whole segregation term. The only thing that reaches you is what somebody pushes under the door.";
    if (L.privileges.shop > 0) return "Store privileges are suspended for " + L.privileges.shop + " more days by a disciplinary finding.";
    if (L.flags.lockdown) return "The block is on lockdown. The shutter is down until it lifts.";
    return null;
  }
  function priceOf(L, g) {
    var p = g.p;
    if (L.heat > 60) p += 2;
    if (P_behavior() < 30) p += 1;
    return Math.max(1, Math.round(p));
  }
  function P_behavior() { try { return state.prison ? state.prison.behavior : 50; } catch (e) { return 50; } }

  function buyGood(L, id) {
    var g = GOOD[id]; if (!g) return false;
    if (L.juv && !g.juv) { note("Not On Your Sheet", "That item is not issued in the juvenile unit."); return false; }
    var blocked = shopBlocked(L);
    if (blocked) { note("Commissary Suspended", blocked); return false; }
    var p = priceOf(L, g);
    if (L.scrip < p) { note("Short on Scrip", "You have " + scrStr(L.scrip) + ". " + E(g.n) + " costs " + scrStr(p) + "."); return false; }
    if ((L.bag[id] || 0) >= 9) { note("Store Limit", "Nine of one item is the weekly limit on this tier."); return false; }
    L.scrip -= p;
    L.bag[id] = (L.bag[id] || 0) + 1;
    L.stats.goodsUsed += 0;
    applyFx({ mh: 1, heat: -1 }, {});
    note("Purchased", E(g.n) + " · " + scrStr(p) + ". It goes on the store sheet and into your locker.");
    pushLog(L, "I bought " + g.n.toLowerCase() + " from the commissary.");
    return true;
  }

  function useGood(L, id) {
    var g = GOOD[id]; if (!g) return false;
    if (!(L.bag[id] > 0)) { note("Nothing Left", "You have no " + E(g.n) + " in your locker."); return false; }
    L.bag[id]--; if (!L.bag[id]) delete L.bag[id];
    L.stats.goodsUsed++;
    var fx = {}; Object.keys(g.fx || {}).forEach(function (k) { fx[k] = g.fx[k]; });
    if (g.habit) fx.habit = g.habit;
    if (g.durable) L.durables[id] = (L.durables[id] || 0) + 1;
    applyFx(fx, {});
    var lines = [];
    if (fx.mh) lines.push("mental health " + (fx.mh > 0 ? "+" : "") + fx.mh);
    if (fx.ins) lines.push("insanity " + (fx.ins > 0 ? "+" : "") + fx.ins);
    if (fx.lk) lines.push("looks " + (fx.lk > 0 ? "+" : "") + fx.lk);
    if (fx.he) lines.push("health " + (fx.he > 0 ? "+" : "") + fx.he);
    if (fx.h) lines.push("happiness " + (fx.h > 0 ? "+" : "") + fx.h);
    if (fx.sm) lines.push("smarts " + (fx.sm > 0 ? "+" : "") + fx.sm);
    note(g.n, E(g.d) + (lines.length ? "<br><br>" + lines.join(" · ") : ""),
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(g.ico) + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
    pushLog(L, "I used " + g.n.toLowerCase() + " from my locker.");
    return true;
  }

  function giftGood(L, id, who) {
    var g = GOOD[id]; if (!g || !(L.bag[id] > 0)) return false;
    L.bag[id]--; if (!L.bag[id]) delete L.bag[id];
    applyFx({ r: 5, mh: 4, ins: -2, loyalty: 4, h: 3 }, {});
    note("A Small Gift", "You gave " + E(who || "someone on the tier") + " " + E(g.n) + ". It will come back around, one way or another.");
    pushLog(L, "I gave away " + g.n.toLowerCase() + ".");
    return true;
  }

  function stashCount(L) {
    var n = 0; Object.keys(L.stash.items).forEach(function (k) { n += L.stash.items[k]; }); return n;
  }
  function stashAdd(L, id, qty) {
    var h = HOTBY[id]; if (!h) return 0;
    var sp = SPOT[L.stash.spot] || SPOTS[0];
    var room = Math.max(0, sp.cap - stashCount(L));
    var put = Math.min(room, qty || 1);
    if (put <= 0) return 0;
    L.stash.items[id] = (L.stash.items[id] || 0) + put;
    L.heat = clamp(L.heat + h.risk * put * .6);
    return put;
  }
  function stashMove(L, spot) {
    if (!SPOT[spot]) return false;
    if (L.shu) { note("No Access", "You cannot reach your hiding place from the segregation unit."); return false; }
    if (L.stash.lastMove === L.day) { note("Already Moved", "You have rearranged it once today. Twice would be noticed."); return false; }
    L.stash.spot = spot; L.stash.lastMove = L.day;
    L.heat = clamp(L.heat - 3);
    pushLog(L, "I moved my stash to " + SPOT[spot].n.toLowerCase() + ".");
    note("Moved", "Everything is now at " + E(SPOT[spot].n) + ". " + E(SPOT[spot].d));
    return true;
  }
  function stashDump(L) {
    var n = stashCount(L);
    L.stash.items = {};
    L.heat = clamp(L.heat - Math.min(28, 5 + n * 3));
    applyFx({ mh: 4, ins: -4, r: -2, b: 2 }, {});
    note("Gone", n ? "You got rid of all of it. Your hands are clean and your account is not." : "There was nothing there.");
    pushLog(L, "I dumped my stash.");
  }
  function sellHot(L, id, all) {
    var h = HOTBY[id]; if (!h || !(L.stash.items[id] > 0)) return false;
    var qty = all ? L.stash.items[id] : 1;
    L.stash.items[id] -= qty; if (!L.stash.items[id]) delete L.stash.items[id];
    var gain = h.v * qty;
    L.scrip += gain; L.stats.deals += qty;
    L.heat = clamp(L.heat + 3 * qty);
    applyFx({ r: 2, b: -2, mh: -1 }, {});
    note("Sold", qty + " × " + E(h.n) + " for " + scrStr(gain) + ". The buyer said nothing and counted twice.",
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(h.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>');
    pushLog(L, "I sold " + h.n.toLowerCase() + " on the tier.");
    return true;
  }
  function useHot(L, id) {
    var h = HOTBY[id]; if (!h || !(L.stash.items[id] > 0)) return false;
    L.stash.items[id]--; if (!L.stash.items[id]) delete L.stash.items[id];
    var fx = {}; Object.keys(h.fx || {}).forEach(function (k) { fx[k] = h.fx[k]; });
    if (h.habit) fx.habit = h.habit;
    applyFx(fx, {});
    if (chance(.22)) {
      caught(L, state.prison, "contraband use", 3, "Somebody smelled it, or said they did.", null);
    }
    note(h.n, E(h.d) + " It is gone now, and so is the evidence.",
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(h.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>');
    pushLog(L, "I used " + h.n.toLowerCase() + ".");
    return true;
  }

  function cellSearch(L, P) {
    L.stats.searches++;
    var sp = SPOT[L.stash.spot] || SPOTS[0];
    var n = stashCount(L);
    var base = CFG.searchBase + L.heat * CFG.searchHeat;
    var p = cap(base * (sp ? sp.risk : 1), .01, .85);
    if (n > 0 && chance(p)) {
      var ids = Object.keys(L.stash.items);
      var id = pick(ids);
      var lost = Math.min(L.stash.items[id], Math.max(1, Math.ceil(n / 2)));
      L.stash.items[id] -= lost; if (!L.stash.items[id]) delete L.stash.items[id];
      var h = HOTBY[id] || { n: "an unlisted item", risk: 3 };
      queue(function () {
        caught(L, P, "contraband found", Math.min(5, 2 + Math.ceil((h.risk || 3) / 2)),
          lost + " × " + h.n + " recovered from " + (sp ? sp.n.toLowerCase() : "the cell") + ".", null);
      });
      pushLog(L, "A cell search found part of my stash.");
      return true;
    }
    L.heat = clamp(L.heat - 2);
    return false;
  }

  function runRoute(L, P, rid, itemId, qty) {
    var r = ROUTE[rid]; if (!r) return false;
    if (L.juv && !r.juv) { note("Not Available Here", "That route does not exist in the juvenile unit."); return false; }
    if (L.shu) { note("No Access", "You cannot run a route from the segregation unit."); return false; }
    var h = itemId ? HOTBY[itemId] : null;
    qty = cap(qty || 1, 1, r.cap);
    if (L.scrip < r.cost) { note("Short on Scrip", "This route costs " + scrStr(r.cost) + " up front."); return false; }
    L.scrip -= r.cost;
    L.stats.runs++;
    L.routes[rid] = (L.routes[rid] || 0) + 1;
    var heatMod = L.heat / 400;
    var loyal = L.gang ? L.gang.loyalty / 500 : 0;
    var pFail = cap(r.risk + heatMod - loyal, .04, .82);
    if (chance(pFail)) {
      L.heat = clamp(L.heat + 14);
      queue(function () {
        caught(L, P, "a smuggling route", Math.min(5, 3 + Math.ceil(r.risk * 5)),
          "The " + r.n.toLowerCase() + " was stopped and searched.", null);
      });
      pushLog(L, "A run on the " + r.n.toLowerCase() + " went wrong.");
      return false;
    }
    var gain = ri(6, 12) * qty;
    L.scrip += gain;
    if (h) {
      var put = stashAdd(L, itemId, qty);
      note("Run Complete", E(r.n) + " came through. " + put + " × " + E(h.n) + " is in your stash, plus " + scrStr(gain) + " in credit.",
        '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(h.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>');
    } else {
      note("Run Complete", E(r.n) + " came through clean. " + scrStr(gain) + " in credit and nothing to hide.");
    }
    L.heat = clamp(L.heat + r.risk * 14);
    applyFx({ mh: 2, ins: -2, r: 2, standing: 3, scrip: 0 }, {});
    pushLog(L, "I ran the " + r.n.toLowerCase() + " route.");
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 12. GANG BUSINESS
   * ------------------------------------------------------------------ */
  function joinGang(L, P, name) {
    if (L.gang) { note("Already Sworn In", "You are with the " + E(L.gang.name) + ". Leaving first would cost you."); return false; }
    var row = (typeof GANGS !== "undefined" ? GANGS : []).filter(function (g) { return g[0] === name; })[0];
    if (!row) return false;
    L.gang = { name: name, standing: 6, loyalty: 45, turf: 18,
               beef: {}, treasury: 0, missions: 0, since: L.day };
    try { P.gang = name; } catch (e) {}
    applyFx({ r: 8, b: -4, heat: 6, mh: 2, ins: 2 }, {});
    pushLog(L, "I joined the " + name + ".");
    note("Sworn In", "You are a <b>Fish</b> in the " + E(name) + ". The worst jobs are yours until they are not.",
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("pl-oath") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
    return true;
  }
  function gangAct(L, P, id) {
    var a = GACT[id]; if (!a || !L.gang) return false;
    if (L.shu) { note("No Access", "Nothing reaches the tier from segregation except a thread under the door."); return false; }
    if (a.need && rankIndex(L.gang.standing) < rankIndex(RANKS.filter(function (r) { return r.id === a.need; })[0].min)) {
      note("Not Yet", "That is " + E(RANKS.filter(function (r) { return r.id === a.need; })[0].n) + " work. Keep showing up.");
      return false;
    }
    if (a.cost && L.scrip < a.cost) { note("Short on Scrip", "This one needs " + scrStr(a.cost) + " up front."); return false; }
    if (a.cost) L.scrip -= a.cost;
    L.gang.missions++;
    var fail = a.risk ? chance(a.risk) : false;
    var fx = fail ? (a.bust || a.fail || {}) : a.fx;
    applyFx(fx, { reason: a.n });
    if (fail && a.bust) {
      var rec = writeUp(L, P, a.n, Math.min(5, 3 + Math.ceil((a.risk || .2) * 4)), "The job went sideways and an officer saw enough.");
      queue(function () { disciplinary(L, P, rec, null); });
      note("It Went Wrong", E(a.n) + " did not go to plan. The finding goes before a hearing.");
    } else if (fail) {
      note("It Went Wrong", E(a.n) + " did not work out. Nobody is talking about it, which is its own problem.");
    } else {
      var rk = rankOf(L);
      note(a.n, "Done. " + (rk ? "You are a <b>" + E(rk.n) + "</b> now." : "") +
        (L.gang ? " Standing " + Math.round(L.gang.standing) + " · Loyalty " + Math.round(L.gang.loyalty) + "." : ""),
        '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(a.ico) + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
      if (rk && rk.id === "boss" && !L.flags.boss) {
        L.flags.boss = true;
        note("Tier Boss", "The block moves a little differently from today. Officers have started using your name.");
      }
    }
    if (id === "leave") dropGang(L, P);
    pushLog(L, (fail ? "Failed: " : "") + a.n + ".");
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 13. PROGRAMS
   * ------------------------------------------------------------------ */
  function enroll(L, id) {
    var p = PROG[id]; if (!p) return false;
    if (L.juv && !p.juv) { note("Not Offered", "That course does not run in the juvenile unit."); return false; }
    if (L.programs[id] && !L.programs[id].done) { note("Already Enrolled", "You are " + L.programs[id].days + " of " + p.days + " days in."); return false; }
    if (L.done.indexOf(id) >= 0) { note("Already Completed", "It is on your record. You can sit in again, but it will not change the file."); return false; }
    if (L.shu) { note("No Access", "Programs do not run in the segregation unit."); return false; }
    if (Object.keys(L.programs).filter(function (k) { return !L.programs[k].done; }).length >= 2) {
      note("Full Timetable", "Two courses at once is the limit on this tier."); return false;
    }
    L.programs[id] = { days: 0, done: false, since: L.day };
    note("Enrolled", E(p.n) + " · " + p.days + " days. " + E(p.d));
    pushLog(L, "I enrolled in " + p.n.toLowerCase() + ".");
    return true;
  }
  function programDay(L, P) {
    Object.keys(L.programs).forEach(function (id) {
      var rec = L.programs[id], p = PROG[id];
      if (!p || rec.done) return;
      rec.days++;
      if (rec.days >= p.days) {
        rec.done = true;
        L.done.push(id);
        L.stats.programsDone++;
        applyFx(p.fx, {});
        if (id === "mindful") L.flags.stillness = true;
        queue(function () { note(p.n + " Complete", E(p.d) + " It is in the folder the review board will read.",
          '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(p.ico) + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>'); });
        pushLog(L, "I completed " + p.n.toLowerCase() + ".");
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 14. THE CLOCK — days, allowance, habits, feuds, events
   * ------------------------------------------------------------------ */
  function gateOk(L, P, g) {
    switch (g) {
      case "": case "night": return true;
      case "juv": return L.juv;
      case "adult": return !L.juv;
      case "gang": return !!L.gang;
      case "shu": return !!L.shu;
      case "stash": return stashCount(L) > 0;
      case "heat": return L.heat >= 35;
      case "program": return Object.keys(L.programs).some(function (k) { return !L.programs[k].done; });
      case "cellie": return !!L.cellie;
      case "shop": return !shopBlocked(L);
      case "route": return Object.keys(L.routes).length > 0;
      default: return true;
    }
  }
  function pickEvent(L, P) {
    if (L.shu) {
      var shuPool = EVENTS.filter(function (e) { return e.gate === "shu"; });
      var s = weighted(shuPool);
      if (s) return s;
    }
    var pool = EVENTS.filter(function (e) {
      if (!gateOk(L, P, e.gate)) return false;
      if (e.gate === "shu") return false;
      if (seen(L, e.id) && L.day - L.seen[e.id] < 26) return false;
      return true;
    });
    return weighted(pool);
  }
  function weighted(pool) {
    if (!pool || !pool.length) return null;
    var total = 0; pool.forEach(function (e) { total += (e.w || 1); });
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) { r -= (pool[i].w || 1); if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function fireEvent(L, P, ev) {
    if (!ev) return;
    markSeen(L, ev.id);
    var choices = ev.c.map(function (c) {
      return [c[0], function () {
        closeEv(); sfx();
        var risk = c[4];
        var fx = c[1], n = c[2], lg = c[3];
        if (risk && chance(risk[0])) { fx = risk[1]; n = risk[2]; lg = risk[3]; }
        applyFx(fx, { reason: ev.t, eventId: ev.id });
        if (lg) sayIt(lg);
        note(ev.t, n, '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(ev.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>');
        stats();
        try { if (screen.classList.contains("open") && sTitle.textContent.indexOf("PRISON LIFE") >= 0) window.openPrisonLife(); } catch (e) {}
      }];
    });
    card({
      tag: L.juv ? "Juvenile Unit" : "Prison", brick: true, iconSrc: ICO(ev.ico),
      title: ev.t, close: true, lead: E(ev.d) + "<br><br>What will you do?",
      choices: choices, surprise: false
    });
  }

  function allowance(L, P) {
    var wage = 0;
    try { if (P.job && P.job[2]) wage = Math.round(P.job[2] * 2.2); } catch (e) {}
    var fam = 0;
    try {
      fam = (state.family || []).filter(function (f) { return !f.dead && (f.rel == null || f.rel >= 35); }).length;
    } catch (e) {}
    var amt = CFG.allowance + wage + Math.min(14, fam * 2);
    if (L.gang) amt += Math.round(L.gang.turf / 8);
    L.scrip += amt;
    L.lastAllowance = L.day;
    queue(function () { note("Store Credit", scrStr(amt) + " posted: detail pay, outside deposit" + (L.gang ? ", crew share" : "") + ".",
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("pl-script") + '" alt="" style="width:44px;height:44px;object-fit:contain"></div>'); });
    pushLog(L, "Store credit of " + amt + " posted.");
  }

  function habitDay(L) {
    Object.keys(L.habits).forEach(function (k) {
      var lv = L.habits[k];
      if (lv <= 0) return;
      if (chance(.30)) {
        applyFx({ mh: -3, ins: 3, he: -2, h: -2 }, {});
        L.habits[k] = Math.max(0, lv - .10);
      } else L.habits[k] = Math.max(0, lv - .03);
      if (L.habits[k] === 0) delete L.habits[k];
    });
  }

  function feudDay(L) {
    if (!L.gang) return;
    Object.keys(L.gang.beef).forEach(function (k) {
      L.gang.beef[k] = clamp(L.gang.beef[k] - .35);
    });
    var hot = Object.keys(L.gang.beef).filter(function (k) { return L.gang.beef[k] >= 72; });
    if (hot.length && chance(.055)) {
      var dmg = ri(8, 22);
      applyFx({ he: -dmg, mh: -4, ins: 4, r: -3, turf: -4 }, {});
      queue(function () { note("The Feud Boils Over", "Somebody caught you alone on the way back from rec. " + dmg + " health, and nobody saw a thing.",
        '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("pl-war") + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>'); });
      pushLog(L, "I was jumped over a gang feud.");
      L.stats.fights++;
    }
  }

  function advance(L, P, days, opts) {
    opts = opts || {};
    var queued = 0, shufreed = false;
    for (var i = 0; i < days; i++) {
      L.day++;
      L.heat = clamp(L.heat - .55);
      if (L.privileges.shop > 0) L.privileges.shop--;
      if (L.privileges.visit > 0) L.privileges.visit--;
      if (L.privileges.yard > 0) L.privileges.yard--;
      if (L.shu) shuDay(L, P);
      programDay(L, P);
      habitDay(L);
      feudDay(L);
      if (L.day - L.lastAllowance >= CFG.allowanceEvery) allowance(L, P);
      if (!L.shu && stashCount(L) > 0 && chance(CFG.searchBase + L.heat * CFG.searchHeat)) cellSearch(L, P);
      if (!L.shu && queued < CFG.maxQueued && chance(CFG.dayChance)) {
        var ev = pickEvent(L, P);
        if (ev) {
          (function (e) { queue(function () { whenClearSafe(function () { fireEvent(L, P, e); }); }); })(ev);
          queued++;
        }
      }
      if (L.shu && queued < CFG.maxQueued && chance(.085)) {
        var se = pickEvent(L, P);
        if (se) { (function (e) { queue(function () { whenClearSafe(function () { fireEvent(L, P, e); }); }); })(se); queued++; }
      }
      if (L.day - L.lastReview >= 30) {
        L.lastReview = L.day;
        var open = L.infractions.filter(function (r) { return !r.resolved; });
        if (open.length >= 3 && chance(.45)) {
          var rec = pick(open);
          (function (rr) { queue(function () { disciplinary(L, P, rr, null); }); })(rec);
          queued++;
        }
      }
    }
    /* lasting effects of long segregation */
    if (L.flags.shu_trauma && !L.flags.trauma_applied) {
      L.flags.trauma_applied = true;
      applyFx({ mh: -4, ins: 4, lk: -2 }, {});
    }
    stats();
    return { days: days, queued: queued };
  }

  /* ------------------------------------------------------------------ *
   * 15. UI — the inside as its own screen tree
   * ------------------------------------------------------------------ */
  var cssDone = false;
  function css() {
    if (cssDone || document.getElementById("plCss")) { cssDone = true; return; }
    var st = document.createElement("style"); st.id = "plCss";
    st.textContent = [
      ".pl-card{background:#1a2337;border:1px solid #2b3852;border-radius:10px;padding:12px 13px;margin:0 0 12px}",
      ".pl-title{color:#8fd6bd;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;margin:0 0 9px}",
      ".pl-note{color:#93a6c4;font-size:12px;line-height:1.55}",
      ".pl-hist{border-left:2px solid #2b3852;padding-left:10px;margin:8px 0;color:#c6d5ea;font-size:12px;line-height:1.55}",
      ".pl-chip{display:inline-block;background:#243250;color:#a9c6ea;border-radius:20px;padding:3px 10px;font-size:11px;margin:2px 4px 2px 0}",
      ".pl-warn{color:#f0a6c8;font-weight:700}",
      ".pl-good{color:#8fd6bd;font-weight:700}",
      ".pl-sec{color:#7f93b3;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;margin:14px 0 6px;font-weight:700}",
      ".pl-bar{display:flex;align-items:center;gap:8px;margin:5px 0;color:#c6d5ea;font-size:12px}",
      ".pl-bar i{flex:1;height:7px;background:#0f1626;border-radius:6px;overflow:hidden;display:block}",
      ".pl-bar u{display:block;height:100%;border-radius:6px;text-decoration:none}",
      ".pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;margin-top:9px}",
      ".pl-lbl{color:#8397b5;font-size:11px}", ".pl-val{color:#eaf2ff;font-size:14px;font-weight:700}",
      ".pl-dis{opacity:.45;filter:grayscale(.5)}"
    ].join("\n");
    document.head.appendChild(st);
    cssDone = true;
  }
  function chev() { try { return typeof CHEV !== "undefined" ? CHEV : ""; } catch (e) { return ""; } }
  function dots() { try { return typeof DOTS !== "undefined" ? DOTS : ""; } catch (e) { return ""; } }
  function kv(k, v) { return '<div><div class="pl-lbl">' + E(k) + '</div><div class="pl-val">' + E(v) + '</div></div>'; }
  function bar(label, v, col) {
    v = clamp(v);
    return '<div class="pl-bar"><span style="width:96px">' + E(label) + '</span><i><u style="width:' +
      Math.max(2, v) + '%;background:' + (col || (v >= 60 ? "#2fa03b" : v >= 30 ? "#e7b34c" : "#b3261e")) + '"></u></i><b style="width:30px;text-align:right">' + Math.round(v) + '</b></div>';
  }
  function r(ico, title, sub, attr, extra) {
    return '<div class="row' + ((extra && extra.cls) ? " " + extra.cls : "") + '" ' + attr + '>' +
      '<img src="' + ICO(ico) + '" alt=""><div class="t"><b>' + title + '</b><span>' + sub + '</span></div>' +
      (extra && extra.icon ? extra.icon : dots()) + '</div>';
  }
  function sec(t) { return '<div class="pl-sec">' + E(t) + '</div>'; }
  function scr(title, html, back) {
    css();
    try {
      sTitle.textContent = title;
      try { sSub.style.display = "none"; } catch (e) {}
      sBack.innerHTML = (typeof BACK_ICON !== "undefined" ? BACK_ICON : "&#8592;");
      sBack.onclick = back || function () { sfx(); window.openPrisonLife(); };
      sList.innerHTML = html;
      sList.scrollTop = 0;
      screen.classList.add("open");
    } catch (e) {}
  }
  function head(L, P) {
    var rk = rankOf(L);
    var m = null; try { m = mindOf(); } catch (e) {}
    return '<div class="pl-card"><div class="pl-title">' + (L.juv ? "Juvenile Unit" : "Prison Life") + ' · Day ' + L.day + '</div>' +
      '<div class="pl-note">' + E(P.name) + ' · ' + E(P.sec) + ' security · ' + E(capFirst(P.crime)) + '</div>' +
      '<div class="pl-grid" style="margin-bottom:8px">' +
        kv("Scrip", Math.round(L.scrip)) + kv("Sentence left", Math.max(1, P.years - P.served) + " yr") +
        kv("Housing", L.shu ? (L.juv ? "Separation" : "The SHU") : "General") +
        kv("Crew", L.gang ? E(L.gang.name) : "None") +
      '</div>' +
      bar("Suspicion", L.heat) + bar("Behavior", P.behavior) + bar("Respect", P.respect) +
      (m ? bar("Mental health", m.mh) + bar("Insanity", m.ins, "#b3261e") : "") +
      (rk ? '<div style="margin-top:8px"><span class="pl-chip">' + E(rk.n) + '</span>' +
             '<span class="pl-chip">Standing ' + Math.round(L.gang.standing) + '</span>' +
             '<span class="pl-chip">Loyalty ' + Math.round(L.gang.loyalty) + '</span></div>' : "") +
      (L.shu ? '<div class="pl-note" style="margin-top:8px"><span class="pl-warn">23 / 1</span> · ' +
        L.shu.days + ' days left · commissary suspended · one hour alone in the concrete cage</div>' : "") +
      '</div>';
  }
  function capFirst(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---- HUB ---- */
  function openPrisonLife() {
    var P = state.prison, L = S();
    if (!P || !L) { note("Prison Life", "This is only available while you are inside."); return; }
    initCrew(L, P);
    var h = head(L, P);
    h += sec("The Clock");
    h += r("pl-clock", "Pass the Day", "One day on the tier. Events, searches, segregation time.", 'data-plife="day"', { icon: chev() });
    h += r("pl-regimen", "Serve a Week", "Seven days at once, with everything that happens in them.", 'data-plife="week"', { icon: chev() });
    h += r("pl-map", "Serve a Month", "Thirty days. Faster, with a short recap at the end.", 'data-plife="month"', { icon: chev() });
    h += sec("The Block");
    h += r("pl-tier", "Housing & Count", "Cell, tier, dorm and standing count.", 'data-plife="block"', { icon: chev() });
    h += r("pl-cell", "Cell & Crew", E(L.cellie ? L.cellie.name : "your cellmate") + ", neighbours and the tier.", 'data-plife="crew"', { icon: chev() });
    h += r("pl-infirmary", "Mind & Body", "Health, mental health, insanity, habits.", 'data-plife="mind"', { icon: chev() });
    h += sec("The Economy");
    h += r("pl-shop", "Commissary", shopBlocked(L) ? '<span class="pl-warn">Suspended</span>' : Math.round(L.scrip) + " scrip · " + GOODS.length + " goods on the sheet", 'data-plife="shop"', { icon: chev(), cls: shopBlocked(L) ? "pl-dis" : "" });
    h += r("pl-package", "My Locker", Object.keys(L.bag).length + " kinds of store goods to use or give away.", 'data-plife="locker"', { icon: chev() });
    h += r("pl-contraband", "The Stash", stashCount(L) + " items hidden at " + E((SPOT[L.stash.spot] || SPOTS[0]).n) + ".", 'data-plife="stash"', { icon: chev() });
    h += r("pl-route", "Smuggling Routes", ROUTES.length + " ways in and out · " + L.stats.runs + " runs made.", 'data-plife="routes"', { icon: chev() });
    h += sec("Politics & Law");
    h += r("pl-gang", "Gang Business", L.gang ? E(L.gang.name) + " · " + E(rankOf(L).n) : "Join a crew, or keep to yourself.", 'data-plife="gang"', { icon: chev() });
    h += r("pl-shu", "The SHU", L.shu ? L.shu.days + " days left · 23/1" : "Segregation unit · not currently assigned.", 'data-plife="shu"', { icon: chev(), cls: L.shu ? "" : "pl-dis" });
    h += r("pl-library", "Programs", L.done.length + " completed · " + Object.keys(L.programs).filter(function (k) { return !L.programs[k].done; }).length + " in progress.", 'data-plife="programs"', { icon: chev() });
    h += r("pl-record", "Disciplinary Record", L.infractions.length + " write-ups · " + L.stats.hearings + " hearings · " + L.stats.shuTerms + " segregation terms.", 'data-plife="record"', { icon: chev() });
    h += sec("Record");
    h += r("pl-record", "Prison Ledger", "Everything that has happened since you came in.", 'data-plife="log"', { icon: chev() });
    h += '<div class="pl-card"><div class="pl-note">Prison days run alongside your life, not one-for-one with calendar years. ' +
      'Anything you are caught with goes before a disciplinary hearing, and a sustained finding means a segregation term on <b>23/1</b>.</div></div>';
    scr("PRISON LIFE", h, function () { sfx(); try { openPrison(); } catch (e) { closeScr(); } });
  }
  window.openPrisonLife = openPrisonLife;

  /* ---- HOUSING / COUNT ---- */
  function openPLBlock() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Housing & Count</div>' +
      '<div class="pl-grid">' + kv("Facility", E(P.name)) + kv("Security", E(P.sec)) +
      kv("Unit", L.juv ? "Juvenile dorm" : "General tier") +
      kv("Cell", L.shu ? "Segregation" : "Shared cell") +
      kv("Behavior", Math.round(P.behavior)) + kv("Suspicion", Math.round(L.heat) + "%") + '</div></div>';
    h += sec("Requests");
    h += r("pl-custody", "Request Protective Custody", "Safer, and the tier never lets you forget it.", 'data-plife="pc"', { icon: chev() });
    h += r("pl-map", "Request a Cell Change", "A fresh bunk, a fresh set of neighbours.", 'data-plife="cellchange"', { icon: chev() });
    h += r("pl-count", "Volunteer for Count Duty", "Be the person holding the clipboard for a week.", 'data-plife="countduty"', { icon: chev() });
    h += r("pl-laundry", "Take a Detail Shift", "Earn scrip and put a line in the good column.", 'data-plife="detail"', { icon: chev() });
    scr("HOUSING & COUNT", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- COMMISSARY ---- */
  function openPLShop() {
    var P = state.prison, L = S(); if (!L) return;
    var blocked = shopBlocked(L);
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Commissary</div>' +
      '<div class="pl-note">' + (blocked ? '<span class="pl-warn">' + E(blocked) + '</span>' :
        "Store sheet · " + Math.round(L.scrip) + " scrip available. Prices move with suspicion and behavior.") + '</div></div>';
    h += sec("Goods on the Sheet");
    GOODS.forEach(function (g) {
      if (L.juv && !g.juv) return;
      var price = priceOf(L, g);
      var owned = L.bag[g.id] || 0;
      var cls = (blocked || L.scrip < price) ? "pl-dis" : "";
      h += r(g.ico, E(g.n) + ' <span class="pl-chip">' + price + "</span>",
        E(g.d) + (owned ? " <b>(" + owned + " in locker)</b>" : ""),
        'data-plife="buy:' + g.id + '"', { icon: chev(), cls: cls });
    });
    h += '<div class="pl-card"><div class="pl-note">Using store goods changes health, looks, smarts, happiness, mental health and insanity. ' +
      "Some form habits. Durable goods keep helping as long as they are in your locker.</div></div>";
    scr("COMMISSARY", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- LOCKER ---- */
  function openPLLocker() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += sec("In the Locker");
    var ids = Object.keys(L.bag).filter(function (k) { return L.bag[k] > 0; });
    if (!ids.length) h += '<div class="pl-card"><div class="pl-note">Empty. Buy something at the commissary, or wait for a delivery under the door.</div></div>';
    ids.forEach(function (id) {
      var g = GOOD[id]; if (!g) return;
      var fx = g.fx || {};
      var bits = [];
      if (fx.mh) bits.push("mind " + (fx.mh > 0 ? "+" : "") + fx.mh);
      if (fx.ins) bits.push("insanity " + (fx.ins > 0 ? "+" : "") + fx.ins);
      if (fx.lk) bits.push("looks " + (fx.lk > 0 ? "+" : "") + fx.lk);
      if (fx.he) bits.push("health " + (fx.he > 0 ? "+" : "") + fx.he);
      if (fx.h) bits.push("mood " + (fx.h > 0 ? "+" : "") + fx.h);
      if (fx.sm) bits.push("smarts " + (fx.sm > 0 ? "+" : "") + fx.sm);
      h += r(g.ico, E(g.n) + ' × ' + L.bag[id], E(bits.join(" · ")) + (L.durables[id] ? " · durable" : ""),
        'data-plife="use:' + id + '"', { icon: chev() });
      h += r("pl-oath", "Give one away", "To " + E(L.cellie ? L.cellie.name : "someone on the tier") + ".",
        'data-plife="gift:' + id + '"', { icon: chev() });
    });
    var dk = Object.keys(L.durables).filter(function (k) { return L.durables[k] > 0; });
    if (dk.length) h += '<div class="pl-card"><div class="pl-note"><b>Durable goods:</b> ' +
      dk.map(function (k) { return E(GOOD[k] ? GOOD[k].n : k); }).join(", ") +
      ". These keep working in segregation when the store is shut.</div></div>";
    scr("MY LOCKER", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- STASH ---- */
  function openPLStash() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    var sp = SPOT[L.stash.spot] || SPOTS[0];
    h += '<div class="pl-card"><div class="pl-title">The Stash</div>' +
      '<div class="pl-note">Hidden at <b>' + E(sp.n) + '</b> · ' + stashCount(L) + ' / ' + sp.cap +
      " items · discovery risk ×" + sp.risk.toFixed(2) + ".<br>" + E(sp.d) + "</div></div>";
    h += sec("Hidden Items");
    var ids = Object.keys(L.stash.items).filter(function (k) { return L.stash.items[k] > 0; });
    if (!ids.length) h += '<div class="pl-card"><div class="pl-note">Nothing hidden. A clean cell is a quiet cell.</div></div>';
    ids.forEach(function (id) {
      var it = HOTBY[id]; if (!it) return;
      h += r(it.ico, E(it.n) + ' × ' + L.stash.items[id],
        "Worth " + it.v + " scrip each · risk " + it.risk + "/5" + (L.juv && !it.juv ? " · not issued here" : ""),
        'data-plife="hot:' + id + '"', { icon: chev() });
    });
    h += sec("Hiding Places");
    SPOTS.forEach(function (s) {
      h += r(s.ico, E(s.n) + (L.stash.spot === s.id ? ' <span class="pl-chip">current</span>' : ""),
        "Risk ×" + s.risk.toFixed(2) + " · holds " + s.cap + " · " + E(s.d),
        'data-plife="spot:' + s.id + '"', { icon: chev() });
    });
    h += sec("Clean Up");
    h += r("pl-no-shop", "Dump Everything", "Get rid of it all and cool the suspicion down.", 'data-plife="dump"', { icon: chev() });
    scr("THE STASH", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- ROUTES ---- */
  function openPLRoutes() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Smuggling Routes</div>' +
      '<div class="pl-note">' + L.stats.runs + " runs made · " + L.contacts.length +
      " outside contact" + (L.contacts.length === 1 ? "" : "s") + ". A stopped route goes before a hearing.</div></div>";
    h += sec("Routes");
    ROUTES.forEach(function (rt) {
      if (L.juv && !rt.juv) return;
      h += r(rt.ico, E(rt.n) + ' <span class="pl-chip">' + rt.cost + " scrip</span>",
        E(rt.d) + " · risk " + Math.round(rt.risk * 100) + "% · holds " + rt.cap +
        (L.routes[rt.id] ? " · " + L.routes[rt.id] + " runs" : ""),
        'data-plife="route:' + rt.id + '"', { icon: chev() });
    });
    h += sec("Outside");
    L.contacts.slice(0, 5).forEach(function (c, i) {
      h += r("pl-mule", E(c.n), "Relationship " + Math.round(c.rel) + " · " + E(c.type),
        'data-plife="contact:' + i + '"', { icon: chev() });
    });
    h += r("pl-letters", "Write for a New Contact", "A letter out, and a name that might write back.", 'data-plife="newcontact"', { icon: chev() });
    scr("SMUGGLING", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- GANG ---- */
  function openPLGang() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    if (!L.gang) {
      h += '<div class="pl-card"><div class="pl-title">Not Affiliated</div><div class="pl-note">' +
        "You eat alone and walk where you like. Joining gives you work, protection and a long list of obligations.</div></div>";
      h += sec("Join a Crew");
      var list = [];
      try { list = (typeof GANGS !== "undefined" ? GANGS : []).slice(); } catch (e) {}
      list.forEach(function (g, i) {
        h += r(ICO(g[1]).replace("prison/", "").replace(".png", ""), E(g[0]),
          "Notoriety " + g[3] + " · " + E(g[2]), 'data-plife="join:' + i + '"', { icon: chev() });
      });
      h += r("pl-beef", "Stay Unaffiliated", "No dues, no wars, and nobody watching your bunk.", 'data-plife="nogang"', { icon: chev() });
    } else {
      var g = L.gang, rk = rankOf(L);
      h += '<div class="pl-card"><div class="pl-title">' + E(g.name) + '</div>' +
        '<div class="pl-grid">' + kv("Rank", E(rk.n)) + kv("Standing", Math.round(g.standing)) +
        kv("Loyalty", Math.round(g.loyalty)) + kv("Turf", Math.round(g.turf) + "%") +
        kv("Missions", g.missions) + kv("Day joined", g.since) + '</div>' +
        bar("Standing", Math.min(100, g.standing / 1.6)) + bar("Loyalty", g.loyalty) + bar("Turf", g.turf) +
        '<div class="pl-note" style="margin-top:8px">' + E(rk.d) + "</div></div>";
      var beefs = Object.keys(g.beef).filter(function (k) { return g.beef[k] > 25; });
      if (beefs.length) {
        h += '<div class="pl-card"><div class="pl-title">Feuds</div>';
        beefs.forEach(function (k) { h += bar(E(k), g.beef[k], "#b3261e"); });
        h += "</div>";
      }
      h += sec("Crew Business");
      GANG_ACTS.forEach(function (a) {
        var locked = a.need && rankIndex(g.standing) < rankIndex(RANKS.filter(function (x) { return x.id === a.need; })[0].min);
        h += r(a.ico,
          E(a.n) + (a.cost ? ' <span class="pl-chip">' + a.cost + " scrip</span>" : ""),
          E(a.d) + (locked ? ' <span class="pl-warn">· ' + E(RANKS.filter(function (x) { return x.id === a.need; })[0].n) + " only</span>" : ""),
          'data-plife="gact:' + a.id + '"', { icon: chev(), cls: locked ? "pl-dis" : "" });
      });
    }
    scr("GANG BUSINESS", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- SHU ---- */
  function openPLShu() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    if (!L.shu) {
      h += '<div class="pl-card"><div class="pl-title">Not Assigned</div><div class="pl-note">' +
        "You are on the general tier. A sustained disciplinary finding sends you here on <b>23/1</b>: " +
        "twenty-three hours in the cell, one hour out, alone, in a concrete cage.</div></div>";
      h += sec("Unit Rules");
      h += r("pl-regimen", "23 / 1", "Twenty-three hours in, one hour out.", 'data-plife="noop"');
      h += r("pl-cage", "Recreation", "One hour alone in a concrete cage with a strip of sky.", 'data-plife="noop"');
      h += r("pl-no-shop", "No Commissary", "The store is closed for the whole term.", 'data-plife="noop"');
      h += r("pl-slip", "The Fish Line", "Crew brothers push small items under the door on a thread.", 'data-plife="noop"');
    } else {
      var s = L.shu;
      h += '<div class="pl-card"><div class="pl-title">' + (L.juv ? "Separation" : "Special Housing Unit") + ' · 23/1</div>' +
        '<div class="pl-grid">' + kv("Days left", s.days) + kv("Term", s.total + " days") +
        kv("Reason", E(capFirst(s.reason))) + kv("Regime", s.regime) +
        kv("Rec today", s.recDone ? "Used" : "Available") + kv("Deliveries", s.fish.length) + '</div>' +
        '<div class="pl-note" style="margin-top:8px">Twenty-three hours in the cell. One hour alone in the concrete cage. ' +
        "The commissary shutter is down for the whole term.</div></div>";
      h += sec("Today");
      h += r("pl-cage", s.recDone ? "Recreation Hour (used)" : "Recreation Hour",
        "One hour, alone, in the concrete cage.", 'data-plife="rec"', { icon: chev(), cls: s.recDone ? "pl-dis" : "" });
      h += r("pl-slip", "The Fish Line", "Ask the brothers for something under the door.", 'data-plife="fish"', { icon: chev() });
      h += r("pl-tray-slot", "The Tray Slot", "Meals come through a slot at hand height.", 'data-plife="tray"', { icon: chev() });
      h += r("pl-counselor", "Unit Check-In", "A face at the slot, three questions, every week.", 'data-plife="checkin"', { icon: chev() });
      h += sec("The Cell");
      h += r("pl-regimen", "Mark Another Day", "Add a line to the wall.", 'data-plife="mark"', { icon: chev() });
      h += r("pl-counselor", "Sit Still", "Twenty minutes of nothing on a hard floor.", 'data-plife="still"', { icon: chev() });
      h += r("pl-kite", "Write a Kite", "A note nobody is supposed to have.", 'data-plife="kite"', { icon: chev() });
      h += r("pl-hearing", "Appeal the Term", "A written review. It can cut days or add them.", 'data-plife="appeal"', { icon: chev() });
      h += r("pl-no-shop", "Commissary", '<span class="pl-warn">Suspended until the term ends.</span>', 'data-plife="shopblocked"', { icon: dots(), cls: "pl-dis" });
      h += sec("Time");
      h += r("pl-clock", "Serve a Day of the Term", "Twenty-three hours, then one.", 'data-plife="shuday"', { icon: chev() });
      h += r("pl-regimen", "Serve a Week of the Term", "Seven days at once.", 'data-plife="shuweek"', { icon: chev() });
    }
    scr(L.juv ? "SEPARATION" : "THE SHU", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- PROGRAMS ---- */
  function openPLPrograms() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Programs</div><div class="pl-note">' +
      L.done.length + " on your record. The review board reads this folder.</div></div>";
    h += sec("Available");
    PROGRAMS.forEach(function (p) {
      if (L.juv && !p.juv) return;
      var rec = L.programs[p.id];
      var sub = rec ? (rec.done ? "Completed" : rec.days + " / " + p.days + " days") :
        (L.done.indexOf(p.id) >= 0 ? "Already completed" : p.days + " days · " + E(p.d));
      h += r(p.ico, E(p.n), sub, 'data-plife="prog:' + p.id + '"',
        { icon: chev(), cls: (rec && !rec.done) ? "pl-dis" : "" });
    });
    scr("PROGRAMS", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- RECORD ---- */
  function openPLRecord() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Disciplinary Record</div>' +
      '<div class="pl-grid">' + kv("Write-ups", L.infractions.length) + kv("Hearings", L.stats.hearings) +
      kv("Segregation terms", L.stats.shuTerms) + kv("Days in segregation", L.stats.shuDays) +
      kv("Cell searches", L.stats.searches) + kv("Years added", L.stats.yearsAdded) + '</div></div>';
    h += sec("Infractions");
    if (!L.infractions.length) h += '<div class="pl-card"><div class="pl-note">Clean record. It will not stay that way if you keep a stash.</div></div>';
    L.infractions.slice().reverse().slice(0, 24).forEach(function (x) {
      h += '<div class="pl-card"><div class="pl-title">Day ' + x.d + ' · ' + E(x.kind) + '</div>' +
        '<div class="pl-hist">Severity ' + x.sev + "/5" + (x.detail ? " · " + E(x.detail) : "") +
        (x.outcome ? " · <b>" + E(x.outcome) + "</b>" : "") + "</div></div>";
    });
    h += sec("Review Readiness");
    var score = Math.round(P.behavior * .55 + L.done.length * 6 + (100 - L.heat) * .2 - L.stats.shuTerms * 4);
    h += '<div class="pl-card">' + bar("Board readiness", clamp(score)) +
      '<div class="pl-note">Behavior, completed programs, suspicion and segregation history all go into the parole board\'s answer.</div></div>';
    scr("DISCIPLINARY RECORD", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ---- CREW / MIND / LEDGER ---- */
  function openPLCrew() {
    var P = state.prison, L = S(); if (!L) return;
    initCrew(L, P);
    var h = head(L, P);
    var c = L.cellie;
    h += '<div class="pl-card"><div class="pl-title">Your Cellmate</div>' +
      '<div class="pl-note"><b>' + E(c.name) + '</b> · ' + (c.gang ? E(c.gang) : "unaffiliated") +
      " · relationship " + Math.round(c.rel) + " · temperament " + Math.round(c.crazy) + "/100</div></div>";
    h += sec("Cellmate");
    h += r("pl-oath", "Talk", "An hour with nothing else to do.", 'data-plife="cellie:talk"', { icon: chev() });
    h += r("pl-package", "Share Your Store Order", "Costs one item, buys a lot of quiet.", 'data-plife="cellie:share"', { icon: chev() });
    h += r("pl-snitch", "Ask Them to Cover for You", "Useful, and now they know something.", 'data-plife="cellie:favour"', { icon: chev() });
    h += r("pl-beef", "Pick a Fight", "Someone will write it down.", 'data-plife="cellie:fight"', { icon: chev() });
    h += sec("The Tier");
    h += r("pl-fish", "Find a New Fish", "Somebody new to show around, or to recruit.", 'data-plife="tierfish"', { icon: chev() });
    h += r("pl-tier", "Ask for a Cell Change", "A different bunk, a different set of problems.", 'data-plife="cellchange"', { icon: chev() });
    scr("CELL & CREW", h, function () { sfx(); window.openPrisonLife(); });
  }

  function openPLMind() {
    var P = state.prison, L = S(); if (!L) return;
    var m = null; try { m = mindOf(); } catch (e) {}
    var h = head(L, P);
    h += '<div class="pl-card"><div class="pl-title">Mind & Body</div>' +
      (m ? bar("Mental health", m.mh) + bar("Insanity", m.ins, "#b3261e") : "") +
      bar("Health", state.stats.Health) + bar("Happiness", state.stats.Happiness) +
      '<div class="pl-note" style="margin-top:8px">Commissary goods, programs, exercise and time in segregation all move these bars. ' +
      "Long segregation leaves a mark that follows you out.</div></div>";
    h += sec("Habits");
    var hk = Object.keys(L.habits);
    if (!hk.length) h += '<div class="pl-card"><div class="pl-note">No dependencies on record.</div></div>';
    hk.forEach(function (k) { h += '<div class="pl-card"><div class="pl-title">' + E(k) + '</div>' + bar("Level", L.habits[k] * 20, "#b3261e") + "</div>"; });
    h += sec("What Helps");
    h += r("pl-weights", "Use the Iron Pile", "Health, looks, sanity.", 'data-plife="exercise"', { icon: chev() });
    h += r("pl-counselor", "Sit Still", "Twenty minutes. Mental health up, insanity down.", 'data-plife="still"', { icon: chev() });
    h += r("pl-infirmary", "Infirmary Window", "Wait the line and get seen.", 'data-plife="infirmary"', { icon: chev() });
    h += r("pl-shop", "Open My Locker", "Use something you already bought.", 'data-plife="locker"', { icon: chev() });
    scr("MIND & BODY", h, function () { sfx(); window.openPrisonLife(); });
  }

  function openPLLog() {
    var P = state.prison, L = S(); if (!L) return;
    var h = head(L, P);
    h += sec("Prison Ledger");
    if (!L.log.length) h += '<div class="pl-card"><div class="pl-note">Nothing recorded yet.</div></div>';
    L.log.slice().reverse().slice(0, 60).forEach(function (x) {
      h += '<div class="pl-card"><div class="pl-title">Day ' + x.d + '</div><div class="pl-hist">' + E(x.t) + "</div></div>";
    });
    h += '<div class="pl-card"><div class="pl-grid">' +
      kv("Goods used", L.stats.goodsUsed) + kv("Deals", L.stats.deals) +
      kv("Runs", L.stats.runs) + kv("Fights", L.stats.fights) +
      kv("Searches", L.stats.searches) + kv("Deliveries", L.stats.fishCaught) + '</div></div>';
    scr("PRISON LEDGER", h, function () { sfx(); window.openPrisonLife(); });
  }

  /* ------------------------------------------------------------------ *
   * 16. ACTION DISPATCH
   * ------------------------------------------------------------------ */
  function withL(fn) {
    var P = state.prison, L = S();
    if (!P || !L) { note("Prison Life", "This is only available while you are inside."); return; }
    initCrew(L, P);
    try { fn(L, P); } catch (e) { note("Something Went Wrong", "Nothing was changed. Try that again."); }
    stats();
  }

  function chooseHot(L, P, rid) {
    var rt = ROUTE[rid]; if (!rt) return;
    var pool = HOT.filter(function (h) { return L.juv ? h.juv : true; });
    card({
      tag: "Smuggling", brick: true, iconSrc: ICO(rt.ico), title: rt.n, close: true,
      lead: E(rt.d) + "<br><br>Up front " + scrStr(rt.cost) + ". Holds " + rt.cap +
        " · risk " + Math.round(rt.risk * 100) + "%. A stopped route means a hearing.",
      rows: [["Scrip", Math.round(L.scrip)], ["Suspicion", Math.round(L.heat) + "%"]],
      choices: [
        ["Credit only (" + rt.cap + " units)", function () { closeEv(); sfx(); runRoute(L, P, rid, null, rt.cap); }, "green"],
        ["Bring one contraband item", function () { closeEv(); sfx(); runRoute(L, P, rid, pick(pool).id, 1); }],
        ["Bring a full load", function () { closeEv(); sfx(); runRoute(L, P, rid, pick(pool).id, rt.cap); }],
        ["Not today", function () { closeEv(); }]
      ]
    });
  }

  function chooseHotItem(L, P, id) {
    var h = HOTBY[id]; if (!h) return;
    card({
      tag: "Contraband", brick: true, iconSrc: ICO(h.ico), title: h.n, close: true,
      lead: E(h.d) + "<br><br>Tier value " + h.v + " scrip each · discovery risk " + h.risk + "/5.",
      rows: [["In stash", L.stash.items[id] || 0], ["Suspicion", Math.round(L.heat) + "%"]],
      choices: [
        ["Use one", function () { closeEv(); sfx(); useHot(L, id); }, "green"],
        ["Sell one", function () { closeEv(); sfx(); sellHot(L, id, false); }],
        ["Sell all of these", function () { closeEv(); sfx(); sellHot(L, id, true); }],
        ["Leave it", function () { closeEv(); }]
      ]
    });
  }

  function recHour(L, P) {
    if (!L.shu) return;
    if (L.shu.recDone) { note("Already Used", "One hour, once a day. That is the whole rule."); return; }
    card({
      tag: L.juv ? "Separation" : "Special Housing Unit", brick: true,
      iconSrc: ICO("pl-cage"), title: "One Hour, Alone", close: true,
      lead: "The door opens onto a concrete cage with a strip of sky above it. Nobody else is brought out at the same time. " +
        "This is the one hour of the twenty-four that is not inside the cell.",
      rows: [["Regime", "23 / 1"], ["Days left", L.shu.days], ["Commissary", "Suspended"]],
      choices: [
        ["Pace the whole hour", function () { closeEv(); sfx(); L.shu.recDone = true; applyFx({ he: 5, mh: 6, ins: -6, h: 2 }, {}); note("One Hour", "Sixty minutes, four walls, one line of sky."); }, "green"],
        ["Work until your arms fail", function () { closeEv(); sfx(); L.shu.recDone = true; applyFx({ he: 8, lk: 2, mh: 3, ins: -4, h: -1 }, {}); note("One Hour", "The hour went faster that way."); }],
        ["Sit and look up", function () { closeEv(); sfx(); L.shu.recDone = true; applyFx({ mh: 11, ins: -9, h: 3 }, {}); note("One Hour", "The sky changed colour twice."); }],
        ["Refuse to come out", function () { closeEv(); sfx(); L.shu.recDone = true; applyFx({ b: -5, mh: -7, ins: 6, shu: 3 }, {}); note("Refused", "They wrote it down and added three days."); }]
      ]
    });
  }

  function fishLine(L, P) {
    if (!L.shu) return;
    var ok = L.gang && L.gang.loyalty >= 35;
    card({
      tag: "The Fish Line", brick: true, iconSrc: ICO("pl-slip"), title: "Under the Door", close: true,
      lead: "A thread, a scrape, and a small parcel pushed along the floor. " +
        (ok ? "Your crew still counts you in." : "You are not sure anybody out there remembers the door.") +
        "<br><br>An officer walking past at the wrong moment turns a gift into another hearing.",
      rows: [["Crew", L.gang ? E(L.gang.name) : "None"], ["Loyalty", L.gang ? Math.round(L.gang.loyalty) : 0],
             ["Days left", L.shu.days]],
      choices: [
        ["Ask for something comforting", function () {
          closeEv(); sfx();
          if (!chance(ok ? .72 : .28)) { note("Nothing Came", "The thread did not appear. Maybe tomorrow."); applyFx({ mh: -3, ins: 2 }, {}); return; }
          var pool = GOODS.filter(function (g) { return (L.juv ? g.juv : true) && (g.fx.mh || 0) > 0; });
          var g = pick(pool.length ? pool : GOODS);
          L.bag[g.id] = (L.bag[g.id] || 0) + 1;
          L.shu.fish.push({ d: L.day, item: g.id });
          L.stats.fishCaught++;
          applyFx({ h: 6, mh: 8, ins: -5, loyalty: 3, heat: 6 }, {});
          if (chance(.20)) {
            var rec = writeUp(L, P, "a delivery under the door", 3, "A line was seen at the slot.");
            queue(function () { disciplinary(L, P, rec, null); });
          } else note("Under the Door", E(g.n) + ", pushed along the floor on a thread.",
            '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(g.ico) + '" alt="" style="width:48px;height:48px;object-fit:contain"></div>');
        }, "green"],
        ["Send a kite back", function () { closeEv(); sfx(); applyFx({ mh: 6, ins: -4, loyalty: 4, heat: 3, sm: 1 }, {}); note("A Kite", "Two words, folded four times, gone along the same thread."); }],
        ["Ignore it", function () { closeEv(); sfx(); applyFx({ mh: -2, ins: 2, heat: -4 }, {}); note("Left Alone", "You did not move. Nothing came."); }],
        ["Call an officer", function () { closeEv(); sfx(); applyFx({ b: 8, heat: -14, loyalty: -16, mh: -5, r: -12, ins: 4 }, {}); note("Reported", "The tier will hear about it before the term ends."); }]
      ]
    });
  }

  function shuAppeal(L, P) {
    if (!L.shu) return;
    L.stats.appeals++;
    card({
      tag: "Unit Review", brick: true, iconSrc: ICO("pl-hearing"), title: "Appeal the Term", close: true,
      lead: "A form, one line for a statement, and a board that meets once a month. " +
        "Days left: <b>" + L.shu.days + "</b>.",
      rows: [["Term", L.shu.total + " days"], ["Behavior", Math.round(P.behavior)],
             ["Programs", L.done.length], ["Prior terms", L.stats.shuTerms]],
      choices: [
        ["Write a careful statement", function () {
          closeEv(); sfx();
          var cut = Math.min(L.shu.days - 1, Math.max(2, Math.round(3 + P.behavior / 22 + L.done.length)));
          L.shu.days -= cut;
          applyFx({ b: 6, sm: 2, mh: 5, ins: -4, heat: -4 }, {});
          note("Review Upheld", cut + " days came off. It is still 23 in, 1 out.");
        }, "green"],
        ["Say the unit is breaking you", function () {
          closeEv(); sfx();
          if (chance(.34)) { var cut2 = Math.min(L.shu.days - 1, ri(4, 10)); L.shu.days -= cut2; applyFx({ mh: 6, ins: -6, b: 2 }, {}); note("Review", "They sent someone to the slot that afternoon. " + cut2 + " days off."); }
          else { applyFx({ mh: -4, ins: 4, b: -3, shu: 2 }, {}); note("Review", "It went in the file as non-cooperation."); }
        }],
        ["Write something angry", function () { closeEv(); sfx(); applyFx({ b: -6, heat: 6, mh: -3, ins: 4, shu: 3 }, {}); note("Review", "Three days added. It felt better for about eleven minutes."); }],
        ["Withdraw it", function () { closeEv(); sfx(); }]
      ]
    });
  }

  function dispatch(key) {
    withL(function (L, P) {
      var parts = key.split(":"), a = parts[0], b = parts[1];
      switch (a) {
        case "day": doAdvance(L, P, 1); break;
        case "week": doAdvance(L, P, CFG.passWeek); break;
        case "month": doAdvance(L, P, CFG.passMonth); break;
        case "block": openPLBlock(); return;
        case "shop": openPLShop(); return;
        case "locker": openPLLocker(); return;
        case "stash": openPLStash(); return;
        case "routes": openPLRoutes(); return;
        case "gang": openPLGang(); return;
        case "shu": openPLShu(); return;
        case "programs": openPLPrograms(); return;
        case "record": openPLRecord(); return;
        case "crew": openPLCrew(); return;
        case "mind": openPLMind(); return;
        case "log": openPLLog(); return;
        case "buy": buyGood(L, b); break;
        case "use": useGood(L, b); break;
        case "gift": giftGood(L, b, L.cellie ? L.cellie.name : "someone on the tier"); break;
        case "spot": stashMove(L, b); break;
        case "dump": stashDump(L); break;
        case "hot": chooseHotItem(L, P, b); return;
        case "route": chooseHot(L, P, b); return;
        case "join": {
          var list = []; try { list = (typeof GANGS !== "undefined" ? GANGS : []); } catch (e) {}
          if (list[+b]) joinGang(L, P, list[+b][0]);
          break;
        }
        case "nogang": note("Unaffiliated", "You keep to yourself. Nobody collects from you, and nobody comes when you need them."); break;
        case "gact": gangAct(L, P, b); break;
        case "prog": enroll(L, b); break;
        case "contact": note("Outside Contact", E((L.contacts[+b] || {}).n || "nobody") + ". They write when they can."); break;
        case "newcontact": {
          var names = ["an old neighbour", "a cousin twice removed", "a friend from school", "your aunt's clerk"];
          var nm = pick(names);
          L.contacts.push({ n: nm, rel: ri(28, 58), type: "outside" });
          applyFx({ mh: 4, ins: -2, heat: 2 }, {});
          note("A Reply", E(nm) + " wrote back. They will help when a route needs an extra pair of hands.");
          break;
        }
        case "rec": recHour(L, P); return;
        case "fish": fishLine(L, P); return;
        case "appeal": shuAppeal(L, P); return;
        case "tray": {
          if (chance(.3)) { applyFx({ he: 4, h: 6, mh: 4, ins: -3 }, {}); note("The Tray Slot", "An extra item today, and no explanation. Somebody in the kitchen remembers you."); }
          else note("The Tray Slot", "The tray comes through, is eaten, and goes back out. That is the whole event.");
          break;
        }
        case "checkin": {
          var pass = chance(.3);
          applyFx({ mh: pass ? 8 : 3, ins: pass ? -7 : -2, b: 3, sm: 1 }, {});
          note("Check-In", pass ? "They wrote more than usual. It might help at the review." : "Three questions, three short answers, forty seconds.");
          break;
        }
        case "mark": applyFx({ mh: 4, ins: -4, sm: 1 }, {}); note("Another Mark", "There are more than you thought."); break;
        case "still": applyFx({ mh: 7, ins: -7, he: 1 }, {}); L.flags.stillness = true; note("Twenty Minutes", "Nothing happened. That was the point."); break;
        case "kite": applyFx({ mh: 5, ins: -4, heat: 4, r: 2 }, {}); note("A Kite", "Folded four times, gone along the floor."); break;
        case "shopblocked": note("Commissary Suspended", "No store orders for the whole segregation term. The only thing that reaches you is what somebody pushes under the door."); break;
        case "shuday": doAdvance(L, P, 1); break;
        case "shuweek": doAdvance(L, P, CFG.passWeek); break;
        case "pc": {
          applyFx({ heat: -22, r: -22, mh: -6, ins: 4, b: 6 }, {});
          note("Protective Custody", "A single cell on a quieter corridor. Safer, and the tier will have a word for it.");
          break;
        }
        case "cellchange": {
          applyFx({ heat: -6, mh: 2, b: 2, r: -3 }, {});
          initCrew(L, P, true);
          note("Cell Change", "New bunk, new neighbour. " + E(L.cellie.name) + " is watching you unpack.");
          break;
        }
        case "countduty": applyFx({ scrip: 12, b: 6, heat: -8, sm: 2, mh: 1 }, {}); note("Count Duty", "A clipboard for a week and a line in the good column."); break;
        case "detail": applyFx({ scrip: ri(10, 18), b: 5, he: -2, mh: 2 }, {}); note("Detail Shift", "Earned, and recorded."); break;
        case "cellie": {
          if (b === "talk") {
            applyFx({ mh: 7, ins: -4, r: 4, h: 3 }, {});
            note("A Long Talk", "An hour with nothing else to do.");
          } else if (b === "share") {
            var ids = Object.keys(L.bag).filter(function (k) { return L.bag[k] > 0; });
            if (ids.length) giftGood(L, pick(ids), L.cellie.name);
            else note("Nothing to Share", "Your locker is empty.");
          } else if (b === "favour") {
            L.cellie.rel = clamp((L.cellie.rel || 40) + 8);
            applyFx({ heat: 7, mh: -2, loyalty: 3, r: 2 }, {});
            note("A Favour", "They will do it. They will also remember that you asked.");
          } else if (b === "fight") {
            L.stats.fights++;
            applyFx({ he: -ri(8, 18), r: 4, b: -9, mh: -4, ins: 4, heat: 12 }, {});
            var rr = writeUp(L, P, "fighting in the cell", 3, "An officer heard it from the corridor.");
            queue(function () { disciplinary(L, P, rr, null); });
            note("It Got Loud", "Somebody always writes it down.");
          }
          break;
        }
        case "tierfish": applyFx({ r: 4, mh: 3, standing: 3, loyalty: 2 }, {}); note("A New Fish", "They will remember who spoke to them first."); break;
        case "exercise": applyFx({ he: 6, lk: 2, mh: 3, ins: -3, h: 2 }, {}); note("Iron Pile", "Your arms remembered something."); break;
        case "infirmary": applyFx({ he: 7, mh: 3, ins: -2, b: 2, heat: 2 }, {}); note("Infirmary", "The line moved. You got seen."); break;
        case "noop": note("Unit Rules", "Twenty-three hours in the cell, one hour alone in the concrete cage, no commissary. A sustained finding is what sends you here."); break;
        default: break;
      }
      refreshCurrent(L, P);
    });
  }

  function refreshCurrent(L, P) {
    try {
      var t = sTitle.textContent || "";
      if (t === "PRISON LIFE") window.openPrisonLife();
      else if (t === "COMMISSARY") openPLShop();
      else if (t === "MY LOCKER") openPLLocker();
      else if (t === "THE STASH") openPLStash();
      else if (t === "SMUGGLING") openPLRoutes();
      else if (t === "GANG BUSINESS") openPLGang();
      else if (t === "THE SHU" || t === "SEPARATION") openPLShu();
      else if (t === "PROGRAMS") openPLPrograms();
      else if (t === "DISCIPLINARY RECORD") openPLRecord();
      else if (t === "CELL & CREW") openPLCrew();
      else if (t === "MIND & BODY") openPLMind();
      else if (t === "PRISON LEDGER") openPLLog();
      else if (t === "HOUSING & COUNT") openPLBlock();
    } catch (e) {}
  }

  function doAdvance(L, P, n) {
    var before = { heat: L.heat, shu: L.shu ? L.shu.days : 0, scrip: L.scrip };
    var r = advance(L, P, n, {});
    var lines = [];
    lines.push(n + (n === 1 ? " day" : " days") + " served");
    if (L.shu) lines.push(L.shu.days + " days of segregation left");
    else if (before.shu) lines.push("out of segregation");
    lines.push(Math.round(L.scrip) + " scrip");
    lines.push("suspicion " + Math.round(L.heat) + "%");
    if (r.queued) lines.push(r.queued + " incident" + (r.queued === 1 ? "" : "s") + " queued");
    note("Time Served", lines.join(" · "));
    pushLog(L, "Served " + n + " days.");
  }

  function initCrew(L, P, force) {
    if (!L.cellie || force) {
      try {
        var n = newInmate();
        L.cellie = { name: n.name, g: n.g, look: n.look, rel: clamp(n.rel + 18),
                     crazy: n.crazy, size: n.size, gang: n.gang || null };
      } catch (e) {
        L.cellie = { name: "R. Vale", g: "m", look: null, rel: 42, crazy: 40, size: 55, gang: null };
      }
      if (force) pushLog(L, "I was moved in with " + L.cellie.name + ".");
    }
  }

  /* ------------------------------------------------------------------ *
   * 17. INTEGRATION — entry points into the base prison screen
   * ------------------------------------------------------------------ */
  CFG.ageDays = 30;

  var installed = false;
  function injectRow() {
    try {
      if (!state.prison) return;
      var host = document.getElementById("sList");
      if (!host || host.querySelector('[data-plife="hub"]')) return;
      var anchor = host.querySelector("#prSurrender");
      var html = '<div class="pl-sec">Prison Life</div>' +
        r("pl-gate", "PRISON LIFE <span class=\"pl-chip\">add-on</span>",
          "Day " + (S() ? S().day : 0) + " · " +
          (S() && S().shu ? "SHU " + S().shu.days + " days · 23/1" :
            "commissary, crews, contraband, routes, segregation"),
          'data-plife="hub"', { icon: chev() });
      if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
      else host.insertAdjacentHTML("beforeend", html);
    } catch (e) {}
  }

  function wrapOpenPrison() {
    var orig = window.openPrison;
    if (typeof orig !== "function") return;
    window.openPrison = function () {
      var out = orig.apply(this, arguments);
      try { injectRow(); } catch (e) {}
      return out;
    };
  }

  function wrapPrisonAction() {
    var orig = window.prisonAction;
    if (typeof orig !== "function") return;
    window.prisonAction = function (key) {
      if (key === "gangs") {
        var L = S();
        if (L) { sfx(); openPLGang(); return; }
      }
      var out = orig.apply(this, arguments);
      try {
        var L2 = S(), P2 = state.prison;
        if (L2 && P2 && (key === "riot" || key === "escape" || key === "bribe")) {
          L2.heat = clamp(L2.heat + 13);
          pushLog(L2, "The tier was talking about " + key + " for days.");
          if (chance(.28)) {
            var rec = writeUp(L2, P2, key, 3, "An officer put two and two together after the incident.");
            queue(function () { disciplinary(L2, P2, rec, null); });
          }
        }
        if (L2 && P2 && key === "escape") {
          /* a failed escape is the fastest route into segregation */
          if (state.prison && chance(.22)) caught(L2, P2, "attempted escape", 5, "A count came up short.", null);
        }
      } catch (e) {}
      return out;
    };
  }

  function wrapGoToPrison() {
    var orig = window.goToPrison;
    if (typeof orig !== "function") return;
    window.goToPrison = function () {
      var out = orig.apply(this, arguments);
      try {
        var P = state.prison, L = S();
        if (!P || !L) return out;
        initCrew(L, P);
        pushLog(L, "I came in to " + P.name + " on a " + P.sec.toLowerCase() + " security sentence.");
        queue(function () {
          note(L.juv ? "Juvenile Unit" : "Prison Life",
            "The inside has its own clock now. Open <b>PRISON LIFE</b> on the prison screen for the commissary, " +
            "crews, contraband, smuggling routes, programs and the segregation unit. " +
            "Get caught and a hearing can put you on <b>23/1</b> in the SHU.",
            '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("pl-gate") + '" alt="" style="width:56px;height:56px;object-fit:contain"></div>');
        });
      } catch (e) {}
      return out;
    };
  }

  function wrapRelease() {
    var orig = window.release;
    if (typeof orig !== "function") return;
    window.release = function () {
      var P = null, L = null;
      try { P = state.prison; L = P && P.life; } catch (e) {}
      var out = orig.apply(this, arguments);
      try {
        if (L && !state.prison) {
          var lines = [];
          lines.push("Day " + L.day + " on the inside.");
          lines.push(L.stats.hearings + " hearings, " + L.stats.shuTerms + " segregation terms, " +
                     L.stats.shuDays + " days in the unit.");
          lines.push(L.done.length + " programs completed, " + L.stats.goodsUsed + " store goods used, " +
                     L.stats.deals + " deals, " + L.stats.runs + " runs.");
          if (L.done.length) applyOutsideFx({ mh: 4, ins: -3, sm: 2 }, L);
          if (L.stats.shuTerms >= 2 || L.flags.shu_trauma) applyOutsideFx({ mh: -8, ins: 9, lk: -3, h: -4 }, L);
          if (L.gang) applyOutsideFx({ r: 5, ins: 2 }, L);
          var habits = Object.keys(L.habits).filter(function (k) { return L.habits[k] > .2; });
          if (habits.length) {
            try { state.prisonHabits = habits.slice(); } catch (e) {}
            applyOutsideFx({ he: -4, mh: -3, ins: 3 }, L);
            lines.push("Dependencies carried out: " + habits.join(", ") + ".");
          }
          try { state.prisonRecord = { day: L.day, terms: L.stats.shuTerms, days: L.stats.shuDays,
                                       programs: L.done.slice(), gang: L.gang ? L.gang.name : null,
                                       infractions: L.infractions.length }; } catch (e) {}
          lines.push("The gate closes behind you. Some of this comes with you.");
          queue(function () { note("Out", lines.join("<br><br>"),
            '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("pl-gate") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>'); });
        }
      } catch (e) {}
      return out;
    };
  }

  function applyOutsideFx(o, L) {
    try {
      var st = state.stats || {}, m = null;
      try { m = mindOf(); } catch (e) {}
      if (o.h && typeof st.Happiness === "number") st.Happiness = clamp(st.Happiness + o.h);
      if (o.he && typeof st.Health === "number") st.Health = clamp(st.Health + o.he);
      if (o.sm && typeof st.Smarts === "number") st.Smarts = clamp(st.Smarts + o.sm);
      if (o.lk && typeof st.Looks === "number") st.Looks = clamp(st.Looks + o.lk);
      if (m) { if (o.mh) m.mh = clamp(m.mh + o.mh); if (o.ins) m.ins = clamp(m.ins + o.ins); }
      if (o.r && typeof state.respect === "number") state.respect = clamp(state.respect + o.r);
      stats();
    } catch (e) {}
  }

  /* Parole reads behavior and respect; our record feeds both naturally.
     Add one explicit nudge so a completed program is worth something at
     the board even if behavior drifted back down. */
  function wrapParoleBoard() {
    var orig = window.paroleBoard;
    if (typeof orig !== "function") return;
    window.paroleBoard = function (e) {
      try {
        var L = S();
        if (L && e) {
          var bonus = Math.min(12, L.done.length * 2);
          var penalty = Math.min(14, L.stats.shuTerms * 2);
          e.behavior = clamp(e.behavior + bonus - penalty);
        }
      } catch (err) {}
      return orig.apply(this, arguments);
    };
  }

  function onAge() {
    try {
      var P = state.prison;
      if (!P || state.dead) return;
      var L = S(); if (!L) return;
      if (L.lastAge === state.age) return;
      L.lastAge = state.age;
      /* A prison year is not 365 prison days: the block runs on its own
         cadence so segregation terms and programs stay playable. */
      if (P.served >= P.years) return;
      advance(L, P, CFG.ageDays, {});
      pushLog(L, "Another year on the sentence. Day " + L.day + ".");
      queue(function () {
        note("Another Year Inside",
          "Day " + L.day + " · " + Math.round(L.scrip) + " scrip · suspicion " + Math.round(L.heat) + "%" +
          (L.shu ? " · " + L.shu.days + " days of segregation left" : "") +
          (L.gang ? " · " + E(L.gang.name) + ", " + E(rankOf(L).n) : "") + ".");
      });
    } catch (e) { /* never break aging */ }
  }

  function delegated(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest("[data-plife]");
    if (!el || !el.getAttribute) return;
    var key = el.getAttribute("data-plife");
    if (!key) return;
    e.preventDefault(); e.stopPropagation();
    sfx();
    if (key === "hub") { openPrisonLife(); return; }
    dispatch(key);
  }

  function install() {
    if (installed) return;
    installed = true;
    css();
    wrapOpenPrison();
    wrapPrisonAction();
    wrapGoToPrison();
    wrapRelease();
    wrapParoleBoard();
    try {
      var ab = document.getElementById("ageBtn");
      if (ab) ab.addEventListener("click", function () { try { onAge(); } catch (e) {} });
    } catch (e) {}
    try {
      var sl = document.getElementById("sList");
      if (sl) sl.addEventListener("click", delegated, true);
    } catch (e) {}
    /* If we loaded while the prison screen is already open, inject now. */
    try { injectRow(); } catch (e) {}
    window.PRISON_LIFE = {
      CFG: CFG, GOODS: GOODS, GOOD: GOOD, HOT: HOT, HOTBY: HOTBY,
      SPOTS: SPOTS, SPOT: SPOT, ROUTES: ROUTES, ROUTE: ROUTE,
      RANKS: RANKS, GANG_ACTS: GANG_ACTS, GACT: GACT,
      PROGRAMS: PROGRAMS, PROG: PROG, EVENTS: EVENTS, EV_BY: EV_BY,
      S: S, fresh: fresh, applyFx: applyFx, rankOf: rankOf, rankIndex: rankIndex,
      sendShu: sendShu, leaveShu: leaveShu, shuDay: shuDay,
      disciplinary: disciplinary, caught: caught, writeUp: writeUp,
      buyGood: buyGood, useGood: useGood, giftGood: giftGood,
      stashAdd: stashAdd, stashMove: stashMove, stashDump: stashDump,
      stashCount: stashCount, sellHot: sellHot, useHot: useHot, cellSearch: cellSearch,
      runRoute: runRoute, joinGang: joinGang, gangAct: gangAct,
      enroll: enroll, programDay: programDay, allowance: allowance,
      pickEvent: pickEvent, fireEvent: fireEvent, advance: advance,
      shopBlocked: shopBlocked, gateOk: gateOk, doAdvance: doAdvance,
      dispatch: dispatch, initCrew: initCrew, injectRow: injectRow,
      onAge: onAge, openPrisonLife: openPrisonLife,
      openPLShop: openPLShop, openPLLocker: openPLLocker, openPLStash: openPLStash,
      openPLRoutes: openPLRoutes, openPLGang: openPLGang, openPLShu: openPLShu,
      openPLPrograms: openPLPrograms, openPLRecord: openPLRecord,
      openPLCrew: openPLCrew, openPLMind: openPLMind, openPLLog: openPLLog,
      openPLBlock: openPLBlock,
      ICO: ICO, E: E
    };
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
