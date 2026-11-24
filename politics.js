/*
 * politics.js — Free Life political career
 * =========================================
 *
 * A complete, self-contained political career loaded after the core game.
 *
 *  • Career ladder: Mayor → Governor → Vice President → President, then a
 *    "Rise Up" route to Sovereign for high office / high military rank / royalty.
 *  • Campaigns: parties, filing fees, war chest, momentum, name recognition,
 *    opponents, polling, eight campaign actions, Election Day resolution.
 *  • In office: approval, term limits, legislation (12 bills), a five-seat
 *    cabinet, press & public, constituent work, five policy control sliders,
 *    scandals, impeachment / recall, reelection and resignation.
 *  • Random events: 34 weighted civic + realm events fired on the yearly tick.
 *  • Sovereign: stewardship projects, ten invented realms to conquer (soldiers,
 *    tribute, backlash), repression decrees with infamy / heat, coalition
 *    armies, disloyal generals and a Tribunal Most Wanted list.
 *
 * All nations, realms, parties and officials are invented. Nothing here is a
 * real place or a real person. State lives on state.politics, which lifeCopy()
 * already deep-copies, so it survives save/load automatically.
 */
(function () {
  if (window.POLITICS) return;

  /* ------------------------------------------------------------------ *
   * Small safe wrappers around globals
   * ------------------------------------------------------------------ */
  function yr() { try { return (state.birthYear || 1990) + (state.age || 0); } catch (e) { return 1990; } }
  function clamp(v, a, b) { a = a == null ? 0 : a; b = b == null ? 100 : b; return Math.max(a, Math.min(b, v)); }
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function chance(p) { return Math.random() < p; }
  function money(n) { try { state.money = Math.max(0, Math.round((state.money || 0) + n)); renderStats(); } catch (e) {} }
  function say(t) { try { window.say(t); } catch (e) {} }
  function note(t, b, cb, force, html) { try { notice(t, b, cb, !!force, html || ""); } catch (e) {} }
  function card(cfg) { try { jCard(cfg); } catch (e) {} }
  function playSfx() { try { play("choice"); } catch (e) {} }
  function usdF(n) { try { return usd(Math.round(n)); } catch (e) { return "$" + Math.round(n).toLocaleString("en-US"); } }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function ICO(n) { return "politics/" + n + ".png"; }
  function later(fn) { setTimeout(fn, 280); }
  function standing() {
    var s = S();
    try {
      return Math.round(clamp(Math.max(state.respect == null ? 30 : state.respect,
        (state.art && state.art.fame) || 0, s.name || 0)));
    } catch (e) { return 30; }
  }
  function hasDegree() { try { return typeof hasUni === "function" ? !!hasUni() : !!(state.degree || (state.degrees || []).length); } catch (e) { return false; } }

  /* ------------------------------------------------------------------ *
   * Fictional geography
   * ------------------------------------------------------------------ */
  var NATIONS = ["the Republic of Aldoria", "the Commonwealth of Viremont", "the Realm of Caldor",
    "the Federation of Estmarch", "the Principality of Norvane", "the Union of Lysoria",
    "the Dominion of Ostraven", "the Free States of Meridia", "the Kingdom of Karsonne",
    "the Concord of Dravenshire"];
  var DISTRICTS = ["Northgate", "Riverbend", "Old Harbour", "Ashfield", "Kingsmead", "Fairhaven",
    "Stonebridge", "Elmwick", "Southmoor", "Highbridge"];

  /* ------------------------------------------------------------------ *
   * Career config
   * ------------------------------------------------------------------ */
  var OFFICES = [
    { id: "mayor", name: "Mayor", tier: 1, pay: 96000, minAge: 25, term: 4, fee: 5000,
      icon: "capitol", body: "City Council", req: { smarts: 35, standing: 25 },
      desc: "Run a city. Build a name, win a first rung on the ladder." },
    { id: "governor", name: "Governor", tier: 2, pay: 158000, minAge: 30, term: 4, fee: 25000,
      icon: "townhall", body: "Regional Assembly", req: { smarts: 45, standing: 42, uni: true, prior: ["mayor"] },
      desc: "Lead a whole region. Requires a university degree and prior office." },
    { id: "vp", name: "Vice President", tier: 3, pay: 232000, minAge: 35, term: 4, fee: 75000,
      icon: "flag", body: "National Assembly", req: { smarts: 52, standing: 58, prior: ["governor"] },
      desc: "Second seat in the nation. A stone's throw from the top." },
    { id: "president", name: "President", tier: 4, pay: 412000, minAge: 40, term: 4, fee: 200000,
      icon: "laurel", body: "National Assembly", req: { smarts: 60, standing: 72, prior: ["vp", "governor"] },
      desc: "Head of state. The highest elected office in the land." }
  ];
  function office(id) { for (var i = 0; i < OFFICES.length; i++) if (OFFICES[i].id === id) return OFFICES[i]; return null; }

  var PARTIES = [
    { id: "civic", name: "Civic Union", icon: "endorse", tag: "Centrist",
      desc: "+6 approval on taking office, steady polling.", fx: { approval: 6 } },
    { id: "freeholder", name: "Freeholder Party", icon: "budget", tag: "Conservative",
      desc: "+25% filing war chest, +3 respect, -2 approval.", fx: { warChest: .25, standing: 3, approval: -2 } },
    { id: "front", name: "People's Front", icon: "protest", tag: "Progressive",
      desc: "+8 public standing, -3 approval with donors.", fx: { standing: 8, approval: -3 } },
    { id: "independent", name: "Independent", icon: "flag", tag: "Unaffiliated",
      desc: "+10 name recognition, no machine behind you.", fx: { name: 10 } }
  ];
  function party(id) { for (var i = 0; i < PARTIES.length; i++) if (PARTIES[i].id === id) return PARTIES[i]; return null; }

  var BILLS = [
    { id: "transit", name: "Transit Expansion Act", icon: "map", cost: 18000, controversy: 12,
      desc: "Fund rail and road links across the districts.", fx: { approval: 5, standing: 3, money: -18000 } },
    { id: "clinics", name: "Public Clinics Bill", icon: "townhall", cost: 26000, controversy: 18,
      desc: "Open free clinics in every district.", fx: { approval: 8, health: 3, money: -26000 } },
    { id: "schools", name: "Education Charter", icon: "bill", cost: 22000, controversy: 10,
      desc: "Raise teacher pay and rebuild schools.", fx: { approval: 6, smarts: 2, money: -22000 } },
    { id: "taxcut", name: "Tax Relief Act", icon: "budget", cost: 4000, controversy: 22,
      desc: "Cut the rate and return money to households.", fx: { approval: 7, money: 9000, standing: -2 } },
    { id: "police", name: "Public Safety Act", icon: "justice", cost: 15000, controversy: 26,
      desc: "Expand the constabulary and court system.", fx: { approval: -2, standing: 5, money: -15000 } },
    { id: "housing", name: "Housing Guarantee", icon: "capitol", cost: 34000, controversy: 20,
      desc: "Guarantee a home for every working family.", fx: { approval: 10, money: -34000 } },
    { id: "green", name: "Clean Rivers Act", icon: "flag", cost: 12000, controversy: 16,
      desc: "Bind industry to strict river standards.", fx: { approval: 4, standing: 4, money: -12000 } },
    { id: "press", name: "Free Press Charter", icon: "press", cost: 6000, controversy: 14,
      desc: "Protect reporters and public records.", fx: { approval: 5, name: 4, money: -6000 } },
    { id: "pensions", name: "Pension Security Bill", icon: "hourglass", cost: 29000, controversy: 12,
      desc: "Index old-age pensions to the cost of living.", fx: { approval: 7, money: -29000 } },
    { id: "trade", name: "Fair Trade Accord", icon: "treaty", cost: 9000, controversy: 18,
      desc: "Open tariff-free trade with neighbouring realms.", fx: { money: 26000, standing: 2, approval: -3 } },
    { id: "termbill", name: "Term Limit Amendment", icon: "gavel", cost: 3000, controversy: 30,
      desc: "Cap all offices at two consecutive terms.", fx: { approval: 9, standing: 6, money: -3000 } },
    { id: "amnesty", name: "Clemency Act", icon: "chains", cost: 5000, controversy: 28,
      desc: "Review old sentences and grant pardons.", fx: { approval: 3, standing: 7, money: -5000 } }
  ];
  function bill(id) { for (var i = 0; i < BILLS.length; i++) if (BILLS[i].id === id) return BILLS[i]; return null; }

  var ROLES = [
    { id: "chief", name: "Chief of Staff", icon: "cabinet", perk: "Approval drift +1/yr" },
    { id: "treasurer", name: "Treasurer", icon: "budget", perk: "Annual revenue +4%" },
    { id: "press", name: "Press Secretary", icon: "pressconf", perk: "Scandal severity -20%" },
    { id: "attorney", name: "Attorney General", icon: "justice", perk: "Investigation heat -3/yr" },
    { id: "defence", name: "Defence Chief", icon: "helmet", perk: "Military loyalty +2/yr" }
  ];
  function role(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i]; return null; }

  var CONTROLS = [
    { id: "tax", name: "Tax Rate", icon: "budget", def: 40, desc: "Higher rates fill the treasury and cost approval." },
    { id: "spend", name: "Public Spending", icon: "funds", def: 45, desc: "Investment lifts approval but drains the treasury." },
    { id: "press", name: "Press Freedom", icon: "press", def: 70, desc: "A free press lifts standing; clamping down builds heat." },
    { id: "military", name: "Military Spending", icon: "swords", def: 40, desc: "Keeps the generals loyal and the legions equipped." },
    { id: "liberty", name: "Civil Liberties", icon: "chains", def: 65, desc: "Liberty lifts approval; removing it feeds resistance." }
  ];
  function control(id) { for (var i = 0; i < CONTROLS.length; i++) if (CONTROLS[i].id === id) return CONTROLS[i]; return null; }

  var REALMS = [
    { id: "aurelian", name: "Aurelian Reach", icon: "map", defence: 24, soldiers: 1800, tribute: 62000, backlash: 7, desc: "A small river confederacy with weak levies." },
    { id: "sable", name: "Sable Coast", icon: "flag", defence: 34, soldiers: 2600, tribute: 96000, backlash: 9, desc: "Rich port cities, but a navy that fights." },
    { id: "karsk", name: "Karsk Basin", icon: "helmet", defence: 45, soldiers: 3600, tribute: 128000, backlash: 12, desc: "Hardy highland levies behind mountain passes." },
    { id: "meridian", name: "Meridian Isles", icon: "treaty", defence: 40, soldiers: 3100, tribute: 142000, backlash: 11, desc: "An island league with a formidable fleet." },
    { id: "varkesh", name: "Varkesh Highlands", icon: "swords", defence: 55, soldiers: 4600, tribute: 168000, backlash: 14, desc: "Fortress keeps and a long warrior tradition." },
    { id: "thalassa", name: "Thalassa Strait", icon: "map", defence: 62, soldiers: 5300, tribute: 196000, backlash: 16, desc: "Controls every ship that passes the narrows." },
    { id: "ostmark", name: "Ostmark Plain", icon: "crown", defence: 68, soldiers: 6000, tribute: 224000, backlash: 18, desc: "Heavy cavalry across open farmland." },
    { id: "valdora", name: "Valdora Cliffs", icon: "prison", defence: 74, soldiers: 6800, tribute: 252000, backlash: 19, desc: "A natural fortress, nearly impossible to storm." },
    { id: "nyvoria", name: "Nyvoria Fen", icon: "storm", defence: 82, soldiers: 7600, tribute: 286000, backlash: 21, desc: "Marshes that swallow armies whole." },
    { id: "caldria", name: "Caldria Reach", icon: "laurel", defence: 92, soldiers: 9000, tribute: 340000, backlash: 24, desc: "The strongest realm on the map. Conquer it and they will never forget." }
  ];
  function realm(id) { for (var i = 0; i < REALMS.length; i++) if (REALMS[i].id === id) return REALMS[i]; return null; }

  var PROJECTS = [
    { id: "granaries", name: "Open the Granaries", icon: "funds", cost: 30000, desc: "Release the reserve in a lean year.", fx: { approval: 9, resistance: -6, standing: 3 } },
    { id: "works", name: "Great Public Works", icon: "capitol", cost: 80000, desc: "Roads, bridges and aqueducts.", fx: { approval: 7, standing: 6, resistance: -3 } },
    { id: "charter", name: "Reform Charter", icon: "bill", cost: 45000, desc: "Write a constitution that limits your own power.", fx: { approval: 11, standing: 9, infamy: -8, resistance: -8 } },
    { id: "amnesty", name: "Grant Amnesty", icon: "chains", cost: 20000, desc: "Pardon dissenters and empty the cells.", fx: { approval: 6, infamy: -6, heat: -12, resistance: -10 } },
    { id: "envoys", name: "Diplomatic Corps", icon: "treaty", cost: 55000, desc: "Send envoys to calm the coalition.", fx: { standing: 8, resistance: -12, infamy: -4 } },
    { id: "schools", name: "Realm Schools", icon: "townhall", cost: 65000, desc: "Teach every child in the provinces.", fx: { approval: 8, smarts: 3, resistance: -5, standing: 5 } }
  ];
  function project(id) { for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i]; return null; }

  var DECREES = [
    { id: "secret", name: "Secret Police", icon: "dossier", desc: "Plain-clothed watchers in every district.", fx: { loyalty: 4, infamy: 6, heat: 5, resistance: 5, approval: -5, money: 14000 } },
    { id: "censor", name: "Censor the Press", icon: "press", desc: "Licence every printer and close hostile sheets.", fx: { infamy: 4, heat: 4, resistance: 4, approval: -4, money: 6000 } },
    { id: "decrees", name: "Emergency Decrees", icon: "gavel", desc: "Rule by proclamation instead of assembly.", fx: { loyalty: 3, infamy: 5, heat: 6, resistance: 6, approval: -6, money: 18000 } },
    { id: "trials", name: "Show Trials", icon: "justice", desc: "Public hearings for accused rivals.", fx: { infamy: 8, heat: 8, resistance: 7, approval: -8, money: 11000 } },
    { id: "purge", name: "Purge the Court", icon: "exile", desc: "Dismiss officers whose loyalty is in doubt.", fx: { loyalty: 8, infamy: 9, heat: 9, resistance: 9, approval: -9, money: 22000 } },
    { id: "seal", name: "Seal the Borders", icon: "prison", desc: "Nobody leaves or enters without a warrant.", fx: { loyalty: 2, infamy: 5, heat: 5, resistance: 6, approval: -7, money: 9000 } }
  ];
  function decree(id) { for (var i = 0; i < DECREES.length; i++) if (DECREES[i].id === id) return DECREES[i]; return null; }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  function fresh() {
    var ctl = {};
    CONTROLS.forEach(function (c) { ctl[c.id] = c.def; });
    return {
      nation: pick(NATIONS), district: pick(DISTRICTS),
      office: null, party: null, held: [], terms: 0, termEnd: 0, termYears: 0, termEvent: false,
      approval: 50, name: 12, warChest: 0, heat: 0, controversy: 0,
      cabinet: {}, bills: [], enacted: [], polls: [],
      scandal: null, cooldown: 0, houseArrest: 0,
      campaign: null, controls: ctl,
      sovereign: null, lastTick: -1, lastEventYr: -1,
      history: [], legacy: []
    };
  }
  function S() { try { return state.politics || (state.politics = fresh()); } catch (e) { return fresh(); } }
  function logIt(t) {
    var s = S(); s.history.push({ y: yr(), t: String(t) });
    if (s.history.length > 140) s.history = s.history.slice(-140);
  }

  /* ------------------------------------------------------------------ *
   * Effect applier
   * ------------------------------------------------------------------ */
  function fx(o) {
    if (!o) return;
    var s = S(), sv = s.sovereign;
    try {
      if (o.money) money(o.money);
      if (o.approval != null) { s.approval = clamp(s.approval + o.approval); if (sv) sv.approval = clamp((sv.approval == null ? 60 : sv.approval) + o.approval); }
      if (o.standing != null) state.respect = clamp((state.respect == null ? 40 : state.respect) + o.standing);
      if (o.name != null) s.name = clamp(s.name + o.name);
      if (o.warChest != null) s.warChest = Math.max(0, Math.round(s.warChest + o.warChest));
      if (o.momentum != null && s.campaign) s.campaign.momentum = clamp(s.campaign.momentum + o.momentum);
      if (o.heat != null) { s.heat = clamp(s.heat + o.heat); if (sv) sv.heat = clamp(sv.heat + o.heat); }
      if (o.controversy != null) s.controversy = clamp((s.controversy || 0) + o.controversy);
      if (o.smarts != null) state.stats.Smarts = clamp((state.stats.Smarts || 0) + o.smarts);
      if (o.happiness != null) state.stats.Happiness = clamp((state.stats.Happiness || 0) + o.happiness);
      if (o.health != null) state.stats.Health = clamp((state.stats.Health || 0) + o.health);
      if (o.infamy != null && sv) sv.infamy = clamp(sv.infamy + o.infamy);
      if (o.resistance != null && sv) sv.resistance = clamp(sv.resistance + o.resistance);
      if (o.loyalty != null && sv) sv.loyalty = clamp(sv.loyalty + o.loyalty);
      if (o.soldiers != null && sv) sv.soldiers = Math.max(0, Math.round(sv.soldiers + o.soldiers));
      if (o.scandal) pendingScandal(o.scandal);
      renderStats();
    } catch (e) {}
  }
  function pendingScandal(kind) {
    var s = S();
    s.scandal = { kind: kind, severity: ri(35, 70), year: yr() };
    logIt("A scandal broke: " + kind + ".");
  }

  /* ------------------------------------------------------------------ *
   * Office installation / removal
   * ------------------------------------------------------------------ */
  function installJob(o, isSovereign) {
    try {
      var s = S();
      if (state.job && state.job.t) say("I left my post as " + state.job.t + ".");
      var j = {
        t: isSovereign ? "Sovereign" : o.name,
        c: "Government", pay: isSovereign ? 1200000 : o.pay,
        emp: s.nation, icon: ICO(isSovereign ? "crown" : o.icon),
        ladder: [{ t: isSovereign ? "Sovereign" : o.name, pay: isSovereign ? 1200000 : o.pay, c: "Government" }],
        rank: 0, perf: 50, yrs: 0, worked: false, asked: false,
        startMonths: 12, payYears: 0, group: null, coworkers: [],
        kind: "fulltime", pol: isSovereign ? "sovereign" : o.id
      };
      state.job = j;
      try { renderAvatar(); } catch (e) {}
      try {
        state.art = state.art || {}; state.art.fameOn = true;
        state.art.fame = Math.max(state.art.fame || 0, isSovereign ? 95 : 35 + o.tier * 13);
      } catch (e) {}
      try { renderStats(); } catch (e) {}
    } catch (e) {}
  }
  function takeOffice(o, reelected) {
    var s = S();
    s.office = o.id;
    if (s.held.indexOf(o.id) < 0) s.held.push(o.id);
    s.terms = reelected ? (s.terms + 1) : 1;
    s.termEnd = yr() + o.term; s.termYears = 0; s.termEvent = false;
    s.approval = clamp(52 + ri(-6, 12));
    s.warChest = Math.max(0, Math.round(s.warChest * .35));
    s.campaign = null;
    installJob(o, false);
    logIt((reelected ? "Re-elected " : "Elected ") + o.name + " of " + s.nation + ".");
    say("I was " + (reelected ? "re-elected " : "elected ") + o.name + ".");
  }
  function leaveOffice(reason) {
    var s = S(), o = office(s.office);
    if (o) logIt("Left the office of " + o.name + " (" + reason + ").");
    s.office = null; s.campaign = null; s.termEvent = false; s.terms = 0;
    try { state.job = null; renderAvatar(); renderStats(); } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * Eligibility
   * ------------------------------------------------------------------ */
  function eligible(o) {
    var s = S(), r = [];
    if (state.dead || state.prison) r.push("You must be alive and free");
    if (state.age < o.minAge) r.push("Age " + o.minAge + " (you are " + state.age + ")");
    if ((state.money || 0) < o.fee) r.push("Filing fee " + usdF(o.fee));
    if ((state.stats.Smarts || 0) < o.req.smarts) r.push("Smarts " + o.req.smarts + "% (you have " + Math.round(state.stats.Smarts || 0) + "%)");
    if (standing() < o.req.standing) r.push("Public standing " + o.req.standing + " (you have " + standing() + ")");
    if (o.req.uni && !hasDegree()) r.push("A university degree");
    if (o.req.prior && !o.req.prior.some(function (p) { return s.held.indexOf(p) >= 0; }))
      r.push("Previously held: " + o.req.prior.map(function (p) { return (office(p) || {}).name; }).join(" or "));
    if (s.cooldown > yr()) r.push("Election cooldown until " + s.cooldown);
    if (s.houseArrest > yr()) r.push("Under house arrest until " + s.houseArrest);
    return { ok: r.length === 0, reasons: r };
  }
  function canRise() {
    var s = S();
    if (s.sovereign || state.dead || state.prison || s.houseArrest > yr()) return false;
    if (s.office === "president") return true;
    if (s.office === "vp") return true;
    if (s.office === "governor" && s.terms >= 2) return true;
    var j = state.job;
    if (j && /military|army|navy|marine|air force|coast guard|general|admiral|colonel|marshal/i.test((j.c || "") + " " + (j.t || "")) &&
        ((j.rank || 0) >= 5 || /general|admiral|colonel|marshal|commander/i.test(j.t || ""))) return true;
    try { if (state.royal && !state.royal.abdicated && /monarch|prince|princess/i.test(state.royal.rank || "")) return true; } catch (e) {}
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Campaigns
   * ------------------------------------------------------------------ */
  function opponentFor(o) {
    var g = chance(.5) ? "m" : "f", nm = "";
    try { nm = uname(g) + " " + (typeof ulast === "function" ? ulast() : "Vane"); } catch (e) { nm = "Marlow Vane"; }
    return { name: nm, strength: clamp(34 + o.tier * 7 + ri(-8, 14), 20, 92), g: g, funds: ri(4, 18) * 1000 * o.tier };
  }
  function declare(o) {
    var s = S(), chk = eligible(o);
    if (!chk.ok) { note("Not eligible", chk.reasons.join("<br>"), null, true); return; }
    money(-o.fee);
    var p = party(s.party) || PARTIES[3];
    var c = {
      office: o.id, party: p.id, electionYear: yr() + 1, actions: 3,
      warChest: Math.round(o.fee * 1.5), momentum: clamp(46 + ri(-6, 8)),
      opponent: opponentFor(o), dirty: 0, gaffes: 0, note: []
    };
    if (p.fx.warChest) c.warChest = Math.round(c.warChest * (1 + p.fx.warChest));
    if (p.fx.name) s.name = clamp(s.name + p.fx.name);
    if (p.fx.standing) state.respect = clamp((state.respect == null ? 40 : state.respect) + p.fx.standing);
    s.campaign = c;
    s.polls = [];
    logIt("Declared candidacy for " + o.name + " with the " + p.name + ".");
    say("I filed to run for " + o.name + ".");
    note("Candidacy filed", "The race is on. Election Day is next year. You have 3 campaign actions before then.", null, true);
    openCampaign();
  }
  function odds(c) {
    if (!c) return 0;
    var s = S(), o = office(c.office);
    var v = c.momentum * .34 + standing() * .22 + (state.stats.Smarts || 0) * .12 +
            (s.name || 0) * .09 + Math.min(18, c.warChest / (2600 * o.tier)) +
            (s.office === c.office ? 11 : 0) - c.opponent.strength * .30 - c.dirty * 3 - c.gaffes * 2;
    return Math.round(clamp(v, 4, 96));
  }
  function resolveElection() {
    var s = S(), c = s.campaign;
    if (!c) return;
    var o = office(c.office), pc = odds(c), share = clamp(pc + ri(-10, 10), 1, 99);
    s.campaign = null;
    s.lastElectionYr = yr();
    s.polls.push({ y: yr(), share: share, office: o.id });
    if (share >= 50) {
      takeOffice(o, !!c.incumbent);
      note("Election Night", "You won with " + share + "% of the vote.", null, true);
      later(function () {
        card({ tag: "Election", iconSrc: ICO("ballot"), title: "You won!", close: true,
          lead: "The returns are in from " + s.nation + ". You carried " + share + "% and will be sworn in as " + o.name + ".",
          rows: [["Office", o.name], ["Vote share", share + "%"], ["Opponent", c.opponent.name],
                 ["War chest spent", usdF(c.warChest)], ["Salary", usdF(o.pay) + "/yr"], ["Term", o.term + " years"]],
          bars: [["Approval", s.approval], ["Public standing", standing()]],
          choices: [["Take the oath", function () { openPolitics(); }, "green"]] });
      });
    } else {
      if (c.incumbent) leaveOffice("lost reelection");
      s.cooldown = yr() + 4;
      s.name = clamp(s.name + 9);
      state.respect = clamp((state.respect == null ? 40 : state.respect) + 3);
      logIt("Lost the " + o.name + " race with " + share + "%.");
      say("I lost the election for " + o.name + ".");
      later(function () {
        card({ tag: "Election", iconSrc: ICO("ballot"), title: "Conceded", close: true,
          lead: c.opponent.name + " takes the office. You took " + share + "% of the vote, but your name is better known now.",
          rows: [["Office", o.name], ["Your share", share + "%"], ["Opponent", c.opponent.name],
                 ["Name recognition", Math.round(s.name)], ["Next eligible", s.cooldown]],
          choices: [["Concede gracefully", function () { fx({ approval: 0 }); openPolitics(); }, "green"],
                    ["Claim the count was rigged", function () { fx({ standing: -4, name: 5, controversy: 8 }); openPolitics(); }]] });
      });
    }
  }

  var CAMPAIGN_ACTS = [
    { id: "fundraise", name: "Fundraising Dinner", icon: "funds", desc: "Fill the war chest with donors.",
      go: function (c) { var g = ri(3, 11) * 2600 * office(c.office).tier; c.warChest += g; fx({ momentum: 1 }); if (chance(.16)) pendingScandal("a donor with favours owed"); return "Raised " + usdF(g) + "." + (chance(.16) ? " One donor is asking for favours." : ""); } },
    { id: "rally", name: "Hold a Rally", icon: "rally", desc: "Fire up the faithful in " + "the square.",
      go: function (c) { fx({ momentum: ri(3, 8), name: 2, happiness: -2 }); if (chance(.14)) { c.gaffes++; fx({ momentum: -4 }); return "The crowd roared, then you misspoke. Momentum slipped."; } return "A big crowd and a loud speech."; } },
    { id: "ads", name: "Buy Newspaper Ads", icon: "press", desc: "Trade cash for name recognition.",
      go: function (c) { var cost = Math.min(c.warChest, 6000 * office(c.office).tier); c.warChest -= cost; fx({ name: ri(4, 9), momentum: 3 }); return "Spent " + usdF(cost) + " on airtime."; } },
    { id: "debate", name: "Public Debate", icon: "debate", desc: "Live, unscripted, high risk.",
      go: function (c) { var p = .34 + (state.stats.Smarts || 0) / 260 + c.momentum / 320; if (chance(p)) { fx({ momentum: ri(6, 12), name: 3 }); return "You landed every answer. A clear win."; } fx({ momentum: -ri(4, 9) }); c.gaffes++; return "The moderator got the better of you."; } },
    { id: "canvass", name: "Door-to-Door Canvassing", icon: "townhall", desc: "Slow, personal, reliable.",
      go: function () { fx({ approval: ri(2, 5), momentum: 2, happiness: -3 }); return "Hundreds of doorsteps, one handshake at a time."; } },
    { id: "oppo", name: "Opposition Research", icon: "dossier", desc: "Dig for something useful. Risky.",
      go: function (c) { c.dirty++; fx({ momentum: ri(5, 10) }); if (chance(.22)) { pendingScandal("leaked opposition research"); return "You found material — and it leaked back to the press."; } return "A thick file on " + c.opponent.name + "."; } },
    { id: "endorse", name: "Chase an Endorsement", icon: "endorse", desc: "Get a paper or a guild behind you.",
      go: function (c) { var cost = 3400 * office(c.office).tier; if (c.warChest < cost) { fx({ momentum: 2 }); return "Not enough in the war chest; a small local club backed you instead."; } c.warChest -= cost; fx({ momentum: ri(4, 9), name: 2 }); return "A major paper endorsed you."; } },
    { id: "poll", name: "Commission an Internal Poll", icon: "polls", desc: "See the real numbers.",
      go: function (c) { var s = S(), v = odds(c); s.polls.push({ y: yr(), share: v, office: c.office }); return "Internal polling puts you at " + v + "%."; } }
  ];

  /* ------------------------------------------------------------------ *
   * Random events
   * ------------------------------------------------------------------ */
  function EV(id, title, icon, lead, when, choices) { return { id: id, title: title, icon: icon, lead: lead, when: when, choices: choices }; }
  function C(t, f, color, fxObj) { return { t: t, color: color, fx: fxObj, f: f }; }
  var YES = function (s) { return !!s.office && !s.sovereign; };
  var REIGN = function (s) { return !!s.sovereign; };
  var EVENTS = [
    EV("endorse", "A Newspaper Endorsement", "press", "The largest daily in " + "the capital wants to back you.", YES, [
      C("Accept with gratitude", null, "green", { approval: 6, name: 4 }),
      C("Decline and stay above the fray", null, null, { standing: 4, approval: -2 })]),
    EV("gaffe", "A Debate Gaffe", "debate", "A clipped sentence from last night is playing on a loop.", function (s) { return !!s.campaign; }, [
      C("Laugh it off", null, "green", { momentum: 3, happiness: 2 }),
      C("Double down", null, null, { momentum: -5, name: 5 }),
      C("Blame the moderator", null, null, { momentum: -2, controversy: 5 })]),
    EV("donor", "A Donor Asks for a Favour", "funds", "A major backer wants a quiet word about a contract.", YES, [
      C("Refuse and return the cheque", null, "green", { warChest: -6000, standing: 5, approval: 3 }),
      C("Listen, then decide later", null, null, { warChest: 12000, controversy: 6 }),
      C("Agree on the spot", null, "dark", { warChest: 30000, heat: 12, approval: -5, scandal: "a donor with favours owed" })]),
    EV("factory", "The Foundry Closes", "storm", "The district's biggest employer shuts its gates.", YES, [
      C("Fund a relief and retraining package", null, "green", { money: -22000, approval: 8, standing: 3 }),
      C("Offer a tax break instead", null, null, { approval: 3, money: -4000 }),
      C("Let the market sort it out", null, "dark", { approval: -9, standing: -4 })]),
    EV("protest", "A Crowd at the Gates", "protest", "Several hundred people have gathered outside your office.", YES, [
      C("Go out and meet them", null, "green", { approval: 6, standing: 4, health: -2 }),
      C("Send aides to take a petition", null, null, { approval: 1 }),
      C("Have the square cleared", null, "dark", { approval: -8, heat: 8, resistance: 4 })]),
    EV("surplus", "A Budget Surplus", "budget", "The books closed better than anyone expected.", YES, [
      C("Cut the rate", null, "green", { approval: 7, money: 6000 }),
      C("Invest in the districts", null, null, { standing: 6, approval: 4, money: -9000 }),
      C("Quietly bank it", null, "dark", { money: 34000, heat: 7 })]),
    EV("memo", "A Leaked Memo", "dossier", "An internal note found its way to a reporter.", YES, [
      C("Publish the whole thing", null, "green", { approval: 5, standing: 4, heat: -6 }),
      C("Deny everything", null, null, { heat: 9, approval: -5 }),
      C("Blame a staffer", null, "dark", { heat: 6, approval: -3, scandal: "a leaked internal memo" })]),
    EV("whistle", "A Whistleblower", "dossier", "A clerk offers proof of irregularities in a department.", YES, [
      C("Protect them and open an inquiry", null, "green", { standing: 7, approval: 4, heat: -4 }),
      C("Discredit the source", null, "dark", { infamy: 4, heat: 10, approval: -6 }),
      C("Sit on the file", null, null, { heat: 5 })]),
    EV("coalition", "A Coalition Offer", "endorse", "A smaller bloc offers its votes in exchange for a seat at the table.", YES, [
      C("Bring them in", null, "green", { approval: 5, warChest: 9000 }),
      C("Hold firm alone", null, null, { standing: 4, approval: -2 })]),
    EV("filibuster", "A Filibuster", "gavel", "The opposition has talked your bill into the ground.", YES, [
      C("Negotiate amendments", null, "green", { approval: 3, standing: 3 }),
      C("Force a vote", null, null, { approval: -4, controversy: 5 })]),
    EV("viral", "A Speech Spreads Far", "pressconf", "Thirty seconds of a speech are everywhere.", YES, [
      C("Lean into it", null, "green", { name: 8, approval: 4 }),
      C("Say nothing", null, null, { name: 2 })]),
    EV("delegation", "A Foreign Delegation", "treaty", "Envoys arrive to discuss a treaty.", YES, [
      C("Sign a wide accord", null, "green", { standing: 8, money: 16000 }),
      C("Keep it narrow", null, null, { standing: 3 }),
      C("Snub them", null, "dark", { standing: -7, approval: -3 })]),
    EV("flood", "The River Broke Its Banks", "storm", "Whole streets are underwater.", YES, [
      C("Lead the relief yourself", null, "green", { approval: 10, standing: 5, health: -4, money: -16000 }),
      C("Send the emergency services", null, null, { approval: 3, money: -8000 }),
      C("Delegate and carry on", null, "dark", { approval: -10, standing: -6 })]),
    EV("probe", "A Corruption Probe", "justice", "Inspectors want to see the department's books.", YES, [
      C("Open everything", null, "green", { standing: 5, heat: -8 }),
      C("Lawyer up", null, null, { money: -12000, heat: 5 }),
      C("Shred first, answer later", null, "dark", { heat: 18, infamy: 6, scandal: "shredded department records" })]),
    EV("veterans", "The Veterans' Rally", "medal", "Old soldiers ask for a proper memorial.", YES, [
      C("Fund it", null, "green", { standing: 6, approval: 4, money: -9000 }),
      C("Attend but don't commit", null, null, { approval: 1 })]),
    EV("column", "A Stinging Column", "press", "A columnist has written a brutal piece about your record.", YES, [
      C("Write a measured reply", null, "green", { approval: 4, standing: 2 }),
      C("Ignore it", null, null, {}),
      C("Hit back hard", null, "dark", { name: 5, approval: -5, controversy: 6 })]),
    EV("resignation", "A Senior Aide Resigns", "exile", "Your " + "chief of staff" + " has handed in a letter.", YES, [
      C("Accept it cleanly", null, "green", { approval: -1, heat: -3 }),
      C("Talk them round", null, null, { warChest: -6000, approval: 2 }),
      C("Discredit them on the way out", null, "dark", { heat: 9, infamy: 4 })]),
    EV("surge", "Polling Surge", "polls", "A new survey has you well up.", YES, [
      C("Bank it", null, "green", { approval: 7, warChest: 5000 }),
      C("Get complacent", null, null, { approval: -2 })]),
    EV("slump", "Polling Slump", "polls", "The numbers have turned against you.", YES, [
      C("Reset the message", null, "green", { approval: 5, money: -7000 }),
      C("Blame the pollster", null, "dark", { approval: -5, controversy: 5 })]),
    EV("patronage", "A Patronage Request", "cabinet", "A party grandee wants a post for a cousin.", YES, [
      C("Appoint on merit instead", null, "green", { standing: 4, approval: 2 }),
      C("Make the appointment", null, null, { warChest: 14000, heat: 6, approval: -3 })]),
    EV("speech", "A Historic Speech", "rally", "The chamber is full and the galleries are listening.", YES, [
      C("Speak for the long term", null, "green", { approval: 6, standing: 7, name: 5 }),
      C("Play to the room", null, null, { approval: 4, name: 3 })]),
    EV("redistrict", "Redistricting", "map", "Boundaries have to be redrawn this year.", YES, [
      C("Independent commission", null, "green", { standing: 5, approval: 2 }),
      C("Draw them yourself", null, "dark", { approval: -4, heat: 8, controversy: 7 })]),
    EV("recall", "A Recall Petition", "gavel", "Enough signatures have been filed to force a vote.", function (s) { return YES(s) && s.approval < 38; }, [
      C("Face it and campaign", null, "green", { approval: 8, warChest: -12000 }),
      C("Challenge the signatures", null, null, { money: -9000, heat: 6 }),
      C("Resign first", null, "dark", {})]),
    EV("articles", "Articles of Impeachment", "gavel", "The assembly has voted to bring articles against you.", function (s) { return YES(s) && s.approval < 26 && s.heat > 48; }, [
      C("Defend yourself in the chamber", null, "green", { approval: 6, standing: 3 }),
      C("Cut a deal to step down", null, null, { heat: -20 }),
      C("Deny the assembly's right", null, "dark", { heat: 14, infamy: 6, approval: -8 })]),
    /* ---------- Sovereign events ---------- */
    EV("coalitionarmies", "Coalition Armies Muster", "swords", "Three neighbouring realms have joined their levies against you.", function (s) { return REIGN(s) && s.sovereign.resistance > 38; }, [
      C("Meet them in the field", null, null, { soldiers: -2600, infamy: 5, resistance: -8, loyalty: 3 }),
      C("Buy off one of the three", null, "green", { money: -48000, resistance: -10 }),
      C("Withdraw to the capital", null, "dark", { resistance: 8, approval: -8, loyalty: -5 })]),
    EV("generalsturn", "Your Own Generals Turn", "helmet", "A circular is circulating among your senior officers.", function (s) { return REIGN(s) && s.sovereign.loyalty < 46; }, [
      C("Pay and promote them", null, "green", { money: -60000, loyalty: 12 }),
      C("Replace the whole command", null, null, { loyalty: 7, infamy: 6, resistance: 6 }),
      C("Ignore it", null, "dark", { loyalty: -10, resistance: 10 })]),
    EV("tribunal", "The Tribunal Names You", "wanted", "Your name now heads the Tribunal's Most Wanted list.", function (s) { return REIGN(s) && s.sovereign.heat > 55; }, [
      C("Go underground", null, "green", { heat: -16, approval: -6, standing: -3 }),
      C("Strike at the Tribunal", null, "dark", { soldiers: -1800, infamy: 10, heat: 10 }),
      C("Open negotiations", null, null, { money: -55000, heat: -10, infamy: -3 }),
      C("Surrender", null, "dark", {})]),
    EV("tribute", "A Tribute Convoy", "funds", "The provinces send their annual dues.", REIGN, [
      C("Receive it publicly", null, "green", { money: 22000, standing: 3 }),
      C("Send it to the legions", null, null, { loyalty: 5, soldiers: 600 })]),
    EV("uprising", "A Border Uprising", "protest", "A frontier province has thrown out your governor.", REIGN, [
      C("Negotiate a settlement", null, "green", { resistance: -9, approval: 4, money: -14000 }),
      C("March the legions in", null, "dark", { soldiers: -1500, infamy: 6, resistance: 4 })]),
    EV("deserters", "Deserters on the Road", "exile", "Whole companies have melted away.", REIGN, [
      C("Raise pay and pardon them", null, "green", { money: -26000, loyalty: 6, soldiers: 400 }),
      C("Make an example", null, "dark", { loyalty: -4, infamy: 5, resistance: 7 })]),
    EV("chronicler", "A Chronicler Asks for an Audience", "laurel", "A historian wants to write the story of your reign.", REIGN, [
      C("Tell the whole truth", null, "green", { standing: 7, infamy: -5 }),
      C("Commission a flattering version", null, null, { approval: 4, name: 5, infamy: 3 })]),
    EV("famine", "A Lean Harvest", "storm", "The granaries are thinner than the reports claimed.", REIGN, [
      C("Open the reserve", null, "green", { approval: 9, resistance: -6, money: -20000 }),
      C("Keep the reserve for the legions", null, "dark", { approval: -9, resistance: 9, loyalty: 4 })])
  ];
  function fireEvent() {
    var s = S();
    if (s.lastEventYr === yr()) return;
    var pool = EVENTS.filter(function (e) { try { return !e.when || e.when(s); } catch (x) { return false; } });
    if (!pool.length) return;
    var ev = pick(pool);
    s.lastEventYr = yr();
    logIt(ev.title);
    var choices = ev.choices.map(function (c) {
      return [c.t, function () {
        playSfx();
        fx(c.fx || {});
        if (ev.id === "articles" && c.t === "Cut a deal to step down" ||
            ev.id === "recall" && c.t === "Resign first" ||
            ev.id === "tribunal" && c.t === "Surrender") {
          if (ev.id === "tribunal" && c.t === "Surrender") endReign("surrendered to the Tribunal");
          else if (ev.id === "recall" && c.t === "Resign first") leaveOffice("recalled");
          else if (ev.id === "articles" && c.t === "Cut a deal to step down") leaveOffice("impeached");
        }
        try { evWrap.classList.remove("open"); } catch (x) {}
        if (c.f) c.f();
        openPolitics();
      }, c.color || null];
    });
    later(function () {
      card({ tag: "Politics", iconSrc: ICO(ev.icon), title: ev.title, lead: ev.lead, close: true,
        rows: [["Year", yr()], ["Office", s.sovereign ? "Sovereign" : ((office(s.office) || {}).name || "Candidate")],
               ["Approval", Math.round(s.approval) + "%"], ["Public standing", standing()]],
        choices: choices });
    });
  }

  /* ------------------------------------------------------------------ *
   * Bills, cabinet, controls
   * ------------------------------------------------------------------ */
  function propose(b) {
    var s = S();
    if ((s.bills || []).indexOf(b.id) >= 0) { note("Already passed", "That bill is already law.", null, true); return; }
    var pass = .40 + (s.approval - 45) / 240 + cabinetSkill() / 320 - b.controversy / 130;
    pass = clamp(pass, .12, .92);
    later(function () {
      card({ tag: "Legislation", iconSrc: ICO(b.icon), title: b.name, close: true,
        lead: b.desc + "<br><br>The committee has reported it out. Passage chance is about " + Math.round(pass * 100) + "%.",
        rows: [["Cost", usdF(b.cost)], ["Controversy", b.controversy + "/30"], ["Projected approval", "+" + (b.fx.approval || 0)],
               ["Cabinet skill", Math.round(cabinetSkill()) + "%"]],
        choices: [["Send it to a vote", function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (x) {}
          if (chance(pass)) {
            later(function () {
              card({ tag: "Legislation", iconSrc: ICO(b.icon), title: "Passed the Assembly", close: true,
                lead: "The " + b.name + " has passed. It reaches your desk for assent.",
                rows: [["Office", (office(s.office) || {}).name || "Sovereign"], ["Vote", "Carried"]],
                choices: [
                  ["Sign it into law", function () {
                    playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
                    s.bills.push(b.id); s.enacted.push({ id: b.id, y: yr() });
                    fx(b.fx); logIt("Signed the " + b.name + "."); say("I signed the " + b.name + " into law.");
                    note("Signed", "The " + b.name + " is now law.", null, true);
                    openPolitics();
                  }, "green"],
                  ["Veto it", function () {
                    playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
                    fx({ approval: -3, standing: 2 }); logIt("Vetoed the " + b.name + ".");
                    openPolitics();
                  }]
                ] });
            });
          } else {
            fx({ approval: -2 }); logIt("The " + b.name + " failed in the assembly.");
            note("Defeated", "The " + b.name + " did not carry.", null, true);
            openPolitics();
          }
        }, "green"], ["Withdraw it", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openPolitics(); }]] });
    });
  }
  function cabinetSkill() {
    var s = S(), vals = Object.keys(s.cabinet).map(function (k) { return s.cabinet[k] ? s.cabinet[k].competence : 0; });
    if (!vals.length) return 42;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function candidateFor(r) {
    var g = chance(.5) ? "m" : "f", nm = "Alden Vane";
    try { nm = uname(g) + " " + (typeof ulast === "function" ? ulast() : "Vane"); } catch (e) {}
    return { name: nm, g: g, loyalty: ri(35, 92), competence: ri(35, 95) };
  }
  function appoint(r) {
    var s = S(), cand = [candidateFor(r), candidateFor(r), candidateFor(r)];
    later(function () {
      card({ tag: "Cabinet", iconSrc: ICO(r.icon), title: "Appoint " + r.name, close: true,
        lead: "Three names have been put forward. Loyalty keeps secrets; competence gets bills through.",
        rows: cand.map(function (c, i) { return ["Candidate " + (i + 1), c.name + " · loyalty " + c.loyalty + " · skill " + c.competence]; }),
        choices: cand.map(function (c, i) {
          return [c.name, function () {
            playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
            s.cabinet[r.id] = c;
            fx({ approval: 1 });
            logIt("Appointed " + c.name + " as " + r.name + ".");
            note("Appointed", c.name + " joins the cabinet as " + r.name + ".", null, true);
            openCabinet();
          }, i === 0 ? "green" : null];
        }).concat([["Leave it vacant", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openCabinet(); }]]) });
    });
  }

  /* ------------------------------------------------------------------ *
   * Rise Up / Sovereign
   * ------------------------------------------------------------------ */
  function crown(style) {
    var s = S();
    s.sovereign = {
      crowned: yr(), style: style || "steward", realms: [], soldiers: 14000,
      loyalty: 56, resistance: 12, infamy: 0, heat: 0, mostWanted: false,
      tribute: 0, approval: 58, reignYears: 0, decrees: {}, preps: {}, legionLevel: 1
    };
    s.office = "sovereign";
    s.scandal = null;
    installJob(null, true);
    logIt("Rose to power as Sovereign of " + s.nation + ".");
    say("I took the supreme power in " + s.nation + ".");
    note("The Realm is Yours", "You are Sovereign. The assembly has been dissolved and the legions await orders.", null, true);
    openThrone();
  }
  function endReign(reason) {
    var s = S(), sv = s.sovereign;
    if (!sv) return;
    var held = sv.realms.length;
    logIt("Reign ended (" + reason + ") after " + (yr() - sv.crowned) + " years, " + held + " realms held.");
    s.legacy.push({ y: yr(), t: "Sovereign of " + s.nation + ", " + held + " realm" + (held === 1 ? "" : "s") + ", ended by " + reason + "." });
    s.sovereign = null; s.office = null;
    try { state.job = null; renderAvatar(); renderStats(); } catch (e) {}
    fx({ standing: -12, approval: -14 });
    s.houseArrest = yr() + 5;
    note("The reign is over", reason.charAt(0).toUpperCase() + reason.slice(1) + ". You are stripped of office and confined for five years.", null, true);
    openPolitics();
  }
  function riseOdds() {
    var s = S(), p = s.sovereign ? {} : (s.risePrep || {});
    var mil = p.mil == null ? 35 : p.mil, par = p.party == null ? 35 : p.party,
        pub = p.public == null ? standing() : p.public,
        tre = p.treasury == null ? 35 : p.treasury;
    var v = .08 + mil * .0022 + par * .0014 + pub * .0012 + tre * .0010 +
            (s.office === "president" ? .12 : s.office === "vp" ? .05 : 0) +
            (state.royal && /monarch/i.test(state.royal.rank || "") ? .10 : 0);
    return Math.round(clamp(v * 100, 5, 92));
  }
  function ensurePrep() { var s = S(); if (!s.risePrep) s.risePrep = { mil: 35, party: 35, public: standing(), treasury: 35, done: {} }; return s.risePrep; }
  var PREPS = [
    { id: "generals", name: "Court the Generals", icon: "helmet", desc: "Secure the officer corps.", fx: { mil: 16, loyalty: 3 } },
    { id: "party", name: "Secure the Party Machine", icon: "cabinet", desc: "Line up the assembly bosses.", fx: { party: 16 } },
    { id: "public", name: "Rally the Public", icon: "rally", desc: "Fill the squares with your supporters.", fx: { public: 12, name: 4 } },
    { id: "treasury", name: "Take the Treasury", icon: "funds", desc: "Control the funds before anyone else does.", fx: { treasury: 18, money: 45000, heat: 5 } },
    { id: "purge", name: "Neutralise Rivals", icon: "dossier", desc: "Quietly sideline anyone who could object.", fx: { mil: 8, party: 8, heat: 9, infamy: 5 } }
  ];
  function attemptRise() {
    var s = S(), p = ensurePrep(), pct = riseOdds();
    later(function () {
      card({ tag: "Leadership Challenge", iconSrc: ICO("crown"), title: "Make Your Move", close: true,
        lead: "The capital is tense. Your odds of carrying the move are about <b>" + pct + "%</b>. If it fails, you lose everything.",
        rows: [["Military loyalty", Math.round(p.mil) + "%"], ["Party backing", Math.round(p.party) + "%"],
               ["Public mandate", Math.round(p.public) + "%"], ["Treasury control", Math.round(p.treasury) + "%"],
               ["Current office", (office(s.office) || {}).name || (state.job ? state.job.t : "None")],
               ["Odds", pct + "%"]],
        choices: [
          ["Move on the capital", function () {
            playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
            if (chance(pct / 100)) {
              s.risePrep = null;
              later(function () {
                card({ tag: "Leadership Challenge", iconSrc: ICO("crown"), title: "The Realm is Yours", close: true,
                  lead: "The assembly is dissolved, the guards have changed their colours, and the proclamations are already being printed.",
                  rows: [["Title", "Sovereign of " + s.nation], ["Year", yr()], ["Legions", "14,000"]],
                  choices: [
                    ["Serve the people", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} crown("steward"); }, "green"],
                    ["Build an empire", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} crown("conqueror"); }],
                    ["Rule without restraint", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} crown("tyrant"); }, "dark"]
                  ] });
              });
            } else {
              s.risePrep = null;
              s.houseArrest = yr() + 6;
              fx({ standing: -22, approval: -20, heat: 25 });
              logIt("A failed leadership challenge left me under house arrest.");
              leaveOffice("a failed leadership challenge");
              later(function () {
                card({ tag: "Leadership Challenge", iconSrc: ICO("prison"), title: "It Collapsed", close: true,
                  lead: "The generals stayed loyal to the old order. You have been stripped of office and confined for six years.",
                  rows: [["Odds", pct + "%"], ["Confinement until", yr() + 6]],
                  choices: [["Accept it", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openPolitics(); }, "green"]] });
              });
            }
          }, "green"],
          ["Wait another year", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openRise(); }]
        ] });
    });
  }
  function conquestOdds(r) {
    var s = S(), sv = s.sovereign;
    if (!sv) return 0;
    var v = .10 + (sv.soldiers / 1000) * .035 + (sv.legionLevel || 1) * .045 +
            (sv.loyalty - 50) / 400 - r.defence / 260 - sv.resistance / 320 - sv.infamy / 500;
    return Math.round(clamp(v * 100, 6, 94));
  }
  function conquer(r) {
    var s = S(), sv = s.sovereign;
    if (!sv) return;
    if (sv.realms.indexOf(r.id) >= 0) { note("Already held", r.name + " already pays tribute.", null, true); return; }
    if (sv.soldiers < r.soldiers) { note("Not enough legions", "You need " + r.soldiers.toLocaleString() + " soldiers; you have " + Math.round(sv.soldiers).toLocaleString() + ".", null, true); return; }
    var pct = conquestOdds(r), war = Math.round(r.soldiers * (.55 + Math.random() * .5));
    sv.soldiers = Math.max(0, sv.soldiers - war);
    logIt("Invaded " + r.name + " (" + pct + "% odds).");
    later(function () {
      card({ tag: "Campaign", iconSrc: ICO(r.icon), title: "The March on " + r.name, close: true,
        lead: r.desc + " The legions have crossed the border.",
        rows: [["Realm", r.name], ["Defence", r.defence + "/100"], ["Legions committed", war.toLocaleString()],
               ["Legions remaining", Math.round(sv.soldiers).toLocaleString()], ["Odds", pct + "%"],
               ["Tribute if won", usdF(r.tribute) + "/yr"]],
        choices: [["Press the campaign", function () {
          playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
          if (chance(pct / 100)) {
            sv.realms.push(r.id); sv.tribute += r.tribute;
            fx({ standing: 3 + Math.round(r.defence / 20), money: Math.round(r.tribute * .18), infamy: 4 });
            sv.resistance = clamp(sv.resistance + r.backlash);
            sv.approval = clamp(sv.approval - Math.round(r.backlash / 2));
            sv.infamy = clamp(sv.infamy + 4);
            logIt("Annexed " + r.name + ". Annual tribute now " + usdF(sv.tribute) + ".");
            note("Realm Annexed", r.name + " pays " + usdF(r.tribute) + " a year. Backlash is growing.", null, true);
          } else {
            fx({ money: Math.round(r.tribute * .06), standing: -4, approval: -16 });
            sv.resistance = clamp(sv.resistance + r.backlash + 8);
            sv.approval = clamp(sv.approval - 10);
            sv.loyalty = clamp(sv.loyalty - 6);
            logIt("Repulsed at " + r.name + ". Heavy losses and furious crowds.");
            note("Repulsed", "You took a little plunder, but the legions were mauled and the crowds are openly hostile.", null, true);
          }
          openConquest();
        }, "green"]] });
    });
  }

  /* ------------------------------------------------------------------ *
   * Yearly tick
   * ------------------------------------------------------------------ */
  function applyControls(s) {
    var c = s.controls || {}, out = 0;
    out += (c.tax - 40) * 1500;
    out -= (c.spend - 40) * 1150;
    out -= (c.military - 40) * 900;
    if (c.press < 45) { s.heat = clamp(s.heat + (45 - c.press) / 12); }
    if (c.liberty < 45 && s.sovereign) s.sovereign.resistance = clamp(s.sovereign.resistance + (45 - c.liberty) / 12);
    s.approval = clamp(s.approval - (c.tax - 40) / 14 + (c.spend - 40) / 13 + (c.press - 60) / 18 + (c.liberty - 60) / 16);
    if (s.sovereign) {
      s.sovereign.approval = clamp(s.sovereign.approval - (c.tax - 40) / 18 + (c.spend - 40) / 14);
      s.sovereign.loyalty = clamp(s.sovereign.loyalty + (c.military - 40) / 14);
      s.sovereign.soldiers = Math.max(0, s.sovereign.soldiers + (c.military - 30) * 24);
    }
    if (out) money(out);
  }
  function cabinetTick(s) {
    var vals = Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; });
    if (!vals.length) return;
    var comp = vals.reduce(function (a, k) { return a + s.cabinet[k].competence; }, 0) / vals.length;
    var loy = vals.reduce(function (a, k) { return a + s.cabinet[k].loyalty; }, 0) / vals.length;
    s.approval = clamp(s.approval + (comp - 50) / 26);
    s.heat = clamp(s.heat - (loy - 50) / 22);
  }
  function termEndEvent() {
    var s = S(), o = office(s.office);
    if (!o) return;
    logIt("Term as " + o.name + " reached its end.");
    later(function () {
      card({ tag: "Election", iconSrc: ICO("hourglass"), title: "Your Term Is Up", close: true,
        lead: "Four years have passed. The constitution allows a second consecutive term, or you can step aside.",
        rows: [["Office", o.name], ["Terms served", s.terms], ["Approval", Math.round(s.approval) + "%"],
               ["Public standing", standing()], ["War chest", usdF(s.warChest)]],
        choices: [
          ["Run for reelection", function () {
            playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
            var p = party(s.party) || PARTIES[3];
            s.campaign = { office: o.id, party: p.id, electionYear: yr() + 1, actions: 3,
              warChest: Math.max(s.warChest, 12000), momentum: clamp(48 + ri(-5, 8)),
              opponent: opponentFor(o), dirty: 0, gaffes: 0, incumbent: true, note: [] };
            s.termEnd = yr() + 1; s.termEvent = false;
            s.approval = clamp(s.approval + 4);
            logIt("Launched a reelection campaign.");
            openCampaign();
          }, "green"],
          ["Seek a higher office", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} leaveOffice("term ended"); openRun(); }],
          ["Step down", function () {
            playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
            fx({ standing: 6, approval: 3 });
            leaveOffice("voluntarily retired");
            note("A clean exit", "You left office with your reputation intact.", null, true);
            openPolitics();
          }]
        ] });
    });
  }
  function tick() {
    var s = S();
    if (state.dead || state.prison) return;
    var y = yr();
    if (y === s.lastTick) return;
    s.lastTick = y;
    try {
      if (s.campaign && y >= s.campaign.electionYear) resolveElection();
      if (s.office && !s.sovereign) {
        s.termYears = (s.termYears || 0) + 1;
        applyControls(s);
        cabinetTick(s);
        s.approval = clamp(s.approval + ri(-4, 4) + (s.approval < 45 ? 2 : s.approval > 72 ? -2 : 0));
        s.heat = clamp(s.heat - 2);
        s.controversy = clamp((s.controversy || 0) - 3);
        if (s.scandal) {
          var sev = s.scandal.severity * (1 - (s.cabinet.press ? s.cabinet.press.loyalty / 300 : 0));
          s.approval = clamp(s.approval - Math.round(sev / 12));
          s.heat = clamp(s.heat + 3);
          if (chance(.4)) s.scandal = null;
        }
        if (s.cooldown < y && s.houseArrest < y) s.name = clamp(s.name + 1);
        if (y >= s.termEnd && !s.termEvent) { s.termEvent = true; termEndEvent(); }
        if (s.approval < 17 && s.heat > 58 && chance(.55)) {
          fx({ standing: -6 });
          leaveOffice("removed after a confidence vote");
          note("Removed from Office", "The assembly carried a confidence vote against you.", null, true);
        }
        if (!s.termEvent && chance(.44)) fireEvent();
      }
      if (s.sovereign) {
        var sv = s.sovereign;
        sv.reignYears = (sv.reignYears || 0) + 1;
        applyControls(s);
        if (sv.tribute) money(sv.tribute);
        money(-Math.round(sv.soldiers * 2.4));
        state.respect = clamp((state.respect == null ? 40 : state.respect) + Math.min(6, sv.realms.length));
        sv.resistance = clamp(sv.resistance + Math.round(sv.realms.length * .8) + Math.round(sv.infamy / 14) - 2);
        sv.loyalty = clamp(sv.loyalty - Math.round(sv.resistance / 22));
        sv.heat = clamp(sv.heat + Math.round(sv.infamy / 12) - 1);
        var active = Object.keys(sv.decrees).filter(function (k) { return sv.decrees[k]; });
        active.forEach(function (k) {
          var d = decree(k); if (!d) return;
          fx(d.fx);
          sv.heat = clamp(sv.heat + 2);
        });
        sv.mostWanted = sv.heat >= 60;
        if (sv.mostWanted && !sv.mwFlagged) {
          sv.mwFlagged = true;
          logIt("Named on the Tribunal's Most Wanted list.");
          note("Most Wanted", "The Tribunal has named you. Coalition armies and your own officers are closing in.", null, true);
        }
        if (sv.resistance >= 92 || sv.loyalty <= 4) {
          endReign(sv.loyalty <= 4 ? "a coup by my own generals" : "a general uprising");
          return;
        }
        if (chance(.55)) fireEvent();
      }
    } catch (e) { /* never break aging */ }
  }

  /* ------------------------------------------------------------------ *
   * Screen helpers
   * ------------------------------------------------------------------ */
  function css() {
    if (document.getElementById("polCss")) return;
    var st = document.createElement("style"); st.id = "polCss";
    st.textContent = [
      ".pol-banner{width:100%;height:146px;object-fit:cover;object-position:center 36%;border-radius:10px;display:block;margin:0 0 12px}",
      ".pol-card{background:#1a2337;border:1px solid #2b3852;border-radius:10px;padding:12px 13px;margin:0 0 12px}",
      ".pol-title{color:#7fe3d8;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;margin:0 0 9px}",
      ".pol-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px}",
      ".pol-k{color:#8397b5;font-size:11px;line-height:1.3}",
      ".pol-v{color:#eaf2ff;font-size:14px;font-weight:700;line-height:1.35}",
      ".pol-bar{height:7px;background:#0c1424;border-radius:5px;overflow:hidden;margin-top:5px}",
      ".pol-bar i{display:block;height:100%;border-radius:5px}",
      ".pol-meter{margin:8px 0}",
      ".pol-mrow{display:flex;justify-content:space-between;color:#c6d5ea;font-size:12px;margin-bottom:3px}",
      ".pol-note{color:#93a6c4;font-size:12px;line-height:1.5}",
      ".pol-warn{color:#ffb0a4;font-size:12px;line-height:1.5}",
      ".pol-good{color:#8fe0b0}",
      ".pol-bad{color:#ff9b8c}",
      ".pol-chip{display:inline-block;background:#243250;color:#a9c6ea;border-radius:20px;padding:3px 10px;font-size:11px;margin:2px 4px 2px 0}",
      ".pol-row .t b{color:#27c3d1}",
      ".pol-mini{font-size:11px;color:#8397b5}",
      ".pol-ctl{display:flex;align-items:center;gap:8px;margin:8px 0}",
      ".pol-ctl .lbl{flex:1;color:#d6e3f5;font-size:13px}",
      ".pol-ctl button{background:#2b3a58;color:#eaf2ff;border:1px solid #3d5178;border-radius:6px;width:30px;height:28px;font-weight:700;cursor:pointer}",
      ".pol-ctl .val{width:38px;text-align:center;color:#7fe3d8;font-weight:700}",
      ".pol-hist{border-left:2px solid #2b3852;padding-left:10px;margin:6px 0;color:#b9c9de;font-size:12px;line-height:1.5}"
    ].join("\n");
    document.head.appendChild(st);
  }
  function bar(v, color) { return '<div class="pol-bar"><i style="width:' + clamp(v, 0, 100) + '%;background:' + (color || "#4bc0a0") + '"></i></div>'; }
  function meter(label, v, color) {
    return '<div class="pol-meter"><div class="pol-mrow"><span>' + E(label) + '</span><b>' + Math.round(clamp(v, 0, 100)) + '</b></div>' + bar(v, color) + '</div>';
  }
  function kv(k, v) { return '<div><div class="pol-k">' + E(k) + '</div><div class="pol-v">' + E(v) + '</div></div>'; }
  function sec(t) { return '<div class="sec">' + E(t) + '</div>'; }
  function row(icon, label, sub, act, arg, extra) {
    return '<div class="row pol-row" data-pol="' + E(act) + '"' + (arg != null ? ' data-arg="' + E(arg) + '"' : '') + '>' +
      '<img src="' + ICO(icon) + '" alt=""><div class="t"><b>' + E(label) + '</b><span>' + E(sub) + '</span></div>' +
      (extra || (typeof CHEV !== "undefined" ? CHEV : "")) + '</div>';
  }
  function scr(title, html, back) {
    try {
      sTitle.textContent = title;
      try { sSub.style.display = "none"; } catch (e) {}
      sBack.innerHTML = (typeof BACK_ICON !== "undefined" ? BACK_ICON : "&#8592;");
      sBack.onclick = back || function () { try { screen.classList.remove("open"); } catch (e) {} };
      sList.innerHTML = html;
      sList.scrollTop = 0;
      screen.classList.add("open");
      bind();
    } catch (e) {}
  }
  function bind() {
    try {
      sList.querySelectorAll("[data-pol]").forEach(function (el) {
        el.onclick = function () { playSfx(); dispatch(el.getAttribute("data-pol"), el.getAttribute("data-arg")); };
      });
    } catch (e) {}
  }
  function banner() { return '<img class="pol-banner" src="' + ICO("banner") + '" alt="">'; }
  function statusCard() {
    var s = S(), o = office(s.office), sv = s.sovereign;
    var title = sv ? "Sovereign of " + s.nation : o ? o.name + " of " + s.nation :
      s.campaign ? "Candidate for " + (office(s.campaign.office) || {}).name : "Private citizen";
    var h = '<div class="pol-card"><div class="pol-title">Political Standing</div><div class="pol-grid">' +
      kv("Position", title) + kv("Nation", s.nation) +
      kv("Party", (party(s.party) || { name: "Unaffiliated" }).name) + kv("District", s.district) +
      kv("Public standing", standing()) + kv("Name recognition", Math.round(s.name)) +
      kv("Approval", Math.round(s.approval) + "%") + kv("War chest", usdF(s.warChest)) +
      kv("Investigation heat", Math.round(s.heat)) + kv("Year", yr()) + '</div>' +
      meter("Approval", s.approval, s.approval < 35 ? "#e2604f" : "#4bc0a0") +
      meter("Public standing", standing(), "#e7b34c") +
      meter("Name recognition", s.name, "#4a9fd0") + '</div>';
    if (sv) {
      h += '<div class="pol-card"><div class="pol-title">The Realm</div><div class="pol-grid">' +
        kv("Course", sv.style) + kv("Realms held", sv.realms.length) +
        kv("Annual tribute", usdF(sv.tribute)) + kv("Legions", Math.round(sv.soldiers).toLocaleString()) +
        kv("Tribunal status", sv.mostWanted ? "MOST WANTED" : "Not listed") + kv("Years reigning", sv.reignYears) + '</div>' +
        meter("Legion loyalty", sv.loyalty, "#4bc0a0") +
        meter("Resistance", sv.resistance, "#e2604f") +
        meter("Infamy", sv.infamy, "#a06bd0") +
        meter("Tribunal heat", sv.heat, "#e2604f") + '</div>';
    }
    return h;
  }

  /* ------------------------------------------------------------------ *
   * Screens
   * ------------------------------------------------------------------ */
  function openPolitics() {
    var s = S(), h = banner() + statusCard();
    if (s.sovereign) {
      h += sec("The Realm");
      h += row("crown", "Throne Room", "Your reign, legions and course", "throne");
      h += row("map", "Conquest", sv2("realms") + " realms held · annual tribute " + usdF(s.sovereign.tribute), "conquest");
      h += row("capitol", "Stewardship", "Serve the people · six great projects", "steward");
      h += row("dossier", "Decrees & Repression", Object.keys(s.sovereign.decrees).filter(function (k) { return s.sovereign.decrees[k]; }).length + " decrees in force", "repression");
      h += row("helmet", "The Legions", Math.round(s.sovereign.soldiers).toLocaleString() + " soldiers · level " + s.sovereign.legionLevel, "legions");
      h += row("wanted", "The Tribunal", s.sovereign.mostWanted ? "MOST WANTED — armies are hunting you" : "Heat " + Math.round(s.sovereign.heat) + "/100", "tribunal");
      h += row("bill", "Policy Controls", "Tax, spending, press, military, liberty", "controls");
      h += row("hourglass", "Abdicate", "End the reign and retire", "abdicate");
    } else if (s.office) {
      var o = office(s.office);
      h += sec("Office of the " + o.name);
      h += row("polls", "Approval & Polling", Math.round(s.approval) + "% approval · term ends " + s.termEnd, "standing");
      h += row("bill", "Legislation", s.bills.length + " bills enacted · 12 on the docket", "legislation");
      h += row("cabinet", "The Cabinet", Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; }).length + " of 5 seats filled", "cabinet");
      h += row("pressconf", "Press & Public", "Conferences, spin, interviews, addresses", "press");
      h += row("townhall", "Constituents", "Town halls, relief, projects, letters", "constituents");
      h += row("budget", "Policy Controls", "Five sliders that reshape the yearly books", "controls");
      h += sec("The Next Move");
      if (s.scandal) h += row("dossier", "A Scandal Is Breaking", s.scandal.kind + " · severity " + s.scandal.severity, "scandal");
      h += row("hourglass", "Reelection & Succession", s.termEnd - yr() + " years left in this term", "reelection");
      if (canRise()) h += row("crown", "Rise Up", "Challenge for supreme power", "rise");
      h += row("exile", "Resign", "Leave office on your own terms", "resign");
    } else if (s.campaign) {
      h += sec("On the Campaign Trail");
      h += row("rally", "Campaign Headquarters", s.campaign.actions + " actions left · election " + s.campaign.electionYear, "campaign");
      h += row("polls", "Polling", "Projected " + odds(s.campaign) + "% · " + s.campaign.opponent.name, "polling");
      h += row("gavel", "Withdraw", "End the campaign and recover half the chest", "withdraw");
    } else {
      h += sec("Get Started");
      h += row("ballot", "Run for Office", "Mayor · Governor · Vice President · President", "run");
      h += row("flag", "Register a Party", (party(s.party) || { name: "Unaffiliated" }).name, "party");
      if (canRise()) h += row("crown", "Rise Up", "High rank has opened another door", "rise");
      h += row("capitol", "How It Works", "The rules of a political life", "howto");
    }
    h += sec("Records");
    h += row("press", "Political Archive", s.history.length + " entries · your career in one place", "archive");
    if (s.legacy.length) h += row("laurel", "Legacy", s.legacy.length + " closing chapters", "archive");
    if (s.houseArrest > yr()) h += '<div class="pol-card"><div class="pol-warn">You are confined until ' + s.houseArrest + '. Elections and challenges are closed to you.</div></div>';
    scr("POLITICAL CAREER", h, function () { try { screen.classList.remove("open"); } catch (e) {} });
  }
  function sv2(x) { var s = S(); return s.sovereign ? (x === "realms" ? s.sovereign.realms.length : 0) : 0; }

  function openRun() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Filing for Office</div><div class="pol-note">Elections resolve on your next birthday. Each race has a filing fee, a minimum age, a Smarts floor, a public-standing floor and (for higher office) a prior-office requirement. Win and the job, salary and term are yours.</div></div>';
    OFFICES.forEach(function (o) {
      var e = eligible(o);
      h += '<div class="pol-card"><div class="pol-title">' + E(o.name) + '</div>' +
        '<div class="pol-note">' + E(o.desc) + '</div><div class="pol-grid" style="margin-top:9px">' +
        kv("Salary", usdF(o.pay) + "/yr") + kv("Term", o.term + " years") +
        kv("Filing fee", usdF(o.fee)) + kv("Minimum age", o.minAge) + '</div>' +
        (e.ok ? '<div class="pol-good" style="font-size:12px;margin-top:8px">✓ You are eligible</div>' :
          '<div class="pol-warn" style="margin-top:8px">' + e.reasons.map(E).join("<br>") + '</div>') + '</div>';
      h += row(o.icon, "Declare for " + o.name, e.ok ? "File with the " + (party(s.party) || { name: "unaffiliated" }).name : "Not yet eligible", "declare", o.id,
        e.ok ? "" : '<div class="pol-mini" style="align-self:center">Locked</div>');
    });
    h += sec("Party");
    h += row("endorse", "Choose a Party", (party(s.party) || { name: "Unaffiliated" }).name + " · bonuses apply at filing", "party");
    scr("RUN FOR OFFICE", h, openPolitics);
  }
  function openParty() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Party Registration</div><div class="pol-note">Your party colours every campaign and gives a bonus the moment you file. You can change it between races.</div></div>';
    PARTIES.forEach(function (p) {
      h += '<div class="pol-card"><div class="pol-title">' + E(p.name) + ' · ' + E(p.tag) + '</div><div class="pol-note">' + E(p.desc) + '</div></div>';
      h += row(p.icon, "Register " + p.name, s.party === p.id ? "Current party" : p.tag, "setparty", p.id,
        s.party === p.id ? '<div class="pol-good" style="align-self:center;font-size:11px">Selected</div>' : "");
    });
    scr("PARTIES", h, openRun);
  }
  function openCampaign() {
    var s = S(), c = s.campaign;
    if (!c) return openPolitics();
    var o = office(c.office);
    var h = banner() + '<div class="pol-card"><div class="pol-title">Campaign for ' + E(o.name) + '</div><div class="pol-grid">' +
      kv("Election Day", c.electionYear) + kv("Actions left", c.actions + " this year") +
      kv("War chest", usdF(c.warChest)) + kv("Opponent", c.opponent.name) +
      kv("Opponent strength", c.opponent.strength) + kv("Projected vote", odds(c) + "%") + '</div>' +
      meter("Momentum", c.momentum, "#e7b34c") + meter("Approval", s.approval, "#4bc0a0") +
      meter("Name recognition", s.name, "#4a9fd0") + '</div>';
    h += sec("Campaign Actions · " + c.actions + " left");
    CAMPAIGN_ACTS.forEach(function (a) {
      h += row(a.icon, a.name, a.desc, "camp", a.id);
    });
    h += '<div class="pol-card"><div class="pol-note">Age up to reach Election Day. Unused actions are lost; the race is decided on the next birthday.</div></div>';
    h += row("polls", "Polling Detail", "See the full breakdown", "polling");
    h += row("gavel", "Withdraw", "Recover half the war chest", "withdraw");
    scr("CAMPAIGN HEADQUARTERS", h, openPolitics);
  }
  function openPolling() {
    var s = S(), c = s.campaign, o = office(c ? c.office : s.office);
    if (!o) return openPolitics();
    var pc = c ? odds(c) : Math.round(clamp(s.approval * .8 + standing() * .2));
    var h = banner() + '<div class="pol-card"><div class="pol-title">Polling · ' + E(o.name) + '</div><div class="pol-grid">' +
      kv(c ? "Projected vote" : "Approval", (c ? pc : Math.round(s.approval)) + "%") +
      kv("Opponent", c ? c.opponent.name : "—") +
      kv("Public standing", standing()) + kv("Name recognition", Math.round(s.name)) +
      kv("War chest", usdF(c ? c.warChest : s.warChest)) + kv("Controversy", Math.round(s.controversy || 0)) + '</div>' +
      meter(c ? "Your projected share" : "Approval", c ? pc : s.approval, "#4bc0a0") +
      meter("Standing", standing(), "#e7b34c") + meter("Name recognition", s.name, "#4a9fd0") + '</div>';
    h += '<div class="pol-card"><div class="pol-title">How the number is built</div><div class="pol-note">Momentum, public standing, Smarts, name recognition, war chest, incumbency and your opponent\'s strength. Dirty tricks and gaffes subtract. Expect a ±10 point swing on the night.</div></div>';
    if (s.polls && s.polls.length) {
      h += sec("Poll History");
      h += '<div class="pol-card">' + s.polls.slice(-8).map(function (p) {
        return '<div class="pol-hist"><b>' + p.y + '</b> · ' + (office(p.office) || {}).name + ' · ' + p.share + '%</div>';
      }).join("") + '</div>';
    }
    if (c) h += row("polls", "Commission an Internal Poll", "Adds a fresh reading (uses an action)", "camp", "poll");
    scr("POLLING", h, function () { c ? openCampaign() : openPolitics(); });
  }
  function openStanding() {
    var s = S(), o = office(s.office);
    var h = banner() + statusCard();
    h += sec("Approval");
    h += row("rally", "Address the Nation", "A prime-time speech · approval and standing", "act", "address");
    h += row("townhall", "Town Hall", "Meet voters face to face", "act", "townhall");
    h += row("polls", "Commission a Poll", "A fresh reading of the numbers", "act", "poll");
    h += row("dossier", "Damage Control", "Spend the war chest to quiet a bad week", "act", "spin");
    if (!o) return openPolitics();
    h += sec("Term");
    h += '<div class="pol-card"><div class="pol-grid">' +
      kv("Office", o.name) + kv("Terms served", s.terms) +
      kv("Term ends", s.termEnd) + kv("Years remaining", Math.max(0, s.termEnd - yr())) +
      kv("Salary", usdF(o.pay) + "/yr") + kv("Bills enacted", s.bills.length) + '</div></div>';
    if (s.scandal) h += row("wanted", "Resolve the Scandal", E(s.scandal.kind) + " · severity " + s.scandal.severity, "scandal");
    scr("APPROVAL & POLLING", h, openPolitics);
  }
  function openLegislation() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">The Legislative Docket</div><div class="pol-note">Twelve bills. Passage depends on approval, cabinet skill and how controversial the bill is. Sign it or veto it once it reaches your desk.</div></div>';
    h += sec("Bills");
    BILLS.forEach(function (b) {
      var done = s.bills.indexOf(b.id) >= 0;
      h += row(b.icon, b.name, done ? "ENACTED" : b.desc, "bill", b.id,
        done ? '<div class="pol-good" style="align-self:center;font-size:11px">Law</div>' : "");
    });
    scr("LEGISLATION", h, openPolitics);
  }
  function openCabinet() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">The Cabinet</div><div class="pol-grid">' +
      kv("Seats filled", Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; }).length + " / 5") +
      kv("Average skill", Math.round(cabinetSkill()) + "%") + '</div><div class="pol-note" style="margin-top:8px">Skilled ministers pass bills and lift approval. Loyal ones keep scandals quiet and cool investigations.</div></div>';
    h += sec("Seats");
    ROLES.forEach(function (r) {
      var a = s.cabinet[r.id];
      h += row(r.icon, r.name, a ? a.name + " · loyalty " + a.loyalty + " · skill " + a.competence + " · " + r.perk : "Vacant · " + r.perk, "appoint", r.id);
      if (a) h += row("exile", "Dismiss " + a.name, "Frees the seat", "fire", r.id);
    });
    scr("THE CABINET", h, openPolitics);
  }
  function openPress() {
    var h = banner() + '<div class="pol-card"><div class="pol-title">Press & Public</div><div class="pol-note">Every appearance moves approval, name recognition and sometimes investigation heat.</div></div>' + sec("Actions");
    h += row("pressconf", "Press Conference", "Take every question · approval and standing", "act", "conference");
    h += row("press", "Spin the Story", "Put your own frame on the week's news", "act", "spin");
    h += row("dossier", "Leak a Memo", "Risky · momentum or a scandal", "act", "leak");
    h += row("debate", "A Long Interview", "A long, unscripted sit-down", "act", "interview");
    h += row("rally", "Address the Nation", "Prime time from the capital", "act", "address");
    scr("PRESS & PUBLIC", h, openPolitics);
  }
  function openConstituents() {
    var h = banner() + '<div class="pol-card"><div class="pol-title">Constituents</div><div class="pol-note">Quiet, unglamorous work. It is also where approval is really won.</div></div>' + sec("Actions");
    h += row("townhall", "Town Hall", "Listen to the district", "act", "townhall");
    h += row("capitol", "Fund a Local Project", "A bridge, a library, a clinic", "act", "project");
    h += row("funds", "Disaster Relief Fund", "Open the purse for a hard year", "act", "relief");
    h += row("endorse", "Ribbon Cutting", "Be seen where it counts", "act", "ribbon");
    h += row("press", "Answer Constituent Letters", "Slow, personal, steady", "act", "letters");
    scr("CONSTITUENTS", h, openPolitics);
  }
  function openControls() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Policy Controls</div><div class="pol-note">Five levers applied every birthday. Tax and spending move money and approval. Press freedom and civil liberties shape heat and resistance. Military spending keeps the legions loyal. Changes take effect on the next Age.</div></div>';
    CONTROLS.forEach(function (c) {
      var v = s.controls[c.id];
      h += '<div class="pol-card"><div class="pol-title">' + E(c.name) + '</div><div class="pol-note">' + E(c.desc) + '</div>' +
        '<div class="pol-ctl"><button data-pol="ctl" data-arg="' + c.id + ':-10">−</button><span class="val">' + v + '</span>' +
        '<button data-pol="ctl" data-arg="' + c.id + ':10">+</button><span class="lbl">' + E(c.name) + '</span></div>' +
        meter(c.name, v, c.id === "press" ? "#4a9fd0" : c.id === "military" ? "#e7b34c" : "#4bc0a0") + '</div>';
    });
    h += row("budget", "Reset to Defaults", "Restore all five levers", "ctlreset");
    scr("POLICY CONTROLS", h, openPolitics);
  }
  function openScandal() {
    var s = S(), sc = s.scandal;
    if (!sc) return openPolitics();
    later(function () {
      card({ tag: "Scandal", iconSrc: ICO("dossier"), title: "A Scandal Is Breaking", close: true,
        lead: E(sc.kind) + " has reached the press. Severity " + sc.severity + "/100. How you handle it will decide whether it fades or ends your career.",
        rows: [["Severity", sc.severity], ["Approval", Math.round(s.approval) + "%"], ["Investigation heat", Math.round(s.heat)],
               ["Press secretary", s.cabinet.press ? s.cabinet.press.name : "Vacant"]],
        choices: [
          ["Come clean in full", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} s.scandal = null; fx({ approval: 6, standing: 5, heat: -10 }); logIt("Confessed to a scandal and it blew over."); openPolitics(); }, "green"],
          ["Deny and stonewall", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} fx({ approval: -5, heat: 12 }); openPolitics(); }],
          ["Blame a staffer", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} s.scandal = null; fx({ approval: -2, heat: 6, infamy: 3 }); var k = Object.keys(s.cabinet)[0]; if (k) delete s.cabinet[k]; openPolitics(); }],
          ["Resign", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} s.scandal = null; leaveOffice("a scandal"); openPolitics(); }, "dark"]
        ] });
    });
  }
  function openReelection() {
    var s = S(), o = office(s.office);
    var h = banner() + '<div class="pol-card"><div class="pol-grid">' +
      kv("Office", o.name) + kv("Terms served", s.terms) +
      kv("Term ends", s.termEnd) + kv("Years left", Math.max(0, s.termEnd - yr())) +
      kv("Approval", Math.round(s.approval) + "%") + kv("War chest", usdF(s.warChest)) + '</div></div>' + sec("Options");
    h += row("ballot", "Launch a Reelection Campaign", "Automatically offered when your term ends", "reelect");
    OFFICES.filter(function (x) { return x.tier > o.tier; }).forEach(function (x) {
      var e = eligible(x);
      h += row(x.icon, "Run for " + x.name, e.ok ? "You are eligible now" : e.reasons[0] || "Not yet eligible", "declare", x.id);
    });
    h += row("exile", "Announce Your Retirement", "Leave at the end of the term with your reputation", "resign");
    scr("REELECTION & SUCCESSION", h, openPolitics);
  }
  function openRise() {
    if (!canRise()) { note("Not yet", "A leadership challenge needs the presidency, the vice presidency, a second gubernatorial term, high military rank or a royal claim.", null, true); return openPolitics(); }
    var s = S(), p = ensurePrep();
    var h = banner() + '<div class="pol-card"><div class="pol-title">A Leadership Challenge</div><div class="pol-note">The assembly is divided and the barracks are restless. Build your backing, then decide whether to move. Fail and you lose every office, your standing and six years of freedom.</div>' +
      meter("Military loyalty", p.mil, "#4bc0a0") + meter("Party backing", p.party, "#e7b34c") +
      meter("Public mandate", p.public, "#4a9fd0") + meter("Treasury control", p.treasury, "#e2604f") +
      '<div class="pol-k" style="margin-top:8px">Current odds: <b class="pol-v">' + riseOdds() + '%</b></div></div>';
    h += sec("Preparations · one each");
    PREPS.forEach(function (x) {
      var done = p.done[x.id];
      h += row(x.icon, x.name, done ? "Already secured" : x.desc, "prep", x.id,
        done ? '<div class="pol-good" style="align-self:center;font-size:11px">Done</div>' : "");
    });
    h += sec("The Move");
    h += row("crown", "Make Your Move", "Odds " + riseOdds() + "% · succeed and become Sovereign", "move", null);
    scr("RISE UP", h, openPolitics);
  }
  function openThrone() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var h = banner() + statusCard();
    h += '<div class="pol-card"><div class="pol-title">Your Course</div><div class="pol-note">' +
      (sv.style === "steward" ? "Serve the people. Build, reform and lower resistance. Slow, durable, remembered kindly."
       : sv.style === "conqueror" ? "Build an empire. Every realm adds annual tribute and respect, but costs legions and feeds backlash."
       : "Rule without restraint. Decrees bring quick money and control, but infamy, Tribunal heat and armies that never stop hunting you.") +
      '</div></div>';
    h += sec("Change Course");
    [["steward", "Serve the People", "capitol"], ["conqueror", "Build an Empire", "map"], ["tyrant", "Rule Without Restraint", "crown"]].forEach(function (x) {
      h += row(x[2], x[1], sv.style === x[0] ? "Current course" : "Switch to this course", "course", x[0],
        sv.style === x[0] ? '<div class="pol-good" style="align-self:center;font-size:11px">Active</div>' : "");
    });
    h += sec("Realm");
    h += row("map", "Conquest", sv.realms.length + " of 10 realms · " + usdF(sv.tribute) + "/yr tribute", "conquest");
    h += row("capitol", "Stewardship", "Six projects for the people", "steward");
    h += row("dossier", "Decrees", Object.keys(sv.decrees).filter(function (k) { return sv.decrees[k]; }).length + " in force", "repression");
    h += row("helmet", "The Legions", Math.round(sv.soldiers).toLocaleString() + " soldiers", "legions");
    h += row("wanted", "The Tribunal", sv.mostWanted ? "MOST WANTED" : "Heat " + sv.heat + "/100", "tribunal");
    h += row("hourglass", "Abdicate", "End the reign", "abdicate");
    scr("THE THRONE ROOM", h, openPolitics);
  }
  function openConquest() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var h = banner() + '<div class="pol-card"><div class="pol-title">The Map</div><div class="pol-note">Ten invented realms. Each conquest costs legions and money, and adds annual tribute plus respect. It also adds backlash and resistance. A failed campaign brings a little plunder, heavier losses and open civilian contempt.</div>' +
      '<div class="pol-grid" style="margin-top:9px">' +
      kv("Legions", Math.round(sv.soldiers).toLocaleString()) + kv("Tribute", usdF(sv.tribute) + "/yr") +
      kv("Realms held", sv.realms.length + " / 10") + kv("Resistance", Math.round(sv.resistance)) + '</div></div>';
    h += sec("Realms");
    REALMS.forEach(function (r) {
      var held = sv.realms.indexOf(r.id) >= 0;
      h += row(r.icon, r.name, held ? "PAYS TRIBUTE · " + usdF(r.tribute) + "/yr" :
        "Defence " + r.defence + " · needs " + r.soldiers.toLocaleString() + " legions · " + usdF(r.tribute) + "/yr · odds " + conquestOdds(r) + "%",
        "invade", r.id, held ? '<div class="pol-good" style="align-self:center;font-size:11px">Held</div>' : "");
    });
    scr("CONQUEST", h, openThrone);
  }
  function openSteward() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var h = banner() + '<div class="pol-card"><div class="pol-title">Stewardship</div><div class="pol-note">Spend the treasury on the governed. Projects lift approval, lower resistance and soften infamy.</div></div>' + sec("Projects");
    PROJECTS.forEach(function (p) {
      h += row(p.icon, p.name, p.desc + " · " + usdF(p.cost), "proj", p.id);
    });
    scr("STEWARDSHIP", h, openThrone);
  }
  function openRepression() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var active = Object.keys(sv.decrees).filter(function (k) { return sv.decrees[k]; });
    var h = banner() + '<div class="pol-card"><div class="pol-title">Decrees in Force (' + active.length + ' / 6)</div>' +
      '<div class="pol-note">Each decree brings money and control every year, but also infamy, Tribunal heat, resistance and falling approval. Enough heat puts you on the Most Wanted list, and then coalition armies and your own commanders start hunting you.</div>' +
      meter("Infamy", sv.infamy, "#a06bd0") + meter("Tribunal heat", sv.heat, "#e2604f") +
      meter("Resistance", sv.resistance, "#e2604f") + meter("Legion loyalty", sv.loyalty, "#4bc0a0") + '</div>';
    h += sec("Decrees · toggle");
    DECREES.forEach(function (d) {
      var on = !!sv.decrees[d.id];
      h += row(d.icon, d.name, (on ? "IN FORCE · " : "") + d.desc, "decree", d.id,
        on ? '<div class="pol-bad" style="align-self:center;font-size:11px">On</div>' : "");
    });
    h += row("chains", "Repeal Every Decree", "A clean break · heat and infamy fall", "repeal");
    scr("DECREES", h, openThrone);
  }
  function openLegions() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var h = banner() + '<div class="pol-card"><div class="pol-grid">' +
      kv("Soldiers", Math.round(sv.soldiers).toLocaleString()) + kv("Equipment level", sv.legionLevel + " / 5") +
      kv("Loyalty", Math.round(sv.loyalty)) + kv("Annual upkeep", usdF(Math.round(sv.soldiers * 2.4))) + '</div></div>' + sec("The Legions");
    h += row("helmet", "Recruit 4,000", "Costs " + usdF(28000), "legion", "recruit");
    h += row("swords", "Train & Equip", "Raise equipment level · " + usdF(52000), "legion", "train");
    h += row("endorse", "Pay a Bonus", "Lift loyalty · " + usdF(36000), "legion", "bonus");
    h += row("exile", "Disband 4,000", "Cut upkeep, cut strength", "legion", "disband");
    scr("THE LEGIONS", h, openThrone);
  }
  function openTribunal() {
    var s = S(), sv = s.sovereign;
    if (!sv) return openPolitics();
    var h = banner() + '<div class="pol-card"><div class="pol-title">The Tribunal</div><div class="pol-grid">' +
      kv("Status", sv.mostWanted ? "MOST WANTED" : "Not listed") + kv("Heat", Math.round(sv.heat) + "/100") +
      kv("Infamy", Math.round(sv.infamy)) + kv("Coalitions", sv.resistance > 38 ? "Mustering" : "Quiet") + '</div>' +
      meter("Tribunal heat", sv.heat, "#e2604f") + meter("Infamy", sv.infamy, "#a06bd0") +
      '<div class="pol-note" style="margin-top:8px">At 60 heat your name heads the list. Other realms\' armies and your own disloyal commanders close in every year.</div></div>';
    h += sec("Responses");
    h += row("dossier", "Go Underground", "Heat −16, standing −3", "trib", "underground");
    h += row("treaty", "Open Negotiations", "Costs " + usdF(55000) + " · heat −10", "trib", "negotiate");
    h += row("swords", "Strike at the Tribunal", "Legions −1,800 · infamy +10", "trib", "strike");
    h += row("prison", "Surrender", "End the reign", "trib", "surrender");
    scr("THE TRIBUNAL", h, openThrone);
  }
  function openArchive() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Political Archive</div><div class="pol-grid">' +
      kv("Nation", s.nation) + kv("Offices held", s.held.map(function (x) { return (office(x) || { name: x }).name; }).join(", ") || "None") +
      kv("Bills enacted", s.bills.length) + kv("Entries", s.history.length) + '</div></div>';
    h += sec("Career");
    h += row("ballot", "Back to Political Career", "Return to the hub", "hub");
    h += '<div class="pol-card">' + (s.history.length ? s.history.slice(-40).reverse().map(function (e) {
      return '<div class="pol-hist"><b>' + e.y + '</b> · ' + E(e.t) + '</div>';
    }).join("") : '<div class="pol-note">Nothing recorded yet. File for your first race.</div>') + '</div>';
    if (s.legacy.length) {
      h += sec("Legacy");
      h += '<div class="pol-card">' + s.legacy.map(function (l) { return '<div class="pol-hist"><b>' + l.y + '</b> · ' + E(l.t) + '</div>'; }).join("") + '</div>';
    }
    scr("POLITICAL ARCHIVE", h, openPolitics);
  }
  function openHowto() {
    var h = banner() + '<div class="pol-card"><div class="pol-title">How a Political Life Works</div><div class="pol-note">' +
      "Start at 18 from Activities → Political Career. Register a party, then file for Mayor. Elections resolve on your next birthday: you get three campaign actions a year to raise money, rally, advertise, debate, canvass, dig, seek endorsements or poll.<br><br>" +
      "Winning installs a real job with a salary and a four-year term. In office you manage approval, pass twelve possible bills, fill a five-seat cabinet, work the press and your constituents, and set five policy sliders that apply every birthday. Scandals, recall petitions and impeachment can end you early. At the end of a term you can run again, seek higher office, or retire.<br><br>" +
      "From the presidency, the vice presidency, a second gubernatorial term, high military rank or a royal claim, Rise Up lets you challenge for supreme power. As Sovereign you choose to serve the people, build an empire across ten invented realms, or rule by decree. Each realm conquered adds annual tribute and respect but costs legions and feeds backlash; a failed campaign leaves you with a little plunder and a furious public. Decrees bring quick money and infamy, and at 60 Tribunal heat you become Most Wanted — coalition armies and your own officers will keep coming until you abdicate, negotiate, or are overthrown." +
      '</div></div>';
    h += row("ballot", "See the Offices", "Eligibility and salaries", "run");
    scr("HOW IT WORKS", h, openPolitics);
  }

  /* ------------------------------------------------------------------ *
   * Dispatch
   * ------------------------------------------------------------------ */
  var ACTS = {
    address: { approval: 6, standing: 3, name: 3, happiness: 2 },
    townhall: { approval: 5, standing: 2, happiness: 1 },
    poll: { name: 1 },
    conference: { approval: 4, name: 4, heat: -2 },
    spin: { approval: 3, heat: -4 },
    interview: { approval: 3, name: 5, controversy: 3 },
    leak: { momentum: 6, heat: 7, scandal: 0 },
    project: { approval: 6, standing: 3, money: -14000 },
    relief: { approval: 8, standing: 4, money: -18000 },
    ribbon: { approval: 3, name: 3 },
    letters: { approval: 4, standing: 2, happiness: -1 }
  };
  function dispatch(act, arg) {
    var s = S();
    switch (act) {
      case "run": return openRun();
      case "party": return openParty();
      case "setparty":
        s.party = arg; logIt("Registered with the " + (party(arg) || {}).name + ".");
        note("Registered", "You are now with the " + (party(arg) || {}).name + ".", null, true); return openParty();
      case "declare": { var o = office(arg); if (!o) return; if (s.office) leaveOffice("to run for another office"); declare(o); return; }
      case "campaign": return openCampaign();
      case "polling": return openPolling();
      case "withdraw":
        if (s.campaign) { var half = Math.round(s.campaign.warChest / 2); s.campaign = null; money(half); fx({ name: 3 }); logIt("Withdrew from a race."); }
        return openPolitics();
      case "camp": {
        var c = s.campaign; if (!c) return openPolitics();
        if (c.actions <= 0) { note("Out of actions", "Age up to reach the next year of the campaign.", null, true); return openCampaign(); }
        var a = null; CAMPAIGN_ACTS.forEach(function (x) { if (x.id === arg) a = x; });
        if (!a) return openCampaign();
        var msg = a.go(c);
        c.actions--;
        logIt(a.name + ": " + msg);
        note(a.name, msg + " (" + c.actions + " actions left)", null, true);
        return openCampaign();
      }
      case "standing": return openStanding();
      case "legislation": return openLegislation();
      case "bill": { var b = bill(arg); if (!b) return; if (s.bills.indexOf(b.id) >= 0) { note("Already law", b.name + " is already enacted.", null, true); return openLegislation(); } propose(b); return; }
      case "cabinet": return openCabinet();
      case "appoint": { var r = role(arg); if (!r) return; appoint(r); return; }
      case "fire":
        if (s.cabinet[arg]) { logIt("Dismissed " + s.cabinet[arg].name + "."); delete s.cabinet[arg]; fx({ approval: -2 }); }
        return openCabinet();
      case "press": return openPress();
      case "constituents": return openConstituents();
      case "controls": return openControls();
      case "ctl": {
        var bits = String(arg).split(":"), cid = bits[0], delta = parseInt(bits[1], 10) || 0;
        s.controls[cid] = clamp((s.controls[cid] || 0) + delta, 0, 100);
        logIt("Set " + (control(cid) || {}).name + " to " + s.controls[cid] + ".");
        return openControls();
      }
      case "ctlreset":
        CONTROLS.forEach(function (c) { s.controls[c.id] = c.def; });
        note("Reset", "All five policy levers are back to defaults.", null, true); return openControls();
      case "act":
        if (ACTS[arg]) { var e = ACTS[arg]; if (arg === "leak" && chance(.3)) pendingScandal("a leaked memo"); fx(e); logIt("Press & public: " + arg + "."); }
        return (s.sovereign ? openThrone() : openPolitics());
      case "scandal": return openScandal();
      case "reelection": return openReelection();
      case "reelect": {
        var oo = office(s.office); if (!oo) return openPolitics();
        s.campaign = { office: oo.id, party: s.party || "independent", electionYear: yr() + 1, actions: 3,
          warChest: Math.max(s.warChest, 12000), momentum: clamp(48 + ri(-5, 8)),
          opponent: opponentFor(oo), dirty: 0, gaffes: 0, incumbent: true, note: [] };
        s.termEnd = yr() + 1; s.termEvent = false;
        logIt("Launched an early reelection campaign."); return openCampaign();
      }
      case "resign":
        later(function () {
          card({ tag: "Politics", iconSrc: ICO("exile"), title: "Resign?", close: true,
            lead: "Leave office now? You keep your reputation and your war chest, but lose the salary and the seat.",
            rows: [["Office", (office(s.office) || {}).name || "Sovereign"], ["Approval", Math.round(s.approval) + "%"]],
            choices: [["Stay", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openPolitics(); }, "green"],
                      ["Resign", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} fx({ standing: 5 }); leaveOffice("resigned"); openPolitics(); }]] });
        }); return;
      case "rise": return openRise();
      case "prep": {
        var p = ensurePrep(); if (p.done[arg]) return openRise();
        var pr = null; PREPS.forEach(function (x) { if (x.id === arg) pr = x; });
        if (!pr) return openRise();
        p.done[arg] = true;
        ["mil", "party", "public", "treasury"].forEach(function (k) { if (pr.fx[k] != null) p[k] = clamp(p[k] + pr.fx[k], 0, 100); });
        fx({ money: pr.fx.money || 0, heat: pr.fx.heat || 0, infamy: pr.fx.infamy || 0, name: pr.fx.name || 0, loyalty: pr.fx.loyalty || 0 });
        logIt("Rise Up preparation: " + pr.name + ".");
        note(pr.name, "Backing improved. Odds are now " + riseOdds() + "%.", null, true);
        return openRise();
      }
      case "move": return attemptRise();
      case "throne": return openThrone();
      case "course":
        if (s.sovereign) { s.sovereign.style = arg; logIt("Set the realm's course to " + arg + "."); note("Course Set", "The realm now follows: " + arg + ".", null, true); }
        return openThrone();
      case "conquest": return openConquest();
      case "invade": { var rr = realm(arg); if (rr) conquer(rr); return; }
      case "steward": return openSteward();
      case "proj": {
        var pj = project(arg); if (!pj || !s.sovereign) return;
        if ((state.money || 0) < pj.cost) { note("Cannot afford", pj.name + " costs " + usdF(pj.cost) + ".", null, true); return openSteward(); }
        fx(pj.fx); money(-pj.cost);
        s.sovereign.infamy = clamp(s.sovereign.infamy - 2);
        logIt("Completed " + pj.name + ".");
        note(pj.name, "The project is finished.", null, true); return openSteward();
      }
      case "repression": return openRepression();
      case "decree": {
        if (!s.sovereign) return;
        s.sovereign.decrees[arg] = !s.sovereign.decrees[arg];
        var d = decree(arg);
        logIt((s.sovereign.decrees[arg] ? "Issued" : "Repealed") + " the " + d.name + " decree.");
        note(d.name, s.sovereign.decrees[arg] ? "The decree is in force." : "The decree is repealed.", null, true);
        return openRepression();
      }
      case "repeal":
        if (s.sovereign) { s.sovereign.decrees = {}; fx({ heat: -20, infamy: -10, resistance: -8, approval: 6 }); logIt("Repealed every decree."); }
        return openRepression();
      case "legions": return openLegions();
      case "legion": {
        var sv = s.sovereign; if (!sv) return;
        if (arg === "recruit") { money(-28000); sv.soldiers += 4000; logIt("Recruited 4,000 legionaries."); }
        if (arg === "train") { if ((state.money || 0) < 52000) return note("Cannot afford", "Training costs " + usdF(52000) + ".", null, true) || openLegions(); money(-52000); sv.legionLevel = Math.min(5, sv.legionLevel + 1); logIt("Legions equipped to level " + sv.legionLevel + "."); }
        if (arg === "bonus") { money(-36000); sv.loyalty = clamp(sv.loyalty + 12); logIt("Paid the legions a bonus."); }
        if (arg === "disband") { sv.soldiers = Math.max(0, sv.soldiers - 4000); sv.loyalty = clamp(sv.loyalty - 5); logIt("Disbanded 4,000 legionaries."); }
        return openLegions();
      }
      case "tribunal": return openTribunal();
      case "trib": {
        var sv2v = s.sovereign; if (!sv2v) return;
        if (arg === "underground") { fx({ heat: -16, approval: -6, standing: -3 }); logIt("Went underground."); }
        if (arg === "negotiate") { fx({ money: -55000, heat: -10, infamy: -3 }); logIt("Negotiated with the Tribunal."); }
        if (arg === "strike") { fx({ soldiers: -1800, infamy: 10, heat: 10 }); logIt("Struck at the Tribunal."); }
        if (arg === "surrender") return endReign("surrendered to the Tribunal");
        return openTribunal();
      }
      case "abdicate":
        later(function () {
          card({ tag: "Realm", iconSrc: ICO("hourglass"), title: "Abdicate?", close: true,
            lead: "Give up the crown and retire as a private citizen. Your reign is recorded in the archive.",
            rows: [["Years reigning", s.sovereign ? s.sovereign.reignYears : 0], ["Realms held", s.sovereign ? s.sovereign.realms.length : 0]],
            choices: [["Stay", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openThrone(); }, "green"],
                      ["Abdicate", function () {
                        playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
                        var held = s.sovereign ? s.sovereign.realms.length : 0;
                        s.legacy.push({ y: yr(), t: "Sovereign of " + s.nation + ", " + held + " realms, abdicated peacefully." });
                        s.sovereign = null; s.office = null;
                        try { state.job = null; renderAvatar(); renderStats(); } catch (x) {}
                        fx({ standing: 8, approval: 4 });
                        logIt("Abdicated."); openPolitics();
                      }]] });
        }); return;
      case "archive": return openArchive();
      case "howto": return openHowto();
      default: return openPolitics();
    }
  }

  /* ------------------------------------------------------------------ *
   * Hook-up
   * ------------------------------------------------------------------ */
  function onActivities() {
    try {
      if (!sList || sList.querySelector('[data-pol="hub"]')) return;
      var s = S(), sub;
      if (s.sovereign) sub = "Sovereign of " + s.nation + " · " + s.sovereign.realms.length + " realms";
      else if (s.office) sub = (office(s.office) || {}).name + " · approval " + Math.round(s.approval) + "%";
      else if (s.campaign) sub = "On the trail · election " + s.campaign.electionYear;
      else sub = "Run for office, win power, shape the nation";
      sList.insertAdjacentHTML("afterbegin",
        '<div class="sec">Public Life</div>' + row("capitol", "Political Career", sub, "hub"));
      var r = sList.querySelector('[data-pol="hub"]');
      if (r) r.onclick = function () { playSfx(); openPolitics(); };
    } catch (e) {}
  }
  function hookYear() {
    try {
      var ab = document.getElementById("ageBtn");
      if (ab) ab.addEventListener("click", function () { try { tick(); } catch (e) {} });
    } catch (e) {}
  }
  function hookSpecialCareers() {
    try {
      var orig = window.openSpecialCareers;
      if (!orig) return;
      window.openSpecialCareers = function () {
        var r = orig.apply(this, arguments);
        try {
          sList.querySelectorAll('[data-pack="politician"]').forEach(function (el) {
            el.classList.remove("dis");
            el.querySelector(".t span").textContent = "Open the full political career";
            el.onclick = function () { playSfx(); openPolitics(); };
          });
        } catch (e) {}
        return r;
      };
    } catch (e) {}
  }
  function hookMenuFeatures() {
    try {
      var MF = window.MENU_FEATURES;
      if (!MF) return;
      if (Array.isArray(MF.ACTIVITY_LIST) && !MF.ACTIVITY_LIST.some(function (x) { return x[0] === "politics"; }))
        MF.ACTIVITY_LIST.push(["politics", "Political Career", "capitol"]);
      if (MF.launchActivity) {
        var orig = MF.launchActivity;
        MF.launchActivity = function (k) {
          if (k === "politics") return openPolitics();
          return orig.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  function boot() {
    css();
    hookYear();
    hookSpecialCareers();
    hookMenuFeatures();
    window.POLITICS = {
      OFFICES: OFFICES, PARTIES: PARTIES, BILLS: BILLS, ROLES: ROLES,
      CONTROLS: CONTROLS, REALMS: REALMS, PROJECTS: PROJECTS, DECREES: DECREES,
      EVENTS: EVENTS, CAMPAIGN_ACTS: CAMPAIGN_ACTS, PREPS: PREPS,
      S: S, fresh: fresh, yr: yr, standing: standing, eligible: eligible,
      canRise: canRise, odds: odds, riseOdds: riseOdds, conquestOdds: conquestOdds,
      declare: declare, resolveElection: resolveElection, takeOffice: takeOffice,
      leaveOffice: leaveOffice, crown: crown, endReign: endReign,
      conquer: conquer, tick: tick, fx: fx, fireEvent: fireEvent, logIt: logIt,
      propose: propose, appoint: appoint, attemptRise: attemptRise,
      onActivities: onActivities, openPolitics: openPolitics, openRun: openRun,
      openCampaign: openCampaign, openPolling: openPolling, openThrone: openThrone,
      openConquest: openConquest, openRepression: openRepression, openLegions: openLegions,
      openTribunal: openTribunal, openArchive: openArchive, openHowto: openHowto,
      openParty: openParty, openStanding: openStanding, openLegislation: openLegislation,
      openCabinet: openCabinet, openPress: openPress, openConstituents: openConstituents,
      openControls: openControls, openScandal: openScandal, openReelection: openReelection,
      openRise: openRise, openSteward: openSteward,
      dispatch: dispatch, ICO: ICO
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
