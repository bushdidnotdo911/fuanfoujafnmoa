/*
 * parenting.js — "Parenting" / control over your children's early lives
 * =====================================================================
 * Free Life (BitLife-style) add-on. Loaded AFTER the game core, from
 * game.html. Uses the game's own globals (state, say, fx, evWrap, ...).
 *
 * What it adds
 * ------------
 *  - A "Parenting" section in the Activities menu (screenshot 1's row style).
 *  - A per-child hub with six kid portraits (screenshot 2's diverse faces).
 *  - Decisions while the child is a minor:
 *      1. Routine shots          — vaccinate / decline (fictional abstraction)
 *      2. Diet                   — healthy / balanced / treats  -> fitness
 *      3. Sports & tryouts       — 11 activities, talent discovery, enrollment
 *      4. Child acting           — agency, gigs, fame, household income
 *      5. School                 — public / private / let them choose
 *      6. Lighten up / Bond      — repair the relationship
 *  - A global Parenting style: Lenient / Balanced / Strict.
 *  - Strictness economy: strict choices add "Pressure", which erodes the
 *    child's Bond (rel) every year. Lenient choices raise Bond.
 *  - A yearly simulation hooked to the Age button: costs, fitness, smarts,
 *    illness risk, talent progress, acting gigs, and an 18th-birthday recap.
 *
 * Everything lives on `state.family[i].pg` and `state.parenting`, so it is
 * saved automatically with the life (plain JSON, no schema change needed).
 *
 * NOTE ON TONE: the shots / diet decisions are fictional game abstractions
 * for a life simulator, not health advice. The in-game copy says so too.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 0. This file loads AFTER the game core, so every core global below
   *    (state, say, fx, ev, evWrap, sList, CHEV, ...) is already in the
   *    shared global scope. One guard, then use them directly.
   * ------------------------------------------------------------------ */
  if (typeof state === "undefined" || !state) return;   // core not loaded
  if (typeof ev === "undefined" || typeof evWrap === "undefined") return;

  const fmt = (typeof usd === "function")
    ? usd
    : (n) => "$" + Math.round(n).toLocaleString("en-US");
  const CHEV_HTML = (typeof CHEV !== "undefined") ? CHEV : '<div class="chev">›</div>';
  const X_HTML = (typeof X_RED !== "undefined") ? X_RED
    : '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="#e2401f" stroke-width="2.6" stroke-linecap="round"/></svg>';

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ------------------------------------------------------------------ *
   * 1. Content tables
   * ------------------------------------------------------------------ */
  const STYLES = [
    { id: "lenient",  label: "Lenient",  mult: 0.5, desc: "They barely notice the rules — but results come slower." },
    { id: "balanced", label: "Balanced", mult: 1.0, desc: "A middle ground. The default." },
    { id: "strict",   label: "Strict",   mult: 1.6, desc: "Better outcomes on paper, but they'll resent you for it." }
  ];
  const styleOf = () => STYLES.find((s) => s.id === (state.parenting && state.parenting.style)) || STYLES[1];

  const DIETS = [
    { id: "healthy",  label: "Plan healthy meals",            ico: "emoji/1f34e.png",
      desc: "Home-cooked food and a set routine. Fitness climbs steadily, but it can feel like nagging.",
      strict: 2, rel: -2, fit: 6 },
    { id: "balanced", label: "Balanced — let them pick sometimes", ico: "emoji/1f37d-fe0f.png",
      desc: "A middle ground. Fitness holds its own without a fight.",
      strict: 0, rel: 0, fit: 1 },
    { id: "treats",   label: "Let them eat what they want",   ico: "emoji/1f3a9.png",
      desc: "They love you for it. Fitness slowly drifts down over the years.",
      strict: -1, rel: 2, fit: -5 }
  ];
  const dietOf = (id) => DIETS.find((d) => d.id === id) || DIETS[1];

  const SPORTS = [
    { id: "baseball",   label: "Little League Baseball & Softball", ico: "emoji/26be.png" },
    { id: "basketball", label: "Youth Basketball",                  ico: "emoji/1f3c0.png" },
    { id: "soccer",     label: "Youth Soccer",                      ico: "emoji/26bd.png" },
    { id: "gymnastics", label: "Gymnastics",                        ico: "emoji/1f938.png" },
    { id: "ballet",     label: "Ballet",                            ico: "emoji/1f483.png" },
    { id: "dance",      label: "Competitive Youth Dance Team",      ico: "emoji/1f57a.png" },
    { id: "pageantry",  label: "Youth Pageantry",                   ico: "emoji/1f3a9.png" },
    { id: "swimming",   label: "Swim Team",                         ico: "emoji/1f3ca.png" },
    { id: "scouts",     label: "Girl and Boy Scouts",                ico: "emoji/1f3d5-fe0f.png" },
    { id: "music",      label: "Music Lessons",                     ico: "emoji/1f3b5.png" },
    { id: "martial",    label: "Martial Arts",                      ico: "emoji/1f94a.png" }
  ];
  const sportOf = (id) => SPORTS.find((s) => s.id === id) || null;

  const SCHOOLS = [
    { id: "public",  label: "Public school",  ico: "emoji/1f3eb.png",
      desc: "Free. Steady, unhurried progress.", strict: 0, rel: 1, smarts: 1, cost: 0 },
    { id: "private", label: "Private school", ico: "emoji/1f4da.png",
      desc: "Tuition every year, smaller classes, faster academic growth.",
      strict: 1, rel: -1, smarts: 3, cost: 12000 },
    { id: "choice",  label: "Let them choose", ico: "emoji/2764-fe0f.png",
      desc: "No change to enrolment, but they'll remember you trusted them.",
      strict: -1, rel: 3, smarts: 1, cost: 0 }
  ];
  const schoolOf = (id) => SCHOOLS.find((s) => s.id === id) || SCHOOLS[0];

  const SHOTS = [
    { id: "yes", label: "Keep up with routine shots", ico: "emoji/1f489.png",
      desc: "The pediatrician's standard schedule. A little fuss today, fewer sick days later.",
      strict: 1, rel: -1 },
    { id: "no",  label: "Decline for now", ico: "emoji/1f914.png",
      desc: "No fuss today. In this sim it raises the chance of a childhood illness in later years.",
      strict: 0, rel: 1 }
  ];

  const ACTING = [
    { id: "sign", label: "Sign with a child-acting agency", ico: "emoji/1f3ac.png",
      desc: "Headshots, auditions and classes each year. Gigs bring in a little money and fame.",
      strict: 2, rel: -3 },
    { id: "ask",  label: "Only if they want to", ico: "emoji/2764-fe0f.png",
      desc: "Offer it and let them decide. Slower start, no hard feelings.",
      strict: 0, rel: 2 },
    { id: "stop", label: "Stop the acting", ico: "emoji/1f6cb-fe0f.png",
      desc: "Pull them out of the agency.", strict: -1, rel: 3 }
  ];

  /* ------------------------------------------------------------------ *
   * 2. State helpers
   * ------------------------------------------------------------------ */
  const DEFAULTS = {
    v: null,              // shots: null undecided | true | false
    diet: "balanced",
    fitness: 50,          // 0..100 — "grew up active" vs "unhealthy habits"
    sport: null,
    sportTalent: null,    // "natural" | "promising" | "none"
    sportYears: 0,
    triedAt: -1,
    acting: false,
    actingForced: false,
    actingGigs: 0,
    actingFame: 0,
    school: "public",
    strict: 0,            // accumulated pressure
    tickedAt: -1,
    graduated: false,
    notes: []
  };

  function ensureGlobal() {
    if (!state.parenting) state.parenting = { style: "balanced", v: 1 };
    if (!state.parenting.style) state.parenting.style = "balanced";
  }
  function ensure(c) {
    ensureGlobal();
    if (!c.pg) c.pg = Object.assign({}, DEFAULTS);
    else {
      for (const k in DEFAULTS) if (!(k in c.pg)) c.pg[k] = Array.isArray(DEFAULTS[k]) ? [] : DEFAULTS[k];
    }
    return c.pg;
  }
  const allKids = () => (state.family || []).filter((c) => c && c.kind === "child" && !c.dead);
  const minors  = () => allKids().filter((c) => { const a = relAge(c); return a >= 0 && a < 18; });
  const bond    = (c) => Math.round(c.rel == null ? 60 : c.rel);
  const pressure = (c) => Math.min(100, Math.round((ensure(c).strict || 0) * 6));

  function portrait(c) {
    // Deterministic so the same child always shows the same face.
    let h = 0;
    const s = String((c.first || "") + (c.last || "") + (c.g || ""));
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "parenting/kid" + (Math.abs(h) % 6 + 1) + ".png";
  }
  const img = (src, fallback) =>
    `<img src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='${esc(fallback || "emoji/1f476.png")}'">`;

  function setRel(c, delta) {
    const st = styleOf();
    // Strict style amplifies dislikes; lenient softens them. Bond gains are
    // slightly dampened under a strict style too.
    const d = delta < 0 ? delta * st.mult : delta * (st.id === "strict" ? 0.7 : 1);
    c.rel = Math.max(0, Math.min(100, (c.rel == null ? 60 : c.rel) + d));
  }
  function addPressure(c, w) {
    const pg = ensure(c);
    pg.strict = Math.max(0, (pg.strict || 0) + w * styleOf().mult);
  }
  function spend(n) {
    n = Math.max(0, Math.round(n));
    if ((state.money || 0) < n) return false;
    fx({ money: -n });   // the core's fx() handles old-era currency itself
    renderStats();
    return true;
  }
  function earn(n) { fx({ money: Math.max(0, Math.round(n)) }); renderStats(); }
  function note(c, txt) {
    const pg = ensure(c);
    pg.notes.push(txt);
    if (pg.notes.length > 40) pg.notes.shift();
  }

  /* ------------------------------------------------------------------ *
   * 3. Popup plumbing (the game's own `ev` / `evWrap` overlay)
   * ------------------------------------------------------------------ */
  let statusLine = "";

  function card(html) {
    if (!ev || !evWrap) { notice("Parenting", "This screen isn't available right now.", null, true); return; }
    ev.innerHTML =
      `<div class="jm-x" id="pgX" style="left:-14px;top:-14px">${X_HTML}</div>` + html;
    ev.style.overflow = "visible";
    evWrap.classList.add("open");
    const x = document.getElementById("pgX");
    if (x) x.onclick = closeCard;
  }
  function closeCard() {
    if (evWrap) evWrap.classList.remove("open");
    if (ev) ev.style.overflow = "";
    statusLine = "";
  }
  const head = (title, ico, tag, lead) =>
    `<div class="jm-tag" style="margin-top:12px">${esc(tag || "Family")}</div>
     <h4>${img(ico || "parenting/parenting.png")}<span>${esc(title)}</span></h4>
     ${lead ? `<div class="lead">${lead}</div>` : ""}`;
  const status = () => statusLine ? `<div class="lead" style="color:#1a6fd1;font-weight:800">${statusLine}</div>` : "";
  const row = (id, ico, title, sub, right) =>
    `<div class="row sm" data-pg="${esc(id)}">${img(ico)}<div class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></div>${right || CHEV_HTML}</div>`;
  const bars = (items) =>
    `<div class="ev-bars-h">How it's going</div><div class="ev-bars">` +
    items.map(([name, val, col]) =>
      `<b>${esc(name)}</b><i><u style="width:${Math.max(3, Math.min(100, Math.round(val)))}%;background:${col || "#2fa03b"}"></u></i><em>${Math.round(val)}%</em>`
    ).join("") + `</div>`;
  const btn = (id, label, cls) =>
    `<button class="jm-apply ev-btn ${cls || ""}" id="${esc(id)}">${esc(label)}</button>`;

  /* ------------------------------------------------------------------ *
   * 4. Hub — list of children + global parenting style
   * ------------------------------------------------------------------ */
  function openHub() {
    ensureGlobal();
    if (state.dead) { notice("Parenting", "This life is over.", null, true); return; }
    const kids = minors();
    const st = styleOf();
    let html = head("Parenting", "parenting/parenting.png", "Family",
      `Shape your children's early years. Every decision moves their <b>Bond</b> with you and the <b>Pressure</b> they feel. ` +
      `Current style: <b>${esc(st.label)}</b> — ${esc(st.desc)}`);

    html += status();
    html += `<table class="jc"><tbody>
       <tr><td><b>Children under 18:</b> ${kids.length}</td></tr>
       <tr><td><b>Household cash:</b> ${fmt(state.money || 0)}</td></tr>
       <tr><td><b>Parenting style:</b> ${esc(st.label)}</td></tr>
     </tbody></table>`;

    html += `<div class="sec">Your children</div>`;
    if (!kids.length) {
      html += `<div class="lead">No children under 18 yet. Have or adopt a child and they'll show up here.</div>`;
    } else {
      kids.forEach((c, i) => {
        const pg = ensure(c);
        const a = relAge(c);
        html += row("kid:" + i, portrait(c), `${c.first} ${c.last || ""}`,
          `Age ${a} · Bond ${bond(c)}% · ${esc(schoolOf(pg.school).label)}${pg.sport ? " · " + esc(sportOf(pg.sport).label) : ""}`);
      });
    }
    html += `<div class="sec">Settings</div>`;
    html += row("style", "emoji/1f4da.png", "Parenting style",
      `Lenient / Balanced / Strict — currently ${st.label}`);
    html += btn("pgClose", "Close", "hr-green");

    card(html);
    const q = (id) => ev.querySelector(`[data-pg="${id}"]`);
    kids.forEach((c, i) => { const r = q("kid:" + i); if (r) r.onclick = () => { play("choice"); openChild(i); }; });
    const sr = q("style"); if (sr) sr.onclick = () => { play("choice"); openStyle(); };
    const cl = document.getElementById("pgClose"); if (cl) cl.onclick = () => { play("dismiss"); closeCard(); };
  }

  function openStyle() {
    let html = head("Parenting style", "emoji/1f4da.png", "Settings",
      `How hard you push. Strict choices raise Pressure faster and cost more Bond; lenient ones protect the relationship. ` +
      `This multiplies every decision you make from now on.`);
    html += status();
    STYLES.forEach((s) => {
      html += row("style:" + s.id, "emoji/1f4da.png", s.label, s.desc,
        state.parenting.style === s.id ? '<div class="dots"><i></i></div>' : CHEV_HTML);
    });
    html += btn("pgBack", "Back", "hr-green");
    card(html);
    STYLES.forEach((s) => {
      const r = ev.querySelector(`[data-pg="style:${s.id}"]`);
      if (r) r.onclick = () => {
        play("choice");
        state.parenting.style = s.id;
        say(`I decided to be more ${s.label.toLowerCase()} with the kids.`);
        statusLine = `Parenting style set to ${s.label}.`;
        openHub();
      };
    });
    const b = document.getElementById("pgBack"); if (b) b.onclick = () => { play("dismiss"); openHub(); };
  }

  /* ------------------------------------------------------------------ *
   * 5. Per-child card
   * ------------------------------------------------------------------ */
  function openChild(idx) {
    const c = minors()[idx];
    if (!c) { openHub(); return; }
    const pg = ensure(c);
    const a = relAge(c);
    const sp = pg.sport ? sportOf(pg.sport) : null;

    let html = head(`${c.first} ${c.last || ""}, age ${a}`, portrait(c), "Parenting",
      `Every choice here is remembered. <b>Bond</b> is how close they feel to you; <b>Pressure</b> is how much they feel pushed. ` +
      `Free Life is fiction — the health and diet options below are game abstractions, not health advice.`);
    html += status();
    html += bars([
      ["Bond",     bond(c),                 bond(c) >= 60 ? "#2fa03b" : bond(c) >= 30 ? "#f5841f" : "#b3261e"],
      ["Pressure", pressure(c),            pressure(c) >= 60 ? "#b3261e" : "#f5841f"],
      ["Fitness",  Math.round(pg.fitness), pg.fitness >= 60 ? "#2fa03b" : pg.fitness >= 35 ? "#f5841f" : "#b3261e"],
      ["Smarts",   Math.round(c.smarts || 50), "#1a6fd1"]
    ]);

    html += `<div class="sec">Decisions</div>`;
    html += row("shots", "emoji/1f489.png", "Routine shots",
      pg.v === null ? "Not decided yet" : pg.v === true ? "Up to date" : "Declined",
      pg.v === null ? CHEV_HTML : '<div class="dots"><i></i></div>');
    html += row("diet", dietOf(pg.diet).ico, "Diet",
      `${dietOf(pg.diet).label} · fitness ${Math.round(pg.fitness)}%`);
    html += row("sport", sp ? sp.ico : "emoji/1f3c6.png", "Sports & tryouts",
      sp ? `${sp.label} · ${pg.sportTalent === "natural" ? "a natural" : pg.sportTalent === "promising" ? "promising" : "still finding their feet"} · ${pg.sportYears} yr` : "No activity yet");
    html += row("acting", "emoji/1f3ac.png", "Child acting",
      pg.acting ? `Signed · ${pg.actingGigs} gig${pg.actingGigs === 1 ? "" : "s"} · fame ${Math.round(pg.actingFame)}` : "Not signed");
    html += row("school", schoolOf(pg.school).ico, "School", schoolOf(pg.school).label);

    html += `<div class="sec">Relationship</div>`;
    html += btn("pgLighten", "Lighten up (−4 Pressure, +5 Bond)", "hr-green");
    html += btn("pgBond", "Spend the afternoon together (+6 Bond)");
    html += btn("pgBack", "Back to my children", "gy");

    if (pg.notes && pg.notes.length) {
      html += `<div class="sec">Recent moments</div><div class="lead">` +
        pg.notes.slice(-4).map(esc).join("<br>") + `</div>`;
    }

    card(html);
    const on = (id, fn) => { const r = ev.querySelector(`[data-pg="${id}"]`); if (r) r.onclick = () => { play("choice"); fn(); }; };
    on("shots",  () => openChoice(idx, "shots"));
    on("diet",   () => openChoice(idx, "diet"));
    on("sport",  () => openSport(idx));
    on("acting", () => openChoice(idx, "acting"));
    on("school", () => openChoice(idx, "school"));
    const l = document.getElementById("pgLighten");
    if (l) l.onclick = () => {
      play("choice");
      pg.strict = Math.max(0, (pg.strict || 0) - 4);
      setRel(c, 5);
      say(`I eased up on ${c.first}. We both needed the break.`);
      note(c, "You eased up for a while.");
      statusLine = "You eased up. Pressure down, Bond up.";
      openChild(idx);
    };
    const b = document.getElementById("pgBond");
    if (b) b.onclick = () => {
      play("choice");
      setRel(c, 6);
      pg.strict = Math.max(0, (pg.strict || 0) - 2);
      say(`I spent the whole afternoon with ${c.first}. No rules, just fun.`);
      note(c, "A whole afternoon together, just for fun.");
      statusLine = "You spent real time together.";
      openChild(idx);
    };
    const back = document.getElementById("pgBack");
    if (back) back.onclick = () => { play("dismiss"); openHub(); };
  }

  /* ------------------------------------------------------------------ *
   * 6. Generic option chooser
   * ------------------------------------------------------------------ */
  function choiceData(key, c) {
    const pg = ensure(c);
    switch (key) {
      case "shots":
        if (pg.v !== null) return null;
        return { title: "Routine shots", ico: "emoji/1f489.png", tag: "Health",
          lead: `Decide how to handle ${esc(c.first)}'s routine shots. This is a fictional game abstraction, not health advice.`,
          options: SHOTS };
      case "diet":
        return { title: "Diet", ico: "emoji/1f34e.png", tag: "Everyday",
          lead: `What ${esc(c.first)} eats day to day. It shapes their fitness over the years — and how much they feel nagged.`,
          options: DIETS };
      case "school":
        return { title: "School", ico: "emoji/1f3eb.png", tag: "Education",
          lead: `Where ${esc(c.first)} goes to school. Private tuition is charged every year until they turn 18.`,
          options: SCHOOLS };
      case "acting":
        return { title: "Child acting", ico: "emoji/1f3ac.png", tag: "Career",
          lead: `Auditions, headshots and classes. Gigs can bring in a little money and fame for the family.`,
          options: ACTING };
    }
    return null;
  }

  function openChoice(idx, key) {
    const c = minors()[idx]; if (!c) { openHub(); return; }
    const d = choiceData(key, c);
    if (!d) { statusLine = "That decision has already been made."; return openChild(idx); }

    let html = head(d.title, d.ico, d.tag, d.lead);
    html += status();
    html += `<div class="sec">Options</div>`;
    d.options.forEach((o, i) => {
      html += row("opt:" + i, o.ico, o.label, o.desc);
    });
    html += btn("pgBack", "Back", "gy");
    card(html);
    d.options.forEach((o, i) => {
      const r = ev.querySelector(`[data-pg="opt:${i}"]`);
      if (r) r.onclick = () => { play("choice"); applyChoice(idx, key, o); };
    });
    const b = document.getElementById("pgBack"); if (b) b.onclick = () => { play("dismiss"); openChild(idx); };
  }

  function applyChoice(idx, key, o) {
    const c = minors()[idx]; if (!c) { openHub(); return; }
    const pg = ensure(c);
    const S = styleOf();

    addPressure(c, o.strict || 0);
    setRel(c, o.rel || 0);

    let msg = "";
    switch (key) {
      case "shots":
        pg.v = o.id === "yes";
        msg = pg.v
          ? `${c.first} is up to date on routine shots. There was a little fuss, but it's over.`
          : `We decided to decline routine shots for ${c.first} for now. It may mean more sick days later.`;
        say(`I ${pg.v ? "kept up with" : "declined"} ${c.first}'s routine shots.`);
        break;
      case "diet":
        pg.diet = o.id;
        say(`I set ${c.first}'s meals to "${o.label.toLowerCase()}".`);
        msg = `Diet set to ${o.label}.`;
        break;
      case "school":
        if (o.id === "choice") {
          say(`I let ${c.first} have a say in their schooling.`);
          msg = "You let them choose. Bond up.";
        } else {
          pg.school = o.id;
          say(`I enrolled ${c.first} in ${o.id === "private" ? "private" : "public"} school.`);
          msg = `Enrolled in ${o.label}.`;
        }
        break;
      case "acting":
        if (o.id === "stop") {
          pg.acting = false; pg.actingForced = false;
          say(`I pulled ${c.first} out of child acting.`);
          msg = "They're out of the agency.";
        } else {
          pg.acting = true;
          pg.actingForced = o.id === "sign";
          say(`I ${o.id === "sign" ? "signed" : "offered"} ${c.first} ${o.id === "sign" ? "up with a child-acting agency" : "the chance to try child acting"}.`);
          msg = pg.actingForced ? "Signed with an agency (pushed)." : "Signed, on their terms.";
        }
        break;
    }
    note(c, msg);
    statusLine = msg + (S.id === "strict" ? " (Strict style: the Bond cost was higher.)" : "");
    openChild(idx);
  }

  /* ------------------------------------------------------------------ *
   * 7. Sports & tryouts
   * ------------------------------------------------------------------ */
  function openSport(idx) {
    const c = minors()[idx]; if (!c) { openHub(); return; }
    const pg = ensure(c);
    const sp = pg.sport ? sportOf(pg.sport) : null;

    let html = head(`${c.first}'s activities`, sp ? sp.ico : "emoji/1f3c6.png", "Tryouts",
      `Try an activity to discover whether ${esc(c.first)} has a knack for it. One tryout per year; ` +
      `enrolment costs a little each year and builds fitness.`);
    html += status();
    if (sp) {
      html += `<table class="jc"><tbody>
        <tr><td><b>Current:</b> ${esc(sp.label)}</td></tr>
        <tr><td><b>Talent:</b> ${pg.sportTalent === "natural" ? "A natural" : pg.sportTalent === "promising" ? "Promising" : "Still finding their feet"}</td></tr>
        <tr><td><b>Years:</b> ${pg.sportYears}</td></tr>
      </tbody></table>`;
    }
    html += `<div class="sec">Try an activity</div>`;
    SPORTS.forEach((s, i) => { html += row("sp:" + i, s.ico, s.label, pg.sport === s.id ? "Currently enrolled" : "Try out"); });
    if (sp) html += btn("pgQuit", "Quit this activity", "tr");
    html += btn("pgBack", "Back", "gy");
    card(html);
    SPORTS.forEach((s, i) => {
      const r = ev.querySelector(`[data-pg="sp:${i}"]`);
      if (r) r.onclick = () => { play("choice"); tryout(idx, s); };
    });
    const q = document.getElementById("pgQuit");
    if (q) q.onclick = () => {
      play("choice");
      pg.sport = null; pg.sportTalent = null; pg.sportYears = 0;
      say(`${c.first} quit ${sp.label.toLowerCase()}.`);
      note(c, `Quit ${sp.label.toLowerCase()}.`);
      statusLine = "They've quit the activity.";
      openChild(idx);
    };
    const b = document.getElementById("pgBack"); if (b) b.onclick = () => { play("dismiss"); openChild(idx); };
  }

  function tryout(idx, s) {
    const c = minors()[idx]; if (!c) { openHub(); return; }
    const pg = ensure(c);
    if (pg.triedAt === state.age) {
      statusLine = "One tryout a year is enough — come back next birthday.";
      return openSport(idx);
    }
    pg.triedAt = state.age;

    // Talent roll: a little help from the child's smarts and current fitness.
    const roll = Math.random() + ((c.smarts || 50) - 50) / 400 + (pg.fitness - 50) / 400;
    const talent = roll >= 0.78 ? "natural" : roll >= 0.48 ? "promising" : "none";
    pg.sport = s.id;
    pg.sportTalent = talent;
    pg.sportYears = 0;

    const word = talent === "natural" ? "a complete natural" : talent === "promising" ? "really promising" : "still finding their feet";
    say(`${c.first} tried out for ${s.label.toLowerCase()} and was ${word}.`);
    note(c, `Tryout: ${s.label} — ${word}.`);
    addPressure(c, talent === "none" ? 2 : 1);
    setRel(c, talent === "natural" ? 2 : talent === "none" ? -1 : 1);
    statusLine = `${s.label}: ${word.charAt(0).toUpperCase() + word.slice(1)}.`;
    openChild(idx);
  }

  /* ------------------------------------------------------------------ *
   * 8. Yearly simulation — hooked to the Age button
   * ------------------------------------------------------------------ */
  function tick() {
    if (state.dead) return;
    ensureGlobal();
    const lines = [];
    // Include 18-year-olds: they are no longer "minors", but their growth
    // recap still has to fire on that birthday.
    const kids = allKids();

    kids.forEach((c) => {
      const pg = ensure(c);
      if (pg.tickedAt === state.age) return;   // never process one year twice
      pg.tickedAt = state.age;
      const a = relAge(c);
      if (a < 0) return;                       // defensive: not born yet

      /* --- 18th birthday recap --------------------------------------- */
      if (a >= 18) {
        if (pg.graduated === "pending") {
          pg.graduated = true;
          const fitWord = pg.fitness >= 65 ? "active and healthy"
                        : pg.fitness <= 35 ? "a few unhealthy habits" : "an average build";
          const bits = [`${c.first} turned 18 with ${fitWord}.`];
          if (pg.sport && pg.sportTalent === "natural")
            bits.push(`They're a natural at ${sportOf(pg.sport).label.toLowerCase()}.`);
          if (pg.actingGigs) bits.push(`${pg.actingGigs} acting gig${pg.actingGigs === 1 ? "" : "s"} behind them.`);
          bits.push(`Bond with you: ${bond(c)}%.`);
          lines.push(bits.join(" "));
          note(c, bits.join(" "));
        } else if (!pg.graduated) {
          pg.graduated = true;   // adult child from an older save: no retroactive recap
        }
        return;                                // adults generate no more costs
      }
      if (a >= 17) pg.graduated = "pending";  // recap next birthday

      /* --- diet & fitness --- */
      pg.fitness = Math.max(0, Math.min(100, pg.fitness + dietOf(pg.diet).fit));

      /* --- school --- */
      const sch = schoolOf(pg.school);
      if (sch.id === "private") {
        if (!spend(sch.cost)) {
          pg.school = "public";
          lines.push(`We couldn't afford ${c.first}'s private tuition, so they moved to public school.`);
          note(c, "Switched to public school — tuition was too much.");
        }
      }
      c.smarts = Math.max(0, Math.min(100, (c.smarts || 50) + schoolOf(pg.school).smarts));

      /* --- sports --- */
      if (pg.sport) {
        const sp = sportOf(pg.sport);
        if (!sp) pg.sport = null;
        else if (!spend(700)) {
          lines.push(`${c.first} had to quit ${sp.label.toLowerCase()} — we couldn't cover the fees.`);
          note(c, `Quit ${sp.label.toLowerCase()} — fees unaffordable.`);
          pg.sport = null;
        } else {
          pg.sportYears++;
          pg.fitness = Math.min(100, pg.fitness + 3);
          if (pg.sportTalent === "natural" && chance(0.28)) {
            lines.push(`${c.first} won a ${sp.label.toLowerCase()} ribbon this year.`);
            note(c, `Won a ${sp.label.toLowerCase()} ribbon.`);
            setRel(c, 1);
          }
        }
      }

      /* --- child acting --- */
      if (pg.acting) {
        if (!spend(1800)) {
          pg.acting = false;
          lines.push(`We couldn't keep up ${c.first}'s acting classes, so the agency let them go.`);
          note(c, "Left the agency — classes unaffordable.");
        } else if (chance(0.38)) {
          pg.actingGigs++;
          pg.actingFame = Math.min(100, pg.actingFame + rint(3, 10));
          const income = rint(300, 2000);
          earn(income);
          lines.push(`${c.first} booked an acting gig and brought home ${fmt(income)}.`);
          note(c, `Booked a gig (+${fmt(income)}).`);
          if (pg.actingFame >= 40 && !pg.fameNoted) {
            pg.fameNoted = true;
            lines.push(`People are starting to recognize ${c.first} in public.`);
          }
        } else if (pg.actingForced && chance(0.5)) {
          setRel(c, -1);
        }
      }

      /* --- routine shots: fictional illness abstraction --- */
      if (pg.v === false && a >= 1 && chance(0.18)) {
        const bill = rint(200, 1200);
        if ((state.money || 0) >= bill) spend(bill);
        pg.fitness = Math.max(0, pg.fitness - 4);
        setRel(c, -1);
        lines.push(`${c.first} had a rough bout of childhood illness this year.`);
        note(c, "A rough childhood illness this year.");
      }

      /* --- strictness erodes the bond --- */
      const erosion = Math.round((pg.strict || 0) / 6);
      if (erosion > 0) {
        c.rel = Math.max(0, (c.rel == null ? 60 : c.rel) - erosion);
        if (erosion >= 3 && chance(0.4)) {
          lines.push(`${c.first} says I'm too hard on them.`);
          note(c, "Told you that you're too hard on them.");
        }
      }
      pg.strict = Math.max(0, (pg.strict || 0) - 1);   // pressure slowly fades
    });

    // Keep the life log readable: at most two lines per year.
    lines.slice(0, 2).forEach(say);
    renderStats();
  }

  /* ------------------------------------------------------------------ *
   * 9. Wire-up
   * ------------------------------------------------------------------ */
  const P = {
    openHub, openChild, tick, onActivities,
    // exposed for tests
    _ensure: ensure, _minors: minors, _styleOf: styleOf,
    _setRel: setRel, _addPressure: addPressure, _DEFAULTS: DEFAULTS
  };
  window.PARENTING = P;
  ensureGlobal();

  // Activities row is injected by the patched openActivities() in game.html.
  function onActivities() {
    try {
      if (!sList) return;
      const n = minors().length;
      sList.insertAdjacentHTML("afterbegin",
        `<div class="sec">Family</div>` +
        row("parenting", "parenting/parenting.png", "Parenting",
          n ? `${n} child${n === 1 ? "" : "ren"} under 18 · guide their early years`
            : "Guide your children's early years"));
      const r = sList.querySelector('[data-pg="parenting"]');
      if (r) r.onclick = () => { play("choice"); openHub(); };
    } catch (err) {
      if (window.console && console.warn) console.warn("Parenting row failed", err);
    }
  }

  // Yearly tick. Registered after the core's own age listeners, so the new
  // year's log header already exists when we call say().
  const ageBtn = document.getElementById("ageBtn");
  if (ageBtn) ageBtn.addEventListener("click", () => {
    try { tick(); }
    catch (err) { if (window.console && console.warn) console.warn("Parenting tick failed", err); }
  });
})();
