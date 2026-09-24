import { api } from '../lib/links.js';

const TOKEN_CLASSIC = 'https://github.com/settings/tokens/new?scopes=repo,gist&description=gitchop';
const TOKEN_FINE = 'https://github.com/settings/personal-access-tokens/new';
const PRIVACY = 'https://github.com/jeppekroghitk/gitchop/blob/main/PRIVACY.md';

const host = document.getElementById('sync');
const statusEl = document.getElementById('sync-status');
/** Under the card: how to make a token, and what is worth knowing about the ones saved. */
const notes = document.getElementById('token-notes');

let statusTimer = null;
let busy = false;
let current = null;
let onTokenChange = () => {};

function flash(text) {
  statusEl.textContent = text;
  statusEl.dataset.shown = 'true';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.dataset.shown = 'false';
  }, 2600);
}

/**
 * Holding a token and shipping the link list are declared as optional data collection, so consent
 * is asked for here rather than at install. Firefox before 140 has no such gate and throws instead
 * of answering — there is nothing to consent to there.
 */
async function consent(types) {
  const wanted = { data_collection: types };
  try {
    if (await api.permissions.contains(wanted)) return true;
    return await api.permissions.request(wanted);
  } catch {
    return true;
  }
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

function link(text, href) {
  const node = element('a', 'link', text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noreferrer';
  return node;
}

function field(text, input) {
  const row = element('label', 'field');
  row.append(element('span', 'field-label', text), input);
  return row;
}

function textInput({ password = false, placeholder = '', label = '' } = {}) {
  const input = element('input');
  input.type = password ? 'password' : 'text';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  return input;
}

/** Guards against a second click while a request is in flight. */
async function guard(node, work) {
  if (busy) return;
  busy = true;
  const label = node.textContent;
  node.textContent = 'working…';
  try {
    await work();
  } catch (error) {
    flash('failed');
    // Keep whatever state we were in — a failed pull must not look like a disconnection.
    render(current, String(error.message ?? error));
    return;
  } finally {
    busy = false;
    node.textContent = label;
  }
}

function recipe() {
  const wrap = element('div', 'recipe');
  wrap.append(element('p', 'note', 'One classic token covers everything, every organisation included:'));

  const steps = element('ol', 'steps');
  const items = [
    ['Scopes', 'repo and gist. repo reads private repositories, pull requests, news and contributions; gist is only for the backup.'],
    ['Expiration', 'set one. When it lapses this page says so, and nothing is lost.'],
    ['Nothing else', 'no other scope is needed or used.'],
  ];
  for (const [term, detail] of items) {
    const step = element('li');
    step.append(element('b', null, term), document.createTextNode(` — ${detail}`));
    steps.append(step);
  }
  wrap.append(steps);
  wrap.append(
    element(
      'p',
      'note',
      'repo also grants write, which gitchop never uses. A fine-grained token with Metadata: read-only ' +
        'grants less but covers one owner each, so add one per organisation.',
    ),
  );
  return wrap;
}

function noToken(error) {
  const wrap = element('div', 'card-body');
  notes.append(recipe());

  const token = textInput({ password: true, placeholder: 'github_pat_… or ghp_…', label: 'GitHub token' });
  const fields = element('div', 'form');
  fields.append(field('Token', token));

  const save = button('Save token', { primary: true });
  save.addEventListener('click', () =>
    guard(save, async () => {
      if (!(await consent(['authenticationInfo']))) {
        flash('not allowed');
        return;
      }
      await ask({ type: 'gitchop:token:save', token: token.value });
      flash('saved');
      await load();
      onTokenChange();
    }),
  );

  const actions = element('div', 'actions');
  actions.append(save);

  const scopes = element('ul', 'scopes');
  const classic = element('li');
  classic.append(link('Classic token, repo + gist →', TOKEN_CLASSIC), document.createTextNode(' simplest'));
  const fine = element('li');
  fine.append(
    link('Fine-grained token →', TOKEN_FINE),
    document.createTextNode(' tighter, one per organisation'),
  );
  scopes.append(classic, fine);

  wrap.append(fields, actions, scopes);
  if (error) wrap.append(element('p', 'error', error));
  const kept = element('p', 'note', 'Tokens stay on this machine, obfuscated rather than encrypted, and go only to api.github.com. ');
  kept.append(link('What is sent →', PRIVACY));
  notes.append(kept);
  return wrap;
}

/** Lists what has actually been handed over, so an over-broad token cannot hide. */
function tokenList(sync) {
  const wrap = element('div', 'tokens');
  for (const entry of sync.tokens) {
    const row = element('div', 'token');
    const name = entry.login ? `@${entry.login}` : 'token';
    const detail = entry.scopes.length > 0 ? `${entry.kind ?? 'token'} — ${entry.scopes.join(', ')}` : entry.kind ?? 'saved';

    const label = element('div', 'token-name');
    label.append(element('b', null, name), element('span', 'token-detail', detail));
    if (entry.broad) label.append(element('span', 'token-warn', 'writes'));

    const drop = button('Remove');
    drop.addEventListener('click', () =>
      guard(drop, async () => {
        const result = await ask({ type: 'gitchop:token:remove', id: entry.id });
        flash('removed');
        render(result);
        current = result;
        onTokenChange();
      }),
    );

    row.append(label, drop);
    wrap.append(row);
  }
  return wrap;
}

function broadWarning(sync) {
  const broad = sync.tokens.filter((entry) => entry.broad);
  if (broad.length === 0) return null;
  const scopes = [...new Set(broad.flatMap((entry) => entry.scopes))]
    .filter((scope) => /^(repo|workflow|delete_repo|admin:|write:)/.test(scope))
    .join(', ');
  return element(
    'p',
    'note',
    `Marked "writes": ${scopes}. Expected of a classic token — repo carries write, which gitchop never uses. ` +
      'Keep an expiry on it.',
  );
}

function facts(rows) {
  const list = element('dl', 'facts');
  for (const [term, value] of rows) {
    const dd = element('dd');
    dd.append(typeof value === 'string' ? document.createTextNode(value) : value);
    list.append(element('dt', null, term), dd);
  }
  return list;
}

function addAnother() {
  const token = textInput({ password: true, placeholder: 'another github_pat_… for a second owner', label: 'GitHub token' });
  const fields = element('div', 'form');
  fields.append(field('Add', token));

  const save = button('Save');
  save.addEventListener('click', () =>
    guard(save, async () => {
      if (!(await consent(['authenticationInfo']))) {
        flash('not allowed');
        return;
      }
      const result = await ask({ type: 'gitchop:token:save', token: token.value });
      flash('saved');
      render(result);
      current = result;
      onTokenChange();
    }),
  );

  const actions = element('div', 'actions');
  actions.append(save);
  const wrap = element('div', 'add-token');
  wrap.append(fields, actions);
  return wrap;
}

function tokenOnly(sync, error) {
  const wrap = element('div', 'card-body');
  wrap.append(tokenList(sync));
  const warn = broadWarning(sync);
  if (warn) notes.append(warn);
  notes.append(element('p', 'note', 'Backup is off. Switch it on and your links are written to a secret gist on every change.'));

  const gist = textInput({ placeholder: 'existing gist id (leave empty to create one)', label: 'Gist id' });
  const fields = element('div', 'form');
  fields.append(field('Gist', gist));

  const enable = button('Enable backup', { primary: true });
  enable.addEventListener('click', () =>
    guard(enable, async () => {
      if (!(await consent(['bookmarksInfo']))) {
        flash('not allowed');
        return;
      }
      const result = await ask({ type: 'gitchop:sync:connect', gistId: gist.value });
      flash('backing up');
      render(result);
      current = result;
    }),
  );

  const actions = element('div', 'actions');
  actions.append(enable);

  wrap.append(addAnother(), fields);
  if (error ?? sync.lastError) wrap.append(element('p', 'error', error ?? sync.lastError));
  wrap.append(actions);
  return wrap;
}

function connected(sync, error) {
  const wrap = element('div', 'card-body');

  wrap.append(tokenList(sync));
  const warn = broadWarning(sync);
  if (warn) notes.append(warn);
  wrap.append(
    facts([
      ['Gist', link(sync.gistId, sync.gistUrl)],
      ['Last pulled', when(sync.lastPulledAt)],
      ['Last pushed', sync.dirty ? `${when(sync.lastPushedAt)} — changes pending` : when(sync.lastPushedAt)],
    ]),
  );

  const pull = button('Pull now');
  pull.title = 'Replace the local list with the gist';
  pull.addEventListener('click', () =>
    guard(pull, async () => {
      if (sync.dirty && !confirm('There are local changes that have not reached the gist yet. Pull anyway and lose them?')) return;
      const result = await ask({ type: 'gitchop:sync:pull', force: true });
      flash(result.changed ? 'pulled' : 'already current');
      await load();
    }),
  );

  const push = button('Push now');
  push.title = 'Write the local list to the gist';
  push.addEventListener('click', () =>
    guard(push, async () => {
      const result = await ask({ type: 'gitchop:sync:push', force: true });
      flash(result.changed ? 'pushed' : 'already current');
      await load();
    }),
  );

  const stop = button('Stop backup');
  stop.title = 'Leave the gist alone and stop writing to it';
  stop.addEventListener('click', () =>
    guard(stop, async () => {
      if (!confirm('Stop backing up to the gist? Your tokens and the gist itself are left alone.')) return;
      const result = await ask({ type: 'gitchop:sync:stop' });
      flash('stopped');
      render(result);
      current = result;
    }),
  );

  const actions = element('div', 'actions');
  actions.append(stop, pull, push);

  wrap.append(addAnother());

  if (error ?? sync.lastError) wrap.append(element('p', 'error', error ?? sync.lastError));
  wrap.append(actions);
  return wrap;
}

function render(sync, error) {
  host.textContent = '';
  notes.textContent = '';
  if (sync?.connected) host.append(connected(sync, error));
  else if (sync?.hasToken) host.append(tokenOnly(sync, error));
  else host.append(noToken(error));
}

export async function load() {
  try {
    current = await ask({ type: 'gitchop:sync:state' });
    render(current);
  } catch (error) {
    render(current, String(error.message ?? error));
  }
}

/** Saving a link marks the config dirty in the background; reflect that without a reload. */
export function watch(afterTokenChange) {
  if (afterTokenChange) onTokenChange = afterTokenChange;
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sync) load();
  });
}
