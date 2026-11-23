/*
 * back-nav-fix.js — "Back" returns to the ACTIVITY, not the Activities menu
 * ======================================================================
 *
 * BUG 1 (original)
 * ----------------
 * The floating bottom-nav "Back" tab remembered only the last *tab* tapped:
 *
 *     const t = nav.querySelector(`.tab[data-tab="${a}"]`); t && t.click();
 *
 * With a === "Activities" that re-ran openActivities() — the MENU — so
 * closing Crime / Doctor / Salon / Parenting and tapping Back landed on the
 * Activities list instead of returning to the screen you were in.
 *
 * BUG 2 (this revision)
 * ---------------------
 * Re-opening the screen with a plain classList.add("open") re-triggered the
 * game's full-height slide-up:
 *
 *     .screen.open { transform:translateY(0); transition:transform .32s ... }
 *     .phone.y2018 .screen.open { transition-duration:.65s }
 *
 * Closing a screen slides it DOWN; tapping Back then slides it all the way
 * back UP. If you tap quickly the two overlap and the transition reverses
 * mid-flight — the visible half-second "spasm". On the 2018 theme it is a
 * full 650ms.
 *
 * THE FIX
 * -------
 * Loaded after the game core. It wraps every screen entry point, remembers
 * the exact renderer plus the arguments it was called with, and makes the
 * Back tab re-open THAT screen with NO animation at all.
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
 * For the animation-free return we use the same trick the game itself uses
 * in snapClose(): disable the transition, render the content, force a
 * synchronous style/layout flush, then restore the transition. An inline
 * `transition:none` is used in addition to the `.snap` class because the
 * 2018 theme has a higher-specificity rule that would otherwise override it.
 * The renderer runs before the flush, so the browser only ever paints the
 * final, fully-rendered screen — no slide, no bounce, no ghost frame.
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
  let lastReveal = null;    // diagnostics: "instant" | "fallback" | "original"
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

    const isOpener   = /^open[A-Z]/.test(name);
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

  /* Stop any in-flight ghost navigation from the previous screen swap. The
     game's playNav() leaves a cloned list absolutely positioned over #screen
     for ~330ms; if Back is pressed during that window the stale ghost can
     flash over the restored screen. playNav.end() is its own cleanup hook. */
  function clearPendingGhost() {
    try {
      if (typeof playNav === "function" && typeof playNav.end === "function")
        playNav.end();
    } catch (e) {}
  }

  /* Disable every screen transition for the duration of one synchronous
     render, then restore. Returns a cleanup function. */
  function beginInstantReveal() {
    let previous = "";
    try {
      if (screen.style) {
        previous = screen.style.transition || "";
        screen.style.transition = "none";
      }
    } catch (e) {}
    try { screen.classList.add("snap"); } catch (e) {}

    return function endInstantReveal() {
      // Force style + layout to commit translateY(0) while transitions are
      // off. Without this the browser can animate from the old 100% offset.
      try { void screen.offsetWidth; } catch (e) {}
      try {
        if (typeof getComputedStyle === "function")
          void getComputedStyle(screen).transform;
      } catch (e) {}
      try {
        if (screen.style) {
          if (previous) screen.style.transition = previous;
          else screen.style.removeProperty
            ? screen.style.removeProperty("transition")
            : (screen.style.transition = "");
        }
      } catch (e) {}
      try { screen.classList.remove("snap"); } catch (e) {}
    };
  }

  const originalBack = backTab.onclick;
  backTab.onclick = function (ev) {
    const usable = last &&
                   backTab.classList.contains("on") &&
                   !screen.classList.contains("open") &&
                   !(phone && phone.classList.contains("picking")) &&
                   !(typeof state !== "undefined" && state && state.dead);
    if (!usable) {
      lastReveal = "original";
      return typeof originalBack === "function"
        ? originalBack.call(this, ev) : undefined;
    }

    const rec = last;
    try { play("choice"); } catch (e) {}

    clearPendingGhost();

    // The floating tab has a .22s pop-in animation. Kill it for this one
    // click so the tab vanishes cleanly instead of snapping out mid-pop.
    // Restore on the next frame, while the tab is hidden (no animation runs).
    let tabAnimation = "";
    try {
      if (backTab.style) {
        tabAnimation = backTab.style.animation || "";
        backTab.style.animation = "none";
      }
    } catch (e) {}
    backTab.classList.remove("on");
    const restoreTab = () => {
      try {
        if (backTab.style) {
          if (tabAnimation) backTab.style.animation = tabAnimation;
          else if (backTab.style.removeProperty) backTab.style.removeProperty("animation");
          else backTab.style.animation = "";
        }
      } catch (e) {}
    };
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreTab);
      else if (typeof setTimeout === "function") setTimeout(restoreTab, 0);
      else restoreTab();
    } catch (e) { restoreTab(); }

    // Re-open with the content already rendered and NO slide.
    const endReveal = beginInstantReveal();
    let ok = false;
    try {
      screen.classList.add("open");
      rec.fn.apply(window, rec.args);
      // Some openers add "open" themselves; make sure we ended in that state.
      if (!screen.classList.contains("open")) screen.classList.add("open");
      ok = true;
      lastReveal = "instant";
    } catch (e) {
      if (window.console && console.warn) console.warn("Back navigation failed", e);
      // Fall back to the game's own navigation, still without the slide.
      try {
        if (typeof originalBack === "function") {
          originalBack.call(this, ev);
          if (!screen.classList.contains("open")) screen.classList.add("open");
        }
      } catch (e2) {}
      lastReveal = "fallback";
    } finally {
      try { endReveal(); } catch (e) {}
    }

    if (!ok && typeof originalBack === "function" && lastReveal !== "fallback")
      return originalBack.call(this, ev);
  };

  // Exposed for the Node unit tests and the browser regression suite.
  window.BACK_NAV_FIX = {
    get last() { return last; },
    get wrapped() { return wrapped; },
    get lastReveal() { return lastReveal; },
    reset() { last = null; lastReveal = null; }
  };
})();
