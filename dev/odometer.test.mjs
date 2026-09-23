import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/content/odometer.js', import.meta.url)), 'utf8');

/**
 * Just enough of a DOM for the reels: elements with children, a class, a style, a dataset, and
 * listeners that can be fired by hand. Transitions do not run here — what is tested is where each
 * reel is told to go, which is the whole of the arithmetic.
 */
class Style {
  constructor() {
    this.transform = '';
    this.transition = '';
    this.vars = {};
  }
  setProperty(name, value) {
    this.vars[name] = value;
  }
}

class Element {
  constructor(tag) {
    this.tag = tag;
    this.className = '';
    this.children = [];
    this.attributes = {};
    this.style = new Style();
    this.dataset = {};
    this.listeners = {};
    this.text = '';
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  fire(type) {
    for (const listener of this.listeners[type] ?? []) listener({ type });
  }
  get offsetWidth() {
    return 0;
  }
}

function load({ reduced = false } = {}) {
  const window = {};
  const document = { createElement: (tag) => new Element(tag) };
  const matchMedia = () => ({ matches: reduced });
  new Function('window', 'document', 'matchMedia', source)(window, document, matchMedia);
  return window.__gitchop.createOdometer();
}

const reels = (odo) => odo.element.children.filter((child) => child.className === 'gc-odo-digit').map((digit) => digit.children[0]);
const at = (odo) => reels(odo).map((reel) => Number(reel.dataset.at));
const shape = (odo) => odo.element.children.map((child) => (child.className === 'gc-odo-sep' ? '|' : 'd')).join('');
const percent = (reel) => reel.style.transform;

// Before the panel is on screen the reels stand at nought, whatever has been set.
let odo = load();
odo.set(1234);
assert.equal(shape(odo), 'd|ddd', 'a thousands gap, no comma');
assert.deepEqual(at(odo), [0, 0, 0, 0], 'held at nought until revealed');
assert.deepEqual(reels(odo).map((reel) => reel.style.vars['--gc-odo-roll']), ['800ms', '950ms', '1100ms', '1250ms'], 'they start together and stop left to right, a beat apart');
assert.equal(reels(odo)[0].children.length, 20, 'two runs of the digits on every reel');
assert.equal(odo.element.attributes['aria-hidden'], 'true', 'the reels are decoration; the label around them reads');

// A later set before the reveal only changes where the roll will end.
odo.set(1226);
assert.deepEqual(at(odo), [0, 0, 0, 0]);
odo.reveal();
assert.deepEqual(at(odo), [11, 12, 12, 16], 'revealed: every reel spins a whole turn and on to its digit');
assert.equal(percent(reels(odo)[3]), 'translateY(-80.00%)', 'a digit is five percent of a twenty-cell strip');
assert.equal(reels(odo)[3].style.transition, '', 'the roll uses the stylesheet transition');
for (const reel of reels(odo)) reel.fire('transitionend');
assert.deepEqual(at(odo), [1, 2, 2, 6], 'settled into the first run, each on its digit');

// A refresh that lands higher rolls the last digits on, and no further — always upward, so six to
// four goes up through the nine into the second run, and is put back once the roll ends.
odo.set(1234);
assert.deepEqual(at(odo), [1, 2, 3, 14], 'the tens up one; the units up eight, through the nine');
reels(odo)[3].fire('transitionend');
assert.deepEqual(at(odo), [1, 2, 3, 4], 'settled back into the first run, standing on the same digit');
assert.equal(percent(reels(odo)[3]), 'translateY(-20.00%)');
assert.equal(reels(odo)[3].style.transition, '', 'settling is instant, and the transition is handed back afterwards');

// The same again from a settled reel: a nine rolling over keeps going up.
odo.set(1241);
assert.deepEqual(at(odo), [1, 2, 4, 11], 'four to one goes up seven, past the nine');
assert.equal(percent(reels(odo)[3]), 'translateY(-55.00%)');
reels(odo)[3].fire('transitionend');
assert.deepEqual(at(odo), [1, 2, 4, 1]);
assert.equal(percent(reels(odo)[3]), 'translateY(-5.00%)');

// Rolling on from the second run before it settled never runs off the end of the strip.
odo.set(1249);
assert.deepEqual(at(odo), [1, 2, 4, 9]);
odo.set(1243);
assert.deepEqual(at(odo), [1, 2, 4, 13], 'nine to three: up four, into the second run');
odo.set(1249);
assert.deepEqual(at(odo), [1, 2, 4, 19], 'three to nine within the second run, its last cell');
odo.set(1242);
assert.deepEqual(at(odo), [1, 2, 4, 12], 'no room left above: dropped a run first, then rolled up three');

// More digits: new reels are built standing on the old number, right-aligned, so the roll leaves from it.
odo.set(10000);
assert.equal(shape(odo), 'dd|ddd');
assert.deepEqual(at(odo), [1, 10, 10, 10, 10], 'nought-one-two-four-two to one-nought-nought-nought-nought: the lead reel from nought, the rest up to the next nought');

// Fewer digits again is a rebuild too, standing on the tail of the old number.
odo.set(99);
assert.equal(shape(odo), 'dd');
assert.deepEqual(at(odo), [9, 9], 'from the two noughts at the end of ten thousand, up nine each');

// Not known yet is a shimmer; a number arriving afterwards rolls up from nought.
odo.set(null);
assert.equal(odo.element.children.length, 1);
assert.equal(odo.element.children[0].className, 'gc-bar gc-odo-bar');
odo.set(7);
assert.equal(shape(odo), 'd');
assert.deepEqual(at(odo), [17], 'a number after a shimmer spins in like a first one');
reels(odo)[0].fire('transitionend');
assert.deepEqual(at(odo), [7]);
odo.set(9);
assert.deepEqual(at(odo), [9], 'a change to a number already showing is a tick, not a spin');
odo.set(Number.NaN);
assert.equal(odo.element.children[0].className, 'gc-bar gc-odo-bar', 'not a number is not known');

// Edges: nought is a number, a negative is nought, a numeric string is a number, fractions are floored.
odo = load();
odo.reveal();
odo.set(0);
assert.deepEqual(at(odo), [10], 'a nought spins all the way round rather than standing still');
reels(odo)[0].fire('transitionend');
assert.deepEqual(at(odo), [0]);
odo.set(-5);
assert.deepEqual(at(odo), [0]);
odo.set('12');
assert.deepEqual(at(odo), [1, 2]);
odo.set(12.9);
assert.deepEqual(at(odo), [1, 2]);
odo.set(1000000);
assert.equal(shape(odo), 'd|ddd|ddd', 'a gap every three digits');

// Reduced motion: no holding, no rolling, no spinning — the digits are placed the moment they are known.
odo = load({ reduced: true });
odo.set(42);
assert.deepEqual(at(odo), [4, 2], 'placed at once, with nothing to reveal');
odo.set(49);
odo.set(51);
assert.deepEqual(at(odo), [5, 1], 'always the first run: nothing rolls, so nothing needs settling');
odo.reveal();
assert.deepEqual(at(odo), [5, 1]);

console.log('odometer ok');
