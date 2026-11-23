/*
 * back-nav-fix.js — seamless "Back" from screens + floating Back tab
 * =================================================================
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
 * BUG 2 (floating Back tab spasm)
 * -------------------------------
 * Re-opening with a plain classList.add("open") re-triggered the game's
 * full-height slide-up (.32s, .65s on the 2018 theme), which reversed the
 * close animation mid-flight. Fixed by rendering the content first with
 * transitions disabled, then flushing layout — the browser paints only the
 * final, fully-rendered screen.
 *
 * BUG 3 (THE SPASM ON THE ON-SCREEN BACK ARROW — this revision)
 * ------------------------------------------------------------
 * #sBack (the top-left arrow / X on every screen) is watched by the game:
 *
 *     navWatch(sBack.parentElement, -1)
 *
 * navWatch grabs a clone of sList on capture (snapNav) and, if the title
 * changed, calls playNav(snap, -1) on bubble. playNav then:
 *   - appends that clone as an absolutely-positioned GHOST over the screen,
 *   - starts a 300ms translateX(0 -> 100%) on the ghost,
 *   - starts a 300ms translateX(-30% -> 0) on the NEW list (a hard -126px
 *     jump on frame one),
 *   - fades sTitle from opacity 0 -> 1 over 250ms,
 *   - removes the ghost after 330ms.
 *
 * So pressing Back from any screen produces ~344ms of overlapping slides,
 * a blinking title, and a duplicate of the old screen laid on top. On a
 * quick second tap playNav.end() calls .finish() on the in-flight
 * animations, snapping the list back to -126px and the title to 0 — the
 * visible "spasm". Cloned ghosts also re-decode images and lose IDs, so
 * custom screens flash.
 *
 * THE FIX
 * -------
 * For any BACK-type click (header arrow, in-content "Back" button, or the
 * floating tab) we:
 *   1. arm an instant transition on #screen for the duration of the click,
 *      so a close-type Back has no 320/650ms slide either;
 *   2. make snapNav() return null, so navWatch never calls playNav at all —
 *      no ghost, no list slide, no title fade;
 *   3. call playNav.end() to clear any ghost left over from a previous
 *      FORWARD navigation.
 *
 * Forward navigation (clicking a row to drill deeper) keeps the game's own
 * slide animation — navWatch(sList, 1) still sees a non-null snapshot.
 *
 * Nothing in the game logic is touched: screen renderers are called with
 * their original arguments. Fallbacks are in place for every edge case.
 */
(() => {
  "use strict";

  const screen  = document.getElementById("screen");
  const sTitle  = document.getElementById("sTitle");
  const sBack   = document.getElementById("sBack");
  const sList   = document.getElementById("sList");
  const nav     = document.querySelector(".nav");
  const backTab = nav && nav.querySelector(".back-tab");
  if (!screen || !sTitle || !sBack || !backTab) return;

  const phone = document.querySelector(".phone");
  let last = null;          // { fn, args, title } — the screen we were just in
  let lastReveal = null;    // diagnostics: "instant" | "fallback" | "original"
  let wrapped = 0;
  let backClick = false;    // true only for the duration of a BACK-type click
  let restoreFn = null;     // pending transition restore

  /* ------------------------------------------------------------------ *
   * 1. Remember the exact screen renderer (floating Back tab)
   * ------------------------------------------------------------------ */
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

  if (!wrapped) return;     // nothing to do; don't touch anything else

  /* ------------------------------------------------------------------ *
   * 2. Helpers
   * ------------------------------------------------------------------ */

  /* playNav() installs its own cleanup as playNav.end. Calling it removes
     the ghost clone and cancels its animations. */
  function clearPendingGhost() {
    try {
      if (typeof playNav === "function" && typeof playNav.end === "function")
        playNav.end();
    } catch (e) {}
  }

  /* Disable every screen transition for one click, then restore on the next
     frame (while the screen holds its final state, so nothing animates).
     Inline `transition:none` is required in addition to `.snap` because the
     2018 theme has a higher-specificity rule. */
  function armInstantBack() {
    if (restoreFn) return;              // already armed for this click
    let previous = "";
    try {
      if (screen.style) {
        previous = screen.style.transition || "";
        screen.style.transition = "none";
      }
    } catch (e) {}
    try { screen.classList.add("snap"); } catch (e) {}

    const restore = () => {
      // Commit the final transform while transitions are still off.
      try { void screen.offsetWidth; } catch (e) {}
      try {
        if (typeof getComputedStyle === "function")
          void getComputedStyle(screen).transform;
      } catch (e) {}
      try {
        if (screen.style) {
          if (previous) screen.style.transition = previous;
          else if (screen.style.removeProperty) screen.style.removeProperty("transition");
          else screen.style.transition = "";
        }
      } catch (e) {}
      try { screen.classList.remove("snap"); } catch (e) {}
      restoreFn = null;
    };
    restoreFn = restore;
    try {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
      else if (typeof setTimeout === "function") setTimeout(restore, 0);
      else restore();
    } catch (e) { restore(); }
  }

  /* Is this click a BACK-type action? Covers the header arrow / X, the
     floating bottom tab, and the in-content "Back" buttons used by both the
     game and the custom screens (which live inside #sList). */
  function isBackClick(ev) {
    const t = ev && ev.target;
    if (!t) return false;
    try {
      if (t === sBack || (sBack.contains && sBack.contains(t))) return true;
      if (t === backTab || (backTab.contains && backTab.contains(t))) return true;
    } catch (e) {}
    try {
      const el = t.nodeType === 1 ? t : (t.parentElement || null);
      if (!el || !el.closest) return false;
      if (el.id && /back/i.test(el.id)) return true;
      const ctrl = el.closest(".row, .mf-btn, button, .tab, .bkc");
      if (ctrl) {
        if (ctrl.getAttribute && /back/i.test(ctrl.getAttribute("data-act") || "")) return true;
        const b = ctrl.querySelector ? ctrl.querySelector("b") : null;
        const txt = String((b && b.textContent) || ctrl.textContent || "")
          .replace(/\s+/g, " ").trim().slice(0, 60);
        if (/^(back|go back|back to|not now|never mind|cancel|close|←|‹)/i.test(txt))
          return true;
      }
    } catch (e) {}
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 3. Suppress the ghost animation for BACK clicks (the actual spasm)
   * ------------------------------------------------------------------ */
  try {
    if (typeof document.addEventListener === "function") {
      // Capture on document fires BEFORE the game's capture listener on
      // sBack.parentElement, so the flag is set before snapNav() is called.
      document.addEventListener("click", (ev) => {
        if (!isBackClick(ev)) return;
        backClick = true;
        clearPendingGhost();
        armInstantBack();
        // Clear after the whole click has finished. A timeout is safest:
        // some handlers stop propagation, which would skip a bubble hook.
        try {
          if (typeof setTimeout === "function") setTimeout(() => { backClick = false; }, 0);
        } catch (e) { backClick = false; }
      }, true);
    }
  } catch (e) {}

  /* navWatch calls the global snapNav() on every click. Returning null for
     BACK clicks makes its bubble-phase guard short-circuit, so playNav() is
     never called: no ghost, no -126px list jump, no title fade. Forward
     clicks (navWatch(sList, 1)) still get the real snapshot and animate. */
  try {
    const origSnap = typeof snapNav === "function" ? snapNav : null;
    const desc = Object.getOwnPropertyDescriptor(window, "snapNav");
    if (origSnap && desc && desc.writable !== false) {
      window.snapNav = function () {
        if (backClick) return null;
        return origSnap.apply(this, arguments);
      };
    }
  } catch (e) {}

  /* ------------------------------------------------------------------ *
   * 4. Floating bottom-nav Back tab: re-open the exact activity, instantly
   * ------------------------------------------------------------------ */
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
    armInstantBack();

    // Kill the tab's .22s pop-in for this one click so it vanishes cleanly.
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

    try {
      screen.classList.add("open");
      rec.fn.apply(window, rec.args);
      if (!screen.classList.contains("open")) screen.classList.add("open");
      lastReveal = "instant";
    } catch (e) {
      if (window.console && console.warn) console.warn("Back navigation failed", e);
      try {
        if (typeof originalBack === "function") {
          originalBack.call(this, ev);
          if (!screen.classList.contains("open")) screen.classList.add("open");
        }
      } catch (e2) {}
      lastReveal = "fallback";
    }
  };

  // Exposed for the Node unit tests and the browser regression suites.
  window.BACK_NAV_FIX = {
    get last() { return last; },
    get wrapped() { return wrapped; },
    get lastReveal() { return lastReveal; },
    get backClick() { return backClick; },
    reset() { last = null; lastReveal = null; backClick = false; }
  };
})();
