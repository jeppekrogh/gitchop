window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  const ANGLE = -9;
  const SWEEP = 240;
  const DARK_AT = 195;
  const DARK_IN = 120;
  const EASE_BLADE = 'cubic-bezier(0.28, 0.4, 0.2, 1)';
  const EASE_SOFT = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_BACK = 'cubic-bezier(0.5, 0, 0.2, 1)';
  const GLINT = 190;

  function div(className) {
    const node = document.createElement('div');
    node.className = className;
    return node;
  }

  /**
   * The blade and its bloom are boxes lying along the cut, so wiping them open from local right
   * to local left with a clip-path sweeps the cut across the viewport exactly once.
   */
  function geometry() {
    const radians = (ANGLE * Math.PI) / 180;
    return {
      length: (window.innerWidth / Math.cos(radians)) * 1.02,
      onCut: `translate(-50%, -50%) rotate(${ANGLE}deg)`,
      closed: 'inset(0 0 0 100%)',
      open: 'inset(0 0 0 0)',
    };
  }

  /**
   * Lightness slides from pure white toward the hue as tint rises, so tint 0 reproduces the
   * original rgba(255, 255, 255, …) values exactly; `drop` is how far each layer may fall.
   */
  function palette({ hue, tint }) {
    const tone = (drop, alpha) => `hsl(${hue} ${tint}% ${100 - (tint * drop) / 100}% / ${alpha})`;
    return {
      '--gc-blade-hi': tone(35, 0.92),
      '--gc-blade-lo': tone(35, 0.5),
      '--gc-blade-halo': tone(25, 0.55),
      '--gc-glint-hi': tone(18, 1),
      '--gc-glint-mid': tone(18, 0.55),
      '--gc-bloom-hi': tone(30, 0.26),
      '--gc-bloom-lo': tone(30, 0.1),
      '--gc-spark': tone(28, 1),
      '--gc-spark-halo': tone(28, 0.7),
      '--gc-flash': tone(15, 1),
    };
  }

  gc.createStage = function createStage({ reduced = false, effects } = {}) {
    const fx = gc.EFFECTS.resolve(effects);
    // Every duration and delay in the open sequence is multiplied by this; 100 is the classic pace.
    const pace = 100 / fx.speed;
    const geo = geometry();

    const host = document.createElement('gitchop-root');
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.zIndex = '2147483000';
    for (const [prop, value] of Object.entries(palette(fx))) {
      host.style.setProperty(prop, value);
    }
    host.style.setProperty('--gc-halo-size', `${fx.haloSize}px`);

    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = gc.CSS;

    const scrim = div('gc-scrim');
    const bloom = div('gc-bloom');
    const cut = div('gc-cut');
    const glint = div('gc-glint');
    const sparks = div('gc-sparks');
    const flash = div('gc-flash');
    const menuLayer = div('gc-menu-layer');

    for (const line of [cut, bloom, sparks]) {
      line.style.width = `${geo.length}px`;
      line.style.transform = geo.onCut;
    }
    bloom.style.height = `${fx.bloomHeight}px`;
    glint.style.width = `${GLINT}px`;
    cut.append(glint);

    // The blade sits above the dark but below the menu, so it never crosses the panel; sparks and
    // flash ride above the blade so they stay visible once the dark is in.
    shadow.append(style, scrim, bloom, cut, sparks, flash, menuLayer);
    document.documentElement.append(host);

    const blockScroll = (event) => event.preventDefault();
    host.addEventListener('wheel', blockScroll, { passive: false });
    host.addEventListener('touchmove', blockScroll, { passive: false });

    /**
     * Keyboard events are composed, so they escape the shadow root and reach GitHub's own
     * hotkey handler on document — which sees the retargeted <gitchop-root> instead of our
     * input, decides nobody is typing, and fires s/e/t/y. Stopping them at the host on the
     * way out keeps the overlay's typing to itself. Bubble phase, so the panel's own
     * handlers inside the shadow tree still run first.
     */
    const keepKeys = (event) => event.stopPropagation();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      host.addEventListener(type, keepKeys);
    }

    let panelEl = null;
    const live = [];

    /** One-shot flourishes; nothing needs to unwind them on close. */
    function once(node, keyframes, options) {
      return node.animate(keyframes, { fill: 'both', ...options });
    }

    /** Tracked so close() can freeze the property wherever it got to and animate out from there. */
    function track(node, keyframes, options, props) {
      const animation = once(node, keyframes, options);
      live.push({ animation, node, props });
      return animation;
    }

    /**
     * The container lies along the cut like the bloom does, so a spark's coordinates are local to
     * the blade: x runs along it, y is perpendicular. Each spark ignites just as the glint passes
     * its position (never before) and is kicked backwards along the cut — the blade travels toward
     * local x = 0 — in a tight perpendicular band with a short life, so the trail hugs the slice
     * and dies out just behind the blade instead of littering the whole screen. Energy makes the
     * trail fiercer, not wider. No fill — the base style keeps a spark invisible until its own
     * animation starts.
     */
    function throwSparks(sweep) {
      const energy = fx.sparkEnergy;
      for (let i = 0; i < fx.sparkCount; i++) {
        const progress = Math.random();
        const spark = div('gc-spark');
        const size = (1.2 + Math.random() * 1.3) * energy;
        spark.style.width = `${Math.round(size * (3 + Math.random() * 4))}px`;
        spark.style.height = `${size.toFixed(1)}px`;
        spark.style.left = `${Math.round(geo.length * (1 - progress))}px`;
        sparks.append(spark);

        const along = (20 + Math.random() * 90) * energy * 0.6;
        const out = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 18) * (1 + (energy - 1) * 0.4);
        const fall = 8 + Math.random() * 22;
        const flight = spark.animate(
          [
            { transform: 'translate(0px, 0px)', opacity: 1 },
            { transform: `translate(${(along * 0.6).toFixed(1)}px, ${(out * 0.7).toFixed(1)}px)`, opacity: 0.9, offset: 0.55 },
            { transform: `translate(${along.toFixed(1)}px, ${(out + fall).toFixed(1)}px)`, opacity: 0 },
          ],
          {
            duration: (160 + Math.random() * 240) * (0.75 + 0.25 * energy) * pace,
            delay: sweep * progress * (1 + Math.random() * 0.08),
            easing: EASE_SOFT,
          },
        );
        flight.finished.then(() => spark.remove()).catch(() => {});
      }
    }

    const stage = {
      host,
      shadow,
      menuLayer,

      /** The blade crosses the viewport once; the dark just fades in behind it. */
      chop() {
        const dark = track(
          scrim,
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: reduced ? 120 : DARK_IN * pace, delay: reduced ? 0 : DARK_AT * pace, easing: 'ease-out' },
          ['opacity'],
        );
        if (reduced) return dark.finished.catch(() => {});

        const sweep = SWEEP * pace;
        for (const line of [cut, bloom]) {
          once(line, [{ clipPath: geo.closed }, { clipPath: geo.open }], {
            duration: sweep,
            easing: EASE_BLADE,
          });
        }
        once(cut, [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.62 }, { opacity: 0 }], {
          duration: sweep + 200 * pace,
          easing: 'linear',
        });
        once(bloom, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.75, offset: 0.62 }, { opacity: 0 }], {
          duration: sweep + 230 * pace,
          easing: 'linear',
        });
        // Right to left: the glint's leading (left) edge tracks the clip boundary exactly.
        once(glint, [{ transform: `translateX(${geo.length}px)` }, { transform: 'translateX(0px)' }], {
          duration: sweep,
          easing: EASE_BLADE,
        });

        if (fx.sparkCount > 0) throwSparks(sweep);
        if (fx.flashPeak > 0) {
          flash.style.background = `radial-gradient(120% 90% at 50% 45%, var(--gc-flash), transparent ${fx.flashSpread}%)`;
          once(flash, [{ opacity: 0 }, { opacity: fx.flashPeak, offset: 0.2 }, { opacity: 0 }], {
            duration: (320 + 200 * fx.flashPeak) * pace,
            delay: sweep * 0.4,
            easing: 'ease-out',
          });
        }

        return dark.finished.catch(() => {});
      },

      revealPanel(panel) {
        panelEl = panel;
        return track(
          panel,
          [
            { opacity: 0, transform: 'translateY(8px) scale(0.99)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: reduced ? 120 : 200, easing: EASE_SOFT, delay: reduced ? 0 : (DARK_AT + 45) * pace },
          ['opacity', 'transform'],
        ).finished.catch(() => {});
      },

      /**
       * Reads every animated value, cancels, writes those values back inline, then animates
       * out from there. Reversing the open animations instead looked simpler but a finished
       * animation resolves `finished` immediately, so the overlay vanished within a frame.
       */
      async close() {
        const held = live.splice(0);
        const frozen = held.map(({ node, props }) => {
          const computed = getComputedStyle(node);
          return { node, values: props.map((prop) => [prop, computed.getPropertyValue(prop)]) };
        });
        for (const { animation } of held) animation.cancel();
        for (const { node, values } of frozen) {
          for (const [prop, value] of values) node.style.setProperty(prop, value);
        }

        const closing = [];
        const to = (node, keyframe, options) =>
          closing.push(node.animate([keyframe], { easing: EASE_BACK, fill: 'forwards', ...options }));

        if (panelEl) to(panelEl, { opacity: 0, transform: 'translateY(6px) scale(0.99)' }, { duration: 110 });
        to(scrim, { opacity: 0 }, { duration: reduced ? 100 : 170, delay: reduced ? 0 : 60 });

        await Promise.all(closing.map((animation) => animation.finished.catch(() => {})));
        stage.destroy();
      },

      destroy() {
        host.removeEventListener('wheel', blockScroll);
        host.removeEventListener('touchmove', blockScroll);
        for (const type of ['keydown', 'keypress', 'keyup']) {
          host.removeEventListener(type, keepKeys);
        }
        host.remove();
      },
    };

    return stage;
  };
})();
