import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/content/effects.js', import.meta.url)), 'utf8');

const window = {};
new Function('window', source)(window);
const { EFFECTS } = window.__gitchop;

assert.deepEqual(EFFECTS.sanitize(), EFFECTS.DEFAULTS, 'nothing stored means the classic effect');
assert.deepEqual(EFFECTS.sanitize(null), EFFECTS.DEFAULTS);
assert.deepEqual(EFFECTS.sanitize('junk'), EFFECTS.DEFAULTS);
assert.deepEqual(EFFECTS.sanitize([]), EFFECTS.DEFAULTS);

const stored = EFFECTS.sanitize({ hue: 400, tint: -5, sparks: 42.6, shake: '80', flash: {}, glow: 1000, speed: 0 });
assert.equal(stored.hue, 360, 'clamped to the top of the slider');
assert.equal(stored.tint, 0, 'clamped to the bottom of the slider');
assert.equal(stored.sparks, 43, 'rounded to whole slider steps');
assert.equal(stored.shake, 80, 'numeric strings count as numbers');
assert.equal(stored.flash, EFFECTS.DEFAULTS.flash, 'a non-number falls back to the default');
assert.equal(stored.glow, 100);
assert.equal(stored.speed, 25, 'speed can never reach zero');

const chosen = { hue: 210, tint: 60, glow: 70, sparks: 40, shake: 25, flash: 15, speed: 150 };
assert.deepEqual(EFFECTS.sanitize(chosen), chosen, 'in-range values pass through untouched');

for (const slider of EFFECTS.SLIDERS) {
  assert.ok(slider.min < slider.max, `${slider.id} has a usable range`);
  assert.ok(slider.value >= slider.min && slider.value <= slider.max, `${slider.id} default is on its own scale`);
  assert.equal(EFFECTS.DEFAULTS[slider.id], slider.value, `${slider.id} default matches the slider spec`);
  assert.ok(slider.label && slider.hint, `${slider.id} carries its settings-page text`);
}

console.log('effects.js: all assertions passed');
