/*
 * back-nav-fix.js — "Back" returns to the ACTIVITY, not the Activities menu
 * ======================================================================
 *
 * BUG
 * ---
 * The floating bottom-nav "Back" tab remembered only the last *tab* the
 * player tapped. Its click handler did:
 *
 *     const t = nav.querySelector(`.tab[data-tab="${a}"]`); t && t.click();
 *
 * With a === "Activities" that re-runs openActivities() — the MENU — so
 * closing e.g. Crime and tapping Back dumped you on the Activities list
 * instead of returning to Crime.
 *
 * FIX
 * ---
 * Loaded after the game core (all screen renderers already declared). It
 * wraps every top-level screen renderer (any global function whose body sets
 * sTitle.textContent and sBack.onclick), remembers the exact renderer + the
 * arguments it was called with, and makes the Back tab re-open THAT screen.
 *
 * It does not touch any game logic: renderers are called through the original
 * function, with the original arguments, so game state is unchanged. If
 * anything is unexpected (no recorded screen, picker open, dead, re-open
 * throws), it falls back to the game's original handler.
 *
 * Two additional hard-coded back targets are corrected in game.html by
 * apply_bug_fixes.py:
 *   - Fertility -> Sperm Donors / Surrogates now returns to Fertility
 *   - Horse Market opened from Assets -> Broker returns to Shopping
 */
(() => {
  "use strict";

  const screen  = document.getElementById("screen");
  const sTitle  = document.getElementById("sTitle");
  const sBack   = document.getElementById("sBack");
  const nav     = document.querySelector(".nav");
  const backTab = nav && nav.querySelector(".back-tab");
  if (!screen || !sTitle || !sBack || !backTab) return;

  const phone = document.querySelector(".phone");
  let last = null;          // { fn, args, title } — the screen we were just in
  let wrapped = 0;

  /* Wrap every screen renderer. Top-level `function NAME(){}` declarations in
     a classic script are writable properties of window, so replacing them
     also affects calls made from inside other renderers. */
  const names = Object.getOwnPropertyNames(window);
  for (const name of names) {
    let orig, desc;
    try {
      orig = window[name];
      desc = Object.getOwnPropertyDescriptor(window, name);
    } catch (e) { continue; }
    if (typeof orig !== "function" || !desc || desc.writable === false) continue;
    let src;
    try { src = Function.prototype.toString.call(orig); } catch (e) { continue; }
    if (src.indexOf("sTitle.textContent=") < 0 ||
        src.indexOf("sBack.onclick=") < 0) continue;
    // Skip our own wrappers if the file is somehow loaded twice.
    if (src.indexOf("__BL_BACK_NAV__") >= 0) continue;

    try {
      const wrapper = function (...args) {
        "__BL_BACK_NAV__";
        const r = orig.apply(this, args);
        last = { fn: orig, args, title: sTitle.textContent };
        return r;
      };
      window[name] = wrapper;
      wrapped++;
    } catch (e) { /* non-writable global: leave it alone */ }
  }

  if (!wrapped) return;     // nothing to do; don't touch the Back tab

  const originalBack = backTab.onclick;
  backTab.onclick = function (ev) {
    const usable = last &&
                   backTab.classList.contains("on") &&
                   !screen.classList.contains("open") &&
                   !document.getElementById("picker") &&
                   !(phone && phone.classList.contains("picking")) &&
                   !(typeof state !== "undefined" && state && state.dead);
    if (!usable) return typeof originalBack === "function"
      ? originalBack.call(this, ev) : undefined;

    const rec = last;
    try { play("choice"); } catch (e) {}
    backTab.classList.remove("on");
    try {
      screen.classList.add("open");
      rec.fn.apply(window, rec.args);
    } catch (e) {
      screen.classList.remove("open");
      if (window.console && console.warn) console.warn("Back navigation failed", e);
      return typeof originalBack === "function"
        ? originalBack.call(this, ev) : undefined;
    }
  };

  // Exposed for the Node unit tests only.
  window.BACK_NAV_FIX = {
    get last() { return last; },
    get wrapped() { return wrapped; },
    reset() { last = null; }
  };
})();
