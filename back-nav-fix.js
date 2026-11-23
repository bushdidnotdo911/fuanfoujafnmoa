/*
 * back-nav-fix.js — "Back" returns to the ACTIVITY, not the Activities menu
 * ======================================================================
 *
 * BUG
 * ---
 * The floating bottom-nav "Back" tab remembered only the last *tab* tapped:
 *
 *     const t = nav.querySelector(`.tab[data-tab="${a}"]`); t && t.click();
 *
 * With a === "Activities" that re-ran openActivities() — the MENU — so
 * closing Crime / Doctor / Salon / Parenting and tapping Back landed on the
 * Activities list instead of returning to the screen you were in.
 *
 * FIX
 * ---
 * Loaded after the game core. It wraps every screen entry point, remembers
 * the exact renderer plus the arguments it was called with, and makes the
 * Back tab re-open THAT screen.
 *
 * Two kinds of entry points are wrapped:
 *   1. any global `openXxx()` function (these are the screen openers);
 *   2. any global function whose body sets sTitle.textContent and
 *      sBack.onclick (the older, source-based detection).
 *
 * Doing BOTH matters: several game modules install their own wrappers around
 * openers (e.g. `openCrime` is wrapped by a later script that calls the
 * original via `Z.apply(this, arguments)`). Those outer wrappers do not
 * contain the title/back markers, so source-based detection alone missed
 * them and the Back tab replayed a stale screen. Recording on an actual
 * title change catches indirect openers too.
 *
 * Nothing in the game logic is touched: the original function is called with
 * the original arguments. If anything is unexpected (no recorded screen,
 * picker up, dead, re-open throws), the game's original handler runs.
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

  /* Wrap every screen entry point. Top-level `function NAME(){}` declarations
     in a classic script are writable properties of window, so replacing them
     also affects calls made from inside other renderers and wrappers. */
  const names = Object.getOwnPropertyNames(window);
  for (const name of names) {
    let orig, desc, src = "";
    try {
      orig = window[name];
      desc = Object.getOwnPropertyDescriptor(window, name);
    } catch (e) { continue; }
    if (typeof orig !== "function" || !desc || desc.writable === false) continue;
    try { src = Function.prototype.toString.call(orig); } catch (e) { continue; }
    if (src.indexOf("__BL_BACK_NAV__") >= 0) continue;   // already wrapped

    const isOpener  = /^open[A-Z]/.test(name);
    const isRenderer = src.indexOf("sTitle.textContent=") >= 0 &&
                       src.indexOf("sBack.onclick=") >= 0;
    if (!isOpener && !isRenderer) continue;

    try {
      const wrapper = function (...args) {
        "__BL_BACK_NAV__";
        const before = sTitle.textContent;
        const r = orig.apply(this, args);
        // Record only when this call really produced/replaced a screen.
        if (isRenderer || sTitle.textContent !== before || screen.classList.contains("open"))
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
