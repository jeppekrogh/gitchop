window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  const DIGITS = '0123456789';
  /**
   * The strip behind each window: a blank, then two runs of the digits. A reel whose turn has not
   * come stands on the blank; the second run is so a nine rolling over to nought keeps going up
   * instead of spinning back.
   */
  const BLANK = 1;
  const CELLS = ['', ...DIGITS, ...DIGITS];
  const STEP = 100 / CELLS.length;
  /** The leftmost reel lands this soon after the panel is up — as good as at once. */
  const FIRST = 150;
  /** Each reel to the right lands this long after the one before it. */
  const GAP = 800;
  /** How long a reel spins when its turn comes: a whole turn and on to its digit, fast. */
  const SPIN = 500;
  /** How long a digit takes to tick on when a number already showing changes. */
  const TICK = 600;

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
   * A number's first appearance is dealt out one digit at a time: the leftmost reel spins onto its
   * digit as good as at once, and each reel to its right waits blank until its turn, then spins a
   * whole turn and on to its own, a beat after the one before. A number arriving while that is
   * under way keeps the cadence and only changes where the reels stop. A change to a number already
   * showing is a tick instead — the digits that moved roll straight to where they are going, always
   * upward. Reduced motion has no reels to speak of: the digits are placed.
   *
   * The strip moves by a percentage of its own height — twenty-one cells make a digit a little
   * under five percent — so no pixel size is written here and the stylesheet alone decides how tall
   * a digit is. A reel that has rolled into the second run of digits is put back into the first,
   * without moving, once its roll has ended, so there is always room to roll up again.
   */
  gc.createOdometer = function createOdometer() {
    const element = node('span', 'gc-odo');
    element.setAttribute('aria-hidden', 'true');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let reels = [];
    let shown = '';
    let held = !reduced;

    const cellOf = (digit) => BLANK + Number(digit);
    const digitOf = (index) => (index - BLANK) % DIGITS.length;

    function place(reel, index, animate) {
      if (!animate) reel.style.transition = 'none';
      reel.style.transform = `translateY(-${(index * STEP).toFixed(2)}%)`;
      reel.dataset.at = String(index);
      if (!animate) {
        // Reading layout applies the position now, so the transition restored below has nothing
        // to animate from it.
        void reel.offsetWidth;
        reel.style.transition = '';
      }
    }

    function time(reel, duration, delay) {
      reel.style.setProperty('--gc-odo-roll', `${Math.round(duration)}ms`);
      reel.style.setProperty('--gc-odo-delay', `${Math.round(Math.max(0, delay))}ms`);
    }

    function settle(reel) {
      const at = Number(reel.dataset.at) || 0;
      if (at >= BLANK + DIGITS.length) place(reel, at - DIGITS.length, false);
      delete reel.dataset.landAt;
      reel.style.setProperty('--gc-odo-delay', '0ms');
    }

    /** New reels, standing on `from` — the previous digits, right-aligned — and blank where there was none. */
    function build(count, from) {
      element.textContent = '';
      reels = [];
      const start = from.slice(-count).padStart(count, ' ');
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && (count - i) % 3 === 0) element.append(node('span', 'gc-odo-sep'));
        const digit = node('span', 'gc-odo-digit');
        const reel = node('span', 'gc-odo-reel');
        for (const glyph of CELLS) reel.append(node('span', null, glyph));
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
     * Every reel to its digit. A spin deals the reels off the blank in turn, each a whole turn and
     * on to its digit, and writes down when it lands; a reel still on its way in when a new number
     * comes keeps that landing and takes the new digit. Anything else is a tick: straight there,
     * always upward, into the second run when the digit is behind it.
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

        if (spin && at < BLANK) {
          const duration = i === 0 ? FIRST : SPIN;
          const land = now + FIRST + i * GAP;
          reel.dataset.landAt = String(land);
          time(reel, duration, land - now - duration);
          place(reel, cellOf(wanted) + DIGITS.length, true);
          return;
        }
        if (landAt > now) {
          const left = landAt - now;
          time(reel, Math.min(left, SPIN), left - SPIN);
          place(reel, cellOf(wanted) + DIGITS.length, true);
          return;
        }

        time(reel, TICK, 0);
        if (at < BLANK) {
          place(reel, cellOf(wanted), true);
          return;
        }
        const steps = (wanted - digitOf(at) + DIGITS.length) % DIGITS.length;
        if (at + steps >= CELLS.length) {
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
        // Reels built with no number before them — the first number, or one after a shimmer — are
        // dealt in; reels rebuilt around a number that grew a digit roll on from it.
        let spin = false;
        if (reels.length !== digits.length) {
          build(digits.length, held ? '' : shown);
          spin = !held && !shown;
        }
        shown = digits;
        if (!held) roll(digits, spin);
      },

      /** The panel is on screen: deal in whatever was set, and follow every set from here. */
      reveal() {
        if (!held) return;
        held = false;
        if (shown) roll(shown, true);
      },
    };
  };
})();
