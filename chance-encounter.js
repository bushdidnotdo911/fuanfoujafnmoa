/*
 * chance-encounter.js — a 5% yearly chance of meeting someone memorable.
 *
 * Free Life is played from birth, so every encounter here is explicitly
 * adult: the player must be 18+, and the person you meet is a young man in
 * his twenties. The writing stays flirtatious and romantic — charm, style,
 * voice, presence — and any intimacy fades to black rather than being
 * described. No graphic content.
 *
 * State lives on state.encounters, which lifeCopy() deep-copies, so saves
 * and Switch Lives carry it automatically. Legacy saves are backfilled.
 * Loaded last, after the base game script. Exposes window.CHANCE_ENCOUNTER.
 */
(function () {
  if (window.CHANCE_ENCOUNTER) return;

  var CFG = { chance: .05, minAge: 18, followUp: .12, maxRecords: 40 };

  /* ------------------------------------------------------------------ *
   * Small safe wrappers around game globals
   * ------------------------------------------------------------------ */
  function yr() { try { return (state.birthYear || 1990) + (state.age || 0); } catch (e) { return 1990; } }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function chance(p) { return Math.random() < p; }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function ICO(n) { return "era/" + n + ".png"; }
  function playSfx() { try { play("choice"); } catch (e) {} }
  function say(t) { try { window.say(t); } catch (e) {} }
  function note(t, b, html) { try { notice(t, b, null, true, html || ""); } catch (e) {} }
  function queue(fn) { try { queuePopup(fn); } catch (e) { setTimeout(fn, 320); } }
  function card(cfg) { try { jCard(cfg); } catch (e) {} }
  function logIt(t) { try { say(t); } catch (e) {} }

  function S() {
    var s;
    try { s = state.encounters || (state.encounters = { list: [], lastYear: -1 }); }
    catch (e) { return { list: [], lastYear: -1 }; }
    try {
      if (!Array.isArray(s.list)) s.list = [];
      if (typeof s.lastYear !== "number") s.lastYear = -1;
    } catch (e) {}
    return s;
  }

  function bump(o) {
    try {
      if (!state.stats) return;
      Object.keys(o || {}).forEach(function (k) {
        if (typeof state.stats[k] === "number") state.stats[k] = clamp(state.stats[k] + o[k]);
      });
      renderStats();
    } catch (e) {}
  }

  function makeLook(age) {
    try {
      if (typeof randomLook === "function") return randomLook("m", age);
    } catch (e) {}
    var P = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    return { skin: P(["#f6d3b3", "#eebd94", "#d9a274", "#b97c50", "#8a5a3a", "#5e3d27"]),
      eyes: P(["#6b4226", "#4a2c17", "#3f7fbf", "#4f8a4b", "#8a6a3a", "#5b6b7a"]),
      hair: P(["#2a201b", "#5b3a22", "#8a5a2c", "#d8b26a", "#a8471f"]),
      seed: Math.floor(Math.random() * 1000), beard: 0 };
  }

  function makePerson() {
    var first = "Ellis", last = "Vane", g = "m", age = ri(22, 29);
    try { first = uname("m"); } catch (e) {}
    try { last = ulast(); } catch (e) {}
    return { first: first, last: last, g: g, age: age, look: makeLook(age),
      name: first + " " + last };
  }

  function addAsFriend(p, rel) {
    try {
      if (typeof addFriend === "function" && state.friends)
        addFriend({ first: p.first, last: p.last, g: p.g, look: p.look, age: p.age }, rel);
    } catch (e) {}
  }

  function record(s, p, place, kind) {
    var r = { y: yr(), name: p.name, first: p.first, last: p.last,
      g: p.g, age: p.age, place: place, kind: kind, notes: [] };
    s.list.push(r);
    if (s.list.length > CFG.maxRecords) s.list = s.list.slice(-CFG.maxRecords);
    return r;
  }

  /* ------------------------------------------------------------------ *
   * Encounter writing — charm, style, presence. Era-neutral, no modern
   * slang, no anatomy, nothing graphic.
   * ------------------------------------------------------------------ */
  var PLACES = [
    { id: "bookshop", where: "A bookshop on the corner", style: "Soft-spoken, immaculate",
      lead: "You both reach for the same volume on the high shelf. His hair falls past his jaw, a touch of kohl at the eyes and a loose silk shirt tucked into high-waisted trousers. A thin silver ring catches the light as he laughs at the coincidence — and he does not move his hand away." },
    { id: "cafe", where: "A café in the rain", style: "Warm, unhurried, amused",
      lead: "The only free chair is opposite him. He is wrapped in an oversized cardigan, chipped black polish on the nails wrapped around a cup, a little gloss on his mouth. <i>\"Stay,\"</i> he says, as though you had already agreed. His smile arrives before the rest of the sentence." },
    { id: "musichall", where: "A music hall, between pieces", style: "Luminous, entirely at ease",
      lead: "The orchestra is tuning up when he leans across the row to ask whether the seat is taken. He wears a velvet waistcoat and an armful of thin bangles, dark hair swept soft across his forehead. When the lights go down he keeps glancing your way instead of at the stage." },
    { id: "gallery", where: "A small gallery, late afternoon", style: "Considered, dry, quick",
      lead: "He is standing far too close to a painting and clearly does not care. Delicate build, a long coat, a single earring, lipstick just slightly smudged from smiling. He asks what you make of it, then disagrees with you — beautifully, and with enormous charm." },
    { id: "riverwalk", where: "The river walk at dusk", style: "Quiet, direct, disarming",
      lead: "He is sitting on the low wall watching the water, in a soft skirt over heavy boots, a ribbon tied at the throat. He makes room without looking up. When he finally turns, the whole conversation seems to have been waiting for that one glance." },
    { id: "market", where: "The covered market", style: "Bright, teasing, impossible to rush",
      lead: "He is bargaining cheerfully over a bunch of flowers and winning. Painted nails, a cropped jacket, hair pinned loosely off his face. He catches you watching, holds out one of the flowers and says, quite solemnly, that you looked like you needed it more than he did." },
    { id: "theatre", where: "A theatre queue", style: "Composed, with a wicked sense of humour",
      lead: "The queue has stopped moving and he has made an art of leaning against the wall. Tailored coat, a trace of colour at the eyes, a voice that carries just far enough. He offers you half of his programme and a running commentary on everyone in front of you." },
    { id: "library", where: "The reading room", style: "Still, attentive, gently mischievous",
      lead: "A note appears on your table in small, precise handwriting: <i>\"You have been on the same page for twenty minutes.\"</i> He is across the room, calm and lovely in a high collar, a faint smile he makes no attempt to hide." },
    { id: "bakery", where: "A bakery before opening", style: "Sleepy, sweet, unexpectedly bold",
      lead: "He is behind the counter with flour on one cheek, an apron over a soft blouse, a little liner at the eyes. The shop is not open yet. He lets you in anyway, pours two cups, and says the first batch is always best shared." },
    { id: "station", where: "A railway platform", style: "Restless, stylish, gone too soon",
      lead: "His train is delayed and he is delighted about it. Long coat, a silk scarf, dark lashes and a smile that keeps arriving without warning. He talks to you as if you have known each other for years, and asks, eventually, whether you are going anywhere worth staying for." },
    { id: "balcony", where: "A neighbour's balcony", style: "Cool, wry, very sure of himself",
      lead: "Music drifts over from the balcony next door. He is leaning on the rail with a glass in one hand, a soft sweater slipping off one shoulder, eyes outlined just enough to be noticed. <i>\"Too loud?\"</i> he asks — hopefully, not apologetically." },
    { id: "harbour", where: "The harbour at low tide", style: "Open, funny, impossible to forget",
      lead: "He is sketching the boats badly and not minding at all. Wind-tousled hair, a bright scarf, rings on nearly every finger. He shows you the drawing, laughs at it before you can, and then asks your name as though it is the only thing he actually came for." }
  ];

  /* Each card opens by making the person unmistakably an adult, and by
     naming the deliberate femininity of how he presents himself. */
  var FRAMING = [
    "He is a young man of <b>{age}</b>, dressed with a deliberate softness that suits him completely.",
    "The young man is <b>{age}</b>, feminine in his styling and entirely at ease about it.",
    "He is <b>{age}</b> — a young man who wears his softness like it was never a question.",
    "A young man of <b>{age}</b>, pretty in a way he clearly knows about and never apologises for.",
    "He is <b>{age}</b>, a young man with a gentle, deliberate look and the confidence to carry it.",
    "The person across from you is <b>{age}</b>, a young man who has chosen exactly how he wants to be seen."
  ];
  var SPARKS = [
    "You find yourself looking a moment longer than you meant to.",
    "There is an ease to him that makes the whole afternoon slow down.",
    "You are, quite suddenly and without any good reason, very glad you stopped.",
    "He has the kind of presence that makes a crowded room go a little quiet.",
    "Something about the way he holds your eye makes you forget what you came in for."
  ];

  var FOLLOWUPS = [
    { id: "second", title: "A Second Evening", icon: "hearts",
      lead: "{name} is waiting where you last met, with the same unhurried smile and two tickets to something neither of you has heard of. <i>\"I took a chance you'd come back,\"</i> he says.",
      choices: [
        { t: "Go with him", color: "green", fx: { Happiness: 9 }, note: "The evening runs late and easily. You walk home slowly, neither of you in much of a hurry to say goodnight." },
        { t: "Say you can't tonight", fx: { Happiness: -2 }, note: "He nods, unsurprised, and tells you the offer stands." } ] },
    { id: "note", title: "A Note Under the Door", icon: "news",
      lead: "A folded note has been pushed under your door in that same small, precise hand. <i>\"The bookshop, Thursday. No coincidence this time.\"</i> It is signed {name}, with a tiny drawn flower in the corner.",
      choices: [
        { t: "Go on Thursday", color: "green", fx: { Happiness: 8 }, note: "He is already there, and he has saved the chair opposite him." },
        { t: "Keep the note, stay home", fx: { Happiness: 2 }, note: "You tuck it into a book. It stays there for years." } ] },
    { id: "moved", title: "He's Moved Away", icon: "airplane",
      lead: "Someone mentions, in passing, that {name} has taken a room in another town. There is no forwarding address and no great drama to it — just the small, specific ache of a door that no longer opens.",
      choices: [
        { t: "Write a letter", color: "green", fx: { Happiness: 4 }, note: "You write it, and post it, and never quite expect an answer." },
        { t: "Let it go", fx: { Happiness: -2 }, note: "Some people are a season. You let the season be what it was." } ] },
    { id: "invite", title: "An Invitation", icon: "phonograph",
      lead: "{name} has sent word: a small supper, a handful of friends, a piano that is badly out of tune. <i>\"Come as you are,\"</i> the note says, which is exactly how he has always preferred you.",
      choices: [
        { t: "Go", color: "green", fx: { Happiness: 10, Health: 1 }, note: "The piano is worse than advertised. The company is considerably better." },
        { t: "Send a graceful refusal", fx: { Happiness: -1 }, note: "He sends back a single line: <i>\"Next time, then.\"</i>" } ] },
    { id: "familiar", title: "A Familiar Face", icon: "gender",
      lead: "Across a crowded room, {name} catches your eye and lifts a glass in a small, private salute. Nothing needs to be said. The recognition itself is the whole conversation.",
      choices: [
        { t: "Cross the room", color: "green", fx: { Happiness: 7 }, note: "You talk until the room thins out, about nothing in particular." },
        { t: "Salute back and stay put", fx: { Happiness: 3 }, note: "He smiles, and lets you keep your evening." } ] },
    { id: "argument", title: "A Small Misunderstanding", icon: "news",
      lead: "A careless word has landed badly. {name} is polite about it, which is somehow worse than being angry. There is a pause long enough for you to decide what kind of person you want to be here.",
      choices: [
        { t: "Apologise properly", color: "green", fx: { Happiness: 6 }, note: "He accepts it without making you pay for it twice. That, more than anything, is why you're glad you stayed." },
        { t: "Let it stand", fx: { Happiness: -5 }, note: "The conversation recovers, but something small has gone out of it." } ] }
  ];

  /* ------------------------------------------------------------------ *
   * Screens
   * ------------------------------------------------------------------ */
  function css() {
    if (document.getElementById("ceCss")) return;
    var st = document.createElement("style"); st.id = "ceCss";
    st.textContent = [
      ".ce-card{background:#1a2337;border:1px solid #2b3852;border-radius:10px;padding:12px 13px;margin:0 0 12px}",
      ".ce-title{color:#f0a6c8;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;margin:0 0 9px}",
      ".ce-note{color:#93a6c4;font-size:12px;line-height:1.55}",
      ".ce-hist{border-left:2px solid #2b3852;padding-left:10px;margin:8px 0;color:#c6d5ea;font-size:12px;line-height:1.55}",
      ".ce-chip{display:inline-block;background:#243250;color:#a9c6ea;border-radius:20px;padding:3px 10px;font-size:11px;margin:2px 4px 2px 0}"
    ].join("\n");
    document.head.appendChild(st);
  }
  function kv(k, v) { return '<div><div style="color:#8397b5;font-size:11px">' + E(k) + '</div>' +
    '<div style="color:#eaf2ff;font-size:14px;font-weight:700">' + E(v) + '</div></div>'; }
  function scr(title, html, back) {
    try {
      sTitle.textContent = title;
      try { sSub.style.display = "none"; } catch (e) {}
      sBack.innerHTML = (typeof BACK_ICON !== "undefined" ? BACK_ICON : "&#8592;");
      sBack.onclick = back || function () { try { screen.classList.remove("open"); } catch (e) {} };
      sList.innerHTML = html;
      sList.scrollTop = 0;
      screen.classList.add("open");
    } catch (e) {}
  }
  var KIND = { hello: "A conversation", date: "A first date", evening: "An evening together", pass: "A moment let go" };
  function openArchive() {
    css();
    var s = S(), h = '<div class="ce-card"><div class="ce-title">Chance Encounters</div>' +
      '<div class="ce-note">A small record of the people you stopped for. These are the moments that never made it into the newspaper.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;margin-top:9px">' +
      kv("People met", s.list.length) + kv("This year", yr()) + '</div></div>';
    if (!s.list.length) h += '<div class="ce-card"><div class="ce-note">No encounters yet. Keep living; the world is full of people.</div></div>';
    s.list.slice().reverse().forEach(function (r) {
      h += '<div class="ce-card"><div class="ce-ce-title ce-title">' + E(r.name) + ' · ' + r.y + '</div>' +
        '<div class="ce-hist"><b>' + E(KIND[r.kind] || "An encounter") + '</b> · ' + E(r.place || "somewhere in the city") +
        ' · he was ' + E(r.age) + '.<br>' + (r.notes || []).slice(-2).map(E).join("<br>") + '</div>' +
        '<span class="ce-chip">' + E(r.place || "A chance meeting") + '</span></div>';
    });
    h += '<div class="ce-card"><div class="ce-note">Encounters arrive on their own, roughly once in twenty years of living. Everyone here is an adult.</div></div>';
    scr("CHANCE ENCOUNTERS", h, function () {
      try { if (typeof openRelationships === "function") openRelationships(); else screen.classList.remove("open"); }
      catch (e) { try { screen.classList.remove("open"); } catch (x) {} }
    });
  }

  /* ------------------------------------------------------------------ *
   * The card
   * ------------------------------------------------------------------ */
  function encounter() {
    var s = S(), p = makePerson(), pl = pick(PLACES);
    var lead = pick(FRAMING).replace(/\{age\}/g, String(p.age)) + " " + pl.lead +
      "<br><br>" + pick(SPARKS);
    var warm = chance(.28);
    if (warm) lead += "<br><br>He has somewhere to be before long, which somehow makes the few minutes you have feel more deliberate.";
    var s0 = state.stats || {};
    var rows = [["Where", pl.where], ["He is", p.age + " · a young man · " + pl.style],
      ["Your age", state.age], ["Year", yr()]];

    card({
      tag: "Chance Encounter", iconSrc: ICO("hearts"), title: "Someone in the Crowd",
      close: true, lead: lead, rows: rows,
      choices: [
        ["Say hello", function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (e) {}
          addAsFriend(p, ri(52, 68));
          bump({ Happiness: 5 });
          var r = record(s, p, pl.where, "hello");
          r.notes.push("We talked, and I learned his name: " + p.name + ".");
          logIt("I met " + p.name + " at " + pl.where.toLowerCase() + ".");
          note("A New Acquaintance", "You talk until the light changes. He tells you his name — " + p.name + " — and says he is usually here around this hour.",
            '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("hearts") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
        }, "green"],
        ["Ask him to coffee", function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (e) {}
          var declined = (s0.Looks != null && s0.Looks < 30 && chance(.35));
          if (declined) {
            addAsFriend(p, ri(45, 58));
            bump({ Happiness: 2 });
            var r0 = record(s, p, pl.where, "hello");
            r0.notes.push("He was kind about it, but he already had plans.");
            note("A Kind Decline", "He smiles, genuinely, and says he is expected elsewhere. He does write his name on the corner of your bill before he goes: " + p.name + ".");
          } else {
            addAsFriend(p, ri(66, 82));
            bump({ Happiness: 8 });
            var r1 = record(s, p, pl.where, "date");
            r1.notes.push("Coffee turned into a long afternoon. " + p.name + " talks with his whole face.");
            logIt("I took " + p.name + " for coffee.");
            note("A Long Afternoon", "The coffee goes cold twice. He walks you as far as the corner, then waits until you have turned before he goes the other way.",
              '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("hearts") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
          }
        }],
        ["Spend the evening together", function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (e) {}
          /* Fade to black: the attraction and the choice are explicit;
             the intimacy is not described. */
          var declined = (s0.Looks != null && s0.Looks < 30 && chance(.4));
          if (declined) {
            addAsFriend(p, ri(50, 62));
            bump({ Happiness: 3 });
            var r2 = record(s, p, pl.where, "hello");
            r2.notes.push("We parted at the door. He was lovely about it.");
            note("At the Door", "He takes your hand, thanks you for the evening, and tells you — without a trace of unkindness — that he is heading home alone. You walk back under a sky that has gone very clear.");
          } else {
            addAsFriend(p, ri(80, 94));
            bump({ Happiness: 12 });
            var r3 = record(s, p, pl.where, "evening");
            r3.notes.push("The rest of the night belonged to the two of us.");
            logIt("I spent the evening with " + p.name + ".");
            if (state.art && state.art.fameOn && chance(.3)) {
              try { state.respect = clamp((state.respect == null ? 40 : state.respect) - 2); } catch (e) {}
              note("A Quiet Evening", "The door closes, the lamplight stays on, and the city outside goes quiet. By morning someone has recognised you on the stairs, and there is a line about it in the paper.",
                '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("hearts") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
            } else {
              note("A Quiet Evening", "The door closes, the lamplight stays on, and the city outside goes quiet. In the morning he makes coffee in a cup that is not his, and neither of you mentions that.",
                '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO("hearts") + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
            }
          }
        }, "green"],
        ["Walk on", function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (e) {}
          bump({ Happiness: -1 });
          var r4 = record(s, p, pl.where, "pass");
          r4.notes.push("I let the moment pass. He did not look back either.");
          logIt("I nearly spoke to someone at " + pl.where.toLowerCase() + ", and didn't.");
        }]
      ]
    });
  }

  function followUp() {
    var s = S();
    if (!s.list.length) return;
    var recent = s.list.filter(function (r) { return r.kind === "date" || r.kind === "evening"; });
    if (!recent.length) return;
    var r = pick(recent), f = pick(FOLLOWUPS);
    var p = { name: r.name, first: r.first, last: r.last, age: r.age };
    var lead = f.lead.replace(/\{name\}/g, E(p.name));
    card({
      tag: "Chance Encounter", iconSrc: ICO(f.icon), title: f.title, close: true,
      lead: lead, rows: [["Who", p.name], ["Met", r.place || "somewhere in the city"], ["Year", yr()]],
      choices: f.choices.map(function (c) {
        return [c.t, function () {
          playSfx();
          try { evWrap.classList.remove("open"); } catch (e) {}
          bump(c.fx || {});
          r.notes.push(c.note.replace(/<[^>]+>/g, ""));
          r.y2 = yr();
          if (c.note) note(f.title, c.note,
            '<div style="text-align:center;margin:8px 0 2px"><img src="' + ICO(f.icon) + '" alt="" style="width:52px;height:52px;object-fit:contain"></div>');
        }, c.color || null];
      })
    });
  }

  /* ------------------------------------------------------------------ *
   * Yearly roll — 5%, once per year, adults only
   * ------------------------------------------------------------------ */
  function onAge() {
    var s = S();
    try {
      if (state.dead || state.prison) return;
      if ((state.age || 0) < CFG.minAge) return;
      var y = yr();
      if (s.lastYear === y) return;
      s.lastYear = y;
      if (chance(CFG.chance)) { queue(function () { encounter(); }); return; }
      if (s.list.length && chance(CFG.followUp)) queue(function () { followUp(); });
    } catch (e) { /* never break aging */ }
  }

  function hookRelationships() {
    try {
      var orig = window.openRelationships;
      if (!orig) return;
      window.openRelationships = function () {
        var r = orig.apply(this, arguments);
        try {
          var s = S();
          if (!s.list.length || sList.querySelector('[data-ce="open"]')) return r;
          sList.insertAdjacentHTML("beforeend",
            '<div class="sec">Chance Encounters</div>' +
            '<div class="row" data-ce="open"><img src="' + ICO("hearts") + '" alt="">' +
            '<div class="t"><b>People You\'ve Met</b><span>' + s.list.length +
            ' encounters · a small private record</span></div></div>');
          var el = sList.querySelector('[data-ce="open"]');
          if (el) el.onclick = function () { playSfx(); openArchive(); };
        } catch (e) {}
        return r;
      };
    } catch (e) {}
  }

  function boot() {
    css();
    try {
      var ab = document.getElementById("ageBtn");
      if (ab) ab.addEventListener("click", function () { try { onAge(); } catch (e) {} });
    } catch (e) {}
    hookRelationships();
    window.CHANCE_ENCOUNTER = {
      CFG: CFG, PLACES: PLACES, FRAMING: FRAMING, SPARKS: SPARKS, FOLLOWUPS: FOLLOWUPS, S: S,
      onAge: onAge, encounter: encounter, followUp: followUp,
      openArchive: openArchive, makePerson: makePerson, record: record,
      bump: bump, ICO: ICO
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
