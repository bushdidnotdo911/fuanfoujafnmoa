/*
 * genetics-fix.js — heritable appearance for Free Life
 *
 * The base game rolls a completely fresh randomLook() for every baby and for
 * every parent / grandparent / aunt / cousin / ancestor. Only a baby's SKIN
 * gets a (very swingy) mix of its parents; eyes, hair and everything else are
 * pure random, and the starting family has no shared lineage at all.
 *
 * This module adds a small two-allele model. Each look carries a hidden `geno`
 * with two alleles for skin / eyes / hair. A child takes one allele from each
 * parent; skin blends, darker eyes and darker hair are mostly dominant, and
 * there is a small mutation chance. Founders (existing NPCs, legacy saves)
 * get a hidden second allele one shade away from what they already look like,
 * so recessive traits can skip a generation without producing random faces.
 *
 * Loaded BEFORE the main game script so the initial family can be built from
 * the player's lineage. Exposes window.GENETICS.
 */
(function () {
  if (window.GENETICS) return;

  var SKIN = ["#f6d3b3", "#eebd94", "#d9a274", "#b97c50", "#8a5a3a", "#5e3d27"];
  var EYES = ["#6b4226", "#4a2c17", "#3f7fbf", "#4f8a4b", "#8a6a3a", "#5b6b7a"];
  var HAIR = ["#2a201b", "#5b3a22", "#8a5a2c", "#d8b26a", "#a8471f"];

  var EYE_DOM = { "#4a2c17": 6, "#6b4226": 5, "#8a6a3a": 4, "#5b6b7a": 3, "#4f8a4b": 2, "#3f7fbf": 1 };
  var HAIR_DOM = { "#2a201b": 6, "#5b3a22": 5, "#8a5a2c": 4, "#a8471f": 2, "#d8b26a": 1 };

  var CFG = {
    mutation: 0.02,        // chance a newborn allele drifts one shade
    dominance: 0.78,       // how often the darker eye / hair allele wins
    skinJitter: 0.10       // skin blend lands in the middle 40-60% band
  };

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function chance(p) { return Math.random() < p; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function hex(h) {
    if (!/^#[0-9a-f]{6}$/i.test(h || "")) return null;
    return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }
  function rgb(a) {
    return "#" + a.map(function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"); }).join("");
  }
  function blend(a, b, t) {
    var A = hex(a) || hex(SKIN[2]) || [0, 0, 0],
        B = hex(b) || A;
    return rgb([0, 1, 2].map(function (i) { return A[i] + (B[i] - A[i]) * t; }));
  }
  function nearest(pal, h) {
    var A = hex(h);
    if (!A) return rnd(pal.length);
    var best = 0, bd = Infinity;
    for (var i = 0; i < pal.length; i++) {
      var B = hex(pal[i]), d = 0;
      for (var k = 0; k < 3; k++) d += (A[k] - B[k]) * (A[k] - B[k]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function drift(pal, h) {
    var i = nearest(pal, h);
    var step = chance(.75) ? (chance(.5) ? -1 : 1) : 0;
    return pal[clamp(i + step, 0, pal.length - 1)];
  }
  function dominant(pal, dom, a, b) {
    var da = dom[a] || nearest(pal, a) + 1,
        db = dom[b] || nearest(pal, b) + 1;
    var out = da === db ? (chance(.5) ? a : b)
            : (da > db ? (chance(CFG.dominance) ? a : b)
                       : (chance(CFG.dominance) ? b : a));
    return chance(CFG.mutation) ? drift(pal, out) : out;
  }
  function phenotype(g) {
    return {
      skin: blend(g.skin[0], g.skin[1], .5 + (Math.random() - .5) * CFG.skinJitter),
      eyes: dominant(EYES, EYE_DOM, g.eyes[0], g.eyes[1]),
      hair: dominant(HAIR, HAIR_DOM, g.hair[0], g.hair[1])
    };
  }

  function founderGeno() {
    var s = pick(SKIN), e = pick(EYES), h = pick(HAIR);
    return {
      skin: [s, drift(SKIN, s)],
      eyes: [e, drift(EYES, e)],
      hair: [h, drift(HAIR, h)]
    };
  }
  /* Existing looks (legacy saves, random NPCs) get a plausible hidden allele. */
  function ensureGeno(look) {
    if (!look || typeof look !== "object") return founderGeno();
    if (look.geno && look.geno.skin && look.geno.eyes && look.geno.hair) return look.geno;
    var s = look.skin || pick(SKIN),
        e = look.eyes || pick(EYES),
        h = look.hair || pick(HAIR);
    look.geno = {
      skin: [s, drift(SKIN, s)],
      eyes: [e, drift(EYES, e)],
      hair: [h, drift(HAIR, h)]
    };
    return look.geno;
  }

  function baseLook(g, age) {
    age = Number(age) || 0;
    var l = {
      skin: pick(SKIN), eyes: pick(EYES), hair: pick(HAIR),
      seed: Math.floor(1e3 * Math.random()),
      beard: (g === "m" && age >= 18 && chance(.5)) ? 1 + rnd(13) : 0
    };
    return l;
  }
  function newLook(g, age, geno) {
    var l = baseLook(g, age), p = phenotype(geno);
    l.skin = p.skin; l.eyes = p.eyes; l.hair = p.hair;
    l.geno = geno;
    return l;
  }
  function cloneGeno(g) {
    return { skin: g.skin.slice(), eyes: g.eyes.slice(), hair: g.hair.slice() };
  }
  function cloneLook(src, g, age) {
    var l = baseLook(g, age);
    l.skin = src.skin; l.eyes = src.eyes; l.hair = src.hair;
    l.geno = cloneGeno(ensureGeno(src));
    return l;
  }

  /* Mendelian: one allele from each parent, then phenotype. */
  function childLook(g, A, B, age) {
    var ga = ensureGeno(A), gb = ensureGeno(B);
    var geno = {
      skin: [pick(ga.skin), pick(gb.skin)],
      eyes: [pick(ga.eyes), pick(gb.eyes)],
      hair: [pick(ga.hair), pick(gb.hair)]
    };
    if (chance(CFG.mutation)) geno.skin[rnd(2)] = drift(SKIN, geno.skin[rnd(2)]);
    if (chance(CFG.mutation)) geno.eyes[rnd(2)] = drift(EYES, geno.eyes[rnd(2)]);
    if (chance(CFG.mutation)) geno.hair[rnd(2)] = drift(HAIR, geno.hair[rnd(2)]);
    return newLook(g, age || 0, geno);
  }

  /* Build two parents that could plausibly have produced `child`. */
  var pairCache = new WeakMap();
  function parentPair(child) {
    if (!child || typeof child !== "object") return null;
    if (pairCache.has(child)) return pairCache.get(child);
    var cg = ensureGeno(child);
    var A = {
      skin: [cg.skin[0], drift(SKIN, cg.skin[0])],
      eyes: [cg.eyes[0], drift(EYES, cg.eyes[0])],
      hair: [cg.hair[0], drift(HAIR, cg.hair[0])]
    };
    var B = {
      skin: [cg.skin[1], drift(SKIN, cg.skin[1])],
      eyes: [cg.eyes[1], drift(EYES, cg.eyes[1])],
      hair: [cg.hair[1], drift(HAIR, cg.hair[1])]
    };
    var pair = { m: newLook("m", 30, A), f: newLook("f", 30, B) };
    pairCache.set(child, pair);
    return pair;
  }
  function parentLook(child, g) {
    var p = parentPair(child);
    if (!p) return baseLook(g, 30);
    return cloneLook(g === "f" ? p.f : p.m, g, 30);
  }
  function ancestorLook(g, child, age) {
    var p = parentPair(child);
    if (!p) return baseLook(g, age || 70);
    return cloneLook(g === "f" ? p.f : p.m, g, age || 70);
  }

  /* ------------------------------------------------------------------ *
   * Lineage for the whole starting family
   * ------------------------------------------------------------------ */
  var lineage = null, counters = {};
  function setLineage(dad, mom) {
    if (!dad || !mom) return;
    lineage = { dad: dad, mom: mom };
    lineage.gpP = parentPair(dad);   // paternal grandparents
    lineage.gpM = parentPair(mom);   // maternal grandparents
    lineage.aunts = [
      childLook(chance(.5) ? "m" : "f", lineage.gpP.m, lineage.gpP.f, 35),
      childLook(chance(.5) ? "m" : "f", lineage.gpM.m, lineage.gpM.f, 35)
    ];
    counters = {};
  }

  /* A spouse for an aunt / cousin: near the family palette, not a random
     stranger from the far end of the skin scale. */
  function nearSpouse(base, seed) {
    var g = {
      skin: [base.skin, drift(SKIN, base.skin)],
      eyes: [base.eyes, drift(EYES, base.eyes)],
      hair: [base.hair, drift(HAIR, base.hair)]
    };
    return newLook(chance(.5) ? "m" : "f", 30, g);
  }

  function familyLook(kind, g, age) {
    if (!lineage) return baseLook(g, age);
    var i = (counters[kind] = (counters[kind] || 0) + 1) - 1;
    if (kind === "grandparent") {
      var gp = [lineage.gpP.m, lineage.gpP.f, lineage.gpM.m, lineage.gpM.f];
      return cloneLook(gp[i % 4], g, age);
    }
    if (kind === "sibling") return childLook(g, lineage.dad, lineage.mom, age);
    if (kind === "auntuncle") {
      var pair = i % 2 ? lineage.gpM : lineage.gpP;
      return childLook(g, pair.m, pair.f, age);
    }
    if (kind === "cousin") {
      var au = lineage.aunts[i % lineage.aunts.length];
      return childLook(g, au, nearSpouse(au, i), age);
    }
    return childLook(g, lineage.dad, lineage.mom, age);
  }

  /* Relatives born later in the year (FAMILY_FACTS.birth / newBaby). */
  function newBabyLook(kind, g, lastName) {
    if (lineage && kind === "sibling") return childLook(g, lineage.dad, lineage.mom, 0);
    if (lineage && kind === "auntuncle")
      return childLook(g, lineage.gpP.m, lineage.gpP.f, 0);
    var want = { nibling: "sibling", cousin: "auntuncle", cousinkid: "cousin" }[kind];
    var p = null;
    try {
      var fam = (typeof state !== "undefined" && state && Array.isArray(state.family)) ? state.family : [];
      if (want) {
        var list = fam.filter(function (x) {
          return x && x.kind === want && !x.dead && x.look;
        });
        if (list.length) p = pick(list).look;
      }
    } catch (e) {}
    if (!p && lineage) p = lineage.dad;
    return childLook(g, p, nearSpouse(p || { skin: SKIN[2] }, rnd(999)), 0);
  }

  window.GENETICS = {
    CFG: CFG, SKIN: SKIN, EYES: EYES, HAIR: HAIR,
    baseLook: baseLook, ensureGeno: ensureGeno, phenotype: phenotype,
    childLook: childLook, parentPair: parentPair, parentLook: parentLook,
    ancestorLook: ancestorLook, setLineage: setLineage,
    familyLook: familyLook, newBabyLook: newBabyLook
  };
})();
