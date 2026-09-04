window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  /**
   * The colour control is this row of named chips rather than a hue slider — a swatch you can see
   * beats a number of degrees. The stored value is still a hue (steel is the special 0), so any
   * hue that arrives from elsewhere keeps working; these are just the ones the page offers.
   */
  const SWATCHES = [
    { name: 'steel', value: 0 },
    { name: 'crimson', value: 360 },
    { name: 'ember', value: 25 },
    { name: 'gold', value: 48 },
    { name: 'emerald', value: 140 },
    { name: 'cyan', value: 180 },
    { name: 'azure', value: 210 },
    { name: 'violet', value: 275 },
    { name: 'pink', value: 320 },
  ];

  /**
   * One entry per control on the settings page; `value` is the default. The defaults reproduce the
   * effect exactly as it shipped before it was configurable, so nothing changes until a control
   * moves. An entry with `swatches` renders as chips instead of a slider.
   */
  const SLIDERS = [
    { id: 'colour', label: 'Colour', min: 0, max: 360, value: 0, swatches: SWATCHES, hint: 'Steel is the classic blade; any other swatch paints the blade, sparks and flash.' },
    { id: 'epicness', label: 'Epicness', min: 0, max: 100, value: 0, hint: 'From a clean quiet cut to a full action scene: more glow, then sparks, then a flash of light, and finally the screen shakes.' },
    { id: 'speed', label: 'Speed', min: 25, max: 200, value: 100, hint: '100 is the classic pace; lower is slow motion.' },
  ];

  const DEFAULTS = Object.fromEntries(SLIDERS.map((slider) => [slider.id, slider.value]));

  /** Storage is shared state: whatever shape comes back, every value ends up on its slider's scale. */
  function sanitize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const effects = {};
    for (const { id, min, max, value } of SLIDERS) {
      const number = Number(source[id]);
      effects[id] = Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : value;
    }
    return effects;
  }

  /**
   * What the sliders mean, in the stage's units. The epicness dial is staged rather than linear:
   * the glow deepens from the first notch, sparks arrive early, the flash joins from the middle,
   * and the screen only shakes once things are already wild — so every part of the range reads
   * differently, and 100 is unmistakably not 60.
   */
  function resolve(raw) {
    const fx = sanitize(raw);
    const e = fx.epicness / 100;
    const stage = (from, to, power = 1) => Math.min(1, Math.max(0, (e - from) / (to - from))) ** power;
    const flash = stage(0.25, 0.9);
    return {
      speed: fx.speed,
      hue: fx.colour,
      tint: fx.colour === 0 ? 0 : 80,
      bloomHeight: Math.round(26 + 110 * stage(0, 1, 1.3)),
      haloSize: Math.round(6 + 14 * e),
      sparkCount: Math.round(170 * stage(0.08, 1, 1.25)),
      sparkEnergy: 1 + 1.8 * e,
      shakeAmplitude: Math.round(46 * stage(0.35, 1, 1.4)),
      flashPeak: flash,
      flashSpread: Math.round(70 + 30 * flash),
    };
  }

  gc.EFFECTS = { KEY: 'effects', SLIDERS, SWATCHES, DEFAULTS, sanitize, resolve };
})();
