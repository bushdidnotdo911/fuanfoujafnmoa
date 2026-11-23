/*
 * heir-switch-fix.js — Free Life ("Switch Lives" bug fix)
 * =======================================================
 *
 * Symptoms this fixes (all of them happen when you switch to an existing
 * relative, most visibly when switching to one of your children):
 *
 *   1. Cousins / nieces & nephews (and most extended family) vanish. The
 *      loader deletes grandparent/auntuncle/cousin/cousinkid/sibling entries
 *      and only restores grandparents + aunts/uncles, so cousins and nieces
 *      are simply gone. Expected generation shift when switching DOWN one
 *      generation:  cousins -> aunts/uncles,  nephews/nieces -> cousins.
 *   2. Immediate family members get brand new random jobs.
 *   3. Relatives' appearances change (beards, tattoos, hair, gene-driven
 *      features are dropped or replaced by randomLook()).
 *   4. The bloodline's genes are re-rolled randomly for the new character.
 *   5. The new character and random relatives sometimes become famous.
 *
 * Why it happened
 * ----------------
 * The game first generates a complete RANDOM newborn state (random family,
 * random genes, random looks, random celebrity rolls). It then applies
 * PICK.heir on top, but only PARTIALLY overwrites that random state. Anything
 * not explicitly overwritten stays random, and the family filter deletes
 * relatives it never puts back.
 *
 * How this module fixes it
 * ------------------------
 * Loaded BEFORE the main game script. Exposes window.HEIR_FIX with two hooks
 * that are wired into game.html:
 *
 *   HEIR_FIX.decorate(w, ctx)  — called inside switchToPerson(), right before
 *       the "bitlifepp-pick" object is written to localStorage. It captures a
 *       full-fidelity snapshot of the CURRENT life: the whole extended family
 *       with a one-generation kind shift, every relative's real job (prof),
 *       full appearance (look), celebrity status, and the bloodline genes.
 *
 *   HEIR_FIX.repair(state, ke, ctx) — called inside the PICK.heir loader after
 *       the game has built the new life. It restores all of the above over the
 *       random newborn state and marks the life so the game's random
 *       celebrity / family-fame rolls are skipped.
 *
 * No minified game logic is rewritten: the game's own heir structures
 * (parents / sibs / grand / aunts / kids / spouse / royal / inheritance) are
 * left intact and only enriched.
 */
(function () {
  "use strict";

  function clone(v) {
    return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }
  function fullLook(p) {
    return p && p.look ? clone(p.look) : null;
  }
  function profOf(p) {
    if (!p) return null;
    if (p.prof) return clone(p.prof);
    if (p.job) return { job: typeof p.job === "string" ? p.job : (p.job.t || "") };
    return null;
  }
  function celebOf(p) {
    return p && p.celeb ? clone(p.celeb) : null;
  }

  /*
   * Generation shift, by the relation of the person you switch to.
   *
   * Switching to a CHILD moves everything down one generation:
   *   sibling       -> aunt/uncle   (your brother is their uncle)
   *   cousin        -> aunt/uncle   (colloquial: a parent's cousin)
   *   nibling       -> cousin       (your nephew is their cousin)
   *   cousinkid     -> cousin       (kept, folded into the cousin tier)
   *   grandparent / auntuncle / step* / half*  -> kept as-is (no erasure)
   *
   * The two mappings the bug report names are "cousin -> auntuncle" and
   * "nibling -> cousin". Everything else is preserved rather than deleted.
   */
  var SHIFT = {
    child:   { sibling: "auntuncle", cousin: "auntuncle", nibling: "cousin", cousinkid: "cousin" },
    sibling: { child: "nibling" },
    parent:  {},
    partner: {}
  };

  /* Relatives already represented by the game's own heir fields. Excluding
     them here avoids duplicates (e.g. siblings already become aunts/uncles). */
  var SKIP = {
    child:   ["child", "sibling"],                  // -> h.sibs / h.aunts
    sibling: ["sibling"],                          // -> h.sibs
    parent:  ["child", "sibling", "grandparent"],  // -> h.kids / h.parents
    partner: ["child"]                             // -> h.kids
  };

  /* ---------------- hook 1: capture the outgoing life ---------------- */
  function decorate(w, ctx) {
    var state = ctx.state, e = ctx.e, t = ctx.t, n = ctx.n, o = ctx.o,
        SURNAME = ctx.SURNAME, relAge = ctx.relAge;
    var h = w.heir || (w.heir = {});

    // Everyone who could be carried over, for look / job / celebrity lookups.
    var people = [state]
      .concat(state.parents || [], state.family || [], state.lovers || [], state.exes || [])
      .concat(state.spouse ? [state.spouse] : []);
    function find(first, last) {
      return people.find(function (x) {
        return x && x.first === first && (x.last || SURNAME) === (last || SURNAME);
      });
    }
    function enrich(arr) {
      (arr || []).forEach(function (v) {
        if (!v) return;
        var s = find(v.first, v.last);
        if (!s) return;
        var L = fullLook(s); if (L) v.look = L;   // full look, not the 7-field subset
        var P = profOf(s);   if (P) v.prof = P;   // real job instead of jobFor()
        var C = celebOf(s);  if (C) v.celeb = C;
      });
    }
    enrich(h.parents);
    enrich(h.sibs);
    enrich(h.grand);
    enrich(h.aunts);
    enrich(h.kids);
    if (h.spouse) enrich([h.spouse]);

    // The old player becomes a parent: keep their real career.
    if (h.parents && h.parents[0] && !h.parents[0].prof) {
      var past = h.parents[0].past || {};
      h.parents[0].prof = {
        job: (state.job && state.job.t) || past.job ||
             (state.age >= 65 ? "Retired" : state.age >= 18 ? "Unemployed" : "Student"),
        money: past.worth || 0
      };
    }

    // Full appearance of the person being switched to. The newborn loader
    // strips beard/tattoos into lookLater; repair() restores them from this.
    h.look = fullLook(e) || (w.look ? clone(w.look) : null);
    if (h.look) w.look = clone(h.look);

    // Bloodline genes + gene conditions instead of a fresh random roll.
    h.genes = (state.genes || []).slice();
    var ids = h.genes.slice();
    h.geneConds = (state.conds || []).filter(function (c) {
      return c && ids.indexOf(c.id) >= 0;
    }).map(function (c) {
      return {
        id: c.id,
        odds: c.odds == null ? null : c.odds,
        par: [{ role: state.gender === "f" ? "Mother" : "Father" }]
      };
    });

    // Whole extended family, generation-shifted, with full fidelity.
    var shift = SHIFT[n] || {}, skip = SKIP[n] || [];
    h.ext = (state.family || []).filter(function (x) {
      return x !== e && skip.indexOf(x.kind) < 0;
    }).map(function (x) {
      var rec = {
        kind:  shift[x.kind] || x.kind,
        g:     x.g || x.gender,
        first: x.first,
        last:  x.last || SURNAME,
        age:   relAge(x),
        look:  fullLook(x),
        rel:   x.rel == null ? 60 : x.rel,
        prof:  profOf(x),
        celeb: celebOf(x)
      };
      if (x.dead) {
        rec.dead = true;
        rec.diedAgo = Math.max(0, o - (x.diedAt == null ? o : x.diedAt));
      }
      return rec;
    });

    h.heirFix = 2;   // marker: this heir snapshot carries the full data
    return w;
  }

  /* ---------------- hook 2: restore the incoming life ---------------- */
  function repair(state, ke, ctx) {
    if (!state || !ke || !ke.heirFix) return;
    var SURNAME     = ctx.SURNAME,
        randomLook  = ctx.randomLook,
        geneLook    = ctx.geneLook,
        renderStats = ctx.renderStats,
        renderAvatar= ctx.renderAvatar;

    // Marks read by the game's fame guards (see game.html). These stop
    // ftRollCelebs() / ftApplyFloor() from randomly granting fame on a switch.
    state.heirLife       = true;
    state.celebRolled    = true;
    state.genesBloodline = true;

    function sameName(a, b) {
      return a && b && a.first === b.first &&
             (a.last || SURNAME) === (b.last || SURNAME);
    }

    // 1. Parents: full look, real job, real celebrity status.
    (ke.parents || []).forEach(function (p, i) {
      var dst = (state.parents || [])[i];
      if (!dst) return;
      if (p.look)  dst.look  = clone(p.look);
      if (p.prof)  dst.prof  = clone(p.prof);
      if (p.celeb) dst.celeb = clone(p.celeb);
    });

    // 2a. Fix look / job / celebrity on the relatives the game DID build,
    //     without discarding flags it attached afterwards (royal, smarts...).
    var carried = [];
    ["grand", "aunts", "ext", "sibs", "kids"].forEach(function (k) {
      (ke[k] || []).forEach(function (p) { carried.push(p); });
    });
    (state.family || []).forEach(function (dst) {
      var p = carried.find(function (x) { return sameName(dst, x); });
      if (!p) return;
      if (p.look)  dst.look  = clone(p.look);
      if (p.prof)  dst.prof  = clone(p.prof);
      if (p.celeb) dst.celeb = clone(p.celeb);
    });

    // 2b. Re-add the relatives the loader deleted (cousins, nieces/nephews,
    //     cousin-kids and any other extended family), already re-labelled.
    (ke.ext || []).forEach(function (p) {
      var already = (state.family || []).some(function (dst) {
        return sameName(dst, p) &&
               Math.abs((dst.ageOffset || 0) - (p.age - ke.age)) < 1;
      });
      if (already) return;
      var rec = {
        kind:      p.kind,
        g:         p.g,
        first:     p.first,
        last:      p.last || SURNAME,
        ageOffset: p.age - ke.age,
        look:      p.look ? clone(p.look)
                          : (randomLook ? randomLook(p.g, Math.max(1, p.age)) : {}),
        rel:       p.rel == null ? 60 : p.rel
      };
      if (p.prof)  rec.prof  = clone(p.prof);
      if (p.celeb) rec.celeb = clone(p.celeb);
      if (p.dead) {
        rec.dead    = true;
        rec.diedAt  = ke.age - (p.diedAgo || 0);
        rec.diedAge = p.age - (p.diedAgo || 0);
      }
      state.family.push(rec);
    });

    // 3. Spouse: makeLover() generated a random look/job; restore the real one.
    if (ke.spouse && state.lovers && state.lovers.length) {
      var sp = state.lovers[state.lovers.length - 1];
      if (ke.spouse.look)  sp.look  = clone(ke.spouse.look);
      if (ke.spouse.prof)  sp.prof  = clone(ke.spouse.prof);
      if (ke.spouse.celeb) sp.celeb = clone(ke.spouse.celeb);
    }

    // 4. Player appearance: undo the newborn "baby look" downgrade. The
    //    loader parked adult features in state.lookLater (applied on the next
    //    birthday with a "I turned 16" line); restored directly instead.
    if (ke.look) {
      state.look = Object.assign({}, state.look || {}, clone(ke.look));
      delete state.lookLater;
    }

    // 5. Genes: inherited from the bloodline, not re-rolled. geneLook() also
    //    clears any gene-driven features (heterochromia, fur, chimera) that
    //    the random newborn roll had injected into the appearance.
    if (Array.isArray(ke.genes)) {
      var geneIds = ke.genes.slice();
      var allGeneIds = ctx.geneIds || geneIds;   // every BIRTH_TRAITS id
      state.genes       = geneIds;
      state.customGenes = false;   // with genesBloodline set, btBloodline won't re-roll
      // Drop ALL gene conditions the random newborn roll created, then put
      // back only the conditions this bloodline actually carries. Non-gene
      // conditions (illnesses etc.) are left alone.
      state.conds = (state.conds || []).filter(function (c) {
        return c && allGeneIds.indexOf(c.id) < 0;
      }).concat(ke.geneConds || []);
      if (typeof geneLook === "function") geneLook(state.look, state.genes);
    }

    // 6. Fame: keep only what the person genuinely brought with them (a real
    //    celebrity career or a royal title). Random family-fame is suppressed.
    var genuine = !!(ke.celeb && ke.celeb.level) || !!(ke.royal && ke.royal.rank);
    if (!genuine && state.art) {
      state.art.fameOn = false;
      state.art.fame   = 0;
      state.art.fans   = 0;
      state.fameFloor  = 0;
      state.socialite  = false;
    }

    if (typeof renderStats  === "function") renderStats();
    if (typeof renderAvatar === "function") renderAvatar();
  }

  /* Fail-safe wrappers: if anything unexpected is in the saved state, the
     game must still switch lives (with its old behaviour) rather than break.
     decorate() is called inside a try/catch in switchToPerson, and repair()
     inside the loader's comma-expression condition, so silence is important. */
  function safeDecorate(w, ctx) {
    try { return decorate(w, ctx); }
    catch (err) {
      if (window.console && console.warn) console.warn("HEIR_FIX.decorate failed", err);
      return w;
    }
  }
  function safeRepair(state, ke, ctx) {
    try { return repair(state, ke, ctx); }
    catch (err) {
      if (window.console && console.warn) console.warn("HEIR_FIX.repair failed", err);
    }
  }

  // Pure helpers exposed for the unit test (test-heir-fix.js).
  window.HEIR_FIX = {
    decorate: safeDecorate,
    repair:   safeRepair,
    SHIFT:    SHIFT,
    SKIP:     SKIP
  };
})();
