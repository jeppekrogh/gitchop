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
assert.equal(EFFECTS.sanitize({ enabled: 0 }).enabled, 0, 'the switch can be stored off');
assert.equal(EFFECTS.sanitize({ enabled: true }).enabled, 1, 'a boolean from older storage still counts');
assert.equal(EFFECTS.sanitize({ enabled: 7 }).enabled, 1, 'the switch clamps to on/off');

// The whole effect can be switched off, and the switch leads the card.
const toggleSpec = EFFECTS.SLIDERS[0];
assert.equal(toggleSpec.id, 'enabled', 'the off switch is the first control');
assert.ok(toggleSpec.toggle, 'it renders as a switch, not a slider');
assert.deepEqual([toggleSpec.min, toggleSpec.max, toggleSpec.value], [0, 1, 1], 'on or off, and on by default');
assert.equal(EFFECTS.resolve({}).enabled, true, 'the effect plays unless switched off');
assert.equal(EFFECTS.resolve({ enabled: 0 }).enabled, false, 'switched off means no animation at all');

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
assert.equal(calm.flarePeak, 0, 'no flare until the dial moves');
assert.ok(!('shakeAmplitude' in calm), 'the screen never shakes');
assert.ok(!('flashPeak' in calm) && !('flashSpread' in calm), 'the screen-wide flash is gone for good');

// The slice follows the speed slider exactly; the aftermath trails it, so a fast slice keeps its
// slow drama. The two agree at the slowest setting, where the whole effect is one slow motion.
assert.equal(calm.pace, 1, 'speed 100 is the classic slice pace');
const slowest = EFFECTS.resolve({ speed: 25 });
assert.equal(slowest.pace, 4, 'the slowest slice is four times the classic');
assert.equal(slowest.afterPace, slowest.pace, 'at the slowest speed the aftermath and the slice agree');
assert.ok(
  calm.afterPace > slowest.afterPace * 0.7 && calm.afterPace < slowest.afterPace,
  `the classic aftermath keeps most of the slowest setting's drama (${calm.afterPace})`,
);
const fastest = EFFECTS.resolve({ speed: 200 });
assert.equal(fastest.pace, 0.5, 'double speed halves the slice');
assert.ok(
  fastest.afterPace > slowest.afterPace * 0.6,
  `even at double speed the beat after the impact barely shortens (${fastest.afterPace})`,
);
let quicker = slowest;
for (const speed of [50, 100, 150, 200]) {
  const next = EFFECTS.resolve({ speed });
  assert.ok(next.afterPace < quicker.afterPace, `the aftermath still answers the dial at speed ${speed}`);
  assert.ok(next.afterPace >= next.pace, `the aftermath is never faster than the slice at speed ${speed}`);
  // The faster the blade, the larger the share of the whole effect that the beat after it is —
  // this is what keeps the dark from treading on the heels of a quick slice.
  assert.ok(
    next.afterPace / next.pace > quicker.afterPace / quicker.pace,
    `the beat after the slice grows against it at speed ${speed}`,
  );
  quicker = next;
}

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

// The dial is staged: glow and sparks lead, the flare joins from the middle.
const early = EFFECTS.resolve({ epicness: 20 });
assert.ok(early.bloomHeight > calm.bloomHeight, 'glow grows from the first stretch');
assert.ok(early.sparkCount > 0, 'sparks arrive early');
assert.equal(early.flarePeak, 0, 'the flare sleeps until mid-dial');

const mid = EFFECTS.resolve({ epicness: 55 });
assert.ok(mid.flarePeak > 0, 'the flare has joined by the middle');

// No channel ever shrinks across the dial, and once one has woken it keeps climbing.
let previous = calm;
for (const epicness of [25, 50, 75, 100]) {
  const next = EFFECTS.resolve({ epicness });
  for (const key of ['bloomHeight', 'haloSize', 'sparkCount', 'sparkEnergy', 'flarePeak', 'flareHeight']) {
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
assert.equal(full.flarePeak, 1, 'the full flare burns at its brightest');
assert.ok(full.flareHeight >= 400, `the full flare erupts tall from the cut (${full.flareHeight}px)`);
assert.ok(full.sparkCount >= 2 * mid.sparkCount, 'the top half of the dial doubles the sparks');

console.log('effects.js: all assertions passed');
