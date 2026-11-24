/*
 * era-realism.js — Historical realism pack (1800s–1940s)
 *
 *  1. Maternal + infant mortality in the 1800–1949 calendar window
 *  2. A "become a feminist / suffragist" identity path (1848–1965)
 *  3. Famous historical inventors attached to every invention, an expanded
 *     invention timeline (1901–1989) and a "Rivals in History" notebook
 *  4. Forced male conscription (16+) during 1800–1945 wars
 *
 * Loaded after the core game. Everything is additive: no core file is
 * rewritten beyond the single <script> tag that loads this module.
 */
(function () {
  if (window.ERA_REALISM) return;

  /* ---------------------------------------------------------------- *
   * Config + pure helpers (exposed for tests)
   * ---------------------------------------------------------------- */
  var CFG = {
    eraFrom: 1800,
    eraTo: 1949,
    feministFrom: 1848,
    feministTo: 1965,
    draftMin: 16,
    draftMax: 50,
    maternal: [[1800, 1879, .06], [1880, 1919, .04], [1920, 1939, .02], [1940, 1949, .012]],
    infant:   [[1800, 1879, .22], [1880, 1919, .15], [1920, 1939, .08], [1940, 1949, .04]],
    still:    [[1800, 1879, .10], [1880, 1919, .06], [1920, 1949, .02]]
  };

  function rateFor(table, y) {
    for (var i = 0; i < table.length; i++)
      if (y >= table[i][0] && y <= table[i][1]) return table[i][2];
    return 0;
  }
  function inEra(y) { return y >= CFG.eraFrom && y <= CFG.eraTo; }
  function rates(y) {
    return {
      maternal: rateFor(CFG.maternal, y),
      infant:   rateFor(CFG.infant, y),
      still:    rateFor(CFG.still, y)
    };
  }
  function yr() {
    try { return yearNow(); } catch (e) { return 0; }
  }
  function alive() {
    try { return !state.dead && !state.prison; } catch (e) { return false; }
  }
  function chance(p) { return Math.random() < p; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function safe(fn, a, b, c) { try { return fn(a, b, c); } catch (e) { return null; } }

  /* ---------------------------------------------------------------- *
   * 3. INVENTIONS — historical names + expanded timeline
   * ---------------------------------------------------------------- */
  /* Real people credited with each of the game's original 34 ideas. */
  var HISTORICAL = {
    steamboat: "Robert Fulton", matches: "John Walker", locomotive: "George Stephenson",
    mower: "Edwin Budding", reaper: "Cyrus McCormick", revolver: "Samuel Colt",
    plow: "John Deere", telegraph: "Samuel F. B. Morse", rubber: "Charles Goodyear",
    sewing: "Elias Howe", elevator: "Elisha Otis", kerosene: "Ignacy Łukasiewicz",
    watch: "Aaron L. Dennison", dynamite: "Alfred Nobel", typewriter: "Christopher Latham Sholes",
    barbed: "Joseph Glidden", telephone: "Alexander Graham Bell", phonograph: "Thomas Edison",
    refrig: "Gustavus Swift", bulb: "Thomas Edison", cashreg: "James Ritty",
    pen: "Lewis Waterman", bicycle: "John Kemp Starley", dishwasher: "Josephine Cochrane",
    camera: "George Eastman", tire: "John Boyd Dunlop", motor: "Nikola Tesla",
    movie: "Thomas Edison & W. K. L. Dickson", zipper: "Whitcomb Judson",
    wireless: "Guglielmo Marconi", aircon: "Willis Carrier", airplane: "Orville & Wilbur Wright"
  };

  /* New ideas, 1901–1989. ico codes are reused from the game's own atlas. */
  var apple = function (c) { return "freelife/apple/" + c + ".png"; };
  var NEW_INVENTIONS = [
    { id: "vacuum",  name: "Vacuum Cleaner", ico: apple("1f9f5"), y: 1901, roy: 6e3,  mat: 18, danger: .04, inventor: "Hubert Cecil Booth" },
    { id: "prints",  name: "Fingerprint Identification", ico: apple("1f58b-fe0f"), y: 1902, roy: 9e3, mat: 14, danger: .03, inventor: "Juan Vucetich, Francis Galton & Sir Edward Henry", note: "First used to solve a murder in Argentina in 1892; Scotland Yard adopted it in 1901." },
    { id: "assembly",name: "Moving Assembly Line", ico: apple("2699-fe0f"), y: 1913, roy: 14e3, mat: 34, danger: .05, inventor: "Henry Ford" },
    { id: "steel",   name: "Stainless Steel", ico: apple("1f517"), y: 1913, roy: 10e3, mat: 22, danger: .06, inventor: "Harry Brearley" },
    { id: "insulin", name: "Insulin", ico: apple("1f9e8"), y: 1921, roy: 16e3, mat: 26, danger: .05, inventor: "Frederick Banting & Charles Best" },
    { id: "tv",      name: "Television", ico: apple("1f4fb"), y: 1925, roy: 22e3, mat: 40, danger: .05, inventor: "John Logie Baird (and Philo Farnsworth)" },
    { id: "penicil", name: "Penicillin", ico: apple("1f33f"), y: 1928, roy: 20e3, mat: 24, danger: .05, inventor: "Alexander Fleming" },
    { id: "nylon",   name: "Nylon", ico: apple("1f9f5"), y: 1935, roy: 12e3, mat: 20, danger: .07, inventor: "Wallace Carothers" },
    { id: "radar",   name: "Radar", ico: apple("1f4e8"), y: 1935, roy: 18e3, mat: 38, danger: .06, inventor: "Robert Watson-Watt" },
    { id: "ballpt",  name: "Ballpoint Pen", ico: apple("1f58b-fe0f"), y: 1938, roy: 8e3, mat: 12, danger: .04, inventor: "László Bíró" },
    { id: "jet",     name: "Jet Engine", ico: apple("2708-fe0f"), y: 1939, roy: 24e3, mat: 48, danger: .12, inventor: "Frank Whittle & Hans von Ohain" },
    { id: "micro",   name: "Microwave Oven", ico: apple("1f525"), y: 1945, roy: 14e3, mat: 30, danger: .07, inventor: "Percy Spencer" },
    { id: "transis", name: "Transistor", ico: apple("1f4a1"), y: 1947, roy: 26e3, mat: 36, danger: .05, inventor: "John Bardeen, Walter Brattain & William Shockley" },
    { id: "polaroid",name: "Instant Camera", ico: apple("1f4f7"), y: 1948, roy: 11e3, mat: 22, danger: .04, inventor: "Edwin Land" },
    { id: "credit",  name: "Credit Card", ico: apple("1f4b5"), y: 1950, roy: 12e3, mat: 16, danger: .03, inventor: "Frank McNamara (Diners Club)" },
    { id: "polio",   name: "Polio Vaccine", ico: apple("1f9e8"), y: 1955, roy: 22e3, mat: 30, danger: .05, inventor: "Jonas Salk" },
    { id: "ic",      name: "Integrated Circuit", ico: apple("1f4a1"), y: 1958, roy: 30e3, mat: 44, danger: .05, inventor: "Jack Kilby (and Robert Noyce)" },
    { id: "laser",   name: "Laser", ico: apple("1f525"), y: 1960, roy: 28e3, mat: 42, danger: .09, inventor: "Theodore Maiman" },
    { id: "chip",    name: "Microprocessor", ico: apple("2328-fe0f"), y: 1971, roy: 34e3, mat: 52, danger: .05, inventor: "Federico Faggin, Ted Hoff & Stanley Mazor" },
    { id: "pc",      name: "Personal Computer", ico: apple("2328-fe0f"), y: 1975, roy: 32e3, mat: 50, danger: .04, inventor: "Ed Roberts (Altair) & Steve Wozniak" },
    { id: "afis",    name: "Automated Fingerprint Search", ico: apple("1f4f7"), y: 1982, roy: 26e3, mat: 46, danger: .04, inventor: "NEC and the FBI", note: "Computerised fingerprint matching reached police use in the 1980s." },
    { id: "dna",     name: "DNA Fingerprinting", ico: apple("1f9e8"), y: 1984, roy: 36e3, mat: 54, danger: .04, inventor: "Sir Alec Jeffreys", note: "First used in a criminal investigation in 1986." },
    { id: "web",     name: "World Wide Web", ico: apple("1f4e8"), y: 1989, roy: 40e3, mat: 60, danger: .03, inventor: "Tim Berners-Lee" }
  ];

  var INV = (typeof INVENTIONS !== "undefined") ? INVENTIONS : [];
  function installInventions() {
    INV.forEach(function (v) {
      v.histYear = v.y;
      v.inventor = HISTORICAL[v.id] || v.inventor || "An unknown tinkerer";
    });
    NEW_INVENTIONS.forEach(function (v) {
      if (INV.some(function (x) { return x.id === v.id; })) return;
      v.histYear = v.y;
      INV.push(v);
    });
    /* Let era-appropriate words through the game's modern-word filter. */
    try {
      [
        [1901, /\bvacuum cleaners?\b/gi],
        [1913, /\bassembly lines?|stainless steel\b/gi],
        [1921, /\binsulin\b/gi],
        [1925, /\btelevisions?\b/gi],
        [1928, /\bpenicillin\b/gi],
        [1935, /\bradar|nylon\b/gi],
        [1938, /\bballpoint\b/gi],
        [1939, /\bjet engines?\b/gi],
        [1945, /\bmicrowave\b/gi],
        [1947, /\btransistors?\b/gi],
        [1955, /\bpolio\b/gi],
        [1958, /\bintegrated circuits?\b/gi],
        [1960, /\blasers?\b/gi],
        [1971, /\bmicroprocessors?\b/gi],
        [1975, /\bpersonal computers?\b/gi],
        [1982, /\bautomated fingerprint\b/gi],
        [1984, /\bdna\b/gi],
        [1989, /\bworld wide web\b/gi]
      ].forEach(function (pair) { ERA_OK.push(pair); });
    } catch (e) {}
  }

  /* Inject the historical inventor into Workshop / Eureka cards. */
  function wrapJCard() {
    var orig = window.jCard;
    if (!orig) return;
    window.jCard = function (cfg) {
      try {
        if (cfg && (cfg.tag === "Workshop" || cfg.tag === "Eureka!")) {
          var inv = INV.filter(function (x) { return x.name === cfg.title; })[0];
          if (inv && inv.inventor) {
            var done = (function () {
              try { return (state.invent && state.invent.done || []).indexOf(inv.id) >= 0; }
              catch (e) { return false; }
            })();
            cfg.rows = (cfg.rows || []).concat([
              [done ? "Your claim" : "History credits",
               done ? "You hold the patent" : inv.inventor + " (" + (inv.histYear || inv.y) + ")"]
            ]);
            if (cfg.tag === "Eureka!" && cfg.lead && !done) {
              cfg.lead += " History remembers " + inv.inventor + " for this one.";
            }
          }
        }
      } catch (e) {}
      return orig.call(this, cfg);
    };
  }

  function openHistory() {
    try {
      sTitle.textContent = "RIVALS IN HISTORY";
      sSub.style.display = "none";
      sBack.innerHTML = BACK_ICON;
      sBack.onclick = function () { play("choice"); openInventing(); };
      var done = [];
      try { done = (state.invent && state.invent.done) || []; } catch (e) {}
      var rows = INV.slice().sort(function (a, b) { return a.histYear - b.histYear; })
        .map(function (v) {
          var you = done.indexOf(v.id) >= 0;
          return '<div class="row sm"><img src="' + v.ico + '"><div class="t"><b>' +
            v.name + ' <em>(' + (v.histYear || v.y) + ')</em></b><span>' +
            (you ? "Patented by you — you beat history" : (v.inventor || "An unknown tinkerer")) +
            '</span></div></div>';
        }).join("");
      sList.innerHTML = '<div class="sec">Who really invented what</div>' + rows +
        '<div class="sec">Notes</div><div class="row sm"><div class="t"><span style="white-space:normal;line-height:1.5">' +
        'Names shown are the real historical inventors. When you patent an idea yourself, the game records that you beat them to it.' +
        '</span></div></div>';
      sList.scrollTop = 0;
      screen.classList.add("open");
    } catch (e) {}
  }
  window.openEraHistory = openHistory;

  function wrapInventing() {
    var orig = window.openInventing;
    if (!orig) return;
    window.openInventing = function () {
      var res = orig.apply(this, arguments);
      try {
        var row = document.createElement("div");
        row.className = "row";
        row.setAttribute("data-er", "history");
        row.innerHTML = '<img src="freelife/apple/1f4dc.png" alt=""><div class="t">' +
          '<b>Rivals in History</b><span>See who really invented what</span></div>' + DOTS;
        sList.insertBefore(row, sList.firstChild);
        row.onclick = function () { play("choice"); openHistory(); };
        sList.querySelectorAll("[data-idea]").forEach(function (el) {
          var inv = INV.filter(function (x) { return x.id === el.getAttribute("data-idea"); })[0];
          if (!inv || !inv.inventor) return;
          var t = el.querySelector(".t");
          if (!t) return;
          var cr = t.querySelector(".er-credit");
          if (!cr) {
            cr = document.createElement("span");
            cr.className = "er-credit";
            cr.style.cssText = "display:block;font-size:10px;opacity:.72;margin-top:2px";
            t.appendChild(cr);
          }
          cr.textContent = "History: " + inv.inventor + " (" + (inv.histYear || inv.y) + ")";
        });
      } catch (e) {}
      return res;
    };
  }

  /* Each year, announce the real inventor of anything you did NOT patent. */
  function historyTick(y) {
    try { if (!isOldEra()) return; } catch (e) { return; }
    var seen = state.eraHistSeen || (state.eraHistSeen = []);
    var done = (function () { try { return (state.invent && state.invent.done) || []; } catch (e) { return []; } })();
    INV.forEach(function (v) {
      if ((v.histYear || v.y) !== y || seen.indexOf(v.id) >= 0) return;
      seen.push(v.id);
      var you = done.indexOf(v.id) >= 0;
      var title = you ? "You made history" : "From the newspapers";
      var text = you
        ? "In " + y + ", you patented the " + v.name + ". History credits " + v.inventor + ", but the patent is yours."
        : "In " + y + ", " + v.inventor + " unveiled the " + v.name + "." + (v.note ? " " + v.note : "");
      queuePopup(function () { notice(title, text, null, true); });
    });
  }

  /* ---------------------------------------------------------------- *
   * 2. FEMINIST / SUFFRAGIST identity path
   * ---------------------------------------------------------------- */
  var FEM_ROLES = ["Sympathizer", "Organizer", "Leader"];
  function femWindow(y) { return y >= CFG.feministFrom && y <= CFG.feministTo; }

  function femJoin(level) {
    var y = yr();
    state.feminist = {
      since: y, until: CFG.feministTo, level: level || 1,
      role: FEM_ROLES[(level || 1) - 1], years: 0
    };
    if ((level || 1) >= 2) {
      eraFx({ Respect: 9, Happiness: 5 });
      fx({ Smarts: 3 });
      say("I began organizing for women's rights in " + y + ".");
      if (chance(.35)) {
        eraFx({ Respect: -4, Happiness: -4 });
        state.money = Math.max(0, state.money - Math.round((state.money || 0) * .04));
        renderStats();
        queuePopup(function () {
          notice("Hauled in",
            "The rally was broken up and you spent a night in the cells. It cost you a fine, but the papers printed your name.",
            null, true);
        });
      } else {
        queuePopup(function () {
          notice("A voice in the movement",
            "Your rally drew a crowd. People are starting to know your name.", null, true);
        });
      }
    } else {
      eraFx({ Respect: 5, Happiness: 4 });
      fx({ Smarts: 2 });
      say("I joined the women's suffrage movement in " + y + ".");
      queuePopup(function () {
        notice("Votes for women", "You have joined the movement for women's rights.", null, true);
      });
    }
    /* Traditional relatives may disapprove. */
    var pool = [].concat(state.parents || [], state.lovers || []).filter(function (p) { return p && !p.dead; });
    if (pool.length && chance(.4)) {
      var p = pick(pool);
      p.rel = clamp((p.rel == null ? 60 : p.rel) - rint(3, 9));
    }
    notice("Identity", "You now identify as part of the women's rights movement.",
      function () { openIdentity(); }, true);
  }

  function openFeminist() {
    var y = yr(), f = state.feminist, female = "f" === PG();
    var figures = y <= 1920
      ? "Elizabeth Cady Stanton, Susan B. Anthony, Sojourner Truth and Emmeline Pankhurst"
      : "Millicent Fawcett, Simone de Beauvoir and Betty Friedan";
    var lead = f
      ? "You have stood with the movement since " + f.since + ". You are known as " +
        f.role.toLowerCase() + ". " + figures + " are the names in the papers."
      : "It is " + y + ". The papers are full of " + figures +
        ". " + (female
          ? "Women are told their place is in the home."
          : "Many men dismiss the whole thing, but some of us think they are wrong.") +
        "<br><br>Where do you stand?";
    var choices = f ? [
      ["Organize another rally", function () { femJoin(Math.min(3, f.level + 1)); }, "green"],
      ["Step back from the movement", function () {
        state.feminist = null;
        eraFx({ Respect: -3 });
        say("I stepped back from the women's rights movement.");
        notice("Stepping back", "You let the movement carry on without you.", function () { openIdentity(); }, true);
      }, "gray"]
    ] : [
      ["Join the suffrage movement", function () { femJoin(1); }, "green"],
      ["Organize a rally yourself", function () { femJoin(2); }],
      ["Keep your head down", function () {
        eraFx({ Respect: -2, Happiness: -2 });
        say("I stayed out of the suffrage movement.");
        notice("On the sidelines", "You kept your opinions to yourself.", function () { openIdentity(); }, true);
      }, "gray"]
    ];
    jCard({
      tag: "Identity", iconSrc: "act/identity.png", title: "Women's Rights",
      close: true, lead: lead,
      rows: f ? [["Standing", f.role], ["Since", f.since], ["Years active", f.years || 0]]
              : [["Year", y], ["Movement", "Suffrage & equal rights"]],
      choices: choices
    });
  }
  window.openFeminist = openFeminist;

  function wrapIdentity() {
    var orig = window.openIdentity;
    if (!orig) return;
    window.openIdentity = function () {
      var res = orig.apply(this, arguments);
      try {
        if (!femWindow(yr())) return res;
        var row = document.createElement("div");
        row.className = "row";
        row.setAttribute("data-id", "feminist");
        var f = state.feminist;
        row.innerHTML = '<img src="act/identity.png" alt=""><div class="t"><b>Women\'s Rights</b><span>' +
          (f ? "Standing: " + f.role + " (since " + f.since + ")" : "Suffrage, equal rights, and where you stand") +
          '</span></div>' + DOTS;
        sList.appendChild(row);
        row.onclick = function () { play("choice"); openFeminist(); };
      } catch (e) {}
      return res;
    };
  }

  function feministTick(y) {
    var f = state.feminist;
    if (!f || y > f.until) return;
    eraFx({ Respect: 2, Happiness: 1 });
    f.years = (f.years || 0) + 1;
    if (f.level < 3 && chance(.12 + f.level * .05)) {
      f.level += 1;
      f.role = FEM_ROLES[f.level - 1];
      say("I became known as " + f.role.toLowerCase() + " in the women's rights movement.");
      queuePopup(function () {
        notice("A louder voice", "People are starting to listen when you speak about equal rights.", null, true);
      });
    }
    if (chance(.12)) {
      var pool = [].concat(state.parents || [], state.lovers || []).filter(function (p) { return p && !p.dead; });
      if (pool.length) {
        var p = pick(pool);
        p.rel = clamp((p.rel == null ? 60 : p.rel) - rint(2, 6));
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 1. Maternal + infant mortality
   * ---------------------------------------------------------------- */
  var INFANT_CAUSES = [
    "a fever", "whooping cough", "measles", "cholera", "a winter chill",
    "consumption", "an infected wound", "the croup", "smallpox"
  ];

  function stillbirthCard(e, y) {
    var who = ("f" === BIO() && !e.surrogate) ? "I" : "The mother";
    say("The baby was stillborn.");
    fx({ Happiness: -rint(12, 22) });
    jCard({
      tag: "Baby", iconSrc: "love2/miscarriage.png", title: "Stillborn",
      close: true,
      lead: "In " + y + ", before modern medicine, a difficult birth was a gamble with " +
        "both lives. " + who + " went through labor, but the child never drew breath.",
      ok: function () {}
    });
  }

  function markMotherDead(e, name, y) {
    if (e.surrogate) {
      say("My surrogate, " + e.surrogate.first + ", died after the birth.");
      fx({ Happiness: -18 });
      notice("Gone", name + " died in childbirth in " + y + ". The baby is yours to raise.", null, true);
      return;
    }
    var pool = [state.spouse].concat(state.lovers || [], state.exes || []).filter(Boolean);
    var m = pool.filter(function (p) {
      return p.first === e.other.first && (!p.last || p.last === e.other.last);
    })[0];
    if (m) {
      m.dead = true;
      m.diedAt = state.age;
      m.deathCause = "complications in childbirth";
    }
    say("My partner, " + e.other.first + ", died after giving birth.");
    fx({ Happiness: -18 });
    notice("Widowed", name + " died in childbirth in " + y + ".", null, true);
  }

  function maternalDeath(e, y) {
    var playerGaveBirth = ("f" === BIO() && !e.surrogate);
    var name = e.surrogate
      ? (e.surrogate.first + " " + (e.surrogate.last || "")).trim()
      : ((e.other && (e.other.first + " " + (e.other.last || "")).trim()) || "the baby's mother");
    queuePopup(function () {
      if (state.dead) return;
      notice("Tragedy in childbed",
        playerGaveBirth
          ? "Complications set in soon after the birth. In " + y +
            ", there are no antibiotics, no blood transfusions and no operating theatre. The doctor can do very little."
          : name + " never recovered from the birth. In " + y +
            ", childbirth was far more dangerous than it is today.",
        function () {
          if (playerGaveBirth) die("complications in childbirth");
          else markMotherDead(e, name, y);
        }, true);
    });
  }

  function wrapBabyCard() {
    var orig = window.babyCard;
    if (!orig) return;
    window.babyCard = function (e) {
      try {
        var y = yr();
        if (inEra(y) && alive()) {
          var r = rates(y);
          if (chance(r.still)) { stillbirthCard(e, y); return; }
          var maternal = chance(r.maternal);
          var res = orig.call(this, e);
          var go = document.getElementById("bbGo");
          if (go && typeof go.onclick === "function") {
            var origGo = go.onclick;
            go.onclick = function (ev) {
              var out = origGo.call(this, ev);
              if (maternal) maternalDeath(e, y);
              return out;
            };
          }
          return res;
        }
      } catch (err) {}
      return orig.call(this, e);
    };
  }

  function mortalityTick(y) {
    if (!inEra(y) || !alive()) return;
    var r = rates(y);
    /* The player as an infant. */
    if (state.age === 1 && !state.eraInfantRolled) {
      state.eraInfantRolled = true;
      if (chance(r.infant)) {
        queuePopup(function () {
          if (state.dead) return;
          notice("A short life",
            "In " + y + ", infant illness took a terrible toll. Your life ended before it really began.",
            function () { die("an infant illness"); }, true);
        });
        return;
      }
    }
    /* Children in the family. */
    (state.family || []).forEach(function (c) {
      if (c.kind !== "child" || c.dead || c.eraInfantRolled) return;
      var age = state.age + (c.ageOffset || 0);
      if (age < 0 || age > 5) { c.eraInfantRolled = true; return; }
      c.eraInfantRolled = true;
      if (!chance(r.infant)) return;
      c.dead = true;
      c.diedAt = state.age;
      c.deathCause = pick(INFANT_CAUSES);
      say("My " + ("f" === c.g ? "daughter" : "son") + " " + c.first +
          " died of " + c.deathCause + " at " + age + ".");
      fx({ Happiness: -12 });
      queuePopup(function () {
        notice("A small grave",
          "In " + y + ", " + c.first + " died of " + c.deathCause +
          ". Infant mortality was a fact of life in those years.", null, true);
      });
    });
  }

  /* ---------------------------------------------------------------- *
   * 4. Forced conscription (males 16+) during 1800–1945 wars
   * ---------------------------------------------------------------- */
  var ERA_WARS = [
    { k: "napoleon", name: "the Napoleonic Wars", from: 1803, to: 1815, risk: .5,
      who: ["gb", "fr", "de", "it", "es", "pt", "ru", "at", "nl", "be", "pl", "se", "no", "dk"], where: "Europe" },
    { k: "war1812", name: "the War of 1812", from: 1812, to: 1815, risk: .45,
      who: ["us", "gb", "ca"], where: "the Canadian frontier" },
    { k: "crimean", name: "the Crimean War", from: 1853, to: 1856, risk: .6,
      who: ["gb", "fr", "ru", "tr", "it", "ro"], where: "the Crimea" },
    { k: "civil", name: "the American Civil War", from: 1861, to: 1865, risk: .65,
      who: ["us"], where: "the front" },
    { k: "franco", name: "the Franco-Prussian War", from: 1870, to: 1871, risk: .55,
      who: ["fr", "de"], where: "France" },
    { k: "spanam", name: "the Spanish-American War", from: 1898, to: 1898, risk: .4,
      who: ["us", "es", "ph", "cu"], where: "Cuba and the Philippines" },
    { k: "boer", name: "the Second Boer War", from: 1899, to: 1902, risk: .45,
      who: ["gb", "za", "au", "nz", "ca"], where: "South Africa" },
    { k: "ww1", name: "the Great War", from: 1914, to: 1918, risk: .85,
      who: ["us", "gb", "fr", "de", "it", "ca", "au", "nz", "ru", "at", "tr", "be", "in", "pl", "rs"], where: "the Western Front" },
    { k: "ww2", name: "the Second World War", from: 1939, to: 1945, risk: .95,
      who: ["gb", "fr", "ca", "au", "nz", "za", "in", "pl", "nl", "be", "no", "gr", "us", "ru", "de", "it", "jp", "br", "mx", "ph"], where: "Europe and the Pacific" }
  ];

  function warsFor(y, country) {
    return ERA_WARS.filter(function (w) {
      return y >= w.from && y <= w.to && w.who.indexOf(country) >= 0;
    });
  }

  function serving() {
    try {
      return !!(state.job && (state.job.mil1800 ||
        (typeof MIL_RANKS !== "undefined" && MIL_RANKS[state.job.c])));
    } catch (e) { return false; }
  }

  function forceEnlist(war, y) {
    try { (state.wwDraft || (state.wwDraft = {}))[war.k] = "served"; } catch (e) {}
    state.draftYear = y;
    say("I was conscripted into " + war.name + " at age " + state.age + ".");
    try {
      var branches = (typeof mil1800Branches === "function") ? mil1800Branches() : null;
      var b = branches && branches[0];
      if (b && typeof mil1800Join === "function") mil1800Join(b, false, "Infantry", false, true);
    } catch (e) {}
    if (!serving()) {
      try {
        state.job = {
          t: "Private", c: "Army", emp: war.name, pay: localPrice(400),
          icon: "mil1800/army-seal.png", perf: 50, yrs: 0, worked: false, asked: false,
          mil1800: { k: "army", name: war.name, end: state.age + 3, term: 3, officer: false }
        };
        renderAvatar(); renderStats();
      } catch (e) {}
    }
    try { state.respect = clamp((state.respect == null ? 40 : state.respect) + 3); } catch (e) {}
    notice("Called up",
      "You have been ordered to " + war.where + " with " + war.name + ". There is no saying no.",
      null, true);
    if (chance(.55)) queuePopup(function () { deploymentCard(war, y); });
  }

  function deploymentCard(war, y) {
    jCard({
      tag: "War", iconSrc: "mil1800/army-seal.png", title: "Sent to the Front",
      close: true,
      lead: "Your regiment has been ordered to " + war.where + ". In " + y +
        ", boys of sixteen marched beside grown men, and many never came home.",
      rows: [["Conflict", war.name], ["Theatre", war.where], ["Your age", state.age]],
      choices: [
        ["Serve as ordered", function () {
          if (chance(.07 + war.risk * .05)) {
            queuePopup(function () {
              notice("Killed in action",
                "You were killed during " + war.name + " at age " + state.age + ".",
                function () { die("wounds received in " + war.name); }, true);
            });
          } else {
            fx({ Health: -rint(6, 20), Happiness: -rint(4, 10) });
            say("I served through " + war.name + " and came home changed.");
            notice("Home from the war", "You survived " + war.name + ".", null, true);
          }
        }, "green"],
        ["Try to get sent home", function () {
          if (chance(.55)) {
            eraFx({ Respect: -6 });
            say("I managed to get sent home from " + war.name + ".");
            notice("Sent home", "You were shipped home, but people noticed.", null, true);
          } else {
            eraFx({ Respect: -8, Happiness: -5 });
            fx({ Health: -rint(5, 15) });
            say("I failed to get out of " + war.name + " and was disciplined.");
            notice("No way out", "Your request was refused and you were put on report.", null, true);
          }
        }, "gray"]
      ]
    });
  }

  function draftCard(war, y) {
    var exemptJob = !!(state.job &&
      /Farmer|Farm Hand|Doctor|Surgeon|Clergyman|Priest|Railway|Blacksmith|Teacher|Professor|Midwife|Printer|Pharmacist|Engineer/i.test(state.job.t || ""));
    var fee = Math.max(60, Math.round((state.money || 0) * .12));
    var choices = [
      ["Report for duty", function () { forceEnlist(war, y); }, "green"]
    ];
    if (exemptJob || (state.stats && state.stats.Health < 40)) {
      choices.push(["Claim an exemption", function () {
        if (chance(.5)) {
          (state.wwDraft || (state.wwDraft = {}))[war.k] = "exempt";
          eraFx({ Respect: -2 });
          say("I was exempted from " + war.name + ".");
          notice("Exempt", "Your claim was accepted. You will not be sent to " + war.where + ".", null, true);
        } else {
          eraFx({ Respect: -3 });
          notice("Claim refused", "The board turned you down. You are being sent anyway.",
            function () { forceEnlist(war, y); }, true);
        }
      }]);
    }
    if ((state.money || 0) > fee) {
      choices.push(["Pay for a substitute (" + usd(fee) + ")", function () {
        state.money = Math.max(0, state.money - fee);
        renderStats();
        eraFx({ Respect: -3 });
        say("I paid " + usd(fee) + " for a substitute to serve in " + war.name + ".");
        notice("A substitute", "Someone else will march in your place.", null, true);
      }]);
    }
    choices.push(["Try to avoid the call-up", function () {
      if (chance(.65)) {
        eraFx({ Respect: -8, Happiness: -3 });
        say("I was caught avoiding the draft and marched off to " + war.name + ".");
        notice("Caught", "The conscription officers found you. There is no refusing now.",
          function () { forceEnlist(war, y); }, true);
      } else {
        eraFx({ Respect: -6, Happiness: -3 });
        say("I kept out of sight during the call-up for " + war.name + ".");
        notice("Out of sight", "You were not found this year, but people talk.", null, true);
      }
    }, "dark"]);
    jCard({
      tag: "Conscription", iconSrc: "mil1800/army-seal.png", title: "Called Up!",
      close: true,
      lead: "In " + y + ", " + war.name + " is grinding through " + war.where +
        ". The conscription officers have your name" +
        (state.age < 18 ? " — boys of sixteen were taken as readily as men" : "") +
        ". You have been ordered to report.",
      rows: [["Conflict", war.name], ["Year", y], ["Theatre", war.where], ["Your age", state.age]],
      choices: choices
    });
  }

  function draftTick(y) {
    if (y < 1800 || y > 1945 || !alive()) return;
    if ("m" !== PG()) return;
    if (state.age < CFG.draftMin || state.age > CFG.draftMax) return;
    if (serving()) return;
    var wd = state.wwDraft || {};
    if (state.draftYear === y) return;
    var wars = warsFor(y, state.country);
    if (!wars.length) return;
    var war = wars[wars.length - 1];
    if (wd[war.k + "y"] === y || wd[war.k] === "served" || wd[war.k] === "exempt") return;
    var mine = state.eraDraft || {};
    if (mine[war.k + "y"] === y) return;
    var p = Math.min(.9, .48 + war.risk * .3);
    if (!chance(p)) return;
    (state.eraDraft || (state.eraDraft = {}))[war.k + "y"] = y;
    /* ww.js checks this same key ~150ms later; claim the year so the game
       does not show a second, near-identical draft card. */
    if (war.k === "ww1" || war.k === "ww2") {
      (state.wwDraft || (state.wwDraft = {}))[war.k + "y"] = y;
    }
    queuePopup(function () { draftCard(war, y); });
  }

  /* ---------------------------------------------------------------- *
   * Yearly hook — registered last so core handlers run first
   * ---------------------------------------------------------------- */
  function onAge() {
    var y = yr();
    try {
      mortalityTick(y);
      feministTick(y);
      historyTick(y);
      draftTick(y);
    } catch (e) { /* never break aging */ }
  }

  function boot() {
    installInventions();
    wrapJCard();
    wrapInventing();
    wrapIdentity();
    wrapBabyCard();
    try {
      var ab = document.getElementById("ageBtn");
      if (ab) ab.addEventListener("click", onAge);
    } catch (e) {}

    window.ERA_REALISM = {
      CFG: CFG,
      HISTORICAL: HISTORICAL,
      NEW_INVENTIONS: NEW_INVENTIONS,
      ERA_WARS: ERA_WARS,
      rates: rates,
      rateFor: rateFor,
      inEra: inEra,
      femWindow: femWindow,
      warsFor: warsFor,
      serving: serving,
      onAge: onAge,
      openHistory: openHistory,
      openFeminist: openFeminist,
      historyTick: historyTick,
      mortalityTick: mortalityTick,
      feministTick: feministTick,
      draftTick: draftTick
    };
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
