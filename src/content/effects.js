window.__gitchop = window.__gitchop || {};

(() => {
  const gc = window.__gitchop;

  /**
   * One entry per slider on the settings page; `value` is the default. The defaults reproduce the
   * effect exactly as it shipped before it was configurable, so nothing changes until a slider moves.
   */
  const SLIDERS = [
    { id: 'hue', label: 'Hue', min: 0, max: 360, value: 0, hint: 'Where on the colour wheel the blade sits. Does nothing until Tint is above zero.' },
    { id: 'tint', label: 'Tint', min: 0, max: 100, value: 0, hint: '0 is the classic steel white; 100 is fully coloured.' },
    { id: 'glow', label: 'Glow', min: 0, max: 100, value: 50, hint: 'The bloom around the cut. 50 is the classic look.' },
    { id: 'sparks', label: 'Sparks', min: 0, max: 100, value: 0, hint: 'Embers thrown off the blade as it passes.' },
    { id: 'shake', label: 'Shake', min: 0, max: 100, value: 0, hint: 'How hard the page recoils from the impact.' },
    { id: 'flash', label: 'Flash', min: 0, max: 100, value: 0, hint: 'A burst of light at the moment of impact.' },
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

  gc.EFFECTS = { KEY: 'effects', SLIDERS, DEFAULTS, sanitize };
})();
