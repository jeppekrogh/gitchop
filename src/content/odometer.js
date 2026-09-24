window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  const DIGITS = '0123456789';
  /** The strip behind each window begins with a blank, which a reel stands on before its first spin. */
  const BLANK = 1;
  /** The leftmost reel lands this soon after the panel is up — as good as at once. */
  const FIRST = 150;
  /** Each reel to the right lands this long after the one before it. */
  const GAP = 800;
  /** How long a digit takes to tick on when a number already showing changes. */
  const TICK = 600;
  /**
   * How long one whole turn takes at spinning pace: a reel that stops later turns more times on
   * the way, about one a second, so the whole row spins at much the same, unhurried speed.
   */
  const TURN = 1000;
  const turnsFor = (i) => Math.max(1, Math.round((FIRST + i * GAP) / TURN));
  /** A spin runs near enough flat out and brakes at the end; a tick eases out from the start. */
  const SPIN_EASE = 'cubic-bezier(0.35, 0.35, 0.6, 1)';
  const TICK_EASE = 'cubic-bezier(0.2, 0.7, 0.15, 1)';

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  /**
   * A number as a row of reels, one per digit: a strip of glyphs sliding behind a window one digit
   * tall, so a change rolls rather than blinks. Groups of three are spaced, never joined with a
   * comma — the reels are for looking at, and the exact figure goes on the label around them for
   * anything that reads. Until the panel is on screen the reels stand blank, whatever has been
   * set; `reveal` lets them go, and every set after that rolls from wherever they are.
   *
   * A number's first appearance is a slot machine's: every reel starts spinning the moment the
   * panel is up and they stop one at a time, left to right — the first as good as at once, each
   * to its right a beat after the one before. A reel that stops later turns more times on the way,
   * about one a second, so they all spin at much the same pace. A number arriving while they are still turning keeps
   * every stop where it was and only changes the digit each reel stops on. A change to a number
   * already showing is a tick instead — the digits that moved roll straight to where they are
   * going, always upward. Reduced motion has no reels to speak of: the digits are placed.
   *
   * The strip is a blank and then as many runs of the digits as the last reel needs turns, and one
   * more, so it has a whole run left to tick into once it has landed.
   * It moves by a percentage of its own height, so no pixel size is written here and the
   * stylesheet alone decides how tall a digit is. A reel that has rolled past the first run is put
   * back into it, without moving, once its roll has ended, so there is always room to roll up again.
   */
  gc.createOdometer = function createOdometer() {
    const element = node('span', 'gc-odo');
    element.setAttribute('aria-hidden', 'true');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let reels = [];
    let cells = 0;
    let shown = '';
    let held = !reduced;

    const cellOf = (digit) => BLANK + Number(digit);
    const digitOf = (index) => (index - BLANK) % DIGITS.length;

    function place(reel, index, animate) {
      if (!animate) reel.style.transition = 'none';
      reel.style.transform = `translateY(-${((index * 100) / cells).toFixed(2)}%)`;
      reel.dataset.at = String(index);
      if (!animate) {
        // Reading layout applies the position now, so the transition restored below has nothing
        // to animate from it.
        void reel.offsetWidth;
        reel.style.transition = '';
      }
    }

    function time(reel, duration, delay, ease) {
      reel.style.setProperty('--gc-odo-roll', `${Math.round(duration)}ms`);
      reel.style.setProperty('--gc-odo-delay', `${Math.round(Math.max(0, delay))}ms`);
      reel.style.setProperty('--gc-odo-ease', ease);
    }

    /** Landed: back into the first run on the same digit, and ready to tick. */
    function settle(reel) {
      const at = Number(reel.dataset.at) || 0;
      if (at >= BLANK + DIGITS.length) place(reel, cellOf(digitOf(at)), false);
      delete reel.dataset.landAt;
      time(reel, TICK, 0, TICK_EASE);
    }

    /** New reels, standing on `from` — the previous digits, right-aligned — and blank where there was none. */
    function build(count, from) {
      element.textContent = '';
      reels = [];
      const runs = turnsFor(count - 1) + 1;
      cells = BLANK + DIGITS.length * runs;
      const start = from.slice(-count).padStart(count, ' ');
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && (count - i) % 3 === 0) element.append(node('span', 'gc-odo-sep'));
        const digit = node('span', 'gc-odo-digit');
        const reel = node('span', 'gc-odo-reel');
        reel.append(node('span', null, ''));
        for (let run = 0; run < runs; run += 1) {
          for (const glyph of DIGITS) reel.append(node('span', null, glyph));
        }
        reel.addEventListener('transitionend', () => settle(reel));
        place(reel, start[i] === ' ' ? 0 : cellOf(start[i]), false);
        digit.append(reel);
        element.append(digit);
        reels.push(reel);
      }
      // Freshly appended reels have no computed position yet; reading one gives them their
      // starting place, so the roll that follows in the same tick has somewhere to leave from.
      void element.offsetWidth;
    }

    /**
     * Every reel to its digit. A spin sets every reel off at once, each to stop in turn after as
     * many whole turns as its spinning time allows, and writes down when it lands; a reel still
     * turning when a new number comes keeps that landing and takes the new digit. Anything else is
     * a tick: straight there, always upward, into the next run when the digit is behind it.
     */
    function roll(digits, spin) {
      const now = performance.now();
      reels.forEach((reel, i) => {
        const wanted = Number(digits[i]);
        if (reduced) {
          place(reel, cellOf(wanted), false);
          return;
        }
        let at = Number(reel.dataset.at) || 0;
        const landAt = Number(reel.dataset.landAt);
        const stop = cellOf(wanted) + DIGITS.length * turnsFor(i);

        if (spin && at < BLANK) {
          const duration = FIRST + i * GAP;
          reel.dataset.landAt = String(now + duration);
          time(reel, duration, 0, SPIN_EASE);
          place(reel, stop, true);
          return;
        }
        if (landAt > now) {
          time(reel, landAt - now, 0, SPIN_EASE);
          place(reel, stop, true);
          return;
        }

        time(reel, TICK, 0, TICK_EASE);
        if (at < BLANK) {
          place(reel, cellOf(wanted), true);
          return;
        }
        const steps = (wanted - digitOf(at) + DIGITS.length) % DIGITS.length;
        if (at + steps >= cells) {
          at = cellOf(digitOf(at));
          place(reel, at, false);
        }
        place(reel, at + steps, true);
      });
    }

    return {
      element,

      /** Null is a number not known yet: a shimmer where the digits will be. */
      set(value) {
        if (value == null || !Number.isFinite(Number(value))) {
          element.textContent = '';
          reels = [];
          shown = '';
          element.append(node('span', 'gc-bar gc-odo-bar'));
          return;
        }
        const digits = String(Math.max(0, Math.floor(Number(value))));
        // Reels built with no number before them — the first number, or one after a shimmer —
        // spin in; reels rebuilt around a number that grew a digit roll on from it.
        let spin = false;
        if (reels.length !== digits.length) {
          build(digits.length, held ? '' : shown);
          spin = !held && !shown;
        }
        shown = digits;
        if (!held) roll(digits, spin);
      },

      /** The panel is on screen: set the reels spinning to whatever was set, and follow every set from here. */
      reveal() {
        if (!held) return;
        held = false;
        if (shown) roll(shown, true);
      },
    };
  };
})();
