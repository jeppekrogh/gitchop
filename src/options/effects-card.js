import { api } from '../lib/links.js';

/**
 * The chop itself is previewed with the real thing: options.html loads the content-script stage
 * (effects.js, styles.js, chop.js) as classic scripts, so this card can run the exact animation
 * the next keypress on GitHub will play — over the settings page instead of over GitHub.
 */
const gc = window.__gitchop;
const { KEY, SLIDERS, DEFAULTS, sanitize } = gc.EFFECTS;

const host = document.getElementById('effects');
const statusEl = document.getElementById('effects-status');

let effects = { ...DEFAULTS };
let saveTimer = null;
let lastWritten = '';
let statusTimer = null;
let stage = null;
const inputs = new Map();

function flash(text) {
  statusEl.textContent = text;
  statusEl.dataset.shown = 'true';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.dataset.shown = 'false';
  }, 1400);
}

async function commit() {
  clearTimeout(saveTimer);
  saveTimer = null;
  effects = sanitize(effects);
  lastWritten = JSON.stringify(effects);
  try {
    await api.storage.sync.set({ [KEY]: effects });
    flash('saved');
  } catch (error) {
    flash('save failed');
    console.error('gitchop: could not save the effect settings', error);
  }
}

function scheduleCommit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commit, 400);
}

function shown(spec, value) {
  if (spec.id === 'hue') return `${value}°`;
  if (spec.id === 'speed') return `${value}%`;
  return String(value);
}

function reflect() {
  for (const spec of SLIDERS) {
    const { input, output } = inputs.get(spec.id);
    input.value = String(effects[spec.id]);
    output.textContent = shown(spec, effects[spec.id]);
  }
}

function buildSlider(spec) {
  const row = document.createElement('div');
  row.className = 'slider';
  row.title = spec.hint;

  const label = document.createElement('label');
  label.textContent = spec.label;
  label.htmlFor = `fx-${spec.id}`;

  const input = document.createElement('input');
  input.type = 'range';
  input.id = `fx-${spec.id}`;
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = '1';
  if (spec.id === 'hue') input.className = 'range-hue';

  const output = document.createElement('output');
  output.htmlFor = input.id;

  input.addEventListener('input', () => {
    effects[spec.id] = Number(input.value);
    output.textContent = shown(spec, effects[spec.id]);
    scheduleCommit();
  });
  input.addEventListener('change', commit);

  inputs.set(spec.id, { input, output });
  row.append(label, input, output);
  return row;
}

/**
 * Plays the current slider values, saved or not, and cleans up by itself; a click or Escape ends
 * it early. Guarded so a second press while one is running does nothing.
 */
function preview() {
  if (stage) return;
  const fx = sanitize(effects);
  const pace = 100 / fx.speed;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const running = gc.createStage({ reduced, effects: fx });
  stage = running;

  // Long enough to see the dark settle — and the last ember die, when sparks are on.
  const linger = setTimeout(close, Math.max(320, fx.sparks > 0 ? 1080 : 0) * pace + 600);
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  function close() {
    if (stage !== running) return;
    stage = null;
    clearTimeout(linger);
    window.removeEventListener('keydown', onKey);
    running.close();
  }
  running.menuLayer.addEventListener('mousedown', close);
  window.addEventListener('keydown', onKey);
  running.chop();
}

function render() {
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent =
    'How the page is chopped open when you press the dot. The defaults are the classic steel cut; ' +
    'every slider saves as you let go, and Preview plays the result right here.';

  const sliders = document.createElement('div');
  sliders.className = 'sliders';
  for (const spec of SLIDERS) sliders.append(buildSlider(spec));

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'btn btn-primary';
  previewBtn.textContent = 'Preview chop';
  previewBtn.addEventListener('click', preview);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn';
  reset.textContent = 'Restore defaults';
  reset.addEventListener('click', () => {
    effects = { ...DEFAULTS };
    reflect();
    commit();
  });

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  foot.append(previewBtn, reset);

  host.append(note, sliders, foot);
  reflect();
}

export async function load() {
  try {
    const stored = await api.storage.sync.get(KEY);
    effects = sanitize(stored[KEY]);
  } catch {
    effects = { ...DEFAULTS };
  }
  lastWritten = JSON.stringify(effects);
  render();

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[KEY]) return;
    const incoming = JSON.stringify(sanitize(changes[KEY].newValue));
    if (incoming === lastWritten || saveTimer) return;
    effects = sanitize(changes[KEY].newValue);
    reflect();
  });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) commit();
  });
}
