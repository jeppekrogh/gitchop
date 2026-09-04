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
assert.deepEqual(EFFECTS.sanitize({ hue: 210, tint: 70, sparks: 50 }), EFFECTS.DEFAULTS, 'retired keys are ignored');

const stored = EFFECTS.sanitize({ colour: 400, epicness: 42.6, speed: 0 });
assert.equal(stored.colour, 360, 'clamped to the top of the slider');
assert.equal(stored.epicness, 43, 'rounded to whole slider steps');
assert.equal(stored.speed, 25, 'speed can never reach zero');
assert.equal(EFFECTS.sanitize({ epicness: '80' }).epicness, 80, 'numeric strings count as numbers');
assert.equal(EFFECTS.sanitize({ epicness: {} }).epicness, 0, 'a non-number falls back to the default');

for (const slider of EFFECTS.SLIDERS) {
  assert.ok(slider.min < slider.max, `${slider.id} has a usable range`);
  assert.ok(slider.value >= slider.min && slider.value <= slider.max, `${slider.id} default is on its own scale`);
  assert.equal(EFFECTS.DEFAULTS[slider.id], slider.value, `${slider.id} default matches the slider spec`);
  assert.ok(slider.label && slider.hint, `${slider.id} carries its settings-page text`);
}

const calm = EFFECTS.resolve({});
assert.equal(calm.tint, 0, 'colour 0 is the steel blade');
assert.equal(calm.bloomHeight, 26, 'epicness 0 keeps the classic bloom');
assert.equal(calm.haloSize, 6, 'epicness 0 keeps the classic halo');
assert.equal(calm.sparkCount, 0, 'no sparks until the dial moves');
assert.equal(calm.shakeAmplitude, 0, 'no shake until the dial moves');
assert.equal(calm.flashPeak, 0, 'no flash until the dial moves');

const painted = EFFECTS.resolve({ colour: 210 });
assert.equal(painted.hue, 210);
assert.ok(painted.tint > 0, 'any colour above zero tints the blade');

// The colour control is named swatches, each a distinct, valid, visible choice.
const colourSpec = EFFECTS.SLIDERS.find((slider) => slider.id === 'colour');
assert.equal(colourSpec.swatches, EFFECTS.SWATCHES, 'the colour control renders the shared swatches');
assert.ok(EFFECTS.SWATCHES.length >= 6, 'a real choice of swatches');
assert.deepEqual(EFFECTS.SWATCHES[0], { name: 'steel', value: 0 }, 'steel leads and is the default');
const seenValues = new Set();
for (const swatch of EFFECTS.SWATCHES) {
  assert.ok(swatch.name && typeof swatch.name === 'string', 'every swatch has a name to show');
  assert.ok(!seenValues.has(swatch.value), `${swatch.name} is a distinct colour`);
  seenValues.add(swatch.value);
  assert.equal(EFFECTS.sanitize({ colour: swatch.value }).colour, swatch.value, `${swatch.name} survives sanitize`);
  const tinted = EFFECTS.resolve({ colour: swatch.value });
  if (swatch.value === 0) assert.equal(tinted.tint, 0, 'steel stays untinted');
  else assert.ok(tinted.tint > 0, `${swatch.name} tints the blade`);
}

// The dial is staged: glow and sparks lead, the flash joins from the middle, the shake last.
const early = EFFECTS.resolve({ epicness: 20 });
assert.ok(early.bloomHeight > calm.bloomHeight, 'glow grows from the first stretch');
assert.ok(early.sparkCount > 0, 'sparks arrive early');
assert.equal(early.shakeAmplitude, 0, 'the shake sleeps until mid-dial');
assert.equal(early.flashPeak, 0, 'the flash sleeps until mid-dial');

const mid = EFFECTS.resolve({ epicness: 55 });
assert.ok(mid.flashPeak > 0, 'the flash has joined by the middle');
assert.ok(mid.shakeAmplitude > 0, 'the shake has joined by the middle');

// No channel ever shrinks across the dial, and once one has woken it keeps climbing.
let previous = calm;
for (const epicness of [25, 50, 75, 100]) {
  const next = EFFECTS.resolve({ epicness });
  for (const key of ['bloomHeight', 'haloSize', 'sparkCount', 'sparkEnergy', 'shakeAmplitude', 'flashPeak']) {
    if (previous[key] > calm[key]) {
      assert.ok(next[key] > previous[key], `${key} still grows at epicness ${epicness}`);
    } else {
      assert.ok(next[key] >= previous[key], `${key} never shrinks at epicness ${epicness}`);
    }
  }
  previous = next;
}

// The top of the dial must be unmistakably different from a timid middle.
const full = EFFECTS.resolve({ epicness: 100 });
assert.ok(full.bloomHeight >= 130, `full bloom is a blaze (${full.bloomHeight}px)`);
assert.ok(full.sparkCount >= 150, `full sparks are a storm (${full.sparkCount})`);
assert.ok(full.sparkEnergy >= 2.5, `full sparks fly hard (${full.sparkEnergy})`);
assert.ok(full.shakeAmplitude >= 40, `full shake is violent (${full.shakeAmplitude}px)`);
assert.equal(full.flashPeak, 1, 'full flash is blinding');
assert.equal(full.flashSpread, 100, 'full flash covers the screen');
assert.ok(full.sparkCount >= 2 * mid.sparkCount, 'the top half of the dial doubles the sparks');
assert.ok(full.shakeAmplitude >= 4 * mid.shakeAmplitude, 'the top half of the dial multiplies the shake');

console.log('effects.js: all assertions passed');
