window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  const DIGITS = '0123456789';
  /** Two runs of the digits, so a nine rolling over to nought keeps going up instead of spinning back. */
  const CELLS = DIGITS + DIGITS;
  const STEP = 100 / CELLS.length;
  /**
   * How long the leftmost reel rolls, and how much longer each reel to its right rolls: they all
   * start together and stop one after another, left to right, as a slot machine's do.
   */
  const ROLL = 800;
  const ROLL_STEP = 150;

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
   * anything that reads. Until the panel is on screen the reels hold at zero, whatever has been
   * set; `reveal` lets them go, and every set after that rolls from wherever they are.
   *
   * A number's first appearance is a spin: every reel turns through all ten digits once and then on
   * to its own, the leftmost stopping first and each to its right a beat later, so the figure lands
   * digit by digit. A change to a number already showing is a tick instead — the digits that moved
   * roll straight to where they are going, always upward. Reduced motion has no reels to speak of:
   * the digits are placed.
   *
   * The strip moves by a percentage of its own height — twenty cells make a digit five percent —
   * so no pixel size is written here and the stylesheet alone decides how tall a digit is. A reel
   * that has rolled into the second run of digits is put back into the first, without moving, once
   * its roll has ended, so there is always room to roll up again.
   */
  gc.createOdometer = function createOdometer() {
    const element = node('span', 'gc-odo');
    element.setAttribute('aria-hidden', 'true');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let reels = [];
    let shown = '';
    let held = !reduced;

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

    function settle(reel) {
      const at = Number(reel.dataset.at) || 0;
      if (at >= DIGITS.length) place(reel, at - DIGITS.length, false);
    }

    /** New reels, standing at `from` — the previous digits, right-aligned, or nought — for the roll to leave from. */
    function build(count, from) {
      element.textContent = '';
      reels = [];
      const start = from.slice(-count).padStart(count, '0');
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && (count - i) % 3 === 0) element.append(node('span', 'gc-odo-sep'));
        const digit = node('span', 'gc-odo-digit');
        const reel = node('span', 'gc-odo-reel');
        for (const glyph of CELLS) reel.append(node('span', null, glyph));
        reel.style.setProperty('--gc-odo-roll', `${ROLL + i * ROLL_STEP}ms`);
        reel.addEventListener('transitionend', () => settle(reel));
        place(reel, Number(start[i]), false);
        digit.append(reel);
        element.append(digit);
        reels.push(reel);
      }
      // Freshly appended reels have no computed position yet; reading one gives them their
      // starting place, so the roll that follows in the same tick has somewhere to leave from.
      void element.offsetWidth;
    }

    /**
     * Every reel to its digit — always upward, into the second run when the digit is behind it.
     * A spin adds a whole turn first, when the strip has room for one: a nought then turns all the
     * way round rather than standing still.
     */
    function roll(digits, spin = false) {
      reels.forEach((reel, i) => {
        const wanted = Number(digits[i]);
        if (reduced) {
          place(reel, wanted, false);
          return;
        }
        let at = Number(reel.dataset.at) || 0;
        let steps = (wanted - (at % DIGITS.length) + DIGITS.length) % DIGITS.length;
        if (at + steps >= CELLS.length) {
          place(reel, at - DIGITS.length, false);
          at -= DIGITS.length;
        }
        if (spin && at + steps + DIGITS.length < CELLS.length) steps += DIGITS.length;
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
        // Reels built with no number before them — the first number, or one after a shimmer — spin
        // in; reels rebuilt around a number that grew a digit roll on from it.
        let spin = false;
        if (reels.length !== digits.length) {
          build(digits.length, held ? '' : shown);
          spin = !held && !shown;
        }
        shown = digits;
        if (!held) roll(digits, spin);
      },

      /** The panel is on screen: spin in whatever was set, and follow every set from here. */
      reveal() {
        if (!held) return;
        held = false;
        if (shown) roll(shown, true);
      },
    };
  };
})();
