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
 *  • In office: approval, term limits, a 30-bill legislative docket, an
 *    eight-seat cabinet, press & public, constituent work, twelve policy
 *    levers, a briefing-room card deck, executive orders, standing
 *    committees, field operations, a situation room and a political calendar.
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
      desc: "Review old sentences and grant pardons.", fx: { approval: 3, standing: 7, money: -5000 } },
    { id: "library", name: "Public Libraries Act", icon: "bill", cat: "Civic", cost: 14000, controversy: 8, desc: "Open a free library in every district.", fx: {approval: 5, smarts: 2, money: -14000} },
    { id: "harbour2", name: "Harbour Modernisation", icon: "map", cat: "Infrastructure", cost: 30000, controversy: 12, desc: "Rebuild the quays and dredge the channel.", fx: {money: 38000, standing: 3, approval: 2} },
    { id: "water", name: "Clean Water Mandate", icon: "flag", cat: "Infrastructure", cost: 21000, controversy: 14, desc: "Bind every supplier to a pure-water standard.", fx: {approval: 7, health: 3, money: -21000} },
    { id: "wages", name: "Minimum Wage Ordinance", icon: "funds", cat: "Economy", cost: 6000, controversy: 24, desc: "Set a floor under a day's pay.", fx: {approval: 9, standing: 4, money: -12000} },
    { id: "land", name: "Land Registry Reform", icon: "dossier", cat: "Justice", cost: 9000, controversy: 16, desc: "Put every title on one public roll.", fx: {standing: 6, money: 16000, approval: -2} },
    { id: "court2", name: "Court Modernisation Bill", icon: "gavel", cat: "Justice", cost: 17000, controversy: 10, desc: "More benches, shorter waits, open hearings.", fx: {heat: -8, approval: 4, money: -17000} },
    { id: "fire", name: "Fire Brigades Act", icon: "storm", cat: "Civic", cost: 13000, controversy: 6, desc: "A paid brigade in every ward.", fx: {approval: 6, health: 1, money: -13000} },
    { id: "market2", name: "Market Charter", icon: "budget", cat: "Economy", cost: 7000, controversy: 18, desc: "Licence the markets and standardise weights.", fx: {money: 22000, approval: -3, standing: 2} },
    { id: "parks", name: "Public Parks Act", icon: "capitol", cat: "Civic", cost: 16000, controversy: 5, desc: "Set aside ground that can never be built on.", fx: {approval: 6, happiness: 3, money: -16000} },
    { id: "audit2", name: "Independent Audit Office", icon: "dossier", cat: "Oversight", cost: 11000, controversy: 20, desc: "An auditor who reports to the public, not to you.", fx: {heat: -10, standing: 7, approval: -3} },
    { id: "veterans2", name: "Veterans' Charter", icon: "medal", cat: "Civic", cost: 19000, controversy: 8, desc: "Pensions, care and a place on the roll.", fx: {standing: 6, approval: 5, money: -19000} },
    { id: "child", name: "Child Welfare Act", icon: "townhall", cat: "Social", cost: 24000, controversy: 9, desc: "Inspectors, meals and a guardian for every child.", fx: {approval: 8, health: 2, money: -24000} },
    { id: "energy", name: "Grid & Lamp Standards", icon: "bill", cat: "Infrastructure", cost: 27000, controversy: 15, desc: "One standard for every lamp and line.", fx: {approval: 5, money: 12000, standing: 2} },
    { id: "rail", name: "Rail Safety Code", icon: "map", cat: "Infrastructure", cost: 20000, controversy: 11, desc: "Binding rules for every carriage and signal.", fx: {approval: 4, health: 2, money: -20000} },
    { id: "ombuds", name: "Ombudsman Act", icon: "justice", cat: "Oversight", cost: 8000, controversy: 13, desc: "An independent office for public complaints.", fx: {standing: 6, heat: -6, approval: 2} },
    { id: "records", name: "Public Records Act", icon: "press", cat: "Oversight", cost: 5000, controversy: 17, desc: "Department papers open after a fixed term.", fx: {standing: 5, name: 3, heat: -4, approval: -2} },
    { id: "coinage2", name: "Currency Stabilisation Act", icon: "budget", cat: "Economy", cost: 12000, controversy: 21, desc: "Bind the mint to a published reserve.", fx: {money: 30000, approval: -4, standing: 3} },
    { id: "border2", name: "Border & Customs Accord", icon: "treaty", cat: "Foreign", cost: 14000, controversy: 19, desc: "One schedule of dues across every crossing.", fx: {money: 24000, standing: 4, approval: -3} },
  ];
  function bill(id) { for (var i = 0; i < BILLS.length; i++) if (BILLS[i].id === id) return BILLS[i]; return null; }

  var ROLES = [
    { id: "chief", name: "Chief of Staff", icon: "cabinet", perk: "Approval drift +1/yr" },
    { id: "treasurer", name: "Treasurer", icon: "budget", perk: "Annual revenue +4%" },
    { id: "press", name: "Press Secretary", icon: "pressconf", perk: "Scandal severity -20%" },
    { id: "attorney", name: "Attorney General", icon: "justice", perk: "Investigation heat -3/yr" },
    { id: "defence", name: "Defence Chief", icon: "helmet", perk: "Military loyalty +2/yr" },
    { id: "health", name: "Minister for Health", icon: "townhall", perk: "+2 Health each year", perkFx: {health: 2} },
    { id: "interior", name: "Interior Minister", icon: "dossier", perk: "Investigation heat −3 each year", perkFx: {heat: -3} },
    { id: "foreign", name: "Foreign Secretary", icon: "treaty", perk: "+2 public standing each year", perkFx: {standing: 2} },
  ];
  function role(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i]; return null; }

  var CONTROLS = [
    { id: "tax", name: "Tax Rate", icon: "budget", def: 40, desc: "Higher rates fill the treasury and cost approval." },
    { id: "spend", name: "Public Spending", icon: "funds", def: 45, desc: "Investment lifts approval but drains the treasury." },
    { id: "press", name: "Press Freedom", icon: "press", def: 70, desc: "A free press lifts standing; clamping down builds heat." },
    { id: "military", name: "Military Spending", icon: "swords", def: 40, desc: "Keeps the generals loyal and the legions equipped." },
    { id: "liberty", name: "Civil Liberties", icon: "chains", def: 65, desc: "Liberty lifts approval; removing it feeds resistance." },
    { id: "health", name: "Public Health", icon: "townhall", def: 50, desc: "Clinics, wells and inspectors. Costs coin, lifts health and approval.", year: {money: -900, health: 0.12, approval: 0.16} },
    { id: "education", name: "Education Budget", icon: "bill", def: 50, desc: "Teachers, books and academies. Lifts Smarts and approval.", year: {money: -850, smarts: 0.1, approval: 0.12} },
    { id: "housing", name: "Housing & Planning", icon: "capitol", def: 45, desc: "New estates and repairs. Expensive, but approval follows.", year: {money: -1200, approval: 0.2, standing: 0.06} },
    { id: "trade", name: "Trade Tariffs", icon: "treaty", def: 35, desc: "Duties on imports fill the treasury and cool goodwill abroad.", year: {money: 1400, standing: -0.08, approval: -0.06} },
    { id: "justice", name: "Court Funding", icon: "gavel", def: 55, desc: "More benches cool investigations and lift approval slightly.", year: {money: -700, heat: -0.14, approval: 0.05} },
    { id: "environment", name: "Environmental Standards", icon: "flag", def: 50, desc: "Cleaner rivers and air raise standing at a cost to industry.", year: {money: -550, standing: 0.12, approval: -0.04} },
    { id: "welfare", name: "Welfare & Pensions", icon: "funds", def: 45, desc: "The most expensive lever, and the strongest approval lift.", year: {money: -1500, approval: 0.24, standing: 0.08} },
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
    { id: "caldria", name: "Caldria Reach", icon: "laurel", defence: 92, soldiers: 9000, tribute: 340000, backlash: 24, desc: "The strongest realm on the map. Conquer it and they will never forget." },
    { id: "borovia", name: "Borovia Vale", icon: "map", defence: 30, soldiers: 2200, tribute: 78000, backlash: 8, desc: "Orchard valleys with a light levy." },
    { id: "selwyn", name: "Selwyn Marches", icon: "flag", defence: 50, soldiers: 4100, tribute: 152000, backlash: 13, desc: "A border people who fight in squares." },
    { id: "draken", name: "Drakenhold", icon: "crown", defence: 78, soldiers: 7200, tribute: 268000, backlash: 20, desc: "A fortress state with deep muster rolls." },
    { id: "aureate", name: "Aureate Crown", icon: "laurel", defence: 100, soldiers: 10500, tribute: 410000, backlash: 27, desc: "The richest and best-defended realm on the map." },
  ];
  function realm(id) { for (var i = 0; i < REALMS.length; i++) if (REALMS[i].id === id) return REALMS[i]; return null; }

  var PROJECTS = [
    { id: "granaries", name: "Open the Granaries", icon: "funds", cost: 30000, desc: "Release the reserve in a lean year.", fx: { approval: 9, resistance: -6, standing: 3 } },
    { id: "works", name: "Great Public Works", icon: "capitol", cost: 80000, desc: "Roads, bridges and aqueducts.", fx: { approval: 7, standing: 6, resistance: -3 } },
    { id: "charter", name: "Reform Charter", icon: "bill", cost: 45000, desc: "Write a constitution that limits your own power.", fx: { approval: 11, standing: 9, infamy: -8, resistance: -8 } },
    { id: "amnesty", name: "Grant Amnesty", icon: "chains", cost: 20000, desc: "Pardon dissenters and empty the cells.", fx: { approval: 6, infamy: -6, heat: -12, resistance: -10 } },
    { id: "envoys", name: "Diplomatic Corps", icon: "treaty", cost: 55000, desc: "Send envoys to calm the coalition.", fx: { standing: 8, resistance: -12, infamy: -4 } },
    { id: "schools", name: "Realm Schools", icon: "townhall", cost: 65000, desc: "Teach every child in the provinces.", fx: { approval: 8, smarts: 3, resistance: -5, standing: 5 } },
    { id: "hospitals", name: "Realm Hospitals", icon: "townhall", cost: 70000, desc: "A house of healing in every province.", fx: {approval: 9, health: 4, resistance: -4} },
    { id: "canals", name: "Great Canals", icon: "capitol", cost: 95000, desc: "Waterways that bind the provinces together.", fx: {money: 40000, standing: 5, resistance: -3} },
    { id: "archive2", name: "The Open Archive", icon: "press", cost: 35000, desc: "Every decree and account made public.", fx: {standing: 7, infamy: -4, resistance: -3} },
    { id: "council", name: "A Council of Realms", icon: "cabinet", cost: 60000, desc: "Give the provinces a standing voice.", fx: {approval: 8, resistance: -10, loyalty: 3} },
  ];
  function project(id) { for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i]; return null; }

  var DECREES = [
    { id: "secret", name: "Secret Police", icon: "dossier", desc: "Plain-clothed watchers in every district.", fx: { loyalty: 4, infamy: 6, heat: 5, resistance: 5, approval: -5, money: 14000 } },
    { id: "censor", name: "Censor the Press", icon: "press", desc: "Licence every printer and close hostile sheets.", fx: { infamy: 4, heat: 4, resistance: 4, approval: -4, money: 6000 } },
    { id: "decrees", name: "Emergency Decrees", icon: "gavel", desc: "Rule by proclamation instead of assembly.", fx: { loyalty: 3, infamy: 5, heat: 6, resistance: 6, approval: -6, money: 18000 } },
    { id: "trials", name: "Show Trials", icon: "justice", desc: "Public hearings for accused rivals.", fx: { infamy: 8, heat: 8, resistance: 7, approval: -8, money: 11000 } },
    { id: "purge", name: "Purge the Court", icon: "exile", desc: "Dismiss officers whose loyalty is in doubt.", fx: { loyalty: 8, infamy: 9, heat: 9, resistance: 9, approval: -9, money: 22000 } },
    { id: "seal", name: "Seal the Borders", icon: "prison", desc: "Nobody leaves or enters without a warrant.", fx: { loyalty: 2, infamy: 5, heat: 5, resistance: 6, approval: -7, money: 9000 } },
    { id: "levy", name: "Forced Levy", icon: "funds", desc: "Take coin and grain from every household.", fx: {loyalty: 3, money: 26000, resistance: 5, approval: -6, infamy: 4, heat: 4} },
    { id: "curfew", name: "Nightly Curfew", icon: "prison", desc: "Nobody abroad after the bell without a pass.", fx: {loyalty: 2, resistance: 7, approval: -8, infamy: 5, heat: 5, money: 7000} },
    { id: "titles", name: "Sell Titles", icon: "crown", desc: "Rank goes to whoever can pay for it.", fx: {loyalty: 6, standing: 4, infamy: 5, heat: 4, approval: -3, money: 16000} },
    { id: "oath", name: "An Oath of Person", icon: "dossier", desc: "Every officer swears an oath to you alone.", fx: {loyalty: 7, resistance: 4, infamy: 4, heat: 3, approval: -5} },
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
      history: [], legacy: [],
      opps: [], oppPlays: 0, oppYr: -1, orders: [], committees: {}, dispatchYr: -1
    };
  }
  function S() {
    var s;
    try { s = state.politics || (state.politics = fresh()); } catch (e) { return fresh(); }
    try {
      if (!s.controls || typeof s.controls !== "object") s.controls = {};
      CONTROLS.forEach(function (c) { if (typeof s.controls[c.id] !== "number") s.controls[c.id] = c.def; });
      if (!Array.isArray(s.opps)) s.opps = [];
      if (typeof s.oppPlays !== "number") s.oppPlays = 0;
      if (typeof s.oppYr !== "number") s.oppYr = -1;
      if (!Array.isArray(s.orders)) s.orders = [];
      if (!s.committees || typeof s.committees !== "object") s.committees = {};
      if (typeof s.dispatchYr !== "number") s.dispatchYr = -1;
      if (!Array.isArray(s.enacted)) s.enacted = [];
      if (!Array.isArray(s.bills)) s.bills = [];
      if (!Array.isArray(s.polls)) s.polls = [];
      if (!Array.isArray(s.history)) s.history = [];
      if (!Array.isArray(s.legacy)) s.legacy = [];
      if (!Array.isArray(s.held)) s.held = [];
      var nums = { approval: 50, name: 12, warChest: 0, heat: 0, controversy: 0,
        terms: 0, termEnd: 0, termYears: 0, cooldown: 0, houseArrest: 0 };
      Object.keys(nums).forEach(function (k) { if (typeof s[k] !== "number") s[k] = nums[k]; });
      if (!s.nation) s.nation = pick(NATIONS);
      if (!s.district) s.district = pick(DISTRICTS);
    } catch (e) {}
    return s;
  }
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
      if (o.bill) {
        var bq = bill(o.bill);
        if (bq && (s.bills || (s.bills = [])).indexOf(bq.id) < 0) {
          s.bills.push(bq.id);
          (s.enacted || (s.enacted = [])).push({ id: bq.id, y: yr() });
          logIt("Enacted " + bq.name + " without a vote.");
        }
      }
      if (o.seat) {
        var vac = ROLES.filter(function (rr) { return !s.cabinet[rr.id]; });
        if (vac.length) {
          var rq = pick(vac), cq = candidateFor(rq);
          s.cabinet[rq.id] = cq;
          logIt("Appointed " + cq.name + " as " + rq.name + ".");
        }
      }
      if (o.poll) {
        (s.polls || (s.polls = [])).push({ y: yr(),
          share: Math.round(clamp(s.approval * .8 + standing() * .2)),
          office: s.office || (s.campaign || {}).office || "mayor" });
      }
      if (o.op) {
        var oq = opp(o.op);
        if (oq && !(s.opps || (s.opps = [])).some(function (h) { return h.id === o.op; }))
          s.opps.push({ id: o.op, y: yr() });
      }
      if (o.scandalClear) s.scandal = null;
      if (o.term) s.termEnd += Math.round(o.term);
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
      go: function (c) { var s = S(), v = odds(c); s.polls.push({ y: yr(), share: v, office: c.office }); return "Internal polling puts you at " + v + "%."; } },
    { id: "letter", name: "Open Letter to Voters", icon: "press", desc: "Print a plain account of what you would do.", go: function (c) { fx({ name: ri(3, 7), momentum: 2 }); return "The letter is in every household."; } },
    { id: "volunteers", name: "Muster Volunteers", icon: "endorse", desc: "Badges, leaflets and a hundred doorsteps.", go: function (c) { fx({ momentum: ri(4, 9), happiness: -2 }); if (chance(.12)) pendingScandal("a volunteer with a loud mouth"); return "The hall is full of volunteers."; } },
    { id: "tour", name: "District Tour", icon: "map", desc: "Spend a week where the votes actually are.", go: function (c) { fx({ approval: ri(2, 5), name: 2, momentum: 2 }); return "Six districts in five days."; } },
    { id: "policy", name: "Launch a Policy Paper", icon: "bill", desc: "A serious document for serious voters.", go: function (c) { var g = .35 + (state.stats.Smarts || 0) / 220; if (chance(g)) { fx({ momentum: ri(6, 12), standing: 3 }); return "The paper was well received."; } fx({ momentum: -3 }); return "Nobody read past the summary."; } },
    { id: "coalition2", name: "Build a Coalition", icon: "cabinet", desc: "Bring smaller blocs onto the platform.", go: function (c) { var g2 = ri(2, 6) * 2200 * office(c.office).tier; c.warChest += g2; fx({ momentum: ri(3, 8), controversy: 2 }); return "Three blocs came aboard with " + usdF(g2) + "."; } },
    { id: "ground", name: "Fund the Ground Game", icon: "funds", desc: "Pay for the unglamorous work that wins counts.", go: function (c) { var cost = Math.min(c.warChest, 4000 * office(c.office).tier); c.warChest -= cost; fx({ momentum: ri(2, 6) }); return "Spent " + usdF(cost) + " on the ground game."; } },
  ];

  /* ------------------------------------------------------------------ *
   * Random events
   * ------------------------------------------------------------------ */
  function EV(id, title, icon, lead, when, choices, w) { return { id: id, title: title, icon: icon, lead: lead, when: when, choices: choices, w: w || 1 }; }
  function C(t, f, color, fxObj) { return { t: t, color: color, fx: fxObj, f: f }; }
  var YES = function (s) { return !!s.office && !s.sovereign; };
  var REIGN = function (s) { return !!s.sovereign; };
  /* Expansion: context gates for the enlarged event pool. */
  var WHEN = {
    Y: YES,
    C: function (s) { return !!s.campaign; },
    T1: function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; },
    T2: function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; },
    T3: function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; },
    T4: function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 4; },
    LO: function (s) { return YES(s) && s.approval < 42; },
    HI: function (s) { return YES(s) && s.approval > 68; },
    HT: function (s) { return YES(s) && s.heat > 28; },
    SC: function (s) { return YES(s) && !!s.scandal; },
    TE: function (s) { return YES(s) && s.termEnd - yr() <= 1; },
    BL: function (s) { return YES(s) && (s.bills || []).length > 0; },
    CB: function (s) { return YES(s) && Object.keys(s.cabinet).some(function (k) { return s.cabinet[k]; }); },
    OLD: function (s) { return YES(s) && yr() < 1950; },
    NEW: function (s) { return YES(s) && yr() >= 1950; },
    R: REIGN,
    TY: function (s) { return REIGN(s) && s.sovereign.style === "tyrant"; },
    CN: function (s) { return REIGN(s) && s.sovereign.style === "conqueror"; },
    ST: function (s) { return REIGN(s) && s.sovereign.style === "steward"; },
    MW: function (s) { return REIGN(s) && !!s.sovereign.mostWanted; },
    WR: function (s) { return REIGN(s) && s.sovereign.resistance > 45; },
    _: YES
  };
  function pickWeighted(a) {
    if (!a || !a.length) return null;
    var tot = 0, i;
    for (i = 0; i < a.length; i++) tot += (a[i].w || 1);
    var r = Math.random() * tot;
    for (i = 0; i < a.length; i++) { r -= (a[i].w || 1); if (r <= 0) return a[i]; }
    return a[a.length - 1];
  }
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
      C("Keep the reserve for the legions", null, "dark", { approval: -9, resistance: 9, loyalty: 4 })]),
    EV("x_market", "The Market Inspectors", "dossier", "Inspectors found short weights in the Northgate market.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Fine the guild and publish the names", null, "green", {approval: 5, standing: 4, money: 6000}),
      C("Quiet warning, no names", null, null, {approval: 2, controversy: 3})], 2),
    EV("x_tram", "A Fare Increase", "budget", "The tram operators want to raise fares again.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Refuse and subsidise the line", null, "green", {approval: 7, money: -14000, standing: 2}),
      C("Let them raise it", null, null, {money: 12000, approval: -6}),
      C("Buy the line for the city", null, null, {money: -46000, approval: 9, controversy: 6})], 2),
    EV("x_strays", "Stray Dogs in the Square", "protest", "Residents want the square cleared; children have been feeding them.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Fund a shelter", null, "green", {approval: 4, happiness: 2, money: -7000}),
      C("Round them up", null, null, {approval: -4, controversy: 4})], 1),
    EV("x_library", "A Library Bequest", "bill", "A dying collector left a building and four thousand books to the district.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Open it as a public library", null, "green", {approval: 6, smarts: 2, standing: 4, money: -9000}),
      C("Sell the collection", null, null, {money: 28000, standing: -5})], 2),
    EV("x_fire", "A Warehouse Fire", "storm", "The Old Harbour warehouse burned through the night.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Lead the relief and rebuild", null, "green", {approval: 9, standing: 4, money: -18000, health: -2}),
      C("Compensate the owners only", null, null, {approval: -3, money: -6000}),
      C("Call it an act of nature", null, "dark", {approval: -8, heat: 6})], 2),
    EV("x_festival", "The Winter Festival", "rally", "The guilds want the winter festival back after a lean year.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Fund it fully", null, "green", {approval: 6, happiness: 4, money: -12000}),
      C("A modest civic observance", null, null, {approval: 2, money: -3000})], 2),
    EV("x_bridge", "The Stonebridge Petition", "capitol", "A cracked bridge has finally produced a petition with real names on it.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Rebuild now", null, "green", {approval: 7, standing: 3, money: -26000}),
      C("Commission a survey first", null, null, {approval: 1, money: -4000})], 2),
    EV("x_play", "A School Play Invitation", "townhall", "The academy asks you to attend its annual pageant.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Go and sit in the front row", null, "green", {approval: 4, happiness: 3, name: 2}),
      C("Send a letter instead", null, null, {approval: 1})], 1),
    EV("x_watermain", "The Water Main Bursts", "storm", "A main under Riverbend has given way.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Emergency repair and standpipes", null, "green", {approval: 7, health: 2, money: -11000}),
      C("Wait for the scheduled works", null, null, {approval: -7, health: -2})], 1),
    EV("x_feud", "A Neighbourhood Feud", "gavel", "Two streets have been quarrelling over a shared well for a generation.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Mediate it yourself", null, "green", {approval: 5, standing: 4, heat: -3}),
      C("Let the magistrate settle it", null, null, {approval: 1, money: -3000})], 1),
    EV("x_census", "The Census Returns", "dossier", "The enumerators have finished their count.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Publish the whole return", null, "green", {standing: 5, approval: 2, name: 2}),
      C("Hold it back for the party", null, "dark", {heat: 7, controversy: 6})], 1),
    EV("x_fuel", "A Winter Fuel Scheme", "funds", "The poor are buying coal by the bucket.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Subsidise fuel", null, "green", {approval: 9, standing: 3, money: -20000}),
      C("Open the public halls as warming rooms", null, null, {approval: 5, money: -5000})], 2),
    EV("x_bakery", "The Bakers' Guild", "endorse", "The guild wants an exclusive charter for the district.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Refuse monopolies", null, "green", {approval: 4, standing: 4}),
      C("Grant it for a donation", null, null, {warChest: 16000, approval: -4, heat: 5})], 1),
    EV("x_ferry", "The River Ferry", "map", "The ferryman is retiring and nobody has taken the oar.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Run it as a civic service", null, "green", {approval: 5, money: -9000, standing: 2}),
      C("Lease the crossing", null, null, {money: 11000, approval: -3})], 1),
    EV("x_clock", "The Clock Tower Stops", "hourglass", "The tower has not struck the hour in a week.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Repair it and keep the bell", null, "green", {approval: 3, happiness: 2, money: -6000}),
      C("Leave it silent", null, null, {approval: -2})], 1),
    EV("x_theatre", "A Theatre Licence", "press", "A troupe wants a licence for a satirical revue.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Grant it", null, "green", {standing: 5, approval: 2, controversy: 4}),
      C("Refuse on grounds of taste", null, null, {approval: -3, heat: 4})], 1),
    EV("x_cemetery", "A Cemetery Dispute", "gavel", "Two families claim the same plot beside the chapel.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Mediate and expand the ground", null, "green", {approval: 4, standing: 3, money: -5000}),
      C("Refer it to the courts", null, null, {approval: 1, money: -3000})], 1),
    EV("x_rats", "A Ratcatcher's Bill", "dossier", "The harbour ward wants a standing ratcatcher.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Hire one for every ward", null, "green", {health: 3, approval: 5, money: -8000}),
      C("One for the harbour only", null, null, {approval: 2, money: -2500})], 1),
    EV("x_lamps", "Street Lamps for Ashfield", "funds", "The Ashfield residents ask for lamps on the hill road.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 1; }, [
      C("Light the whole road", null, "green", {approval: 6, money: -10000, standing: 2}),
      C("Light the crossroads only", null, null, {approval: 2, money: -3000})], 1),
    EV("x_mine", "A Mine Collapse", "storm", "A shaft has caved in near the Karsk road.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Go to the pit head and fund the rescue", null, "green", {approval: 10, standing: 6, money: -24000, health: -3}),
      C("Send the inspectorate", null, null, {approval: 3, heat: -2, money: -9000}),
      C("Leave it to the owners", null, "dark", {approval: -11, heat: 9})], 2),
    EV("x_harvest", "A Failed Harvest", "storm", "The upland fields came in thin again.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Open the regional granaries", null, "green", {approval: 8, resistance: -4, money: -22000}),
      C("Offer low-interest seed loans", null, null, {approval: 4, money: -12000}),
      C("Let the markets adjust", null, "dark", {approval: -9, standing: -4})], 2),
    EV("x_border", "A Border Dispute", "map", "A neighbouring province has moved a boundary stone.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Joint survey and arbitration", null, "green", {standing: 7, approval: 3, money: -8000}),
      C("Send the militia to the line", null, "dark", {controversy: 9, approval: -3, heat: 6})], 1),
    EV("x_militia", "The Militia Muster", "helmet", "The annual muster has drawn a bigger crowd than expected.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Review them and pay the bounty", null, "green", {standing: 5, money: -14000, approval: 2}),
      C("Keep the review short", null, null, {approval: 1})], 1),
    EV("x_cathedral", "Restoring the Cathedral", "capitol", "The roof of the old cathedral is failing.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Fund a full restoration", null, "green", {standing: 8, approval: 4, money: -34000}),
      C("Patch the roof only", null, null, {approval: 2, money: -9000})], 1),
    EV("x_canal", "The Canal Proposal", "map", "Engineers say a canal could join two river systems.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Break ground", null, "green", {money: -52000, standing: 6, approval: 5, controversy: 5}),
      C("Commission a feasibility study", null, null, {approval: 1, money: -6000})], 1),
    EV("x_quarantine", "A Quarantine Order", "townhall", "Sickness in the port has the physicians asking for a cordon.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Order the cordon and pay for relief", null, "green", {health: 4, approval: 4, money: -16000}),
      C("Keep the port open", null, null, {money: 14000, health: -4, approval: -6})], 1),
    EV("x_teachers", "The Teachers Walk Out", "protest", "The academy teachers have closed their doors over pay.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Meet their claim in full", null, "green", {approval: 7, smarts: 2, money: -20000}),
      C("Offer a phased rise", null, null, {approval: 2, money: -8000}),
      C("Replace them", null, "dark", {approval: -8, controversy: 8})], 2),
    EV("x_prison", "A Prison Riot", "prison", "The regional gaol has taken a wing.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Negotiate and open an inquiry", null, "green", {standing: 6, heat: -5, approval: 3}),
      C("Restore order by force", null, null, {approval: -4, heat: 7, infamy: 3})], 1),
    EV("x_toll", "The Road Toll", "budget", "A new toll on the high road is deeply unpopular.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Abolish it", null, "green", {approval: 8, money: -12000}),
      C("Keep it and publish the accounts", null, null, {money: 16000, approval: -4, standing: 2})], 1),
    EV("x_fishery", "A Fishery Treaty", "treaty", "Coastal fleets want a shared season with the neighbouring realm.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Sign a wide agreement", null, "green", {standing: 7, money: 14000, approval: 2}),
      C("Hold out for better terms", null, null, {standing: 3, money: 4000})], 1),
    EV("x_survey", "The Land Survey", "dossier", "A fresh survey would settle a hundred title disputes.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Fund an independent survey", null, "green", {standing: 6, heat: -4, money: -18000}),
      C("Let the old rolls stand", null, null, {approval: -2, controversy: 4})], 1),
    EV("x_drought", "A Long Drought", "storm", "The wells in Southmoor are down to mud.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Dig new wells and cart water", null, "green", {approval: 8, health: 2, money: -19000}),
      C("Ration what remains", null, null, {approval: -3, money: -4000})], 1),
    EV("x_charter", "A Guild Charter", "bill", "The masons want a charter and a seal.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Grant it with public duties", null, "green", {standing: 5, approval: 3, money: 6000}),
      C("Refuse", null, null, {approval: -2})], 1),
    EV("x_judges", "The Judges' Conference", "justice", "The regional bench wants to settle a conflict of rulings.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Host it and publish the result", null, "green", {standing: 6, heat: -6, money: -9000}),
      C("Leave it to the chief judge", null, null, {approval: 1})], 1),
    EV("x_pass", "The Mountain Pass", "map", "Snow has closed the pass for the third winter running.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Fund a permanent road crew", null, "green", {approval: 6, standing: 3, money: -17000}),
      C("Open it when the thaw comes", null, null, {approval: -2})], 1),
    EV("x_salt", "The Salt Tax", "budget", "A levy on salt would fill a gap in the books.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Drop the proposal", null, "green", {approval: 7, standing: 2}),
      C("Enact a small levy", null, null, {money: 22000, approval: -7, controversy: 7})], 1),
    EV("x_post", "The Postal Route", "endorse", "A new mail route could bind the outlying towns together.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Fund the route", null, "green", {standing: 5, approval: 4, money: -13000}),
      C("Let a private contractor run it", null, null, {money: 8000, approval: -2})], 1),
    EV("x_mill", "The Mill Owners' Delegation", "funds", "The mill owners want a relaxation of the working day.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Refuse and inspect the mills", null, "green", {approval: 6, standing: 5, heat: -3}),
      C("Grant it for a contribution", null, null, {warChest: 22000, approval: -6, heat: 7})], 1),
    EV("x_riotfest", "Trouble at the Festival", "protest", "The harvest festival ended with broken windows.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 2; }, [
      C("Pay for the damage and ask questions after", null, "green", {approval: 5, money: -9000, heat: -2}),
      C("Arrest the organisers", null, "dark", {approval: -5, resistance: 5, heat: 6})], 1),
    EV("x_cabinleak", "A Cabinet Leak", "dossier", "Someone at the table is talking to a printer.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Run a quiet internal inquiry", null, "green", {heat: -6, standing: 4, approval: 2}),
      C("Make an example of a junior clerk", null, "dark", {heat: 9, infamy: 4, approval: -4})], 2),
    EV("x_envoy", "An Envoy With a Draft Treaty", "treaty", "A draft accord has arrived with generous terms.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Sign and send it to the assembly", null, "green", {standing: 8, money: 22000, approval: 3}),
      C("Renegotiate the awkward clause", null, null, {standing: 4, approval: 2}),
      C("Reject it publicly", null, "dark", {standing: -7, approval: -3})], 2),
    EV("x_bank", "A Row at the Treasury", "budget", "The treasurer and the assembly cannot agree on the accounts.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Back the treasurer and publish the books", null, "green", {standing: 6, heat: -5, money: 8000}),
      C("Side with the assembly", null, null, {approval: 5, money: -6000})], 1),
    EV("x_defence", "A Defence Review", "helmet", "The generals want a larger establishment.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Approve a modest increase", null, "green", {standing: 4, money: -28000, approval: 2}),
      C("Hold the line on spending", null, null, {approval: 4, money: 12000}),
      C("Give them everything they ask", null, null, {money: -60000, loyalty: 5, approval: -3})], 1),
    EV("x_statevisit", "A State Visit", "crown", "A neighbouring head of state is coming for three days.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Host it properly", null, "green", {standing: 9, name: 5, money: -22000}),
      C("Keep it working and brief", null, null, {standing: 3, approval: 2})], 1),
    EV("x_honours", "The Honours List", "medal", "The list is on your desk and everyone has a suggestion.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Name only public servants", null, "green", {standing: 7, approval: 4}),
      C("Reward the party faithful", null, null, {warChest: 18000, approval: -4, heat: 5})], 1),
    EV("x_census2", "The National Census", "dossier", "The returns show the country is younger than anyone thought.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Plan schools around the figures", null, "green", {smarts: 3, approval: 5, money: -24000}),
      C("File the returns quietly", null, null, {controversy: 4})], 1),
    EV("x_supply", "The Supply Bill", "bill", "The assembly is holding up the annual supply.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Negotiate clause by clause", null, "green", {approval: 4, standing: 4, money: -8000}),
      C("Demand it be passed unread", null, "dark", {approval: -7, controversy: 9, heat: 5})], 1),
    EV("x_borderinc", "A Border Incident", "swords", "A watch post was seized and then abandoned overnight.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Send observers, not soldiers", null, "green", {standing: 6, approval: 3, money: -7000}),
      C("Muster a show of force", null, null, {standing: 3, money: -20000, controversy: 6})], 1),
    EV("x_fleet", "The Fleet Review", "flag", "The fleet is drawn up for its annual review.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Attend and pay the crews", null, "green", {standing: 6, money: -16000, approval: 3}),
      C("Send a deputy", null, null, {approval: -2})], 1),
    EV("x_harvestrep", "The Harvest Report", "funds", "The national harvest report is better than the forecasts.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Bank the surplus publicly", null, "green", {money: 28000, approval: 5}),
      C("Cut the levy on grain", null, null, {approval: 7, money: -8000})], 1),
    EV("x_spy", "A Letter From a Stranger", "dossier", "An unsigned letter claims a clerk has been selling copies of dispatches.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Hand it to the inspectorate", null, "green", {heat: -7, standing: 4}),
      C("Burn it", null, "dark", {heat: 8, controversy: 5})], 1),
    EV("x_succession", "A Question of Succession", "hourglass", "The assembly wants to know who acts if you cannot.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Name a deputy and publish the order", null, "green", {standing: 6, approval: 4, heat: -3}),
      C("Keep it deliberately vague", null, null, {heat: 6, controversy: 6})], 1),
    EV("x_address", "A National Address", "rally", "The chamber has asked for an account of your first year.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Speak plainly about the hard parts", null, "green", {approval: 8, standing: 6, name: 4}),
      C("Read only the good figures", null, null, {name: 3, approval: -2, heat: 4})], 1),
    EV("x_deadlock", "A Budget Deadlock", "gavel", "Two committees have produced irreconcilable budgets.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Call them together and split the difference", null, "green", {approval: 5, standing: 4, money: -5000}),
      C("Impose your own draft", null, "dark", {approval: -6, controversy: 9, heat: 6})], 1),
    EV("x_bench", "A Bench Appointment", "justice", "A seat on the high bench has fallen vacant.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Appoint on open nomination", null, "green", {standing: 7, heat: -5, approval: 2}),
      C("Appoint a loyal friend", null, null, {warChest: 12000, heat: 8, approval: -4})], 1),
    EV("x_memorial2", "The Memorial Commission", "medal", "A commission wants a permanent memorial to the fallen.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Fund it and name every district", null, "green", {standing: 7, approval: 5, money: -26000}),
      C("A plaque in the capital", null, null, {approval: 2, money: -6000})], 1),
    EV("x_tariff", "The Tariff League", "treaty", "Six realms have formed a tariff league and invited you in.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Join with a reservation", null, "green", {money: 30000, standing: 5, approval: -2}),
      C("Stay outside it", null, null, {approval: 3, standing: -3})], 1),
    EV("x_peace", "A Peace Overture", "treaty", "An old adversary has offered to normalise relations.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Accept and open the border", null, "green", {standing: 9, approval: 4, money: 14000}),
      C("Demand reparations first", null, null, {money: 22000, standing: -4})], 1),
    EV("x_pressclub", "The Press Club Dinner", "pressconf", "The printers' club has invited you to speak off the record.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Go and take every question", null, "green", {name: 6, approval: 4, heat: -3}),
      C("Send a written statement", null, null, {name: 2})], 1),
    EV("x_prize", "An Academy Prize", "laurel", "The academy wants to name its annual prize after you.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Decline and name it after a scholar", null, "green", {standing: 7, smarts: 2}),
      C("Accept", null, null, {name: 7, approval: -2, controversy: 4})], 1),
    EV("x_vets", "The Veterans' Petition", "medal", "Old soldiers ask for a pension arrears settlement.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Settle the arrears in full", null, "green", {approval: 8, standing: 6, money: -30000}),
      C("Set up a commission", null, null, {approval: 2, money: -6000})], 1),
    EV("x_archives", "The Archives Bill", "press", "A bill would open departmental records after thirty years.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Support it", null, "green", {standing: 7, heat: -6, approval: 2}),
      C("Bury it in committee", null, "dark", {heat: 8, controversy: 7})], 1),
    EV("x_capital", "A New Capital?", "map", "A commission suggests moving the seat of government inland.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Commission a full study", null, "green", {standing: 4, approval: 2, money: -11000}),
      C("Dismiss it outright", null, null, {approval: -3, controversy: 5})], 1),
    EV("x_guard", "The Ceremonial Guard", "crown", "The guard wants new standards and a proper barracks.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Fund it", null, "green", {standing: 5, money: -14000, approval: 2}),
      C("Patch the old standards", null, null, {approval: 1})], 1),
    EV("x_anthem", "A Dispute Over the Anthem", "flag", "Two versions of the anthem are both in official use.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Hold an open competition", null, "green", {approval: 5, standing: 4, happiness: 2}),
      C("Pick one and be done", null, null, {approval: -2, controversy: 4})], 1),
    EV("x_coinage", "A Coinage Redesign", "budget", "The mint proposes new dies for the currency.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Approve with a public competition", null, "green", {approval: 4, standing: 3, money: -9000}),
      C("Keep the old dies", null, null, {money: 6000, approval: -1})], 1),
    EV("x_lighthouse", "The Lighthouse Board", "map", "The board wants a chain of lights along the whole coast.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Build the full chain", null, "green", {standing: 7, approval: 5, money: -38000}),
      C("Repair the existing towers", null, null, {approval: 3, money: -10000})], 1),
    EV("x_weather", "A Weather Office", "dossier", "Observers want a national service to record the skies.", function (s) { return YES(s) && ((office(s.office) || {}).tier || 0) >= 3; }, [
      C("Found it", null, "green", {smarts: 3, standing: 5, money: -17000}),
      C("Leave it to the ports", null, null, {approval: 1})], 1),
    EV("x_recallrumble", "Recall Rumblings", "gavel", "A committee is quietly counting signatures against you.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Go to the districts and answer them", null, "green", {approval: 9, standing: 3, money: -10000}),
      C("Discredit the organisers", null, "dark", {heat: 10, approval: -4})], 2),
    EV("x_censure", "A Censure Motion", "gavel", "The opposition has tabled a motion of censure.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Debate it in person", null, "green", {approval: 6, standing: 4}),
      C("Have the whips kill it", null, null, {heat: 7, controversy: 6})], 2),
    EV("x_diary", "A Leaked Diary", "dossier", "A staffer's diary has found its way to a printer.", function (s) { return YES(s) && !!s.scandal; }, [
      C("Publish the full entry yourself", null, "green", {approval: 5, heat: -8, standing: 3}),
      C("Deny and threaten legal action", null, null, {heat: 10, approval: -4})], 2),
    EV("x_witness", "A Witness Comes Forward", "justice", "Someone is willing to testify about the contracts.", function (s) { return YES(s) && s.heat > 28; }, [
      C("Protect them and open everything", null, "green", {heat: -12, standing: 7, approval: 3}),
      C("Discredit them", null, "dark", {infamy: 6, heat: 9})], 2),
    EV("x_inspector", "The Inspector's Report", "justice", "The inspector has delivered a thick report.", function (s) { return YES(s) && s.heat > 28; }, [
      C("Publish it unchanged", null, "green", {standing: 6, heat: -9, approval: 2}),
      C("Release a summary only", null, null, {heat: 5, controversy: 5})], 1),
    EV("x_rebellion", "A Party Rebellion", "endorse", "Your own benches are threatening to vote against the programme.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Bring the rebels in and listen", null, "green", {approval: 5, warChest: 6000}),
      C("Threaten the whip", null, "dark", {approval: -5, controversy: 7})], 1),
    EV("x_challenger", "A Primary Challenger", "ballot", "A rising name in your own party is testing the water.", function (s) { return YES(s) && s.termEnd - yr() <= 1; }, [
      C("Invite them onto the ticket", null, "green", {approval: 5, name: 3, warChest: 9000}),
      C("Freeze them out", null, null, {heat: 6, approval: -3})], 1),
    EV("x_donortrial", "A Donor in Court", "justice", "A major backer has been charged and wants a word.", function (s) { return YES(s) && !!s.scandal; }, [
      C("Keep your distance", null, "green", {heat: -8, standing: 5, warChest: -12000}),
      C("Send a character reference", null, null, {heat: 12, approval: -6})], 1),
    EV("x_editorial", "An Editorial Board", "press", "The paper's board wants an hour of your time.", function (s) { return YES(s) && s.heat > 28; }, [
      C("Sit down with them", null, "green", {heat: -6, name: 4, approval: 2}),
      C("Refuse and complain to the owner", null, null, {heat: 8, approval: -3})], 1),
    EV("x_resignletter", "An Unsigned Resignation Letter", "exile", "A letter has been left on your desk.", function (s) { return YES(s) && !!s.scandal; }, [
      C("Ask who wrote it, openly", null, "green", {approval: 4, heat: -4}),
      C("Pretend you never saw it", null, null, {heat: 5})], 1),
    EV("x_noconf", "A No-Confidence Memo", "gavel", "A memo is circulating with enough names to matter.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Call a full confidence vote and win it", null, "green", {approval: 8, standing: 4}),
      C("Offer portfolios to the waverers", null, null, {warChest: 10000, heat: 7, approval: -2})], 1),
    EV("x_impeachdraft", "A Draft of Articles", "gavel", "Someone has drafted articles and is looking for signatures.", function (s) { return YES(s) && s.heat > 28; }, [
      C("Open the books and answer every clause", null, "green", {heat: -14, standing: 6}),
      C("Offer a quiet resignation", null, "dark", {heat: 10, approval: -6})], 1),
    EV("x_caretaker", "A Caretaker Proposal", "hourglass", "Elders suggest you step aside until the storm passes.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Decline and stay at the desk", null, "green", {approval: 5, standing: 3}),
      C("Accept a temporary arrangement", null, null, {approval: -4, name: -3})], 1),
    EV("x_pact", "A Succession Pact", "endorse", "Two factions offer stability in exchange for a named successor.", function (s) { return YES(s) && s.termEnd - yr() <= 1; }, [
      C("Refuse to name anyone", null, "green", {standing: 5, approval: 3}),
      C("Take the deal", null, null, {warChest: 26000, heat: 8, approval: -4})], 1),
    EV("x_whipcount", "The Whip's Count", "dossier", "The whip has brought you the numbers, and they are thin.", function (s) { return YES(s) && s.termEnd - yr() <= 1; }, [
      C("Go member by member", null, "green", {approval: 5, warChest: 5000}),
      C("Lean on the party machine", null, null, {heat: 6, controversy: 5})], 1),
    EV("x_pollcollapse", "A Polling Collapse", "polls", "A new survey has you down twelve points.", function (s) { return YES(s) && s.approval < 42; }, [
      C("Reset the whole message", null, "green", {approval: 7, money: -12000}),
      C("Attack the pollster", null, "dark", {approval: -5, controversy: 7})], 1),
    EV("x_ultimatum", "A Coalition Ultimatum", "endorse", "Your junior partners want two more seats at the table.", function (s) { return YES(s) && s.termEnd - yr() <= 1; }, [
      C("Give them one and hold the rest", null, "green", {approval: 4, standing: 3}),
      C("Dare them to walk", null, null, {approval: -5, warChest: 7000})], 1),
    EV("x_amnestyoffer", "An Amnesty Offer", "chains", "The inspectorate offers a clean slate in exchange for full disclosure.", function (s) { return YES(s) && s.heat > 28; }, [
      C("Take it and publish everything", null, "green", {heat: -18, approval: -3, standing: 5}),
      C("Refuse and fight it", null, null, {heat: 10, infamy: 4})], 1),
    EV("x_debateinvite", "A Debate Invitation", "debate", "Your opponent has challenged you to a public exchange.", function (s) { return !!s.campaign; }, [
      C("Accept", null, "green", {momentum: 8, name: 4}),
      C("Decline and cite the schedule", null, null, {momentum: -4, approval: -2})], 2),
    EV("x_heckler", "A Heckler at the Rally", "rally", "One voice is carrying across the whole square.", function (s) { return !!s.campaign; }, [
      C("Invite them onto the platform", null, "green", {momentum: 6, approval: 3, standing: 2}),
      C("Have them removed", null, null, {momentum: -3, controversy: 5})], 2),
    EV("x_posters", "A Poster War", "press", "The opposition has papered every wall overnight.", function (s) { return !!s.campaign; }, [
      C("Answer with a better poster", null, "green", {momentum: 5, name: 3, warChest: -6000}),
      C("Ignore it", null, null, {momentum: -2})], 2),
    EV("x_rivalgaffe", "Your Opponent Misspoke", "dossier", "A clumsy answer has been reprinted everywhere.", function (s) { return !!s.campaign; }, [
      C("Stay generous", null, "green", {momentum: 6, standing: 4}),
      C("Press the advantage hard", null, null, {momentum: 9, controversy: 6})], 2),
    EV("x_interview2", "A Newspaper Interview", "press", "A long interview has been requested before polling.", function (s) { return !!s.campaign; }, [
      C("Sit for the full hour", null, "green", {momentum: 5, name: 6}),
      C("Send written answers", null, null, {momentum: 1, name: 2})], 1),
    EV("x_rallycrowd", "An Unexpected Crowd", "rally", "Twice as many people turned up as the hall can hold.", function (s) { return !!s.campaign; }, [
      C("Move outside and speak to all of them", null, "green", {momentum: 8, name: 4, happiness: -2}),
      C("Keep to the programme", null, null, {momentum: 3})], 1),
    EV("x_donorlunch", "A Donors' Lunch", "funds", "A long table of backers is waiting to be charmed.", function (s) { return !!s.campaign; }, [
      C("Work the whole table", null, "green", {warChest: 18000, momentum: 3}),
      C("Leave early", null, null, {momentum: -2})], 1),
    EV("x_volunteers", "A Surge of Volunteers", "endorse", "More people have offered to help than you have badges for.", function (s) { return !!s.campaign; }, [
      C("Organise them properly", null, "green", {momentum: 7, approval: 3}),
      C("Let them self-organise", null, null, {momentum: 3, controversy: 3})], 1),
    EV("x_observer", "A Ballot Observer", "justice", "An outside observer has asked to watch the count.", function (s) { return !!s.campaign; }, [
      C("Welcome them", null, "green", {standing: 6, heat: -3}),
      C("Refuse", null, null, {heat: 8, controversy: 7})], 1),
    EV("x_smear", "A Smear Leaflet", "dossier", "An anonymous leaflet has appeared across the district.", function (s) { return !!s.campaign; }, [
      C("Answer with your record", null, "green", {momentum: 5, standing: 3}),
      C("Answer in kind", null, null, {momentum: 6, controversy: 9, heat: 6})], 1),
    EV("x_village", "A Village Hall", "townhall", "A small hall has offered you its only evening.", function (s) { return !!s.campaign; }, [
      C("Go anyway", null, "green", {momentum: 4, approval: 3, happiness: -2}),
      C("Send a surrogate", null, null, {momentum: 1})], 1),
    EV("x_guildendorse", "A Guild Endorsement", "endorse", "The largest guild is deciding whom to back.", function (s) { return !!s.campaign; }, [
      C("Make your case in person", null, "green", {momentum: 7, warChest: 8000}),
      C("Let the record speak", null, null, {momentum: 3})], 1),
    EV("x_familystmt", "A Family Statement", "press", "A relative has said something unhelpful to a reporter.", function (s) { return !!s.campaign; }, [
      C("Address it with good humour", null, "green", {momentum: 4, approval: 2}),
      C("Refuse to discuss it", null, null, {momentum: -2, name: 3})], 1),
    EV("x_manifesto", "The Manifesto Leaks", "dossier", "A draft of your programme is in the wrong hands.", function (s) { return !!s.campaign; }, [
      C("Publish the whole thing early", null, "green", {momentum: 6, standing: 4}),
      C("Deny it is final", null, null, {momentum: -3, controversy: 5})], 1),
    EV("x_countroom", "A Counting-Room Rumour", "polls", "Someone claims the count has already been arranged.", function (s) { return !!s.campaign; }, [
      C("Invite all parties to observe", null, "green", {standing: 6, heat: -4}),
      C("Laugh it off", null, null, {controversy: 4})], 1),
    EV("x_telegraph", "The Telegraph Office", "press", "A new wire office wants a civic contract.", function (s) { return YES(s) && yr() < 1950; }, [
      C("Grant it with public rates", null, "green", {standing: 5, money: 9000, approval: 2}),
      C("Let a rival build it", null, null, {money: 6000, approval: -2})], 1),
    EV("x_gasworks", "The Gasworks Question", "funds", "The gas company wants a twenty-year exclusive.", function (s) { return YES(s) && yr() < 1950; }, [
      C("Refuse exclusivity", null, "green", {approval: 5, standing: 4}),
      C("Sign it for a consideration", null, null, {warChest: 14000, heat: 7, approval: -4})], 1),
    EV("x_workhouse", "A Workhouse Inspection", "townhall", "An inspector has found the workhouse in a poor state.", function (s) { return YES(s) && yr() < 1950; }, [
      C("Order reform and fund it", null, "green", {approval: 8, standing: 6, money: -17000}),
      C("Replace the governor only", null, null, {approval: 2})], 1),
    EV("x_railway", "A Railway Deputation", "map", "A railway company wants permission to cross the common.", function (s) { return YES(s) && yr() < 1950; }, [
      C("Grant it with a public footway", null, "green", {money: 20000, approval: 4, standing: 2}),
      C("Refuse", null, null, {approval: 3, standing: -2})], 1),
    EV("x_exhibition", "A Civic Exhibition", "laurel", "The city has been invited to send a display to the great exhibition.", function (s) { return YES(s) && yr() >= 1950; }, [
      C("Fund a proper pavilion", null, "green", {standing: 8, name: 5, money: -24000}),
      C("Send a modest display", null, null, {standing: 3, money: -6000})], 1),
    EV("x_housingestate", "A New Housing Estate", "capitol", "Planners have drawn a whole new estate beyond the tram line.", function (s) { return YES(s) && yr() >= 1950; }, [
      C("Build with schools and clinics", null, "green", {approval: 8, standing: 5, money: -42000}),
      C("Build the houses only", null, null, {approval: 3, money: -18000})], 1),
    EV("x_broadcast", "A Civic Broadcast Slot", "pressconf", "The broadcasting service has offered a free civic slot.", function (s) { return YES(s) && yr() >= 1950; }, [
      C("Use it for a full account", null, "green", {name: 7, approval: 4}),
      C("Use it for a short greeting", null, null, {name: 3})], 1),
    EV("x_training", "A Training Scheme", "townhall", "A scheme would teach a trade to school leavers.", function (s) { return YES(s) && yr() >= 1950; }, [
      C("Fund it across every district", null, "green", {approval: 6, smarts: 3, money: -26000}),
      C("Pilot it in one ward", null, null, {approval: 2, money: -7000})], 1),
    EV("x_petitioncrown", "A Petition at the Palace Gate", "protest", "A roll of grievances has been left at the gate.", REIGN, [
      C("Read it in open court", null, "green", {approval: 7, resistance: -6, standing: 4}),
      C("Have it filed", null, null, {resistance: 5, approval: -3})], 2),
    EV("x_governor", "A Provincial Governor's Report", "dossier", "A frontier governor reports shortfalls and asks for coin.", REIGN, [
      C("Send the coin and an auditor", null, "green", {money: -26000, loyalty: 5, resistance: -4}),
      C("Send only the auditor", null, null, {loyalty: -4, resistance: 4})], 2),
    EV("x_mint", "The Mint Master", "budget", "The mint master proposes debasing the coinage to pay the legions.", REIGN, [
      C("Refuse and trim the budget", null, "green", {standing: 6, approval: 4, money: -14000}),
      C("Debase quietly", null, "dark", {money: 46000, infamy: 7, resistance: 6})], 1),
    EV("x_courtpoet", "A Court Poet", "laurel", "A poet asks to compose the official history of the reign.", REIGN, [
      C("Let them write freely", null, "green", {standing: 7, infamy: -4}),
      C("Require approval of every line", null, null, {name: 4, infamy: 5})], 1),
    EV("x_hostage", "A Hostage Exchange", "chains", "Two realms offer to swap prisoners taken in the last campaign.", REIGN, [
      C("Agree and publish the names", null, "green", {standing: 6, resistance: -5, infamy: -3}),
      C("Keep yours", null, null, {loyalty: 4, infamy: 4})], 1),
    EV("x_road", "The Imperial Road", "map", "Engineers propose a road joining every held province.", REIGN, [
      C("Build it", null, "green", {money: -68000, standing: 7, resistance: -8, approval: 5}),
      C("Repair the old roads", null, null, {money: -18000, approval: 2})], 1),
    EV("x_famine2", "A Lean Year in the Provinces", "storm", "The harvest reports from three provinces are bad.", REIGN, [
      C("Open every granary", null, "green", {approval: 9, resistance: -7, money: -30000}),
      C("Protect the capital's stores", null, "dark", {approval: -9, resistance: 10, infamy: 5})], 1),
    EV("x_cointribute", "A Tribute Dispute", "funds", "Two provinces argue over who owes what.", REIGN, [
      C("Recalculate it publicly", null, "green", {standing: 5, resistance: -4, heat: -3}),
      C("Back the richer province", null, null, {money: 18000, resistance: 6, infamy: 3})], 1),
    EV("x_heir", "A Question of an Heir", "crown", "The court is asking who follows you.", REIGN, [
      C("Name a successor and publish it", null, "green", {loyalty: 7, resistance: -5, standing: 4}),
      C("Keep the court guessing", null, null, {loyalty: -6, resistance: 5})], 1),
    EV("x_chronicle2", "An Unflattering Chronicle", "press", "A privately printed account of your reign is circulating.", REIGN, [
      C("Let it be read", null, "green", {standing: 6, infamy: -3}),
      C("Seize the print run", null, "dark", {heat: 7, infamy: 7, resistance: 6})], 1),
    EV("x_tyrant1", "A List of Names", "dossier", "The watch has compiled a list of suspected dissenters.", function (s) { return REIGN(s) && s.sovereign.style === "tyrant"; }, [
      C("Order it destroyed", null, "green", {approval: 5, infamy: -5, resistance: -5, heat: -4}),
      C("Act on it", null, "dark", {loyalty: 6, infamy: 10, heat: 9, resistance: 8})], 2),
    EV("x_tyrant2", "A Midnight Knock", "prison", "An officer asks whether the cells are full enough.", function (s) { return REIGN(s) && s.sovereign.style === "tyrant"; }, [
      C("Empty the cells", null, "green", {infamy: -6, heat: -8, approval: 4}),
      C("Fill them", null, "dark", {infamy: 9, heat: 10, resistance: 7})], 1),
    EV("x_tyrant3", "The Confiscation Ledger", "budget", "Estates seized last year could be sold to fund the guard.", function (s) { return REIGN(s) && s.sovereign.style === "tyrant"; }, [
      C("Return what can be returned", null, "green", {standing: 6, infamy: -6, money: -22000}),
      C("Sell the rest", null, null, {money: 52000, infamy: 8, resistance: 7})], 1),
    EV("x_conq1", "A New Realm on the Map", "swords", "Your scouts have drawn a fresh border in the east.", function (s) { return REIGN(s) && s.sovereign.style === "conqueror"; }, [
      C("Plan a careful campaign", null, "green", {soldiers: -1200, money: -24000, standing: 5}),
      C("Strike at once", null, "dark", {soldiers: -3200, infamy: 7, resistance: 8})], 2),
    EV("x_conq2", "A Surrendered Garrison", "helmet", "A fortress has offered to open its gates if the garrison is spared.", function (s) { return REIGN(s) && s.sovereign.style === "conqueror"; }, [
      C("Honour the terms", null, "green", {standing: 7, infamy: -5, soldiers: 900}),
      C("Take them prisoner anyway", null, "dark", {infamy: 9, resistance: 7, soldiers: 1400})], 1),
    EV("x_conq3", "The Tribute Fleet", "funds", "A convoy of dues is late and the escort has vanished.", function (s) { return REIGN(s) && s.sovereign.style === "conqueror"; }, [
      C("Send a search party", null, "green", {money: -9000, loyalty: 3, resistance: -3}),
      C("Assume the worst and double the levy", null, null, {money: 30000, resistance: 8, infamy: 5})], 1),
    EV("x_stew1", "A Petition for a Charter", "bill", "Representatives ask you to bind your own power in writing.", function (s) { return REIGN(s) && s.sovereign.style === "steward"; }, [
      C("Write the charter with them", null, "green", {approval: 10, standing: 9, infamy: -8, resistance: -9}),
      C("Offer a weaker version", null, null, {approval: 3, resistance: -2})], 2),
    EV("x_stew2", "The Schools Open", "townhall", "The first realm schools have opened their doors.", function (s) { return REIGN(s) && s.sovereign.style === "steward"; }, [
      C("Visit every one", null, "green", {approval: 7, smarts: 3, standing: 5, money: -12000}),
      C("Send a minister", null, null, {approval: 2})], 1),
    EV("x_stew3", "A Council of Provinces", "cabinet", "Provincial delegates ask for a standing council.", function (s) { return REIGN(s) && s.sovereign.style === "steward"; }, [
      C("Grant it real powers", null, "green", {approval: 8, resistance: -10, standing: 6}),
      C("Grant it a hearing only", null, null, {approval: 2, resistance: -2})], 1),
    EV("x_wanted1", "A Wanted Notice", "wanted", "A fresh notice with your seal has been posted in three capitals.", function (s) { return REIGN(s) && !!s.sovereign.mostWanted; }, [
      C("Send envoys to answer it", null, "green", {heat: -12, standing: 4, money: -30000}),
      C("Tear them down and move", null, null, {heat: 8, infamy: 5})], 2),
    EV("x_wanted2", "A Safe-House Offer", "exile", "A sympathetic house offers you a room and a false name.", function (s) { return REIGN(s) && !!s.sovereign.mostWanted; }, [
      C("Take it quietly", null, "green", {heat: -14, approval: -4, standing: -2}),
      C("Refuse to hide", null, null, {heat: 7, name: 5})], 1),
    EV("x_wanted3", "An Old Ally's Letter", "dossier", "An old ally writes that the noose is tightening.", function (s) { return REIGN(s) && !!s.sovereign.mostWanted; }, [
      C("Buy time with a public concession", null, "green", {heat: -10, infamy: -4, money: -24000}),
      C("Ignore the letter", null, null, {heat: 9})], 1),
    EV("x_war1", "A Coalition Ultimatum", "treaty", "The coalition offers terms if you withdraw from two provinces.", function (s) { return REIGN(s) && s.sovereign.resistance > 45; }, [
      C("Negotiate", null, "green", {resistance: -12, money: -40000, standing: 4}),
      C("Refuse defiantly", null, null, {loyalty: 6, resistance: 8, infamy: 5})], 2),
    EV("x_war2", "A General Asks for Reinforcements", "helmet", "The frontier commander says the line cannot hold.", function (s) { return REIGN(s) && s.sovereign.resistance > 45; }, [
      C("Send the reserve", null, "green", {soldiers: -2600, loyalty: 6, money: -18000}),
      C("Order a withdrawal", null, null, {resistance: 9, loyalty: -5, approval: -5})], 1),
    EV("x_war3", "A Defected Officer", "exile", "A senior officer has gone over to the coalition with a map.", function (s) { return REIGN(s) && s.sovereign.resistance > 45; }, [
      C("Change every plan", null, "green", {soldiers: -800, resistance: -6, heat: -4}),
      C("Make an example of the family", null, "dark", {infamy: 10, heat: 10, resistance: 9})], 1)
  ];

  /* ================================================================ *
   * IN-OFFICE EXPANSION — cards, orders, committees, dispatches
   * ================================================================ */
  function OP(id, name, icon, cat, tier, desc, cost, choices, w) {
    return { id: id, name: name, icon: icon, cat: cat, tier: tier, desc: desc,
            cost: cost, choices: choices, w: w || 1 };
  }
  function OD(id, name, icon, tier, cost, desc, fxObj) {
    return { id: id, name: name, icon: icon, tier: tier, cost: cost, desc: desc, fx: fxObj };
  }
  function CM(id, name, icon, tier, cost, desc, yearFx) {
    return { id: id, name: name, icon: icon, tier: tier, cost: cost, desc: desc, yearFx: yearFx };
  }
  function DS(id, title, icon, body, when, w, fxObj) {
    return { id: id, title: title, icon: icon, body: body, when: when, w: w || 1, fx: fxObj };
  }
  var OPPS = [
    OP("o_bill1", "Fast-Track a Bill", "bill", "Legislation", 1, "Whips offer to clear a bill through committee this session.", 12000, [
      C("Push the transit bill", null, "green", {bill: "transit", approval: 3, controversy: 5}),
      C("Push the clinics bill", null, null, {bill: "clinics", approval: 4, standing: 2}),
      C("Let it take the normal course", null, null, {heat: -2})], 1),
    OP("o_bill2", "A Cross-Bench Amendment", "gavel", "Legislation", 2, "An amendment would carry, if you spend political capital.", 6000, [
      C("Back it openly", null, "green", {approval: 5, standing: 4, bill: "ombuds"}),
      C("Stay out of it", null, null, {controversy: 2})], 1),
    OP("o_bill3", "A Conscience Vote", "bill", "Legislation", 3, "The assembly wants a free vote on a divisive charter.", 4000, [
      C("Allow the free vote", null, "green", {standing: 7, approval: 2, controversy: 4}),
      C("Impose the party line", null, null, {warChest: 12000, approval: -5, heat: 4})], 1),
    OP("o_bill4", "The Omnibus Package", "budget", "Legislation", 3, "Clerk has bundled six measures into one vote.", 18000, [
      C("Split it into six votes", null, "green", {standing: 6, approval: 3, heat: -4}),
      C("Force the whole package", null, null, {money: 24000, approval: -6, controversy: 9})], 1),
    OP("o_seat1", "A Surprise Vacancy", "cabinet", "Cabinet", 1, "A minister has stepped down with an hour's notice.", 3000, [
      C("Appoint the best available name", null, "green", {seat: 1, approval: 3, standing: 2}),
      C("Hold the seat open", null, null, {approval: -2})], 1),
    OP("o_seat2", "A Cabinet Reshuffle", "cabinet", "Cabinet", 2, "Three posts could be swapped in one afternoon.", 9000, [
      C("Reshuffle for competence", null, "green", {seat: 1, standing: 4, approval: 3}),
      C("Reshuffle for loyalty", null, null, {seat: 1, heat: -5, controversy: 4})], 1),
    OP("o_seat3", "A Minister's Rivalry", "dossier", "Cabinet", 2, "Two ministers are quietly undermining each other.", 2000, [
      C("Mediate it yourself", null, "green", {approval: 4, heat: -4, standing: 3}),
      C("Let the stronger win", null, null, {approval: -2, heat: 4})], 1),
    OP("o_seat4", "A Special Commissioner", "justice", "Cabinet", 3, "A commissioner could take the inspectorate off your desk.", 14000, [
      C("Appoint one with open terms", null, "green", {seat: 1, heat: -9, standing: 6}),
      C("Keep the work in-house", null, null, {heat: 4, approval: -2})], 1),
    OP("o_coin1", "The Reserve Fund", "funds", "Treasury", 1, "An unallocated reserve could be released this year.", 0, [
      C("Release it to the districts", null, "green", {approval: 7, standing: 3, money: -18000}),
      C("Hold it for a campaign", null, null, {warChest: 16000, approval: -2})], 1),
    OP("o_coin2", "A Loan Offer", "budget", "Treasury", 2, "A consortium offers a low-interest loan for public works.", 0, [
      C("Borrow and build", null, "green", {money: 46000, approval: 4, standing: 2, heat: 3}),
      C("Decline the debt", null, null, {standing: 3, approval: 1})], 1),
    OP("o_coin3", "An Audit of Contracts", "dossier", "Treasury", 2, "A clerk suggests reviewing every contract let this term.", 7000, [
      C("Publish the whole audit", null, "green", {heat: -10, standing: 7, approval: 2}),
      C("Keep it internal", null, null, {heat: 5, money: 10000})], 1),
    OP("o_coin4", "A Windfall Levy", "budget", "Treasury", 3, "A one-off levy on harbour profits could close the gap.", 0, [
      C("Enact it", null, null, {money: 38000, approval: -7, controversy: 8}),
      C("Leave the harbour alone", null, "green", {approval: 5, standing: 2})], 1),
    OP("o_press1", "An Open News Conference", "pressconf", "Press", 1, "The press room is full and nobody has been briefed.", 2000, [
      C("Take every question", null, "green", {name: 6, approval: 5, heat: -3}),
      C("Read a statement and leave", null, null, {name: 2, approval: -2})], 1),
    OP("o_press2", "A Profile Writer", "press", "Press", 2, "A writer wants a month following you around.", 0, [
      C("Open the whole diary", null, "green", {name: 9, standing: 5, approval: 2, heat: 3}),
      C("Offer two controlled days", null, null, {name: 4, approval: 1})], 1),
    OP("o_press3", "A Hostile Editorial", "press", "Press", 2, "Tomorrow's leading article is going to be brutal.", 4000, [
      C("Write a measured reply", null, "green", {approval: 5, standing: 3}),
      C("Buy space for a rebuttal", null, null, {name: 5, warChest: -9000}),
      C("Say nothing", null, null, {approval: -2})], 1),
    OP("o_press4", "A Civic Address", "rally", "Press", 3, "The assembly has offered you the evening slot.", 5000, [
      C("Speak about the long term", null, "green", {approval: 7, standing: 6, name: 5}),
      C("Read a short list of achievements", null, null, {approval: 3, name: 2})], 1),
    OP("o_con1", "A Doorstep Week", "townhall", "Constituents", 1, "Aides have cleared a week for nothing but doorsteps.", 6000, [
      C("Go yourself", null, "green", {approval: 8, standing: 4, happiness: -3}),
      C("Send the team", null, null, {approval: 3})], 1),
    OP("o_con2", "A District Grant", "funds", "Constituents", 1, "Three wards have applied for the same small grant.", 14000, [
      C("Split it three ways", null, "green", {approval: 6, standing: 3}),
      C("Give it all to the neediest", null, null, {approval: 8, standing: 4, controversy: 3})], 1),
    OP("o_con3", "A Public Clinic", "townhall", "Constituents", 2, "A disused hall could become a clinic by winter.", 22000, [
      C("Fund it fully", null, "green", {approval: 8, health: 3, standing: 4}),
      C("Fund a pilot", null, null, {approval: 3, money: -8000})], 1),
    OP("o_con4", "A Citizens' Assembly", "cabinet", "Constituents", 3, "A randomly chosen panel could review your programme.", 9000, [
      C("Give it real questions", null, "green", {standing: 8, approval: 5, resistance: -4}),
      C("Give it a ceremonial role", null, null, {approval: 1, controversy: 4})], 1),
    OP("o_for1", "A Trade Mission", "treaty", "Foreign", 2, "A delegation of merchants wants you to lead a mission.", 12000, [
      C("Lead it", null, "green", {money: 28000, standing: 6, name: 3}),
      C("Send the minister", null, null, {money: 12000, standing: 2})], 1),
    OP("o_for2", "A Border Commission", "map", "Foreign", 2, "A joint commission could settle a decade of disputes.", 10000, [
      C("Fund it properly", null, "green", {standing: 7, heat: -4, approval: 2}),
      C("Let it lapse", null, null, {controversy: 4})], 1),
    OP("o_for3", "A Refugee Appeal", "chains", "Foreign", 3, "Families have arrived from across the border.", 20000, [
      C("Open the doors and fund housing", null, "green", {standing: 9, approval: 4, money: -26000}),
      C("Offer temporary shelter only", null, null, {approval: 2, money: -9000})], 1),
    OP("o_for4", "A Cultural Exchange", "laurel", "Foreign", 3, "Two academies want to exchange scholars for a year.", 8000, [
      C("Fund a full exchange", null, "green", {smarts: 3, standing: 6, approval: 2}),
      C("Send a single delegate", null, null, {standing: 2})], 1),
    OP("o_jus1", "A Pardon Petition", "chains", "Justice", 2, "A case has attracted petitions from three districts.", 0, [
      C("Grant the pardon and explain why", null, "green", {standing: 6, approval: 3, controversy: 5}),
      C("Let the sentence stand", null, null, {approval: -2, heat: -2})], 1),
    OP("o_jus2", "An Inspector's Second Report", "justice", "Justice", 2, "The inspector has come back with sharper questions.", 5000, [
      C("Publish it in full", null, "green", {heat: -12, standing: 7}),
      C("Ask for more time", null, null, {heat: 7, controversy: 5})], 1),
    OP("o_jus3", "A Court Backlog", "gavel", "Justice", 3, "Cases are waiting years for a hearing.", 16000, [
      C("Fund more benches", null, "green", {standing: 6, heat: -7, approval: 3}),
      C("Set a time limit instead", null, null, {approval: -3, controversy: 6})], 1),
    OP("o_jus4", "A Whistleblower's Protection", "dossier", "Justice", 3, "A clerk needs formal protection to testify.", 6000, [
      C("Grant it in writing", null, "green", {heat: -10, standing: 6, approval: 2}),
      C("Offer a quiet transfer", null, null, {heat: 5})], 1),
    OP("o_cri1", "A Storm Warning", "storm", "Crisis", 1, "The harbour master expects a severe blow tonight.", 9000, [
      C("Open the halls and fund the watch", null, "green", {approval: 8, health: 2, money: -14000}),
      C("Wait for the morning", null, "dark", {approval: -8, health: -3})], 1),
    OP("o_cri2", "A Bank Failure", "budget", "Crisis", 2, "A regional bank has stopped paying out.", 24000, [
      C("Guarantee small depositors", null, "green", {approval: 9, standing: 5, money: -38000}),
      C("Let the directors sort it", null, "dark", {approval: -9, heat: 8})], 1),
    OP("o_cri3", "A Strike at the Works", "protest", "Crisis", 2, "The largest employer has stopped altogether.", 11000, [
      C("Mediate and fund retraining", null, "green", {approval: 7, standing: 4, money: -20000}),
      C("Send in the constabulary", null, "dark", {approval: -7, resistance: 6, heat: 7})], 1),
    OP("o_cri4", "A Food Shortage", "storm", "Crisis", 3, "Staple prices have doubled in a fortnight.", 30000, [
      C("Release the reserve and cap prices", null, "green", {approval: 10, resistance: -6, money: -42000}),
      C("Let merchants compete", null, "dark", {approval: -10, resistance: 8, money: 16000})], 1),
    OP("o_hon1", "A Civic Honour", "medal", "Honours", 1, "The city wants to name a public servant of the year.", 2000, [
      C("Let an open panel choose", null, "green", {standing: 6, approval: 4}),
      C("Choose yourself", null, null, {name: 6, approval: -4, controversy: 7})], 1),
    OP("o_hon2", "A Statue Commission", "capitol", "Honours", 2, "A sculptor has offered a monumental commission.", 26000, [
      C("Commission a public square instead", null, "green", {approval: 7, standing: 5, money: -26000}),
      C("Commission the statue", null, null, {name: 7, approval: -2, controversy: 6})], 1),
    OP("o_hon3", "A Scholarship Fund", "bill", "Honours", 3, "An endowment could send ten students a year to the academy.", 20000, [
      C("Endow it in perpetuity", null, "green", {smarts: 3, standing: 7, approval: 4}),
      C("Fund one cohort", null, null, {approval: 2, smarts: 1})], 1),
    OP("o_hon4", "A Named Lecture", "laurel", "Honours", 3, "The academy proposes an annual lecture in your name.", 7000, [
      C("Require it to be open to critics", null, "green", {standing: 7, infamy: -3, approval: 2}),
      C("Require it to be laudatory", null, null, {name: 6, controversy: 5})], 1),
    OP("o_par1", "A Party Conference", "endorse", "Party", 1, "The local conference wants a keynote and a clear line.", 8000, [
      C("Give an honest account", null, "green", {warChest: 13000, approval: 4, standing: 3}),
      C("Give them what they want to hear", null, null, {warChest: 22000, controversy: 6})], 1),
    OP("o_par2", "A Donor Dinner", "funds", "Party", 2, "A room of backers expects a word about the next race.", 0, [
      C("Talk about the programme", null, "green", {warChest: 14000, standing: 3}),
      C("Talk about contracts", null, "dark", {warChest: 34000, heat: 11, approval: -5})], 1),
    OP("o_par3", "A Factional Dispute", "cabinet", "Party", 2, "Two wings want opposite pledges in the manifesto.", 3000, [
      C("Publish both positions", null, "green", {standing: 5, approval: 2, controversy: 4}),
      C("Pick one wing", null, null, {warChest: 11000, approval: -4})], 1),
    OP("o_par4", "A Defection Offer", "flag", "Party", 3, "A rival party offers you its nomination and its machine.", 0, [
      C("Stay with your party", null, "green", {standing: 6, approval: 3}),
      C("Take the nomination", null, null, {warChest: 40000, name: 8, approval: -7, controversy: 10})], 1),
    OP("o_ove1", "An Open Records Day", "press", "Oversight", 1, "The archive could open its doors for a day.", 3000, [
      C("Open everything", null, "green", {heat: -8, standing: 6, approval: 2}),
      C("Open the harmless boxes", null, null, {heat: 3, controversy: 3})], 1),
    OP("o_ove2", "A Public Accounts Hearing", "budget", "Oversight", 2, "The assembly wants the books explained in public.", 2000, [
      C("Attend and answer everything", null, "green", {standing: 7, heat: -7, approval: 3}),
      C("Send a written brief", null, null, {heat: 4, approval: -2})], 1),
    OP("o_ove3", "An Independent Ombudsman", "justice", "Oversight", 3, "A statute would put complaints outside your office.", 15000, [
      C("Sign it", null, "green", {standing: 8, heat: -10, approval: 3}),
      C("Delay it", null, null, {heat: 7, controversy: 6})], 1),
    OP("o_ove4", "A Recall Threshold", "gavel", "Oversight", 3, "Reformers want a lower threshold for recall petitions.", 0, [
      C("Lower it", null, "green", {standing: 8, approval: 5, heat: -4}),
      C("Raise it instead", null, "dark", {approval: -8, heat: 10, controversy: 9})], 1),
    OP("o_per1", "A Family Matter", "press", "Personal", 1, "A relative has been named in a local dispute.", 0, [
      C("Address it openly", null, "green", {standing: 4, approval: 2, heat: -3}),
      C("Say nothing", null, null, {name: 3, heat: 4})], 1),
    OP("o_per2", "A Health Check", "townhall", "Personal", 1, "Your physician wants a proper week of rest.", 0, [
      C("Take it", null, "green", {health: 6, happiness: 4, approval: -2}),
      C("Work through it", null, null, {health: -5, approval: 2})], 1),
    OP("o_per3", "A Memoir Offer", "laurel", "Personal", 3, "A publisher offers a large advance for your memoirs.", 0, [
      C("Write it after you leave office", null, "green", {standing: 5, money: 22000, approval: 2}),
      C("Write it now", null, null, {money: 46000, name: 7, heat: 8, approval: -5})], 1),
    OP("o_per4", "An Old Friend Asks", "endorse", "Personal", 2, "An old friend asks for a minor post.", 0, [
      C("Find them an open competition", null, "green", {standing: 4, approval: 2}),
      C("Give them the post", null, null, {warChest: 9000, heat: 7, approval: -4})], 1),
  ];
  var ORDERS = [
    OD("d_records", "Open the Records", "press", 1, 4000, "Release departmental papers from the last three years.", {standing: 7, heat: -9, approval: 2}),
    OD("d_audit", "Order a Full Audit", "dossier", 1, 9000, "Send auditors into every office that spends public coin.", {standing: 5, heat: -8, money: -4000, approval: 2}),
    OD("d_holiday", "Declare a Civic Holiday", "rally", 1, 6000, "A day of rest and a paid meal in every ward.", {approval: 8, happiness: 4, money: -12000}),
    OD("d_ombuds", "Appoint an Ombudsman", "justice", 2, 12000, "Create an independent office for public complaints.", {standing: 8, heat: -7, approval: 3}),
    OD("d_price", "Freeze Essential Prices", "budget", 2, 20000, "Hold the price of grain and fuel for one season.", {approval: 9, money: -26000, controversy: 6}),
    OD("d_amnesty", "A General Amnesty", "chains", 2, 8000, "Empty the cells of those held for public-order offences.", {standing: 7, approval: 4, infamy: -3, controversy: 7}),
    OD("d_inquiry", "A Public Inquiry", "gavel", 2, 16000, "Commission an open inquiry into a disputed contract.", {heat: -12, standing: 8, approval: 2}),
    OD("d_works", "Emergency Public Works", "capitol", 3, 42000, "Order repairs to every unsafe bridge and road.", {approval: 8, standing: 5, money: -42000}),
    OD("d_tariff", "Suspend the Tariffs", "treaty", 3, 14000, "Lift duties on imported grain and tools for a year.", {money: 28000, approval: -4, standing: 5}),
    OD("d_nationalise", "Take the Harbour into Public Hands", "map", 3, 68000, "Buy out the harbour company at the assessed value.", {money: -68000, approval: 6, standing: 4, heat: 6, controversy: 9}),
    OD("d_referendum", "Call a Referendum", "ballot", 3, 22000, "Put the constitutional question straight to the people.", {standing: 9, approval: 5, controversy: 8}),
    OD("d_censure", "Censure a Minister", "cabinet", 2, 3000, "Formally rebuke a minister and dock their budget.", {approval: 3, heat: -4, warChest: 6000}),
    OD("d_dissolve", "Dissolve the Assembly", "gavel", 4, 30000, "Send them home and govern on your own programme.", {approval: -12, controversy: 12, heat: 9, warChest: 24000}),
    OD("d_lineitem", "Line-Item Reduction", "budget", 4, 0, "Strike three items from the budget without a vote.", {money: 34000, approval: -7, controversy: 7}),
  ];
  var COMMITTEES = [
    CM("c_accounts", "Public Accounts Committee", "budget", 1, 12000, "Checks every department's books each birthday.", {money: 6000, heat: -5, standing: 3}),
    CM("c_works", "Works & Infrastructure Committee", "capitol", 1, 18000, "Keeps roads, bridges and lamps in repair.", {approval: 5, money: -9000, standing: 2}),
    CM("c_health", "Public Health Committee", "townhall", 2, 16000, "Watches the clinics, the wells and the wards.", {health: 3, approval: 4, money: -7000}),
    CM("c_press", "Press & Records Committee", "press", 2, 9000, "Publishes an annual account of the office.", {name: 4, heat: -6, standing: 4, money: -3000}),
    CM("c_justice", "Justice & Appointments Committee", "gavel", 2, 14000, "Reviews every bench and magistrate appointment.", {heat: -6, standing: 5, approval: 2, money: -5000}),
    CM("c_trade", "Trade & Harbour Committee", "treaty", 3, 22000, "Negotiates dues and settles port disputes.", {money: 16000, standing: 3, approval: -1}),
    CM("c_legion", "Legions Review Committee", "helmet", 3, 26000, "Audits the establishment and the pay of the guard.", {loyalty: 4, soldiers: 600, money: -14000}),
    CM("c_census", "Census & Planning Committee", "dossier", 3, 17000, "Keeps the returns current and the districts mapped.", {smarts: 2, approval: 3, standing: 3, money: -6000}),
  ];
  var DISPATCHES = [
    DS("q_ledger", "The Ledger Balances", "budget", "The quarterly books closed a little ahead of forecast.", YES, 3, {money: 6000, approval: 1}),
    DS("q_letters", "A Full Post Bag", "press", "The morning post is heavier than usual. Most of it is kind.", YES, 3, {approval: 2, standing: 1}),
    DS("q_speech", "A Speech Reprinted", "pressconf", "A regional paper has reprinted your last address in full.", YES, 2, {name: 4, approval: 1}),
    DS("q_clinic", "A Clinic Opens", "townhall", "The new district clinic saw its first patients today.", YES, 2, {approval: 3, health: 1}),
    DS("q_bridge", "A Bridge Repaired", "capitol", "The Stonebridge crew finished two weeks early.", YES, 2, {approval: 3, money: 3000}),
    DS("q_scholar", "A Scholar's Prize", "laurel", "A student from your district took the academy prize.", YES, 2, {standing: 3, smarts: 1}),
    DS("q_harbour", "A Good Harbour Week", "map", "Dues at the harbour are up on last season.", YES, 2, {money: 11000, standing: 1}),
    DS("q_petition", "A Small Petition", "bill", "Forty names asking for a crossing near the school.", YES, 2, {approval: 2}),
    DS("q_observer", "An Outside Observer", "justice", "A visitor from a neighbouring realm watched the proceedings.", YES, 1, {standing: 3}),
    DS("q_band", "The Civic Band", "rally", "The band played in the square all afternoon.", YES, 2, {happiness: 2, approval: 1}),
    DS("q_archive", "The Archive Is Sorted", "dossier", "Clerks have finally indexed the old rolls.", YES, 1, {heat: -3, standing: 2}),
    DS("q_apprentice", "Apprentices Indentured", "endorse", "Twelve new apprentices were signed this week.", YES, 2, {approval: 2, smarts: 1}),
    DS("q_harvest2", "A Fair Harvest", "funds", "The district harvest came in close to average.", YES, 2, {money: 4000, approval: 1}),
    DS("q_court", "A Case Concluded", "gavel", "A long-running title case has finally been settled.", YES, 1, {heat: -3, approval: 1}),
    DS("q_well", "A New Well", "townhall", "A well has been sunk in the upper ward.", YES, 2, {health: 2, approval: 2}),
    DS("q_guild", "A Guild Donation", "funds", "The masons' guild has given towards the public rooms.", YES, 1, {warChest: 5000, standing: 1}),
    DS("q_poll2", "A Fresh Reading", "polls", "A new survey has your numbers broadly steady.", YES, 3, {name: 1}),
    DS("q_veteran", "A Veteran Writes", "medal", "An old soldier wrote to thank the office for the pension arrears.", YES, 1, {standing: 3, approval: 1}),
    DS("q_rain", "The Rain Came", "storm", "A fortnight of rain has refilled the reservoirs.", YES, 2, {health: 1, approval: 1}),
    DS("q_printer", "A Printer's Error", "press", "A misprinted notice caused a morning of confusion.", YES, 1, {approval: -1, controversy: 2}),
    DS("q_delayed", "A Delayed Convoy", "funds", "A supply convoy arrived a week late but intact.", YES, 1, {money: 2000}),
    DS("q_debate2", "A Debate Invitation Declined", "debate", "Your office politely declined another invitation.", YES, 1, {approval: -1}),
    DS("q_inspector2", "A Routine Inspection", "justice", "The annual inspection found nothing out of order.", YES, 2, {heat: -4, standing: 2}),
    DS("q_school2", "A School Roof", "bill", "The academy roof has been patched before the rains.", YES, 1, {approval: 2}),
    DS("q_coin", "New Dies Approved", "budget", "The mint has struck the first of the new coin.", YES, 1, {money: 5000, name: 1}),
    DS("q_ferry2", "The Ferry Runs Again", "map", "The river crossing is back on its old timetable.", YES, 1, {approval: 2}),
    DS("q_chronicler2", "A Chronicle Bound", "laurel", "The year's proceedings have been bound and shelved.", YES, 1, {standing: 2}),
    DS("q_realmledger", "The Realm Ledger", "budget", "Provincial dues were tallied without dispute.", REIGN, 3, {money: 14000, standing: 1}),
    DS("q_watch", "The Night Watch Report", "dossier", "The watch reports a quiet week across the capital.", REIGN, 2, {resistance: -2, heat: -2}),
    DS("q_legate", "A Legate Arrives", "treaty", "A legate from a distant province has come to pay respects.", REIGN, 2, {standing: 3, loyalty: 1}),
  ];
  var FIELD_ACTS = [
    { id: "audit", name: "Audit the Departments", icon: "dossier", desc: "Standing 3 · heat −6 · costs" },
    { id: "ombudsman", name: "Open a Complaints Desk", icon: "justice", desc: "Approval 5 · heat −3" },
    { id: "grants", name: "District Grants", icon: "funds", desc: "Approval 6 · standing 3 · costs" },
    { id: "pardon", name: "Grant a Pardon", icon: "chains", desc: "Standing 5 · controversy 4" },
    { id: "caucus", name: "Call a Caucus", icon: "endorse", desc: "War chest 8,000 · approval 2" },
    { id: "whip", name: "Work the Whips", icon: "gavel", desc: "Approval 3 · controversy 2" },
    { id: "clinic", name: "Open a Free Clinic", icon: "townhall", desc: "Approval 7 · health 2 · costs" },
    { id: "scholarship", name: "Fund Scholarships", icon: "bill", desc: "Smarts 2 · approval 4 · costs" },
    { id: "apprentice", name: "An Apprenticeship Scheme", icon: "capitol", desc: "Approval 4 · standing 3 · costs" },
    { id: "harbour", name: "Lease the Harbour Wharves", icon: "map", desc: "Money 18,000 · approval −2" },
    { id: "memorial", name: "Raise a Memorial", icon: "medal", desc: "Standing 6 · approval 3 · costs" },
    { id: "oped", name: "Write an Open Letter", icon: "press", desc: "Name 6 · approval 2" },
    { id: "petition", name: "Receive a Petition", icon: "protest", desc: "Approval 3 · standing 2" },
    { id: "mediation", name: "Mediate a Dispute", icon: "treaty", desc: "Heat −8 · standing 4 · costs" },
    { id: "inspection", name: "Inspect the Offices", icon: "justice", desc: "Heat −5 · standing 2" },
    { id: "festival", name: "Fund a Civic Festival", icon: "rally", desc: "Approval 5 · happiness 3 · costs" },
    { id: "statevisit", name: "Host a State Visit", icon: "crown", desc: "Standing 8 · name 4 · costs" },
    { id: "budgetreview", name: "Trim the Budget", icon: "budget", desc: "Money 12,000 · approval −2" },
  ];
  function opp(id) { for (var i = 0; i < OPPS.length; i++) if (OPPS[i].id === id) return OPPS[i]; return null; }
  function orderById(id) { for (var i = 0; i < ORDERS.length; i++) if (ORDERS[i].id === id) return ORDERS[i]; return null; }
  function committee(id) { for (var i = 0; i < COMMITTEES.length; i++) if (COMMITTEES[i].id === id) return COMMITTEES[i]; return null; }
  function activeCommittees(s) { return Object.keys(s.committees || {}).filter(function (k) { return s.committees[k]; }).length; }
  function filledSeats(s) { return Object.keys(s.cabinet || {}).filter(function (k) { return s.cabinet[k]; }).length; }

  function drawOpps(s, n, paid) {
    var y = yr();
    if (!paid && s.oppYr === y) return false;
    if (paid) {
      var price = 6000 * ((office(s.office) || {}).tier || (s.sovereign ? 4 : 1));
      if ((state.money || 0) < price) { note("Cannot afford", "An extra briefing costs " + usdF(price) + ".", null, true); return false; }
      money(-price);
    } else { s.oppYr = y; s.oppPlays = 4; }
    var tier = s.sovereign ? 4 : ((office(s.office) || {}).tier || 1);
    var pool = OPPS.filter(function (o) {
      if (o.tier > tier) return false;
      if ((s.opps || []).some(function (h) { return h.id === o.id; })) return false;
      return true;
    });
    n = n || 5;
    for (var i = 0; i < n && pool.length; i++) {
      var o = pickWeighted(pool); if (!o) break;
      pool = pool.filter(function (x) { return x.id !== o.id; });
      (s.opps || (s.opps = [])).push({ id: o.id, y: y });
    }
    if (s.opps.length > 9) s.opps = s.opps.slice(-9);
    return true;
  }
  function committeeTick(s) {
    Object.keys(s.committees || {}).forEach(function (k) {
      if (!s.committees[k]) return;
      var c = committee(k); if (c) fx(c.yearFx);
    });
  }
  function fireDispatch() {
    var s = S();
    if (s.dispatchYr === yr()) return;
    var pool = DISPATCHES.filter(function (d) { try { return !d.when || d.when(s); } catch (e) { return false; } });
    if (!pool.length) return;
    var d = pickWeighted(pool); if (!d) return;
    s.dispatchYr = yr();
    fx(d.fx || {});
    logIt(d.title);
    note(d.title, d.body, null, true,
      '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(d.icon) + '" alt="" style="width:54px;height:54px;object-fit:contain"></div>');
  }

  /* ---------------- New screens ---------------- */
  function openBriefing() {
    var s = S();
    if (s.oppYr !== yr()) drawOpps(s);
    var h = banner() + '<div class="pol-card"><div class="pol-title">The Briefing Room</div><div class="pol-grid">' +
      kv("Cards in hand", s.opps.length) + kv("Actions left this year", s.oppPlays) +
      kv("Decisions logged", s.history.length) +
      kv("Office", (office(s.office) || {}).name || (s.sovereign ? "Sovereign" : "Candidate")) +
      '</div><div class="pol-note" style="margin-top:8px">A fresh hand of decisions arrives each year in office. Each card can be played once and costs one briefing action. You get four a year; extra briefings can be purchased.</div></div>';
    if (!s.opps.length) h += '<div class="pol-card"><div class="pol-note">No cards in hand. Age up to receive the next briefing, or request one now.</div></div>';
    var cats = {};
    (s.opps || []).forEach(function (hand) {
      var o = opp(hand.id); if (!o) return;
      (cats[o.cat] || (cats[o.cat] = [])).push(o);
    });
    Object.keys(cats).forEach(function (cat) {
      h += sec(cat);
      cats[cat].forEach(function (o) {
        h += row(o.icon, o.name, (o.cost ? usdF(o.cost) + " · " : "") + o.desc, "opp", o.id);
      });
    });
    h += sec("Command");
    h += row("funds", "Request Extra Briefings", "Draw 2 more cards · " + usdF(6000 * ((office(s.office) || {}).tier || 1)), "oppdraw");
    h += row("gavel", "Executive Orders", s.orders.length + " issued · " + (ORDERS.length - s.orders.length) + " available", "orders");
    h += row("cabinet", "Standing Committees", activeCommittees(s) + " of 3 active", "committees");
    h += row("polls", "Situation Room", "Every lever, every number", "situation");
    h += row("hourglass", "Political Calendar", "Terms, elections, deadlines", "calendar");
    h += row("rally", "Field Operations", FIELD_ACTS.length + " direct actions", "field");
    scr("THE BRIEFING ROOM", h, openPolitics);
  }
  function playOpp(id) {
    var s = S(), o = opp(id);
    if (!o) return openBriefing();
    if (!(s.opps || []).some(function (h) { return h.id === id; })) return openBriefing();
    if (s.oppPlays <= 0) { note("No briefings left", "Age up to receive a fresh set of decisions.", null, true); return openBriefing(); }
    if ((state.money || 0) < (o.cost || 0)) { note("Cannot afford", o.name + " costs " + usdF(o.cost || 0) + ".", null, true); return openBriefing(); }
    later(function () {
      card({ tag: o.cat, iconSrc: ICO(o.icon), title: o.name, close: true,
        lead: o.desc + (o.cost ? "<br><br>Cost: " + usdF(o.cost) : ""),
        rows: [["Office", (office(s.office) || {}).name || (s.sovereign ? "Sovereign" : "Candidate")],
               ["Approval", Math.round(s.approval) + "%"], ["War chest", usdF(s.warChest)],
               ["Briefing actions left", s.oppPlays]],
        choices: o.choices.map(function (c) {
          return [c.t, function () {
            playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
            var k = -1; (s.opps || []).forEach(function (h, j) { if (h.id === id) k = j; });
            if (k >= 0) s.opps.splice(k, 1);
            s.oppPlays--;
            if (o.cost) money(-o.cost);
            fx(c.fx || {});
            if (c.f) c.f();
            logIt(o.name + ": " + c.t + ".");
            openBriefing();
          }, c.color || null];
        }).concat([["Set it aside", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openBriefing(); }]]) });
    });
  }
  function openOrders() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Executive Orders</div><div class="pol-note">Unilateral instruments of the office. Each may be issued once in a career. They do not need the assembly, but the assembly remembers.</div></div>';
    var tier = s.sovereign ? 4 : ((office(s.office) || {}).tier || 0);
    ORDERS.forEach(function (o) {
      var used = s.orders.indexOf(o.id) >= 0, locked = o.tier > tier;
      h += row(o.icon, o.name, used ? "ISSUED · " + o.desc : (locked ? "Requires " + ((OFFICES[o.tier - 1] || {}).name || "a higher office") : usdF(o.cost) + " · " + o.desc), "order", o.id,
        used ? '<div class="pol-good" style="align-self:center;font-size:11px">Done</div>' :
        (locked ? '<div class="pol-mini" style="align-self:center">Locked</div>' : ""));
    });
    scr("EXECUTIVE ORDERS", h, openBriefing);
  }
  function playOrder(id) {
    var s = S(), o = orderById(id); if (!o) return openOrders();
    if (s.orders.indexOf(id) >= 0) { note("Already issued", o.name + " has already been signed.", null, true); return openOrders(); }
    var tier = s.sovereign ? 4 : ((office(s.office) || {}).tier || 0);
    if (o.tier > tier) { note("Not available", "This order needs a higher office.", null, true); return openOrders(); }
    if ((state.money || 0) < o.cost) { note("Cannot afford", o.name + " costs " + usdF(o.cost) + ".", null, true); return openOrders(); }
    later(function () {
      card({ tag: "Executive Order", iconSrc: ICO(o.icon), title: o.name, close: true, lead: o.desc,
        rows: [["Cost", usdF(o.cost)], ["Approval", Math.round(s.approval) + "%"], ["Investigation heat", Math.round(s.heat)]],
        choices: [["Sign it", function () {
          playSfx(); try { evWrap.classList.remove("open"); } catch (x) {}
          money(-o.cost); s.orders.push(id); fx(o.fx);
          logIt("Issued the " + o.name + " order.");
          note("Order signed", o.name + " is now in force.", null, true); openOrders();
        }, "green"], ["Leave it unsigned", function () { playSfx(); try { evWrap.classList.remove("open"); } catch (x) {} openOrders(); }]] });
    });
  }
  function openCommittees() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Standing Committees</div><div class="pol-note">Convene up to three committees. Each costs coin to establish and applies its own effect every birthday while active. Disband one to free the seat.</div><div class="pol-grid" style="margin-top:9px">' +
      kv("Active", activeCommittees(s) + " / 3") + kv("Year", yr()) + '</div></div>';
    COMMITTEES.forEach(function (c) {
      var on = !!s.committees[c.id];
      h += row(c.icon, c.name, (on ? "ACTIVE · " : usdF(c.cost) + " · ") + c.desc, "committee", c.id,
        on ? '<div class="pol-good" style="align-self:center;font-size:11px">Active</div>' : "");
    });
    scr("STANDING COMMITTEES", h, openBriefing);
  }
  function toggleCommittee(id) {
    var s = S(), c = committee(id); if (!c) return openCommittees();
    if (s.committees[id]) { delete s.committees[id]; logIt("Disbanded the " + c.name + " committee."); return openCommittees(); }
    if (activeCommittees(s) >= 3) { note("No room", "Disband a committee first.", null, true); return openCommittees(); }
    if ((state.money || 0) < c.cost) { note("Cannot afford", c.name + " costs " + usdF(c.cost) + ".", null, true); return openCommittees(); }
    money(-c.cost); s.committees[id] = { since: yr() }; fx({ approval: 1 });
    logIt("Convened the " + c.name + " committee."); return openCommittees();
  }
  function openSituation() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Situation Room</div><div class="pol-grid">' +
      kv("Office", (office(s.office) || {}).name || (s.sovereign ? "Sovereign" : "Candidate")) + kv("Year", yr()) +
      kv("Approval", Math.round(s.approval) + "%") + kv("Public standing", standing()) +
      kv("Name recognition", Math.round(s.name)) + kv("War chest", usdF(s.warChest)) +
      kv("Investigation heat", Math.round(s.heat)) + kv("Controversy", Math.round(s.controversy || 0)) +
      kv("Bills enacted", s.bills.length) + kv("Cabinet seats", filledSeats(s) + " / " + ROLES.length) +
      kv("Committees", activeCommittees(s) + " / 3") + kv("Orders issued", s.orders.length) + '</div>' +
      meter("Approval", s.approval, "#4bc0a0") + meter("Public standing", standing(), "#e7b34c") +
      meter("Name recognition", s.name, "#4a9fd0") + meter("Investigation heat", s.heat, "#e2604f") + '</div>';
    h += sec("Policy Ledger · applied each birthday");
    h += '<div class="pol-card">' + CONTROLS.map(function (c) {
      return '<div class="pol-hist"><b>' + E(c.name) + '</b> · ' + s.controls[c.id] + '/100 · ' + E(c.desc) + '</div>';
    }).join("") + '</div>';
    h += sec("Active Instruments");
    h += '<div class="pol-card"><div class="pol-note">' +
      (s.scandal ? "An active scandal: " + E(s.scandal.kind) + " (severity " + s.scandal.severity + ").<br>" : "No active scandal.<br>") +
      (activeCommittees(s) ? activeCommittees(s) + " committees in session apply their effects every year.<br>" : "No committees in session.<br>") +
      (s.sovereign ? "Tribunal heat " + Math.round(s.sovereign.heat) + "/100.<br>" : "") +
      "Cabinet average skill " + Math.round(cabinetSkill()) + "%." + '</div></div>';
    h += row("budget", "Policy Controls", "Change the levers", "controls");
    h += row("cabinet", "The Cabinet", "Appoint or dismiss ministers", "cabinet");
    scr("SITUATION ROOM", h, openBriefing);
  }
  function openCalendar() {
    var s = S(), c = s.campaign;
    var h = banner() + '<div class="pol-card"><div class="pol-title">Political Calendar · ' + yr() + '</div><div class="pol-grid">' +
      kv("Term ends", s.office ? s.termEnd : "—") +
      kv("Years remaining", s.office ? Math.max(0, s.termEnd - yr()) : "—") +
      kv("Next election", c ? c.electionYear : "—") + kv("Terms served", s.terms) +
      kv("Briefing actions", s.oppPlays) + kv("Cards in hand", s.opps.length) +
      kv("Filing cooldown until", s.cooldown > yr() ? s.cooldown : "clear") +
      kv("Confined until", s.houseArrest > yr() ? s.houseArrest : "clear") + '</div></div>';
    h += sec("Upcoming");
    h += '<div class="pol-card">' +
      '<div class="pol-hist">' + (c ? "Election Day " + c.electionYear + " — " + (office(c.office) || {}).name + " race against " + E(c.opponent.name) + "." : "No election scheduled.") + '</div>' +
      '<div class="pol-hist">' + (s.office ? "Term expires " + s.termEnd + ". Reelection, a higher office, or retirement." : "No term in progress.") + '</div>' +
      '<div class="pol-hist">A fresh briefing hand and committee effects resolve on your next birthday.</div></div>';
    h += sec("This Career");
    h += '<div class="pol-card"><div class="pol-grid">' +
      kv("Bills enacted", s.bills.length) + kv("Orders issued", s.orders.length) +
      kv("Archive entries", s.history.length) + kv("Legacy chapters", s.legacy.length) + '</div></div>';
    h += row("hourglass", "Reelection & Succession", "Plan the next move", "reelection");
    h += row("press", "Political Archive", "Full record", "archive");
    scr("POLITICAL CALENDAR", h, openBriefing);
  }
  function openFieldOps() {
    var h = banner() + '<div class="pol-card"><div class="pol-title">Field Operations</div><div class="pol-note">Direct action in the districts. Every action moves approval, standing, the treasury or investigation heat immediately.</div></div>' + sec("Actions");
    FIELD_ACTS.forEach(function (a) { h += row(a.icon, a.name, a.desc, "act", a.id); });
    scr("FIELD OPERATIONS", h, openBriefing);
  }


  function fireEvent() {
    var s = S();
    if (s.lastEventYr === yr()) return;
    var pool = EVENTS.filter(function (e) { try { return !e.when || e.when(s); } catch (x) { return false; } });
    if (!pool.length) return;
    var ev = pickWeighted(pool);
    if (!ev) return;
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
    CONTROLS.forEach(function (cd) {
      if (!cd.year) return;
      var v = typeof c[cd.id] === "number" ? c[cd.id] : cd.def;
      var d = v - cd.def, yf = cd.year;
      if (yf.money) out += d * yf.money;
      if (yf.approval) s.approval = clamp(s.approval + d * yf.approval);
      if (yf.standing) { try { state.respect = clamp((state.respect == null ? 40 : state.respect) + d * yf.standing); } catch (e) {} }
      if (yf.heat) s.heat = clamp(s.heat + d * yf.heat);
      if (state.stats) {
        if (yf.smarts) state.stats.Smarts = clamp((state.stats.Smarts || 0) + d * yf.smarts);
        if (yf.health) state.stats.Health = clamp((state.stats.Health || 0) + d * yf.health);
        if (yf.happiness) state.stats.Happiness = clamp((state.stats.Happiness || 0) + d * yf.happiness);
      }
    });
    if (out) money(out);
  }
  function cabinetTick(s) {
    var vals = Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; });
    if (!vals.length) return;
    var comp = vals.reduce(function (a, k) { return a + s.cabinet[k].competence; }, 0) / vals.length;
    var loy = vals.reduce(function (a, k) { return a + s.cabinet[k].loyalty; }, 0) / vals.length;
    s.approval = clamp(s.approval + (comp - 50) / 26);
    s.heat = clamp(s.heat - (loy - 50) / 22);
    vals.forEach(function (k) {
      var rr = role(k);
      if (rr && rr.perkFx) fx(rr.perkFx);
    });
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
        drawOpps(s);
        committeeTick(s);
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
        if (!s.termEvent) {
          if (chance(.72)) fireEvent();
          else if (chance(.5)) fireDispatch();
        }
      }
      if (s.sovereign) {
        var sv = s.sovereign;
        sv.reignYears = (sv.reignYears || 0) + 1;
        applyControls(s);
        drawOpps(s);
        committeeTick(s);
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
        if (chance(.72)) fireEvent();
        else if (chance(.45)) fireDispatch();
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
      h += row("capitol", "Stewardship", "Serve the people · " + PROJECTS.length + " great projects", "steward");
      h += row("dossier", "Decrees & Repression", Object.keys(s.sovereign.decrees).filter(function (k) { return s.sovereign.decrees[k]; }).length + " decrees in force", "repression");
      h += row("helmet", "The Legions", Math.round(s.sovereign.soldiers).toLocaleString() + " soldiers · level " + s.sovereign.legionLevel, "legions");
      h += row("wanted", "The Tribunal", s.sovereign.mostWanted ? "MOST WANTED — armies are hunting you" : "Heat " + Math.round(s.sovereign.heat) + "/100", "tribunal");
      h += row("bill", "Policy Controls", "Tax, spending, press, military, liberty", "controls");
      h += row("hourglass", "Abdicate", "End the reign and retire", "abdicate");
    } else if (s.office) {
      var o = office(s.office);
      h += sec("Office of the " + o.name);
      h += row("polls", "Approval & Polling", Math.round(s.approval) + "% approval · term ends " + s.termEnd, "standing");
      h += row("bill", "Legislation", s.bills.length + " bills enacted · " + BILLS.length + " on the docket", "legislation");
      h += row("cabinet", "The Cabinet", Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; }).length + " of " + ROLES.length + " seats filled", "cabinet");
      h += row("pressconf", "Press & Public", "Conferences, spin, interviews, addresses", "press");
      h += row("townhall", "Constituents", "Town halls, relief, projects, letters", "constituents");
      h += row("budget", "Policy Controls", CONTROLS.length + " levers that reshape the yearly books", "controls");
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
    if (s.office || s.sovereign) {
      h += sec("Command");
      h += row("dossier", "The Briefing Room", s.opps.length + " cards · " + s.oppPlays + " actions left this year", "briefing");
      h += row("gavel", "Executive Orders", s.orders.length + " issued · " + (ORDERS.length - s.orders.length) + " available", "orders");
      h += row("cabinet", "Standing Committees", activeCommittees(s) + " of 3 active", "committees");
      h += row("polls", "Situation Room", "Every lever, every number", "situation");
      h += row("hourglass", "Political Calendar", "Terms, elections, deadlines", "calendar");
      h += row("rally", "Field Operations", FIELD_ACTS.length + " direct actions", "field");
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
    h += row("endorse", "Call a Caucus", "Bring the party together", "act", "caucus");
    h += row("gavel", "Work the Whips", "Push the programme through", "act", "whip");
    h += row("chains", "Grant a Pardon", "Standing, at the cost of controversy", "act", "pardon");
    h += row("budget", "Trim the Budget", "Coin now, approval later", "act", "budgetreview");
    h += row("map", "Lease the Harbour Wharves", "Coin now, approval later", "act", "harbour");
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
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">The Legislative Docket</div><div class="pol-note">' +
      BILLS.length + ' bills across six committees. Passage depends on approval, cabinet skill and how controversial the bill is. Sign it or veto it once it reaches your desk.</div></div>';
    var groups = {}, order = [];
    BILLS.forEach(function (b) {
      var c = b.cat || "Core Legislation";
      if (!groups[c]) { groups[c] = []; order.push(c); }
      groups[c].push(b);
    });
    order.forEach(function (c) {
      h += sec(c);
      groups[c].forEach(function (b) {
        var done = (s.bills || []).indexOf(b.id) >= 0;
        h += row(b.icon, b.name, done ? "ENACTED · " + b.desc : b.desc, "bill", b.id,
          done ? '<div class="pol-good" style="align-self:center;font-size:11px">Law</div>' : "");
      });
    });
    scr("LEGISLATION", h, openPolitics);
  }
  function openCabinet() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">The Cabinet</div><div class="pol-grid">' +
      kv("Seats filled", Object.keys(s.cabinet).filter(function (k) { return s.cabinet[k]; }).length + " / " + ROLES.length) +
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
    h += row("press", "Write an Open Letter", "Name recognition and a clear line", "act", "oped");
    h += row("crown", "Host a State Visit", "Standing abroad, at a cost", "act", "statevisit");
    h += row("treaty", "Mediate a Dispute", "Cool investigations, lift standing", "act", "mediation");
    h += row("dossier", "Audit the Departments", "Standing up, heat down", "act", "audit");
    h += row("justice", "Inspect the Offices", "A quiet check on the books", "act", "inspection");
    scr("PRESS & PUBLIC", h, openPolitics);
  }
  function openConstituents() {
    var h = banner() + '<div class="pol-card"><div class="pol-title">Constituents</div><div class="pol-note">Quiet, unglamorous work. It is also where approval is really won.</div></div>' + sec("Actions");
    h += row("townhall", "Town Hall", "Listen to the district", "act", "townhall");
    h += row("capitol", "Fund a Local Project", "A bridge, a library, a clinic", "act", "project");
    h += row("funds", "Disaster Relief Fund", "Open the purse for a hard year", "act", "relief");
    h += row("endorse", "Ribbon Cutting", "Be seen where it counts", "act", "ribbon");
    h += row("press", "Answer Constituent Letters", "Slow, personal, steady", "act", "letters");
    h += row("funds", "District Grants", "Approval and standing across the wards", "act", "grants");
    h += row("townhall", "Open a Free Clinic", "Approval and public health", "act", "clinic");
    h += row("bill", "Fund Scholarships", "Smarts and approval", "act", "scholarship");
    h += row("capitol", "An Apprenticeship Scheme", "Work and goodwill in the districts", "act", "apprentice");
    h += row("rally", "Fund a Civic Festival", "Approval and happiness", "act", "festival");
    h += row("medal", "Raise a Memorial", "Standing and approval", "act", "memorial");
    h += row("protest", "Receive a Petition", "Small, steady, personal", "act", "petition");
    scr("CONSTITUENTS", h, openPolitics);
  }
  function openControls() {
    var s = S(), h = banner() + '<div class="pol-card"><div class="pol-title">Policy Controls</div><div class="pol-note">' + CONTROLS.length + ' levers applied every birthday. Tax, spending, health, education, housing, tariffs, the courts, the environment and welfare all move the yearly books. Changes take effect on the next Age.</div></div>';
    CONTROLS.forEach(function (c) {
      var v = s.controls[c.id];
      h += '<div class="pol-card"><div class="pol-title">' + E(c.name) + '</div><div class="pol-note">' + E(c.desc) + '</div>' +
        '<div class="pol-ctl"><button data-pol="ctl" data-arg="' + c.id + ':-10">−</button><span class="val">' + v + '</span>' +
        '<button data-pol="ctl" data-arg="' + c.id + ':10">+</button><span class="lbl">' + E(c.name) + '</span></div>' +
        meter(c.name, v, c.id === "press" ? "#4a9fd0" : c.id === "military" ? "#e7b34c" : "#4bc0a0") + '</div>';
    });
    h += row("budget", "Reset to Defaults", "Restore all " + CONTROLS.length + " levers", "ctlreset");
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
      "winning installs a real job with a salary and a four-year term. In office you manage approval, pass a full legislative docket, fill a cabinet, play a yearly hand of briefing cards, issue executive orders, convene standing committees, work the press and your constituents, and set a dozen policy levers that apply every birthday. Scandals, recall petitions and impeachment can end you early. At the end of a term you can run again, seek higher office, or retire.<br><br>" +
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
    letters: { approval: 4, standing: 2, happiness: -1 },
    audit: {standing: 3, heat: -6, money: -6000},
    ombudsman: {approval: 5, heat: -3},
    grants: {approval: 6, standing: 3, money: -16000},
    pardon: {standing: 5, approval: -2, controversy: 4},
    caucus: {warChest: 8000, approval: 2},
    whip: {approval: 3, controversy: 2},
    clinic: {approval: 7, health: 2, money: -12000},
    scholarship: {smarts: 2, approval: 4, money: -9000},
    apprentice: {approval: 4, standing: 3, money: -7000},
    harbour: {money: 18000, standing: 2, approval: -2},
    memorial: {standing: 6, approval: 3, money: -8000},
    oped: {name: 6, approval: 2},
    petition: {approval: 3, standing: 2, happiness: -1},
    mediation: {heat: -8, standing: 4, money: -5000},
    inspection: {heat: -5, controversy: 3, standing: 2},
    festival: {approval: 5, happiness: 3, money: -10000},
    statevisit: {standing: 8, name: 4, money: -14000},
    budgetreview: {money: 12000, approval: -2},
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
        note("Reset", "All " + CONTROLS.length + " policy levers are back to defaults.", null, true); return openControls();
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
      case "briefing": return openBriefing();
      case "opp": return playOpp(arg);
      case "oppdraw": { drawOpps(s, 2, true); return openBriefing(); }
      case "orders": return openOrders();
      case "order": return playOrder(arg);
      case "committees": return openCommittees();
      case "committee": return toggleCommittee(arg);
      case "situation": return openSituation();
      case "calendar": return openCalendar();
      case "field": return openFieldOps();
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
      OPPS: OPPS, ORDERS: ORDERS, COMMITTEES: COMMITTEES, DISPATCHES: DISPATCHES,
      FIELD_ACTS: FIELD_ACTS, WHEN: WHEN,
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
      openBriefing: openBriefing, openOrders: openOrders, openCommittees: openCommittees,
      openSituation: openSituation, openCalendar: openCalendar, openFieldOps: openFieldOps,
      drawOpps: drawOpps, playOpp: playOpp, playOrder: playOrder,
      toggleCommittee: toggleCommittee, fireDispatch: fireDispatch,
      pickWeighted: pickWeighted, activeCommittees: activeCommittees,
      dispatch: dispatch, ICO: ICO
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
