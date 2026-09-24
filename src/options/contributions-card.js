import { api } from '../lib/links.js';
import { SWITCHES } from '../lib/contributions.js';

const host = document.getElementById('contributions');
const statusEl = document.getElementById('contributions-status');

let statusTimer = null;
let busy = false;
let current = null;

function flash(text) {
  statusEl.textContent = text;
  statusEl.dataset.shown = 'true';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.dataset.shown = 'false';
  }, 2600);
}

async function ask(message) {
  const response = await api.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? 'The background script did not answer.');
  return response;
}

function when(iso) {
  if (!iso) return 'never';
  const stamp = new Date(iso);
  return Number.isNaN(stamp.valueOf()) ? 'never' : stamp.toLocaleString();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, { primary = false } = {}) {
  const node = element('button', `btn${primary ? ' btn-primary' : ''}`, label);
  node.type = 'button';
  return node;
}

async function guard(node, work) {
  if (busy) return;
  busy = true;
  const label = node.textContent;
  node.textContent = 'working…';
  try {
    await work();
  } catch (error) {
    flash('failed');
    render(current, String(error.message ?? error));
    return;
  } finally {
    busy = false;
    node.textContent = label;
  }
}

/** One switch per setting, in the same dress as the chop effect's own. */
function switchRow(spec, state) {
  const row = element('div', 'slider slider-toggle');
  row.title = spec.hint;

  const label = element('span', 'slider-label', spec.label);
  label.id = `contributions-${spec.id}-label`;

  const toggle = element('button', 'switch');
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-labelledby', label.id);
  const on = state.settings[spec.id] === 1;
  toggle.dataset.on = String(on);
  toggle.setAttribute('aria-checked', String(on));
  toggle.addEventListener('click', () =>
    guard(toggle, async () => {
      const result = await ask({ type: 'gitchop:contributions:settings', patch: { [spec.id]: on ? 0 : 1 } });
      flash(on ? 'off' : 'on');
      current = result;
      render(result);
    }),
  );

  row.append(label, toggle, element('output', null, on ? 'on' : 'off'));
  return row;
}

function render(state, error) {
  host.textContent = '';
  const wrap = element('div', 'card-body');

  wrap.append(
    element(
      'p',
      'note',
      'The number your profile prints for the year — every commit, pull request, review and issue ' +
        'GitHub counts — in the head of the menu beside the title, spun in like a slot machine\'s as ' +
        'the panel rises, the reels stopping one at a time, left to right. It paints from ' +
        'its last snapshot and asks GitHub again when the menu ' +
        'opens on one older than five minutes; a count that has grown since rolls its last digits ' +
        'on. Hovering the number shows the totals for the three years before it.',
    ),
  );

  if (!state?.hasToken) {
    wrap.append(
      element(
        'p',
        'note',
        'It needs a token: the classic token above with repo counts private contributions too, and a ' +
          'fine-grained one counts what it is allowed to see. Without one there is no number — the ' +
          'head of the menu is the title alone.',
      ),
    );
    host.append(wrap);
    return;
  }

  const switches = element('div', 'sliders');
  for (const spec of SWITCHES) switches.append(switchRow(spec, state));
  wrap.append(switches);

  if (state.settings.enabled === 1 && state.total !== null) {
    const facts = element('dl', 'facts');
    facts.append(element('dt', null, `In ${state.year}`), element('dd', null, Number(state.total).toLocaleString('en')));
    for (const entry of state.past ?? []) {
      facts.append(element('dt', null, `In ${entry.year}`), element('dd', null, Number(entry.total).toLocaleString('en')));
    }
    facts.append(element('dt', null, 'Refreshed'), element('dd', null, when(state.fetchedAt)));
    wrap.append(facts);
  }

  if (error ?? state.error) wrap.append(element('p', 'error', error ?? state.error));
  else if (state.partial) wrap.append(element('p', 'error', `One token did not answer: ${state.partial}`));

  if (state.settings.enabled === 1) {
    wrap.append(
      element(
        'p',
        'note',
        'Every saved token is asked for this year and the three before it in one request, and the ' +
          'highest count for this year is kept, its past years with it: a token that sees fewer ' +
          'repositories counts fewer, never more, so the largest answer is the most complete one.',
      ),
    );

    const refresh = button('Refresh now', { primary: true });
    refresh.addEventListener('click', () =>
      guard(refresh, async () => {
        const result = await ask({ type: 'gitchop:contributions:refresh' });
        flash(result.error ? 'failed' : 'refreshed');
        current = result;
        render(result);
      }),
    );
    const actions = element('div', 'actions');
    actions.append(refresh);
    wrap.append(actions);
  }

  host.append(wrap);
}

export async function load() {
  try {
    current = await ask({ type: 'gitchop:contributions' });
    render(current);
  } catch (error) {
    render(current, String(error.message ?? error));
  }
}
