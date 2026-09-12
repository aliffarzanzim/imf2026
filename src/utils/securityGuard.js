// src/utils/securityGuard.js
// Self-contained Anti-Cheat Security Guard for IMF 2026 Quiz Player
// Zero external dependencies / Zero CDN. Pure vanilla JS.

/**
 * Starts the security guard. Call once when the quiz enters QUESTION state.
 *
 * @param {object} callbacks
 * @param {(reason: "devtools"|"tabswitch") => void} callbacks.onViolation
 * @param {() => string}  callbacks.getGameState   — returns current gameState string
 * @returns {() => void}  cleanup function — call on unmount / game state exit
 */
export function startSecurityGuard({ onViolation, getGameState }) {
  // Some older mobile browsers support AbortController but reject `signal` in
  // addEventListener options. That used to throw as soon as a late-joining
  // player received a QUESTION state, taking the whole React app down.
  const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  const removers = [];
  const addListener = (target, event, handler, options = {}) => {
    const fallbackOptions = { ...options };
    try {
      if (abortController) {
        target.addEventListener(event, handler, { ...options, signal: abortController.signal });
      } else {
        target.addEventListener(event, handler, fallbackOptions);
      }
    } catch (_) {
      // Safari versions without AbortSignal listener support.
      target.addEventListener(event, handler, fallbackOptions);
    }
    removers.push(() => target.removeEventListener(event, handler, fallbackOptions));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Right-click block
  // ─────────────────────────────────────────────────────────────────────────────
  addListener(
    document,
    "contextmenu",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Text selection / clipboard block
  // ─────────────────────────────────────────────────────────────────────────────
  const blockDefault = (e) => e.preventDefault();
  for (const evt of ["selectstart", "copy", "cut", "dragstart"]) {
    addListener(document, evt, blockDefault, { capture: true });
  }

  // Clear any residual selection every 500ms
  const selectionClearInterval = setInterval(() => {
    try {
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) sel.removeAllRanges();
    } catch (_) {}
  }, 500);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Keyboard shortcut block
  // ─────────────────────────────────────────────────────────────────────────────
  addListener(
    document,
    "keydown",
    (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const k = e.key?.toUpperCase();

      // F12, F11
      if (e.key === "F12" || e.key === "F11") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (ctrl) {
        // DevTools inspector
        if (shift && (k === "I" || k === "J" || k === "C" || k === "K")) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // View source / Save / Print
        if (k === "U" || k === "S" || k === "P") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Select all / Copy / Cut
        if (k === "A" || k === "C" || k === "X") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Zoom: Ctrl +/- /0/=
        if (["+", "-", "_", "=", "0"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    },
    { capture: true }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Scroll-zoom block (Ctrl + Mouse wheel)
  // ─────────────────────────────────────────────────────────────────────────────
  addListener(
    document,
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    },
    { capture: true, passive: false }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Touch pinch-zoom block
  // ─────────────────────────────────────────────────────────────────────────────
  const blockMultiTouch = (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  };
  addListener(document, "touchstart", blockMultiTouch, { capture: true, passive: false });
  addListener(document, "touchmove", blockMultiTouch, { capture: true, passive: false });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. DevTools Detector — Dimension Probe
  //    Detects docked DevTools by measuring outerWidth/Height vs innerWidth/Height.
  //    Requires 2 consecutive positive hits (avoids false positives on resize).
  //    Conservative threshold of 200px.
  // ─────────────────────────────────────────────────────────────────────────────
  let devtoolsHitCount = 0;
  let devtoolsAlreadyFired = false;

  const devtoolsDimensionInterval = setInterval(() => {
    if (devtoolsAlreadyFired) return;
    const wGap = window.outerWidth  - window.innerWidth;
    const hGap = window.outerHeight - window.innerHeight;
    if (wGap > 200 || hGap > 200) {
      devtoolsHitCount++;
      if (devtoolsHitCount >= 2) {
        devtoolsAlreadyFired = true;
        onViolation("devtools");
      }
    } else {
      devtoolsHitCount = 0;
    }
  }, 800);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. DevTools Detector — Console Object Getter Trick
  //    DevTools console panel triggers property getters when formatting objects
  //    for display. A normal script execution does NOT trigger getters.
  //    We log a probe object silently — if the getter fires, DevTools is open.
  // ─────────────────────────────────────────────────────────────────────────────
  let consoleDetectorCleanup = () => {};
  let consoleDevtoolsFired = false;

  const consoleDetectorTimeout = setTimeout(() => {
    if (devtoolsAlreadyFired) return;

    const _origLog = console.log;
    const probe = Object.create(null);

    Object.defineProperty(probe, "_imf_probe", {
      get() {
        if (!consoleDevtoolsFired && !devtoolsAlreadyFired) {
          consoleDevtoolsFired = true;
          devtoolsAlreadyFired = true;
          setTimeout(() => onViolation("devtools"), 150);
        }
        return "\uD83D\uDD12";
      },
      configurable: true,
    });

    // Redirect console.log so the probe is emitted silently (not shown to user)
    console.log = (...args) => {
      if (args[0] !== probe) _origLog.apply(console, args);
    };

    const probeInterval = setInterval(() => {
      if (consoleDevtoolsFired || devtoolsAlreadyFired) {
        clearInterval(probeInterval);
        console.log = _origLog;
        return;
      }
      _origLog.call(console, probe);
    }, 1500);

    const cleanup30s = setTimeout(() => {
      clearInterval(probeInterval);
      console.log = _origLog;
    }, 30000);

    consoleDetectorCleanup = () => {
      clearInterval(probeInterval);
      clearTimeout(cleanup30s);
      console.log = _origLog;
    };
  }, 1200);

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Tab-Switch / Window Blur Detection
  //    During QUESTION or ANSWER_REVEAL: switching tabs / minimising fires the
  //    onViolation("tabswitch") callback.
  //    Protected by stateful isAway tracking and a 2500ms cooldown to guarantee
  //    that a single tab switch or blur never registers multiple strikes.
  // ─────────────────────────────────────────────────────────────────────────────
  const activeStates = new Set(["QUESTION", "ANSWER_REVEAL"]);
  let isAway = false;
  let lastStrikeTime = 0;
  const COOLDOWN_MS = 2500;

  function triggerAwayStrike() {
    if (!activeStates.has(getGameState?.())) return;
    const now = Date.now();
    if (isAway || now - lastStrikeTime < COOLDOWN_MS) return;

    isAway = true;
    lastStrikeTime = now;
    onViolation("tabswitch");
  }

  function handleReturn() {
    // Grace period when returning so focus transitions don't re-trigger strikes
    setTimeout(() => {
      isAway = false;
    }, 500);
  }

  addListener(
    document,
    "visibilitychange",
    () => {
      if (document.hidden) {
        triggerAwayStrike();
      } else {
        handleReturn();
      }
    },
    {}
  );

  addListener(
    window,
    "blur",
    () => {
      // Delay check to avoid false positives when clicking inside browser chrome / popups
      setTimeout(() => {
        if (!document.hasFocus() || document.hidden) {
          triggerAwayStrike();
        }
      }, 350);
    },
    {}
  );

  addListener(
    window,
    "focus",
    () => {
      handleReturn();
    },
    {}
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  return function cleanup() {
    if (abortController) abortController.abort();
    removers.forEach((remove) => remove());
    clearInterval(selectionClearInterval);
    clearInterval(devtoolsDimensionInterval);
    clearTimeout(consoleDetectorTimeout);
    consoleDetectorCleanup();
  };
}
