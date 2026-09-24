import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/content/odometer.js', import.meta.url)), 'utf8');

/**
 * Just enough of a DOM for the reels: elements with children, a class, a style, a dataset, and
 * listeners that can be fired by hand. Transitions do not run here — what is tested is where each
 * reel is told to go and when, which is the whole of the arithmetic.
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

// The strip is a blank and then two runs of the digits: cell 0 is blank, digit d is cell 1 + d in
// the first run and 11 + d in the second.
const BLANK = 1;
const reels = (odo) => odo.element.children.filter((child) => child.className === 'gc-odo-digit').map((digit) => digit.children[0]);
const at = (odo) => reels(odo).map((reel) => Number(reel.dataset.at));
const showing = (odo) => at(odo).map((index) => (index < BLANK ? ' ' : String((index - BLANK) % 10))).join('');
const shape = (odo) => odo.element.children.map((child) => (child.className === 'gc-odo-sep' ? '|' : 'd')).join('');
const percent = (reel) => reel.style.transform;
const ms = (reel, name) => Number.parseInt(reel.style.vars[name] ?? '0', 10);
const durations = (odo) => reels(odo).map((reel) => ms(reel, '--gc-odo-roll'));
const delays = (odo) => reels(odo).map((reel) => ms(reel, '--gc-odo-delay'));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 5, `${message}: ${actual} is not within 5 of ${expected}`);
const settleAll = (odo) => reels(odo).forEach((reel) => reel.fire('transitionend'));

// Before the panel is on screen the reels stand blank, whatever has been set.
let odo = load();
odo.set(1234);
assert.equal(shape(odo), 'd|ddd', 'a thousands gap, no comma');
assert.deepEqual(at(odo), [0, 0, 0, 0], 'blank until revealed');
assert.equal(showing(odo), '    ');
assert.equal(reels(odo)[0].children.length, 21, 'a blank and two runs of the digits on every reel');
assert.equal(reels(odo)[0].children[0].textContent, '', 'the first cell is the blank');
assert.equal(reels(odo)[0].children[1].textContent, '0');
assert.equal(odo.element.attributes['aria-hidden'], 'true', 'the reels are decoration; the label around them reads');

// A later set before the reveal only changes what will be dealt.
odo.set(1226);
assert.deepEqual(at(odo), [0, 0, 0, 0]);

// Revealed: every reel spins a whole turn and on to its digit — the first as good as at once, and
// each to its right waiting blank until its turn, a beat after the one before.
odo.reveal();
assert.deepEqual(at(odo), [12, 13, 13, 17], 'each reel ends in the second run, on its digit');
assert.equal(showing(odo), '1226');
assert.equal(percent(reels(odo)[3]), 'translateY(-80.95%)', 'a digit is a twenty-first of the strip');
assert.deepEqual(durations(odo), [150, 500, 500, 500], 'the first lands almost at once; the rest each spin for half a second');
let waits = delays(odo);
near(waits[0], 0, 'the first waits for nothing');
near(waits[1], 450, 'the second lands 800 ms after the first');
near(waits[2], 1250, 'the third 800 ms after that');
near(waits[3], 2050, 'and the fourth 800 ms after that');
for (const reel of reels(odo)) assert.ok(Number(reel.dataset.landAt) > 0, 'each reel knows when it lands');
assert.equal(reels(odo)[3].style.transition, '', 'the roll uses the stylesheet transition');

// A number arriving while the reels are still on their way in keeps every landing and only changes
// the digit each reel lands on.
odo.set(1234);
assert.deepEqual(at(odo), [12, 13, 14, 15], 'the same second run, new digits');
assert.equal(showing(odo), '1234');
near(durations(odo)[0], 150, 'the first finishes in whatever of its moment is left');
assert.deepEqual(durations(odo).slice(1), [500, 500, 500], 'the rest still spin for half a second');
waits = delays(odo);
near(waits[1], 450, 'the second still lands when it was going to');
near(waits[3], 2050, 'so does the fourth');

// Landed: each reel is put back into the first run, standing on the same digit, and forgets its wait.
settleAll(odo);
assert.deepEqual(at(odo), [2, 3, 4, 5]);
assert.equal(showing(odo), '1234');
assert.deepEqual(delays(odo), [0, 0, 0, 0]);
for (const reel of reels(odo)) assert.equal(reel.dataset.landAt, undefined);
assert.equal(reels(odo)[3].style.transition, '', 'settling is instant, and the transition is handed back afterwards');

// A refresh that lands higher is a tick: straight to the digit, always upward, so six to four goes
// up through the nine into the second run — and is put back once the roll ends.
odo.set(1246);
assert.deepEqual(at(odo), [2, 3, 5, 7]);
odo.set(1254);
assert.deepEqual(at(odo), [2, 3, 6, 15], 'the tens up one; the units up eight, through the nine');
assert.deepEqual(durations(odo), [600, 600, 600, 600], 'a tick has one pace');
assert.deepEqual(delays(odo), [0, 0, 0, 0], 'and no wait');
reels(odo)[3].fire('transitionend');
assert.deepEqual(at(odo), [2, 3, 6, 5]);
assert.equal(showing(odo), '1254');

// Rolling on from the second run before it settled never runs off the end of the strip.
odo.set(1259);
assert.deepEqual(at(odo), [2, 3, 6, 10]);
odo.set(1253);
assert.deepEqual(at(odo), [2, 3, 6, 14], 'nine to three: up four, into the second run');
odo.set(1259);
assert.deepEqual(at(odo), [2, 3, 6, 20], 'three to nine within the second run, its last cell');
odo.set(1252);
assert.deepEqual(at(odo), [2, 3, 6, 13], 'no room left above: dropped a run first, then rolled up three');
assert.equal(showing(odo), '1252');

// More digits: new reels are built around the old number, right-aligned, the new one blank — and it
// rolls straight onto its digit while the rest roll on from theirs.
odo.set(10000);
assert.equal(shape(odo), 'dd|ddd');
assert.deepEqual(at(odo), [2, 11, 11, 11, 11], 'blank straight to one; one, two, five and two each up to the nought that begins the second run');
assert.equal(showing(odo), '10000');
assert.deepEqual(durations(odo), [600, 600, 600, 600, 600], 'a tick, not a deal');

// Fewer digits again is a rebuild too, standing on the tail of the old number.
odo.set(99);
assert.equal(shape(odo), 'dd');
assert.deepEqual(at(odo), [10, 10], 'from the two noughts at the end of ten thousand, up nine each');

// Not known yet is a shimmer; a number arriving afterwards is dealt in like a first one.
odo.set(null);
assert.equal(odo.element.children.length, 1);
assert.equal(odo.element.children[0].className, 'gc-bar gc-odo-bar');
odo.set(7);
assert.equal(shape(odo), 'd');
assert.deepEqual(at(odo), [18], 'a whole turn and on to seven');
assert.deepEqual(durations(odo), [150], 'as good as at once, being the first');
settleAll(odo);
assert.deepEqual(at(odo), [8]);
odo.set(9);
assert.deepEqual(at(odo), [10], 'a change to a number already showing is a tick, not a deal');
assert.deepEqual(durations(odo), [600]);
odo.set(Number.NaN);
assert.equal(odo.element.children[0].className, 'gc-bar gc-odo-bar', 'not a number is not known');

// Edges: nought is a number, a negative is nought, a numeric string is a number, fractions are floored.
odo = load();
odo.reveal();
odo.set(0);
assert.deepEqual(at(odo), [11], 'a nought spins all the way round rather than standing still');
settleAll(odo);
assert.deepEqual(at(odo), [1]);
odo.set(-5);
assert.deepEqual(at(odo), [1]);
odo.set('12');
assert.equal(showing(odo), '12');
odo.set(12.9);
assert.equal(showing(odo), '12');
odo.set(1000000);
assert.equal(shape(odo), 'd|ddd|ddd', 'a gap every three digits');
assert.equal(showing(odo), '1000000');

// Reduced motion: no holding, no dealing, no rolling — the digits are placed the moment they are known.
odo = load({ reduced: true });
odo.set(42);
assert.deepEqual(at(odo), [5, 3], 'placed at once in the first run, with nothing to reveal');
assert.equal(showing(odo), '42');
odo.set(49);
odo.set(51);
assert.deepEqual(at(odo), [6, 2], 'always the first run: nothing rolls, so nothing needs settling');
odo.reveal();
assert.deepEqual(at(odo), [6, 2]);

console.log('odometer ok');
